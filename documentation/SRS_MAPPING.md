# DineIQ Analytics: SRS Requirements Mapping

This matrix traces all 66 functional and five non-functional requirements in
the supplied SRS. "Implemented" means executable code and repository evidence
exist. Capacity and uptime remain deployment measurements and are not claimed
as proven by a local checkout.

## Functional Requirements

| SRS | Requirement | Implementation evidence |
|---|---|---|
| i | Registration and authentication | PBKDF2-hashed signup/login, signed HTTP-only sessions, CSRF, account activation, and audit events in `src/api/routes.py`; `test_authentication.py`. |
| ii | Role-based access control | Restaurant Manager, Data Analyst, Regional Manager, and Administrator roles; server-side authorization and session refresh after role/status changes. |
| iii | Restaurant/location management | Administrator CRUD for restaurants and locations. |
| iv | Menu management | Category and menu-item CRUD, including price, cost, description, and availability. |
| v | Pricing history management | Pricing-history CRUD and pricing analysis. |
| vi | Customer data management | Anonymized customer CRUD and behavioral/risk analytics. |
| vii | Order management | Paginated orders, line detail, operational CRUD, and export. |
| viii | Promotion management | Promotion CRUD and effectiveness analysis. |
| ix | Rating management | Rating CRUD linked to items/locations and rating analysis. |
| x | Inventory management | Inventory CRUD, stock analytics, and recommendations. |
| xi | Wastage management | Wastage CRUD with item, quantity, cost, location, date, and reason. |
| xii | Big Data ingestion | Spark-compatible ingestion with documented pandas fallback. |
| xiii | Schema validation | Required-column, type, relationship, and boundary validation. |
| xiv | Data quality analysis | Missing, duplicate, invalid, inconsistent, and anomaly detection. |
| xv | Data cleaning | Documented cleaning rules and retained quarantine records. |
| xvi | Spark SQL processing | Spark SQL jobs and committed query evidence. |
| xvii | Data partitioning | Year/month-partitioned processing output. |
| xviii | Parquet storage | Processed orders stored in partitioned Parquet. |
| xix | Feature generation | Derived analytic and model features in processing jobs. |
| xx | Profitability analysis | Revenue, cost, margin, and profitability endpoints. |
| xxi | Menu performance classification | Menu business-class pipeline/model and analytics endpoint. |
| xxii | Peak-period detection | Peak-hour/day analytical outputs and dashboard. |
| xxiii | Customer segmentation | Customer analytics and segment outputs. |
| xxiv | RFM analysis | Recency, frequency, and monetary features. |
| xxv | Market-basket analysis | Basket pairs endpoint and processed output. |
| xxvi | Association-rule metrics | Support, confidence, and lift exposed with basket results. |
| xxvii | Bundle recommendations | Evidence-backed bundle recommendations. |
| xxviii | Demand forecasting | Forecast pipeline plus historical/forecast dashboard series. |
| xxix | Forecast evaluation | Forecast-evaluation artifact and model evidence. |
| xxx | Wastage analysis | Wastage trend, item, and risk analysis. |
| xxxi | Wastage prediction | Wastage-risk analytics identify high-risk items/periods. |
| xxxii | Price-sensitivity analysis | Pricing-history and price-sensitivity outputs. |
| xxxiii | Promotion effectiveness | Promotion revenue, profit, and behavior analysis. |
| xxxiv | Promotion-trap detection | Promotion results expose sales/profit trade-offs. |
| xxxv | Rating analysis | Rating-item and location performance analysis. |
| xxxvi | Rating anomaly detection | Rating anomalies included in quality/anomaly analysis. |
| xxxvii | Sales anomaly detection | Sales anomaly output and dashboard alerts. |
| xxxviii | Location comparison | Standardized location-performance endpoint. |
| xxxix | Location-specific menu intelligence | Menu intelligence retains restaurant/location dimensions. |
| xl | Ordering-channel analysis | Dine-in, takeaway, web/app, and delivery comparison. |
| xli | Customer churn-risk analysis | Versioned churn models and customer risk analytics. |
| xlii | Spark MLlib models | Three versioned Spark-compatible model artifacts. |
| xliii | Independent Python models | Separate scikit-learn model artifacts and training path. |
| xliv | Dual-pipeline prediction comparison | Ensemble responses compare independently produced results. |
| xlv | Model competency analysis | Agreement/disagreement evidence in dual-pipeline reports. |
| xlvi | Model evaluation | Classification and forecast evaluation artifacts. |
| xlvii | Recommendation engine | Evidence-backed recommendation endpoint. |
| xlviii | Menu optimization recommendations | Promotion, repricing, bundle, redesign, and removal guidance. |
| xlix | Inventory recommendations | Forecast and wastage evidence informs inventory guidance. |
| l | Customer targeting recommendations | Customer segments map to strategies. |
| li | What-if analysis | Server-side demand, pricing, promotion, and inventory scenarios. |
| lii | Executive dashboard | KPIs, trends, alerts, and location filters. |
| liii | Menu dashboard | Menu performance and intelligence view. |
| liv | Customer dashboard | Segments, churn risk, and behavior view. |
| lv | Wastage dashboard | Wastage item/risk view with required dimensions. |
| lvi | Forecast dashboard | Historical demand and forecast series. |
| lvii | Dual-pipeline dashboard | Model registry, status, comparison, and scorer workbench. |
| lviii | Search and filtering | Dashboard search plus location/date/page filters. |
| lix | Downloadable reports | Report catalog and CSV downloads. |
| lx | Data export | Authenticated CSV export with audit entry. |
| lxi | Database storage | SQLite stores accounts, audits, and operational data; analytics/results are versioned artifacts. |
| lxii | Model-version tracking | Prediction responses identify the model/ensemble version. |
| lxiii | Audit trail | Auth, data mutation, prediction, export, reload, role, and status events are logged. |
| lxiv | Error handling | Consistent API errors plus understandable UI request errors. |
| lxv | Spark job monitoring | Pipeline/model status endpoints and dashboard. |
| lxvi | Responsive web interface | Responsive Flask/Jinja UI with accessible controls and mobile navigation. |

## Non-Functional Requirements

| SRS | Requirement | Status and evidence |
|---|---|---|
| 1 | Predictions within five seconds | Implemented and locally measured with warm models; see `reports/latency/ensemble_latency_report.csv`. |
| 2 | Five-million order-line scalability | Partitioned Parquet and Spark architecture are implemented; a 5M benchmark still requires target-environment measurement. |
| 3 | Usability | Role-aware responsive UI, accessible controls, and clear error states are implemented; browser/device review remains a release check. |
| 4 | Accuracy | Evaluation artifacts and tests are present; thresholds must be revalidated when data or models change. |
| 5 | 99% availability | Requires production hosting, monitoring, backups, and uptime measurement; it cannot be certified locally. |

## Verification

`python -m pytest tests -q` completed successfully on 2026-09-28: **111 passed**.
See [API_CONTRACT.md](API_CONTRACT.md) for endpoints and
[LIMITATIONS.md](LIMITATIONS.md) for deployment constraints.
