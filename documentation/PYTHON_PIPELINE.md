# DineIQ Analytics - Data Processing

## Purpose
This document describes the data preparation workflow for DineIQ Analytics.

## Pipeline
Raw Data -> Quality Assessment -> Cleaning + Quarantine -> Processed Data -> Integration -> Core Analytics -> Advanced Analytics / ML

## Data Quality Assessment
Script: `data_quality_check.py`

Checks include missing values, duplicates, duplicate primary keys, invalid
numeric values, invalid dates, invalid quantities, invalid ratings, invalid
discounts, financial-value issues, order-total consistency, inventory
consistency, and menu price/cost relationships.

## Data Cleaning
Script: `clean_dineiq_data.py`

The cleaning process standardizes relevant fields, identifies problematic
records, quarantines invalid records, preserves source information, and
writes valid data to the processed-data layer. It also validates all
primary-key and foreign-key relationships across datasets:

- order items belong to the order's own restaurant menu
- orders reference known customers, restaurants, and (when set) promotions
- promotions referenced by orders are active on the order date at that restaurant
- ratings come from the order's customer and rate an item actually in the order
- inventory and wastage reference items owned by their restaurant
- order dates fall inside the 12-month analysis period

See `CLEANING_DECISIONS.md` and `DATA_DICTIONARY.md`.

## Data Processing
Script: `process_dineiq_data.py`

The processing stage integrates customers, orders, order items, menu items,
categories, restaurants, locations, ratings, inventory, wastage, promotions,
and pricing information. Revenue-based analytics use completed orders only
(cancelled orders are kept and flagged, never counted as revenue).

## Advanced Analytics
Script: `run_advanced_analytics.py`

Implements the SRS intelligence layer on the integrated data:

- RFM analysis and customer segmentation (KMeans, k=5)
- Data-driven menu business classes (Profit Driver, Volume Driver,
  Hidden Opportunity, Low Performer) including contradictory cases
- Market-basket analysis (support / confidence / lift)
- Peak-period analysis
- Demand forecasting with chronological validation (last 90 days held out)
  and MAE / RMSE / MAPE, compared against a naive previous-day baseline
- Wastage and wastage-risk analysis
- Price sensitivity (log-log price elasticity)
- Promotion effectiveness, promo-vs-control lift, and trap detection
- Sales, order-total, and rating anomaly detection
- Slow-moving dish detection
- Location / channel intelligence
- Churn-risk modelling (logistic regression)
- Evidence-backed prioritized recommendations
- What-if scenario estimates

All models use `random_state=42` for reproducibility.

## Orchestration
Script: `run_pipeline.py`

Runs the full pipeline in order (generation is optional with
`--skip-generation`).

## Tests
Directory: `Ali Jaan/tests/`

Run with: `python -m pytest Ali Jaan/tests -q`

The test suite generates a medium-scale dataset in a temp directory and
validates the generator invariants, cleaning PK/FK/quarantine behaviour,
processing outputs (including completed-orders-only revenue), advanced
analytics outputs, and the dual-pipeline comparison sets.

## Dual-Pipeline Comparison Sets
Directory: `Ali Jaan/data_cleaning/dual_pipeline/`

The Python side of the SRS dual-pipeline comparison: unseen cases plus
independent Python predictions for the order-value classification (300
cases), churn risk (200 customers), menu business class (30 cells), and the
90-day forecast holdout. See its README for the comparison protocol.

## Output
Processed source files: 12
Analytical files: 35
Quarantine files: 4

## Role Contribution
Ali Jaan: dummy data generation, data cleaning, data processing, analytical
data preparation, ML comparison sets, and support for Hamza.

## Tools
Python 3.11, Pandas, NumPy, Scikit-learn, PyYAML, PyTest, CSV.

## Data Preservation
Raw data remains separate from cleaned and analytical data. The original raw
datasets are not modified.
