PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS locations (
    location_id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL CHECK(length(city) <= 100),
    area TEXT NOT NULL CHECK(length(area) <= 100),
    address TEXT NOT NULL CHECK(length(address) <= 255),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurants (
    restaurant_id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES locations(location_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK(length(name) <= 150),
    opening_date TEXT,
    seating_capacity INTEGER CHECK(seating_capacity IS NULL OR seating_capacity >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE CHECK(length(name) <= 100),
    description TEXT CHECK(description IS NULL OR length(description) <= 500)
);

CREATE TABLE IF NOT EXISTS menu_items (
    menu_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    category_id INTEGER NOT NULL REFERENCES menu_categories(category_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK(length(name) <= 150),
    description TEXT CHECK(description IS NULL OR length(description) <= 1000),
    base_price REAL NOT NULL CHECK(base_price >= 0),
    cost_price REAL NOT NULL CHECK(cost_price >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pricing_history (
    pricing_id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(menu_item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    price REAL NOT NULL CHECK(price >= 0),
    cost_price REAL CHECK(cost_price IS NULL OR cost_price >= 0),
    reason TEXT CHECK(reason IS NULL OR length(reason) <= 250),
    CHECK(effective_to IS NULL OR effective_to >= effective_from)
);

-- Customer profiles intentionally contain no names, email addresses, or phone numbers.
CREATE TABLE IF NOT EXISTS customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER REFERENCES locations(location_id) ON UPDATE CASCADE ON DELETE SET NULL,
    first_seen TEXT,
    preferred_channel TEXT CHECK(preferred_channel IS NULL OR length(preferred_channel) <= 80),
    preferred_category TEXT CHECK(preferred_category IS NULL OR length(preferred_category) <= 100),
    customer_value_segment TEXT CHECK(customer_value_segment IS NULL OR length(customer_value_segment) <= 80),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS promotions (
    promotion_id TEXT PRIMARY KEY CHECK(length(promotion_id) <= 60),
    restaurant_id INTEGER REFERENCES restaurants(restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    menu_item_id INTEGER REFERENCES menu_items(menu_item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK(length(name) <= 150),
    description TEXT CHECK(description IS NULL OR length(description) <= 500),
    discount_percentage REAL NOT NULL CHECK(discount_percentage BETWEEN 0 AND 100),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    CHECK(end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(customer_id) ON UPDATE CASCADE ON DELETE SET NULL,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    order_date TEXT NOT NULL,
    order_channel TEXT NOT NULL CHECK(length(order_channel) <= 80),
    payment_method TEXT CHECK(payment_method IS NULL OR length(payment_method) <= 80),
    order_status TEXT NOT NULL CHECK(order_status IN ('Completed', 'Cancelled', 'Refunded')),
    subtotal REAL NOT NULL CHECK(subtotal >= 0),
    tax_amount REAL NOT NULL DEFAULT 0 CHECK(tax_amount >= 0),
    discount_amount REAL NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
    total_amount REAL NOT NULL CHECK(total_amount >= 0),
    promotion_id TEXT REFERENCES promotions(promotion_id) ON UPDATE CASCADE ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(order_id) ON UPDATE CASCADE ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(menu_item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    discount_amount REAL NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
    line_total REAL NOT NULL CHECK(line_total >= 0)
);

CREATE TABLE IF NOT EXISTS ratings (
    rating_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(customer_id) ON UPDATE CASCADE ON DELETE SET NULL,
    order_id INTEGER REFERENCES orders(order_id) ON UPDATE CASCADE ON DELETE SET NULL,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(menu_item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    rating_score INTEGER NOT NULL CHECK(rating_score BETWEEN 1 AND 5),
    review_text TEXT CHECK(review_text IS NULL OR length(review_text) <= 2000),
    rating_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
    inventory_id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(menu_item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    stock_on_hand REAL NOT NULL CHECK(stock_on_hand >= 0),
    reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
    unit_cost REAL CHECK(unit_cost IS NULL OR unit_cost >= 0),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(restaurant_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS wastage (
    wastage_id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES restaurants(restaurant_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(menu_item_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    quantity_wasted REAL NOT NULL CHECK(quantity_wasted > 0),
    wastage_cost REAL NOT NULL CHECK(wastage_cost >= 0),
    reason TEXT NOT NULL CHECK(length(reason) <= 120),
    record_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_date ON orders(restaurant_id, order_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_pricing_menu_effective ON pricing_history(menu_item_id, effective_from);
CREATE INDEX IF NOT EXISTS idx_wastage_restaurant_date ON wastage(restaurant_id, record_date);
