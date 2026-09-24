"""
Explicit ingestion schemas for the DineIQ Spark pipeline.

The SRS requires ingestion with BOTH an explicit schema and schema
inference. The explicit DDL below is the authoritative one; when the
Spark engine runs, schema inference is additionally performed during
the validation stage (compareInferred) and any drift is reported.

Pandas dtypes mirror the DDL for the fallback engine.
"""

from __future__ import annotations

# ------------------------------------------------------------------
# PySpark DDL strings
# ------------------------------------------------------------------

SPARK_DDL = {
    "locations": (
        "location_id INT, city_area STRING, latitude DOUBLE, longitude DOUBLE"
    ),
    "restaurants": (
        "restaurant_id INT, restaurant_name STRING, location_id INT, "
        "restaurant_type STRING, opening_date STRING"
    ),
    "menu_categories": (
        "category_id INT, category_name STRING"
    ),
    "menu_items": (
        "menu_item_id INT, restaurant_id INT, category_id INT, item_name STRING, "
        "base_price DOUBLE, cost_price DOUBLE, is_available INT, "
        "launch_date STRING, item_status STRING"
    ),
    "customers": (
        "customer_id INT, first_name STRING, last_name STRING, gender STRING, "
        "date_of_birth STRING, registration_date STRING, location_id INT, "
        "preferred_channel STRING, preferred_category STRING, "
        "email STRING, phone STRING"
    ),
    "orders": (
        "order_id INT, customer_id INT, restaurant_id INT, order_date STRING, "
        "order_time STRING, order_status STRING, order_channel STRING, "
        "payment_method STRING, promotion_id STRING, subtotal DOUBLE, "
        "discount_amount DOUBLE, tax_amount DOUBLE, delivery_fee DOUBLE, "
        "total_amount DOUBLE"
    ),
    "order_items": (
        "order_item_id INT, order_id INT, menu_item_id INT, quantity INT, "
        "unit_price DOUBLE, discount_amount DOUBLE, line_total DOUBLE"
    ),
    "pricing_history": (
        "price_history_id INT, menu_item_id INT, effective_from STRING, "
        "effective_to STRING, old_price DOUBLE, new_price DOUBLE, "
        "change_reason STRING"
    ),
    "promotions": (
        "promotion_id INT, promotion_name STRING, promotion_type STRING, "
        "menu_item_id INT, category_id INT, restaurant_id INT, "
        "start_date STRING, end_date STRING, discount_percentage INT, "
        "minimum_order_value DOUBLE, usage_limit INT"
    ),
    "ratings": (
        "rating_id INT, customer_id INT, order_id INT, menu_item_id INT, "
        "restaurant_id INT, rating INT, review_date STRING, review_text STRING"
    ),
    "inventory": (
        "inventory_id INT, restaurant_id INT, menu_item_id INT, "
        "inventory_date STRING, opening_stock INT, received_quantity INT, "
        "sold_quantity INT, closing_stock INT, reorder_level INT, "
        "stock_status STRING"
    ),
    "wastage": (
        "wastage_id INT, restaurant_id INT, menu_item_id INT, "
        "wastage_date STRING, quantity_wasted INT, wastage_reason STRING, "
        "estimated_cost DOUBLE"
    ),
}

# ------------------------------------------------------------------
# Pandas dtypes (fallback engine)
# ------------------------------------------------------------------

PANDAS_DTYPES = {
    "locations": {
        "location_id": "int64", "city_area": "string",
        "latitude": "float64", "longitude": "float64",
    },
    "restaurants": {
        "restaurant_id": "int64", "restaurant_name": "string",
        "location_id": "int64", "restaurant_type": "string",
        "opening_date": "string",
    },
    "menu_categories": {
        "category_id": "int64", "category_name": "string",
    },
    "menu_items": {
        "menu_item_id": "int64", "restaurant_id": "int64",
        "category_id": "int64", "item_name": "string",
        "base_price": "float64", "cost_price": "float64",
        "is_available": "int64", "launch_date": "string",
        "item_status": "string",
    },
    "customers": {
        "customer_id": "int64", "first_name": "string", "last_name": "string",
        "gender": "string", "date_of_birth": "string",
        "registration_date": "string", "location_id": "int64",
        "preferred_channel": "string", "preferred_category": "string",
        "email": "string", "phone": "string",
    },
    "orders": {
        "order_id": "int64", "customer_id": "int64",
        "restaurant_id": "int64", "order_date": "string",
        "order_time": "string", "order_status": "string",
        "order_channel": "string", "payment_method": "string",
        "promotion_id": "string", "subtotal": "float64",
        "discount_amount": "float64", "tax_amount": "float64",
        "delivery_fee": "float64", "total_amount": "float64",
    },
    "order_items": {
        "order_item_id": "int64", "order_id": "int64",
        "menu_item_id": "int64", "quantity": "int64",
        "unit_price": "float64", "discount_amount": "float64",
        "line_total": "float64",
    },
    "pricing_history": {
        "price_history_id": "int64", "menu_item_id": "int64",
        "effective_from": "string", "effective_to": "string",
        "old_price": "float64", "new_price": "float64",
        "change_reason": "string",
    },
    "promotions": {
        "promotion_id": "int64", "promotion_name": "string",
        "promotion_type": "string", "menu_item_id": "int64",
        "category_id": "int64", "restaurant_id": "int64",
        "start_date": "string", "end_date": "string",
        "discount_percentage": "int64", "minimum_order_value": "float64",
        "usage_limit": "int64",
    },
    "ratings": {
        "rating_id": "int64", "customer_id": "int64",
        "order_id": "int64", "menu_item_id": "int64",
        "restaurant_id": "int64", "rating": "int64",
        "review_date": "string", "review_text": "string",
    },
    "inventory": {
        "inventory_id": "int64", "restaurant_id": "int64",
        "menu_item_id": "int64", "inventory_date": "string",
        "opening_stock": "int64", "received_quantity": "int64",
        "sold_quantity": "int64", "closing_stock": "int64",
        "reorder_level": "int64", "stock_status": "string",
    },
    "wastage": {
        "wastage_id": "int64", "restaurant_id": "int64",
        "menu_item_id": "int64", "wastage_date": "string",
        "quantity_wasted": "int64", "wastage_reason": "string",
        "estimated_cost": "float64",
    },
}

# ------------------------------------------------------------------
# Metadata: primary keys and the analytical period
# ------------------------------------------------------------------

PRIMARY_KEYS = {
    "locations": "location_id",
    "restaurants": "restaurant_id",
    "menu_categories": "category_id",
    "menu_items": "menu_item_id",
    "customers": "customer_id",
    "orders": "order_id",
    "order_items": "order_item_id",
    "pricing_history": "price_history_id",
    "promotions": "promotion_id",
    "ratings": "rating_id",
    "inventory": "inventory_id",
    "wastage": "wastage_id",
}

DATASETS = list(SPARK_DDL.keys())

ANALYSIS_START = "2025-01-01"
ANALYSIS_END = "2025-12-31"

# Partition columns used when writing the validated Parquet layer.
PARTITION_BY = {
    "orders": "order_month",          # date-partitioned transaction data
    "order_items": "restaurant_id",   # location-level workload locality
    "ratings": None,
    "inventory": None,
    "wastage": None,
}
