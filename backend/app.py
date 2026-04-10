import os
from flask import Flask, send_from_directory
from database import init_db
from routes import transactions_bp
from auth_routes import auth_bp

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.register_blueprint(transactions_bp)
app.register_blueprint(auth_bp)


@app.after_request
def add_cors(response):
    allowed_origins = ["http://127.0.0.1:5500", "http://localhost:5500",
                       "http://127.0.0.1:5000", "http://localhost:5000"]
    origin = request.headers.get("Origin", "")
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response

from flask import request  # Tambahkan ini di atas

@app.route("/api/<path:path>", methods=["OPTIONS"])
def handle_preflight(path):
    return "", 204


# LANGSUNG KIRIM INDEX.HTML, BIAR FRONTEND YANG HANDLE REDIRECT
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


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)