from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument
import bcrypt


class UserModel:
    def __init__(self, db):
        self.collection = db.users
        self.collection.create_index("email", unique=True)

    def _hash_password(self, password):
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    def create_user(self, name, email, password, role, wallet_address):
        document = {
            "name": name,
            "email": email.lower(),
            "password": self._hash_password(password),
            "role": role,
            "wallet_address": wallet_address,
            "balance_microalgos": 0,
            "total_spent_microalgos": 0,
            "total_watch_seconds": 0,
            "created_at": datetime.now(timezone.utc),
        }
        result = self.collection.insert_one(document)
        document["_id"] = result.inserted_id
        document["payment_note"] = str(result.inserted_id)
        self.collection.update_one(
            {"_id": result.inserted_id},
            {"$set": {"payment_note": document["payment_note"]}},
        )
        return document

    def find_by_email(self, email):
        return self.collection.find_one({"email": email.lower()})

    def find_by_id(self, user_id):
        return self.collection.find_one({"_id": user_id})

    def verify_password(self, user, password):
        stored = user["password"]
        if isinstance(stored, str):
            stored = stored.encode("utf-8")
        return bcrypt.checkpw(password.encode("utf-8"), stored)

    def credit_balance(self, user_id, amount_microalgos):
        return self.collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$inc": {"balance_microalgos": int(amount_microalgos)}},
            return_document=ReturnDocument.AFTER,
        )

    def consume_balance(self, user_id, amount_microalgos, seconds):
        amount_microalgos = int(amount_microalgos)
        seconds = int(seconds)
        return self.collection.find_one_and_update(
            {
                "_id": ObjectId(user_id),
                "balance_microalgos": {"$gte": amount_microalgos},
            },
            {
                "$inc": {
                    "balance_microalgos": -amount_microalgos,
                    "total_spent_microalgos": amount_microalgos,
                    "total_watch_seconds": seconds,
                }
            },
            return_document=ReturnDocument.AFTER,
        )

    def find_by_role(self, role):
        return list(self.collection.find({"role": role}).sort("created_at", 1))
