from datetime import datetime, timezone


class StreamModel:
    def __init__(self, db):
        self.collection = db.streams
        self.collection.create_index("stream_id", unique=True)
        self.collection.create_index("receiver")
        self.collection.create_index("sender")

    def create_stream(self, payload):
        payload["created_at"] = datetime.now(timezone.utc)
        self.collection.update_one(
            {"stream_id": payload["stream_id"]},
            {"$set": payload},
            upsert=True,
        )
        return self.find_by_stream_id(payload["stream_id"])

    def find_by_stream_id(self, stream_id):
        return self.collection.find_one({"stream_id": stream_id})

    def find_for_receiver(self, receiver_wallet):
        return list(self.collection.find({"receiver": receiver_wallet}).sort("created_at", -1))

    def find_for_sender(self, sender_wallet):
        return list(self.collection.find({"sender": sender_wallet}).sort("created_at", -1))

    def update_stream(self, stream_id, updates):
        self.collection.update_one({"stream_id": stream_id}, {"$set": updates})
        return self.find_by_stream_id(stream_id)
