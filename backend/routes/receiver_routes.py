from flask import Blueprint, current_app, g, jsonify, request

from middleware.auth_middleware import require_role, verify_token


receiver_bp = Blueprint("receiver", __name__)


@receiver_bp.get("/my-streams")
@verify_token()
@require_role("receiver")
def my_streams():
    streams = current_app.stream_model.find_for_receiver(g.current_user["wallet_address"])
    for stream in streams:
        stream["_id"] = str(stream["_id"])
    return jsonify({"streams": streams})


@receiver_bp.post("/claim")
@verify_token()
@require_role("receiver")
def claim():
    data = request.get_json(force=True) if request.data else {}
    tx_id = data.get("tx_id")
    if not tx_id:
        return jsonify({"error": "tx_id is required"}), 400

    before = current_app.algorand_service.get_status()
    existing = current_app.stream_model.find_by_stream_id(str(before["app_id"]))
    status = current_app.algorand_service.verify_claim(tx_id, g.current_user["wallet_address"])
    stream = current_app.stream_model.update_stream(
        str(status["app_id"]),
        {
            "receiver": status["receiver"],
            "rate": status["rate"],
            "remaining_balance": status["remaining_balance"],
            "claimed_amount": max((existing or {}).get("total_deposit", 0) - status["remaining_balance"], 0),
            "start_round": status["start_round"],
            "end_round": status["end_round"],
            "last_claim_round": status["last_claim_round"],
            "status": status["status"],
        },
    )
    current_app.transaction_model.create_transaction(
        {
            "stream_id": str(status["app_id"]),
            "type": "claim",
            "amount": max(before["remaining_balance"] - status["remaining_balance"], 0),
            "tx_hash": tx_id,
            "user": g.current_user["wallet_address"],
        }
    )
    if stream:
        stream["_id"] = str(stream["_id"])
    return jsonify({"tx_hash": tx_id, "stream": stream, "chain_status": status})
