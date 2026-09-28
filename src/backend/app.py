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
                            refresh_session_user, scoring_service)
from src.runtime import writable_dir

BASE_DIR = PROJECT_ROOT
PAGES = {
    "orders", "menu", "inventory", "customers", "promotions", "payments",
    "reports", "locations", "models", "settings", "basket", "price",
    "forecast", "peak", "anomalies", "whatif", "recommendations", "quality",
    "channels", "home",
    "team", "billing", "data",
}

NAV_GROUPS = (
    ("Home", (("home", "My dashboard", "home"),)),
    ("Operations", (
        ("orders", "Orders", "receipt"), ("inventory", "Wastage & stock", "box"),
        ("payments", "Payments", "wallet"), ("promotions", "Promotions", "tag"),
        ("locations", "Locations", "pin"), ("data", "Data management", "doc"),
    )),
    ("Intelligence", (
        ("overview", "Executive dashboard", "grid"), ("menu", "Menu intelligence", "menu-book"),
        ("channels", "Channels", "globe"), ("customers", "Customers", "users"),
        ("basket", "Market basket", "bag"), ("price", "Price intelligence", "trend"),
        ("forecast", "Demand forecast", "chart"), ("peak", "Peak periods", "clock"),
        ("anomalies", "Anomalies", "alert"),
    )),
    ("Models & simulation", (
        ("models", "Models & serving", "cpu"), ("whatif", "What-if scenarios", "sliders"),
        ("recommendations", "Recommendations", "spark"),
    )),
    ("Action & governance", (
        ("quality", "Data quality", "shield"), ("reports", "Reports", "doc"),
        ("team", "Team & access", "users"),
    )),
    ("Workspace", (("billing", "Usage", "chart"), ("settings", "Settings", "check"))),
)

ROLE_PAGES = {
    "Administrator": frozenset({"home", "overview", *PAGES}),
    "Regional Manager": frozenset({
        "home", "overview", "locations", "promotions", "menu", "channels", "customers", "basket",
        "price", "forecast", "peak", "anomalies", "whatif", "recommendations", "reports",
    }),
    "Restaurant Manager": frozenset({
        "home", "orders", "inventory", "payments", "promotions", "menu", "customers", "forecast",
        "peak", "recommendations",
    }),
    "Data Analyst": frozenset({
        "home", "menu", "channels", "customers", "basket", "price", "forecast", "peak", "anomalies",
        "models", "whatif", "recommendations", "quality", "reports", "data",
    }),
}

ROLE_INFO = {
    "Administrator": {
        "eyebrow": "Administration", "title": "Workspace command center",
        "blurb": "Review account access, audit activity, and the health of the analytics platform.",
    },
    "Regional Manager": {
        "eyebrow": "Regional performance", "title": "Regional operations dashboard",
        "blurb": "Compare locations, sales channels, and signals that need regional attention.",
    },
    "Restaurant Manager": {
        "eyebrow": "Restaurant operations", "title": "Restaurant operations dashboard",
        "blurb": "Track the sales, orders, best sellers, and payment mix for your selected location.",
    },
    "Data Analyst": {
        "eyebrow": "Analytics workspace", "title": "Analytics workbench",
        "blurb": "Monitor forecast quality, anomalies, models, and data-pipeline health.",
    },
}


def _role_navigation(role: str) -> list[tuple[str, list[tuple[str, str, str, str]]]]:
    """Return only the routes that belong in this role's navigation."""
    allowed = ROLE_PAGES.get(role, ROLE_PAGES["Data Analyst"])
    result = []
    for group, items in NAV_GROUPS:
        visible = []
        for view, label, icon in items:
            if view in allowed:
                visible.append((view, label, icon, "/" if view == "overview" else f"/{view}"))
        if visible:
            result.append((group, visible))
    return result


def _secret_key() -> str:
    configured = os.environ.get("DINEIQ_SECRET_KEY")
    if configured:
        return configured
    runtime = Path(os.environ.get("DINEIQ_RUNTIME_DIR", BASE_DIR / "runtime"))
    runtime = writable_dir(runtime)
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
        AUTH_DB=os.environ.get("DINEIQ_AUTH_DB", str(
            writable_dir(BASE_DIR / "runtime") / "dineiq_auth.sqlite3")),
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


    try:
        scoring_service.warm()
    except Exception:
        app.logger.exception("Model warm-up failed; scoring endpoints will report unavailable")

    @app.before_request
    def protect_pages():
        if (not app.config["AUTH_REQUIRED"]
                or request.path.startswith("/api/")
                or request.path in {"/health", "/login", "/register", "/"}
                or request.path.startswith("/static/")):
            return None
        if not refresh_session_user():
            next_path = request.full_path if request.full_path else "/"
            return redirect(url_for("login_page", next=next_path))
        return None

    @app.route("/", defaults={"page": "overview"})
    @app.route("/<page>")
    def dashboard_page(page: str):
        if page not in PAGES and page != "overview":
            return render_template("404.html"), 404


        if (request.path == "/" and app.config["AUTH_REQUIRED"]
                and not refresh_session_user()):
            return render_template("landing.html")
        user = refresh_session_user() if app.config["AUTH_REQUIRED"] else None
        role = (user or {}).get("role", "Administrator")
        if role not in ROLE_PAGES:
            role = "Data Analyst"
        if request.path == "/" and user:
            return redirect(url_for("dashboard_page", page="home"))
        if page not in ROLE_PAGES[role]:
            return redirect(url_for("dashboard_page", page="home"))
        name = (user or {}).get("name", "").strip()
        return render_template(
            "app.html", view=page, current_role=role,
            current_first_name=name.split()[0] if name else "",
            role_info=ROLE_INFO[role], navigation=_role_navigation(role),
        )

    @app.route("/login")
    def login_page():
        if session.get("user"):
            return redirect("/home")
        return render_template("auth.html", mode="login", next=request.args.get("next", "/home"))

    @app.route("/register")
    def register_page():
        if session.get("user"):
            return redirect("/home")
        return render_template("auth.html", mode="register", next=request.args.get("next", "/home"))

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
            "base-uri 'self'; frame-ancestors 'none'; form-action 'self'; "
            "script-src 'self'; style-src 'self' 'unsafe-inline'")
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
