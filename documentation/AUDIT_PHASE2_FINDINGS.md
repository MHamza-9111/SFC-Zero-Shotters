# DineIQ Analytics — Phase 2 Verification & Fix Matrix

## Source basis and execution boundary

This is the single Phase 2 requirement-to-implementation matrix. The supplied Phase 2 master prompt requires the Phase 1 audit, official SRS, and live verification; the ZIP contained the official SRS and project source, but `documentation/AUDIT_PHASE1_FINDINGS.md` was not present in the supplied archive and is not in the repository history. I therefore did not fabricate its contents and re-checked the implementation against the official SRS text and the Phase 2 instructions.

The environment contains Java 21 but does **not** contain Flask, PySpark, pyarrow, or fastparquet. Network access is unavailable, so those dependencies could not be installed. Consequently, live Flask/browser verification and genuine Spark/Parquet execution are explicitly marked as blocked/unmeasured; no claim of successful execution is made.

The master prompt explicitly requires: preserve the existing architecture, fix real defects in place, verify live behavior, avoid fabricated analytics, keep Spark/Python independent, and extend the existing Industrial Intelligence UI rather than replacing it. fileciteturn0file0L23-L78

## Phase 2A — leakage fix

| Area | Before | Change | Final evidence |
|---|---|---|---|
| Churn | `recency_days` directly defined `churned`; saved v5 metadata reported 1.0 accuracy/F1/ROC-AUC | Removed `recency_days` from model features in both Python/Spark feature definitions; added legitimate `total_items_purchased` and `weekend_order_share`; shared frame keeps both pipelines feature-consistent without copying predictions | Final holdout: accuracy 0.7724, ROC-AUC 0.8024, macro-F1 0.6473; production model v11 |
| Menu business class | Model inputs overlapped target-defining units/revenue/profit/margin measures | Rebuilt model feature set around rating, wastage, price, promo, weekend, customer-count and line-count behavior; target-defining profitability fields remain outputs only | Python v4: accuracy 0.6000, macro-F1 0.5639 |
| High-value order | Customer-history aggregates included the current order | Changed customer history to leave-one-order-out (`orders - 1`, `spend - current order`) in Python/Spark frames | Holdout accuracy 0.9867, F1 0.9231, ROC-AUC 0.9987 |
The master prompt explicitly requires diagnosing other leakage, applying equivalent Spark/Python fixes, retraining, rechecking metrics, and scanning related classifiers. fileciteturn0file0L82-L150

## Phase 2 UI verification — every rendered page

Static verification found **23** actual dashboard views in `templates/index.html`: the master prompt lists 22 names including overview, while the source also contains `channels`; `/channels` was added to `PAGES`. All 23 views have headings. The 22 secondary views are registered by `pages.js`, with overview handled separately. No interactive control in the template was left without a label/accessible name, no inline-clickable `div/span` lacked a semantic role, and no heading-level skips were detected.

| Page | Interactive controls | Major charts | Phase 2 result |
|---|---:|---:|---|
| overview | 10 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| orders | 6 | 0 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| menu | 2 | 3 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| inventory | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| customers | 2 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| promotions | 1 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| payments | 6 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| reports | 2 | 0 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| channels | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| locations | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| models | 2 | 2 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| settings | 4 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| data | 8 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| basket | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| price | 1 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| forecast | 1 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| peak | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| anomalies | 0 | 0 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| whatif | 3 | 0 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| recommendations | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| quality | 0 | 2 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| team | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |
| billing | 0 | 1 | Static/source verified; live browser console/control/viewport check blocked by missing Flask. |

Shared UI fixes: removed interactive 3D card tilt/cursor-aura behavior from `app.js`; neutralized table/metric hover transforms; preserved the dark Industrial Intelligence visual language; added data-driven chart insight callouts; added keyboard semantics for interactive table rows; added light-theme contrast corrections and fixed undefined `--red`/`--text-1` references; retained reduced-motion support and existing responsive breakpoints. The master prompt specifically requires every page, every interactive control, both themes, accessibility, console and server-log checks. fileciteturn0file0L160-L245

## 66 functional SRS requirements

| ID | SRS requirement | Existing/changed implementation | Final status / verification |
|---|---|---|---|
| i | User Registration and Authentication | src/api/routes.py + templates/auth.html | Implemented in source; live login/registration execution blocked because Flask is unavailable in this environment. |
| ii | Role Based Access Control | src/api/routes.py::_authorized + Administrator guards | Implemented in source; Administrator-only writes/role changes are enforced server-side. Live multi-role requests blocked by missing Flask. |
| iii | Restaurant Location Management | src/services/data_management_service.py; database/sqlite schema; /admin/data/locations | CRUD + validation implemented; end-to-end DB request test blocked by missing Flask. |
| iv | Menu Management | DataManagementService RESOURCES/menu_items; /admin/data/menu_items | CRUD + validation implemented; runtime request test blocked. |
| v | Pricing History Management | DataManagementService pricing_history + /admin/data/pricing_history | CRUD + date/range validation implemented; runtime request test blocked. |
| vi | Customer Data Management | DataManagementService customers; processed analytics | Anonymized customer storage/behavior fields implemented; runtime request test blocked. |
| vii | Order Management | DataManagementService orders/order_items + dashboard orders APIs | Order headers/lines storage and dashboard retrieval implemented; runtime request test blocked. |
| viii | Promotion Management | DataManagementService promotions + dashboard promotions | Promotion/discount/campaign/item fields and CRUD implemented; runtime request test blocked. |
| ix | Rating Management | DataManagementService ratings + ratings analytics | Rating storage, order/item linkage and validation implemented; analytics generated. |
| x | Inventory Management | DataManagementService inventory + inventory analytics | Stock/replenishment/consumption fields and analytics implemented; runtime request test blocked. |
| xi | Wastage Management | DataManagementService wastage + wastage analytics | Quantity/cost/item/location/date/reason stored and analyzed; Python pipeline output generated. |
| xii | Big Data Ingestion | spark_jobs/engines.py + ingest_validate.py | Spark engine branch implemented independently; genuine Spark execution blocked because PySpark is not installed. |
| xiii | Schema Validation | spark_jobs/schemas.py + ingest_validate.py + cleaning tests | Implemented and verified through pandas-based pipeline tests (24/24 suite). |
| xiv | Data Quality Analysis | processing/cleaning + reports/data_quality* | Quality checks and reports generated; pure Python tests pass. |
| xv | Data Cleaning | python_pipeline/cleaning | Cleaning/quarantine rules exercised by passing cleaning tests. |
| xvi | Spark SQL Processing | spark_jobs/spark_sql.py | Spark SQL implementation exists; true Spark execution blocked by missing PySpark runtime. |
| xvii | Data Partitioning | spark_jobs/ingest_validate.py | Partitioned Parquet write path exists; live Parquet partition verification blocked because pyarrow/fastparquet are unavailable. |
| xviii | Parquet Storage | spark_jobs/ingest_validate.py | Parquet output path implemented; runtime verification blocked by missing Parquet engine. |
| xix | Feature Generation | spark_jobs/features.py + advanced analytics | Derived features generated; leakage-free churn/menu/order features now shared consistently. |
| xx | Profitability Analysis | python_pipeline/processing + analytics/menu_item_performance | Revenue, cost, contribution and margin analytics generated from processed data. |
| xxi | Menu Performance Classification | run_advanced_analytics.py::menu_business_classes | Implemented with independent model features; 30 unseen cases generated, Python holdout accuracy 0.6000 / macro-F1 0.5639. |
| xxii | Peak-Period Detection | run_advanced_analytics.py + peak_period_analysis.csv | Peak hours/days/periods generated; Python analytics run completed. |
| xxiii | Customer Segmentation | run_advanced_analytics.py::rfm_segmentation | Behavior-based segments generated and validated by Python tests. |
| xxiv | RFM Analysis | rfm_segmentation.csv | Recency, frequency, monetary scoring generated; tests validate 1-5 ranges. |
| xxv | Market-Basket Analysis | market_basket_pairs.csv | Frequent menu combinations generated; Python tests validate bounded metrics. |
| xxvi | Association-Rule Metrics | market_basket_pairs.csv | Support/confidence/lift generated and bounded by tests. |
| xxvii | Bundle Recommendation | recommendations.csv + dashboard recommendations | Evidence-based bundle/cross-sell recommendations are part of generated recommendation set. |
| xxviii | Demand Forecasting | daily_forecast.csv | 90-day forecast generated using the real processed series. |
| xxix | Forecast Evaluation | forecast_evaluation.csv | Linear model MAE 180,918.10 vs naive 317,352.07; forecast beats baseline and test passes. |
| xxx | Wastage Analysis | wastage_risk_analysis.csv | Wastage trends/risk analysis generated. |
| xxxi | Wastage Prediction | wastage_risk_analysis.csv | High-risk items/periods classified in generated wastage risk output. |
| xxxii | Price-Sensitivity Analysis | price_sensitivity_analysis.csv | Price changes/demand response analysis generated. |
| xxxiii | Promotion Effectiveness Analysis | promotion_effectiveness.csv | Revenue/profit/customer/wastage promotion analysis generated. |
| xxxiv | Promotion Trap Detection | promotion_effectiveness.csv + dashboard | Promotion trap flags are computed in promotion intelligence output. |
| xxxv | Rating Analysis | rating_item_analysis.csv | Item/rating performance analytics generated. |
| xxxvi | Rating Anomaly Detection | run_advanced_analytics.py::anomaly_detection + anomalies API | Added distinct rating spike/drop, identical-cluster, volume-burst and purchase-mismatch rules; final dataset contains rating_volume_burst events. Runtime API verification blocked by Flask. |
| xxxvii | Sales Anomaly Detection | anomaly_detection.csv + anomalies API | Daily sales spikes/drops and order-total outliers generated and surfaced separately from rating anomalies. |
| xxxviii | Location Comparison | location_channel_intelligence.csv + locations API | Standardized location comparison generated. |
| xxxix | Location-Specific Menu Intelligence | menu_business_classes.csv + menu UI | Menu intelligence is computed per item/location in processed data. |
| xl | Ordering Chanel Analysis | channel_analysis.csv + channels API | Dine-in/takeaway/website-app/delivery channel analytics implemented. |
| xli | Customer Churn-Risk Analysis | run_advanced_analytics.py::churn_risk | Leakage removed; final holdout accuracy 0.7724, ROC-AUC 0.8024, macro-F1 0.6473. One honest feature-engineering attempt added item volume and weekend-order-share. |
| xlii | Spark MLib Model Development | spark_jobs/mllib_models.py | Three independent Spark MLlib training functions implemented (RandomForest, scaled LogisticRegression, multiclass RF pipeline); live Spark execution blocked by missing PySpark. |
| xliii | Independent Python Model Development | python_pipeline/model_artifacts.py + sklearn artifacts | Independent Python models trained/versioned; latest Python artifacts reproduce all committed case predictions exactly. |
| xliv | Dual-Pipeline Prediction Comparison | spark_jobs/dual_pipeline_compare.py + reports/dual_pipeline | Comparison logic supports pandas and Spark PipelineModel independently; current runnable fallback comparison is 100% agreement on 300/200/30 cases. Live Spark comparison blocked. |
| xlv | Model Competency Analysis | dual_pipeline agreement reports | Agreement/disagreement metrics and explanations generated; current pandas comparison shows 0 disagreements on committed cases. |
| xlvi | Model Evaluation | reports/model_evaluation + model metrics | Evaluation metrics are generated for classification, forecast and latency checks; latest Python churn/menu metrics remain below the SRS target and are reported honestly. |
| xlvii | Recommendation Engine | run_advanced_analytics.py::recommendations + API | Evidence-based recommendation records generated and tests validate priority/evidence. |
| xlviii | Menu Optimization Recommendations | recommendations.csv/dashboard | Promotion/repricing/bundling/design/removal recommendations are generated from menu intelligence. |
| xlix | Inventory Recommendations | recommendations.csv/dashboard | Inventory recommendations draw on forecast/wastage outputs. |
| l | Customer Targeting Recommendations | recommendations.csv/dashboard | Customer strategies are mapped from segmentation/risk outputs. |
| li | What-If Analysis | src/api/routes.py::what_if + dashboard UI | Real server-side simulator handles price, discount, demand, wastage and remove-item scenarios with explicit assumptions; live POST verification blocked by Flask. |
| lii | Executive Dashboard | overview view + dashboard overview/revenue APIs | Overview KPI/chart UI exists with analytic insight framing; live browser verification blocked by Flask. |
| liii | Menu Dashboard | menu view + menu intelligence API | Menu performance/intelligence view implemented; live browser verification blocked. |
| liv | Customer Dashboard | customers view + customers API | Customer behavior/segments/risk view implemented; live browser verification blocked. |
| lv | Wastage Dashboard | inventory/wastage sections + risk API | Wastage records/risk analytics are available in dashboard/API; live browser verification blocked. |
| lvi | Forecast Dashboard | forecast view + forecast API | Historical/forecast view implemented; live browser verification blocked. |
| lvii | Dual-Pipeline Dashboard | models view + pipeline status APIs | Spark/Python model comparison and pipeline status data implemented; live browser verification blocked. |
| lviii | Search and Filtering | dashboard APIs + pages.js controls | Search/filter/query/page-size controls are wired in source; static control audit found no unlabeled interactive controls. |
| lix | Downloadable Reports | reports catalog + export API | Report catalog/export paths implemented; runtime download verification blocked by Flask. |
| lx | Data Export | /api/v1/dashboard/export | CSV export implements real processed data for orders/menu/customers/promotions/locations/recommendations/market-basket/comparison/quality; runtime verification blocked. |
| lxi | Database Storage | SQLite auth/data schemas + DataManagementService | Users, metadata/configuration/audit and operational records have SQLite storage paths; runtime DB integration blocked by Flask. |
| lxii | Model Version Tracking | model metadata + scoring service | Prediction artifacts carry explicit task/version metadata; serving returns model/version information. |
| lxiii | Audit Trail | src/api/routes.py::_audit + SQLite audit_log | Prediction, export, CRUD, role and reload actions are logged in source. |
| lxiv | Error Handling | app.py + routes.py error handlers | API errors are converted to structured understandable JSON; page/server errors have handlers. Live error-path testing blocked by missing Flask. |
| lxv | Spark Job Monitoring | pipeline/status endpoints + reports | Pipeline status/evidence/report endpoints exist; live Spark monitor execution blocked by missing PySpark. |
| lxvi | Responsive Web Interface | templates/index.html + styles.css | 23 rendered views found (overview + 22 secondary views, including channels); shared breakpoints exist and static layout/accessibility checks pass. Live browser viewport verification blocked by Flask. |

## Five non-functional requirements

| ID | NFR | Final measurement/status |
|---|---|---|
| 1 | Performance | Warm pandas fallback ensemble checks pass: high-value 63.223 ms max 69.841 ms; churn 2.304 ms max 5.376 ms against 5,000 ms limit. Spark/Flask runtime unmeasured here. |
| 2 | Scalable | Architecture separates ingestion/processing/storage and uses partition-aware Spark paths, but a real 5M-row benchmark was not run; remains not measured. |
| 3 | Usable | Industrial dark/light design, focus states, keyboard row behavior, reduced-motion support, responsive breakpoints and data-driven insight callouts are implemented. Live browser usability verification blocked by Flask. |
| 4 | Accuracy | High-value order holdout accuracy 0.9867 / F1 0.9231 / ROC-AUC 0.9987. Churn 0.7724 accuracy / 0.6473 macro-F1. Menu class 0.6000 accuracy / 0.5639 macro-F1. Forecast model improves MAE vs naive (180,918.10 vs 317,352.07). Churn/menu targets are not met and are reported honestly. |
| 5 | Availability | 99% uptime was not measured; remains not measured as required by the master prompt. |

## Remaining-gap checks requested by Phase 2

- **Rating anomaly detection:** implemented as a distinct analysis layer with spike/drop, identical-rating cluster, volume-burst, and rating/purchase-mismatch rules. The current real dataset produced 7 `rating_volume_burst` events plus sales/order anomalies.

- **RBAC:** server-side role checks exist on Administrator-only mutations and role-management paths. Creating and exercising Data Analyst + Regional Manager sessions live was blocked by missing Flask.

- **Write paths:** validated SQLite CRUD service implements create/update/delete for operational resources; `what-if` and CSV export paths are implemented. Live HTTP persistence/download verification was blocked by missing Flask.

- **Error paths:** structured errors exist for authentication, CSRF, invalid records/scenarios, unavailable models, internal errors, payload limits and API 404/405/413/500. Live request-level error testing was blocked by missing Flask.

- **Spark execution:** Java 21 is available, but PySpark is not installed; genuine Spark MLlib/Spark SQL/partitioned-Parquet execution therefore remains unverified in this environment. The independent Spark branches are implemented in source.

- **Scale/uptime:** 5M-row scalability and 99% uptime remain not measured; no fabricated benchmark or uptime claim was introduced. The master prompt explicitly says to leave these honest when they are not measured. fileciteturn0file0L276-L289

## Tests and evidence actually executed

- `pytest tests/python/test_generator.py tests/python/test_cleaning.py tests/python/test_processing.py tests/python/test_advanced_analytics.py -q` → **24 passed**.

- `python -m compileall -q src python_pipeline spark_jobs data_generator` → **pass**.

- `node --check static/js/*.js` → **all JS syntax checks pass**.

- Static UI audit → 23 views, 0 unlabelled interactive controls, 0 clickable div/span anti-patterns, 0 heading skips; both `[data-theme="dark"]` and `[data-theme="light"]` are present.

- Full `pytest tests -q` could not collect `tests/python/test_dashboard_api.py` because Flask is missing.

- Spark test suite was blocked by missing pyarrow/fastparquet for Parquet-backed fixtures; after the churn fixture was updated, the stale `recency_days` feature mismatch disappeared.

- Warm pandas fallback ensemble latency: high-value order max 69.841 ms; customer churn max 5.376 ms, both below the 5,000 ms SRS limit.
- Latest Python artifact versions after final regeneration: high-value order v12, customer churn v11, menu business class v4; all committed case predictions reproduced exactly (300/300, 200/200, 30/30).

## Deliverable state

The application tree remains in its existing `src/`, `templates/`, `static/`, `python_pipeline/`, `spark_jobs/`, `models/`, and `documentation/` structure. No replacement app or duplicate dashboard architecture was created. The master prompt requires this preservation and an updated single matrix. fileciteturn0file0L319-L332

