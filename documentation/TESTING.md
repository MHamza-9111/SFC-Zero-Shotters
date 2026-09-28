# Verification record

Run the existing suite from the repository root:

```powershell
python -m pytest tests -q
```

## Latest verification in this checkout

| Check | Result |
|---|---|
| Full Python, Spark, API, authentication, and role-dashboard suite | **111 passed** in 61.47 seconds. |
| Python syntax compilation (`src`, `spark_jobs`, `python_pipeline`, `data_generator`, `notebooks`) | Passed. |
| JavaScript syntax (`node --check`, all `static/js/*.js`) | Passed for all 7 scripts. |
| Full Python data pipeline, `--skip-generation` | Completed on the existing synthetic dataset: 100,000 orders and 1,000,200 raw order lines; raw source unchanged. |
| Spark-compatible pipeline, `--engine auto` | Completed with pandas/pyarrow fallback; zero validation failures across 12 cleaned datasets; 10 analytical outputs; versioned model artifacts and held-out comparisons generated. |
| Held-out comparison | 300/300 high-value, 200/200 churn, 30/30 menu cases matched for pipeline v5 and Python v6/v2 artifacts. |
| Warm latency evidence | High-value, 100-record batch: 119.357 ms mean / 148.700 ms max. Churn, 200-record batch: 3.148 ms mean / 5.847 ms max. Both below the 5,000 ms limit. See `reports/latency/ensemble_latency_report.csv`. |
| Dashboard charts | Inventory, customer risk, promotions and Reports render dynamic responsive inline SVG. No PNG chart URLs or `<img>` chart embeds remain in the UI; the former chart image endpoint returns 404. |
| Model workbench | The Models & serving tab now includes the task selector, feature form, benchmark sample, and live prediction result panel. |
| CRUD and access verification | Temporary SQLite/API check passed all 12 resources, create/list/read/update/delete paths, role enforcement, CSRF, field and relationship validation, audit logging, and foreign-key delete protection. |
| Dashboard WSGI smoke | Waitress served health/status, six live chart-data APIs, all 22 page routes, and the old PNG chart URL (404 as expected). |
| Dashboard structure | All nav page sections and active JavaScript DOM references resolve; no dashboard PNG references or image embeds remain. CSS parsing reported no declaration errors; light/dark text and accent colors meet WCAG AA contrast against their page backgrounds. |

The full pipeline and latency numbers are specific to this machine, dataset, and artifact set. The engine metadata identifies the Big Data run as the pandas/pyarrow fallback because this machine has no usable JVM. A PySpark execution, 5M-line benchmark, visual browser review across devices, hosted load test, and uptime measurement have not been performed here.

The final full suite includes the dashboard, scorer, and loader changes. A Pandas nullable-string dtype regression in blank-value detection was fixed before this run. The numerical deprecation warning from `pd.Timedelta(days=180)` was corrected by using an explicit unit.
