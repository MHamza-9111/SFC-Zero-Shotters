from pathlib import Path

p = Path(__file__).parent
workspace = p.parent
processed = workspace / "processed_data"
quarantine = p / "quarantine"
analytics = processed / "analytics"

processed_count = len(list(processed.glob("*.csv"))) if processed.exists() else 0
analytics_count = len(list(analytics.glob("*.csv"))) if analytics.exists() else 0
quarantine_count = len(list(quarantine.glob("*.csv"))) if quarantine.exists() else 0

docs = {
"DATA_PROCESSING.md": f"""# DineIQ Analytics - Data Processing

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
Processed source files: {processed_count}
Analytical files: {analytics_count}
Quarantine files: {quarantine_count}

## Role Contribution
Ali Jaan: dummy data generation, data cleaning, data processing, analytical
data preparation, ML comparison sets, and support for Hamza.

## Tools
Python 3.11, Pandas, NumPy, Scikit-learn, PyYAML, PyTest, CSV.

## Data Preservation
Raw data remains separate from cleaned and analytical data. The original raw
datasets are not modified.
""",

"CLEANING_DECISIONS.md": """# DineIQ Analytics - Cleaning Decisions

## Raw Data Preservation
Original files in `Main/raw_data/` are preserved and are not overwritten.

## Missing Values
Missing customer email and order payment-method values are retained as
blank rather than guessed. They are logged as documented quality cases.

## Duplicate Records
Duplicate primary-key records are quarantined; the first occurrence is
retained. Business-duplicate order lines (exact repeat of every field in the
same order) are detected and logged but retained, because a real business
duplicate is a review case, not a data error.

## Invalid Transactions
Invalid order-item quantities (zero) and invalid financial values (negative)
are quarantined rather than silently corrected. Price-outlier lines are kept
for analysis and surfaced through anomaly detection.

## Order Totals
Order totals that no longer match their line totals (a generated edge case)
are preserved and logged for review; the cleaning stage never rewrites
transaction totals.

## Foreign-Key and Relationship Rules
Records that break a documented relationship are quarantined:

- order items referencing unknown orders or menu items
- order items whose menu item belongs to a different restaurant than the
  order (prevents location-level misattribution)
- orders with unknown customer / restaurant / promotion references
- orders dated outside the analysis period (their lines and ratings are
  then quarantined by the same FK rules)
- ratings that are not from the order's customer, or that rate an item that
  is not in the order
- inventory / wastage rows whose item is not owned by the restaurant

## Promotion Consistency
Promotion references are normalized to clean integer strings (empty when
absent). A promotion that is not active for the order date/restaurant is
documented in the cleaning log; the order itself is kept because the
transaction is still valid.

## Ratings
Ratings outside the expected 1-5 range are treated as data-quality issues
and quarantined.

## Inventory and Order Totals
Inventory arithmetic inconsistencies and order-total mismatches are
identified and documented rather than silently rewriting the source values.

## Quarantine
Problematic records are kept separately (one file per dataset, appended
across runs of the same output) so the original information is preserved
and the analytical datasets remain suitable for processing.

## Overall Principle
Cleaning decisions prioritize transparency, reproducibility, and
preservation of source information. Every removal or quarantine is recorded
in `cleaning_log.csv` with the affected row count and reason.
""",

"README.md": f"""# Data Cleaning and Processing

This folder contains the DineIQ Analytics data-quality and processing
scripts.

## Scripts

- `data_quality_check.py` - raw-data quality assessment
- `clean_dineiq_data.py` - data cleaning, FK validation, and quarantine
- `process_dineiq_data.py` - integration and core analytics
- `run_advanced_analytics.py` - SRS intelligence layer (RFM, menu classes,
  basket, forecasting, wastage, pricing, promotions, anomalies, slow movers,
  location/channel, churn, recommendations, what-if, dual-pipeline sets)
- `run_pipeline.py` - end-to-end pipeline runner
- `create_data_docs.py` - documentation generation

## Pipeline

Raw Data -> Quality Assessment -> Cleaning -> Quarantine -> Processed Data
-> Integration -> Core Analytics -> Advanced Analytics / ML

Raw datasets are preserved and are not modified by the cleaning or
processing workflow.

## Documents

- `DATA_DICTIONARY.md` - full schema, PK/FK rules, accounting rule
- `DATA_PROCESSING.md` - pipeline description and outputs
- `CLEANING_DECISIONS.md` - every cleaning decision, documented
- `dual_pipeline/` - Python side of the SRS dual-pipeline comparison

## Tests

`python -m pytest Ali Jaan/tests -q`
"""
}

for name, content in docs.items():
    (p / name).write_text(content, encoding="utf-8")

print("Documentation created successfully.")
for name in docs:
    print(" - " + name)
