# DineIQ Analytics - Big Data Pipeline (Spark)

Owner: **Hamza** (team lead / Spark-ML / Big Data)
Status: **complete** - full-scale run on the canonical cleaned layer,
evidence committed under `reports/`.

This pipeline satisfies the SRS Big Data Engineering requirements:

| SRS requirement | Where |
| --- | --- |
| PySpark / Spark ingestion with explicit schema | `spark_pipeline/ingest_validate.py` + `schemas.py` |
| Schema inference compared with explicit schema | inference-drift checks in `ingest_validate.py` (Spark engine) |
| Data validation (PK/FK/ranges/period) + quality report | `ingest_validate.py` -> `spark_ingestion_quality_report.csv` |
| Spark SQL joins, filters, aggregations | `spark_pipeline/spark_sql.py` (10 named queries) |
| Partitioned Parquet in `parquet_data` | `orders.parquet` (by `order_month`), `order_items.parquet` (by `restaurant_id`) |
| Minimum 3 ML models (MLlib) trained + evaluated | `spark_pipeline/mllib_models.py` (3 tasks) |
| Dual-pipeline comparison on unseen cases | `spark_pipeline/dual_pipeline_compare.py` |
| NFR: ensemble prediction < 5 s, versioned artifacts | `spark_pipeline/ensemble_latency.py` + `SRS_CLARIFICATIONS.md` |

## Engines

`spark_pipeline/engines.py` selects the execution engine:

- **SparkEngine** (production): PySpark `local[*]`, explicit-DDL CSV
  readers, Spark SQL views, partitioned Parquet writer, MLlib models.
- **PandasEngine** (documented fallback): identical steps with pandas
  merge/groupby as the SQL-equivalent operations and scikit-learn in
  place of MLlib, Parquet via pyarrow. Used when no JVM is available.

Every artifact written by the pipeline carries an engine label
(`engine.json` next to each evidence directory, `engine` column in
summary CSVs, `engine` block in model metadata). The full-scale
evidence committed in this repository was produced by the **pandas
engine** because the build sandbox has no JVM; on a machine with a JRE
the identical code runs on Spark via `--engine spark`.

Setup for a real Spark machine (venv + JRE 17 + smoke test):

```bash
bash setup_spark.sh
./.venv/bin/python -m spark_jobs.run_all --engine spark
```

## Pipeline steps

```
processed_data/   (canonical cleaned CSV layer, 12 datasets)
        |
1. ingest_validate    explicit-schema load -> PK/FK/range/period checks
        |             -> quality report -> partitioned Parquet (parquet_data)
2. spark_sql          10 analysis outputs (enriched orders, revenue lines,
        |             monthly/category/channel aggregations, peaks, basket
        |             lift, promo effectiveness, location ranking, churn list)
3. mllib_models       3 models trained on data EXCLUDING the committed
        |             unseen case IDs (no leakage); evaluated on an internal
        |             holdout; saved as versioned artifacts models/<task>/v<n>/
4. dual_pipeline_compare
        |             loads latest artifacts, scores the committed 300/200/30
        |             cases, per-case side-by-side + agreement statistics
5. ensemble_latency   NFR test: 100-record warm batch, both models loaded
                      from versioned artifacts, combined in < 5 s
```

Run everything:

```bash
./.venv/bin/python -m spark_jobs.run_all          # auto engine
./.venv/bin/python -m spark_jobs.run_all --engine spark
```

## Models (step 3)

| Task | Model | Internal-eval metrics (full scale) | Label rule |
| --- | --- | --- | --- |
| `high_value_order` | RandomForest (150 trees, seed 42) | acc 0.9858, F1 0.9284, AUC 0.9975 | top 10 % of completed-order value (training-side 90th percentile) |
| `customer_churn` | LogisticRegression (seed 42) | acc 0.9989, macro-F1 0.9985, AUC 1.000 | no completed order in the final 60 days (recency proxy, >= 180-day observation window) |
| `menu_business_class` | RandomForest (150 trees, seed 42) | acc 0.9583, macro-F1 0.9495 | 4-class SRS Step 10 median rule: Profit Driver = high demand + high profit + high margin; Volume Driver = any other high-demand item; Hidden Opportunity = low demand + high margin; Low Performer = low demand + low margin (contradictory cases flagged separately) |

Artifacts: `models/<task>/v<n>/model.joblib` (or native MLlib dir on
Spark) + `metadata.json` (engine, hyperparameters, feature list, metrics,
version, timestamp). The serving path (see `API_CONTRACT.md`) loads the
latest version and never retrains.

**Feature parity:** both pipelines train on features produced by one
shared module, `spark_jobs/features.py` (single source of truth).
A parity check during development re-derived the 13 order features for all
300 committed cases from the canonical layer and matched every value
exactly; the Python artifacts additionally reproduce the committed
Python predictions 300/300 and 200/200 exactly.

## Dual-pipeline comparison (step 4)

Full-scale result (committed evidence):

| Task | Cases | Agreement | Python accuracy | Pipeline accuracy |
| --- | --- | --- | --- | --- |
| high_value_order (primary) | 300 | **100.0 %** | 0.9867 | 0.9867 |
| customer_churn (secondary) | 200 | **100.0 %** | 1.0000 | 1.0000 |
| menu_business_class | 30 | **100.0 %** | 0.9667 | 0.9667 |

100 % agreement is the expected outcome of the parity design: identical
features (shared builder), identical hyperparameters and seed, identical
training data (canonical layer minus the case IDs). The committed
per-case files (`reports/dual_pipeline/*_comparison.csv`) still
record IDs, actuals, both outputs, match flags and disagreement
explanations, as the SRS requires; any future divergence (e.g. a model
retrained with different data or hyperparameters) would show up here with
per-case explanations.

## NFR: 5-second ensemble (step 5)

Protocol per `SRS_CLARIFICATIONS.md`: versioned artifacts loaded (never
retrained), warm process, 100-record batch, both pipelines' models scored
and combined (probability average -> label at 0.5).

Measured (full scale, 5 warm runs, max reported):

| Task | Batch | Total ensemble | Limit | Result |
| --- | --- | --- | --- | --- |
| high_value_order | 100 | 90.3 ms max | 5000 ms | **PASS** |
| customer_churn | 200 | 1.7 ms max | 5000 ms | **PASS** |

The same protocol is asserted in `tests/spark/test_spark_pipeline.py`.

## Tests

```bash
./.venv/bin/python -m pytest tests/spark -q     # 14 pipeline tests
./.venv/bin/python -m pytest "tests" tests/spark -q   # 38 total
```

The suite runs the real pipeline code on a small generated dataset in a
temp directory: ingestion quality (zero FK failures on the cleaned layer,
negative-value detection), Parquet partitioning, all 10 SQL outputs,
versioned model artifacts, dual comparison, and the NFR timing.

## Evidence map (committed)

| Path | Content |
| --- | --- |
| `reports/quality/spark_ingestion_quality_report.csv` | one row per validation check, full scale |
| `reports/spark_sql/` | 10 analysis outputs (capped copies) + summary + engine label |
| `reports/models/` | model evaluation summary + engine label |
| `reports/dual_pipeline/` | per-case comparisons + agreement statistics + summary |
| `reports/latency/` | NFR report, detail JSON, ensemble samples + engine label |

Regenerable (gitignored) outputs: `parquet_data/` (full Parquet
layer), `models/` (model binaries), `reports/` (full-size SQL
outputs and runtime reports).
