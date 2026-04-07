from flask import Flask, jsonify, make_response, request
from flask_cors import CORS
from pymongo import MongoClient
from algosdk.error import AlgodHTTPError

from config import Config
from models.stream_model import StreamModel
from models.transaction_model import TransactionModel
from models.user_model import UserModel
from routes.auth_routes import auth_bp
from routes.receiver_routes import receiver_bp
from routes.sender_routes import sender_bp
from services.algorand_service import AlgorandService


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(
        app,
        resources={r"/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"]}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "OPTIONS"],
    )

    mongo_client = MongoClient(app.config["MONGO_URI"])
    database = mongo_client.get_default_database()

    app.user_model = UserModel(database)
    app.stream_model = StreamModel(database)
    app.transaction_model = TransactionModel(database)
    app.algorand_service = AlgorandService(app.config)

    app.register_blueprint(auth_bp)
    app.register_blueprint(sender_bp, url_prefix="/sender")
    app.register_blueprint(receiver_bp, url_prefix="/receiver")

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "default_app_id": app.config["APP_ID"]})

    @app.get("/chain-status")
    def chain_status():
        app_id = request.args.get("app_id", type=int)
        if not app_id:
            return jsonify({"status": "idle", "status_code": 0, "app_id": None, "claimable_amount": 0, "remaining_balance": 0})
        return jsonify(app.algorand_service.get_status(app_id))

    @app.get("/contract-spec")
    def contract_spec():
        return jsonify(app.algorand_service.contract_spec())

    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            response = make_response("", 204)
            origin = request.headers.get("Origin", "http://localhost:3000")
            if origin in {"http://localhost:3000", "http://127.0.0.1:3000"}:
                response.headers["Access-Control-Allow-Origin"] = origin
            else:
                response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Vary"] = "Origin"
            return response

    @app.errorhandler(AlgodHTTPError)
    def handle_algod_error(error):
        return jsonify({"error": str(error)}), 400

    @app.errorhandler(ValueError)
    def handle_value_error(error):
        return jsonify({"error": str(error)}), 400

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception("Unhandled backend error")
        return jsonify({"error": str(error) or "Unexpected server error"}), 500

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin", "http://localhost:3000")
        if origin in {"http://localhost:3000", "http://127.0.0.1:3000"}:
            response.headers["Access-Control-Allow-Origin"] = origin
        elif not response.headers.get("Access-Control-Allow-Origin"):
            response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Vary"] = "Origin"
        return response

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
