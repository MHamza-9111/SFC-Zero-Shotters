# DineIQ Final Dataset Manifest

Generated from the repository's existing synthetic-data generator using the SRS scale configuration.

| Dataset | Raw rows |
|---|---:|
| locations.csv | 20 |
| restaurants.csv | 20 |
| menu_categories.csv | 10 |
| menu_items.csv | 150 |
| customers.csv | 50,250 |
| orders.csv | 100,000 |
| order_items.csv | 1,000,200 |
| pricing_history.csv | 283 |
| promotions.csv | 120 |
| ratings.csv | 100,000 |
| inventory.csv | 50,000 |
| wastage.csv | 50,000 |

The generator intentionally creates documented quality cases; the Python cleaning pipeline produced the processed layer without modifying the raw layer.

## Structure note

The original repository top-level structure is preserved. No `Main/` or `` top-level folders are used.

Raw data: `raw_data/`
Processed data: `processed_data/`
Spark output location: `spark_jobs/parquet_data/`
