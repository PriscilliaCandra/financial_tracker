import os
import time
import re
import traceback 
import sys 
from flask import Flask, jsonify, send_from_directory, request, g
from database import init_db, get_db
from routes import transactions_bp
from category_routes import categories_bp
from auth_routes import auth_bp
from auth import require_auth

# OCR Libraries (hanya import sekali)
try:
    import pytesseract
    from PIL import Image
    import pdf2image
    
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    OCR_AVAILABLE = True
    
    print("OCR libraries loaded successfully")
    print(f"Tesseract version: {pytesseract.get_tesseract_version()}")
except ImportError:
    OCR_AVAILABLE = False
    print("Warning: OCR libraries not installed. Install with: pip install pytesseract pillow pdf2image")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024

app.register_blueprint(transactions_bp)
app.register_blueprint(categories_bp)
app.register_blueprint(auth_bp)


@app.after_request
def add_cors(response):
    origin = request.headers.get("Origin", "")
    
    allowed_origins = [
        "http://127.0.0.1:5500", 
        "http://localhost:5500",
        "http://127.0.0.1:5000", 
        "http://localhost:5000",
    ]
    
    if origin and ("ngrok-free.app" in origin or origin in allowed_origins):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Credentials"] = "true"
    
    return response


@app.route("/api/<path:path>", methods=["OPTIONS"])
def handle_preflight(path):
    return "", 204


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/login")
def login_page():
    return send_from_directory(FRONTEND_DIR, "login.html")


@app.route("/register")
def register_page():
    return send_from_directory(FRONTEND_DIR, "register.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(FRONTEND_DIR, filename)


# ═══════════════════════════════════════════════════════════════════════════
# UPLOAD & OCR ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════

@app.route("/api/upload-receipt", methods=["POST"])
@require_auth
def upload_receipt():
    import traceback
    import sys
    
    print("=" * 50)
    print("UPLOAD RECEIPT - START")
    print("=" * 50)
    
    # Set path Tesseract
    if os.name == 'nt':
        try:
            pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
            print(f"Tesseract path set to: {pytesseract.pytesseract.tesseract_cmd}")
        except Exception as e:
            print(f"Error setting Tesseract path: {e}")
    
    # Cek OCR availability
    if not OCR_AVAILABLE:
        print("OCR not available")
        return jsonify({"error": "OCR service not available. Please install required libraries."}), 500
    
    # Cek file
    if 'file' not in request.files:
        print("No file provided")
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        print("Empty filename")
        return jsonify({"error": "Empty filename"}), 400
    
    print(f"File received: {file.filename}")
    
    # Save file
    ext = file.filename.rsplit('.', 1)[-1].lower()
    filename = f"{g.user_id}_{int(time.time())}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    print(f"Saving to: {filepath}")
    
    try:
        file.save(filepath)
        print(f"File saved successfully")
    except Exception as e:
        print(f"Error saving file: {e}")
        return jsonify({"error": f"Failed to save file: {str(e)}"}), 500
    
    extracted_text = ""
    
    try:
        if ext in ['png', 'jpg', 'jpeg']:
            print("Processing image file...")
            image = Image.open(filepath)
            extracted_text = pytesseract.image_to_string(image)
            print(f"OCR completed, extracted {len(extracted_text)} characters")
        
        elif ext == 'pdf':
            print("Processing PDF file...")
            try:
                images = pdf2image.convert_from_path(filepath)
                print(f"Converted PDF to {len(images)} pages")
                for i, image in enumerate(images):
                    text = pytesseract.image_to_string(image)
                    extracted_text += text + "\n"
                    print(f"   Page {i+1}: {len(text)} characters")
            except Exception as pdf_e:
                print(f"PDF conversion error: {pdf_e}")
                raise
        
        else:
            print(f"Unsupported file type: {ext}")
            return jsonify({"error": "Unsupported file type. Use PNG, JPG, or PDF"}), 400
        
                # Parse extracted text to find amount
        print("Parsing extracted text for amount...")
        amount = None
        
        # Pattern 1: Cari format dengan RP/Rp di depan (format Indonesia)
        match1 = re.search(r'(?:Rp|RP|IDR)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)', extracted_text, re.IGNORECASE)
        if match1:
            amount = match1.group(1)
            print(f"Found with Rp prefix: {amount}")
        
        # Pattern 2: Cari angka besar dengan koma/titik sebagai pemisah ribuan
        if not amount:
            match2 = re.search(r'(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?)', extracted_text)
            if match2:
                amount = match2.group(1)
                print(f"Found with thousand separator: {amount}")
        
        # Pattern 3: Cari angka 4-7 digit (tanpa pemisah)
        if not amount:
            match3 = re.search(r'(\d{4,7})', extracted_text)
            if match3:
                amount = match3.group(1)
                print(f"Found plain number: {amount}")
        
        # Clean amount: hapus titik (pemisah ribuan), ganti koma dengan titik (desimal)
        if amount:
            # Hapus titik (pemisah ribuan)
            amount = amount.replace('.', '')
            # Ganti koma dengan titik (desimal)
            amount = amount.replace(',', '.')
            # Konversi ke float
            try:
                amount = float(amount)
                print(f"Final amount: {amount}")
            except ValueError:
                amount = None
                print(f"Failed to convert to number")
        else:
            print("No amount found in text")
        
        # Save to database
        print("Saving attachment record to database...")
        conn = get_db()
        conn.execute("""
            INSERT INTO attachments (user_id, filename, file_path, file_type, extracted_text)
            VALUES (?, ?, ?, ?, ?)
        """, (g.user_id, filename, filepath, ext, extracted_text[:1000]))
        conn.commit()
        conn.close()
        print("Attachment record saved")
        
        return jsonify({
            "message": "Receipt processed",
            "extracted_text": extracted_text[:500],
            "suggested_amount": amount,
            "filename": filename
        }), 200
        
    except Exception as e:
        print("=" * 50)
        print("ERROR OCCURRED:")
        print("=" * 50)
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc(file=sys.stdout)
        print("=" * 50)
        return jsonify({"error": f"OCR failed: {str(e)}"}), 500

if __name__ == "__main__":
    init_db()
    app.run(debug=False, host='0.0.0.0', port=5000)