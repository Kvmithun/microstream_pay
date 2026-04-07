from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash


class UserModel:
    def __init__(self, db):
        self.collection = db.users
        self.collection.create_index("email", unique=True)

    def create_user(self, name, email, password, role, wallet_address):
        document = {
            "name": name,
            "email": email.lower(),
            "password": generate_password_hash(password),
            "role": role,
            "wallet_address": wallet_address,
            "created_at": datetime.now(timezone.utc),
        }
        result = self.collection.insert_one(document)
        document["_id"] = result.inserted_id
        return document

    def find_by_email(self, email):
        return self.collection.find_one({"email": email.lower()})

    def find_by_id(self, user_id):
        return self.collection.find_one({"_id": user_id})

    def verify_password(self, user, password):
        return check_password_hash(user["password"], password)
