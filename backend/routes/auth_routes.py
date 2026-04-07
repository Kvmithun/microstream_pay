from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request


auth_bp = Blueprint("auth", __name__)


def _serialize_user(user):
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "wallet_address": user.get("wallet_address", ""),
        "created_at": user.get("created_at"),
    }


@auth_bp.post("/signup")
def signup():
    data = request.get_json(force=True)
    required = ["name", "email", "password", "role", "wallet_address"]
    missing = [key for key in required if not data.get(key)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    if data["role"] not in {"sender", "receiver"}:
        return jsonify({"error": "Role must be sender or receiver"}), 400

    if current_app.user_model.find_by_email(data["email"]):
        return jsonify({"error": "User already exists"}), 409

    user = current_app.user_model.create_user(
        data["name"],
        data["email"],
        data["password"],
        data["role"],
        data["wallet_address"],
    )
    return jsonify({"user": _serialize_user(user)}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(force=True)
    user = current_app.user_model.find_by_email(data.get("email", ""))
    if not user or not current_app.user_model.verify_password(user, data.get("password", "")):
        return jsonify({"error": "Invalid credentials"}), 401

    token = jwt.encode(
        {
            "user_id": str(user["_id"]),
            "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        },
        current_app.config["JWT_SECRET"],
        algorithm="HS256",
    )

    return jsonify({"token": token, "user": _serialize_user(user)})
