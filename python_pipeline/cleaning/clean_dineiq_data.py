from pathlib import Path
from datetime import datetime

import pandas as pd
import numpy as np
import yaml

# ============================================================
# DineIQ Analytics - Data Cleaning Pipeline
# ============================================================
# Purpose:
#   1. Preserve raw data
#   2. Clean valid records
#   3. Quarantine invalid/problematic records
#   4. Remove duplicate records where appropriate
#   5. Standardize dates and numeric fields
#   6. Validate primary-key and foreign-key relationships
#      across datasets (SRS requirement)
#   7. Produce processed CSV files
#   8. Generate cleaning reports
#
# Academic / SRS-aligned implementation.
# ============================================================

BASE = Path(__file__).resolve().parents[2]
CONFIG_PATH = BASE / "config" / "data_generation_config.yaml"

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

PRIMARY_KEYS = {
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

NUMERIC_COLUMNS = {
    "locations.csv": ["latitude", "longitude"],
    "menu_items.csv": ["base_price", "cost_price"],
    "orders.csv": [
        "subtotal",
        "discount_amount",
        "tax_amount",
        "delivery_fee",
        "total_amount",
    ],
    "order_items.csv": [
        "quantity",
        "unit_price",
        "discount_amount",
        "line_total",
    ],
    "pricing_history.csv": ["old_price", "new_price"],
    "promotions.csv": [
        "discount_percentage",
        "minimum_order_value",
        "usage_limit",
    ],
    "ratings.csv": ["rating"],
    "inventory.csv": [
        "opening_stock",
        "received_quantity",
        "sold_quantity",
        "closing_stock",
        "reorder_level",
    ],
    "wastage.csv": ["quantity_wasted", "estimated_cost"],
}


# ------------------------------------------------------------
# Config
# ------------------------------------------------------------

def load_config(path: Path = CONFIG_PATH) -> dict:
    defaults = {
        "time": {"start_date": "2025-01-01", "end_date": "2025-12-31"},
        "output": {
            "raw_dir": "Main/raw_data",
            "processed_dir": "Ali Jaan/processed_data",
        },
    }

    if not path.exists():
        return defaults

    with path.open("r", encoding="utf-8") as f:
        loaded = yaml.safe_load(f) or {}

    for section in ("time", "output"):
        for key, value in (loaded.get(section) or {}).items():
            defaults[section][key] = value

    return defaults


# ------------------------------------------------------------
# Cleaning context (holds cleaned tables in memory so later
# tables can be validated against earlier ones)
# ------------------------------------------------------------

class CleaningContext:
    def __init__(self, raw_dir, processed_dir, reports_dir,
                 quarantine_dir, start_date, end_date, run_time):
        self.raw_dir = Path(raw_dir)
        self.processed_dir = Path(processed_dir)
        self.reports_dir = Path(reports_dir)
        self.quarantine_dir = Path(quarantine_dir)
        self.start_date = pd.Timestamp(start_date)
        self.end_date = pd.Timestamp(end_date)
        self.run_time = run_time
        self.cleaned = {}
        self.log_rows = []

        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)

    # -- logging ------------------------------------------------
    def log(self, dataset, action, affected_rows, reason):
        self.log_rows.append({
            "run_time": self.run_time,
            "dataset": dataset,
            "action": action,
            "affected_rows": int(affected_rows),
            "reason": reason,
        })

    def fk_check(self, dataset, name, affected_rows, reason):
        self.log(dataset, f"fk_validation_{name}", affected_rows, reason)

    # -- quarantine / output ------------------------------------
    def save_quarantine(self, dataset, df, reason_column="quarantine_reason"):
        if df.empty:
            return
        output_name = dataset.replace(".csv", "_quarantine.csv")
        output_path = self.quarantine_dir / output_name

        existing = pd.DataFrame()
        if output_path.exists():
            existing = pd.read_csv(output_path, low_memory=False)

        df = df.copy()
        if reason_column not in df.columns:
            df[reason_column] = ""

        combined = pd.concat([existing, df], ignore_index=True)
        combined.to_csv(output_path, index=False)

        self.log(
            dataset,
            "quarantine",
            len(df),
            f"Problematic records saved to {output_name}",
        )

    def save_processed(self, df, dataset):
        output_path = self.processed_dir / dataset
        df.to_csv(output_path, index=False)
        self.cleaned[dataset] = df
        return output_path


# ------------------------------------------------------------
# Standardization helpers
# ------------------------------------------------------------

def standardize_dates(df, columns):
    for column in columns:
        if column in df.columns:
            parsed = pd.to_datetime(df[column], errors="coerce")
            df[column] = parsed.dt.strftime("%Y-%m-%d")
            df[column] = df[column].replace("NaT", "")
    return df


def standardize_numeric(df, columns):
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def remove_key_duplicates(ctx, dataset, df):
    """
    Drops duplicate primary keys (first occurrence kept).
    Duplicates are quarantined, never silently lost.
    """
    key = PRIMARY_KEYS[dataset]
    duplicate_mask = df.duplicated(subset=[key], keep="first")
    duplicate_count = int(duplicate_mask.sum())

    if duplicate_count > 0:
        bad = df.loc[duplicate_mask].copy()
        bad["quarantine_reason"] = f"Duplicate {key}; first occurrence retained."
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~duplicate_mask].copy()
        ctx.log(
            dataset,
            "duplicate_removal",
            duplicate_count,
            f"Duplicate {key} records quarantined; first occurrence retained.",
        )

    return df, duplicate_count


def report(ctx, dataset, before, df, extra=""):
    print(f"\nCleaning: {dataset}")
    print(f"  Input rows: {before:,}")
    if extra:
        print(extra)
    print(f"  Output rows: {len(df):,}")


# ============================================================
# 1. LOCATIONS
# ============================================================

def clean_locations(ctx):
    dataset = "locations.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    duplicate_mask = df.duplicated(keep="first")
    if duplicate_mask.sum() > 0:
        df = df.loc[~duplicate_mask].copy()
        ctx.log(
            dataset,
            "duplicate_removal",
            int(duplicate_mask.sum()),
            "Exact duplicate rows removed; first occurrence retained.",
        )

    df = standardize_numeric(df, ["latitude", "longitude"])

    invalid = (
        df["latitude"].isna()
        | df["longitude"].isna()
        | (df["latitude"] < -90)
        | (df["latitude"] > 90)
        | (df["longitude"] < -180)
        | (df["longitude"] > 180)
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = "Invalid latitude/longitude"
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean location records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 2. RESTAURANTS
# ============================================================

def clean_restaurants(ctx):
    dataset = "restaurants.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)
    df = standardize_dates(df, ["opening_date"])

    locations = ctx.cleaned.get("locations.csv")
    if locations is not None:
        orphan = ~df["location_id"].isin(
            locations["location_id"].dropna()
        )
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown location_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset,
            "location_id",
            int(orphan.sum()),
            "Restaurants must reference a known location.",
        )

    invalid = df["restaurant_id"].isna()
    if invalid.sum() > 0:
        bad = df.loc[invalid].copy()
        bad["quarantine_reason"] = "Missing restaurant_id"
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean restaurant records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 3. MENU CATEGORIES
# ============================================================

def clean_categories(ctx):
    dataset = "menu_categories.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    invalid = (
        df["category_id"].isna()
        | df["category_name"].isna()
        | (df["category_name"].astype(str).str.strip() == "")
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = "Missing category identifier or name"
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    df["category_name"] = df["category_name"].astype(str).str.strip()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean category records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 4. MENU ITEMS
# ============================================================

def clean_menu_items(ctx):
    dataset = "menu_items.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, ["base_price", "cost_price"])
    df = standardize_dates(df, ["launch_date"])

    restaurants = ctx.cleaned.get("restaurants.csv")
    categories = ctx.cleaned.get("menu_categories.csv")

    if restaurants is not None:
        orphan_rest = ~df["restaurant_id"].isin(
            restaurants["restaurant_id"].dropna()
        )
        if orphan_rest.sum() > 0:
            bad = df.loc[orphan_rest].copy()
            bad["quarantine_reason"] = "Unknown restaurant_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan_rest].copy()

    if categories is not None:
        orphan_cat = ~df["category_id"].isin(
            categories["category_id"].dropna()
        )
        if orphan_cat.sum() > 0:
            bad = df.loc[orphan_cat].copy()
            bad["quarantine_reason"] = "Unknown category_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan_cat].copy()

    ctx.fk_check(
        dataset,
        "restaurant_category",
        0,
        "Menu items must reference known restaurants and categories.",
    )

    invalid = (
        df["menu_item_id"].isna()
        | df["restaurant_id"].isna()
        | df["category_id"].isna()
        | df["base_price"].isna()
        | df["cost_price"].isna()
        | (df["base_price"] <= 0)
        | (df["cost_price"] < 0)
        | (df["cost_price"] > df["base_price"])
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Invalid menu item identifier, relationship, or price/cost values"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean menu item records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 5. CUSTOMERS
# ============================================================

def clean_customers(ctx):
    dataset = "customers.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, duplicate_count = remove_key_duplicates(ctx, dataset, df)

    for column in [
        "first_name",
        "last_name",
        "gender",
        "preferred_channel",
        "preferred_category",
        "email",
        "phone",
    ]:
        if column in df.columns:
            df[column] = df[column].fillna("").astype(str).str.strip()

    df = standardize_dates(df, ["date_of_birth", "registration_date"])

    missing_email = df["email"].eq("")
    if missing_email.sum() > 0:
        ctx.log(
            dataset,
            "missing_value_standardization",
            int(missing_email.sum()),
            "Missing email retained as blank because no valid value can be inferred.",
        )

    invalid_id = df["customer_id"].isna()
    if invalid_id.sum() > 0:
        bad = df.loc[invalid_id].copy()
        bad["quarantine_reason"] = "Missing customer_id"
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid_id].copy()

    ctx.save_processed(df, dataset)
    ctx.log(
        dataset,
        "processed",
        len(df),
        "Clean customer records saved; missing emails retained as blank.",
    )
    report(
        ctx,
        dataset,
        before,
        df,
        extra=(
            f"  Duplicate customer rows removed: {duplicate_count:,}\n"
            f"  Missing emails retained: {int(missing_email.sum()):,}"
        ),
    )


# ============================================================
# 6. ORDERS
# ============================================================

def clean_orders(ctx):
    dataset = "orders.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, [
        "subtotal",
        "discount_amount",
        "tax_amount",
        "delivery_fee",
        "total_amount",
    ])
    df = standardize_dates(df, ["order_date"])

    df["payment_method"] = df["payment_method"].fillna("").astype(str).str.strip()
    if "promotion_id" in df.columns:
        # The column is read as float64 when some orders have no
        # promotion (empty -> NaN). Convert to a clean integer string
        # ("56", not "56.0") or "" so downstream string joins work.
        df["promotion_id"] = df["promotion_id"].apply(
            lambda x: "" if pd.isna(x) else str(int(x))
        )

    missing_payment = df["payment_method"].eq("")
    if missing_payment.sum() > 0:
        ctx.log(
            dataset,
            "missing_value_standardization",
            int(missing_payment.sum()),
            "Missing payment method retained as blank; value was not guessed.",
        )

    # Financial values cannot be negative.
    financial_invalid = (
        (df["subtotal"] < 0)
        | (df["discount_amount"] < 0)
        | (df["tax_amount"] < 0)
        | (df["delivery_fee"] < 0)
        | (df["total_amount"] < 0)
    )

    # Check total calculation with small rounding tolerance.
    expected_total = (
        df["subtotal"]
        - df["discount_amount"]
        + df["tax_amount"]
        + df["delivery_fee"]
    )
    total_mismatch = (df["total_amount"] - expected_total).abs() > 0.02
    mismatch_count = int(total_mismatch.sum())
    if mismatch_count > 0:
        ctx.log(
            dataset,
            "transaction_validation",
            mismatch_count,
            "Order total differs from calculated total; original value preserved for review.",
        )

    # ---- Foreign key validation --------------------------------
    customers = ctx.cleaned.get("customers.csv")
    restaurants = ctx.cleaned.get("restaurants.csv")
    promotions = ctx.cleaned.get("promotions.csv")

    if customers is not None:
        orphan = ~df["customer_id"].isin(customers["customer_id"].dropna())
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown customer_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "customer_id", int(orphan.sum()),
            "Orders must reference a known customer.",
        )

    if restaurants is not None:
        orphan = ~df["restaurant_id"].isin(
            restaurants["restaurant_id"].dropna()
        )
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown restaurant_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "restaurant_id", int(orphan.sum()),
            "Orders must reference a known restaurant.",
        )

    if promotions is not None and "promotion_id" in df.columns:
        has_promo = df["promotion_id"].ne("")
        orphan = has_promo & ~df["promotion_id"].isin(
            promotions["promotion_id"].astype(str)
        )
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown promotion_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "promotion_id", int(orphan.sum()),
            "Orders with a promotion must reference a known promotion.",
        )

    # Promotion business logic: the referenced promotion should be
    # active on the order date at the order's restaurant. Violations
    # are documented (not quarantined) because the order itself is
    # still a valid transaction.
    if promotions is not None and "promotion_id" in df.columns:
        promo_info = promotions.set_index(
            promotions["promotion_id"].astype(str)
        )
        has_promo = df["promotion_id"].ne("")

        suspicious = 0
        if has_promo.sum() > 0:
            sub = df.loc[has_promo].copy()
            sub["_rest"] = sub["promotion_id"].map(
                promo_info["restaurant_id"]
            )
            sub["_s"] = sub["promotion_id"].map(
                promo_info["start_date"]
            )
            sub["_e"] = sub["promotion_id"].map(
                promo_info["end_date"]
            )
            suspicious = int(
                (sub["_rest"] != sub["restaurant_id"])
                | (sub["_s"] > sub["order_date"])
                | (sub["_e"] < sub["order_date"])
            )
        if suspicious > 0:
            ctx.log(
                dataset,
                "transaction_validation",
                suspicious,
                "Promotion not active for the order date/restaurant; order kept, flagged for review.",
            )

    # ---- Analysis period validation ----------------------------
    parsed = pd.to_datetime(df["order_date"], errors="coerce")
    out_of_period = parsed.isna() | (
        (parsed < ctx.start_date) | (parsed > ctx.end_date)
    )
    if out_of_period.sum() > 0:
        bad = df.loc[out_of_period].copy()
        bad["quarantine_reason"] = (
            "order_date outside analysis period "
            f"({ctx.start_date.date()} to {ctx.end_date.date()})"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~out_of_period].copy()
    ctx.fk_check(
        dataset,
        "analysis_period",
        int(out_of_period.sum()),
        "Order dates must fall inside the 12-month analysis period.",
    )

    invalid = (
        df["order_id"].isna()
        | df["customer_id"].isna()
        | df["restaurant_id"].isna()
        | financial_invalid
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Missing required order key or negative financial value"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean order records saved.")
    report(
        ctx,
        dataset,
        before,
        df,
        extra=(
            f"  Missing payment methods: {int(missing_payment.sum()):,}\n"
            f"  Total calculation mismatches: {mismatch_count:,}"
        ),
    )


# ============================================================
# 7. ORDER ITEMS
# ============================================================

def clean_order_items(ctx):
    dataset = "order_items.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, [
        "quantity",
        "unit_price",
        "discount_amount",
        "line_total",
    ])

    orders = ctx.cleaned.get("orders.csv")
    menu = ctx.cleaned.get("menu_items.csv")

    # ---- Foreign key validation --------------------------------
    if orders is not None:
        orphan = ~df["order_id"].isin(orders["order_id"].dropna())
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown order_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "order_id", int(orphan.sum()),
            "Order items must reference a known order.",
        )

    if menu is not None:
        orphan = ~df["menu_item_id"].isin(menu["menu_item_id"].dropna())
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown menu_item_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "menu_item_id", int(orphan.sum()),
            "Order items must reference a known menu item.",
        )

    # Restaurant/menu consistency: the item must belong to the
    # order's restaurant. Prevents location-level misattribution.
    if orders is not None and menu is not None:
        order_rest = orders.set_index("order_id")["restaurant_id"]
        item_rest = menu.set_index("menu_item_id")["restaurant_id"]

        line_rest = df["menu_item_id"].map(item_rest)
        expected_rest = df["order_id"].map(order_rest)

        mismatch = (
            line_rest.notna()
            & expected_rest.notna()
            & (line_rest != expected_rest)
        )
        if mismatch.sum() > 0:
            bad = df.loc[mismatch].copy()
            bad["quarantine_reason"] = (
                "Menu item does not belong to the order's restaurant"
            )
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~mismatch].copy()
        ctx.fk_check(
            dataset,
            "restaurant_consistency",
            int(mismatch.sum()),
            "Order items must come from the order's own restaurant menu.",
        )

    # Potential business duplicates: exact repeat of every field in
    # the same order (e.g. a double-entered line). Natural repeat
    # purchases (same item, same quantity, different price draw)
    # are NOT treated as duplicates.
    dup_lines = df.duplicated(
        subset=[
            "order_id",
            "menu_item_id",
            "quantity",
            "unit_price",
            "discount_amount",
            "line_total",
        ],
        keep="first",
    )
    if dup_lines.sum() > 0:
        ctx.log(
            dataset,
            "duplicate_line_detection",
            int(dup_lines.sum()),
            "Exact duplicate order lines detected and retained for review.",
        )

    invalid = (
        df["order_item_id"].isna()
        | df["order_id"].isna()
        | df["menu_item_id"].isna()
        | df["quantity"].isna()
        | (df["quantity"] <= 0)
        | df["unit_price"].isna()
        | (df["unit_price"] < 0)
        | df["discount_amount"].isna()
        | (df["discount_amount"] < 0)
        | df["line_total"].isna()
        | (df["line_total"] < 0)
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Invalid order item key, quantity, price, discount, or line total"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean order item records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 8. PRICING HISTORY
# ============================================================

def clean_pricing_history(ctx):
    dataset = "pricing_history.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, ["old_price", "new_price"])
    df = standardize_dates(df, ["effective_from", "effective_to"])

    menu = ctx.cleaned.get("menu_items.csv")
    if menu is not None:
        orphan = ~df["menu_item_id"].isin(menu["menu_item_id"].dropna())
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown menu_item_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "menu_item_id", int(orphan.sum()),
            "Pricing history must reference a known menu item.",
        )

    invalid = (
        df["price_history_id"].isna()
        | df["menu_item_id"].isna()
        | df["old_price"].isna()
        | df["new_price"].isna()
        | (df["old_price"] < 0)
        | (df["new_price"] <= 0)
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Invalid pricing history identifier, item, or price"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean pricing history records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 9. PROMOTIONS
# ============================================================

def clean_promotions(ctx):
    dataset = "promotions.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, [
        "discount_percentage",
        "minimum_order_value",
        "usage_limit",
    ])
    df = standardize_dates(df, ["start_date", "end_date"])

    menu = ctx.cleaned.get("menu_items.csv")
    restaurants = ctx.cleaned.get("restaurants.csv")

    if menu is not None and "menu_item_id" in df.columns:
        orphan = ~df["menu_item_id"].isin(menu["menu_item_id"].dropna())
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown menu_item_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "menu_item_id", int(orphan.sum()),
            "Promotions must reference a known menu item.",
        )

    if restaurants is not None:
        orphan = ~df["restaurant_id"].isin(
            restaurants["restaurant_id"].dropna()
        )
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown restaurant_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "restaurant_id", int(orphan.sum()),
            "Promotions must reference a known restaurant.",
        )

    invalid = (
        df["promotion_id"].isna()
        | df["discount_percentage"].isna()
        | (df["discount_percentage"] < 0)
        | (df["discount_percentage"] > 100)
        | df["minimum_order_value"].isna()
        | (df["minimum_order_value"] < 0)
        | df["usage_limit"].isna()
        | (df["usage_limit"] < 0)
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Invalid promotion identifier, discount, minimum order value, or usage limit"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean promotion records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 10. RATINGS
# ============================================================

def clean_ratings(ctx):
    dataset = "ratings.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, ["rating"])
    df = standardize_dates(df, ["review_date"])

    orders = ctx.cleaned.get("orders.csv")
    order_items = ctx.cleaned.get("order_items.csv")

    # ---- Foreign key validation --------------------------------
    if orders is not None:
        order_customer = orders.set_index("order_id")["customer_id"]

        orphan = ~df["order_id"].isin(orders["order_id"].dropna())
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = "Unknown order_id"
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset, "order_id", int(orphan.sum()),
            "Ratings must reference a known order.",
        )

        # The rater must be the customer of the rated order.
        expected_customer = df["order_id"].map(order_customer)
        customer_mismatch = (
            expected_customer.notna()
            & df["customer_id"].notna()
            & (df["customer_id"] != expected_customer)
        )
        if customer_mismatch.sum() > 0:
            bad = df.loc[customer_mismatch].copy()
            bad["quarantine_reason"] = (
                "Rater does not match the customer of the rated order"
            )
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~customer_mismatch].copy()
        ctx.fk_check(
            dataset,
            "customer_match",
            int(customer_mismatch.sum()),
            "Ratings must come from the customer of the rated order.",
        )

    # The rated item must actually appear in the rated order.
    if order_items is not None:
        order_line_items = order_items.groupby("order_id")["menu_item_id"].agg(
            set
        )

        def _in_order(row):
            lines = order_line_items.get(row["order_id"])
            return lines is not None and row["menu_item_id"] in lines

        in_order = df.apply(_in_order, axis=1)
        orphan_item = ~in_order

        if orphan_item.sum() > 0:
            bad = df.loc[orphan_item].copy()
            bad["quarantine_reason"] = (
                "Rated menu item is not part of the referenced order"
            )
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan_item].copy()
        ctx.fk_check(
            dataset,
            "item_in_order",
            int(orphan_item.sum()),
            "Ratings must reference an item present in the order.",
        )

    invalid = (
        df["rating_id"].isna()
        | df["customer_id"].isna()
        | df["order_id"].isna()
        | df["menu_item_id"].isna()
        | df["rating"].isna()
        | (df["rating"] < 1)
        | (df["rating"] > 5)
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Invalid rating identifier, relationship, or rating value outside 1-5"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    if "review_text" in df.columns:
        df["review_text"] = df["review_text"].fillna("").astype(str).str.strip()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean rating records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# 11. INVENTORY
# ============================================================

def clean_inventory(ctx):
    dataset = "inventory.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, [
        "opening_stock",
        "received_quantity",
        "sold_quantity",
        "closing_stock",
        "reorder_level",
    ])
    df = standardize_dates(df, ["inventory_date"])

    menu = ctx.cleaned.get("menu_items.csv")
    if menu is not None:
        valid_pairs = menu.set_index("menu_item_id")["restaurant_id"]
        line_rest = df["menu_item_id"].map(valid_pairs)
        orphan = (
            line_rest.isna()
            | (line_rest != df["restaurant_id"])
        )
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = (
                "Inventory item does not belong to the inventory restaurant"
            )
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset,
            "restaurant_item_pair",
            int(orphan.sum()),
            "Inventory records must reference items of their own restaurant.",
        )

    numeric_invalid = (
        df[[
            "opening_stock",
            "received_quantity",
            "sold_quantity",
            "closing_stock",
            "reorder_level",
        ]] < 0
    ).any(axis=1)

    arithmetic_mismatch = (
        df["closing_stock"]
        != (df["opening_stock"] + df["received_quantity"] - df["sold_quantity"])
    )

    invalid = (
        df["inventory_id"].isna()
        | df["restaurant_id"].isna()
        | df["menu_item_id"].isna()
        | numeric_invalid
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Missing inventory relationship/key or negative stock quantity"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    mismatch_count = int(arithmetic_mismatch.sum())
    if mismatch_count > 0:
        ctx.log(
            dataset,
            "inventory_validation",
            mismatch_count,
            "Closing stock arithmetic mismatch detected; original values preserved for analysis.",
        )

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean inventory records saved.")
    report(
        ctx,
        dataset,
        before,
        df,
        extra=f"  Stock arithmetic mismatches: {mismatch_count:,}",
    )


# ============================================================
# 12. WASTAGE
# ============================================================

def clean_wastage(ctx):
    dataset = "wastage.csv"
    df = pd.read_csv(ctx.raw_dir / dataset, low_memory=False)
    before = len(df)

    df, _ = remove_key_duplicates(ctx, dataset, df)

    df = standardize_numeric(df, ["quantity_wasted", "estimated_cost"])
    df = standardize_dates(df, ["wastage_date"])

    menu = ctx.cleaned.get("menu_items.csv")
    if menu is not None:
        valid_pairs = menu.set_index("menu_item_id")["restaurant_id"]
        line_rest = df["menu_item_id"].map(valid_pairs)
        orphan = line_rest.isna() | (line_rest != df["restaurant_id"])
        if orphan.sum() > 0:
            bad = df.loc[orphan].copy()
            bad["quarantine_reason"] = (
                "Wastage item does not belong to the wastage restaurant"
            )
            ctx.save_quarantine(dataset, bad)
            df = df.loc[~orphan].copy()
        ctx.fk_check(
            dataset,
            "restaurant_item_pair",
            int(orphan.sum()),
            "Wastage records must reference items of their own restaurant.",
        )

    invalid = (
        df["wastage_id"].isna()
        | df["restaurant_id"].isna()
        | df["menu_item_id"].isna()
        | df["quantity_wasted"].isna()
        | (df["quantity_wasted"] <= 0)
        | df["estimated_cost"].isna()
        | (df["estimated_cost"] < 0)
    )

    bad = df.loc[invalid].copy()
    if not bad.empty:
        bad["quarantine_reason"] = (
            "Invalid wastage identifier, relationship, quantity, or estimated cost"
        )
        ctx.save_quarantine(dataset, bad)
        df = df.loc[~invalid].copy()

    ctx.save_processed(df, dataset)
    ctx.log(dataset, "processed", len(df), "Clean wastage records saved.")
    report(ctx, dataset, before, df)


# ============================================================
# Main
# ============================================================

def main(
    raw_dir=None,
    processed_dir=None,
    reports_dir=None,
    quarantine_dir=None,
    config_path=CONFIG_PATH,
):

    cfg = load_config(config_path)
    base = BASE

    if raw_dir is None:
        raw_dir = base / cfg["output"]["raw_dir"]
    if processed_dir is None:
        processed_dir = base / cfg["output"]["processed_dir"]
    if reports_dir is None:
        reports_dir = base / "reports"
    if quarantine_dir is None:
        quarantine_dir = reports_dir / "quarantine"

    ctx = CleaningContext(
        raw_dir=raw_dir,
        processed_dir=processed_dir,
        reports_dir=reports_dir,
        quarantine_dir=quarantine_dir,
        start_date=cfg["time"]["start_date"],
        end_date=cfg["time"]["end_date"],
        run_time=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )

    print("=" * 70)
    print("DineIQ Analytics - Data Cleaning Pipeline")
    print("=" * 70)
    print(f"Raw data       : {ctx.raw_dir}")
    print(f"Processed data : {ctx.processed_dir}")
    print(f"Quarantine     : {ctx.quarantine_dir}")
    print()

    # Clean in dependency-friendly order.
    clean_locations(ctx)
    clean_restaurants(ctx)
    clean_categories(ctx)
    clean_menu_items(ctx)
    clean_customers(ctx)
    clean_orders(ctx)
    clean_order_items(ctx)
    clean_pricing_history(ctx)
    clean_promotions(ctx)
    clean_ratings(ctx)
    clean_inventory(ctx)
    clean_wastage(ctx)

    # --------------------------------------------------------
    # Save cleaning log
    # --------------------------------------------------------

    log_df = pd.DataFrame(ctx.log_rows)
    log_path = ctx.reports_dir / "cleaning_log.csv"
    log_df.to_csv(log_path, index=False)

    # --------------------------------------------------------
    # Create final dataset summary
    # --------------------------------------------------------

    summary_rows = []

    for dataset in DATASETS:
        raw_path = ctx.raw_dir / dataset
        processed_path = ctx.processed_dir / dataset

        raw_rows = 0
        processed_rows = 0

        if raw_path.exists():
            raw_rows = len(pd.read_csv(raw_path, low_memory=False))
        if processed_path.exists():
            processed_rows = len(pd.read_csv(processed_path, low_memory=False))

        summary_rows.append({
            "dataset": dataset,
            "raw_rows": raw_rows,
            "processed_rows": processed_rows,
            "rows_removed_or_quarantined": raw_rows - processed_rows,
        })

    summary_df = pd.DataFrame(summary_rows)
    summary_path = ctx.reports_dir / "cleaning_summary.csv"
    summary_df.to_csv(summary_path, index=False)

    print()
    print("=" * 70)
    print("DATA CLEANING COMPLETE")
    print("=" * 70)
    print(f"Processed data : {ctx.processed_dir}")
    print(f"Cleaning log   : {log_path}")
    print(f"Summary report : {summary_path}")
    print(f"Quarantine     : {ctx.quarantine_dir}")
    print()
    print(summary_df.to_string(index=False))
    print()
    print("Raw data was NOT modified.")
    print("Problematic records were quarantined where appropriate.")
    print("Valid records were written to processed_data.")
    print("=" * 70)

    return {
        "processed_dir": ctx.processed_dir,
        "log_path": log_path,
        "summary_path": summary_path,
        "quarantine_dir": ctx.quarantine_dir,
    }


if __name__ == "__main__":
    main()
