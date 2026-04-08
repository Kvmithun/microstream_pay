from pymongo import MongoClient

from config import Config
from models.user_model import UserModel


def main():
    if not Config.MONGO_URI:
        raise RuntimeError("MONGO_URI is not configured.")

    mongo_client = MongoClient(Config.MONGO_URI)
    database = mongo_client.get_default_database()

    database.streams.delete_many({})
    database.transactions.delete_many({})
    database.users.delete_many({})
    database.global_stats.delete_many({})

    user_model = UserModel(database)
    receiver = user_model.create_user(
        Config.RECEIVER_NAME,
        Config.RECEIVER_EMAIL,
        Config.RECEIVER_PASSWORD,
        "receiver",
        Config.RECEIVER_WALLET_ADDRESS,
    )

    print(
        {
            "status": "reset-complete",
            "receiver_email": receiver["email"],
            "receiver_wallet_address": receiver["wallet_address"],
        }
    )


if __name__ == "__main__":
    main()
