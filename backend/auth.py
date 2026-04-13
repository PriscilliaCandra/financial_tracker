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
    """Return decoded payload dict, or None if invalid / expired.

    Validates format explicitly before unpacking so a malformed token
    (empty string, 'null', wrong number of segments) never causes a
    ValueError: not enough values to unpack crash.
    """
    # Guard 1: must be a non-empty string
    if not token or not isinstance(token, str):
        print("[auth] verify_token: empty or non-string token")
        return None

    # Guard 2: reject the literal strings "null" / "undefined"
    if token.lower() in ("null", "undefined", "none"):
        print("[auth] verify_token: token is literal null/undefined")
        return None

    # Guard 3: must have exactly 3 dot-separated parts
    parts = token.split(".")
    if len(parts) != 3:
        print(f"[auth] verify_token: expected 3 parts, got {len(parts)}")
        return None

    # Guard 4: each part must be non-empty
    header, payload, sig = parts
    if not header or not payload or not sig:
        print("[auth] verify_token: one or more token parts are empty")
        return None

    # Signature verification + expiry check
    try:
        expected = _b64enc(hmac.new(
            SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256
        ).digest())
        if not hmac.compare_digest(sig, expected):
            print("[auth] verify_token: signature mismatch")
            return None
        data = json.loads(_b64dec(payload))
        if data["exp"] < time.time():
            print("[auth] verify_token: token expired")
            return None
        return data
    except Exception as e:
        print(f"[auth] verify_token: decode error — {e}")
        return None


# ── Decorator ─────────────────────────────────────────────────────────────────

def require_auth(f):
    """Attach to any route that needs a logged-in user.
    On success, sets g.user_id and g.username."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "").strip()

        # Guard 1: header must exist and start with "Bearer "
        if not auth_header or not auth_header.startswith("Bearer "):
            print("[auth] require_auth: missing or malformed Authorization header")
            return jsonify({"error": "Invalid or missing token"}), 401

        # Guard 2: extract token — everything after "Bearer "
        token = auth_header[7:].strip()

        # Guard 3: reject empty / literal null before hitting verify
        if not token or token.lower() in ("null", "undefined", "none"):
            print(f"[auth] require_auth: token value is '{token}'")
            return jsonify({"error": "Invalid or missing token"}), 401

        # Verify
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid or missing token"}), 401

        g.user_id  = payload["sub"]
        g.username = payload["usr"]
        return f(*args, **kwargs)
    return decorated