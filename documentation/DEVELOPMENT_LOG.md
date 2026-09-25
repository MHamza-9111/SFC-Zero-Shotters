# DineIQ Analytics - Development Log

Competition deliverable: chronological record of significant
decisions, problems, and resolutions. Entries are added by the team
member who made the work.

---

## 2026-09-24 - Market-basket lift: removed co-location artifact

### Problem

Chart 07 showed top item pairs with lift ~20x. Checked the data:
every pair lives inside one restaurant (an order only ever contains
items from its own restaurant), and the denominator used **all chain
orders** (79,930) while the co-occurrence can only happen inside one
restaurant's orders (~4,000). Measuring the 490 pairs with >=100 joint
orders against their own restaurant's orders gives lift 0.87-1.01
(median 0.98) - i.e. baskets follow item popularity and the 20x was a
pure co-location artifact (chain orders / restaurant orders = 19.4-20.5).
Publishing it would have been a fabricated insight (SRS no-fabricated
insights rule).

### Fix

- `run_advanced_analytics.py market_basket()`: support / confidence /
  lift now measured against the pair's restaurant; chain-level value
  kept as a `chain_lift` column for transparency.
- `spark_sql.py top_item_combos` (SQL string and pandas engine): same
  within-restaurant lift plus `restaurant_id` and `chain_lift` columns.
- Chart 07 now states the honest result in the title; API_CONTRACT row
  updated with the new columns.

### Chart polish (same pass)

01 table legibility, 02 truncated model labels, 17 legend/title
overlap, 20 value labels on the log scale.

Verified: `run_local.py --skip-generation` exit 0, 0 validation
failures, dual pipeline 300/300 + 200/200 + 30/30 (100 %), NFR PASS,
20/20 charts, pytest 38/38.

---

## 2026-09-24 - Menu class rule aligned to SRS Step 10; charts committed

### Problem found while reviewing the dashboard

- Chart 11 exposed that the menu business-class rule contradicted SRS
  Step 10. Its fallback (`np.select` default) labelled **27 high-demand
  items "Low Performer"** (SRS: Low Performer = *weak demand*), including
  the cell with 20,628 units sold and PKR 14.4M profit, and 10
  **low-demand** items were "Profit Driver" (SRS: *high demand* and high
  profitability).

### Fix

- One rule, identical in `data_cleaning/run_advanced_analytics.py`
  and `spark_jobs/features.py` (median splits; the four
  conditions partition every item, so no default is reached):
  Profit Driver = high demand + high profit + high margin; Volume Driver
  = any other high-demand item; Hidden Opportunity = low demand + high
  margin; Low Performer = low demand + low margin.
- Class counts (LP / PD / HO / VD): 66 / 44 / 26 / 14 -> 39 / 34 / 36 /
  41; 37 of 150 labels changed.
- Menu model retrained: accuracy 0.9583 (unchanged), macro-F1 0.9614 ->
  0.9495. Dual-pipeline menu comparison still 30/30 (100 %). Tests 38/38.

### Dashboard charts

- `reports/charts/` (20 PNGs) is now committed; it had been gitignored, so
  the charts never reached GitHub.
- Chart corrections: 05 compares average orders **per day** (the yearly
  totals made weekdays look busier because a year has 261 weekdays vs
  104 weekend days; per day, weekends are +32 % at the 21:00 peak);
  16 plots restaurant-level revenue, the level the detector works at
  (markers had been drawn at 0); 11 is a demand x margin matrix with
  consistent class colours; 10 shows segment profiles; 15 compares
  first vs last 60 days; 12 uses a log scale; 14 layout fixed.
- `make_charts.py` counted only *new* files as written, so overwriting
  the committed charts was reported as "skipped"; each chart now returns
  the path it wrote.

---

## 2026-09-24 - Big Data pipeline (Hamza)

### What was delivered

- `spark_jobs/` - the complete Big Data pipeline
  (ingestion/validation -> Spark SQL -> models -> dual-pipeline
  comparison -> NFR latency test), runnable end-to-end:
  `python -m spark_jobs.run_all`.
- `setup_spark.sh` - production setup (venv, JRE 17, Spark smoke
  test).
- `data_cleaning/model_artifacts.py` - versioned Python model
  artifacts with exact-reproduction self-validation (300/300 and
  200/200 committed predictions reproduced).
- Evidence committed under `reports/` (quality report, 10 SQL
  outputs, model evaluation, dual-pipeline comparison, NFR latency
  report), every file engine-labelled.
- 14 new tests (`tests/spark/test_spark_pipeline.py`); full suite
  38/38.

### Key decisions

1. **Dual-engine architecture.** The build sandbox has no JVM and no
   network route to install one (verified exhaustively: apt mirrors
   blocked, Temurin/Adoptium/Azul downloads unreachable, no JRE
   package on PyPI). Rather than ship untestable Spark code, the
   pipeline has two engines behind one interface
   (`engines.py`): PySpark+Spark SQL+MLlib (production) and a
   documented pandas/pyarrow/scikit-learn fallback. The same five
   steps run on either; every artifact records which engine produced
   it. The committed full-scale evidence is therefore labelled
   `pandas`; `--engine spark` runs the identical flow on a machine
   with a JRE.

2. **Shared feature builder.** Dual-pipeline agreement is only
   meaningful if both sides consume identical features. The 13 order
   features, 8 churn features and 6 menu features live in one module
   (`features.py`) imported by BOTH the Spark-side training
   (`mllib_models.py`) and the Python-side artifacts
   (`model_artifacts.py`). Verified: re-derived all 300 case features
   from the canonical layer - 100 % match; Python artifacts
   reproduce the committed Python predictions exactly.

3. **No leakage on the dual task.** All three models train on the
   canonical layer MINUS the committed unseen-case IDs (300 orders /
   200 customers / 30 menu cells). The case files (features + actuals)
   are the only input to the comparison step; models are loaded from
   versioned artifacts, never retrained.

4. **`day_of_week_code` mapping.** Ali's pipeline uses
   `pd.factorize` on weekday names, whose codes depend on appearance
   order in the data - impossible to re-derive from raw dates alone.
   The mapping is recovered from the committed case file
   (`order_date` -> code) instead, so training and prediction share
   the Python pipeline's exact coding.

5. **Completed-status casing.** The cleaned layer stores
   `order_status = "Completed"` (capital C). Early pipeline versions
   filtered on lowercase `"completed"` and silently produced empty
   revenue frames - caught by the empty `top_item_combos` output. All
   filters now use `UPPER(TRIM(...)) = 'COMPLETED'` in SQL and the
   equivalent string handling in pandas.

6. **Promo effectiveness mirrors the Python design.** The first Spark
   SQL draft used a 28-day before/after window keyed on promotion
   type, but the generator's `promotion_type` values
   (`Percentage Discount` / `Seasonal` / `Bundle`) carry no
   item/category scoping, and Ali's established design is
   restaurant-window based (promo-tagged vs control orders at the same
   restaurant during the active window). The SQL was rewritten to
   mirror that design; result matches Ali's committed
   `promotion_effectiveness.csv` 120/120 rows, including the
   97-trap classification.

7. **`basket_size` = order lines, not distinct items.** Initial
   parity check showed case values of 9-11 vs my 3-8: Ali's definition
   counts `order_item_id` rows (lines repeat items). Fixed in the
   shared builder; parity restored to 100 %.

### Problems found and fixed

| Problem | Symptom | Fix |
| --- | --- | --- |
| Row count logged as failures | quality report "1,347,064 failures" | `row_count` is now informational (0 failures, count in detail) |
| Empty promo results | 0 rows from promo query | correct status casing + restaurant-window design (see 5, 6) |
| `location_id_loc` / duplicate column drops | KeyError in pandas SQL equivalents | removed spurious drops; merged `restaurant_id` from orders into revenue lines |
| Merged-column suffixes in comparison | `KeyError: actual_high_value` | explicit suffix handling on case/prediction merges |
| Engine-label shape mismatch in latency report | `'str' object has no attribute 'get'` | `_engine_of()` normalizes string vs dict metadata |

### Results (full scale, canonical layer)

- Validation: **0 failures** across 12 datasets (PK uniqueness, FK
  integrity, ranges, analysis period).
- Parquet: 12 datasets; `orders` partitioned by `order_month`,
  `order_items` by `restaurant_id`.
- Models: high-value order acc 0.9858 / AUC 0.9975; churn acc
  0.9989 (label is the documented recency proxy - high accuracy
  expected); menu class acc 0.9583.
- Dual pipeline: **100 % agreement** on 300 / 200 / 30 cases
  (parity-by-construction, documented in `SPARK_PIPELINE.md`).
- NFR: ensemble 100-record batch **90.3 ms max** vs 5000 ms limit -
  PASS (churn 200-record batch: 1.7 ms max).
- Tests: 38/38.

### Known limitations

- The committed evidence was produced on the pandas engine (no JVM in
  the sandbox); the Spark engine code path is present and structured
  but was not executed here. It is smoke-tested by `setup_spark.sh`
  on any machine with a JRE.
- Churn label is a recency proxy (no completed order in the final 60
  days); the ~1.0 evaluation accuracy is a property of that definition
  and is documented as such, per the SRS no-fabricated-insights rule.

---

## 2026-09-24 - Python data pipeline (Ali Jaan)

*See `notebook/README.md`, the committed dual-pipeline sets under
`data_cleaning/dual_pipeline/`, and the AI usage log entry
for the full record of the Python-side work delivered this day
(generator, cleaning with quarantine, processing, advanced
analytics, 24 tests).*
