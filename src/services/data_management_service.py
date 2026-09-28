"""Validated SQLite CRUD for DineIQ's operational restaurant records."""

from __future__ import annotations

import math
import os
import sqlite3
import threading
from pathlib import Path

from src.runtime import writable_dir

BASE_DIR = Path(__file__).resolve().parents[2]

RESOURCES = {
    "locations": {
        "label": "Locations", "primary_key": "location_id", "search": ["city", "area"],
        "fields": {"location_id": ("integer", False), "city": ("string", True), "area": ("string", True), "address": ("string", True)},
    },
    "restaurants": {
        "label": "Restaurants", "primary_key": "restaurant_id", "search": ["name"],
        "fields": {"restaurant_id": ("integer", False), "location_id": ("integer", True), "name": ("string", True), "opening_date": ("date", False), "seating_capacity": ("integer", False)},
    },
    "menu_categories": {
        "label": "Menu categories", "primary_key": "category_id", "search": ["name", "description"],
        "fields": {"category_id": ("integer", False), "name": ("string", True), "description": ("string", False)},
    },
    "menu_items": {
        "label": "Menu items", "primary_key": "menu_item_id", "search": ["name", "description"],
        "fields": {"menu_item_id": ("integer", False), "restaurant_id": ("integer", True), "category_id": ("integer", True), "name": ("string", True), "description": ("string", False), "base_price": ("number", True), "cost_price": ("number", True), "is_active": ("boolean", False)},
    },
    "pricing_history": {
        "label": "Pricing history", "primary_key": "pricing_id", "search": ["reason"],
        "fields": {"pricing_id": ("integer", False), "menu_item_id": ("integer", True), "effective_from": ("date", True), "effective_to": ("date", False), "price": ("number", True), "cost_price": ("number", False), "reason": ("string", False)},
    },
    "customers": {
        "label": "Anonymized customers", "primary_key": "customer_id", "search": ["preferred_channel", "preferred_category", "customer_value_segment"],
        "fields": {"customer_id": ("integer", False), "location_id": ("integer", False), "first_seen": ("date", False), "preferred_channel": ("string", False), "preferred_category": ("string", False), "customer_value_segment": ("string", False), "is_active": ("boolean", False)},
    },
    "promotions": {
        "label": "Promotions", "primary_key": "promotion_id", "search": ["name", "description"],
        "fields": {"promotion_id": ("string", True), "restaurant_id": ("integer", False), "menu_item_id": ("integer", False), "name": ("string", True), "description": ("string", False), "discount_percentage": ("number", True), "start_date": ("date", True), "end_date": ("date", True), "is_active": ("boolean", False)},
    },
    "orders": {
        "label": "Orders", "primary_key": "order_id", "search": ["order_channel", "payment_method", "order_status"],
        "fields": {"order_id": ("integer", False), "customer_id": ("integer", False), "restaurant_id": ("integer", True), "order_date": ("datetime", True), "order_channel": ("string", True), "payment_method": ("string", False), "order_status": ("enum", True, ["Completed", "Cancelled", "Refunded"]), "subtotal": ("number", True), "tax_amount": ("number", False), "discount_amount": ("number", False), "total_amount": ("number", True), "promotion_id": ("string", False)},
    },
    "order_items": {
        "label": "Order items", "primary_key": "order_item_id", "search": [],
        "fields": {"order_item_id": ("integer", False), "order_id": ("integer", True), "menu_item_id": ("integer", True), "quantity": ("integer", True), "unit_price": ("number", True), "discount_amount": ("number", False), "line_total": ("number", True)},
    },
    "ratings": {
        "label": "Ratings", "primary_key": "rating_id", "search": ["review_text"],
        "fields": {"rating_id": ("integer", False), "customer_id": ("integer", False), "order_id": ("integer", False), "menu_item_id": ("integer", True), "rating_score": ("integer", True), "review_text": ("string", False), "rating_date": ("datetime", True)},
    },
    "inventory": {
        "label": "Inventory", "primary_key": "inventory_id", "search": [],
        "fields": {"inventory_id": ("integer", False), "restaurant_id": ("integer", True), "menu_item_id": ("integer", True), "stock_on_hand": ("number", True), "reorder_level": ("number", False), "unit_cost": ("number", False), "updated_at": ("datetime", False)},
    },
    "wastage": {
        "label": "Wastage", "primary_key": "wastage_id", "search": ["reason"],
        "fields": {"wastage_id": ("integer", False), "restaurant_id": ("integer", True), "menu_item_id": ("integer", True), "quantity_wasted": ("number", True), "wastage_cost": ("number", True), "reason": ("string", True), "record_date": ("date", True)},
    },
}

NUMERIC_BOUNDS = {
    "location_id": (1, None), "restaurant_id": (1, None),
    "category_id": (1, None), "menu_item_id": (1, None),
    "pricing_id": (1, None), "customer_id": (1, None),
    "order_id": (1, None), "order_item_id": (1, None),
    "rating_id": (1, None), "inventory_id": (1, None),
    "wastage_id": (1, None),
    "seating_capacity": (0, None), "base_price": (0, None),
    "cost_price": (0, None), "price": (0, None),
    "stock_on_hand": (0, None), "reorder_level": (0, None),
    "unit_cost": (0, None), "subtotal": (0, None), "tax_amount": (0, None),
    "discount_amount": (0, None), "total_amount": (0, None),
    "unit_price": (0, None), "line_total": (0, None),
    "wastage_cost": (0, None), "discount_percentage": (0, 100),
    "quantity": (1, None), "quantity_wasted": (0.000001, None),
    "rating_score": (1, 5),
}
MAX_LENGTHS = {
    ("locations", "city"): 100, ("locations", "area"): 100,
    ("locations", "address"): 255, ("restaurants", "name"): 150,
    ("menu_categories", "name"): 100, ("menu_categories", "description"): 500,
    ("menu_items", "name"): 150, ("menu_items", "description"): 1000,
    ("pricing_history", "reason"): 250,
    ("customers", "preferred_channel"): 80,
    ("customers", "preferred_category"): 100,
    ("customers", "customer_value_segment"): 80,
    ("promotions", "promotion_id"): 60, ("promotions", "name"): 150,
    ("promotions", "description"): 500,
    ("orders", "order_channel"): 80, ("orders", "payment_method"): 80,
    ("ratings", "review_text"): 2000, ("wastage", "reason"): 120,
}


class DataManagementError(ValueError):
    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.status = code, status


class DataManagementService:
    def __init__(self, db_path: Path | None = None):
        preferred = Path(db_path or os.environ.get(
            "DINEIQ_DATA_DB", BASE_DIR / "runtime" / "dineiq.sqlite3"))
        self.db_path = writable_dir(preferred.parent) / preferred.name
        self._initialize_lock = threading.Lock()
        self._initialized = False

    def connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.db_path, timeout=15)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("PRAGMA busy_timeout=15000")
        return con

    def initialize(self) -> None:
        if self._initialized:
            return
        with self._initialize_lock:
            if self._initialized:
                return
            schema = BASE_DIR / "database" / "sqlite_schema.sql"
            con = self.connect()
            try:
                con.execute("PRAGMA journal_mode=WAL")
                con.executescript(schema.read_text(encoding="utf-8"))
                con.commit()
            finally:
                con.close()
            self._initialized = True

    def resource_definition(self, resource: str) -> dict:
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        fields = []
        for name, field in definition["fields"].items():
            kind, required, *options = field
            minimum, maximum = NUMERIC_BOUNDS.get(name, (None, None))
            fields.append({"name": name, "type": kind, "required": required,
                           "options": options[0] if options else [],
                           "minimum": minimum, "maximum": maximum,
                           "max_length": MAX_LENGTHS.get((resource, name))})
        return {"name": resource, "label": definition["label"],
                "primary_key": definition["primary_key"], "fields": fields}

    def resources(self) -> list[dict]:
        return [self.resource_definition(name) for name in RESOURCES]

    def _normalize(self, resource: str, payload: dict, *, partial: bool = False) -> dict:
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        fields = definition["fields"]
        unknown = sorted(set(payload) - set(fields))
        if unknown:
            raise DataManagementError("INVALID_RECORD", f"Unknown field(s): {', '.join(unknown)}")
        output = {}
        for name, config in fields.items():
            if name not in payload:
                if config[1] and not partial:
                    raise DataManagementError("INVALID_RECORD", f"Missing required field: {name}")
                continue
            value = payload[name]
            if value is None or value == "":
                if config[1]:
                    raise DataManagementError("INVALID_RECORD", f"Field {name} is required")
                output[name] = None
                continue
            kind = config[0]
            try:
                if kind == "integer":
                    if isinstance(value, bool):
                        raise ValueError
                    number = int(value)
                    if isinstance(value, float) and not value.is_integer():
                        raise ValueError
                    output[name] = number
                elif kind == "number":
                    if isinstance(value, bool):
                        raise ValueError
                    number = float(value)
                    if not math.isfinite(number):
                        raise ValueError
                    output[name] = number
                elif kind == "boolean":
                    if value in (True, 1, "1", "true", "True", "yes", "on"):
                        output[name] = 1
                    elif value in (False, 0, "0", "false", "False", "no", "off"):
                        output[name] = 0
                    else:
                        raise ValueError
                elif kind == "enum":
                    if value not in config[2]:
                        raise ValueError
                    output[name] = value
                else:
                    text = str(value).strip()
                    if kind in {"date", "datetime"}:
                        from datetime import date, datetime
                        if kind == "date":
                            date.fromisoformat(text)
                        else:
                            datetime.fromisoformat(text.replace("Z", "+00:00"))
                    max_length = MAX_LENGTHS.get((resource, name), 2000)
                    if max_length is not None and len(text) > max_length:
                        raise ValueError
                    output[name] = text
                if name in NUMERIC_BOUNDS:
                    number = float(output[name])
                    minimum, maximum = NUMERIC_BOUNDS[name]
                    if ((minimum is not None and number < minimum)
                            or (maximum is not None and number > maximum)):
                        raise ValueError
            except (TypeError, ValueError, OverflowError):
                minimum, maximum = NUMERIC_BOUNDS.get(name, (None, None))
                if minimum is not None or maximum is not None:
                    bound = f"between {minimum if minimum is not None else '−∞'} and {maximum if maximum is not None else '∞'}"
                    message = f"Field {name} must be numeric and {bound}"
                else:
                    message = f"Invalid {kind} value for {name}"
                raise DataManagementError("INVALID_RECORD", message) from None
        return output

    @staticmethod
    def _validate_relationships(con: sqlite3.Connection, resource: str,
                                values: dict, existing: dict | None = None) -> None:
        record = dict(existing or {})
        record.update(values)

        def invalid(message: str) -> None:
            raise DataManagementError("INVALID_RECORD", message)

        restaurant_id = record.get("restaurant_id")
        menu_item_id = record.get("menu_item_id")
        if resource in {"inventory", "wastage", "promotions"} and restaurant_id and menu_item_id:
            row = con.execute("SELECT restaurant_id FROM menu_items WHERE menu_item_id=?",
                              (menu_item_id,)).fetchone()
            if row and row["restaurant_id"] != restaurant_id:
                invalid("Menu item does not belong to the selected restaurant")

        if resource == "order_items":
            order = con.execute("SELECT restaurant_id FROM orders WHERE order_id=?",
                                (record.get("order_id"),)).fetchone()
            item = con.execute("SELECT restaurant_id FROM menu_items WHERE menu_item_id=?",
                               (menu_item_id,)).fetchone()
            if order and item and order["restaurant_id"] != item["restaurant_id"]:
                invalid("Menu item does not belong to the order's restaurant")

        if resource == "orders" and record.get("promotion_id"):
            promotion = con.execute(
                "SELECT restaurant_id,start_date,end_date FROM promotions WHERE promotion_id=?",
                (record["promotion_id"],)).fetchone()
            if promotion:
                order_day = str(record.get("order_date", ""))[:10]
                if not promotion["start_date"] <= order_day <= promotion["end_date"]:
                    invalid("Promotion is not active on the order date")
                if promotion["restaurant_id"] is not None and promotion["restaurant_id"] != restaurant_id:
                    invalid("Promotion does not belong to the selected restaurant")

        if resource == "ratings":
            order = con.execute("SELECT customer_id,order_date FROM orders WHERE order_id=?",
                                (record.get("order_id"),)).fetchone()
            if order:
                if record.get("customer_id") is not None and order["customer_id"] != record["customer_id"]:
                    invalid("Rating customer must match the referenced order")
                line = con.execute(
                    "SELECT 1 FROM order_items WHERE order_id=? AND menu_item_id=? LIMIT 1",
                    (record.get("order_id"), menu_item_id)).fetchone()
                if not line:
                    invalid("Rated menu item must be present in the referenced order")
                if str(record.get("rating_date", ""))[:10] < str(order["order_date"])[:10]:
                    invalid("Rating date cannot precede the order date")

        if resource in {"promotions", "pricing_history"}:
            start, end = ("start_date", "end_date") if resource == "promotions" else ("effective_from", "effective_to")
            if record.get(start) and record.get(end) and record[end] < record[start]:
                invalid(f"{end} cannot precede {start}")

    def list(self, resource: str, *, page: int = 1, page_size: int = 25,
             query: str = "") -> dict:
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        self.initialize()
        page = max(int(page), 1)
        page_size = min(max(int(page_size), 1), 100)
        con = self.connect()
        try:
            where, params = "", []
            search_fields = definition["search"]
            if query.strip() and search_fields:
                where = " WHERE " + " OR ".join(f'"{field}" LIKE ? COLLATE NOCASE' for field in search_fields)
                params = [f"%{query.strip()[:100]}%"] * len(search_fields)
            total = con.execute(f'SELECT COUNT(*) FROM "{resource}"{where}', params).fetchone()[0]
            key = definition["primary_key"]
            rows = con.execute(f'SELECT * FROM "{resource}"{where} ORDER BY "{key}" DESC LIMIT ? OFFSET ?',
                               [*params, page_size, (page - 1) * page_size]).fetchall()
            return {"items": [dict(row) for row in rows], "total": int(total),
                    "page": page, "page_size": page_size,
                    "pages": max((int(total) + page_size - 1) // page_size, 1)}
        finally:
            con.close()

    def get(self, resource: str, record_id: str):
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        self.initialize()
        con = self.connect()
        try:
            row = con.execute(f'SELECT * FROM "{resource}" WHERE "{definition["primary_key"]}"=?',
                              (record_id,)).fetchone()
            if row is None:
                raise DataManagementError("NOT_FOUND", "Record was not found.", 404)
            return dict(row)
        finally:
            con.close()

    def create(self, resource: str, payload: dict) -> dict:
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        values = self._normalize(resource, payload)
        self.initialize()
        con = self.connect()
        try:
            self._validate_relationships(con, resource, values)
            columns = list(values)
            if not columns:
                cursor = con.execute(f'INSERT INTO "{resource}" DEFAULT VALUES')
                con.commit()
                record_id = cursor.lastrowid
                return self.get(resource, str(record_id))
            placeholders = ",".join("?" for _ in columns)
            names = ",".join(f'"{name}"' for name in columns)
            cursor = con.execute(f'INSERT INTO "{resource}" ({names}) VALUES ({placeholders})',
                                 [values[name] for name in columns])
            con.commit()
            record_id = values.get(definition["primary_key"], cursor.lastrowid)
        except sqlite3.IntegrityError as exc:
            raise DataManagementError("CONFLICT", "Record conflicts with an existing key or relationship.", 409) from exc
        finally:
            con.close()
        return self.get(resource, str(record_id))

    def update(self, resource: str, record_id: str, payload: dict) -> dict:
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        values = self._normalize(resource, payload, partial=True)
        values.pop(definition["primary_key"], None)
        if not values:
            raise DataManagementError("INVALID_RECORD", "Provide at least one field to update.")
        self.initialize()
        con = self.connect()
        try:
            row = con.execute(f'SELECT * FROM "{resource}" WHERE "{definition["primary_key"]}"=?',
                              (record_id,)).fetchone()
            if row is None:
                raise DataManagementError("NOT_FOUND", "Record was not found.", 404)
            self._validate_relationships(con, resource, values, dict(row))
            setters = ",".join(f'"{key}"=?' for key in values)
            cursor = con.execute(f'UPDATE "{resource}" SET {setters} WHERE "{definition["primary_key"]}"=?',
                                 [*values.values(), record_id])
            if cursor.rowcount == 0:
                raise DataManagementError("NOT_FOUND", "Record was not found.", 404)
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise DataManagementError("CONFLICT", "Update conflicts with a key or relationship constraint.", 409) from exc
        finally:
            con.close()
        return self.get(resource, record_id)

    def delete(self, resource: str, record_id: str) -> None:
        definition = RESOURCES.get(resource)
        if definition is None:
            raise DataManagementError("NOT_FOUND", "Unknown data resource.", 404)
        self.initialize()
        con = self.connect()
        try:
            cursor = con.execute(f'DELETE FROM "{resource}" WHERE "{definition["primary_key"]}"=?',
                                 (record_id,))
            if cursor.rowcount == 0:
                raise DataManagementError("NOT_FOUND", "Record was not found.", 404)
            con.commit()
        except sqlite3.IntegrityError as exc:
            raise DataManagementError("CONFLICT", "Record is referenced by another resource and cannot be deleted.", 409) from exc
        finally:
            con.close()
