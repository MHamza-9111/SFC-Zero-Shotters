"""
Tests for the DineIQ dashboard REST API and warm ensemble scoring service.

Every dashboard widget is served from real pipeline artifacts
(reports/spark_sql evidence, model artifacts, dual-pipeline comparison),
so these tests assert both the contract shape and that the values come
back as genuine numbers (no placeholder strings / hard-coded zeros).
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import pandas as pd
import pytest

BASE = Path(__file__).resolve().parents[2]
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

from src.backend.app import create_app
from src.services import dashboard_service
from src.services.dashboard_service import DashboardService


@pytest.fixture(scope="module")
def client():
    app = create_app()
    app.testing = True
    app.config["AUTH_REQUIRED"] = False
    return app.test_client()






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






def test_overview_kpis_are_real_numbers(client):
    body = client.get("/api/v1/dashboard/overview").get_json()
    kpis = body["kpis"]
    assert body["as_of"]

    assert kpis["revenue"]["value"] > 0
    assert kpis["orders"]["value"] >= 1
    assert kpis["aov"]["value"] > 0
    assert kpis["locations_active"]["total"] == 20
    assert body["coverage_note"]


    names = {c["name"] for c in body["service_pulse"]["channels"]}
    assert {"Dine-in", "Takeaway", "Website/App", "Third-party Delivery"} <= names


    rec = body["recent_orders"]
    assert rec and all(o["total_amount"] > 0 for o in rec)
    times = [(o["order_date"], o["order_time"] or "") for o in rec]
    assert times == sorted(times, reverse=True)


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






def test_menu_intelligence(client):
    body = client.get("/api/v1/dashboard/menu-intelligence").get_json()
    assert body["classes"], "expected dual-pipeline menu class evidence"
    cls = body["classes"][0]
    assert {"actual_class", "predicted_class"} <= set(cls)
    assert body["combos"], "expected market basket evidence"


def test_inventory(client):
    body = client.get("/api/v1/dashboard/inventory").get_json()
    assert body["data_status"] == "ok"
    assert body["wastage_items"]


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
    assert len(body["visualizations"]) == 8
    assert all(".png" not in str(item).lower() for item in body["visualizations"])
    assert body["quality"] and body["cleaning"]






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






ORDER_RECORD = {
    "order_hour": 18, "day_of_week_code": 2, "order_month": 7,
    "is_weekend": 0, "is_promo_order": 1, "channel_code": 1,
    "payment_code": 2, "basket_size": 4, "basket_quantity": 6,
    "avg_unit_price": 1520.5, "discount_rate_percentage": 3.1,
    "total_orders": 12, "total_spend": 54000.0,
}

CHURN_RECORD = {



    "f_log_orders": 1.2, "f_log_spend": 9.4,
    "average_order_value": 3200, "discount_dependency": 0.02,
    "promo_dependency": 0.1, "top_category_share": 0.4,
    "unique_categories": 5, "total_items_purchased": 64,
    "weekend_order_share": 0.28,
}

MENU_RECORD = {



    "average_rating": 4.22, "rating_count": 3100, "wastage_ratio": 0.08,
    "avg_unit_price": 640.5, "promo_dependency": 0.12,
    "weekend_order_share": 0.38, "unique_customers": 1840,
    "order_line_count": 9600,
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
    assert body["fallback"] is None
    assert pred["decision_rule"] == "mean class probabilities"
    assert pred["probabilities_ensemble"] == pred["probabilities"]
    assert pred["probabilities_big_data"] is not None
    assert pred["probabilities_python"] is not None


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
    assert tasks["menu_business_class"]["status"] == "ready"
    assert tasks["high_value_order"]["max_batch"] == 100






def test_legacy_analytics_endpoints(client):
    classes = client.get("/api/v1/analytics/menu-classes")
    assert classes.status_code == 200
    assert classes.get_json(), "dual-pipeline fallback should serve menu classes"

    recs = client.get("/api/v1/analytics/recommendations")
    assert recs.status_code == 200

    chart = client.get("/api/v1/charts/01_data_quality.png")
    assert chart.status_code == 404


@pytest.mark.parametrize("path", [
    "/", "/home", "/orders", "/menu", "/inventory", "/customers", "/promotions",
    "/payments", "/reports", "/locations", "/models", "/settings",
    "/basket", "/price", "/forecast", "/peak", "/anomalies", "/whatif",
    "/recommendations", "/quality", "/team", "/billing", "/data",
])
def test_pages_render(client, path):
    resp = client.get(path)
    assert resp.status_code == 200
    html = resp.get_data(as_text=True)
    assert "DineIQ" in html and "side-nav" in html
    view = "overview" if path == "/" else path.strip("/")
    assert f'id="view-{view}"' in html
    assert 'id="theme-toggle"' in html
    if view == "settings":


        assert 'id="theme-segment"' in html
    assert "<img" not in html
    if view == "models":
        assert all(f'id="{element}"' in html for element in (
            "scorer-task", "scorer-form", "scorer-sample", "scorer-run", "scorer-result"))
    if view == "reports":
        assert 'id="report-revenue"' in html and 'id="report-peak"' in html














PROCESSED_ORDERS_COLUMNS = [
    "order_id", "customer_id", "restaurant_id", "order_date", "order_time",
    "order_status", "order_channel", "payment_method", "promotion_id",
    "subtotal", "discount_amount", "tax_amount", "delivery_fee",
    "total_amount", "is_completed", "is_promo_order", "order_year",
    "order_month", "order_month_name", "order_week", "order_day",
    "day_of_week", "is_weekend", "order_hour", "time_period",
    "discount_rate_percentage", "is_high_value_order",
]

CHANNELS = ["Dine-in", "Takeaway", "Website/App", "Third-party Delivery"]
PAYMENTS = ["Cash", "Card", "Online Wallet"]


def _write_processed_orders(path: Path, n_orders: int = 40) -> None:
    """orders_processed.csv exactly as the processing stage writes it."""
    rows = []
    for i in range(1, n_orders + 1):
        total = 1000.0 + i * 13.5
        rows.append({
            "order_id": i,
            "customer_id": (i % 17) + 1,
            "restaurant_id": (i % 5) + 1,
            "order_date": f"2025-06-{(i % 28) + 1:02d}",
            "order_time": f"{i % 24:02d}:15:00",
            "order_status": "Completed" if i % 7 else "Cancelled",
            "order_channel": CHANNELS[i % 4],
            "payment_method": PAYMENTS[i % 3],
            "promotion_id": "" if i % 3 else 12,
            "subtotal": round(total * 1.1, 2),
            "discount_amount": round(total * 0.1, 2),
            "tax_amount": round(total * 0.05, 2),
            "delivery_fee": 0.0,
            "total_amount": round(total, 2),
            "is_completed": i % 7 != 0,
            "is_promo_order": i % 3 == 0,
            "order_year": 2025,
            "order_month": 6,
            "order_month_name": "June",
            "order_week": 24,
            "order_day": (i % 28) + 1,
            "day_of_week": "Sunday",
            "is_weekend": False,
            "order_hour": i % 24,
            "time_period": "Dinner Peak",
            "discount_rate_percentage": 9.09,
            "is_high_value_order": i > n_orders - 5,
        })
    df = pd.DataFrame(rows)[PROCESSED_ORDERS_COLUMNS]
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)


def _write_processed_items(path: Path, n_lines: int = 120) -> None:
    """order_items_integrated.csv - this layer *does* carry the labels."""
    rows = []
    for i in range(1, n_lines + 1):
        oid = (i % 40) + 1
        rid = (oid % 5) + 1
        rows.append({
            "order_item_id": i, "order_id": oid, "menu_item_id": (i % 20) + 1,
            "quantity": (i % 3) + 1, "unit_price": 250.0 + (i % 9) * 40,
            "discount_amount": 0.0, "line_total": 250.0 + (i % 9) * 40,
            "restaurant_id": rid, "category_id": (i % 4) + 1,
            "item_name": f"Dish {i}", "base_price": 260.0, "cost_price": 110.0,
            "category_name": ["Pizza", "Burgers", "BBQ", "Desserts"][i % 4],
            "restaurant_name": f"Restaurant {rid}", "location_id": rid * 2,
            "restaurant_type": "Fast Food", "city_area": f"South-{rid * 2}",
            "gross_revenue": 250.0 + (i % 9) * 40, "estimated_cost": 110.0,
            "estimated_profit": 140.0, "estimated_margin_percentage": 56.0,
            "customer_id": (oid % 17) + 1,
            "order_date": f"2025-06-{(oid % 28) + 1:02d}",
            "order_status": "Completed" if oid % 7 else "Cancelled",
            "is_completed": oid % 7 != 0, "is_promo_order": oid % 3 == 0,
        })
    pd.DataFrame(rows).to_csv(path, index=False)


def _evidence_areas() -> dict[int, str]:
    """location_id -> city_area from the committed location ranking."""
    ranking = pd.read_csv(BASE / "reports/spark_sql/location_ranking.csv")
    return dict(zip(ranking["location_id"].astype(int), ranking["city_area"]))




FIXTURE_AREAS = sorted(_evidence_areas())[:5]
RESTAURANT_LOCATIONS = {rid: loc for rid, loc in enumerate(FIXTURE_AREAS, start=1)}


def _write_dimensions(base: Path) -> None:
    """The cleaned dimension tables the loader falls back on."""
    areas = _evidence_areas()
    pd.DataFrame({
        "restaurant_id": list(RESTAURANT_LOCATIONS),
        "restaurant_name": [f"Restaurant {rid}" for rid in RESTAURANT_LOCATIONS],
        "location_id": list(RESTAURANT_LOCATIONS.values()),
        "restaurant_type": ["Fast Food", "Pizza", "BBQ", "Grill", "Sandwich"],
    }).to_csv(base / "processed_data/restaurants.csv", index=False)
    pd.DataFrame({
        "location_id": list(RESTAURANT_LOCATIONS.values()),
        "city_area": [areas[loc] for loc in RESTAURANT_LOCATIONS.values()],
    }).to_csv(base / "processed_data/locations.csv", index=False)


def _copy_evidence(base: Path) -> None:
    """Committed Spark SQL evidence slice (CSVs only - charts stay put)."""
    src = BASE / "reports/spark_sql"
    dst = base / "reports/spark_sql"
    dst.mkdir(parents=True, exist_ok=True)
    for csv in sorted(src.glob("*.csv")):
        shutil.copy2(csv, dst / csv.name)


def _processed_base(tmp_path: Path, *, dims: bool, evidence: bool) -> Path:
    """Base directory shaped like a machine that ran the pipeline locally."""
    _write_processed_orders(tmp_path / "processed_data/analytics/orders_processed.csv")
    _write_processed_items(tmp_path / "processed_data/analytics/order_items_integrated.csv")
    if dims:
        _write_dimensions(tmp_path)
    if evidence:
        _copy_evidence(tmp_path)
    return tmp_path


def test_processed_orders_layer_has_no_location_labels(tmp_path):
    """Guard the premise of the regression tests below.

    ``process_dineiq_data.py`` writes ``orders_processed.csv`` straight after
    the date/flag derivations - it never merges the restaurant or location
    dimensions onto the orders frame (only onto items and customers), so the
    label columns are genuinely absent from that artifact.
    """
    orders = tmp_path / "processed_data/analytics/orders_processed.csv"
    _write_processed_orders(orders)
    cols = set(pd.read_csv(orders).columns)
    assert {"location_id", "city_area", "restaurant_name",
            "restaurant_type"}.isdisjoint(cols)

    source = (BASE / "python_pipeline/processing/process_dineiq_data.py").read_text(
        encoding="utf-8")
    start = source.index('# 3. Process orders')
    end = source.index('save(output_dir, orders, "orders_processed.csv")')
    assert ".merge(" not in source[start:end], \
        "the orders step must stay label-free or this regression suite is stale"


def test_orders_loader_backfills_labels_from_dimension_tables(tmp_path):
    base = _processed_base(tmp_path, dims=True, evidence=False)
    svc = DashboardService(base)
    svc.ensure_loaded()

    orders = svc.orders
    assert len(orders) == 40
    assert str(orders["location_id"].dtype) == "Int64"
    assert orders["location_id"].notna().all()
    assert not (orders["city_area"] == "").any()
    assert not (orders["restaurant_name"] == "").any()

    row = orders[orders["order_id"] == 1].iloc[0]
    expected_loc = RESTAURANT_LOCATIONS[2]
    assert int(row["restaurant_id"]) == 2
    assert int(row["location_id"]) == expected_loc
    assert row["city_area"] == _evidence_areas()[expected_loc]
    assert row["restaurant_name"] == "Restaurant 2"

    sources = {s["key"]: s for s in svc.meta()["data_sources"]}
    assert sources["orders"]["layer"] == "processed"
    assert sources["orders"]["rows"] == 40


def test_orders_loader_survives_missing_labels_entirely(tmp_path):
    """No dimension tables and no evidence: degrade, never 500."""
    base = _processed_base(tmp_path, dims=False, evidence=False)
    svc = DashboardService(base)
    svc.ensure_loaded()

    orders = svc.orders
    assert len(orders) == 40
    assert str(orders["location_id"].dtype) == "Int64"
    assert orders["location_id"].isna().all()
    assert (orders["city_area"] == "").all()
    overview = svc.overview()
    assert overview["data_status"] == "ok"
    assert overview["kpis"]["revenue"]["value"] > 0
    assert svc.alerts()["data_status"] in ("ok", "empty")


def test_orders_loader_falls_back_to_committed_evidence(tmp_path):
    base = _processed_base(tmp_path, dims=False, evidence=True)
    svc = DashboardService(base)
    svc.ensure_loaded()

    orders = svc.orders
    labelled = int((orders["city_area"] != "").sum())
    assert labelled > 0, "committed evidence should label the orders it sampled"
    assert labelled == int(orders["location_id"].notna().sum())


@pytest.fixture()
def processed_client(tmp_path, monkeypatch):
    """Flask test client wired to a processed-layer base directory."""
    base = _processed_base(tmp_path, dims=True, evidence=True)
    monkeypatch.setattr(dashboard_service, "_service", DashboardService(base))
    app = create_app()
    app.testing = True
    app.config["AUTH_REQUIRED"] = False
    return app.test_client()


@pytest.mark.parametrize("path", [
    "/api/v1/dashboard/meta",
    "/api/v1/dashboard/overview",
    "/api/v1/dashboard/revenue-series?range=week",
    "/api/v1/dashboard/dishes?limit=5",
    "/api/v1/dashboard/menu-intelligence",
    "/api/v1/dashboard/alerts",
    "/api/v1/dashboard/reports",
    "/api/v1/dashboard/payments?range=month",
    "/api/v1/dashboard/transactions?page=1&page_size=12",
    "/api/v1/dashboard/orders?page_size=5",
    "/api/v1/dashboard/locations",
    "/api/v1/status",
])
def test_processed_layer_serves_every_widget(processed_client, path):
    """Every endpoint that 500'd on a locally-run pipeline must serve 200."""
    resp = processed_client.get(path)
    assert resp.status_code == 200, f"{path} -> {resp.status_code}: {resp.get_data(as_text=True)[:400]}"


def test_processed_layer_overview_is_real(processed_client):
    body = processed_client.get("/api/v1/dashboard/overview").get_json()
    assert body["kpis"]["orders"]["value"] > 0
    assert body["kpis"]["revenue"]["value"] > 0

    area = _evidence_areas()[FIXTURE_AREAS[0]]
    filtered = processed_client.get(
        f"/api/v1/dashboard/overview?location_id={FIXTURE_AREAS[0]}").get_json()
    assert filtered["location"]["city_area"] == area
