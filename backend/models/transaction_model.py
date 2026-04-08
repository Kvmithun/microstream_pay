from datetime import datetime, timezone


class TransactionModel:
    def __init__(self, db):
        self.collection = db.transactions
        self.collection.create_index("stream_id")
        self.collection.create_index("user")
        self.collection.create_index("tx_hash", unique=True, sparse=True)

    def create_transaction(self, payload):
        payload["timestamp"] = datetime.now(timezone.utc)
        if not payload.get("tx_hash"):
            payload.pop("tx_hash", None)
        self.collection.insert_one(payload)
        return payload

    def find_for_stream(self, stream_id):
        return list(self.collection.find({"stream_id": stream_id}).sort("timestamp", -1))

    def find_for_user(self, user):
        return list(self.collection.find({"user": user}).sort("timestamp", -1))

    def find_by_hash(self, tx_hash):
        if not tx_hash:
            return None
        return self.collection.find_one({"tx_hash": tx_hash})

    def sum_amount_by_type(self, txn_type):
        pipeline = [
            {"$match": {"type": txn_type}},
            {"$group": {"_id": None, "amount": {"$sum": "$amount"}}},
        ]
        result = list(self.collection.aggregate(pipeline))
        return int(result[0]["amount"]) if result else 0
