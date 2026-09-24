from pathlib import Path
from datetime import datetime

import pandas as pd
import numpy as np

# ============================================================
# DineIQ Analytics - Data Processing & Integration
# ============================================================
# Purpose:
#   - Read cleaned datasets
#   - Integrate related datasets
#   - Create analytical features
#   - Prepare model-ready analytical datasets
#   - Generate summary datasets for EDA / ML
#
# Analytical accounting rule (documented decision):
#   Revenue, sales and performance analytics are computed on
#   COMPLETED orders only. Cancelled orders remain in
#   orders_processed.csv (flagged) for data-quality and
#   cancellation-behaviour analysis but never contribute to
#   revenue figures.
#
# Raw data is NEVER modified.
# ============================================================

BASE = Path(__file__).resolve().parents[2]

RUN_TIME = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ============================================================
# Helper functions
# ============================================================

def read_csv(base_dir: Path, name: str) -> pd.DataFrame:
    path = Path(base_dir) / name
    print(f"Loading {name}...")
    df = pd.read_csv(path, low_memory=False)
    print(f"  Rows: {len(df):,} | Columns: {len(df.columns)}")
    return df


def save(output_dir: Path, df: pd.DataFrame, filename: str) -> Path:
    path = Path(output_dir) / filename
    df.to_csv(path, index=False)
    print(f"  Saved: {filename} ({len(df):,} rows)")
    return path


def safe_divide(a, b):
    return np.where(
        pd.to_numeric(b, errors="coerce").fillna(0) != 0,
        pd.to_numeric(a, errors="coerce").fillna(0)
        / pd.to_numeric(b, errors="coerce"),
        0
    )


# ============================================================
# Main
# ============================================================

def main(
    processed_dir=None,
    output_dir=None,
    reports_dir=None,
):

    if processed_dir is None:
        processed_dir = BASE / "processed_data"
    if output_dir is None:
        output_dir = Path(processed_dir) / "analytics"
    if reports_dir is None:
        reports_dir = BASE / "reports"

    processed_dir = Path(processed_dir)
    output_dir = Path(output_dir)
    reports_dir = Path(reports_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 75)
    print("DineIQ Analytics - Data Processing & Integration")
    print("=" * 75)
    print(f"Input : {processed_dir}")
    print(f"Output: {output_dir}")
    print()

    # ==========================================================
    # 1. Load core reference datasets
    # ==========================================================

    locations = read_csv(processed_dir, "locations.csv")
    restaurants = read_csv(processed_dir, "restaurants.csv")
    categories = read_csv(processed_dir, "menu_categories.csv")
    menu = read_csv(processed_dir, "menu_items.csv")
    customers = read_csv(processed_dir, "customers.csv")

    for col in ["base_price", "cost_price"]:
        menu[col] = pd.to_numeric(menu[col], errors="coerce")

    customers["registration_date"] = pd.to_datetime(
        customers["registration_date"], errors="coerce"
    )
    menu["launch_date"] = pd.to_datetime(menu["launch_date"], errors="coerce")
    restaurants["opening_date"] = pd.to_datetime(
        restaurants["opening_date"], errors="coerce"
    )

    # ==========================================================
    # 2. Enriched menu reference
    # ==========================================================

    print()
    print("Creating enriched menu reference...")

    menu_enriched = menu.merge(categories, on="category_id", how="left")
    menu_enriched = menu_enriched.merge(
        restaurants[["restaurant_id", "restaurant_name", "location_id", "restaurant_type"]],
        on="restaurant_id",
        how="left",
    )
    menu_enriched = menu_enriched.merge(
        locations[["location_id", "city_area"]],
        on="location_id",
        how="left",
    )

    menu_enriched["estimated_unit_profit"] = (
        menu_enriched["base_price"] - menu_enriched["cost_price"]
    )
    menu_enriched["estimated_margin_percentage"] = np.where(
        menu_enriched["base_price"] > 0,
        (menu_enriched["estimated_unit_profit"] / menu_enriched["base_price"]) * 100,
        0
    )

    save(output_dir, menu_enriched, "menu_enriched.csv")

    # ==========================================================
    # 3. Process orders
    # ==========================================================

    print()
    print("Processing orders...")

    orders = read_csv(processed_dir, "orders.csv")
    orders["order_date"] = pd.to_datetime(orders["order_date"], errors="coerce")

    for col in ["subtotal", "discount_amount", "tax_amount", "delivery_fee", "total_amount"]:
        orders[col] = pd.to_numeric(orders[col], errors="coerce")

    # Completion flag - the core analytical accounting rule.
    orders["is_completed"] = orders["order_status"].astype(str).str.strip() == "Completed"

    # Promotion flag.
    # Note: empty promotion_id fields are read back from CSV as NaN,
    # so they must be normalized to "" BEFORE any string comparison.
    # The column also comes back as float64 (56.0); convert to a clean
    # integer string ("56") so downstream joins match promotions.
    if "promotion_id" not in orders.columns:
        orders["promotion_id"] = ""
    orders["promotion_id"] = orders["promotion_id"].apply(
        lambda x: "" if pd.isna(x) else str(int(x))
    )
    orders["is_promo_order"] = orders["promotion_id"] != ""

    # Date-based analytical features.
    orders["order_year"] = orders["order_date"].dt.year
    orders["order_month"] = orders["order_date"].dt.month
    orders["order_month_name"] = orders["order_date"].dt.month_name()
    orders["order_week"] = orders["order_date"].dt.isocalendar().week.astype(int)
    orders["order_day"] = orders["order_date"].dt.day
    orders["day_of_week"] = orders["order_date"].dt.day_name()
    orders["is_weekend"] = orders["order_date"].dt.dayofweek >= 5

    orders["order_hour"] = pd.to_datetime(
        orders["order_time"], format="%H:%M:%S", errors="coerce"
    ).dt.hour

    orders["time_period"] = np.select(
        [
            orders["order_hour"].between(7, 10),
            orders["order_hour"].between(11, 14),
            orders["order_hour"].between(15, 17),
            orders["order_hour"].between(18, 21),
        ],
        ["Morning", "Lunch Peak", "Afternoon", "Dinner Peak"],
        default="Late / Off-Peak",
    )

    orders["discount_rate_percentage"] = np.where(
        orders["subtotal"] > 0,
        (orders["discount_amount"] / orders["subtotal"]) * 100,
        0
    )

    order_value_threshold = orders["total_amount"].quantile(0.90)
    orders["is_high_value_order"] = orders["total_amount"] >= order_value_threshold

    save(output_dir, orders, "orders_processed.csv")

    # Completed orders drive every revenue-based analysis.
    orders_completed = orders.loc[orders["is_completed"]].copy()

    # ==========================================================
    # 4. Process order items
    # ==========================================================

    print()
    print("Processing order items...")

    order_items = read_csv(processed_dir, "order_items.csv")

    for col in ["quantity", "unit_price", "discount_amount", "line_total"]:
        order_items[col] = pd.to_numeric(order_items[col], errors="coerce")

    order_items_enriched = order_items.merge(
        menu[["menu_item_id", "restaurant_id", "category_id", "item_name", "base_price", "cost_price"]],
        on="menu_item_id",
        how="left",
        suffixes=("", "_menu"),
    )
    order_items_enriched = order_items_enriched.merge(
        categories[["category_id", "category_name"]],
        on="category_id",
        how="left",
    )
    order_items_enriched = order_items_enriched.merge(
        restaurants[["restaurant_id", "restaurant_name", "location_id", "restaurant_type"]],
        on="restaurant_id",
        how="left",
    )
    order_items_enriched = order_items_enriched.merge(
        locations[["location_id", "city_area"]],
        on="location_id",
        how="left",
    )

    order_items_enriched["gross_revenue"] = (
        order_items_enriched["quantity"] * order_items_enriched["unit_price"]
    )
    order_items_enriched["estimated_cost"] = (
        order_items_enriched["quantity"] * order_items_enriched["cost_price"]
    )
    order_items_enriched["estimated_profit"] = (
        order_items_enriched["gross_revenue"]
        - order_items_enriched["discount_amount"]
        - order_items_enriched["estimated_cost"]
    )
    order_items_enriched["estimated_margin_percentage"] = np.where(
        order_items_enriched["gross_revenue"] > 0,
        (order_items_enriched["estimated_profit"] / order_items_enriched["gross_revenue"]) * 100,
        0
    )

    # Order context (date + completion) for time-based item analytics.
    order_items_enriched = order_items_enriched.merge(
        orders[["order_id", "customer_id", "order_date", "order_status",
                "is_completed", "is_promo_order"]],
        on="order_id",
        how="left",
    )
    order_items_enriched["order_date"] = pd.to_datetime(
        order_items_enriched["order_date"], errors="coerce"
    )

    save(output_dir, order_items_enriched, "order_items_integrated.csv")

    # Completed-order view for revenue analytics.
    items_completed = order_items_enriched.loc[
        order_items_enriched["is_completed"]
    ].copy()

    # ==========================================================
    # 5. Integrated order-level analytical dataset
    # ==========================================================

    print()
    print("Creating integrated order dataset...")

    order_customer = orders.merge(
        customers[["customer_id", "first_name", "last_name", "gender",
                   "date_of_birth", "registration_date", "location_id",
                   "preferred_channel", "preferred_category", "email"]],
        on="customer_id",
        how="left",
        suffixes=("", "_customer"),
    )
    order_customer = order_customer.merge(
        restaurants[["restaurant_id", "restaurant_name", "location_id", "restaurant_type"]],
        on="restaurant_id",
        how="left",
        suffixes=("", "_restaurant"),
    )
    order_customer = order_customer.merge(
        locations[["location_id", "city_area"]],
        left_on="location_id_restaurant",
        right_on="location_id",
        how="left",
        suffixes=("", "_location"),
    )

    save(output_dir, order_customer, "orders_integrated.csv")

    # ==========================================================
    # 6. Customer analytical summary (completed orders only)
    # ==========================================================

    print()
    print("Creating customer analytics...")

    customer_orders = orders_completed.groupby("customer_id").agg(
        total_orders=("order_id", "nunique"),
        total_spend=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        total_discount_received=("discount_amount", "sum"),
        first_order_date=("order_date", "min"),
        last_order_date=("order_date", "max"),
        promo_orders=("is_promo_order", "sum"),
    ).reset_index()

    customer_item_summary = items_completed.groupby("customer_id").agg(
        total_items_purchased=("quantity", "sum"),
        estimated_revenue=("gross_revenue", "sum"),
        estimated_profit=("estimated_profit", "sum"),
    ).reset_index()

    customer_analytics = customers.merge(customer_orders, on="customer_id", how="left")
    customer_analytics = customer_analytics.merge(customer_item_summary, on="customer_id", how="left")

    for col in ["total_orders", "total_spend", "average_order_value",
                "total_discount_received", "promo_orders",
                "total_items_purchased", "estimated_revenue", "estimated_profit"]:
        customer_analytics[col] = customer_analytics[col].fillna(0)

    customer_analytics["customer_lifetime_days"] = (
        customer_analytics["last_order_date"]
        - customer_analytics["registration_date"]
    ).dt.days

    customer_analytics["orders_per_month"] = np.where(
        customer_analytics["customer_lifetime_days"] > 0,
        customer_analytics["total_orders"] / (customer_analytics["customer_lifetime_days"] / 30),
        customer_analytics["total_orders"],
    )

    customer_spend_threshold = customer_analytics["total_spend"].quantile(0.90)
    customer_analytics["customer_value_segment"] = np.select(
        [
            customer_analytics["total_spend"] >= customer_spend_threshold,
            customer_analytics["total_orders"] >= 10,
            customer_analytics["total_orders"] >= 3,
        ],
        ["High Value", "Frequent", "Regular"],
        default="Low Activity",
    )

    save(output_dir, customer_analytics, "customer_analytics.csv")

    # ==========================================================
    # 7. Menu item performance (completed orders only)
    # ==========================================================

    print()
    print("Creating menu item performance...")

    menu_sales = items_completed.groupby(
        ["menu_item_id", "item_name", "category_id", "category_name",
         "restaurant_id", "restaurant_name", "city_area"]
    ).agg(
        units_sold=("quantity", "sum"),
        order_lines=("order_item_id", "count"),
        revenue=("gross_revenue", "sum"),
        estimated_cost=("estimated_cost", "sum"),
        estimated_profit=("estimated_profit", "sum"),
        average_selling_price=("unit_price", "mean"),
    ).reset_index()

    menu_sales = menu_sales.merge(
        menu[["menu_item_id", "base_price", "cost_price", "is_available", "item_status"]],
        on="menu_item_id",
        how="left",
    )

    menu_sales["profit_margin_percentage"] = np.where(
        menu_sales["revenue"] > 0,
        (menu_sales["estimated_profit"] / menu_sales["revenue"]) * 100,
        0
    )

    sales_median = menu_sales["units_sold"].median()
    profit_median = menu_sales["estimated_profit"].median()

    menu_sales["sales_classification"] = np.select(
        [menu_sales["units_sold"] >= sales_median,
         menu_sales["units_sold"] < sales_median],
        ["High Sales", "Low Sales"],
        default="Unknown",
    )
    menu_sales["profitability_classification"] = np.select(
        [menu_sales["estimated_profit"] >= profit_median,
         menu_sales["estimated_profit"] < profit_median],
        ["High Profit", "Low Profit"],
        default="Unknown",
    )
    menu_sales["menu_business_classification"] = (
        menu_sales["sales_classification"] + " / " + menu_sales["profitability_classification"]
    )

    save(output_dir, menu_sales, "menu_item_performance.csv")

    # ==========================================================
    # 8. Restaurant performance (completed orders only)
    # ==========================================================

    print()
    print("Creating restaurant performance...")

    restaurant_orders = orders_completed.groupby("restaurant_id").agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        total_discount=("discount_amount", "sum"),
    ).reset_index()

    restaurant_items = items_completed.groupby("restaurant_id").agg(
        units_sold=("quantity", "sum"),
        estimated_profit=("estimated_profit", "sum"),
    ).reset_index()

    restaurant_performance = restaurants.merge(restaurant_orders, on="restaurant_id", how="left")
    restaurant_performance = restaurant_performance.merge(restaurant_items, on="restaurant_id", how="left")
    restaurant_performance = restaurant_performance.merge(locations, on="location_id", how="left")

    for col in ["total_orders", "total_sales", "average_order_value",
                "total_discount", "units_sold", "estimated_profit"]:
        restaurant_performance[col] = restaurant_performance[col].fillna(0)

    save(output_dir, restaurant_performance, "restaurant_performance.csv")

    # ==========================================================
    # 9. Daily / monthly sales analytics (completed only)
    # ==========================================================

    print()
    print("Creating sales trend analytics...")

    daily_sales = orders_completed.groupby("order_date").agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        total_discount=("discount_amount", "sum"),
    ).reset_index()

    daily_sales["day_of_week"] = daily_sales["order_date"].dt.day_name()
    daily_sales["is_weekend"] = daily_sales["order_date"].dt.dayofweek >= 5
    daily_sales["month"] = daily_sales["order_date"].dt.to_period("M").astype(str)

    save(output_dir, daily_sales, "daily_sales.csv")

    monthly_sales = orders_completed.groupby(orders_completed["order_date"].dt.to_period("M")).agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        total_discount=("discount_amount", "sum"),
    ).reset_index()

    monthly_sales["month"] = monthly_sales["order_date"].astype(str)
    monthly_sales = monthly_sales.drop(columns=["order_date"])

    save(output_dir, monthly_sales, "monthly_sales.csv")

    # ==========================================================
    # 10. Channel analytics (completed only)
    # ==========================================================

    print()
    print("Creating channel analytics...")

    channel_analysis = orders_completed.groupby("order_channel").agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        total_discount=("discount_amount", "sum"),
    ).reset_index()

    channel_analysis["sales_percentage"] = (
        channel_analysis["total_sales"] / channel_analysis["total_sales"].sum()
    ) * 100

    save(output_dir, channel_analysis, "channel_analysis.csv")

    # ==========================================================
    # 11. Weekend and peak-hour analytics (completed only)
    # ==========================================================

    print()
    print("Creating time-pattern analytics...")

    time_analysis = orders_completed.groupby(["day_of_week", "is_weekend", "time_period"]).agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
    ).reset_index()

    save(output_dir, time_analysis, "time_pattern_analysis.csv")

    # ==========================================================
    # 12. Wastage analytics
    # ==========================================================

    print()
    print("Processing wastage...")

    wastage = read_csv(processed_dir, "wastage.csv")
    wastage["wastage_date"] = pd.to_datetime(wastage["wastage_date"], errors="coerce")
    wastage["quantity_wasted"] = pd.to_numeric(wastage["quantity_wasted"], errors="coerce")
    wastage["estimated_cost"] = pd.to_numeric(wastage["estimated_cost"], errors="coerce")

    wastage_enriched = wastage.merge(
        menu[["menu_item_id", "item_name", "category_id", "cost_price"]],
        on="menu_item_id",
        how="left",
    )
    wastage_enriched = wastage_enriched.merge(
        restaurants[["restaurant_id", "restaurant_name"]],
        on="restaurant_id",
        how="left",
    )
    wastage_enriched = wastage_enriched.merge(
        categories[["category_id", "category_name"]],
        on="category_id",
        how="left",
    )
    wastage_enriched["wastage_month"] = wastage_enriched["wastage_date"].dt.to_period("M").astype(str)

    save(output_dir, wastage_enriched, "wastage_integrated.csv")

    wastage_item_analysis = wastage_enriched.groupby(
        ["menu_item_id", "item_name", "category_name"]
    ).agg(
        quantity_wasted=("quantity_wasted", "sum"),
        estimated_wastage_cost=("estimated_cost", "sum"),
        wastage_records=("wastage_id", "count"),
    ).reset_index().sort_values("estimated_wastage_cost", ascending=False)

    save(output_dir, wastage_item_analysis, "wastage_item_analysis.csv")

    # ==========================================================
    # 13. Ratings analytics
    # ==========================================================

    print()
    print("Processing ratings...")

    ratings = read_csv(processed_dir, "ratings.csv")
    ratings["review_date"] = pd.to_datetime(ratings["review_date"], errors="coerce")
    ratings["rating"] = pd.to_numeric(ratings["rating"], errors="coerce")

    ratings_enriched = ratings.merge(
        menu[["menu_item_id", "item_name", "category_id"]],
        on="menu_item_id",
        how="left",
    )
    ratings_enriched = ratings_enriched.merge(
        categories[["category_id", "category_name"]],
        on="category_id",
        how="left",
    )
    ratings_enriched = ratings_enriched.merge(
        restaurants[["restaurant_id", "restaurant_name"]],
        on="restaurant_id",
        how="left",
    )

    save(output_dir, ratings_enriched, "ratings_integrated.csv")

    rating_item_analysis = ratings_enriched.groupby(
        ["menu_item_id", "item_name", "category_name"]
    ).agg(
        rating_count=("rating_id", "count"),
        average_rating=("rating", "mean"),
        minimum_rating=("rating", "min"),
        maximum_rating=("rating", "max"),
    ).reset_index()

    rating_item_analysis["rating_anomaly_flag"] = (
        (rating_item_analysis["average_rating"] < 2)
        | (rating_item_analysis["average_rating"] > 4.8)
    )

    save(output_dir, rating_item_analysis, "rating_item_analysis.csv")

    # ==========================================================
    # 14. Inventory analytics
    # ==========================================================

    print()
    print("Processing inventory...")

    inventory = read_csv(processed_dir, "inventory.csv")
    for col in ["opening_stock", "received_quantity", "sold_quantity",
                "closing_stock", "reorder_level"]:
        inventory[col] = pd.to_numeric(inventory[col], errors="coerce")
    inventory["inventory_date"] = pd.to_datetime(inventory["inventory_date"], errors="coerce")

    inventory_enriched = inventory.merge(
        menu[["menu_item_id", "item_name", "category_id"]],
        on="menu_item_id",
        how="left",
    )
    inventory_enriched = inventory_enriched.merge(
        restaurants[["restaurant_id", "restaurant_name"]],
        on="restaurant_id",
        how="left",
    )
    inventory_enriched["stock_turnover_indicator"] = np.where(
        inventory_enriched["opening_stock"] > 0,
        inventory_enriched["sold_quantity"] / inventory_enriched["opening_stock"],
        0
    )
    inventory_enriched["low_stock_flag"] = (
        inventory_enriched["closing_stock"] <= inventory_enriched["reorder_level"]
    )

    save(output_dir, inventory_enriched, "inventory_integrated.csv")

    # ==========================================================
    # 15. Price sensitivity preparation
    # ==========================================================

    print()
    print("Creating pricing analytics...")

    pricing = read_csv(processed_dir, "pricing_history.csv")
    pricing["effective_from"] = pd.to_datetime(pricing["effective_from"], errors="coerce")
    pricing["effective_to"] = pd.to_datetime(pricing["effective_to"], errors="coerce")
    pricing["old_price"] = pd.to_numeric(pricing["old_price"], errors="coerce")
    pricing["new_price"] = pd.to_numeric(pricing["new_price"], errors="coerce")

    pricing["price_change"] = pricing["new_price"] - pricing["old_price"]
    pricing["price_change_percentage"] = np.where(
        pricing["old_price"] > 0,
        (pricing["price_change"] / pricing["old_price"]) * 100,
        0
    )

    pricing = pricing.merge(
        menu[["menu_item_id", "item_name", "category_id"]],
        on="menu_item_id",
        how="left",
    )
    pricing = pricing.merge(
        categories[["category_id", "category_name"]],
        on="category_id",
        how="left",
    )

    save(output_dir, pricing, "pricing_analysis.csv")

    # ==========================================================
    # 16. Promotion usage summary
    # ==========================================================

    print()
    print("Creating promotion usage summary...")

    promotions = read_csv(processed_dir, "promotions.csv")

    promo_usage = (
        orders_completed[orders_completed["is_promo_order"]]
        .groupby("promotion_id")
        .agg(
            promo_orders=("order_id", "nunique"),
            promo_sales=("total_amount", "sum"),
            promo_discount=("discount_amount", "sum"),
            average_order_value=("total_amount", "mean"),
        )
        .reset_index()
    )

    promotion_usage = promotions.assign(
        promotion_id=promotions["promotion_id"].astype(str)
    ).merge(
        promo_usage.assign(promotion_id=promo_usage["promotion_id"].astype(str)),
        on="promotion_id",
        how="left",
    )
    for col in ["promo_orders", "promo_sales", "promo_discount", "average_order_value"]:
        promotion_usage[col] = promotion_usage[col].fillna(0)

    save(output_dir, promotion_usage, "promotion_usage.csv")

    # ==========================================================
    # 17. Processing summary
    # ==========================================================

    print()
    print("Creating processing summary...")

    summary = [
        {"dataset": "customers", "purpose": "Customer analytics and segmentation", "rows": len(customer_analytics)},
        {"dataset": "orders", "purpose": "Order processing and time-based analysis", "rows": len(orders)},
        {"dataset": "orders_completed", "purpose": "Completed orders used for revenue analytics", "rows": len(orders_completed)},
        {"dataset": "order_items", "purpose": "Sales, revenue and profit calculations", "rows": len(order_items_enriched)},
        {"dataset": "menu_items", "purpose": "Menu performance and profitability", "rows": len(menu_sales)},
        {"dataset": "restaurants", "purpose": "Restaurant performance", "rows": len(restaurant_performance)},
        {"dataset": "wastage", "purpose": "Wastage and cost analysis", "rows": len(wastage_enriched)},
        {"dataset": "ratings", "purpose": "Rating and feedback analysis", "rows": len(ratings_enriched)},
        {"dataset": "inventory", "purpose": "Inventory and stock analysis", "rows": len(inventory_enriched)},
        {"dataset": "pricing_history", "purpose": "Price-change and price-sensitivity preparation", "rows": len(pricing)},
        {"dataset": "promotions", "purpose": "Promotion usage summary", "rows": len(promotion_usage)},
    ]

    processing_summary = pd.DataFrame(summary)
    processing_summary["processing_run"] = RUN_TIME
    processing_summary.to_csv(reports_dir / "processing_summary.csv", index=False)

    print()
    print("=" * 75)
    print("DATA PROCESSING & INTEGRATION COMPLETE")
    print("=" * 75)
    print(f"Analytics output: {output_dir}")
    print(f"Processing report: {reports_dir / 'processing_summary.csv'}")
    print()
    print("Generated analytical datasets:")
    for file in sorted(output_dir.glob("*.csv")):
        print(f"  - {file.name}")
    print()
    print("Raw data was NOT modified.")
    print("Cleaned source data was NOT modified.")
    print("Analytical datasets were generated from processed_data.")
    print("=" * 75)

    return {
        "output_dir": output_dir,
        "reports_dir": reports_dir,
    }


if __name__ == "__main__":
    main()
