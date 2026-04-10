from flask import Flask, send_from_directory
from database import init_db
from routes import transactions_bp
 
app = Flask(__name__, static_folder="static")
app.register_blueprint(transactions_bp)
 
# Allow requests from Live Server (port 5500) and any localhost origin
@app.after_request
def add_cors(response):
    origin = "http://127.0.0.1:5500"
    response.headers["Access-Control-Allow-Origin"]  = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response
 
@app.route("/api/<path:path>", methods=["OPTIONS"])
def handle_preflight(path):
    return "", 204
 
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")
 
if __name__ == "__main__":
    init_db()
    app.run(debug=True)
 