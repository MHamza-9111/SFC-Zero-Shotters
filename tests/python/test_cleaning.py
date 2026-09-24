"""
Cleaning pipeline tests.

Verifies that after cleaning:
  - every processed dataset has a unique, non-null primary key
  - foreign-key relationships hold across processed datasets
  - injected problems are quarantined (not silently dropped)
  - processed row counts never exceed raw row counts
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

DATASETS = [
    ("locations.csv", "location_id"),
    ("restaurants.csv", "restaurant_id"),
    ("menu_categories.csv", "category_id"),
    ("menu_items.csv", "menu_item_id"),
    ("customers.csv", "customer_id"),
    ("orders.csv", "order_id"),
    ("order_items.csv", "order_item_id"),
    ("pricing_history.csv", "price_history_id"),
    ("promotions.csv", "promotion_id"),
    ("ratings.csv", "rating_id"),
    ("inventory.csv", "inventory_id"),
    ("wastage.csv", "wastage_id"),
]


def _read(d: Path, name: str) -> pd.DataFrame:
    return pd.read_csv(d / name, low_memory=False)


def test_primary_keys_unique_and_present(pipeline):
    proc = pipeline["processed"]
    for name, pk in DATASETS:
        df = _read(proc, name)
        assert df[pk].notna().all(), f"{name}: null primary keys"
        assert df[pk].is_unique, f"{name}: duplicate primary keys"


def test_foreign_keys_hold_after_cleaning(pipeline):
    proc = pipeline["processed"]
    od = _read(proc, "orders.csv")
    oi = _read(proc, "order_items.csv")
    mi = _read(proc, "menu_items.csv")
    cu = _read(proc, "customers.csv")
    rt = _read(proc, "restaurants.csv")
    ra = _read(proc, "ratings.csv")
    pr = _read(proc, "promotions.csv")

    # orders -> customers / restaurants
    assert od["customer_id"].isin(set(cu["customer_id"])).all()
    assert od["restaurant_id"].isin(set(rt["restaurant_id"])).all()

    # orders -> promotions
    # promotion_id comes back as float64; normalize to clean strings.
    od_pid = od["promotion_id"].apply(
        lambda x: "" if pd.isna(x) else str(int(x))
    )
    promo_ids = set(pr["promotion_id"].astype(str))
    assert od_pid[od_pid != ""].isin(promo_ids).all()

    # order items -> orders / menu
    assert oi["order_id"].isin(set(od["order_id"])).all()
    assert oi["menu_item_id"].isin(set(mi["menu_item_id"])).all()

    # order items restaurant consistency
    item_rest = mi.set_index("menu_item_id")["restaurant_id"]
    m = oi.merge(od[["order_id", "restaurant_id"]], on="order_id")
    assert (m["menu_item_id"].map(item_rest) == m["restaurant_id"]).all(), (
        "order items must come from the order's own restaurant"
    )

    # ratings -> orders, and rated item is in the order
    assert ra["order_id"].isin(set(od["order_id"])).all()
    order_customer = od.set_index("order_id")["customer_id"]
    ra_expected = ra["order_id"].map(order_customer)
    assert (ra["customer_id"] == ra_expected).all(), (
        "rater must be the customer of the rated order"
    )
    lines = oi.groupby("order_id")["menu_item_id"].apply(set).to_dict()
    for r in ra.itertuples():
        assert r.menu_item_id in lines.get(r.order_id, set()), (
            f"rating {r.rating_id} references an item not in order {r.order_id}"
        )


def test_processed_counts_never_exceed_raw(pipeline):
    raw = pipeline["raw"]
    proc = pipeline["processed"]
    for name, _ in DATASETS:
        raw_rows = len(_read(raw, name))
        proc_rows = len(_read(proc, name))
        assert proc_rows <= raw_rows, f"{name}: processed > raw"


def test_injected_problems_are_quarantined(pipeline):
    q = pipeline["quarantine"]

    # Out-of-period orders.
    oq = _read(q, "orders_quarantine.csv")
    reasons = oq["quarantine_reason"].astype(str)
    assert reasons.str.contains("outside analysis period").any(), (
        "out-of-period orders were not quarantined"
    )

    # Orphan / invalid ratings.
    rq = _read(q, "ratings_quarantine.csv")
    rr = rq["quarantine_reason"].astype(str)
    assert rr.str.contains("not part of the referenced order").any(), (
        "orphan ratings were not quarantined"
    )

    # Duplicate customers.
    cq = _read(q, "customers_quarantine.csv")
    cr = cq["quarantine_reason"].astype(str)
    assert cr.str.contains("Duplicate customer_id").any(), (
        "duplicate customers were not quarantined"
    )

    # Invalid order lines.
    iq = _read(q, "order_items_quarantine.csv")
    ir = iq["quarantine_reason"].astype(str)
    assert ir.str.contains("Invalid order item").any(), (
        "invalid order lines were not quarantined"
    )


def test_cleaning_log_records_fk_validation(pipeline):
    log = _read(pipeline["reports"], "cleaning_log.csv")
    actions = log["action"].astype(str)
    assert actions.str.startswith("fk_validation_").any(), (
        "no foreign-key validation was logged"
    )
