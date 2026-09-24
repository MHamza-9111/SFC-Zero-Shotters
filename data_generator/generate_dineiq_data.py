"""
DineIQ Analytics - SRS-aligned synthetic data generator.

Generates raw synthetic datasets for:
Customers, Restaurants, Locations, Menu Categories, Menu Items,
Orders, Order Items, Pricing History, Promotions, Ratings,
Inventory, and Wastage.

SRS relationship guarantees (fixed in this version):
  1. Every order item references a menu item that belongs to the
     order's restaurant (no restaurant/menu mismatch).
  2. Every order that uses a promotion references a promotion that is
     active on the order date at the order's restaurant.
  3. Every rating references a menu item that actually appears in the
     referenced order.
  4. Pricing history, inventory and wastage only reference
     valid menu items and their owning restaurants.

Realistic difficult cases are deliberately injected (small, documented
rates from the config) so the cleaning/processing stage has real
data-quality work to detect and handle:
  - missing values (customer email, order payment method)
  - duplicate customer records
  - invalid order-line quantities and negative line totals
  - price outlier order lines
  - order totals that no longer match their line totals
  - order lines that look like business duplicates within one order
  - ratings for items that are NOT in the referenced order
  - orders dated outside the 12-month analysis period

Academic/project-scale implementation.
"""

from __future__ import annotations

import csv
import random
from bisect import bisect_left
from datetime import date, timedelta
from pathlib import Path

import yaml


BASE = Path(__file__).resolve().parents[1]
CONFIG_PATH = BASE / "config" / "data_generation_config.yaml"


# ============================================================
# CONSTANTS
# ============================================================

CATEGORIES = [
    "Burgers",
    "Pizza",
    "Biryani",
    "Rice",
    "BBQ",
    "Pasta",
    "Sandwiches",
    "Desserts",
    "Beverages",
    "Salads",
]

CHANNELS = [
    "Dine-in",
    "Takeaway",
    "Website/App",
    "Third-party Delivery",
]

PAYMENTS = [
    "Cash",
    "Card",
    "Online Wallet",
]

STATUSES = [
    "Completed",
    "Completed",
    "Completed",
    "Completed",
    "Cancelled",
]

WASTAGE_REASONS = [
    "Expired",
    "Overproduction",
    "Damaged",
    "Preparation Error",
    "Spoilage",
    "Unsold",
]

RESTAURANT_TYPES = [
    "Casual Dining",
    "Fast Food",
    "Cafe",
    "Family Restaurant",
]

# Monthly demand seasonality (Jan..Dec).
# Creates a real signal for the demand-forecasting requirement.
MONTH_WEIGHTS = {
    1: 0.85,
    2: 0.90,
    3: 0.95,
    4: 1.00,
    5: 1.05,
    6: 1.15,
    7: 1.10,
    8: 1.05,
    9: 0.95,
    10: 1.00,
    11: 1.10,
    12: 1.25,
}


# ============================================================
# CONFIG
# ============================================================

def load_config(path: Path = CONFIG_PATH) -> dict:
    defaults = {
        "seed": 42,
        "scale": {
            "customers": 50000,
            "restaurants": 20,
            "locations": 20,
            "categories": 10,
            "menu_items": 150,
            "orders": 100000,
            "order_items_min": 1000000,
            "ratings": 100000,
            "wastage": 50000,
            "months": 12,
        },
        "quality": {
            "missing_value_rate": 0.01,
            "duplicate_rate": 0.005,
            "invalid_value_rate": 0.002,
            "outlier_rate": 0.003,
        },
        "time": {"start_date": "2025-01-01", "end_date": "2025-12-31"},
        "output": {
            "raw_dir": "Main/raw_data",
            "processed_dir": "Ali Jaan/processed_data",
            "parquet_dir": "Main/parquet_data",
        },
    }

    if not path.exists():
        return defaults

    with path.open("r", encoding="utf-8") as f:
        loaded = yaml.safe_load(f) or {}

    for section in ("scale", "quality", "time", "output"):
        for key, value in (loaded.get(section) or {}).items():
            defaults[section][key] = value
    if "seed" in loaded:
        defaults["seed"] = loaded["seed"]

    return defaults


# ============================================================
# HELPERS
# ============================================================

def ensure_dirs(raw_dir: Path):
    raw_dir.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=fields,
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(rows)


def daterange_days(start: date, end: date) -> int:
    return (end - start).days + 1


def build_day_sampler(start: date, end: date):
    """
    Weighted daily date sampler.

    Combines monthly seasonality with weekend uplift so the
    generated demand has a real, learnable time pattern.
    """

    days = []
    weights = []

    cursor = start
    while cursor <= end:
        month_weight = MONTH_WEIGHTS[cursor.month]
        day_weight = month_weight * (1.35 if cursor.weekday() >= 5 else 1.0)
        days.append(cursor)
        weights.append(day_weight)
        cursor += timedelta(days=1)

    total = sum(weights)
    cumulative = []
    running = 0.0
    for w in weights:
        running += w
        cumulative.append(running)

    def sample() -> date:
        r = random.random() * total
        idx = bisect_left(cumulative, r)
        if idx >= len(days):
            idx = len(days) - 1
        return days[idx]

    return sample


def realistic_order_time() -> str:
    """
    Creates realistic restaurant ordering hours with
    lunch and dinner peaks.
    """

    period = random.choices(
        ["morning", "lunch", "afternoon", "dinner", "late"],
        weights=[5, 30, 10, 45, 10],
        k=1,
    )[0]

    if period == "morning":
        hour = random.randint(9, 11)
    elif period == "lunch":
        hour = random.randint(12, 14)
    elif period == "afternoon":
        hour = random.randint(15, 17)
    elif period == "dinner":
        hour = random.randint(18, 21)
    else:
        hour = random.randint(21, 22)

    minute = random.randint(0, 59)

    return f"{hour:02d}:{minute:02d}:00"


# ============================================================
# LOCATIONS
# ============================================================

def make_locations(n=20):
    rows = []

    areas = [
        "North",
        "South",
        "East",
        "West",
        "Central",
        "Garden",
        "Clifton",
        "Gulshan",
        "Defence",
        "Korangi",
    ]

    for i in range(1, n + 1):
        rows.append({
            "location_id": i,
            "city_area": f"{areas[(i - 1) % len(areas)]}-{i}",
            "latitude": round(
                24.75 + random.uniform(-0.10, 0.10),
                6,
            ),
            "longitude": round(
                67.00 + random.uniform(-0.10, 0.10),
                6,
            ),
        })

    return rows


# ============================================================
# RESTAURANTS
# ============================================================

def make_restaurants(n=20):
    rows = []

    for i in range(1, n + 1):
        rows.append({
            "restaurant_id": i,
            "restaurant_name": f"Restaurant {i:03d}",
            "location_id": i,
            "restaurant_type": random.choice(RESTAURANT_TYPES),
            "opening_date": "2024-01-01",
        })

    return rows


# ============================================================
# MENU CATEGORIES
# ============================================================

def make_categories():
    return [
        {
            "category_id": i,
            "category_name": name,
        }
        for i, name in enumerate(CATEGORIES, 1)
    ]


# ============================================================
# MENU ITEMS
# ============================================================

def make_menu_items(n=150, restaurants=20):
    rows = []

    category_prices = {
        1: (450, 1200),    # Burgers
        2: (700, 1800),    # Pizza
        3: (350, 1000),    # Biryani
        4: (300, 900),     # Rice
        5: (600, 1800),    # BBQ
        6: (500, 1400),    # Pasta
        7: (400, 1100),    # Sandwiches
        8: (250, 800),     # Desserts
        9: (120, 500),     # Beverages
        10: (250, 900),    # Salads
    }

    for i in range(1, n + 1):
        category_id = ((i - 1) % 10) + 1
        # Deterministic spread: every restaurant owns a fair
        # share of the menu (guarantees >= 6 items per restaurant).
        restaurant_id = ((i - 1) % restaurants) + 1

        low, high = category_prices[category_id]
        base_price = random.randint(low, high)

        # Most items have normal margins.
        cost_ratio = random.uniform(0.35, 0.65)

        rows.append({
            "menu_item_id": i,
            "restaurant_id": restaurant_id,
            "category_id": category_id,
            "item_name": f"Menu Item {i:03d}",
            "base_price": base_price,
            "cost_price": round(base_price * cost_ratio, 2),
            "is_available": 1,
            "launch_date": "2025-01-01",
            "item_status": random.choice([
                "Active",
                "Active",
                "Active",
                "Seasonal",
            ]),
            "_popularity_weight": random.choice([1, 1, 1, 2, 3, 5, 8]),
        })

    return rows


# ============================================================
# CUSTOMERS
# ============================================================

def make_customers(n=50000, locations=20):
    rows = []

    for i in range(1, n + 1):
        rows.append({
            "customer_id": i,
            "first_name": f"Customer{i}",
            "last_name": f"User{i}",
            "gender": random.choice(["Male", "Female", "Other"]),
            "date_of_birth": (
                f"{random.randint(1970, 2004)}-"
                f"{random.randint(1, 12):02d}-"
                f"{random.randint(1, 28):02d}"
            ),
            "registration_date": (
                f"2024-{random.randint(1, 12):02d}-"
                f"{random.randint(1, 28):02d}"
            ),
            "location_id": random.randint(1, locations),
            "preferred_channel": random.choice(CHANNELS),
            "preferred_category": random.choice(CATEGORIES),
            "email": f"customer{i}@example.com",
            "phone": f"0300{random.randint(1000000, 9999999)}",
        })

    return rows


# ============================================================
# ORDER GENERATION
# ============================================================

def build_restaurant_item_index(items):
    """restaurant_id -> list of items (only that restaurant's menu)."""

    index = {}
    for item in items:
        index.setdefault(item["restaurant_id"], []).append(item)
    return index


def pick_promotion_for_order(
    order_date: date,
    restaurant_id: int,
    subtotal: float,
    basket,
    promotions_by_restaurant,
    promo_probability: float = 0.25,
):
    """
    Returns (promotion, chosen_line_index) or (None, None).

    A promotion is only applied when:
      - it is active on the order date,
      - it belongs to the order's restaurant,
      - the order meets the minimum order value.
    """

    candidates = promotions_by_restaurant.get(restaurant_id, [])

    eligible = [
        p for p in candidates
        if p["_start"] <= order_date <= p["_end"]
        and p["minimum_order_value"] <= subtotal
    ]

    if not eligible or random.random() >= promo_probability:
        return None, None

    promo = random.choice(eligible)

    # Prefer a line that matches the promoted item exactly.
    chosen = None
    for idx, line in enumerate(basket):
        if line[0]["menu_item_id"] == promo["menu_item_id"]:
            chosen = idx
            break

    # Then prefer a line in the promoted category.
    if chosen is None:
        category_lines = [
            idx for idx, line in enumerate(basket)
            if line[0]["category_id"] == promo["category_id"]
        ]
        if category_lines:
            chosen = random.choice(category_lines)

    # Otherwise any line qualifies (restaurant-level promo).
    if chosen is None:
        chosen = random.randrange(len(basket))

    return promo, chosen


def make_orders_and_items(
    customers,
    restaurants,
    items,
    promotions,
    n_orders=100000,
    min_items=1000000,
    start=date(2025, 1, 1),
    end=date(2025, 12, 31),
):
    orders = []
    order_items = []
    order_line_items = {}  # order_id -> list of menu_item_id

    item_index = build_restaurant_item_index(items)

    promotions_by_restaurant = {}
    for promo in promotions:
        promotions_by_restaurant.setdefault(
            promo["restaurant_id"], []
        ).append(promo)

    sample_day = build_day_sampler(start, end)

    # Guarantee at least the requested number of order lines.
    remaining = max(0, min_items - n_orders)

    basket_extra = [remaining // n_orders] * n_orders
    for i in range(remaining % n_orders):
        basket_extra[i] += 1
    random.shuffle(basket_extra)

    for oid in range(1, n_orders + 1):
        customer = random.choice(customers)
        restaurant = random.choice(restaurants)

        order_date = sample_day()
        order_time = realistic_order_time()

        channel = random.choice(CHANNELS)
        status = random.choice(STATUSES)

        basket_size = 1 + basket_extra[oid - 1]

        # IMPORTANT: only this restaurant's menu items are eligible.
        restaurant_items = item_index.get(restaurant["restaurant_id"], items)
        weights = [x["_popularity_weight"] for x in restaurant_items]

        subtotal = 0.0
        order_lines = []

        for _ in range(basket_size):
            item = random.choices(restaurant_items, weights=weights, k=1)[0]

            quantity = random.choices(
                [1, 2, 3, 4],
                weights=[65, 25, 8, 2],
                k=1,
            )[0]

            unit_price = round(
                float(item["base_price"]) * random.uniform(0.95, 1.05),
                2,
            )

            line_total = round(unit_price * quantity, 2)
            subtotal += line_total

            order_lines.append([
                item,
                quantity,
                unit_price,
                line_total,
                0.0,  # line discount (promotion), filled below
            ])

        # Base order-level discount (loyalty / happy hour style).
        base_discount = round(
            subtotal
            * random.choice([0, 0, 0, 0, 0, 0, 0, 0.05, 0.05, 0.10, 0.10, 0.15]),
            2,
        )

        # Optional promotion, linked consistently.
        promo, promo_line = pick_promotion_for_order(
            order_date,
            restaurant["restaurant_id"],
            subtotal,
            order_lines,
            promotions_by_restaurant,
        )

        promo_discount = 0.0
        promotion_id = ""

        if promo is not None:
            promotion_id = promo["promotion_id"]
            item, quantity, unit_price, _total, _disc = order_lines[promo_line]
            promo_discount = round(
                unit_price * quantity * promo["discount_percentage"] / 100.0,
                2,
            )
            order_lines[promo_line][4] = promo_discount

        discount = round(min(base_discount + promo_discount, subtotal * 0.5), 2)

        tax = round((subtotal - discount) * 0.05, 2)

        delivery_fee = (
            round(random.choice([0, 80, 120, 150]), 2)
            if channel == "Third-party Delivery"
            else 0
        )

        total = round(subtotal - discount + tax + delivery_fee, 2)

        orders.append({
            "order_id": oid,
            "customer_id": customer["customer_id"],
            "restaurant_id": restaurant["restaurant_id"],
            "order_date": order_date.isoformat(),
            "order_time": order_time,
            "order_status": status,
            "order_channel": channel,
            "payment_method": random.choice(PAYMENTS),
            "promotion_id": promotion_id,
            "subtotal": round(subtotal, 2),
            "discount_amount": discount,
            "tax_amount": tax,
            "delivery_fee": delivery_fee,
            "total_amount": total,
        })

        line_menu_ids = []

        for item, quantity, unit_price, line_total, line_discount in order_lines:
            order_items.append({
                "order_item_id": len(order_items) + 1,
                "order_id": oid,
                "menu_item_id": item["menu_item_id"],
                "quantity": quantity,
                "unit_price": unit_price,
                "discount_amount": line_discount,
                "line_total": line_total,
            })
            line_menu_ids.append(item["menu_item_id"])

        order_line_items[oid] = line_menu_ids

    return orders, order_items, order_line_items


# ============================================================
# PRICING HISTORY
# ============================================================

def make_pricing(items):
    rows = []
    price_history_id = 1

    for item in items:
        if random.random() < 0.75:
            changes = random.randint(1, 4)

            old_price = float(item["base_price"])

            for change_no in range(changes):
                month_from = min(12, change_no * 3 + 2)
                month_to = min(12, month_from + 2)

                new_price = round(old_price * random.uniform(0.90, 1.15), 2)

                rows.append({
                    "price_history_id": price_history_id,
                    "menu_item_id": item["menu_item_id"],
                    "effective_from": f"2025-{month_from:02d}-01",
                    "effective_to": f"2025-{month_to:02d}-28",
                    "old_price": old_price,
                    "new_price": new_price,
                    "change_reason": random.choice([
                        "Cost Change",
                        "Market Adjustment",
                        "Promotion",
                        "Strategy",
                    ]),
                })

                price_history_id += 1
                old_price = new_price

    return rows


# ============================================================
# PROMOTIONS
# ============================================================

def make_promotions(items, restaurants, n=120):
    rows = []

    items_by_restaurant = build_restaurant_item_index(items)

    for i in range(1, n + 1):
        restaurant = random.choice(restaurants)
        # Promotion item must belong to the promotion's restaurant.
        restaurant_items = items_by_restaurant.get(
            restaurant["restaurant_id"]
        )
        if not restaurant_items:
            restaurant_items = items
        item = random.choice(restaurant_items)

        start_month = random.randint(1, 11)
        end_month = min(12, start_month + random.randint(0, 2))

        row = {
            "promotion_id": i,
            "promotion_name": f"Promotion {i:03d}",
            "promotion_type": random.choice([
                "Percentage Discount",
                "Bundle",
                "Seasonal",
            ]),
            "menu_item_id": item["menu_item_id"],
            "category_id": item["category_id"],
            "restaurant_id": restaurant["restaurant_id"],
            "start_date": f"2025-{start_month:02d}-01",
            "end_date": f"2025-{end_month:02d}-28",
            "discount_percentage": random.choice([5, 10, 15, 20, 25, 30]),
            "minimum_order_value": random.choice([0, 500, 1000, 1500]),
            "usage_limit": random.choice([100, 500, 1000, 5000]),
        }

        # Parsed dates for order-time eligibility checks.
        row["_start"] = date(
            2025, start_month, 1
        )
        row["_end"] = date(
            2025, end_month, 28
        )

        rows.append(row)

    return rows


# ============================================================
# RATINGS
# ============================================================

def make_ratings(orders, order_line_items, items, n=100000):
    rows = []

    item_by_id = {item["menu_item_id"]: item for item in items}
    max_date = date(2025, 12, 31)

    for i in range(1, n + 1):
        order = random.choice(orders)

        line_ids = order_line_items.get(order["order_id"], [])
        if not line_ids:
            continue

        # The rated item must be one actually present in the order.
        menu_item_id = random.choice(line_ids)
        review_date = date.fromisoformat(order["order_date"])
        review_date = min(
            review_date + timedelta(days=random.randint(0, 3)),
            max_date,
        )

        rows.append({
            "rating_id": i,
            "customer_id": order["customer_id"],
            "order_id": order["order_id"],
            "menu_item_id": menu_item_id,
            "restaurant_id": order["restaurant_id"],
            "rating": random.choices(
                [1, 2, 3, 4, 5],
                weights=[2, 5, 12, 32, 49],
                k=1,
            )[0],
            "review_date": review_date.isoformat(),
            "review_text": random.choice([
                "Good experience",
                "Very good",
                "Average",
                "Could be better",
                "Excellent",
                "Good value",
            ]),
        })

    return rows


# ============================================================
# INVENTORY
# ============================================================

def make_inventory(items, n=50000):
    rows = []

    for i in range(1, n + 1):
        item = random.choice(items)

        opening_stock = random.randint(20, 250)
        received_quantity = random.randint(0, 150)

        sold_quantity = random.randint(
            0,
            min(opening_stock + received_quantity, 150),
        )

        closing_stock = max(
            0,
            opening_stock + received_quantity - sold_quantity,
        )

        reorder_level = random.randint(10, 60)

        if closing_stock == 0:
            stock_status = "Out of Stock"
        elif closing_stock <= reorder_level:
            stock_status = "Low Stock"
        else:
            stock_status = "In Stock"

        rows.append({
            "inventory_id": i,
            "restaurant_id": item["restaurant_id"],
            "menu_item_id": item["menu_item_id"],
            "inventory_date": (
                f"2025-{random.randint(1, 12):02d}-"
                f"{random.randint(1, 28):02d}"
            ),
            "opening_stock": opening_stock,
            "received_quantity": received_quantity,
            "sold_quantity": sold_quantity,
            "closing_stock": closing_stock,
            "reorder_level": reorder_level,
            "stock_status": stock_status,
        })

    return rows


# ============================================================
# WASTAGE
# ============================================================

def make_wastage(items, n=50000):
    rows = []

    for i in range(1, n + 1):
        item = random.choice(items)

        quantity = random.choices(
            [1, 2, 3, 5, 8, 10],
            weights=[35, 30, 18, 10, 5, 2],
            k=1,
        )[0]

        rows.append({
            "wastage_id": i,
            "restaurant_id": item["restaurant_id"],
            "menu_item_id": item["menu_item_id"],
            "wastage_date": (
                f"2025-{random.randint(1, 12):02d}-"
                f"{random.randint(1, 28):02d}"
            ),
            "quantity_wasted": quantity,
            "wastage_reason": random.choice(WASTAGE_REASONS),
            "estimated_cost": round(
                quantity * float(item["cost_price"]),
                2,
            ),
        })

    return rows


# ============================================================
# DATA QUALITY ISSUES (documented, small rates)
# ============================================================

def inject_data_quality_issues(
    customers,
    orders,
    order_items,
    ratings,
    items,
    quality,
):
    """
    Adds a small number of deliberate quality issues so the
    cleaning/processing stage has realistic work to do.

    Every injected issue type is listed in the module docstring
    and documented in CLEANING_DECISIONS.md.
    """

    # ---- Missing values ------------------------------------
    missing_customer = max(1, int(len(customers) * quality["missing_value_rate"]))
    for _ in range(missing_customer):
        random.choice(customers)["email"] = ""

    missing_payment = max(1, int(len(orders) * quality["missing_value_rate"]))
    for _ in range(missing_payment):
        random.choice(orders)["payment_method"] = ""

    # ---- Invalid transaction values -------------------------
    invalid_lines = max(1, int(len(order_items) * quality["invalid_value_rate"]))
    for _ in range(invalid_lines):
        line = random.choice(order_items)
        if random.random() < 0.5:
            line["quantity"] = 0
        else:
            line["line_total"] = -abs(float(line["line_total"]))

    # ---- Duplicate customer records -------------------------
    duplicate_count = max(1, int(len(customers) * quality["duplicate_rate"]))
    for customer in random.sample(customers, min(duplicate_count, len(customers))):
        customers.append(customer.copy())

    # ---- Price outlier order lines --------------------------
    outlier_lines = max(
        1, int(len(order_items) * quality["outlier_rate"] * 0.35)
    )
    for _ in range(outlier_lines):
        line = random.choice(order_items)
        if line["quantity"] == 0:
            continue
        factor = random.uniform(3.0, 5.0)
        line["unit_price"] = round(float(line["unit_price"]) * factor, 2)
        line["line_total"] = round(
            float(line["unit_price"]) * line["quantity"], 2
        )

    # ---- Inconsistent order totals --------------------------
    # Line total changed without updating the order header total.
    inconsistent_totals = max(1, int(len(orders) * 0.0005))
    lines_by_order = {}
    for line in order_items:
        lines_by_order.setdefault(line["order_id"], []).append(line)

    for order in random.sample(
        orders, min(inconsistent_totals, len(orders))
    ):
        lines = lines_by_order.get(order["order_id"])
        if not lines:
            continue
        line = random.choice(lines)
        line["line_total"] = round(float(line["line_total"]) * 1.25, 2)

    # ---- Business-duplicate order lines ---------------------
    # Same item ordered twice inside one order (looks duplicated).
    duplicate_line_count = max(1, int(len(orders) * 0.002))
    for _ in range(duplicate_line_count):
        lines = random.choice(list(lines_by_order.values()))
        if not lines:
            continue
        source = random.choice(lines)
        order_items.append({
            "order_item_id": len(order_items) + 1,
            "order_id": source["order_id"],
            "menu_item_id": source["menu_item_id"],
            "quantity": source["quantity"],
            "unit_price": source["unit_price"],
            "discount_amount": 0.0,
            "line_total": source["line_total"],
        })

    # ---- Orphan ratings (item not in the order) -------------
    orphan_ratings = max(1, int(len(ratings) * 0.005))
    items_by_id = {item["menu_item_id"]: item for item in items}

    for rating in random.sample(ratings, min(orphan_ratings, len(ratings))):
        # Pick an item that belongs to a DIFFERENT restaurant,
        # which guarantees it cannot be in this order's basket.
        for _ in range(10):
            item = random.choice(items)
            if item["restaurant_id"] != rating["restaurant_id"]:
                rating["menu_item_id"] = item["menu_item_id"]
                break

    # ---- Orders outside the analysis period -----------------
    out_of_period = max(1, int(len(orders) * 0.001))
    for order in random.sample(orders, min(out_of_period, len(orders))):
        order["order_date"] = (
            f"2024-{random.randint(11, 12):02d}-"
            f"{random.randint(1, 28):02d}"
        )


# ============================================================
# MAIN
# ============================================================

def generate(raw_dir: Path | None = None, config_path: Path = CONFIG_PATH):
    """
    Runs the full generation into ``raw_dir`` (default from config).
    Returns a dict of generated row counts.
    """

    cfg = load_config(config_path)
    random.seed(cfg["seed"])

    scale = cfg["scale"]
    quality = cfg["quality"]
    start = date.fromisoformat(cfg["time"]["start_date"])
    end = date.fromisoformat(cfg["time"]["end_date"])

    if raw_dir is None:
        raw_dir = BASE / cfg["output"]["raw_dir"]
    ensure_dirs(raw_dir)

    locations = make_locations(scale["locations"])
    restaurants = make_restaurants(scale["restaurants"])
    categories = make_categories()
    items = make_menu_items(
        n=scale["menu_items"],
        restaurants=scale["restaurants"],
    )
    customers = make_customers(
        n=scale["customers"],
        locations=scale["locations"],
    )

    promotions = make_promotions(
        items,
        restaurants,
        n=120,
    )

    orders, order_items, order_line_items = make_orders_and_items(
        customers,
        restaurants,
        items,
        promotions,
        n_orders=scale["orders"],
        min_items=scale["order_items_min"],
        start=start,
        end=end,
    )

    pricing = make_pricing(items)

    ratings = make_ratings(
        orders,
        order_line_items,
        items,
        n=scale["ratings"],
    )

    inventory = make_inventory(
        items,
        n=scale["wastage"],
    )

    wastage = make_wastage(
        items,
        n=scale["wastage"],
    )

    inject_data_quality_issues(
        customers,
        orders,
        order_items,
        ratings,
        items,
        quality,
    )

    # Strip internal helper fields before writing.
    for promo in promotions:
        promo.pop("_start", None)
        promo.pop("_end", None)

    # --------------------------------------------------------
    # Write datasets
    # --------------------------------------------------------

    write_csv(raw_dir / "locations.csv", locations, [
        "location_id", "city_area", "latitude", "longitude",
    ])

    write_csv(raw_dir / "restaurants.csv", restaurants, [
        "restaurant_id", "restaurant_name", "location_id",
        "restaurant_type", "opening_date",
    ])

    write_csv(raw_dir / "menu_categories.csv", categories, [
        "category_id", "category_name",
    ])

    write_csv(raw_dir / "menu_items.csv", items, [
        "menu_item_id", "restaurant_id", "category_id", "item_name",
        "base_price", "cost_price", "is_available", "launch_date",
        "item_status",
    ])

    write_csv(raw_dir / "customers.csv", customers, list(customers[0].keys()))

    write_csv(raw_dir / "orders.csv", orders, list(orders[0].keys()))

    write_csv(raw_dir / "order_items.csv", order_items, list(order_items[0].keys()))

    write_csv(raw_dir / "pricing_history.csv", pricing, list(pricing[0].keys()))

    write_csv(raw_dir / "promotions.csv", promotions, list(promotions[0].keys()))

    write_csv(raw_dir / "ratings.csv", ratings, list(ratings[0].keys()))

    write_csv(raw_dir / "inventory.csv", inventory, list(inventory[0].keys()))

    write_csv(raw_dir / "wastage.csv", wastage, list(wastage[0].keys()))

    promo_orders = sum(1 for o in orders if o["promotion_id"])

    return {
        "locations": len(locations),
        "restaurants": len(restaurants),
        "categories": len(categories),
        "menu_items": len(items),
        "customers": len(customers),
        "orders": len(orders),
        "order_items": len(order_items),
        "pricing_history": len(pricing),
        "promotions": len(promotions),
        "ratings": len(ratings),
        "inventory": len(inventory),
        "wastage": len(wastage),
        "orders_with_promotion": promo_orders,
        "raw_dir": str(raw_dir),
    }


def main():
    counts = generate()

    print("Generated DineIQ raw datasets.")
    print(f"Raw directory : {counts['raw_dir']}")
    for key in [
        "locations",
        "restaurants",
        "categories",
        "menu_items",
        "customers",
        "orders",
        "order_items",
        "pricing_history",
        "promotions",
        "ratings",
        "inventory",
        "wastage",
    ]:
        print(f"{key.replace('_', ' ').title()}: {counts[key]:,}")
    print(f"Orders with linked promotion: {counts['orders_with_promotion']:,}")


if __name__ == "__main__":
    main()
