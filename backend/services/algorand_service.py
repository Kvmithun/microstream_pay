import base64
from datetime import datetime, timezone

from algosdk import encoding
from algosdk.logic import get_application_address
from algosdk.v2client import algod


class AlgorandService:
    STATUS_IDLE = 0
    STATUS_ACTIVE = 1
    STATUS_PAUSED = 2
    STATUS_STOPPED = 3

    def __init__(self, config):
        self.algod_client = algod.AlgodClient(config["ALGOD_TOKEN"], config["ALGOD_ADDRESS"])
        self.app_id = config["APP_ID"]

    def _decode_state_value(self, value):
        if value.get("type") == 2:
            return int(value.get("uint", 0))

        raw_bytes = value.get("bytes", "")
        decoded = base64.b64decode(raw_bytes) if raw_bytes else b""
        if len(decoded) == 32:
            return encoding.encode_address(decoded)
        return decoded.decode("utf-8") if decoded else ""

    def _global_state(self):
        info = self.algod_client.application_info(self.app_id)
        state = {}
        for item in info["params"].get("global-state", []):
            key = base64.b64decode(item["key"]).decode("utf-8")
            state[key] = self._decode_state_value(item["value"])
        return info, state

    def _status_label(self, status_value):
        if status_value == self.STATUS_IDLE:
            return "idle"
        if status_value == self.STATUS_ACTIVE:
            return "active"
        if status_value == self.STATUS_PAUSED:
            return "paused"
        if status_value == self.STATUS_STOPPED:
            return "stopped"
        return "unknown"

    def get_status(self):
        app_info, state = self._global_state()
        status_value = int(state.get("status", 0))
        last_round = int(self.algod_client.status().get("last-round", 0))
        last_claim_round = int(state.get("last", 0))
        end_round = int(state.get("end", 0))
        claim_round = end_round if status_value == self.STATUS_STOPPED and end_round else last_round
        claimable_rounds = (
            max(claim_round - last_claim_round, 0)
            if status_value in {self.STATUS_ACTIVE, self.STATUS_STOPPED} and last_claim_round
            else 0
        )
        claimable_amount = int(state.get("owed", 0)) + claimable_rounds * int(state.get("rate", 0))
        account_info = self.algod_client.account_info(get_application_address(self.app_id))
        account_balance = int(account_info.get("amount", 0))
        min_balance = int(account_info.get("min-balance", 0))
        remaining_balance = max(account_balance - min_balance, 0)

        return {
            "app_id": self.app_id,
            "app_address": get_application_address(self.app_id),
            "sender": state.get("sender", ""),
            "receiver": state.get("receiver", ""),
            "rate": int(state.get("rate", 0)),
            "deposit_balance": account_balance,
            "remaining_balance": remaining_balance,
            "start_round": int(state.get("start", 0)),
            "end_round": end_round or None,
            "last_claim_round": last_claim_round,
            "owed": int(state.get("owed", 0)),
            "status": self._status_label(status_value),
            "status_code": status_value,
            "current_round": last_round,
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

    def _require_app_call(self, tx_id, expected_sender, action):
        info, txn = self._txn_body(tx_id)
        if txn.get("type") != "appl":
            raise ValueError("Transaction is not an application call.")
        if int(txn.get("apid", 0)) != int(self.app_id):
            raise ValueError("Transaction does not target the configured app.")
        if txn.get("snd") != expected_sender:
            raise ValueError("Transaction sender does not match the connected wallet.")

        args = self._decode_args(txn)
        if not args or args[0] != action.encode():
            raise ValueError(f"Transaction is not a valid {action} call.")

        return info, txn, args

    def verify_create(self, tx_id, payment_tx_id, sender, receiver, rate, deposit):
        _, _, args = self._require_app_call(tx_id, sender, "create")
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
        if payment_txn.get("rcv") != get_application_address(self.app_id):
            raise ValueError("Funding transaction does not pay the app account.")
        if int(payment_txn.get("amt", 0)) != int(deposit):
            raise ValueError("Funding transaction amount does not match the submitted deposit.")

        return self.get_status()

    def verify_sender_action(self, tx_id, sender, action):
        self._require_app_call(tx_id, sender, action)
        return self.get_status()

    def verify_claim(self, tx_id, receiver):
        self._require_app_call(tx_id, receiver, "claim")
        return self.get_status()
