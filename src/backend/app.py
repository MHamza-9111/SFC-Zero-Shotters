"""Flask application factory for the DineIQ analytics web application."""

from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.api.routes import (api_bp, bootstrap_admin_from_environment,
                            scoring_service)

BASE_DIR = PROJECT_ROOT
PAGES = {
    "orders", "menu", "inventory", "customers", "promotions", "payments",
    "reports", "locations", "models", "settings", "basket", "price",
    "forecast", "peak", "anomalies", "whatif", "recommendations", "quality",
    "channels",
    "team", "billing", "data",
}


def _secret_key() -> str:
    configured = os.environ.get("DINEIQ_SECRET_KEY")
    if configured:
        return configured
    runtime = Path(os.environ.get("DINEIQ_RUNTIME_DIR", BASE_DIR / "runtime"))
    runtime.mkdir(parents=True, exist_ok=True)
    path = runtime / "session_secret.key"
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        value = secrets.token_urlsafe(48)
        try:
            with path.open("x", encoding="utf-8") as key_file:
                key_file.write(value)
            try:
                path.chmod(0o600)
            except OSError:
                pass
            return value
        except FileExistsError:
            return path.read_text(encoding="utf-8").strip()


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def create_app() -> Flask:
    app = Flask(
        __name__,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )
    app.config.update(
        SECRET_KEY=_secret_key(),
        AUTH_REQUIRED=_env_bool("DINEIQ_AUTH_REQUIRED", True),
        AUTH_DB=os.environ.get("DINEIQ_AUTH_DB", str(BASE_DIR / "runtime" / "dineiq_auth.sqlite3")),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=_env_bool(
            "DINEIQ_COOKIE_SECURE", os.environ.get("DINEIQ_ENV", "").lower() == "production"),
        PERMANENT_SESSION_LIFETIME=60 * 60 * 8,
        MAX_CONTENT_LENGTH=2 * 1024 * 1024,
    )
    app.register_blueprint(api_bp, url_prefix="/api/v1")

    try:
        with app.app_context():
            bootstrap_admin_from_environment()
    except Exception:
        app.logger.exception("Administrator bootstrap could not be completed")
    # The models are loaded once before the first scoring request. Startup can
    # continue in degraded mode so health and analytics remain available.
    try:
        scoring_service.warm()
    except Exception:
        app.logger.exception("Model warm-up failed; scoring endpoints will report unavailable")

    @app.before_request
    def protect_pages():
        if (app.testing or not app.config["AUTH_REQUIRED"]
                or request.path.startswith("/api/")
                or request.path in {"/health", "/login", "/register"}
                or request.path.startswith("/static/")):
            return None
        if not session.get("user"):
            next_path = request.full_path if request.full_path else "/"
            return redirect(url_for("login_page", next=next_path))
        return None

    @app.route("/", defaults={"page": "overview"})
    @app.route("/<page>")
    def dashboard_page(page: str):
        if page not in PAGES and page != "overview":
            return render_template("404.html"), 404
        return render_template("index.html", view=page)

    @app.route("/login")
    def login_page():
        if session.get("user"):
            return redirect("/")
        return render_template("auth.html", mode="login", next=request.args.get("next", "/"))

    @app.route("/register")
    def register_page():
        if session.get("user"):
            return redirect("/")
        return render_template("auth.html", mode="register", next=request.args.get("next", "/"))

    @app.errorhandler(404)
    def handle_not_found(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "NOT_FOUND", "message": "API endpoint not found."}), 404
        return render_template("404.html"), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "METHOD_NOT_ALLOWED", "message": "This method is not supported for the endpoint."}), 405
        return error

    @app.errorhandler(413)
    def handle_payload_too_large(error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "PAYLOAD_TOO_LARGE", "message": "Request body exceeds the 2 MB limit."}), 413
        return error

    @app.errorhandler(500)
    def handle_internal_error(error):
        app.logger.exception("Unhandled server error", exc_info=error)
        if request.path.startswith("/api/"):
            return jsonify({"error": "INTERNAL_ERROR", "message": "The request could not be completed."}), 500
        return error

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; "
            "base-uri 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'")
        if request.path.startswith("/api/") or request.path in {"/login", "/register"}:
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.route("/health")
    def health_check():
        return jsonify({"status": "HEALTHY", "service": "DineIQ Analytics", "version": "1.0.0"})

    return app


if __name__ == "__main__":
    application = create_app()
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("DINEIQ_HOST", "127.0.0.1")
    application.run(host=host, port=port, debug=False)
