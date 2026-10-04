"""Minimal JWT auth for the SafeStride API (governance-ready)."""
import os
import time
from functools import wraps

import jwt
from flask import request, jsonify

SECRET = os.environ.get("JWT_SECRET", "dev-only-change-me")
ALGO = "HS256"


def issue_token(subject: str, ttl_seconds: int = 3600) -> str:
    payload = {"sub": subject, "iat": int(time.time()), "exp": int(time.time()) + ttl_seconds}
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "missing bearer token"}), 401
        token = header.split(" ", 1)[1]
        try:
            jwt.decode(token, SECRET, algorithms=[ALGO])
        except jwt.PyJWTError:
            return jsonify({"error": "invalid or expired token"}), 401
        return fn(*args, **kwargs)
    return wrapper
