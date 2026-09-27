"""REST API for DineIQ analytics, model scoring, and account access."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from flask import Blueprint, Response, current_app, jsonify, request, session

from src.services.dashboard_service import get_dashboard_service
from src.services.data_management_service import DataManagementError, DataManagementService
from src.services.scoring_service import (BatchTooLarge, InvalidRecords,
                                          ModelsUnavailable, ScoringService)

LOGGER = logging.getLogger(__name__)
api_bp = Blueprint("api", __name__)
BASE_DIR = Path(__file__).resolve().parents[2]
AUTH_DB = BASE_DIR / "runtime" / "dineiq_auth.sqlite3"
ROLES = {"Data Analyst", "Restaurant Manager", "Regional Manager", "Administrator"}
OPEN_AUTH_ENDPOINTS = {"api.auth_signup", "api.auth_login", "api.auth_me", "api.auth_csrf", "api.get_status"}
scoring_service = ScoringService()
dashboard_service = get_dashboard_service()
data_management_service = DataManagementService()


def bootstrap_admin_from_environment() -> None:
    """Create the first administrator only when deployment credentials exist."""
    email = os.environ.get("DINEIQ_BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("DINEIQ_BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email and not password:
        return
    if (not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)
            or len(password) < 12):
        LOGGER.error("Bootstrap administrator credentials are invalid; admin was not created")
        return
    con = _auth_db()
    try:
        existing = con.execute("SELECT 1 FROM users WHERE role='Administrator' LIMIT 1").fetchone()
        if existing:
            return
        salt = secrets.token_hex(24)
        con.execute("INSERT INTO users(email,name,role,password_hash,salt,brand) VALUES(?,?,?,?,?,?)",
                    (email, "DineIQ Administrator", "Administrator",
                     _hash_password(password, salt), salt, "DineIQ"))
        con.commit()
    except sqlite3.IntegrityError:
        LOGGER.error("Bootstrap admin email already belongs to a non-administrator account")
    finally:
        con.close()


def _error(code: str, message: str, status: int):
    return jsonify({"error": code, "message": message}), status


def _auth_db() -> sqlite3.Connection:
    path = Path(current_app.config.get("AUTH_DB", AUTH_DB))
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("""CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        brand TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )""")
    con.execute("""CREATE TABLE IF NOT EXISTS audit_log (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        actor_email TEXT,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        record_count INTEGER,
        status TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}'
    )""")
    user_columns = {row["name"] for row in con.execute("PRAGMA table_info(users)").fetchall()}
    if "created_at" not in user_columns:
        con.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
        con.execute("UPDATE users SET created_at=CURRENT_TIMESTAMP WHERE created_at IS NULL")
    con.execute("CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at)")
    con.commit()
    return con


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                               salt.encode("utf-8"), 310_000).hex()


def _legacy_password_hash(password: str, salt: str) -> str:
    """Validate accounts created by the previous 180,000-round hash format."""
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                               salt.encode("utf-8"), 180_000).hex()


def _audit(action: str, *, record_count: int | None = None,
           status: str = "success", details: dict | None = None) -> None:
    user = session.get("user", {})
    try:
        con = _auth_db()
        con.execute(
            "INSERT INTO audit_log(created_at,actor_email,actor_role,action,record_count,status,details_json) "
            "VALUES(?,?,?,?,?,?,?)",
            (datetime.now(timezone.utc).isoformat(), user.get("email"),
             user.get("role", "Anonymous"), action, record_count, status,
             json.dumps(details or {}, ensure_ascii=False, default=str)),
        )
        con.commit()
        con.close()
    except sqlite3.Error:
        # Audit database failures are logged without exposing request payloads.
        LOGGER.exception("Could not persist audit event %s", action)


def _authorized(*roles: str):
    if current_app.testing or not current_app.config.get("AUTH_REQUIRED", True):
        return None
    user = session.get("user")
    if not user:
        return _error("AUTHENTICATION_REQUIRED", "Sign in to use this service.", 401)
    if roles and user.get("role") not in roles:
        return _error("FORBIDDEN", "Your account does not have permission for this action.", 403)
    return None


@api_bp.before_request
def require_sign_in():
    if request.endpoint in OPEN_AUTH_ENDPOINTS:
        return None
    denied = _authorized()
    if denied:
        return denied
    if request.method in {"POST", "PATCH", "PUT", "DELETE"} and not current_app.testing:
        expected = session.get("csrf_token")
        supplied = request.headers.get("X-CSRF-Token", "")
        if not expected or not secrets.compare_digest(expected, supplied):
            return _error("CSRF_FAILED", "Refresh the page and try the request again.", 403)
    return None


@api_bp.errorhandler(InvalidRecords)
def invalid_filter(error):
    return _error("INVALID_FILTER", str(error), 400)


@api_bp.errorhandler(DataManagementError)
def data_management_error(error):
    return _error(error.code, str(error), error.status)


def _int_arg(name: str, default: int, minimum: int = 1, maximum: int = 100) -> int:
    raw = request.args.get(name)
    if raw in (None, ""):
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise InvalidRecords(f"Query parameter {name} must be an integer")
    if value < minimum or value > maximum:
        raise InvalidRecords(f"Query parameter {name} must be between {minimum} and {maximum}")
    return value


def _service_call(function, *args, **kwargs):
    try:
        return jsonify(function(*args, **kwargs))
    except (TypeError, ValueError) as exc:
        return _error("INVALID_FILTER", str(exc), 400)
    except Exception:
        LOGGER.exception("Dashboard request failed: %s", request.path)
        return _error("INTERNAL_ERROR", "The analytics request could not be completed.", 500)


def _requested_task(payload: dict, default: str | None = None) -> str:
    task = payload.get("task", default)
    aliases = {"order_value": "high_value_order", "churn": "customer_churn"}
    return aliases.get(task, task) if isinstance(task, str) else ""


def _run_prediction(task: str):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("INVALID_RECORDS", "Request body must be a JSON object.", 400)
    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return _error("INVALID_RECORDS", "Provide a non-empty records array.", 400)
    try:
        result = scoring_service.predict_ensemble(task, records)
    except BatchTooLarge as exc:
        _audit("prediction", record_count=len(records), status="rejected",
               details={"task": task, "reason": "batch_too_large"})
        return _error("BATCH_TOO_LARGE", str(exc), 400)
    except InvalidRecords as exc:
        _audit("prediction", record_count=len(records), status="rejected",
               details={"task": task, "reason": "invalid_records"})
        return _error("INVALID_RECORDS", str(exc), 400)
    except ModelsUnavailable as exc:
        _audit("prediction", record_count=len(records), status="unavailable",
               details={"task": task})
        return _error("MODELS_UNAVAILABLE", str(exc), 503)
    except Exception:
        LOGGER.exception("Prediction failed for task %s", task)
        _audit("prediction", record_count=len(records), status="failed",
               details={"task": task})
        return _error("INTERNAL_ERROR", "Prediction could not be completed.", 500)

    _audit("prediction", record_count=len(records),
           details={"task": result["task"], "ensemble_version": result["ensemble_version"],
                    "latency_ms": result["latency_ms"]})
    return jsonify(result)


@api_bp.route("/auth/signup", methods=["POST"])
def auth_signup():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("INVALID_REQUEST", "Request body must be a JSON object.", 400)
    first = str(payload.get("first_name", "")).strip()
    last = str(payload.get("last_name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    brand = str(payload.get("brand", "")).strip()
    if (not first or not last or len(first) > 80 or len(last) > 80
            or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email)
            or len(email) > 254 or len(password) < 12 or len(password) > 1024
            or not brand or len(brand) > 120):
        return _error("INVALID_REQUEST", "Enter a valid name, work email, brand, and password of at least 12 characters.", 400)

    # Public self-registration cannot choose a privileged role.
    name, role = f"{first} {last}", "Data Analyst"
    salt = secrets.token_hex(24)
    con = _auth_db()
    try:
        con.execute("INSERT INTO users(email,name,role,password_hash,salt,brand) VALUES(?,?,?,?,?,?)",
                    (email, name, role, _hash_password(password, salt), salt, brand))
        con.commit()
    except sqlite3.IntegrityError:
        return _error("ACCOUNT_EXISTS", "An account with this email already exists.", 409)
    finally:
        con.close()
    session.clear()
    session["user"] = {"name": name, "role": role, "email": email, "brand": brand}
    session["csrf_token"] = secrets.token_urlsafe(32)
    session.permanent = True
    _audit("account_signup")
    return jsonify(session["user"]), 201


@api_bp.route("/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("INVALID_REQUEST", "Request body must be a JSON object.", 400)
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    con = _auth_db()
    row = con.execute("SELECT name,role,email,brand,password_hash,salt FROM users WHERE email=?",
                      (email,)).fetchone()
    con.close()
    if not row:
        return _error("INVALID_CREDENTIALS", "Invalid email or password.", 401)
    current_hash = _hash_password(password, row["salt"])
    valid_password = secrets.compare_digest(current_hash, row["password_hash"])
    legacy_password = False
    if not valid_password:
        legacy_password = secrets.compare_digest(_legacy_password_hash(password, row["salt"]),
                                                 row["password_hash"])
    if not valid_password and not legacy_password:
        return _error("INVALID_CREDENTIALS", "Invalid email or password.", 401)
    if legacy_password:
        con = _auth_db()
        con.execute("UPDATE users SET password_hash=? WHERE email=?", (current_hash, row["email"]))
        con.commit()
        con.close()
    session.clear()
    session["user"] = {"name": row["name"], "role": row["role"],
                        "email": row["email"], "brand": row["brand"]}
    session["csrf_token"] = secrets.token_urlsafe(32)
    session.permanent = True
    _audit("account_login")
    return jsonify(session["user"])


@api_bp.route("/auth/logout", methods=["POST"])
def auth_logout():
    _audit("account_logout")
    session.clear()
    return jsonify({"status": "signed_out"})


@api_bp.route("/auth/me", methods=["GET"])
def auth_me():
    user = session.get("user")
    if not user:
        return _error("AUTHENTICATION_REQUIRED", "Sign in to use this service.", 401)
    return jsonify(user)


@api_bp.route("/auth/csrf", methods=["GET"])
def auth_csrf():
    if not session.get("user"):
        return _error("AUTHENTICATION_REQUIRED", "Sign in to use this service.", 401)
    if not session.get("csrf_token"):
        session["csrf_token"] = secrets.token_urlsafe(32)
    return jsonify({"csrf_token": session["csrf_token"]})


@api_bp.route("/auth/users", methods=["GET"])
def list_users():
    denied = _authorized("Administrator")
    if denied:
        return denied
    con = _auth_db()
    rows = con.execute("SELECT email,name,role,brand,created_at FROM users ORDER BY name").fetchall()
    con.close()
    return jsonify({"users": [dict(row) for row in rows]})


@api_bp.route("/auth/users/<path:email>/role", methods=["PATCH"])
def update_user_role(email):
    denied = _authorized("Administrator")
    if denied:
        return denied
    payload = request.get_json(silent=True)
    role = payload.get("role") if isinstance(payload, dict) else None
    if role not in ROLES:
        return _error("INVALID_ROLE", "Choose a supported account role.", 400)
    con = _auth_db()
    try:
        con.execute("BEGIN IMMEDIATE")
        target = email.strip().lower()
        target_row = con.execute("SELECT role FROM users WHERE email=?", (target,)).fetchone()
        if target_row and target_row["role"] == "Administrator" and role != "Administrator":
            admins = con.execute("SELECT COUNT(*) FROM users WHERE role='Administrator'").fetchone()[0]
            if admins <= 1:
                con.rollback()
                return _error("LAST_ADMIN", "At least one administrator account must remain.", 409)
        cursor = con.execute("UPDATE users SET role=? WHERE email=?", (role, target))
        con.commit()
    finally:
        con.close()
    if not cursor.rowcount:
        return _error("NOT_FOUND", "User account was not found.", 404)
    _audit("user_role_update", details={"target_email": email.strip().lower(), "role": role})
    return jsonify({"email": email.strip().lower(), "role": role})


@api_bp.route("/audit", methods=["GET"])
def get_audit_log():
    denied = _authorized("Administrator")
    if denied:
        return denied
    limit = _int_arg("limit", 100, 1, 500)
    con = _auth_db()
    rows = con.execute("SELECT audit_id,created_at,actor_email,actor_role,action,record_count,status,details_json "
                       "FROM audit_log ORDER BY audit_id DESC LIMIT ?", (limit,)).fetchall()
    con.close()
    result = []
    for row in rows:
        item = dict(row)
        item["details"] = json.loads(item.pop("details_json") or "{}")
        result.append(item)
    return jsonify({"items": result, "count": len(result)})


@api_bp.route("/admin/data/resources", methods=["GET"])
def get_data_resources():
    return jsonify({"resources": data_management_service.resources()})


@api_bp.route("/admin/data/<resource>", methods=["GET", "POST"])
def manage_data_resource(resource):
    if request.method == "GET":
        page = _int_arg("page", 1, 1, 100000)
        page_size = _int_arg("page_size", 25, 1, 100)
        result = data_management_service.list(resource, page=page, page_size=page_size,
                                              query=request.args.get("q", ""))
        return jsonify(result)
    denied = _authorized("Administrator")
    if denied:
        return denied
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("INVALID_RECORD", "Request body must be a JSON object.", 400)
    record = data_management_service.create(resource, payload)
    _audit("data_record_create", details={"resource": resource,
                                           "record_id": record.get(data_management_service.resource_definition(resource)["primary_key"])})
    return jsonify(record), 201


@api_bp.route("/admin/data/<resource>/<path:record_id>", methods=["GET", "PATCH", "DELETE"])
def manage_data_record(resource, record_id):
    if request.method == "GET":
        return jsonify(data_management_service.get(resource, record_id))
    denied = _authorized("Administrator")
    if denied:
        return denied
    if request.method == "DELETE":
        data_management_service.delete(resource, record_id)
        _audit("data_record_delete", details={"resource": resource, "record_id": record_id})
        return jsonify({"status": "deleted"})
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("INVALID_RECORD", "Request body must be a JSON object.", 400)
    record = data_management_service.update(resource, record_id, payload)
    _audit("data_record_update", details={"resource": resource, "record_id": record_id})
    return jsonify(record)


@api_bp.route("/status", methods=["GET"])
def get_status():
    pipeline = dashboard_service.pipeline_status()
    dual = pipeline.get("dual_pipeline") or {}
    ensemble = pipeline.get("ensemble") or {}
    loaded = scoring_service.status()
    high_value_ready = loaded.get("high_value_order", {}).get("big_data") and loaded.get("high_value_order", {}).get("python")
    churn_ready = loaded.get("customer_churn", {}).get("big_data") and loaded.get("customer_churn", {}).get("python")
    healthy = bool(pipeline.get("data_status") == "ok" and ensemble.get("pass") is True
                   and high_value_ready and churn_ready)
    return jsonify({
        "status": "OPERATIONAL" if healthy else "DEGRADED",
        "pipeline_version": "1.0.0",
        "engine": " + ".join(dict.fromkeys(
            [v.engine for v in scoring_service._models.values() if v.engine])) or "unavailable",
        "dual_pipeline_agreement": (f"{dual['agreement']:.1f}%" if dual.get("agreement") is not None else "unavailable"),
        "nfr_latency_ms": ensemble.get("max_ms"),
        "nfr_pass": ensemble.get("pass"),
        "models": loaded,
    })


@api_bp.route("/predict/tasks", methods=["GET"])
def get_prediction_tasks():
    return jsonify({"tasks": scoring_service.task_specs()})


@api_bp.route("/predict/ensemble", methods=["POST"])
def predict_ensemble():
    payload = request.get_json(silent=True)
    task = _requested_task(payload, "high_value_order") if isinstance(payload, dict) else ""
    return _run_prediction(task)


@api_bp.route("/predict/order-value", methods=["POST"])
def predict_order_value():
    return _run_prediction("high_value_order")


@api_bp.route("/predict/churn", methods=["POST"])
def predict_churn():
    return _run_prediction("customer_churn")


@api_bp.route("/models", methods=["GET"])
def get_models():
    return jsonify(dashboard_service.models_info())


@api_bp.route("/pipeline/status", methods=["GET"])
def get_pipeline_status():
    return jsonify(dashboard_service.pipeline_status())


@api_bp.route("/dashboard/meta", methods=["GET"])
def get_dashboard_meta():
    return _service_call(dashboard_service.meta)


@api_bp.route("/dashboard/overview", methods=["GET"])
def get_overview():
    return _service_call(dashboard_service.overview,
                         request.args.get("location_id"),
                         request.args.get("date", request.args.get("date_str")))


@api_bp.route("/dashboard/revenue-series", methods=["GET"])
def get_revenue_series():
    return _service_call(dashboard_service.revenue_series,
                         request.args.get("range", "week"),
                         request.args.get("location_id"),
                         request.args.get("date", request.args.get("date_str")))


@api_bp.route("/dashboard/orders", methods=["GET"])
def get_orders():
    try:
        return jsonify(dashboard_service.orders_list(
            location_id=request.args.get("location_id"), q=request.args.get("q", ""),
            status=request.args.get("status", ""), channel=request.args.get("channel", ""),
            payment=request.args.get("payment", ""),
            date_from=request.args.get("date_from", request.args.get("from")),
            date_to=request.args.get("date_to", request.args.get("to")),
            sort=request.args.get("sort", "recent"), page=_int_arg("page", 1, 1, 1_000_000),
            page_size=_int_arg("page_size", 12, 1, 100)))
    except (TypeError, ValueError) as exc:
        return _error("INVALID_FILTER", str(exc), 400)


@api_bp.route("/dashboard/orders/<int:order_id>", methods=["GET"])
def get_order(order_id):
    result = dashboard_service.order_detail(order_id)
    if result is None:
        return _error("NOT_FOUND", "Order was not found.", 404)
    return jsonify(result)


@api_bp.route("/dashboard/dishes", methods=["GET"])
def get_dishes():
    try:
        return jsonify(dashboard_service.dishes(
            range_key=request.args.get("range", "all"),
            location_id=request.args.get("location_id"),
            date_str=request.args.get("date", request.args.get("date_str")),
            limit=_int_arg("limit", 100, 1, 1000), q=request.args.get("q", "")))
    except (TypeError, ValueError) as exc:
        return _error("INVALID_FILTER", str(exc), 400)


@api_bp.route("/dashboard/menu-intelligence", methods=["GET"])
def get_menu_intelligence():
    return _service_call(dashboard_service.menu_intelligence)


def _read_analytics_csv(name: str, limit: int = 1000) -> list[dict]:
    # `name` comes only from route-owned constants, never from a request path.
    path = BASE_DIR / "processed_data" / "analytics" / name
    if not path.is_file():
        return []
    frame = pd.read_csv(path, nrows=limit, low_memory=False)
    frame = frame.astype(object).where(pd.notna(frame), None)
    return frame.to_dict(orient="records")


@api_bp.route("/dashboard/market-basket", methods=["GET"])
def get_market_basket():
    rows = _read_analytics_csv("market_basket_pairs.csv", _int_arg("limit", 500, 1, 5000))
    names = {}
    for row in _read_analytics_csv("menu_business_classes.csv", 1000):
        names[str(row.get("menu_item_id"))] = row.get("item_name")
    for row in rows:
        row["item_a_name"] = row.get("item_a_name") or names.get(str(row.get("item_a")), str(row.get("item_a")))
        row["item_b_name"] = row.get("item_b_name") or names.get(str(row.get("item_b")), str(row.get("item_b")))
    return jsonify({"items": rows, "data_status": "ok" if rows else "empty",
                    "source": "processed_data/analytics/market_basket_pairs.csv"})


@api_bp.route("/dashboard/pricing", methods=["GET"])
def get_pricing():
    limit = _int_arg("limit", 500, 1, 5000)
    rows = _read_analytics_csv("price_sensitivity_analysis.csv", limit)
    q = request.args.get("q", "").strip().lower()
    if q:
        rows = [row for row in rows if q in str(row.get("item_name", "")).lower()]
    return jsonify({"items": rows, "data_status": "ok" if rows else "empty",
                    "source": "processed_data/analytics/price_sensitivity_analysis.csv"})


@api_bp.route("/dashboard/forecast", methods=["GET"])
def get_forecast():
    horizon = _int_arg("horizon", 90, 1, 365)
    points = _read_analytics_csv("daily_forecast.csv", 5000)[:horizon]
    evaluation = _read_analytics_csv("forecast_evaluation.csv", 100)
    return jsonify({"points": points, "evaluation": evaluation, "horizon": horizon,
                    "data_status": "ok" if points else "empty",
                    "source": "processed_data/analytics/daily_forecast.csv"})


@api_bp.route("/dashboard/anomalies", methods=["GET"])
def get_anomalies():
    limit = _int_arg("limit", 250, 1, 5000)
    all_rows = _read_analytics_csv("anomaly_detection.csv", 5000)
    ratings = [row for row in all_rows if str(row.get("anomaly_type", "")).startswith("rating_")]
    sales = [row for row in all_rows if not str(row.get("anomaly_type", "")).startswith("rating_")]
    # Preserve the overall limit while making both anomaly families visible.
    sales = sales[:limit]
    ratings = ratings[:limit]
    return jsonify({"sales": sales, "ratings": ratings,
                    "count": len(sales) + len(ratings),
                    "data_status": "ok" if sales or ratings else "empty",
                    "source": "processed_data/analytics/anomaly_detection.csv"})


@api_bp.route("/dashboard/scenarios", methods=["GET"])
def get_scenario_evidence():
    rows = _read_analytics_csv("what_if_analysis.csv", 1000)
    return jsonify({"items": rows, "data_status": "ok" if rows else "empty"})


@api_bp.route("/dashboard/inventory", methods=["GET"])
def get_inventory():
    return _service_call(dashboard_service.inventory_intelligence)


@api_bp.route("/dashboard/customers", methods=["GET"])
def get_customers():
    try:
        return jsonify(dashboard_service.customers_page(
            q=request.args.get("q", ""), risk=request.args.get("risk", ""),
            page=_int_arg("page", 1, 1, 1_000_000),
            page_size=_int_arg("page_size", 12, 1, 100)))
    except (TypeError, ValueError) as exc:
        return _error("INVALID_FILTER", str(exc), 400)


@api_bp.route("/dashboard/promotions", methods=["GET"])
def get_promotions():
    return _service_call(dashboard_service.promotions_page, request.args.get("filter", ""))


@api_bp.route("/dashboard/payments", methods=["GET"])
def get_payments():
    return _service_call(dashboard_service.payments_summary,
                         request.args.get("location_id"), request.args.get("range", "month"),
                         request.args.get("date", request.args.get("date_str")))


@api_bp.route("/dashboard/transactions", methods=["GET"])
def get_transactions():
    try:
        return jsonify(dashboard_service.transactions(
            location_id=request.args.get("location_id"), method=request.args.get("method", ""),
            status=request.args.get("status", ""), q=request.args.get("q", ""),
            page=_int_arg("page", 1, 1, 1_000_000), page_size=_int_arg("page_size", 12, 1, 100),
            range_key=request.args.get("range", "all")))
    except (TypeError, ValueError) as exc:
        return _error("INVALID_FILTER", str(exc), 400)


@api_bp.route("/dashboard/channels", methods=["GET"])
def get_channels():
    return _service_call(dashboard_service.channels_summary)


@api_bp.route("/dashboard/locations", methods=["GET"])
def get_locations():
    return _service_call(dashboard_service.locations_summary)


@api_bp.route("/dashboard/peak-hours", methods=["GET"])
def get_peak_hours():
    return _service_call(dashboard_service.peak_hours)


@api_bp.route("/dashboard/alerts", methods=["GET"])
def get_alerts():
    return _service_call(dashboard_service.alerts)


@api_bp.route("/dashboard/search", methods=["GET"])
def dashboard_search():
    return _service_call(dashboard_service.search, request.args.get("q", ""))


@api_bp.route("/dashboard/recommendations", methods=["GET"])
def get_recommendations():
    return _service_call(dashboard_service.recommendations)


@api_bp.route("/dashboard/reports", methods=["GET"])
def get_reports():
    return _service_call(dashboard_service.reports_catalog)


@api_bp.route("/dashboard/reload", methods=["POST"])
def reload_dashboard():
    denied = _authorized("Administrator")
    if denied:
        return denied
    try:
        dashboard_service.ensure_loaded(force=True)
        _audit("dashboard_reload")
        return jsonify({"status": "reloaded", "meta": dashboard_service.meta()})
    except Exception:
        LOGGER.exception("Dashboard source reload failed")
        _audit("dashboard_reload", status="failed")
        return _error("INTERNAL_ERROR", "The analytics data could not be reloaded.", 500)


@api_bp.route("/dashboard/what-if", methods=["POST"])
def what_if():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error("INVALID_REQUEST", "Request body must be a JSON object.", 400)
    scenario = payload.get("scenario", "demand_change")
    allowed_scenarios = {"price_change", "discount_change", "demand_change", "wastage_change", "remove_item"}
    if scenario not in allowed_scenarios:
        return _error("INVALID_SCENARIO", "Choose a supported what-if scenario.", 400)
    try:
        change = float(payload.get("change_percent", 0))
        if not pd.notna(change) or not -100 <= change <= 300:
            raise ValueError
    except (TypeError, ValueError):
        return _error("INVALID_SCENARIO", "change_percent must be between -100 and 300.", 400)

    dashboard_service.ensure_loaded()
    item_id = payload.get("menu_item_id")
    if scenario == "remove_item" and item_id in (None, ""):
        return _error("INVALID_SCENARIO", "Select a menu item to estimate its removal.", 400)
    frame = dashboard_service.items
    if item_id not in (None, ""):
        try:
            frame = frame[frame["menu_item_id"].astype(str) == str(int(item_id))]
        except (TypeError, ValueError):
            return _error("INVALID_SCENARIO", "menu_item_id must be an integer.", 400)
    if frame.empty:
        return _error("NOT_FOUND", "No matching menu item data was found.", 404)
    base_revenue = float(pd.to_numeric(frame["net_revenue"], errors="coerce").fillna(0).sum())
    base_contribution = float(pd.to_numeric(frame["contribution"], errors="coerce").fillna(0).sum())
    base_units = float(pd.to_numeric(frame["quantity"], errors="coerce").fillna(0).sum())
    waste_rows = _read_analytics_csv("wastage_risk_analysis.csv", 5000)
    if item_id not in (None, ""):
        waste_rows = [row for row in waste_rows if str(row.get("menu_item_id")) == str(int(item_id))]
    base_waste_cost = sum(float(row.get("wastage_cost") or 0) for row in waste_rows)
    rate = change / 100.0
    if scenario == "remove_item":
        revenue_factor = contribution_factor = demand_factor = 0.0
    elif scenario in {"demand_change", "wastage_change"}:
        demand_factor = max(0.0, 1.0 + rate) if scenario == "demand_change" else 1.0
        revenue_factor = demand_factor
        contribution_factor = demand_factor
    elif scenario == "price_change":
        # Without causal elasticity evidence, hold demand constant and expose
        # that assumption instead of inventing a demand response.
        revenue_factor = 1.0 + rate
        contribution_factor = (base_revenue * revenue_factor - (base_revenue - base_contribution)) / max(base_contribution, 1e-9)
        demand_factor = 1.0
    else:  # discount change
        revenue_factor = max(0.0, 1.0 - rate)
        contribution_factor = (base_revenue * revenue_factor - (base_revenue - base_contribution)) / max(base_contribution, 1e-9)
        demand_factor = 1.0

    estimated = {
        "revenue": round(base_revenue * revenue_factor, 2),
        "contribution": round(base_contribution * contribution_factor, 2),
        "demand_units": round(base_units * demand_factor, 2),
    }
    if scenario == "wastage_change":
        # Positive change means more wastage; negative change means a reduction.
        estimated["revenue"] = round(base_revenue, 2)
        estimated["contribution"] = round(base_contribution - base_waste_cost * rate, 2)
        estimated["demand_units"] = round(base_units, 2)
    result = {
        "scenario": scenario,
        "menu_item_id": int(item_id) if item_id not in (None, "") else None,
        "is_estimate": True,
        "change_percent": change,
        "baseline": {"revenue": round(base_revenue, 2), "contribution": round(base_contribution, 2), "demand_units": round(base_units, 2)},
        "estimated": estimated,
        "baseline_wastage_cost": round(base_waste_cost, 2),
        "impact": {key: round(estimated[key] - result_value, 2)
                   for key, result_value in {"revenue": base_revenue, "contribution": base_contribution,
                                             "demand_units": base_units}.items()},
        "assumptions": ["Scenario is an estimate, not actual performance.",
                        "Historical quantities and costs are held constant unless changed directly.",
                        "Demand response to price or discount changes is not estimated without validated elasticity evidence."],
    }
    _audit("what_if_scenario", record_count=int(len(frame)),
           details={"scenario": scenario, "menu_item_id": result["menu_item_id"]})
    return jsonify(result)


@api_bp.route("/dashboard/export", methods=["GET"])
def export_dashboard_data():
    dataset = request.args.get("dataset", "").strip().lower()
    location_id = request.args.get("location_id")
    page_size = _int_arg("limit", 100, 1, 25_000)
    try:
        if dataset == "orders":
            dashboard_service.ensure_loaded()
            rows = dashboard_service._orders_payload(dashboard_service._filter_orders(
                location_id=location_id,
                date_from=request.args.get("date_from"), date_to=request.args.get("date_to"))
                .head(page_size), include_items=True)
        elif dataset == "menu":
            rows = dashboard_service.dishes(range_key=request.args.get("range", "all"),
                                            location_id=location_id, limit=page_size,
                                            q=request.args.get("q", ""))["items"]
        elif dataset == "customers":
            rows = dashboard_service.customers_page(risk=request.args.get("risk", ""),
                                                    page=1, page_size=min(page_size, 100))["items"]
        elif dataset == "promotions":
            rows = dashboard_service.promotions_page(request.args.get("filter", ""))["items"][:page_size]
        elif dataset == "locations":
            rows = dashboard_service.locations_summary()["rows"][:page_size]
        elif dataset == "recommendations":
            rows = dashboard_service.recommendations()["items"][:page_size]
        elif dataset == "market_basket":
            rows = dashboard_service.menu_intelligence()["combos"][:page_size]
        elif dataset == "comparison":
            rows = dashboard_service.pipeline_status().get("dual_pipeline", {}).get("rows", [])[:page_size]
        elif dataset == "quality":
            rows = dashboard_service.reports_catalog()["quality"][:page_size]
        else:
            return _error("INVALID_EXPORT", "Choose orders, menu, customers, promotions, locations, recommendations, market_basket, comparison, or quality.", 400)
    except Exception:
        LOGGER.exception("Export failed for dataset %s", dataset)
        _audit("data_export", status="failed", details={"dataset": dataset})
        return _error("INTERNAL_ERROR", "The requested export could not be generated.", 500)

    fields = list(dict.fromkeys(key for row in rows for key in row.keys())) if rows else []
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    if fields:
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else value
                             for key, value in row.items()})
    filename = f"dineiq_{dataset}_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.csv"
    _audit("data_export", record_count=len(rows), details={"dataset": dataset, "filename": filename})
    return Response(output.getvalue(), mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"',
                             "X-Content-Type-Options": "nosniff"})


@api_bp.route("/analytics/menu-classes", methods=["GET"])
def get_menu_classes():
    return jsonify(dashboard_service.menu_intelligence()["classes"])


@api_bp.route("/analytics/recommendations", methods=["GET"])
def get_legacy_recommendations():
    return jsonify(dashboard_service.recommendations()["items"])
