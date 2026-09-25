# AI Usage Declaration

This file records the use of AI-assisted development during the DineIQ
Analytics project, as required by the SRS.

## Policy

AI tools may be used for research, brainstorming, documentation
assistance, code suggestions, debugging guidance, and development
support. All AI-assisted code is reviewed by the team, modified where
necessary, understood by the responsible team member, and tested before
being integrated. Final analytical decisions, predictions,
recommendations, and project logic are implemented and validated by the
project team according to the SRS. No external generative-AI decision API
is used at runtime to produce predictions or recommendations.

## AI-Assisted Work Log

### 2026-09-24 - Python data pipeline (Ali Jaan workspace)

**Purpose:** Implement and repair the data-generation, cleaning,
processing, and advanced-analytics stages of the Python pipeline so that
they satisfy the SRS data, data-quality, analytics, and
dual-pipeline-comparison requirements.

**Affected files and changes:**

| File | Change |
| --- | --- |
| `data_generator/generate_dineiq_data.py` | Rewritten. Loads scale/quality/time settings from `config/data_generation_config.yaml`. Order baskets are now drawn only from the order's own restaurant menu (restaurant consistency). Orders can reference a promotion that is active on the order date at the order's restaurant and meets the minimum order value; the promotion discount is applied at line level. Ratings now reference items actually present in the order. Added monthly demand seasonality plus weekend uplift (learnable forecast signal). Documented injected quality cases: missing emails/payment methods, duplicate customers, zero-quantity and negative-total lines, price-outlier lines, inconsistent order totals, business-duplicate lines, orphan ratings, out-of-period orders. |
| `config/data_generation_config.yaml` | `processed_dir` corrected to the canonical `processed_data` (Parquet stays under `parquet_data` for the Spark pipeline). |
| `data_cleaning/clean_dineiq_data.py` | Refactored to a reusable `main()` with configurable directories. Added full foreign-key validation across datasets (order-item restaurant consistency, order customer/restaurant/promotion references, promotion activity window logging, rating customer match and item-in-order check, inventory/wastage item ownership, analysis-period validation). `promotion_id` normalized to clean integer strings. All removals/quarantines logged in `cleaning_log.csv`. |
| `data_cleaning/process_dineiq_data.py` | Refactored to `main()`. Introduced the analytical accounting rule: revenue/sales/performance analytics use completed orders only; cancelled orders are kept and flagged. Added `is_completed` / `is_promo_order` / `promotion_id` handling, promo flags in customer and item analytics, and a promotion usage summary. |
| `data_cleaning/run_advanced_analytics.py` | New. SRS intelligence layer: RFM + KMeans segmentation; menu business classes with contradictory-case flags; market-basket support/confidence/lift; peak-period analysis; demand forecast with chronological 90-day holdout, MAE/RMSE/MAPE and naive-baseline comparison; wastage risk; price elasticity; promotion effectiveness and trap detection; anomaly detection; slow-moving items; location/channel intelligence; churn-risk logistic regression; evidence-backed recommendations; what-if scenarios; dual-pipeline comparison sets. |
| `data_cleaning/run_pipeline.py` | New. End-to-end pipeline runner (`--skip-generation` supported). |
| `data_cleaning/create_data_docs.py` | Updated documentation templates to match the new pipeline. |
| `data_cleaning/DATA_DICTIONARY.md` | New. Full schema, PK/FK rules, accounting rule, injected-case documentation. |
| `tests/` (conftest + 4 test modules) | New. 24 tests validating generator invariants, cleaning PK/FK/quarantine behaviour, processing outputs, advanced analytics outputs, model metrics, and dual-pipeline set consistency. |
| `requirements.txt` | Populated with the actual Python dependencies. |

**How the code was verified (team verification):**

- `python -m pytest tests -q` - 24/24 tests pass. The suite
  runs the complete pipeline at medium scale in a temp directory and
  asserts: 100% order-line restaurant consistency, valid promotion
  linkage, injected issues present, cleaned PK uniqueness, zero FK
  orphans, quarantines capturing every injected case, completed-orders-only
  revenue, forecast model MAE below the naive baseline, dual-pipeline sets
  with >= 100 unseen cases and aligned IDs, and churn accuracy above
  0.8.
- Full-scale run (1,000,000 order lines, 100,000 orders) executed
  end-to-end: generation (~8 s), cleaning (~6 s), processing, and
  advanced analytics all completed; outputs inspected for sanity
  (forecast MAE 180,918 vs naive 317,352; churn accuracy 99.8% on the
  synthetic recency-driven label; 120 promotions analyzed with 11,591
  attributed promo orders).
- Bugs found and fixed during review: promotion flag treated NaN as a
  promotion (all orders flagged), float-formatted promotion ids
  (`"56.0"`) breaking joins, forecast moving-average cold-start NaNs,
  and a read-only-array assignment in the naive baseline.

**Analytical honesty note:** the synthetic churn label is defined by
inactivity in the final 60 days, so recency is an extremely strong
feature and accuracy is correspondingly high on this data. This is
documented in `churn_model_metrics.csv` (definition row) and is expected
for synthetic data; on hidden/real data the metric must be re-evaluated.

### 2026-09-24 - Big Data / Spark pipeline (Hamza workspace)

**Purpose:** Implement the DineIQ Big Data pipeline (PySpark/Spark SQL/
MLlib path plus a documented fallback), model artifacts, dual-pipeline
comparison, NFR latency test, and the model-serving API contract.

**Affected files and changes:**

| File | Change |
| --- | --- |
| `spark_jobs/engines.py` | New. Engine abstraction: `SparkEngine` (PySpark `local[*]`, explicit-DDL readers, MLlib) and `PandasEngine` (documented fallback, pyarrow Parquet, scikit-learn). Auto-selects by JVM/pyspark availability; every artifact records the engine. |
| `spark_jobs/schemas.py` | New. Explicit Spark DDL + pandas dtype maps for all 12 datasets, primary keys, analysis window, Parquet partition columns. |
| `spark_jobs/ingest_validate.py` | New. Explicit-schema ingestion, schema-inference drift check, PK/FK/range/period validation, data-quality report, partitioned Parquet writer. |
| `spark_jobs/spark_sql.py` | New. 10 Spark SQL queries (views + aggregations): enriched orders, completed-order revenue, monthly/category/channel revenue, peak hours, item-combo lift, promo effectiveness with trap flags, location ranking, churn candidates; pandas equivalents for the fallback engine. |
| `spark_jobs/features.py` | New. Single shared source of truth for the 13 order / 8 churn / 6 menu features, used by BOTH pipelines to guarantee feature parity. |
| `spark_jobs/mllib_models.py` | New. Trains + evaluates 3 models (high-value order RF, churn LR, menu-class RF) on data excluding committed unseen cases; saves versioned artifacts; loads latest for serving. |
| `spark_jobs/dual_pipeline_compare.py` | New. Loads latest versioned models, scores the committed 300/200/30 unseen cases, emits per-case side-by-side + agreement statistics. |
| `spark_jobs/ensemble_latency.py` | New. NFR test: loads both pipelines' versioned models (never retrains), warm 100-record batch, combined (probability-average) prediction timed against the 5000 ms limit. |
| `spark_jobs/run_all.py` | New. Orchestrates the 5 steps; `--engine auto/spark/pandas`. |
| `setup_spark.sh` | New. Production setup: venv, JRE 17, Spark smoke test. |
| `tests/spark/test_spark_pipeline.py` | New. 14 tests (ingestion quality, Parquet partitioning, SQL outputs, versioned models, dual comparison, NFR timing) on a small generated dataset. |
| `data_cleaning/model_artifacts.py` | New (cross-workspace; Ali owns Python artifacts). Persists the Python order-value RF + churn LR as versioned artifacts and self-validates they reproduce the committed Python predictions exactly (300/300, 200/200). |
| `Main/SPARK_PIPELINE.md`, `Main/API_CONTRACT.md`, `Main/DEVELOPMENT_LOG.md`, `reports/README.md` | New. Pipeline documentation, model-serving contract for the web team, development log, evidence index. |
| `Hamza/README.md` | Updated with the completed Big Data work. |
| `requirements.txt` | Added `pyspark`, `pyarrow`. |
| `.gitignore` | Ignored regenerable `parquet_data/`, `models/`, `reports/`, `models/` (kept `reports/` committed). |

**How the code was verified (team verification):**

- `python -m pytest "tests" tests/spark -q` - **38/38 pass**
  (24 Python-pipeline + 14 Big Data). The Big Data suite runs the real
  pipeline on a generated dataset in a temp dir and asserts zero FK
  failures on the cleaned layer, negative-value detection, Parquet
  partitioning, all 10 SQL outputs, 3 versioned model artifacts, dual
  comparison agreement, and NFR timing under 5000 ms.
- Full-scale run on the canonical 99,900-order / 997,205-line layer:
  0 validation failures; 3 models trained; dual-pipeline agreement
  100 % on 300 / 200 / 30 cases; ensemble 100-record batch 90.3 ms
  max (limit 5000 ms).
- Cross-validation against the independent Python pipeline: promo
  effectiveness reproduced 120/120 rows (incl. the 97-trap
  classification); order features re-derived for all 300 cases with
  100 % match; Python artifacts reproduce the committed predictions
  exactly.

**Analytical honesty note:** the committed full-scale evidence was
produced on the documented **pandas fallback engine** because the build
sandbox has no JVM and no reachable JRE package; the Spark engine code
path is present but not executed in that sandbox. Every artifact is
labelled with its producing engine, and `setup_spark.sh` +
`--engine spark` run the identical flow on a JVM machine. The churn
label remains the documented recency proxy, so its ~1.0 evaluation
accuracy is a property of the definition, not a claim of real churn
performance.
