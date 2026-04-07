import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Config:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent
    JWT_SECRET = os.getenv("JWT_SECRET", "batman_secret_key_2026")
    MONGO_URI = os.getenv("MONGO_URI", "")
    ALGOD_ADDRESS = os.getenv("ALGOD_ADDRESS", "https://testnet-api.algonode.cloud")
    ALGOD_TOKEN = os.getenv("ALGOD_TOKEN", "")
    APP_ID = int(os.getenv("APP_ID", "0")) or None
