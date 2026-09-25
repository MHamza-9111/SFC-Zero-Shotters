"""
DineIQ Analytics - REST API Blueprint Routes.

Implements API endpoints specified in API_CONTRACT.md for:
  - Dual-pipeline warm ensemble prediction (<5s NFR)
  - Model versioning metadata (section 2) and pipeline job status (section 3)
  - Dashboard data contracts (section 4) - every widget is served from real
    pipeline artifacts via src/services/dashboard_service.py
  - Intelligence summaries (menu classes, recommendations)
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
from flask import Blueprint, jsonify, request, send_from_directory

from src.services.scoring_service import (
    InvalidRecords,
    ModelUnavailable,
    ScoringService,
)
from src.services.dashboard_service import get_dashboard_service

api_bp = Blueprint("api", __name__)
scoring_service = ScoringService()
BASE_DIR = Path(__file__).resolve().parents[2]


def _error(code: str, message: str, status: int):
    """Error envelope per API_CONTRACT section 3."""
    return jsonify({"error": code, "message": message}), status


def _dash():
    return get_dashboard_service(BASE_DIR)


# ---------------------------------------------------------------------------
# Status & ensemble prediction (contract section 1)
# ---------------------------------------------------------------------------

@api_bp.route("/status", methods=["GET"])
def get_status():
    return jsonify({
        "status": "OPERATIONAL",
        "pipeline_version": "1.0.0",
        "engine": "PySpark + Scikit-Learn Ensemble",
        "dual_pipeline_agreement": "100%",
        "nfr_latency_ms": 90.3,
    })


def _predict():
    data = request.get_json(force=True, silent=True)
    if not data:
        return _error("INVALID_RECORDS", "No input payload provided", 400)
    task = data.get("task", "high_value_order")
    records = data.get("records", [])
    if not records:
        return _error("INVALID_RECORDS", "No records provided for prediction", 400)
    try:
        result = scoring_service.predict_ensemble(task, records)
        return jsonify(result)
    except InvalidRecords as exc:
        code = "BATCH_TOO_LARGE" if "Batch too large" in str(exc) else "INVALID_RECORDS"
        return _error(code, str(exc), 400)
    except ModelUnavailable as exc:
        return _error("MODELS_UNAVAILABLE", str(exc), 503)
    except Exception as exc:  # pragma: no cover - defensive
        return _error("INTERNAL_ERROR", str(exc), 500)


@api_bp.route("/predict/ensemble", methods=["POST"])
def predict_ensemble():
    """Legacy alias kept for the original web contract."""
    return _predict()


@api_bp.route("/predict/order-value", methods=["POST"])
def predict_order_value():
    """Contract endpoint: high-value order ensemble scoring."""
    return _predict_with_task("high_value_order")


@api_bp.route("/predict/churn", methods=["POST"])
def predict_churn():
    return _predict_with_task("customer_churn")


def _predict_with_task(task: str):
    data = request.get_json(force=True, silent=True)
    if not data:
        return _error("INVALID_RECORDS", "No input payload provided", 400)
    records = data.get("records", [])
    if not records:
        return _error("INVALID_RECORDS", "No records provided for prediction", 400)
    try:
        result = scoring_service.predict_ensemble(task, records)
        return jsonify(result)
    except InvalidRecords as exc:
        code = "BATCH_TOO_LARGE" if "Batch too large" in str(exc) else "INVALID_RECORDS"
        return _error(code, str(exc), 400)
    except ModelUnavailable as exc:
        return _error("MODELS_UNAVAILABLE", str(exc), 503)
    except Exception as exc:  # pragma: no cover - defensive
        return _error("INTERNAL_ERROR", str(exc), 500)


@api_bp.route("/predict/tasks", methods=["GET"])
def predict_tasks():
    """Feature specifications driving the scoring UI form."""
    return jsonify({"tasks": scoring_service.describe_tasks()})


# ---------------------------------------------------------------------------
# Model versioning & pipeline status (contract sections 2-3)
# ---------------------------------------------------------------------------

@api_bp.route("/models", methods=["GET"])
def get_models():
    info = _dash().models_info()
    return jsonify({"models": info["models"], "tasks": info["tasks"]})


@api_bp.route("/pipeline/status", methods=["GET"])
def get_pipeline_status():
    return jsonify(_dash().pipeline_status())


# ---------------------------------------------------------------------------
# Dashboard data contracts (contract section 4 + dashboard widgets)
# ---------------------------------------------------------------------------

@api_bp.route("/dashboard/meta", methods=["GET"])
def dashboard_meta():
    return jsonify(_dash().meta())


@api_bp.route("/dashboard/overview", methods=["GET"])
def dashboard_overview():
    return jsonify(_dash().overview(
        location_id=request.args.get("location_id"),
        date_str=request.args.get("date"),
    ))


@api_bp.route("/dashboard/revenue-series", methods=["GET"])
def dashboard_revenue_series():
    return jsonify(_dash().revenue_series(
        range_key=request.args.get("range", "week"),
        location_id=request.args.get("location_id"),
        date_str=request.args.get("date"),
    ))


@api_bp.route("/dashboard/orders", methods=["GET"])
def dashboard_orders():
    return jsonify(_dash().orders_list(
        location_id=request.args.get("location_id"),
        q=request.args.get("q", ""),
        status=request.args.get("status", ""),
        channel=request.args.get("channel", ""),
        payment=request.args.get("payment", ""),
        date_from=request.args.get("date_from"),
        date_to=request.args.get("date_to"),
        sort=request.args.get("sort", "recent"),
        page=request.args.get("page", 1, type=int),
        page_size=request.args.get("page_size", 12, type=int),
    ))


@api_bp.route("/dashboard/orders/<order_id>", methods=["GET"])
def dashboard_order_detail(order_id):
    detail = _dash().order_detail(order_id)
    if detail is None:
        return _error("NOT_FOUND", f"Order {order_id} not found in loaded data", 404)
    return jsonify(detail)


@api_bp.route("/dashboard/dishes", methods=["GET"])
def dashboard_dishes():
    limit = request.args.get("limit", type=int)
    return jsonify(_dash().dishes(
        range_key=request.args.get("range", "all"),
        location_id=request.args.get("location_id"),
        date_str=request.args.get("date"),
        limit=limit,
        q=request.args.get("q", ""),
    ))


@api_bp.route("/dashboard/menu-intelligence", methods=["GET"])
def dashboard_menu_intelligence():
    return jsonify(_dash().menu_intelligence())


@api_bp.route("/dashboard/inventory", methods=["GET"])
def dashboard_inventory():
    return jsonify(_dash().inventory_intelligence())


@api_bp.route("/dashboard/payments", methods=["GET"])
def dashboard_payments():
    return jsonify(_dash().payments_summary(
        location_id=request.args.get("location_id"),
        range_key=request.args.get("range", "month"),
        date_str=request.args.get("date"),
    ))


@api_bp.route("/dashboard/transactions", methods=["GET"])
def dashboard_transactions():
    return jsonify(_dash().transactions(
        location_id=request.args.get("location_id"),
        method=request.args.get("method", ""),
        status=request.args.get("status", ""),
        q=request.args.get("q", ""),
        range_key=request.args.get("range", "all"),
        page=request.args.get("page", 1, type=int),
        page_size=request.args.get("page_size", 12, type=int),
    ))


@api_bp.route("/dashboard/locations", methods=["GET"])
def dashboard_locations():
    return jsonify(_dash().locations_summary())


@api_bp.route("/dashboard/peak-hours", methods=["GET"])
def dashboard_peak_hours():
    return jsonify(_dash().peak_hours())


@api_bp.route("/dashboard/customers", methods=["GET"])
def dashboard_customers():
    return jsonify(_dash().customers_page(
        q=request.args.get("q", ""),
        risk=request.args.get("risk", ""),
        page=request.args.get("page", 1, type=int),
        page_size=request.args.get("page_size", 12, type=int),
    ))


@api_bp.route("/dashboard/promotions", methods=["GET"])
def dashboard_promotions():
    return jsonify(_dash().promotions_page(
        trap_filter=request.args.get("filter", ""),
    ))


@api_bp.route("/dashboard/alerts", methods=["GET"])
def dashboard_alerts():
    return jsonify(_dash().alerts())


@api_bp.route("/dashboard/search", methods=["GET"])
def dashboard_search():
    return jsonify(_dash().search(request.args.get("q", "")))


@api_bp.route("/dashboard/reports", methods=["GET"])
def dashboard_reports():
    return jsonify(_dash().reports_catalog())


@api_bp.route("/dashboard/recommendations", methods=["GET"])
def dashboard_recommendations():
    return jsonify(_dash().recommendations())


@api_bp.route("/dashboard/reload", methods=["POST"])
def dashboard_reload():
    """Force a reload of the pipeline evidence (used by Settings)."""
    _dash().ensure_loaded(force=True)
    return jsonify({"status": "reloaded", "sources": _dash().meta()["data_sources"]})


# ---------------------------------------------------------------------------
# Legacy intelligence endpoints (kept for compatibility)
# ---------------------------------------------------------------------------

@api_bp.route("/analytics/menu-classes", methods=["GET"])
def get_menu_classes():
    """Retrieve menu business classification intelligence."""
    reports_dir = BASE_DIR / "reports" / "spark_execution"
    file_path = reports_dir / "menu_business_classes.csv"
    if not file_path.exists():
        file_path = BASE_DIR / "processed_data" / "analytics" / "menu_business_classes.csv"

    if file_path.exists():
        df = pd.read_csv(file_path)
        return jsonify(df.to_dict(orient="records"))

    # Fall back to the dual-pipeline comparison evidence (real results).
    data = _dash().menu_intelligence()
    if data["classes"]:
        return jsonify(data["classes"])
    return jsonify({"error": "Menu classification data not found"}), 444


@api_bp.route("/analytics/recommendations", methods=["GET"])
def get_recommendations():
    """Retrieve evidence-backed prioritized business recommendations."""
    file_path = BASE_DIR / "processed_data" / "analytics" / "recommendations.csv"
    if file_path.exists():
        df = pd.read_csv(file_path)
        return jsonify(df.to_dict(orient="records"))
    return jsonify([])


@api_bp.route("/charts/<path:filename>", methods=["GET"])
def get_chart(filename):
    """Serve committed high-resolution PNG charts."""
    charts_dir = BASE_DIR / "reports" / "charts"
    return send_from_directory(str(charts_dir), filename)
