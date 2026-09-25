"""
Shared feature construction for BOTH pipelines.

Single source of truth for the analytical features used by the
Spark/MLlib models (spark_jobs/mllib_models.py) AND by the
Python model artifacts (data_cleaning/model_artifacts.py).
Sharing this module is what guarantees feature parity for the
dual-pipeline comparison required by the SRS.

All builders read the canonical cleaned CSV layer produced by
Ali's cleaning step (processed_data/).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

PERIOD_END = pd.Timestamp("2025-12-31")

ORDER_FEATURES = [
    "order_hour", "day_of_week_code", "order_month", "is_weekend",
    "is_promo_order", "channel_code", "payment_code", "basket_size",
    "basket_quantity", "avg_unit_price", "discount_rate_percentage",
    "total_orders", "total_spend",
]

CHURN_FEATURES = [
    "recency_days", "f_log_orders", "f_log_spend", "average_order_value",
    "discount_dependency", "promo_dependency", "top_category_share",
    "unique_categories",
]

MENU_FEATURES = [
    "units_sold", "revenue", "estimated_profit",
    "profit_margin_percentage", "average_rating", "wastage_ratio",
]

TASKS = {
    "high_value_order": {"type": "binary", "features": ORDER_FEATURES},
    "customer_churn": {"type": "binary", "features": CHURN_FEATURES},
    "menu_business_class": {"type": "multiclass", "features": MENU_FEATURES},
}


def _norm_promotion(s: pd.Series) -> pd.Series:
    return s.apply(lambda x: "" if pd.isna(x) else str(int(x)))


def load_base_frames(processed_dir: Path) -> dict:
    processed_dir = Path(processed_dir)

    def rd(name):
        return pd.read_csv(processed_dir / f"{name}.csv", low_memory=False)

    frames = {name: rd(name) for name in [
        "locations", "restaurants", "menu_categories", "menu_items",
        "customers", "orders", "order_items", "pricing_history",
        "promotions", "ratings", "inventory", "wastage",
    ]}

    orders = frames["orders"]
    orders["order_date"] = pd.to_datetime(orders["order_date"], errors="coerce")
    for col in ["subtotal", "discount_amount", "tax_amount",
                "delivery_fee", "total_amount"]:
        orders[col] = pd.to_numeric(orders[col], errors="coerce")
    orders["is_completed"] = orders["order_status"].astype(str).str.strip() \
        .str.upper() == "COMPLETED"
    orders["promotion_id"] = _norm_promotion(orders.get("promotion_id", ""))
    return frames


def _derived_orders(orders: pd.DataFrame) -> pd.DataFrame:
    """Mirrors Ali's process_dineiq_data derived columns exactly."""
    o = orders.copy()
    o["order_month"] = o["order_date"].dt.month
    o["day_of_week"] = o["order_date"].dt.day_name()
    o["is_weekend"] = (o["order_date"].dt.dayofweek >= 5).astype(int)
    o["order_hour"] = pd.to_datetime(
        o["order_time"].astype(str), format="%H:%M:%S", errors="coerce"
    ).dt.hour
    o["is_promo_order"] = (o["promotion_id"] != "").astype(int)
    o["discount_rate_percentage"] = np.where(
        o["subtotal"] > 0,
        (o["discount_amount"] / o["subtotal"]) * 100, 0)
    return o


def _completed_items(frames: dict) -> pd.DataFrame:
    items = frames["order_items"].copy()
    for col in ["quantity", "unit_price", "discount_amount", "line_total"]:
        items[col] = pd.to_numeric(items[col], errors="coerce")
    items = items.merge(
        frames["menu_items"][["menu_item_id", "restaurant_id", "category_id",
                              "item_name", "cost_price"]],
        on="menu_item_id", how="left")
    items = items.merge(
        frames["orders"][["order_id", "customer_id", "order_status",
                          "is_completed"]],
        on="order_id", how="left")
    items["gross_revenue"] = items["quantity"] * items["unit_price"]
    items["estimated_cost"] = items["quantity"] * items["cost_price"]
    items["estimated_profit"] = (
        items["gross_revenue"] - items["discount_amount"] - items["estimated_cost"])
    return items.loc[items["is_completed"]].copy()


def _day_code_map_from_cases(cases_path: Path) -> dict:
    """
    Recovers Ali's day_of_week_code mapping from the committed case
    file (order_date -> code). factorize() is appearance-order
    dependent, so instead of re-guessing we reuse the committed
    mapping; any weekday missing from the cases falls back to
    Monday=0..Sunday=6.
    """
    fallback = {d: i for i, d in enumerate(
        ["Monday", "Tuesday", "Wednesday", "Thursday",
         "Friday", "Saturday", "Sunday"])}
    m = dict(fallback)
    if Path(cases_path).exists():
        cases = pd.read_csv(cases_path)
        if "day_of_week_code" in cases.columns:
            dates = pd.to_datetime(cases["order_date"], errors="coerce")
            for name, code in zip(dates.dt.day_name(), cases["day_of_week_code"]):
                if pd.notna(name) and pd.notna(code):
                    m[name] = int(code)
    return m


# ---------------------------------------------------------------------------
# Feature frame construction (pandas engine)
# ---------------------------------------------------------------------------

def build_order_frame(frames: dict, day_map: dict) -> pd.DataFrame:
    o = _derived_orders(frames["orders"])
    comp = o[o["is_completed"]].copy()
    items = _completed_items(frames)

    # basket_size = number of order lines (nunique order_item_id),
    # matching the Python pipeline definition exactly.
    agg = items.groupby("order_id").agg(
        basket_size=("order_item_id", "nunique"),
        basket_quantity=("quantity", "sum"),
        avg_unit_price=("unit_price", "mean"),
    ).reset_index()
    comp = comp.merge(agg, on="order_id", how="left")

    cust = comp.groupby("customer_id").agg(
        total_orders=("order_id", "nunique"),
        total_spend=("total_amount", "sum")).reset_index()
    comp = comp.merge(cust, on="customer_id", how="left")
    comp["total_orders"] = comp["total_orders"].fillna(0)
    comp["total_spend"] = comp["total_spend"].fillna(0)

    comp["channel_code"] = pd.factorize(comp["order_channel"], sort=True)[0]
    comp["payment_code"] = pd.factorize(
        comp["payment_method"].fillna("Unknown"), sort=True)[0]
    comp["day_of_week_code"] = comp["day_of_week"].map(day_map)
    comp["order_hour"] = comp["order_hour"].fillna(-1)
    return comp


def build_churn_frame(frames: dict) -> pd.DataFrame:
    o = _derived_orders(frames["orders"])
    comp = o[o["is_completed"]]
    ca = comp.groupby("customer_id").agg(
        total_orders=("order_id", "nunique"),
        total_spend=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        total_discount_received=("discount_amount", "sum"),
        first_order_date=("order_date", "min"),
        last_order_date=("order_date", "max"),
        promo_orders=("is_promo_order", "sum")).reset_index()

    df = frames["customers"].merge(ca, on="customer_id", how="inner")
    df = df.loc[df["total_orders"] > 0].copy()
    df["first_order_date"] = pd.to_datetime(df["first_order_date"],
                                            errors="coerce")
    df["last_order_date"] = pd.to_datetime(df["last_order_date"],
                                           errors="coerce")
    min_first = PERIOD_END - pd.Timedelta(days=180)
    df = df.loc[df["first_order_date"] <= min_first].copy()

    df["recency_days"] = (PERIOD_END - df["last_order_date"]).dt.days
    df["churned"] = (df["recency_days"] > 60).astype(int)

    items = _completed_items(frames)
    items = items.merge(
        frames["menu_categories"][["category_id", "category_name"]],
        on="category_id", how="left")
    cat = (items[items["customer_id"].isin(set(df["customer_id"]))]
           .groupby(["customer_id", "category_name"])["quantity"]
           .sum().reset_index())
    tot = cat.groupby("customer_id")["quantity"].sum().rename("cust_qty")
    cat = cat.merge(tot, on="customer_id")
    cat["share"] = cat["quantity"] / cat["cust_qty"]
    top_share = cat.groupby("customer_id")["share"].max().rename(
        "top_category_share")
    uniq_cat = cat.groupby("customer_id")["category_name"].nunique().rename(
        "unique_categories")
    df = df.merge(top_share, on="customer_id", how="left")
    df = df.merge(uniq_cat, on="customer_id", how="left")
    df["top_category_share"] = df["top_category_share"].fillna(0)
    df["unique_categories"] = df["unique_categories"].fillna(0)

    df["discount_dependency"] = np.where(
        df["total_spend"] > 0,
        df["total_discount_received"] / df["total_spend"], 0)
    df["promo_dependency"] = np.where(
        df["total_orders"] > 0, df["promo_orders"] / df["total_orders"], 0)
    df["f_log_orders"] = np.log1p(df["total_orders"])
    df["f_log_spend"] = np.log1p(df["total_spend"])
    return df


def build_menu_frame(frames: dict) -> pd.DataFrame:
    items = _completed_items(frames)
    menu_perf = (items.groupby(["menu_item_id", "restaurant_id"])
                 .agg(units_sold=("quantity", "sum"),
                      revenue=("gross_revenue", "sum"),
                      estimated_profit=("estimated_profit", "sum"))
                 .reset_index())
    menu_perf["profit_margin_percentage"] = np.where(
        menu_perf["revenue"] > 0,
        menu_perf["estimated_profit"] / menu_perf["revenue"] * 100, 0)

    ratings = frames["ratings"].copy()
    ratings["rating"] = pd.to_numeric(ratings["rating"], errors="coerce")
    rating_item = (ratings.groupby("menu_item_id")
                   .agg(rating_count=("rating", "count"),
                        average_rating=("rating", "mean"))
                   .reset_index())
    wast = frames["wastage"].copy()
    wast["quantity_wasted"] = pd.to_numeric(wast["quantity_wasted"],
                                            errors="coerce")
    wastage_item = (wast.groupby("menu_item_id")["quantity_wasted"]
                    .sum().reset_index().rename(
                        columns={"quantity_wasted": "quantity_wasted"}))

    df = menu_perf.merge(rating_item, on="menu_item_id", how="left")
    df = df.merge(wastage_item, on="menu_item_id", how="left")
    df["average_rating"] = df["average_rating"].fillna(0)
    df["quantity_wasted"] = df["quantity_wasted"].fillna(0)
    df["wastage_ratio"] = df["quantity_wasted"] / np.maximum(
        df["units_sold"] + df["quantity_wasted"], 1)

    u_med = df["units_sold"].median()
    p_med = df["estimated_profit"].median()
    m_med = df["profit_margin_percentage"].median()
    # SRS Step 10 (same rule as .../run_advanced_analytics.py):
    # Profit Driver = high demand + high profit + high margin; Volume
    # Driver = any other high-demand item; Hidden Opportunity = low
    # demand + high margin; Low Performer = low demand + low margin.
    # The four conditions partition all items (default is unreachable).
    high_demand = df["units_sold"] >= u_med
    high_profit = df["estimated_profit"] >= p_med
    high_margin = df["profit_margin_percentage"] >= m_med
    df["business_class"] = np.select(
        [
            high_demand & high_profit & high_margin,
            high_demand,
            ~high_demand & high_margin,
            ~high_demand & ~high_margin,
        ],
        ["Profit Driver", "Volume Driver", "Hidden Opportunity",
         "Low Performer"],
        default="Low Performer",
    )
    return df

