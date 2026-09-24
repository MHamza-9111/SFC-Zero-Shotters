from pathlib import Path

import pandas as pd

# ============================================================
# DineIQ Analytics - Raw Data Quality Assessment
# ============================================================
# Scans the RAW data layer (before cleaning) and reports:
#   - row / column counts
#   - missing cells and duplicate rows
#   - null and duplicate primary keys
#   - invalid numeric values and date values
#   - dataset-specific logical checks (order totals, inventory
#     balance, rating range, discount range, price/cost margin)
#
# Raw files are only READ, never modified.
#
# Refactored to main(raw_dir, report_dir) so the Jupyter
# notebooks can run the same assessment on any data directory.
# ============================================================

BASE = Path(__file__).resolve().parents[2]

DATASETS = [
    "locations.csv",
    "restaurants.csv",
    "menu_categories.csv",
    "menu_items.csv",
    "customers.csv",
    "orders.csv",
    "order_items.csv",
    "pricing_history.csv",
    "promotions.csv",
    "ratings.csv",
    "inventory.csv",
    "wastage.csv",
]

KEY_COLUMNS = {
    "locations.csv": "location_id",
    "restaurants.csv": "restaurant_id",
    "menu_categories.csv": "category_id",
    "menu_items.csv": "menu_item_id",
    "customers.csv": "customer_id",
    "orders.csv": "order_id",
    "order_items.csv": "order_item_id",
    "pricing_history.csv": "price_history_id",
    "promotions.csv": "promotion_id",
    "ratings.csv": "rating_id",
    "inventory.csv": "inventory_id",
    "wastage.csv": "wastage_id",
}

NUMERIC_COLUMNS = {
    "locations.csv": ["latitude", "longitude"],
    "menu_items.csv": ["base_price", "cost_price"],
    "orders.csv": ["subtotal", "discount_amount", "tax_amount", "delivery_fee", "total_amount"],
    "order_items.csv": ["quantity", "unit_price", "discount_amount", "line_total"],
    "pricing_history.csv": ["old_price", "new_price"],
    "promotions.csv": ["discount_percentage", "minimum_order_value", "usage_limit"],
    "ratings.csv": ["rating"],
    "inventory.csv": ["opening_stock", "received_quantity", "sold_quantity", "closing_stock", "reorder_level"],
    "wastage.csv": ["quantity_wasted", "estimated_cost"],
}

DATE_COLUMNS = {
    "customers.csv": ["date_of_birth", "registration_date"],
    "restaurants.csv": ["opening_date"],
    "menu_items.csv": ["launch_date"],
    "orders.csv": ["order_date"],
    "pricing_history.csv": ["effective_from", "effective_to"],
    "promotions.csv": ["start_date", "end_date"],
    "ratings.csv": ["review_date"],
    "inventory.csv": ["inventory_date"],
    "wastage.csv": ["wastage_date"],
}


def main(raw_dir=None, report_dir=None):
    """
    Runs the raw-data quality assessment.

    Returns:
        (report, summary) DataFrames.
    """
    if raw_dir is None:
        raw_dir = BASE / "raw_data"
    if report_dir is None:
        report_dir = BASE / "reports"

    raw_dir = Path(raw_dir)
    report_dir = Path(report_dir)
    report_dir.mkdir(parents=True, exist_ok=True)

    results = []

    def add_result(dataset, check, value, details=""):
        results.append({
            "dataset": dataset,
            "check": check,
            "value": value,
            "details": details,
        })

    print("=" * 70)
    print("DineIQ Analytics - Raw Data Quality Assessment")
    print("=" * 70)
    print(f"Raw data directory: {raw_dir}")
    print()

    if not raw_dir.exists():
        raise FileNotFoundError(f"Raw data directory not found: {raw_dir}")

    for filename in DATASETS:
        path = raw_dir / filename

        if not path.exists():
            add_result(filename, "FILE_EXISTS", False, "File not found")
            print(f"[MISSING] {filename}")
            continue

        print(f"Checking: {filename}")

        df = pd.read_csv(path, low_memory=False)

        rows = len(df)
        columns = len(df.columns)
        missing_cells = int(df.isna().sum().sum())
        duplicate_rows = int(df.duplicated().sum())

        add_result(filename, "ROWS", rows)
        add_result(filename, "COLUMNS", columns)
        add_result(filename, "MISSING_CELLS", missing_cells)
        add_result(filename, "DUPLICATE_ROWS", duplicate_rows)

        key = KEY_COLUMNS.get(filename)

        if key and key in df.columns:
            null_keys = int(df[key].isna().sum())
            duplicate_keys = int(df[key].duplicated().sum())

            add_result(filename, "NULL_PRIMARY_KEY", null_keys, key)
            add_result(filename, "DUPLICATE_PRIMARY_KEY", duplicate_keys, key)

        for column in NUMERIC_COLUMNS.get(filename, []):
            if column not in df.columns:
                continue

            numeric = pd.to_numeric(df[column], errors="coerce")
            invalid_numeric = int(numeric.isna().sum() - df[column].isna().sum())

            add_result(
                filename,
                f"INVALID_NUMERIC_{column}",
                invalid_numeric,
                column
            )

            if column in ["quantity", "opening_stock", "received_quantity",
                          "sold_quantity", "closing_stock", "reorder_level",
                          "usage_limit", "quantity_wasted"]:
                negative = int((numeric < 0).sum())
                add_result(filename, f"NEGATIVE_{column}", negative, column)

            if column == "rating":
                outside_rating = int(((numeric < 1) | (numeric > 5)).sum())
                add_result(
                    filename,
                    "RATING_OUTSIDE_1_TO_5",
                    outside_rating,
                    "Expected rating range: 1-5"
                )

            if column == "discount_percentage":
                outside_discount = int(((numeric < 0) | (numeric > 100)).sum())
                add_result(
                    filename,
                    "DISCOUNT_OUTSIDE_0_TO_100",
                    outside_discount,
                    "Expected percentage range: 0-100"
                )

            if column in ["base_price", "cost_price", "unit_price",
                          "line_total", "old_price", "new_price",
                          "minimum_order_value", "estimated_cost",
                          "subtotal", "discount_amount", "tax_amount",
                          "delivery_fee", "total_amount"]:
                negative = int((numeric < 0).sum())
                add_result(filename, f"NEGATIVE_{column}", negative, column)

        for column in DATE_COLUMNS.get(filename, []):
            if column not in df.columns:
                continue

            parsed = pd.to_datetime(df[column], errors="coerce")
            invalid_dates = int(parsed.isna().sum() - df[column].isna().sum())

            add_result(
                filename,
                f"INVALID_DATE_{column}",
                invalid_dates,
                column
            )

        # Dataset-specific logical checks
        if filename == "orders.csv":
            if all(c in df.columns for c in
                   ["subtotal", "discount_amount", "tax_amount", "delivery_fee", "total_amount"]):
                expected = (
                    pd.to_numeric(df["subtotal"], errors="coerce")
                    - pd.to_numeric(df["discount_amount"], errors="coerce")
                    + pd.to_numeric(df["tax_amount"], errors="coerce")
                    + pd.to_numeric(df["delivery_fee"], errors="coerce")
                )

                actual = pd.to_numeric(df["total_amount"], errors="coerce")
                mismatch = int((abs(expected - actual) > 0.01).sum())

                add_result(
                    filename,
                    "TOTAL_AMOUNT_LOGICAL_MISMATCH",
                    mismatch,
                    "Expected subtotal - discount + tax + delivery fee"
                )

        if filename == "menu_items.csv":
            if "base_price" in df and "cost_price" in df:
                base = pd.to_numeric(df["base_price"], errors="coerce")
                cost = pd.to_numeric(df["cost_price"], errors="coerce")
                invalid_margin = int((cost > base).sum())

                add_result(
                    filename,
                    "COST_GREATER_THAN_BASE_PRICE",
                    invalid_margin,
                    "Potential pricing/margin anomaly"
                )

        if filename == "inventory.csv":
            if all(c in df.columns for c in
                   ["opening_stock", "received_quantity", "sold_quantity", "closing_stock"]):
                opening = pd.to_numeric(df["opening_stock"], errors="coerce")
                received = pd.to_numeric(df["received_quantity"], errors="coerce")
                sold = pd.to_numeric(df["sold_quantity"], errors="coerce")
                closing = pd.to_numeric(df["closing_stock"], errors="coerce")

                expected_closing = opening + received - sold
                mismatch = int((expected_closing != closing).sum())

                add_result(
                    filename,
                    "INVENTORY_BALANCE_MISMATCH",
                    mismatch,
                    "Expected closing = opening + received - sold"
                )

        if filename == "order_items.csv":
            if "quantity" in df.columns:
                quantity = pd.to_numeric(df["quantity"], errors="coerce")
                invalid_quantity = int((quantity <= 0).sum())

                add_result(
                    filename,
                    "NON_POSITIVE_QUANTITY",
                    invalid_quantity,
                    "Order item quantity must be greater than zero"
                )

        if filename == "wastage.csv":
            if "quantity_wasted" in df.columns:
                quantity = pd.to_numeric(df["quantity_wasted"], errors="coerce")
                invalid_quantity = int((quantity <= 0).sum())

                add_result(
                    filename,
                    "NON_POSITIVE_WASTAGE_QUANTITY",
                    invalid_quantity,
                    "Wastage quantity should be greater than zero"
                )

        print(
            f"  Rows: {rows:,} | Columns: {columns:,} | "
            f"Missing: {missing_cells:,} | Duplicates: {duplicate_rows:,}"
        )

    report = pd.DataFrame(results)

    report_path = report_dir / "data_quality_report.csv"
    report.to_csv(report_path, index=False)

    summary = []

    for filename in DATASETS:
        subset = report[report["dataset"] == filename]

        row_value = subset.loc[subset["check"] == "ROWS", "value"]
        missing_value = subset.loc[subset["check"] == "MISSING_CELLS", "value"]
        duplicate_value = subset.loc[subset["check"] == "DUPLICATE_ROWS", "value"]

        summary.append({
            "dataset": filename,
            "rows": int(row_value.iloc[0]) if not row_value.empty else 0,
            "missing_cells": int(missing_value.iloc[0]) if not missing_value.empty else 0,
            "duplicate_rows": int(duplicate_value.iloc[0]) if not duplicate_value.empty else 0,
        })

    summary_df = pd.DataFrame(summary)
    summary_path = report_dir / "data_quality_summary.csv"
    summary_df.to_csv(summary_path, index=False)

    print()
    print("=" * 70)
    print("QUALITY ASSESSMENT COMPLETE")
    print("=" * 70)
    print(f"Detailed report: {report_path}")
    print(f"Summary report : {summary_path}")
    print()
    print(summary_df.to_string(index=False))

    return report, summary_df


if __name__ == "__main__":
    main()
