from functools import wraps

import jwt
from bson import ObjectId
from flask import current_app, g, jsonify, request


def _read_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return None


def verify_token():
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = _read_token()
            if not token:
                return jsonify({"error": "Missing token"}), 401

            try:
                payload = jwt.decode(
                    token,
                    current_app.config["JWT_SECRET"],
                    algorithms=["HS256"],
                )
                user = current_app.user_model.find_by_id(ObjectId(payload["user_id"]))
                if not user:
                    return jsonify({"error": "User not found"}), 401
                g.current_user = user
            except Exception:
                return jsonify({"error": "Invalid token"}), 401

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def require_role(role):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = getattr(g, "current_user", None)
            if not user or user.get("role") != role:
                return jsonify({"error": "Unauthorized"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
