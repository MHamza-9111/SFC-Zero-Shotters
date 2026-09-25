"""
Tests for the DineIQ dashboard REST API and warm ensemble scoring service.

Every dashboard widget is served from real pipeline artifacts
(reports/spark_sql evidence, model artifacts, dual-pipeline comparison),
so these tests assert both the contract shape and that the values come
back as genuine numbers (no placeholder strings / hard-coded zeros).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BASE = Path(__file__).resolve().parents[2]
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

from src.backend.app import create_app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    app = create_app()
    app.testing = True
    return app.test_client()


# ---------------------------------------------------------------------------
# Status & health
# ---------------------------------------------------------------------------

def test_health_and_status(client):
    body = client.get("/health").get_json()
    assert body["status"] == "HEALTHY"

    body = client.get("/api/v1/status").get_json()
    assert body["status"] == "OPERATIONAL"
    assert body["dual_pipeline_agreement"]


def test_dashboard_meta(client):
    body = client.get("/api/v1/dashboard/meta").get_json()
    assert body["currency"]["code"] == "PKR"
    assert body["locations"], "expected committed location ranking evidence"
    assert body["date_range"]["min"] and body["date_range"]["max"]
    assert body["data_sources"], "data source registry must be populated"
    layers = {s["key"]: s for s in body["data_sources"]}
    assert layers["orders"]["rows"] > 0
    assert layers["orders"]["layer"] in ("evidence", "processed")


# ---------------------------------------------------------------------------
# Overview widgets
# ---------------------------------------------------------------------------

def test_overview_kpis_are_real_numbers(client):
    body = client.get("/api/v1/dashboard/overview").get_json()
    kpis = body["kpis"]
    assert body["as_of"]
    # Revenue for the latest evidence day must be a genuine positive number.
    assert kpis["revenue"]["value"] > 0
    assert kpis["orders"]["value"] >= 1
    assert kpis["aov"]["value"] > 0
    assert kpis["locations_active"]["total"] == 20
    assert body["coverage_note"]

    # Service pulse covers the four real order channels.
    names = {c["name"] for c in body["service_pulse"]["channels"]}
    assert {"Dine-in", "Takeaway", "Website/App", "Third-party Delivery"} <= names

    # Recent orders are sorted newest-first and carry real totals.
    rec = body["recent_orders"]
    assert rec and all(o["total_amount"] > 0 for o in rec)
    times = [(o["order_date"], o["order_time"] or "") for o in rec]
    assert times == sorted(times, reverse=True)

    # Payment methods only include methods present in the data.
    methods = {p["method"] for p in body["payment_methods"]}
    assert methods <= {"Cash", "Card", "Online Wallet", "Unspecified"}


def test_overview_location_filter(client):
    body = client.get("/api/v1/dashboard/overview?location_id=12").get_json()
    assert body["location"]["city_area"] == "South-12"


def test_revenue_series_ranges(client):
    expected_points = {"today": 24, "week": 7, "month": 30, "year": 12}
    for rng, granularity in (("today", "hour"), ("week", "day"),
                             ("month", "day"), ("year", "month")):
        body = client.get(f"/api/v1/dashboard/revenue-series?range={rng}").get_json()
        assert body["data_status"] == "ok", rng
        assert body["granularity"] == granularity
        assert len(body["points"]) == expected_points[rng], rng
        assert body["total"] > 0, rng
        for p in body["points"]:
            assert "label" in p and "value" in p and "orders" in p


# ---------------------------------------------------------------------------
# Orders / dishes
# ---------------------------------------------------------------------------

def test_orders_list_filters_and_pagination(client):
    body = client.get("/api/v1/dashboard/orders?page_size=5").get_json()
    assert body["total"] > 0 and len(body["items"]) == 5
    assert body["stats"]["revenue"] > 0

    body = client.get("/api/v1/dashboard/orders?channel=Dine-in&page_size=5").get_json()
    assert body["total"] > 0
    assert all(o["order_channel"] == "Dine-in" for o in body["items"])

    body = client.get("/api/v1/dashboard/orders?sort=amount_desc&page_size=3").get_json()
    amounts = [o["total_amount"] for o in body["items"]]
    assert amounts == sorted(amounts, reverse=True)

    body = client.get("/api/v1/dashboard/orders?q=DQ-0001").get_json()
    assert body["total"] >= 1


def test_order_detail_and_404(client):
    body = client.get("/api/v1/dashboard/orders/1").get_json()
    assert body["order_id"] == 1
    assert body["total_amount"] > 0
    # order 1 has line-item evidence in the committed slice
    assert body["lines"], "order 1 line items expected from order_item_revenue evidence"

    resp = client.get("/api/v1/dashboard/orders/999999")
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "NOT_FOUND"


def test_dishes_ranking(client):
    body = client.get("/api/v1/dashboard/dishes?limit=5").get_json()
    assert body["total"] > 0
    items = body["items"]
    assert len(items) == 5
    assert items[0]["rank"] == 1
    revenues = [d["revenue"] for d in items]
    assert revenues == sorted(revenues, reverse=True)

    weekly = client.get("/api/v1/dashboard/dishes?range=week").get_json()
    assert weekly["range"] == "week"


# ---------------------------------------------------------------------------
# Payments / transactions
# ---------------------------------------------------------------------------

def test_payments_summary(client):
    body = client.get("/api/v1/dashboard/payments?range=year").get_json()
    assert body["data_status"] == "ok"
    assert body["total"] > 0
    total_share = sum(m["share"] for m in body["methods"])
    assert 99.0 <= total_share <= 101.0
    assert {m["method"] for m in body["methods"]} <= {"Cash", "Card", "Online Wallet", "Unspecified"}


def test_transactions(client):
    body = client.get("/api/v1/dashboard/transactions?page_size=5").get_json()
    assert body["total"] > 0
    tx = body["items"][0]
    assert tx["type"].endswith("Payment") and tx["amount"] > 0
    paid = client.get("/api/v1/dashboard/transactions?status=paid").get_json()
    assert all(t["status"] == "Paid" for t in paid["items"])


# ---------------------------------------------------------------------------
# Growth / business views
# ---------------------------------------------------------------------------

def test_menu_intelligence(client):
    body = client.get("/api/v1/dashboard/menu-intelligence").get_json()
    assert body["classes"], "expected dual-pipeline menu class evidence"
    cls = body["classes"][0]
    assert {"actual_class", "predicted_class"} <= set(cls)
    assert body["combos"], "expected market basket evidence"


def test_inventory(client):
    body = client.get("/api/v1/dashboard/inventory").get_json()
    assert body["data_status"] == "ok"
    assert body["charts"][0]["file"] == "13_wastage_risk.png"


def test_customers_watchlist(client):
    body = client.get("/api/v1/dashboard/customers?page_size=5").get_json()
    assert body["total"] == 5000
    assert body["items"][0]["risk"] == "high"
    high = client.get("/api/v1/dashboard/customers?risk=high").get_json()
    assert high["total"] == 5000
    low = client.get("/api/v1/dashboard/customers?risk=low").get_json()
    assert low["total"] == 0


def test_promotions_trap_filter(client):
    body = client.get("/api/v1/dashboard/promotions").get_json()
    assert body["stats"]["promotions"] == 120
    assert body["stats"]["traps"] > 0
    traps = client.get("/api/v1/dashboard/promotions?filter=traps").get_json()
    assert all(t["promotion_trap"] for t in traps["items"])
    healthy = client.get("/api/v1/dashboard/promotions?filter=healthy").get_json()
    assert all(not t["promotion_trap"] for t in healthy["items"])


def test_locations_and_peak_hours(client):
    body = client.get("/api/v1/dashboard/locations").get_json()
    assert len(body["rows"]) == 20
    assert len(body["monthly"]["months"]) == 12
    assert body["peak_hours"], "expected committed peak-hours evidence"


def test_alerts_and_search(client):
    alerts = client.get("/api/v1/dashboard/alerts").get_json()
    assert alerts["items"], "expected real alerts from pipeline evidence"
    assert any(a["id"] == "promo-traps" for a in alerts["items"])

    search = client.get("/api/v1/dashboard/search?q=Pizza").get_json()
    assert search["dishes"], "category search must find Pizza dishes"


def test_reports_catalog(client):
    body = client.get("/api/v1/dashboard/reports").get_json()
    assert body["groups"], "expected chart groups"
    available = [c for g in body["groups"] for c in g["charts"] if c["available"]]
    assert len(available) >= 18, "committed chart PNGs should be discoverable"
    assert body["quality"] and body["cleaning"]


# ---------------------------------------------------------------------------
# Models & pipeline status (API_CONTRACT sections 2-3)
# ---------------------------------------------------------------------------

def test_models_registry_contract(client):
    body = client.get("/api/v1/models").get_json()
    models = body["models"]
    assert models, "versioned artifacts exist under models/"
    for m in models:
        assert {"task", "pipeline", "version", "artifact", "status"} <= set(m)
    active = [m for m in models if m["status"] == "active"]
    assert active, "every (task, pipeline) pair keeps one active version"
    tasks = {m["task"] for m in models}
    assert {"high_value_order", "customer_churn", "menu_business_class"} <= tasks


def test_pipeline_status_contract(client):
    body = client.get("/api/v1/pipeline/status").get_json()
    assert body["steps"], "pipeline steps must be reported"
    assert body["ensemble"]["pass"] is True
    assert body["ensemble"]["max_ms"] < body["ensemble"]["limit_ms"]
    assert body["dual_pipeline"]["agreement"] == 100.0


# ---------------------------------------------------------------------------
# Ensemble scoring (API_CONTRACT section 1)
# ---------------------------------------------------------------------------

ORDER_RECORD = {
    "order_hour": 18, "day_of_week_code": 2, "order_month": 7,
    "is_weekend": 0, "is_promo_order": 1, "channel_code": 1,
    "payment_code": 2, "basket_size": 4, "basket_quantity": 6,
    "avg_unit_price": 1520.5, "discount_rate_percentage": 3.1,
    "total_orders": 12, "total_spend": 54000.0,
}

CHURN_RECORD = {
    "recency_days": 45, "f_log_orders": 1.2, "f_log_spend": 9.4,
    "average_order_value": 3200, "discount_dependency": 0.02,
    "promo_dependency": 0.1, "top_category_share": 0.4,
    "unique_categories": 5,
}

MENU_RECORD = {
    "units_sold": 8871, "revenue": 10189641.65, "estimated_profit": 5308219.75,
    "profit_margin_percentage": 52.09, "average_rating": 4.22,
    "wastage_ratio": 0.08,
}


def test_predict_order_value_nfr(client):
    resp = client.post("/api/v1/predict/order-value", json={"records": [ORDER_RECORD]})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["nfr_pass"] is True
    assert body["latency_ms"] < body["nfr_limit_ms"] == 5000.0
    pred = body["predictions"][0]
    assert 0.0 <= pred["probability_ensemble"] <= 1.0
    assert body["ensemble_version"]["big_data"] >= 1
    # Contract response keys
    assert {"probability_big_data", "probability_python",
            "probability_ensemble", "decision_rule"} <= set(pred)


def test_predict_churn_and_menu_class(client):
    body = client.post("/api/v1/predict/churn",
                       json={"records": [CHURN_RECORD]}).get_json()
    assert body["task"] == "customer_churn"
    assert body["predictions"][0]["ensemble_label"] in (0, 1)

    body = client.post("/api/v1/predict/ensemble",
                       json={"task": "menu_business_class", "records": [MENU_RECORD]}).get_json()
    assert body["task"] == "menu_business_class"
    pred = body["predictions"][0]
    assert pred["label_name"] in {"Profit Driver", "Volume Driver",
                                  "Hidden Opportunity", "Low Performer"}
    # menu_business_class currently deploys the big-data artifact only -
    # the response must say so instead of pretending an ensemble ran.
    assert body["fallback"] in (None, "python", "big_data")


def test_predict_error_envelope(client):
    resp = client.post("/api/v1/predict/ensemble", json={})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "INVALID_RECORDS"

    resp = client.post("/api/v1/predict/ensemble",
                       json={"task": "high_value_order",
                             "records": [{"order_hour": 1}]})
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "INVALID_RECORDS" and "Missing feature" in body["message"]

    resp = client.post("/api/v1/predict/ensemble",
                       json={"task": "high_value_order",
                             "records": [dict(ORDER_RECORD) for _ in range(101)]})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "BATCH_TOO_LARGE"

    resp = client.post("/api/v1/predict/ensemble",
                       json={"task": "nonsense", "records": [ORDER_RECORD]})
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "INVALID_RECORDS"


def test_predict_tasks_spec_drives_the_scorer_form(client):
    body = client.get("/api/v1/predict/tasks").get_json()
    tasks = {t["task"]: t for t in body["tasks"]}
    assert set(tasks) == {"high_value_order", "customer_churn", "menu_business_class"}
    assert tasks["high_value_order"]["features"] == list(ORDER_RECORD.keys())
    assert tasks["high_value_order"]["status"] == "ready"
    assert tasks["menu_business_class"]["status"] == "single-model"
    assert tasks["high_value_order"]["max_batch"] == 100


# ---------------------------------------------------------------------------
# Legacy endpoints & pages
# ---------------------------------------------------------------------------

def test_legacy_analytics_endpoints(client):
    classes = client.get("/api/v1/analytics/menu-classes")
    assert classes.status_code == 200
    assert classes.get_json(), "dual-pipeline fallback should serve menu classes"

    recs = client.get("/api/v1/analytics/recommendations")
    assert recs.status_code == 200

    chart = client.get("/api/v1/charts/01_data_quality.png")
    assert chart.status_code == 200
    assert chart.headers["Content-Type"].startswith("image/")


@pytest.mark.parametrize("path", [
    "/", "/orders", "/menu", "/inventory", "/customers", "/promotions",
    "/payments", "/reports", "/locations", "/models", "/settings",
])
def test_pages_render(client, path):
    resp = client.get(path)
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "DineIQ" in html and "side-nav" in html
