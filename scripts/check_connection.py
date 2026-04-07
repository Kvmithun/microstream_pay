import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import os
from dotenv import load_dotenv
from algosdk import mnemonic, account
from algosdk.v2client import algod

# Load environment variables
load_dotenv()


def check_connection():
    # Setup client
    algod_address = os.getenv("ALGOD_ADDRESS")
    algod_token = os.getenv("ALGOD_TOKEN")
    client = algod.AlgodClient(algod_token, algod_address)

    # Get account from mnemonic
    passphrase = os.getenv("MNEMONIC")

    if not passphrase:
        raise ValueError("❌ MNEMONIC not found in .env file")

    # Convert mnemonic → private key → address
    private_key = mnemonic.to_private_key(passphrase)
    address = account.address_from_private_key(private_key)

    try:
        # Check node status
        client.status()
        print("✅ Successfully connected to Algorand TestNet.")

        # Check account balance
        account_info = client.account_info(address)
        balance = account_info.get('amount', 0) / 1_000_000

        print(f"📍 Address: {address}")
        print(f"💰 Balance: {balance} ALGO")

        if balance == 0:
            print("⚠️ Warning: Your balance is 0. Fund it using faucet.")

    except Exception as e:
        print(f"❌ Connection failed: {e}")


if __name__ == "__main__":
    check_connection()