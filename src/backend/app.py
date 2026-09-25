"""
DineIQ Analytics - Backend Flask Application Entry Point.

Exposes REST API endpoints and web interface routes according to API_CONTRACT.md.
Integrates PySpark / Python dual-pipeline predictions and restaurant intelligence modules.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Make the project root importable when this file is launched directly with:
#   python src/backend/app.py
# This also keeps normal package/module execution working.
BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from flask import Flask, jsonify, render_template, request
from src.api.routes import api_bp


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )

    # Register API blueprint
    app.register_blueprint(api_bp, url_prefix="/api/v1")

    @app.route("/")
    def index():
        """Render main restaurant intelligence dashboard frame."""
        return render_template("index.html")

    @app.route("/health")
    def health_check():
        return jsonify({
            "status": "HEALTHY",
            "service": "DineIQ Analytics Master API",
            "version": "1.0.0",
        })

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
