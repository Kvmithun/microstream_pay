from flask import Blueprint, current_app, g, jsonify, request

from middleware.auth_middleware import require_role, verify_token


receiver_bp = Blueprint("receiver", __name__)
MIN_CLAIM_MICROALGOS = 2001


def _creator_summary():
    stats = current_app.global_stats_model.get_stats()
    total_deposits = current_app.transaction_model.sum_amount_by_type("deposit")
    return {
        "total_deposits_microalgos": total_deposits,
        "total_spent_microalgos": int(stats.get("total_spent_all_users", 0)),
        "total_claimed_microalgos": int(stats.get("total_claimed", 0)),
        "claimable_microalgos": int(stats.get("total_remaining", 0)),
        "receiver_wallet_address": current_app.config["RECEIVER_WALLET_ADDRESS"],
        "escrow_wallet_address": current_app.algorand_service.escrow_address(),
    }


@receiver_bp.get("/dashboard")
@verify_token()
@require_role("receiver")
def dashboard():
    summary = _creator_summary()
    transactions = current_app.transaction_model.find_for_user(g.current_user["wallet_address"])[:20]
    for txn in transactions:
        txn["_id"] = str(txn["_id"])
    return jsonify({"summary": summary, "transactions": transactions})


@receiver_bp.post("/claim")
@verify_token()
@require_role("receiver")
def claim():
    summary = _creator_summary()
    claimable = int(summary["claimable_microalgos"])
    if claimable <= 0:
        return jsonify({"error": "No creator earnings are available to claim."}), 400
    if claimable < MIN_CLAIM_MICROALGOS:
        return jsonify(
            {
                "error": (
                    "Claimable amount is too small right now. "
                    "Wait for more earnings before claiming so the Algorand fee does not eat the payout."
                )
            }
        ), 400

    claim_result = current_app.algorand_service.execute_receiver_claim(current_app.config["APP_ID"])
    tx_id = claim_result["tx_id"]
    status = claim_result["status"]
    claimed_amount = max(claimable - int(status["claimable_amount"]), 0)
    if claimed_amount <= 0:
        return jsonify({"error": "Claim transaction did not transfer any funds."}), 400

    current_app.transaction_model.create_transaction(
        {
            "type": "creator_claim",
            "amount": claimed_amount,
            "tx_hash": tx_id,
            "user": g.current_user["wallet_address"],
        }
    )
    current_app.global_stats_model.increment_for_claim(claimed_amount)
    return jsonify(
        {
            "claim_id": tx_id,
            "claimed_microalgos": claimed_amount,
            "summary": _creator_summary(),
            "chain_status": status,
        }
    )
