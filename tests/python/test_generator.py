"""
Generator integrity tests.

These verify the SRS relationship guarantees on the RAW generated
data, before cleaning:
  1. Order items only reference the order's own restaurant menu.
  2. Promotions referenced by orders are active at that restaurant
     on the order date (except deliberately out-of-period orders).
  3. Ratings reference an item actually present in the order.
  4. Pricing / inventory / wastage reference valid item-restaurant
     pairs.
"""

from __future__ import annotations

import pandas as pd
from pathlib import Path


def _read(raw: Path, name: str) -> pd.DataFrame:
    return pd.read_csv(raw / name, low_memory=False)


def test_scale_minimums_met(pipeline):
    counts = pipeline["counts"]
    cfg = pipeline  # medium scale
    assert counts["orders"] >= 20000
    assert counts["order_items"] >= 200000
    assert counts["customers"] >= 8000
    assert counts["menu_items"] == 150
    assert counts["ratings"] >= 20000
    assert counts["wastage"] >= 10000
    assert counts["restaurants"] == 20
    assert counts["locations"] == 20
    assert counts["categories"] == 10


def test_order_items_only_from_order_restaurant(pipeline):
    raw = pipeline["raw"]
    oi = _read(raw, "order_items.csv")
    od = _read(raw, "orders.csv")
    mi = _read(raw, "menu_items.csv")

    item_rest = mi.set_index("menu_item_id")["restaurant_id"]
    m = oi.merge(od[["order_id", "restaurant_id"]], on="order_id")
    line_rest = m["menu_item_id"].map(item_rest)

    mismatches = (line_rest != m["restaurant_id"]).sum()
    assert mismatches == 0, (
        f"{mismatches} order lines reference a menu item from a "
        f"different restaurant than the order"
    )


def test_promotions_valid_for_order_date_and_restaurant(pipeline):
    raw = pipeline["raw"]
    od = _read(raw, "orders.csv")
    pr = _read(raw, "promotions.csv")

    od = od.copy()
    od["order_date"] = pd.to_datetime(od["order_date"])
    od["pid"] = od["promotion_id"].apply(
        lambda x: "" if pd.isna(x) else str(int(x))
    )
    pr = pr.copy()
    pr["start_date"] = pd.to_datetime(pr["start_date"])
    pr["end_date"] = pd.to_datetime(pr["end_date"])
    pr["pid"] = pr["promotion_id"].astype(str)

    pmap = pr.set_index("pid")
    in_period = od["order_date"].between("2025-01-01", "2025-12-31")

    promo_orders = od[(od["pid"] != "") & in_period]
    assert len(promo_orders) > 0, "No promotion-linked orders generated"

    invalid = 0
    for r in promo_orders.itertuples():
        if r.pid not in pmap.index:
            invalid += 1
            continue
        p = pmap.loc[r.pid]
        if p["restaurant_id"] != r.restaurant_id:
            invalid += 1
        elif not (p["start_date"] <= r.order_date <= p["end_date"]):
            invalid += 1

    assert invalid == 0, f"{invalid} promo orders with invalid linkage"


def test_ratings_reference_items_in_their_order(pipeline):
    raw = pipeline["raw"]
    oi = _read(raw, "order_items.csv")
    ra = _read(raw, "ratings.csv")

    lines = oi.groupby("order_id")["menu_item_id"].apply(set).to_dict()

    orphan = 0
    for r in ra.itertuples():
        allowed = lines.get(r.order_id, set())
        if r.menu_item_id not in allowed:
            orphan += 1

    # Orphan ratings are an intentionally injected quality issue, so
    # the count must be small (a documented rate), not systematic.
    assert orphan < len(ra) * 0.05, (
        f"{orphan}/{len(ra)} ratings do not reference an item in the "
        f"order (only a small injected fraction is expected)"
    )
    # And the injected issue must actually be present.
    assert orphan > 0, "Injected orphan ratings are missing"


def test_inventory_wastage_pricing_reference_valid_pairs(pipeline):
    raw = pipeline["raw"]
    mi = _read(raw, "menu_items.csv")
    valid = set(zip(mi["menu_item_id"], mi["restaurant_id"]))

    for name in ["inventory.csv", "wastage.csv"]:
        df = _read(raw, name)
        bad = [
            (r.menu_item_id, r.restaurant_id)
            for r in df.itertuples()
            if (r.menu_item_id, r.restaurant_id) not in valid
        ]
        assert not bad, (
            f"{name}: {len(bad)} rows reference an item from another restaurant"
        )

    ph = _read(raw, "pricing_history.csv")
    item_ids = set(mi["menu_item_id"])
    bad = ph[~ph["menu_item_id"].isin(item_ids)]
    assert len(bad) == 0, "pricing history references unknown menu items"


def test_injected_quality_issues_present(pipeline):
    raw = pipeline["raw"]
    cu = _read(raw, "customers.csv")
    od = _read(raw, "orders.csv")
    oi = _read(raw, "order_items.csv")

    # Missing emails injected.
    missing_email = cu["email"].isna().sum() + (
        cu["email"].fillna("").astype(str).str.strip() == ""
    ).sum()
    assert missing_email > 0, "No missing-email customers injected"

    # Duplicate customer records injected.
    dup_customers = cu["customer_id"].duplicated().sum()
    assert dup_customers > 0, "No duplicate customer records injected"

    # Out-of-period orders injected.
    out_of_period = ~od["order_date"].astype(str).between("2025-01-01", "2025-12-31")
    assert out_of_period.sum() > 0, "No out-of-period orders injected"

    # Invalid order lines injected (zero qty or negative total).
    qty = pd.to_numeric(oi["quantity"], errors="coerce")
    total = pd.to_numeric(oi["line_total"], errors="coerce")
    invalid_lines = ((qty <= 0) | (total < 0)).sum()
    assert invalid_lines > 0, "No invalid order lines injected"
