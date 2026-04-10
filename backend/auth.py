"""
JWT helpers + @require_auth decorator.
No extra packages — uses only Python stdlib + werkzeug (ships with Flask).
"""
import hmac
import hashlib
import base64
import json
import time
from functools import wraps
from flask import request, jsonify, g

# Change this to a long random string in production!
SECRET = "ledger-secret-change-in-production"


# ── Minimal HS256 JWT ─────────────────────────────────────────────────────────

def _b64enc(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64dec(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))


def create_token(user_id: int, username: str, expires_in: int = 86400 * 7) -> str:
    """Sign and return a JWT. Expires in 7 days by default."""
    header  = _b64enc(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64enc(json.dumps({
        "sub": user_id,
        "usr": username,
        "exp": int(time.time()) + expires_in,
    }).encode())
    sig = _b64enc(hmac.new(
        SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256
    ).digest())
    return f"{header}.{payload}.{sig}"


def verify_token(token: str):
    """Return decoded payload dict, or None if invalid / expired."""
    print(f"[DEBUG] Verifying token: {token[:50]}...")  # Tambahkan
    try:
        header, payload, sig = token.split(".")
        expected = _b64enc(hmac.new(
            SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest())
        if not hmac.compare_digest(sig, expected):
            print("[DEBUG] Signature mismatch!")  # Tambahkan
            return None
        data = json.loads(_b64dec(payload))
        if data["exp"] < time.time():
            print(f"[DEBUG] Token expired at {data['exp']}, now {time.time()}")  # Tambahkan
            return None
        print(f"[DEBUG] Token valid for user: {data.get('usr')}")  # Tambahkan
        return data
    except Exception as e:
        print(f"[DEBUG] Token verification error: {e}")  # Tambahkan
        return None


# ── Decorator ─────────────────────────────────────────────────────────────────

def require_auth(f):
    """Attach to any route that needs a logged-in user.
    On success, sets g.user_id and g.username."""
    @wraps(f)
    def decorated(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid token"}), 401
        payload = verify_token(header[7:])
        if not payload:
            return jsonify({"error": "Token expired or invalid — please log in again"}), 401
        g.user_id  = payload["sub"]
        g.username = payload["usr"]
        return f(*args, **kwargs)
    return decorated
