import os
import ssl

from algosdk import account, encoding, mnemonic, transaction
from algosdk.logic import get_application_address
from algosdk.v2client import algod
from dotenv import load_dotenv

ssl._create_default_https_context = ssl._create_unverified_context
load_dotenv()


def create_stream():
    client = algod.AlgodClient(os.getenv("ALGOD_TOKEN"), os.getenv("ALGOD_ADDRESS"))

    sender_private_key = mnemonic.to_private_key(os.getenv("MNEMONIC"))
    sender = account.address_from_private_key(sender_private_key)

    app_id = int(os.getenv("APP_ID", "758275892"))
    receiver = os.getenv(
        "RECEIVER_ADDRESS",
        "OP3KYF6BSGPZ6FG66Q4MNHIXMKB3S4MS3XEI6TZF3OISVQHK4JNDXMLC5M",
    )
    rate = int(os.getenv("STREAM_RATE", "10000"))
    deposit_amount = int(os.getenv("STREAM_DEPOSIT", "3000000"))
    app_address = get_application_address(app_id)

    print(f"Starting stream on app {app_id}")
    print(f"Sender   : {sender}")
    print(f"Receiver : {receiver}")
    print(f"Rate     : {rate} microAlgos/round")
    print(f"Deposit  : {deposit_amount / 1_000_000:.3f} ALGO")

    params = client.suggested_params()

    funding_txn = transaction.PaymentTxn(
        sender=sender,
        sp=params,
        receiver=app_address,
        amt=deposit_amount,
    )

    app_call_txn = transaction.ApplicationNoOpTxn(
        sender=sender,
        sp=params,
        index=app_id,
        app_args=[
            b"create",
            encoding.decode_address(receiver),
            rate.to_bytes(8, "big"),
        ],
    )

    transaction.assign_group_id([funding_txn, app_call_txn])

    signed_funding = funding_txn.sign(sender_private_key)
    signed_call = app_call_txn.sign(sender_private_key)
    tx_id = client.send_transactions([signed_funding, signed_call])

    print("Waiting for confirmation...")
    transaction.wait_for_confirmation(client, tx_id, 4)
    print(f"Stream created. Tx ID: {tx_id}")


if __name__ == "__main__":
    create_stream()
