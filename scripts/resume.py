import os
import ssl

from algosdk import account, mnemonic, transaction
from algosdk.v2client import algod
from dotenv import load_dotenv

ssl._create_default_https_context = ssl._create_unverified_context
load_dotenv()


def resume_stream():
    client = algod.AlgodClient(os.getenv("ALGOD_TOKEN"), os.getenv("ALGOD_ADDRESS"))

    private_key = mnemonic.to_private_key(os.getenv("MNEMONIC"))
    sender = account.address_from_private_key(private_key)
    app_id = int(os.getenv("APP_ID", "758275892"))

    params = client.suggested_params()

    txn = transaction.ApplicationNoOpTxn(
        sender=sender,
        sp=params,
        index=app_id,
        app_args=[b"resume"],
    )

    signed_txn = txn.sign(private_key)
    tx_id = client.send_transaction(signed_txn)
    transaction.wait_for_confirmation(client, tx_id, 4)
    print(f"Stream resumed. Tx ID: {tx_id}")


if __name__ == "__main__":
    resume_stream()
