from flask import Blueprint, current_app, g, jsonify, request

from middleware.auth_middleware import require_role, verify_token


sender_bp = Blueprint("sender", __name__)


def _user_payload(user):
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "wallet_address": user.get("wallet_address", ""),
        "payment_note": user.get("payment_note", ""),
        "balance_microalgos": int(user.get("balance_microalgos", 0)),
        "total_spent_microalgos": int(user.get("total_spent_microalgos", 0)),
        "total_watch_seconds": int(user.get("total_watch_seconds", 0)),
    }


@sender_bp.get("/dashboard")
@verify_token()
@require_role("user")
def dashboard():
    transactions = current_app.transaction_model.find_for_user(g.current_user["wallet_address"])[:20]
    for txn in transactions:
        txn["_id"] = str(txn["_id"])
    stats = current_app.global_stats_model.get_stats()
    return jsonify(
        {
            "user": _user_payload(g.current_user),
            "transactions": transactions,
            "global_stats": {
                "total_spent_all_users": int(stats.get("total_spent_all_users", 0)),
                "total_claimed": int(stats.get("total_claimed", 0)),
                "total_remaining": int(stats.get("total_remaining", 0)),
                "active_users": len(current_app.user_model.find_by_role("user")),
            },
        }
    )


@sender_bp.get("/deposit-intent")
@verify_token()
@require_role("user")
def deposit_intent():
    return jsonify(
        {
            "receiver_address": current_app.algorand_service.escrow_address(),
            "payment_note": g.current_user.get("payment_note", ""),
            "rate_microalgos_per_second": current_app.config["VIEW_RATE_MICROALGOS_PER_SECOND"],
        }
    )


@sender_bp.post("/verify-deposit")
@verify_token()
@require_role("user")
def verify_deposit():
    data = request.get_json(force=True) if request.data else {}
    tx_id = data.get("tx_id")
    if not tx_id:
        return jsonify({"error": "tx_id is required"}), 400

    if current_app.transaction_model.find_by_hash(tx_id):
        return jsonify({"error": "This deposit has already been credited."}), 409

    deposit = current_app.algorand_service.verify_deposit(
        tx_id,
        g.current_user["wallet_address"],
        current_app.algorand_service.escrow_address(),
        g.current_user.get("payment_note", ""),
    )
    user = current_app.user_model.credit_balance(str(g.current_user["_id"]), deposit["amount"])
    current_app.transaction_model.create_transaction(
        {
            "type": "deposit",
            "amount": deposit["amount"],
            "tx_hash": tx_id,
            "user": g.current_user["wallet_address"],
            "note": deposit["note"],
        }
    )
    g.current_user = user
    return jsonify({"user": _user_payload(user), "deposit": deposit})


@sender_bp.post("/consume")
@verify_token()
@require_role("user")
def consume():
    data = request.get_json(force=True) if request.data else {}
    seconds = int(data.get("seconds", 0) or 0)
    movie_id = data.get("movie_id", "")
    if seconds <= 0:
        return jsonify({"error": "seconds must be greater than zero"}), 400

    rate = int(current_app.config["VIEW_RATE_MICROALGOS_PER_SECOND"])
    amount = seconds * rate
    user = current_app.user_model.consume_balance(str(g.current_user["_id"]), amount, seconds)
    if not user:
        return jsonify({"error": "Insufficient balance. Add funds to continue watching."}), 400

    current_app.transaction_model.create_transaction(
        {
            "type": "usage",
            "amount": amount,
            "tx_hash": None,
            "user": g.current_user["wallet_address"],
            "movie_id": movie_id,
            "seconds": seconds,
        }
    )
    current_app.algorand_service.record_usage(amount)
    current_app.global_stats_model.increment_for_usage(amount)
    g.current_user = user
    return jsonify({"user": _user_payload(user), "consumed_microalgos": amount})
