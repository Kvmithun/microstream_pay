import ssl
ssl._create_default_https_context = ssl._create_unverified_context

import os
import base64
from dotenv import load_dotenv
from algosdk import mnemonic, account, encoding
from algosdk.v2client import algod
from algosdk import transaction

load_dotenv()


def compile_program(client, source_code):
    compile_response = client.compile(source_code)
    return base64.b64decode(compile_response['result'])


def deploy_app():
    # Setup Client
    client = algod.AlgodClient(os.getenv("ALGOD_TOKEN"), os.getenv("ALGOD_ADDRESS"))

    # Get Credentials
    private_key = mnemonic.to_private_key(os.getenv("MNEMONIC"))
    sender = account.address_from_private_key(private_key)

    # Read TEAL
    with open("contract/approval.teal", "r") as f:
        approval_source = f.read()
    with open("contract/clear.teal", "r") as f:
        clear_source = f.read()

    # Compile
    approval_program = compile_program(client, approval_source)
    clear_program = compile_program(client, clear_source)

    receiver_address = os.getenv("RECEIVER_WALLET_ADDRESS")
    if not receiver_address:
        raise RuntimeError("RECEIVER_WALLET_ADDRESS is required")

    global_schema = transaction.StateSchema(num_uints=1, num_byte_slices=2)
    local_schema = transaction.StateSchema(num_uints=0, num_byte_slices=0)

    # Create Transaction
    params = client.suggested_params()
    txn = transaction.ApplicationCreateTxn(
        sender, params, transaction.OnComplete.NoOpOC,
        approval_program, clear_program,
        global_schema, local_schema,
        app_args=[encoding.decode_address(receiver_address)]
    )

    # Sign and Send
    signed_txn = txn.sign(private_key)
    tx_id = client.send_transaction(signed_txn)
    print(f"⏳ Waiting for deployment... Transaction ID: {tx_id}")

    # Wait for confirmation
    result = transaction.wait_for_confirmation(client, tx_id, 4)
    app_id = result['application-index']
    app_address = transaction.logic.get_application_address(app_id)

    print(f"✅ Application Deployed!")
    print(f"🚀 APP ID: {app_id}")
    print(f"🏦 APP ADDRESS: {app_address}")
    print("\n--- ACTION REQUIRED ---")
    print(f"Please send 2-5 ALGO to {app_address} so the stream has funds to pay out.")


if __name__ == "__main__":
    deploy_app()
