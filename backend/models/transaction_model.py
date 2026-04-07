from datetime import datetime, timezone


class TransactionModel:
    def __init__(self, db):
        self.collection = db.transactions
        self.collection.create_index("stream_id")
        self.collection.create_index("user")

    def create_transaction(self, payload):
        payload["timestamp"] = datetime.now(timezone.utc)
        self.collection.insert_one(payload)
        return payload

    def find_for_stream(self, stream_id):
        return list(self.collection.find({"stream_id": stream_id}).sort("timestamp", -1))
