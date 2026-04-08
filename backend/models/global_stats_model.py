from pymongo import ReturnDocument


class GlobalStatsModel:
    STATS_ID = "platform"

    def __init__(self, db):
        self.collection = db.global_stats
        self.ensure_document()

    def ensure_document(self):
        self.collection.update_one(
            {"_id": self.STATS_ID},
            {
                "$setOnInsert": {
                    "total_spent_all_users": 0,
                    "total_claimed": 0,
                    "total_remaining": 0,
                }
            },
            upsert=True,
        )

    def get_stats(self):
        self.ensure_document()
        return self.collection.find_one({"_id": self.STATS_ID}) or {
            "_id": self.STATS_ID,
            "total_spent_all_users": 0,
            "total_claimed": 0,
            "total_remaining": 0,
        }

    def increment_for_usage(self, amount):
        amount = int(amount or 0)
        return self.collection.find_one_and_update(
            {"_id": self.STATS_ID},
            {
                "$inc": {
                    "total_spent_all_users": amount,
                    "total_remaining": amount,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

    def increment_for_claim(self, amount):
        amount = int(amount or 0)
        return self.collection.find_one_and_update(
            {"_id": self.STATS_ID},
            {
                "$inc": {
                    "total_claimed": amount,
                    "total_remaining": -amount,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
