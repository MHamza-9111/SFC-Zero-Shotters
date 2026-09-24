"""
DineIQ Analytics - SRS-aligned synthetic data generator
Academic/project-scale generator. Keeps raw and processed data separate.
"""

from __future__ import annotations

import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

SEED = 42
random.seed(SEED)

CATEGORIES = [
    "Burgers", "Pizza", "Biryani", "Rice", "BBQ",
    "Pasta", "Sandwiches", "Desserts", "Beverages", "Salads"
]
CHANNELS = ["Delivery", "Pickup", "Dine-in"]
PAYMENTS = ["Cash", "Card", "Online Wallet"]
STATUSES = ["Completed", "Completed", "Completed", "Cancelled"]
WASTAGE_REASONS = [
    "Expired", "Overproduction", "Damaged",
    "Preparation Error", "Spoilage", "Unsold"
]

BASE = Path(__file__).resolve().parents[2]
RAW = BASE / "Main" / "raw_data"

def ensure_dirs():
    RAW.mkdir(parents=True, exist_ok=True)

def write_csv(path: Path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

def daterange_days(start, end):
    return (end - start).days + 1

def make_locations(n=20):
    rows = []
    areas = [
        "North", "South", "East", "West", "Central",
        "Garden", "Clifton", "Gulshan", "Defence", "Korangi"
    ]
    for i in range(1, n + 1):
        rows.append({
            "location_id": i,
            "city_area": f"{areas[(i-1) % len(areas)]}-{i}",
            "latitude": round(24.75 + random.uniform(-0.10, 0.10), 6),
            "longitude": round(67.00 + random.uniform(-0.10, 0.10), 6),
        })
    return rows

def make_restaurants(n=20):
    rows = []
    for i in range(1, n + 1):
        rows.append({
            "restaurant_id": i,
            "restaurant_name": f"Restaurant {i:03d}",
            "location_id": i,
            "restaurant_type": random.choice(
                ["Casual Dining", "Fast Food", "Cafe", "Family Restaurant"]
            ),
            "opening_date": "2024-01-01",
        })
    return rows

def make_categories():
    return [{"category_id": i, "category_name": name}
            for i, name in enumerate(CATEGORIES, 1)]

def make_menu_items(n=150, restaurants=20):
    rows = []
    for i in range(1, n + 1):
        category_id = ((i - 1) % 10) + 1
        base = {
            1: random.randint(450, 1200),   # Burgers
            2: random.randint(700, 1800),   # Pizza
            3: random.randint(350, 1000),   # Biryani
            4: random.randint(300, 900),    # Rice
            5: random.randint(600, 1800),   # BBQ
            6: random.randint(500, 1400),   # Pasta
            7: random.randint(400, 1100),   # Sandwiches
            8: random.randint(250, 800),    # Desserts
            9: random.randint(120, 500),    # Beverages
            10: random.randint(250, 900),   # Salads
        }[category_id]
        rows.append({
            "menu_item_id": i,
            "restaurant_id": random.randint(1, restaurants),
            "category_id": category_id,
            "item_name": f"Menu Item {i:03d}",
            "base_price": base,
            "cost_price": round(base * random.uniform(0.35, 0.65), 2),
            "is_available": 1,
            "launch_date": "2025-01-01",
            "item_status": random.choice(["Active", "Active", "Active", "Seasonal"]),
            "_popularity_weight": random.choice([1, 1, 1, 2, 3, 5, 8]),
        })
    return rows

def make_customers(n=50000, locations=20):
    rows = []
    for i in range(1, n + 1):
        rows.append({
            "customer_id": i,
            "first_name": f"Customer{i}",
            "last_name": f"User{i}",
            "gender": random.choice(["Male", "Female", "Other"]),
            "date_of_birth": f"{random.randint(1970, 2004)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "registration_date": f"2024-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "location_id": random.randint(1, locations),
            "customer_segment": random.choice(["Regular", "Occasional", "High Value", "New"]),
            "preferred_channel": random.choice(CHANNELS),
            "preferred_category": random.choice(CATEGORIES),
            "email": f"customer{i}@example.com",
            "phone": f"0300{random.randint(1000000,9999999)}",
        })
    return rows

def weighted_item(items):
    return random.choices(items, weights=[x["_popularity_weight"] for x in items], k=1)[0]

def make_orders_and_items(customers, restaurants, items, n_orders=100000,
                          min_items=1000000, start=date(2025,1,1), end=date(2025,12,31)):
    orders, order_items = [], []
    total_days = daterange_days(start, end)

    # Start with 1 item per order, then distribute the remaining lines.
    remaining = max(0, min_items - n_orders)
    basket_extra = [remaining // n_orders] * n_orders
    for i in range(remaining % n_orders):
        basket_extra[i] += 1
    random.shuffle(basket_extra)

    for oid in range(1, n_orders + 1):
        c = random.choice(customers)
        r = random.choice(restaurants)
        d = start + timedelta(days=random.randrange(total_days))
        channel = random.choice(CHANNELS)
        status = random.choice(STATUSES)
        basket_size = 1 + basket_extra[oid - 1]

        # Keep unusually huge baskets rare by redistributing extreme values.
        basket_size = max(1, basket_size)

        subtotal = 0.0
        order_lines = []
        for _ in range(basket_size):
            item = weighted_item(items)
            qty = random.choices([1,2,3,4], weights=[65,25,8,2])[0]
            unit = float(item["base_price"]) * random.uniform(0.95, 1.05)
            line = round(unit * qty, 2)
            subtotal += line
            order_lines.append((item, qty, round(unit,2), line))

        discount = round(subtotal * random.choice([0,0,0.05,0.10,0.15]), 2)
        tax = round((subtotal - discount) * 0.05, 2)
        fee = round(random.choice([0, 80, 120, 150]), 2) if channel == "Delivery" else 0
        total = round(subtotal - discount + tax + fee, 2)

        orders.append({
            "order_id": oid,
            "customer_id": c["customer_id"],
            "restaurant_id": r["restaurant_id"],
            "order_date": d.isoformat(),
            "order_time": f"{random.randint(10,22):02d}:{random.randint(0,59):02d}:00",
            "order_status": status,
            "order_channel": channel,
            "payment_method": random.choice(PAYMENTS),
            "subtotal": round(subtotal,2),
            "discount_amount": discount,
            "tax_amount": tax,
            "delivery_fee": fee,
            "total_amount": total,
        })

        for item, qty, unit, line in order_lines:
            order_items.append({
                "order_item_id": len(order_items) + 1,
                "order_id": oid,
                "menu_item_id": item["menu_item_id"],
                "quantity": qty,
                "unit_price": unit,
                "discount_amount": 0,
                "line_total": line,
            })

    return orders, order_items

def make_pricing(items):
    rows = []
    pid = 1
    for item in items:
        if random.random() < 0.65:
            changes = random.randint(1, 3)
            old = float(item["base_price"])
            for c in range(changes):
                new = round(old * random.uniform(0.90, 1.15), 2)
                rows.append({
                    "price_history_id": pid,
                    "menu_item_id": item["menu_item_id"],
                    "effective_from": f"2025-{min(12, c*4+2):02d}-01",
                    "effective_to": f"2025-{min(12, c*4+5):02d}-01",
                    "old_price": old,
                    "new_price": new,
                    "change_reason": random.choice(["Cost Change", "Market Adjustment", "Promotion", "Strategy"]),
                })
                pid += 1
                old = new
    return rows

def make_promotions(items, restaurants, n=120):
    rows = []
    for i in range(1, n + 1):
        start_month = random.randint(1, 11)
        end_month = min(12, start_month + random.randint(0, 2))
        rows.append({
            "promotion_id": i,
            "promotion_name": f"Promotion {i:03d}",
            "promotion_type": random.choice(["Percentage Discount", "Bundle", "Seasonal"]),
            "menu_item_id": random.choice(items)["menu_item_id"],
            "category_id": random.randint(1,10),
            "restaurant_id": random.choice(restaurants)["restaurant_id"],
            "start_date": f"2025-{start_month:02d}-01",
            "end_date": f"2025-{end_month:02d}-28",
            "discount_percentage": random.choice([5,10,15,20,25,30]),
            "minimum_order_value": random.choice([0,500,1000,1500]),
            "usage_limit": random.choice([100,500,1000,5000]),
        })
    return rows

def make_ratings(orders, items, n=100000):
    rows = []
    for i in range(1, n + 1):
        o = random.choice(orders)
        rows.append({
            "rating_id": i,
            "customer_id": o["customer_id"],
            "order_id": o["order_id"],
            "menu_item_id": random.choice(items)["menu_item_id"],
            "restaurant_id": o["restaurant_id"],
            "rating": random.choices([1,2,3,4,5], weights=[2,5,12,32,49])[0],
            "review_date": o["order_date"],
            "review_text": random.choice([
                "Good experience", "Very good", "Average", "Could be better",
                "Excellent", "Good value"
            ]),
        })
    return rows

def make_wastage(items, restaurants, n=50000):
    rows = []
    for i in range(1, n + 1):
        item = random.choice(items)
        qty = random.choices([1,2,3,5,8,10], weights=[35,30,18,10,5,2])[0]
        rows.append({
            "wastage_id": i,
            "restaurant_id": random.choice(restaurants)["restaurant_id"],
            "menu_item_id": item["menu_item_id"],
            "wastage_date": f"2025-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "quantity_wasted": qty,
            "wastage_reason": random.choice(WASTAGE_REASONS),
            "estimated_cost": round(qty * float(item["cost_price"]), 2),
        })
    return rows

def main():
    ensure_dirs()
    locations = make_locations()
    restaurants = make_restaurants()
    categories = make_categories()
    items = make_menu_items()
    customers = make_customers()
    orders, order_items = make_orders_and_items(
        customers, restaurants, items,
        n_orders=100000, min_items=1000000
    )
    pricing = make_pricing(items)
    promotions = make_promotions(items, restaurants)
    ratings = make_ratings(orders, items)
    wastage = make_wastage(items, restaurants)
    inventory = make_inventory(items, restaurants)

    write_csv(RAW / "locations.csv", locations,
              ["location_id","city_area","latitude","longitude"])
    write_csv(RAW / "restaurants.csv", restaurants,
              ["restaurant_id","restaurant_name","location_id","restaurant_type","opening_date"])
    write_csv(RAW / "menu_categories.csv", categories,
              ["category_id","category_name"])
    write_csv(RAW / "menu_items.csv", items,
              ["menu_item_id","restaurant_id","category_id","item_name","base_price",
               "cost_price","is_available","launch_date","item_status"])
    write_csv(RAW / "customers.csv", customers,
              ["customer_id","first_name","last_name","gender","date_of_birth",
               "registration_date","location_id","customer_segment","preferred_channel",
               "preferred_category","email","phone"])
    write_csv(RAW / "orders.csv", orders,
              list(orders[0].keys()))
    write_csv(RAW / "order_items.csv", order_items,
              list(order_items[0].keys()))
    write_csv(RAW / "pricing_history.csv", pricing,
              list(pricing[0].keys()))
    write_csv(RAW / "promotions.csv", promotions,
              list(promotions[0].keys()))
    write_csv(RAW / "ratings.csv", ratings,
              list(ratings[0].keys()))
    write_csv(RAW / "wastage.csv", wastage,
              list(wastage[0].keys()))
    write_csv(RAW / "inventory.csv", inventory,
              list(inventory[0].keys()))

    print("Generated DineIQ raw datasets.")
    print(f"Orders: {len(orders):,}")
    print(f"Order items: {len(order_items):,}")
    print(f"Customers: {len(customers):,}")
    print(f"Ratings: {len(ratings):,}")
    print(f"Wastage: {len(wastage):,}")

if __name__ == "__main__":
    main()

def make_inventory(items, restaurants, n=500):
    rows = []
    for i in range(1, n + 1):
        item = random.choice(items)
        restaurant_id = item["restaurant_id"]
        stock = random.randint(10, 250)
        reorder_level = random.randint(5, 50)
        rows.append({
            "inventory_id": i,
            "restaurant_id": restaurant_id,
            "menu_item_id": item["menu_item_id"],
            "inventory_date": f"2025-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "opening_stock": stock,
            "received_quantity": random.randint(0, 100),
            "sold_quantity": random.randint(0, min(stock, 80)),
            "closing_stock": stock,
            "reorder_level": reorder_level,
            "stock_status": random.choice(["In Stock", "In Stock", "Low Stock", "Out of Stock"])
        })
    return rows
