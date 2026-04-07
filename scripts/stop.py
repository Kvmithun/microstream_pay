import base64
import os
import ssl

from algosdk import account, encoding, mnemonic, transaction
from algosdk.v2client import algod
from dotenv import load_dotenv

ssl._create_default_https_context = ssl._create_unverified_context
load_dotenv()


def stop_stream():
    client = algod.AlgodClient(os.getenv("ALGOD_TOKEN"), os.getenv("ALGOD_ADDRESS"))

    private_key = mnemonic.to_private_key(os.getenv("MNEMONIC"))
    sender = account.address_from_private_key(private_key)
    app_id = int(os.getenv("APP_ID", "758275892"))
    app_info = client.application_info(app_id)

    receiver = ""
    for item in app_info["params"].get("global-state", []):
        key = item.get("key", "")
        if key and base64.b64decode(key).decode("utf-8") == "receiver":
            receiver = encoding.encode_address(base64.b64decode(item["value"].get("bytes", "")))
            break

    params = client.suggested_params()
    params.flat_fee = True
    params.fee = 3000

    txn = transaction.ApplicationNoOpTxn(
        sender=sender,
        sp=params,
        index=app_id,
        app_args=[b"stop"],
        accounts=[receiver] if receiver else [],
    )

    signed_txn = txn.sign(private_key)
    tx_id = client.send_transaction(signed_txn)
    transaction.wait_for_confirmation(client, tx_id, 4)
    print(f"Stream stopped. Tx ID: {tx_id}")


if __name__ == "__main__":
    stop_stream()
