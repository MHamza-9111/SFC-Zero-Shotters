"""
Processing (integration + core analytics) tests.

Verifies:
  - the expected core analytical datasets are produced
  - revenue analytics use COMPLETED orders only
  - promotion flags are internally consistent
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

CORE_OUTPUTS = [
    "menu_enriched.csv",
    "orders_processed.csv",
    "order_items_integrated.csv",
    "orders_integrated.csv",
    "customer_analytics.csv",
    "menu_item_performance.csv",
    "restaurant_performance.csv",
    "daily_sales.csv",
    "monthly_sales.csv",
    "channel_analysis.csv",
    "time_pattern_analysis.csv",
    "wastage_integrated.csv",
    "wastage_item_analysis.csv",
    "ratings_integrated.csv",
    "rating_item_analysis.csv",
    "inventory_integrated.csv",
    "pricing_analysis.csv",
    "promotion_usage.csv",
]


def _read(d: Path, name: str) -> pd.DataFrame:
    return pd.read_csv(d / name, low_memory=False)


def test_core_outputs_exist(pipeline):
    out = pipeline["analytics"]
    for name in CORE_OUTPUTS:
        assert (out / name).exists(), f"missing core output: {name}"


def test_revenue_analytics_use_completed_orders_only(pipeline):
    proc = pipeline["processed"]
    out = pipeline["analytics"]

    orders = _read(out, "orders_processed.csv")
    orders["order_date"] = pd.to_datetime(orders["order_date"])

    daily = _read(out, "daily_sales.csv")
    daily["order_date"] = pd.to_datetime(daily["order_date"])

    # Recompute daily completed sales from the processed orders and
    # compare with the published daily_sales figures.
    completed = orders[orders["is_completed"]]
    expected = (
        completed.groupby("order_date")["total_amount"].sum().sort_index()
    )

    # Every published day must match the completed-only recomputation.
    merged = daily.set_index("order_date").loc[expected.index]
    diff = (merged["total_sales"] - expected).abs()
    assert (diff < 0.05).all(), (
        "daily_sales includes non-completed orders or has wrong totals"
    )

    # Cancelled orders must exist in orders_processed but contribute
    # nothing to daily sales. A day whose ONLY orders are cancelled
    # must not appear in daily_sales.
    cancelled = orders[~orders["is_completed"]]
    assert len(cancelled) > 0, "no cancelled orders in processed data"
    published = set(daily["order_date"].dt.date)
    all_days_with_cancelled_only = set()
    order_day_status = orders.groupby("order_date")["order_status"].agg(
        lambda s: set(s.unique())
    )
    for day, statuses in order_day_status.items():
        if statuses == {"Cancelled"}:
            all_days_with_cancelled_only.add(day)
    assert not (all_days_with_cancelled_only & published), (
        "a day with only cancelled orders appears in daily_sales"
    )


def test_promo_flags_consistent(pipeline):
    out = pipeline["analytics"]
    orders = _read(out, "orders_processed.csv")

    pid = orders["promotion_id"].fillna("").astype(str)
    assert ((orders["is_promo_order"] == (pid != "")).all()), (
        "is_promo_order disagrees with promotion_id"
    )
    # At least some promo orders and some non-promo orders must exist.
    assert orders["is_promo_order"].sum() > 0
    assert (~orders["is_promo_order"]).sum() > 0


def test_orders_integrated_row_count(pipeline):
    out = pipeline["analytics"]
    orders = _read(out, "orders_processed.csv")
    integrated = _read(out, "orders_integrated.csv")
    assert len(integrated) == len(orders)
