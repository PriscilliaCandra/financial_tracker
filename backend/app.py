from flask import Flask, send_from_directory
from flask_cors import CORS
from database import init_db
from routes import transactions_bp
import os

app = Flask(__name__, static_folder="static")
CORS(app)  
app.register_blueprint(transactions_bp)

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

if __name__ == "__main__":
    init_db()
    app.run(debug=True)