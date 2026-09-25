# DineIQ Analytics - Data Dictionary

Canonical schema for the DineIQ synthetic data layer.

Layers:

- Raw: `raw_data/` (generated, preserved, never modified)
- Processed: `processed_data/` (cleaned CSV, canonical analytical source)
- Analytics: `processed_data/analytics/` (integrated + intelligence outputs)
- Parquet: `parquet_data/` (reserved for the Spark pipeline)

All amounts are in PKR. Dates are `YYYY-MM-DD`.

## locations

| Column | Type | Notes |
| --- | --- | --- |
| location_id | int | **PK** |
| city_area | string | Area name |
| latitude | float | WGS84 |
| longitude | float | WGS84 |

## restaurants

| Column | Type | Notes |
| --- | --- | --- |
| restaurant_id | int | **PK** |
| restaurant_name | string | |
| location_id | int | **FK -> locations.location_id** |
| restaurant_type | string | Casual Dining / Fast Food / Cafe / Family Restaurant |
| opening_date | date | |

## menu_categories

| Column | Type | Notes |
| --- | --- | --- |
| category_id | int | **PK** |
| category_name | string | |

## menu_items

| Column | Type | Notes |
| --- | --- | --- |
| menu_item_id | int | **PK** |
| restaurant_id | int | **FK -> restaurants.restaurant_id**; item is only sold at this restaurant |
| category_id | int | **FK -> menu_categories.category_id** |
| item_name | string | |
| base_price | float | Standard price |
| cost_price | float | Preparation cost; must be <= base_price |
| is_available | int | 0/1 |
| launch_date | date | |
| item_status | string | Active / Seasonal |

## customers

| Column | Type | Notes |
| --- | --- | --- |
| customer_id | int | **PK** |
| first_name / last_name | string | |
| gender | string | |
| date_of_birth | date | |
| registration_date | date | |
| location_id | int | Nearest area (loose FK -> locations) |
| preferred_channel | string | |
| preferred_category | string | |
| email | string | May be blank (documented missing-value case) |
| phone | string | |

## orders

| Column | Type | Notes |
| --- | --- | --- |
| order_id | int | **PK** |
| customer_id | int | **FK -> customers.customer_id** |
| restaurant_id | int | **FK -> restaurants.restaurant_id** |
| order_date | date | Must be inside the analysis period (2025-01-01..2025-12-31) |
| order_time | time | HH:MM:SS |
| order_status | string | Completed / Cancelled |
| order_channel | string | Dine-in / Takeaway / Website-App / Third-party Delivery |
| payment_method | string | May be blank (documented missing-value case) |
| promotion_id | int/blank | **FK -> promotions.promotion_id**; blank when no promotion |
| subtotal | float | Sum of line totals before discount |
| discount_amount | float | Base discount + promotion line discounts |
| tax_amount | float | 5% of (subtotal - discount) |
| delivery_fee | float | Delivery channels only |
| total_amount | float | subtotal - discount + tax + delivery_fee |

## order_items

| Column | Type | Notes |
| --- | --- | --- |
| order_item_id | int | **PK** |
| order_id | int | **FK -> orders.order_id** |
| menu_item_id | int | **FK -> menu_items.menu_item_id**; item's restaurant must equal order's restaurant |
| quantity | int | > 0 |
| unit_price | float | Price at time of sale |
| discount_amount | float | Promotion discount applied to this line |
| line_total | float | unit_price * quantity (before line discount) |

## pricing_history

| Column | Type | Notes |
| --- | --- | --- |
| price_history_id | int | **PK** |
| menu_item_id | int | **FK -> menu_items.menu_item_id** |
| effective_from | date | |
| effective_to | date | |
| old_price / new_price | float | |
| change_reason | string | |

## promotions

| Column | Type | Notes |
| --- | --- | --- |
| promotion_id | int | **PK** |
| promotion_name | string | |
| promotion_type | string | Percentage Discount / Bundle / Seasonal |
| menu_item_id | int | **FK -> menu_items.menu_item_id** (featured item) |
| category_id | int | **FK -> menu_categories.category_id** |
| restaurant_id | int | **FK -> restaurants.restaurant_id**; promo is restaurant-scoped |
| start_date / end_date | date | Active window |
| discount_percentage | int | 0-100 |
| minimum_order_value | float | Order must reach this to qualify |
| usage_limit | int | |

## ratings

| Column | Type | Notes |
| --- | --- | --- |
| rating_id | int | **PK** |
| customer_id | int | Must equal the rated order's customer |
| order_id | int | **FK -> orders.order_id** |
| menu_item_id | int | Must be a line item of the order |
| restaurant_id | int | **FK -> restaurants.restaurant_id** (denormalized from order) |
| rating | int | 1-5 |
| review_date | date | On/after order date |
| review_text | string | |

## inventory

| Column | Type | Notes |
| --- | --- | --- |
| inventory_id | int | **PK** |
| restaurant_id | int | **FK -> restaurants.restaurant_id**; must own the item |
| menu_item_id | int | **FK -> menu_items.menu_item_id** |
| inventory_date | date | |
| opening_stock / received_quantity / sold_quantity / closing_stock | int | closing = opening + received - sold |
| reorder_level | int | |
| stock_status | string | In Stock / Low Stock / Out of Stock |

## wastage

| Column | Type | Notes |
| --- | --- | --- |
| wastage_id | int | **PK** |
| restaurant_id | int | **FK -> restaurants.restaurant_id**; must own the item |
| menu_item_id | int | **FK -> menu_items.menu_item_id** |
| wastage_date | date | |
| quantity_wasted | int | > 0 |
| wastage_reason | string | Expired / Overproduction / Damaged / Preparation Error / Spoilage / Unsold |
| estimated_cost | float | quantity * cost_price |

## Relationship rules enforced by the cleaning pipeline

1. `order_items.menu_item_id` must belong to `orders.restaurant_id`.
2. `orders.promotion_id` (when set) must exist and be active on the order date at the order's restaurant.
3. `ratings.menu_item_id` must be present in the referenced order's lines, and `ratings.customer_id` must be that order's customer.
4. `inventory` and `wastage` (restaurant, item) pairs must be owned by the restaurant.
5. `orders.order_date` must fall inside the 12-month analysis period.

## Analytical accounting rule

Revenue, sales and performance analytics use **completed orders only**.
Cancelled orders stay in `orders_processed.csv` (flagged with
`is_completed = False`) for cancellation-behaviour analysis.

## Intentionally injected data-quality cases

Generated at small documented rates (see `data_generation_config.yaml`):
missing emails, missing payment methods, duplicate customers, zero-quantity
and negative-total order lines, price-outlier lines, order totals that no
longer match their lines, business-duplicate order lines, orphan ratings
(item not in the order), and out-of-period orders. The cleaning pipeline
detects, logs and quarantines them; see `CLEANING_DECISIONS.md`.
