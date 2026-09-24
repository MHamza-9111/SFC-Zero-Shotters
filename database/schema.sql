-- DineIQ Analytics - DDL Relational Database Schema
-- Defines table structures, primary keys, foreign keys, and indexes for all 10 core entities.

CREATE TABLE locations (
    location_id INT PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    area VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL
);

CREATE TABLE restaurants (
    restaurant_id INT PRIMARY KEY,
    location_id INT REFERENCES locations(location_id),
    name VARCHAR(150) NOT NULL,
    opening_date DATE NOT NULL,
    seating_capacity INT NOT NULL
);

CREATE TABLE menu_categories (
    category_id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE menu_items (
    menu_item_id INT PRIMARY KEY,
    restaurant_id INT REFERENCES restaurants(restaurant_id),
    category_id INT REFERENCES menu_categories(category_id),
    name VARCHAR(150) NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL,
    cost_price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE customers (
    customer_id INT PRIMARY KEY,
    location_id INT REFERENCES locations(location_id),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(50),
    signup_date DATE NOT NULL
);

CREATE TABLE promotions (
    promotion_id VARCHAR(50) PRIMARY KEY,
    restaurant_id INT REFERENCES restaurants(restaurant_id),
    menu_item_id INT REFERENCES menu_items(menu_item_id),
    discount_percentage DECIMAL(5, 2) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL
);

CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    customer_id INT REFERENCES customers(customer_id),
    restaurant_id INT REFERENCES restaurants(restaurant_id),
    order_date TIMESTAMP NOT NULL,
    order_type VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50),
    order_status VARCHAR(50) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    promotion_id VARCHAR(50) REFERENCES promotions(promotion_id)
);

CREATE TABLE order_items (
    order_item_id INT PRIMARY KEY,
    order_id INT REFERENCES orders(order_id),
    menu_item_id INT REFERENCES menu_items(menu_item_id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0.00,
    line_total DECIMAL(10, 2) NOT NULL
);

CREATE TABLE ratings (
    rating_id INT PRIMARY KEY,
    customer_id INT REFERENCES customers(customer_id),
    order_id INT REFERENCES orders(order_id),
    menu_item_id INT REFERENCES menu_items(menu_item_id),
    rating_score INT NOT NULL,
    review_text TEXT,
    rating_date TIMESTAMP NOT NULL
);

CREATE TABLE wastage (
    wastage_id INT PRIMARY KEY,
    restaurant_id INT REFERENCES restaurants(restaurant_id),
    menu_item_id INT REFERENCES menu_items(menu_item_id),
    quantity_wasted INT NOT NULL,
    wastage_cost DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(100) NOT NULL,
    record_date DATE NOT NULL
);

-- Analytical Indexes
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_item ON order_items(menu_item_id);
