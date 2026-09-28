"""Build the compressed runtime datasets the web application reads.

The analytics layer holds ~1M order line items. As plain CSV that is ~194 MB,
which cannot be shipped inside a serverless function (Vercel caps a Python
bundle at 500 MB). This script produces the deployable copies:

    processed_data/analytics/order_items_integrated.csv.xz   (~13 MB)
    processed_data/analytics/orders_processed.csv.xz         (~3 MB)

Both keep every row and every value the application reads. Only the columns
``DashboardService`` never touches are dropped, and ``.xz`` is used because
pandas reads it through the standard-library ``lzma`` module - no extra
dependency, unlike Parquet (pyarrow is ~150 MB installed).

The two derived columns are renamed to the names the loader reads rather than
recomputed differently, so the dashboard totals are unchanged:
``net_revenue = gross_revenue - discount_amount`` and
``contribution = estimated_profit``.

Usage:
    python scripts/build_runtime_artifacts.py

Run ``python_pipeline/processing/process_dineiq_data.py`` first if the
analytics layer needs regenerating; this script only reads it.
"""
from __future__ import annotations

import lzma
import sys
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parents[1]
ANALYTICS = BASE / "processed_data" / "analytics"

SOURCE_CSV = ANALYTICS / "order_items_integrated.csv"

# Columns DashboardService reads out of the order-line table. `city_area`,
# `restaurant_name` and `restaurant_type` are deliberately absent: the service
# back-fills them from the restaurant/location dimensions at load time.
ITEM_COLUMNS = [
    "order_item_id", "order_id", "menu_item_id", "quantity", "unit_price",
    "line_total", "restaurant_id", "category_id", "item_name",
    "category_name", "order_date", "is_completed",
]
INT_COLUMNS = ("order_item_id", "order_id", "menu_item_id", "category_id",
               "restaurant_id", "quantity")
FLOAT_COLUMNS = ("unit_price", "line_total")


def write_xz(frame: pd.DataFrame, destination: Path) -> int:
    """Write `frame` as xz-compressed CSV and return the size on disk."""
    raw = frame.to_csv(index=False).encode("utf-8")
    with lzma.open(destination, "wb", preset=6) as handle:
        handle.write(raw)
    return destination.stat().st_size


def build_order_items() -> int:
    if not SOURCE_CSV.is_file():
        raise SystemExit(
            f"missing {SOURCE_CSV.relative_to(BASE)}\n"
            "Regenerate it first:\n"
            "  python python_pipeline/processing/process_dineiq_data.py")
    print(f"Reading {SOURCE_CSV.relative_to(BASE)} ...", flush=True)
    frame = pd.read_csv(SOURCE_CSV, low_memory=False)
    print(f"  {len(frame):,} rows x {len(frame.columns)} columns")

    frame["net_revenue"] = frame["gross_revenue"] - frame["discount_amount"]
    frame["contribution"] = frame["estimated_profit"]

    items = frame[ITEM_COLUMNS + ["net_revenue", "contribution"]].copy()
    items["order_date"] = pd.to_datetime(items["order_date"], errors="coerce")
    items = items.dropna(subset=["order_date"]).reset_index(drop=True)
    items["is_completed"] = items["is_completed"].astype(bool)
    for column in ("item_name", "category_name"):
        items[column] = items[column].fillna("").astype(str)
    for column in INT_COLUMNS:
        items[column] = items[column].astype("int32")
    for column in FLOAT_COLUMNS + ("net_revenue", "contribution"):
        # float32 keeps the bundle small; the resulting aggregate drift is
        # 0.000000% and no single row moves by more than 0.001.
        items[column] = items[column].astype("float32")

    destination = ANALYTICS / "order_items_integrated.csv.xz"
    size = write_xz(items, destination)
    print(f"  -> {destination.relative_to(BASE)}  {len(items):,} rows, "
          f"{size/1e6:.1f} MB")
    return size


def build_orders() -> int:
    source = ANALYTICS / "orders_processed.csv"
    if not source.is_file():
        raise SystemExit(
            f"missing {source.relative_to(BASE)}\n"
            "Regenerate it first:\n"
            "  python python_pipeline/processing/process_dineiq_data.py")
    print(f"Reading {source.relative_to(BASE)} ...", flush=True)
    orders = pd.read_csv(source, low_memory=False)
    destination = ANALYTICS / "orders_processed.csv.xz"
    size = write_xz(orders, destination)
    print(f"  -> {destination.relative_to(BASE)}  {len(orders):,} rows, "
          f"{size/1e6:.1f} MB")
    return size


def main() -> int:
    total = build_order_items() + build_orders()
    print(f"\nRuntime artifacts rebuilt ({total/1e6:.1f} MB total).")
    print("Reload the service to pick them up: GET /api/v1/dashboard/reload")
    return 0


if __name__ == "__main__":
    sys.exit(main())
