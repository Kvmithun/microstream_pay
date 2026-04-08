import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Config:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent
    MNEMONIC = os.getenv("MNEMONIC", "")
    JWT_SECRET = os.getenv("JWT_SECRET", "batman_secret_key_2026")
    MONGO_URI = os.getenv("MONGO_URI", "")
    ALGOD_ADDRESS = os.getenv("ALGOD_ADDRESS", "https://testnet-api.algonode.cloud")
    ALGOD_TOKEN = os.getenv("ALGOD_TOKEN", "")
    APP_ID = int(os.getenv("APP_ID", "0")) or None
    VIEW_RATE_MICROALGOS_PER_SECOND = int(os.getenv("VIEW_RATE_MICROALGOS_PER_SECOND", "10"))
    RECEIVER_NAME = os.getenv("RECEIVER_NAME", "Mithun")
    RECEIVER_EMAIL = os.getenv("RECEIVER_EMAIL", "kvmithun1234@gmail.com")
    RECEIVER_PASSWORD = os.getenv("RECEIVER_PASSWORD", "mithun")
    RECEIVER_WALLET_ADDRESS = os.getenv(
        "RECEIVER_WALLET_ADDRESS",
        "AL3JJ527I262UMN6BKSZM2B3PKYM2LHILXFE4EXBZXYJDGYC2VBBEIA3TY",
    )
