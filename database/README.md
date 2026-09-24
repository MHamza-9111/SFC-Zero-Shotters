# DineIQ Database Schema & Relational Integration

This directory contains the relational database DDL schema and setup instructions for DineIQ Analytics.

## Relational Design Specs

The relational model implements all 10 core entities defined in the SRS:
- `locations`: Physical geographic zones
- `restaurants`: Individual branch locations
- `menu_categories`: Dish classifications
- `menu_items`: Dish catalog with base pricing and cost
- `customers`: Registered user accounts
- `promotions`: Time-bound discount campaigns
- `orders`: Master transaction records
- `order_items`: Line-level order details
- `ratings`: Customer review scores
- `wastage`: Inventory wastage logs

## Setup Instructions

To initialize PostgreSQL or SQLite database with this schema:

```bash
# SQLite initialization
sqlite3 dineiq.db < database/schema.sql

# PostgreSQL initialization
psql -U postgres -d dineiq -f database/schema.sql
```
