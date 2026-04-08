import base64
from datetime import datetime, timezone
from pathlib import Path

from algosdk import encoding, mnemonic, account, transaction
from algosdk.logic import get_application_address
from algosdk.v2client import algod


class AlgorandService:
    def __init__(self, config):
        self.algod_client = algod.AlgodClient(config["ALGOD_TOKEN"], config["ALGOD_ADDRESS"])
        self.default_app_id = config.get("APP_ID")
        self.contract_dir = Path(__file__).resolve().parents[2] / "contract"
        self._compiled_contract = None
        self.admin_private_key = mnemonic.to_private_key(config["MNEMONIC"])
        self.admin_address = account.address_from_private_key(self.admin_private_key)

    def _decode_state_value(self, value):
        if value.get("type") == 2:
            return int(value.get("uint", 0))

        raw_bytes = value.get("bytes", "")
        decoded = base64.b64decode(raw_bytes) if raw_bytes else b""
        if len(decoded) == 32:
            return encoding.encode_address(decoded)
        return decoded.decode("utf-8") if decoded else ""

    def _global_state(self, app_id):
        info = self.algod_client.application_info(int(app_id))
        state = {}
        for item in info["params"].get("global-state", []):
            key = base64.b64decode(item["key"]).decode("utf-8")
            state[key] = self._decode_state_value(item["value"])
        return info, state

    def _resolve_app_id(self, app_id=None):
        resolved = app_id or self.default_app_id
        if not resolved:
            raise ValueError("No stream app id was provided.")
        return int(resolved)

    def escrow_address(self, app_id=None):
        return get_application_address(self._resolve_app_id(app_id))

    def get_status(self, app_id=None):
        resolved_app_id = self._resolve_app_id(app_id)
        app_info, state = self._global_state(resolved_app_id)
        account_info = self.algod_client.account_info(get_application_address(resolved_app_id))
        account_balance = int(account_info.get("amount", 0))
        min_balance = int(account_info.get("min-balance", 0))
        remaining_balance = max(account_balance - min_balance, 0)
        claimable_amount = min(int(state.get("claimable", 0)), remaining_balance)

        return {
            "app_id": resolved_app_id,
            "app_address": get_application_address(resolved_app_id),
            "sender": state.get("admin", ""),
            "receiver": state.get("receiver", ""),
            "rate": 0,
            "deposit_balance": account_balance,
            "remaining_balance": remaining_balance,
            "start_round": 0,
            "end_round": None,
            "last_claim_round": 0,
            "owed": claimable_amount,
            "status": "active" if claimable_amount else "idle",
            "status_code": 1 if claimable_amount else 0,
            "current_round": int(self.algod_client.status().get("last-round", 0)),
            "claimable_amount": min(claimable_amount, remaining_balance),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "raw_app": app_info,
        }

    def _pending_transaction(self, tx_id):
        info = self.algod_client.pending_transaction_info(tx_id)
        if not info or not int(info.get("confirmed-round", 0)):
            raise ValueError("Transaction is not confirmed yet.")
        return info

    def _txn_body(self, tx_id):
        info = self._pending_transaction(tx_id)
        txn = (info.get("txn") or {}).get("txn") or {}
        if not txn:
            raise ValueError("Transaction details are unavailable.")
        return info, txn

    def _decode_args(self, txn):
        return [base64.b64decode(item) for item in txn.get("apaa", [])]

    def _require_app_call(self, tx_id, app_id, expected_sender, action):
        info, txn = self._txn_body(tx_id)
        if txn.get("type") != "appl":
            raise ValueError("Transaction is not an application call.")
        if int(txn.get("apid", 0)) != int(app_id):
            raise ValueError("Transaction does not target the selected stream.")
        if txn.get("snd") != expected_sender:
            raise ValueError("Transaction sender does not match the connected wallet.")

        args = self._decode_args(txn)
        if not args or args[0] != action.encode():
            raise ValueError(f"Transaction is not a valid {action} call.")

        return info, txn, args

    def verify_create(self, app_id, tx_id, payment_tx_id, sender, receiver, rate, deposit):
        _, _, args = self._require_app_call(tx_id, app_id, sender, "create")
        if len(args) != 3:
            raise ValueError("Create transaction arguments are invalid.")
        if encoding.encode_address(args[1]) != receiver:
            raise ValueError("Create transaction receiver does not match the submitted receiver.")
        if int.from_bytes(args[2], "big") != int(rate):
            raise ValueError("Create transaction rate does not match the submitted rate.")

        _, payment_txn = self._txn_body(payment_tx_id)
        if payment_txn.get("type") != "pay":
            raise ValueError("Funding transaction is not a payment.")
        if payment_txn.get("snd") != sender:
            raise ValueError("Funding transaction sender does not match the connected wallet.")
        if payment_txn.get("rcv") != get_application_address(int(app_id)):
            raise ValueError("Funding transaction does not pay the app account.")
        if int(payment_txn.get("amt", 0)) != int(deposit):
            raise ValueError("Funding transaction amount does not match the submitted deposit.")

        return self.get_status(app_id)

    def verify_sender_action(self, app_id, tx_id, sender, action):
        self._require_app_call(tx_id, app_id, sender, action)
        return self.get_status(app_id)

    def verify_claim(self, app_id, tx_id, receiver):
        self._require_app_call(tx_id, app_id, receiver, "claim")
        return self.get_status(app_id)

    def execute_receiver_claim(self, app_id=None):
        resolved_app_id = self._resolve_app_id(app_id)
        params = self.algod_client.suggested_params()
        params.flat_fee = True
        params.fee = 2000

        txn = transaction.ApplicationNoOpTxn(
            self.admin_address,
            params,
            resolved_app_id,
            app_args=[b"claim"],
        )
        signed = txn.sign(self.admin_private_key)
        tx_id = self.algod_client.send_transaction(signed)
        transaction.wait_for_confirmation(self.algod_client, tx_id, 8)
        return {"tx_id": tx_id, "status": self.get_status(resolved_app_id)}

    def record_usage(self, amount, app_id=None):
        resolved_app_id = self._resolve_app_id(app_id)
        amount = int(amount or 0)
        if amount <= 0:
            raise ValueError("Usage amount must be greater than zero.")

        params = self.algod_client.suggested_params()
        txn = transaction.ApplicationNoOpTxn(
            self.admin_address,
            params,
            resolved_app_id,
            app_args=[b"record", amount.to_bytes(8, "big")],
        )
        signed = txn.sign(self.admin_private_key)
        tx_id = self.algod_client.send_transaction(signed)
        transaction.wait_for_confirmation(self.algod_client, tx_id, 8)
        return {"tx_id": tx_id, "status": self.get_status(resolved_app_id)}

    def verify_deposit(self, tx_id, expected_sender, expected_receiver, expected_note):
        _, txn = self._txn_body(tx_id)
        if txn.get("type") != "pay":
            raise ValueError("Deposit transaction is not a payment.")
        if txn.get("snd") != expected_sender:
            raise ValueError("Deposit sender does not match the connected wallet.")
        if txn.get("rcv") != expected_receiver:
            raise ValueError("Deposit receiver does not match the platform wallet.")

        raw_note = txn.get("note", "")
        decoded_note = base64.b64decode(raw_note).decode("utf-8") if raw_note else ""
        if decoded_note != expected_note:
            raise ValueError("Deposit note does not match this viewer account.")

        amount = int(txn.get("amt", 0))
        if amount <= 0:
            raise ValueError("Deposit amount must be greater than zero.")

        return {
            "tx_id": tx_id,
            "sender": txn.get("snd"),
            "receiver": txn.get("rcv"),
            "amount": amount,
            "note": decoded_note,
        }

    def contract_spec(self):
        if self._compiled_contract:
            return self._compiled_contract

        approval_source = (self.contract_dir / "approval.teal").read_text(encoding="utf-8")
        clear_source = (self.contract_dir / "clear.teal").read_text(encoding="utf-8")

        approval = self.algod_client.compile(approval_source)
        clear = self.algod_client.compile(clear_source)

        self._compiled_contract = {
            "approval_program": approval["result"],
            "clear_program": clear["result"],
        }
        return self._compiled_contract
