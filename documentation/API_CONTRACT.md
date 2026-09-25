# DineIQ Analytics - Model Serving API Contract

Owners: **Hamza** (this contract + model artifacts + ensemble service)
Consumers: **Farooq / Zain** (web application)

This contract defines what the Big Data pipeline exposes to the web
application for the "upload and predict" flow and the model-management
UI requirements. It is written against the implemented pipeline, so
every endpoint maps to code that exists (or a thin service wrapper
around it, listed as *to wrap*).

## 1. Ensemble prediction (the 5-second NFR flow)

**SLO:** a request with up to 100 order records returns the combined
prediction from **both** pipelines' models in **< 5 000 ms** end-to-end
(measured full-scale: ~90 ms for 100 records; see
`reports/latency/ensemble_latency_report.csv`).

Models are **loaded once at service start** from versioned artifacts
(never retrained at request time), keeping the process warm:

| Pipeline | Artifact loaded at startup |
| --- | --- |
| Big Data (this workspace) | `models/high_value_order/v<n>/` (latest) |
| Python | `models/high_value_order/v<n>/` (latest) |

### `POST /api/v1/predict/order-value`

Request (JSON):

```json
{
  "records": [
    {
      "order_id": 1001,
      "customer_id": 42,
      "order_hour": 18,
      "day_of_week_code": 2,
      "order_month": 7,
      "is_weekend": false,
      "is_promo_order": true,
      "channel_code": 1,
      "payment_code": 2,
      "basket_size": 4,
      "basket_quantity": 6,
      "avg_unit_price": 1520.5,
      "discount_rate_percentage": 3.1,
      "total_orders": 12,
      "total_spend": 54000.0
    }
  ]
}
```

* `records` must contain 1..100 rows with exactly the 13 order features
  (identical names/semantics to
  `data_cleaning/dual_pipeline/order_value_unseen_cases.csv` -
  that file is the reference for value ranges and coding).
* `order_id` / `customer_id` are for audit correlation only; the models
  do not consume them.

Response `200` (JSON):

```json
{
  "ensemble_version": {"big_data": 1, "python": 1},
  "engine": {"big_data": "pandas", "python": "python"},
  "latency_ms": 84.2,
  "results": [
    {
      "order_id": 1001,
      "high_value_predicted": 1,
      "probability_big_data": 0.91,
      "probability_python": 0.97,
      "probability_ensemble": 0.94,
      "decision_rule": "probability average, threshold 0.5"
    }
  ]
}
```

Combination rule (fixed, documented in
`spark_jobs/ensemble_latency.py`):
`probability_ensemble = (p_big_data + p_python) / 2`,
`high_value_predicted = 1 if probability_ensemble >= 0.5 else 0`.

Errors:

| HTTP | Meaning |
| --- | --- |
| 400 | missing/unknown feature, > 100 records, non-numeric value |
| 503 | model artifacts missing or failed to load at startup |

### `POST /api/v1/predict/churn` (secondary)

Same shape for customer records (8 churn features, see
`churn_unseen_cases.csv` columns). Batch up to 200; measured ~2 ms.
Response mirrors the order-value shape (`churn_predicted`,
`probability_*`, `ensemble_version`).

## 2. Model versioning UI (SRS requirement)

### `GET /api/v1/models`

```json
{
  "models": [
    {
      "task": "high_value_order",
      "pipeline": "big_data",
      "version": 1,
      "artifact": "models/high_value_order/v1/",
      "trained_at": "2026-09-24 15:00:00",
      "engine": "pandas",
      "metrics": {"eval_accuracy": 0.9858, "eval_f1": 0.9284, "eval_roc_auc": 0.9975},
      "features": ["order_hour", "day_of_week_code", "..."],
      "status": "active"
    },
    { "task": "high_value_order", "pipeline": "python", "version": 1, "status": "active", "...": "..." }
  ]
}
```

Source: read `metadata.json` from each `v<n>/` directory under
`models/` and `models/` (both use the same layout:
`model.joblib` + `metadata.json` with `task`, `version`, `engine`,
`trained_at`, `features`, `metrics`).

The "active" version is the highest `v<n>` per (task, pipeline) - the
same rule the ensemble loader uses, so the UI always shows what is
actually serving.

## 3. Audit and job status (SRS requirements)

* **Audit:** the web app must log, per prediction request: timestamp,
  user role, record count, model versions used (from
  `ensemble_version`), and measured `latency_ms`. These fields exist in
  the response precisely so the audit row is one JSON capture.
* **Pipeline job status:** a `GET /api/v1/pipeline/status` endpoint
  (to wrap) should report the last `run_all.py` outcome. The pipeline
  writes one line per step to stdout and evidence files under
  `reports/`; the service can tail the run log or check
  `reports/latency/ensemble_latency_report.csv`
  (columns `pass`, `total_ms_max`, `nfr_limit_ms`) to answer
  "is the ensemble healthy?".
* **Error handling:** all endpoints return the JSON error envelope
  `{"error": "<code>", "message": "<human readable>"}`; codes:
  `INVALID_RECORDS`, `BATCH_TOO_LARGE`, `MODELS_UNAVAILABLE`,
  `INTERNAL_ERROR`.

## 4. Dashboards (data contracts)

Dashboard charts read committed/refreshed evidence, not live models:

| Dashboard widget | Source file | Key columns |
| --- | --- | --- |
| Category revenue share | `reports/spark_sql/category_revenue_share.csv` | `category_name`, `revenue`, `share` |
| Peak hours | `reports/spark_sql/peak_hours.csv` | `hour`, `day_type`, `orders` |
| Top item combos (lift) | `reports/spark_sql/top_item_combos.csv` | `item_a_name`, `item_b_name`, `restaurant_id`, `orders_with_combo`, `lift` (within-restaurant; `chain_lift` column kept for transparency) |
| Promo traps | `reports/spark_sql/promo_effectiveness.csv` | `promotion_name`, `aov_lift_percentage`, `promotion_trap` |
| Location ranking | `reports/spark_sql/location_ranking.csv` | `city_area`, `revenue`, `avg_order_value` |
| Churn candidates | `reports/spark_sql/churn_candidates.csv` | `customer_id`, `days_since`, `total_orders` |
| Dual-pipeline agreement | `reports/dual_pipeline/dual_pipeline_summary.csv` | `task`, `agreement_percentage` |
| NFR health | `reports/latency/ensemble_latency_report.csv` | `pass`, `total_ms_max` |

## 5. Reference implementation (thin service)

The ensemble computation to wrap (already implemented and tested):

```python
from Main.spark_pipeline.ensemble_latency import measure_ensemble
from Main.spark_pipeline.features import ORDER_FEATURES
```

`measure_ensemble(pipeline_models_dir, python_models_dir, cases_dir)`
implements exactly the contract in section 1 (load both versioned
models, warm, time the combined 100-record batch). A Flask/FastAPI
service around it plus the metadata readers of section 2 is the entire
server-side surface for the UI.

## 6. Non-goals (for the web team)

* Retrain or modify models at runtime - artifacts are immutable per
  version; a new version is produced by re-running
  `run_all.py` / `model_artifacts.py`.
* Bypass the ensemble for a single pipeline - the NFR is defined on
  the combined prediction; per-pipeline probabilities are returned for
  transparency, not as a separate product.
