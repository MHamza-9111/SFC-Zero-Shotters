# DineIQ Analytics — Database Schema & Data Dictionary

## 1. Overview
The DineIQ database architecture is designed around 10 core relational entities to capture end-to-end restaurant operations.

---

## 2. Core Entities & Schema Definitions

### 2.1 `locations`
- `location_id` (INT, PK): Unique identifier for physical city zone
- `city` (VARCHAR): City name
- `area` (VARCHAR): Local district/area name
- `address` (VARCHAR): Full street address

### 2.2 `restaurants`
- `restaurant_id` (INT, PK): Unique identifier for branch location
- `location_id` (INT, FK -> locations.location_id): Physical location
- `name` (VARCHAR): Restaurant branch name
- `opening_date` (DATE): Branch establishment date
- `seating_capacity` (INT): Customer capacity

### 2.3 `menu_categories`
- `category_id` (INT, PK): Unique identifier for dish category
- `name` (VARCHAR): Category name (e.g., Burgers, Pizza, Biryani)

### 2.4 `menu_items`
- `menu_item_id` (INT, PK): Unique identifier for menu item
- `restaurant_id` (INT, FK -> restaurants.restaurant_id): Owning branch
- `category_id` (INT, FK -> menu_categories.category_id): Dish category
- `name` (VARCHAR): Item name
- `base_price` (DECIMAL): Standard selling price
- `cost_price` (DECIMAL): Production/ingredient cost price
- `is_active` (BOOLEAN): Menu status flag

### 2.5 `customers`
- `customer_id` (INT, PK): Unique customer identifier
- `location_id` (INT, FK -> locations.location_id): Primary location
- `name` (VARCHAR): Customer full name
- `email` (VARCHAR): Email address (may be null/missing in raw data)
- `phone` (VARCHAR): Contact phone number
- `signup_date` (DATE): Account creation date

### 2.6 `promotions`
- `promotion_id` (VARCHAR, PK): Unique campaign code
- `restaurant_id` (INT, FK -> restaurants.restaurant_id): Target branch
- `menu_item_id` (INT, FK -> menu_items.menu_item_id): Discounted item
- `discount_percentage` (DECIMAL): Discount percentage rate
- `start_date` (DATE): Campaign start date
- `end_date` (DATE): Campaign expiration date

### 2.7 `orders`
- `order_id` (INT, PK): Unique transaction identifier
- `customer_id` (INT, FK -> customers.customer_id): Purchasing customer
- `restaurant_id` (INT, FK -> restaurants.restaurant_id): Fulfilling branch
- `order_date` (TIMESTAMP): Order placement timestamp
- `order_type` (VARCHAR): Channel (Dine-in, Takeaway, Delivery)
- `payment_method` (VARCHAR): Cash, Credit Card, Digital Wallet
- `order_status` (VARCHAR): Completed, Cancelled, Refunded
- `subtotal` (DECIMAL): Pre-tax order sum
- `tax` (DECIMAL): Tax amount
- `discount` (DECIMAL): Promotional discount applied
- `total_amount` (DECIMAL): Final paid amount
- `promotion_id` (VARCHAR, FK -> promotions.promotion_id): Applied offer

### 2.8 `order_items`
- `order_item_id` (INT, PK): Unique order line identifier
- `order_id` (INT, FK -> orders.order_id): Parent order
- `menu_item_id` (INT, FK -> menu_items.menu_item_id): Ordered dish
- `quantity` (INT): Units ordered
- `unit_price` (DECIMAL): Charged unit price
- `discount_amount` (DECIMAL): Line discount
- `line_total` (DECIMAL): Final line price (`quantity * unit_price - discount_amount`)

### 2.9 `ratings`
- `rating_id` (INT, PK): Review record identifier
- `customer_id` (INT, FK -> customers.customer_id): Reviewing customer
- `order_id` (INT, FK -> orders.order_id): Reviewed order
- `menu_item_id` (INT, FK -> menu_items.menu_item_id): Rated dish
- `rating_score` (INT): Score from 1 to 5
- `review_text` (TEXT): Customer review notes
- `rating_date` (TIMESTAMP): Review timestamp

### 2.10 `wastage`
- `wastage_id` (INT, PK): Wastage record identifier
- `restaurant_id` (INT, FK -> restaurants.restaurant_id): Branch location
- `menu_item_id` (INT, FK -> menu_items.menu_item_id): Wasted item
- `quantity_wasted` (INT): Units wasted
- `wastage_cost` (DECIMAL): Monetary loss (`quantity_wasted * cost_price`)
- `reason` (VARCHAR): Cause (Expired, Damaged, Overcooked)
- `record_date` (DATE): Incident date
