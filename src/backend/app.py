"""
DineIQ Analytics - Backend Flask Application Entry Point.

Exposes REST API endpoints and web interface routes according to API_CONTRACT.md.
Integrates PySpark / Python dual-pipeline predictions and restaurant intelligence
modules into the DineIQ executive dashboard.
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

from flask import Flask, jsonify, render_template
from src.api.routes import api_bp

# Sidebar navigation - every view maps to real dashboard functionality.
VIEWS = [
    "overview", "orders", "menu", "inventory", "customers",
    "promotions", "payments", "reports", "locations", "models", "settings",
]


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )

    # Register API blueprint
    app.register_blueprint(api_bp, url_prefix="/api/v1")

    def render_view(view: str):
        """Render the dashboard shell with the requested view active."""
        return render_template("index.html", view=view, views=VIEWS)

    @app.route("/")
    def index():
        """Executive overview dashboard (home)."""
        return render_view("overview")

    @app.route("/orders")
    def page_orders():
        return render_view("orders")

    @app.route("/menu")
    def page_menu():
        return render_view("menu")

    @app.route("/inventory")
    def page_inventory():
        return render_view("inventory")

    @app.route("/customers")
    def page_customers():
        return render_view("customers")

    @app.route("/promotions")
    def page_promotions():
        return render_view("promotions")

    @app.route("/payments")
    def page_payments():
        return render_view("payments")

    @app.route("/reports")
    def page_reports():
        return render_view("reports")

    @app.route("/locations")
    def page_locations():
        return render_view("locations")

    @app.route("/models")
    def page_models():
        return render_view("models")

    @app.route("/settings")
    def page_settings():
        return render_view("settings")

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
