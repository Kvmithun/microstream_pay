from flask import Blueprint, current_app, g, jsonify, request

from middleware.auth_middleware import require_role, verify_token


sender_bp = Blueprint("sender", __name__)


def _stream_payload(status, total_deposit):
    total_deposit = int(total_deposit or 0)
    return {
        "stream_id": str(status["app_id"]),
        "sender": status["sender"],
        "receiver": status["receiver"],
        "rate": status["rate"],
        "total_deposit": total_deposit,
        "remaining_balance": status["remaining_balance"],
        "claimed_amount": max(total_deposit - status["remaining_balance"], 0),
        "start_round": status["start_round"],
        "end_round": status["end_round"],
        "last_claim_round": status["last_claim_round"],
        "status": status["status"],
    }


@sender_bp.get("/my-streams")
@verify_token()
@require_role("sender")
def my_streams():
    streams = current_app.stream_model.find_for_sender(g.current_user["wallet_address"])
    for stream in streams:
        stream["_id"] = str(stream["_id"])
    return jsonify({"streams": streams})


@sender_bp.post("/create-stream")
@verify_token()
@require_role("sender")
def create_stream():
    data = request.get_json(force=True)
    tx_id = data.get("tx_id")
    payment_tx_id = data.get("payment_tx_id")
    receiver = data.get("receiver")
    rate = data.get("rate")
    deposit = data.get("deposit")

    if not tx_id or not payment_tx_id or not receiver or not rate or not deposit:
        return jsonify({"error": "tx_id, payment_tx_id, receiver, rate, and deposit are required"}), 400

    status = current_app.algorand_service.verify_create(
        tx_id,
        payment_tx_id,
        g.current_user["wallet_address"],
        receiver,
        rate,
        deposit,
    )
    stream = current_app.stream_model.create_stream(_stream_payload(status, deposit))
    current_app.transaction_model.create_transaction(
        {
            "stream_id": stream["stream_id"],
            "type": "create",
            "amount": int(deposit),
            "tx_hash": tx_id,
            "user": g.current_user["wallet_address"],
        }
    )
    stream["_id"] = str(stream["_id"])
    return jsonify({"tx_hash": tx_id, "stream": stream, "chain_status": status})


def _sender_action(action):
    data = request.get_json(force=True) if request.data else {}
    tx_id = data.get("tx_id")
    if not tx_id:
        return jsonify({"error": "tx_id is required"}), 400

    existing = current_app.stream_model.find_by_stream_id(str(current_app.algorand_service.app_id))
    status = current_app.algorand_service.verify_sender_action(
        tx_id,
        g.current_user["wallet_address"],
        action,
    )
    stream = current_app.stream_model.update_stream(
        str(status["app_id"]),
        _stream_payload(status, (existing or {}).get("total_deposit", 0)),
    )
    current_app.transaction_model.create_transaction(
        {
            "stream_id": str(status["app_id"]),
            "type": action,
            "amount": 0,
            "tx_hash": tx_id,
            "user": g.current_user["wallet_address"],
        }
    )
    stream["_id"] = str(stream["_id"])
    return jsonify({"tx_hash": tx_id, "stream": stream, "chain_status": status})


@sender_bp.post("/pause-stream")
@verify_token()
@require_role("sender")
def pause_stream():
    return _sender_action("pause")


@sender_bp.post("/resume-stream")
@verify_token()
@require_role("sender")
def resume_stream():
    return _sender_action("resume")


@sender_bp.post("/stop-stream")
@verify_token()
@require_role("sender")
def stop_stream():
    return _sender_action("stop")
