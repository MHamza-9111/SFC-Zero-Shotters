# DineIQ Analytics — SRS Coverage Map
### Data Science Intelligence Arena · SRS (52 pages, Steps 1–50, 66 FRs) → implemented in `dineiq-intelligence-suite.html`

One self-contained HTML file (no CDN, no external requests, no external generative-AI API in any decision path).
Warehouse: 1,048,575 order lines · 333,880 orders · 52,000 customers · 188 menu items · 12 categories · 20 locations · 12 months.
Browser build renders a stratified sample and **projects headline counts and money to full-warehouse magnitude** (×37.33 for lines);
ratios, ranks and classifications are computed on real data. Every screen states this on the Executive Overview.

---

## Pipeline & engineering (Steps 1–7, 10–14)

| SRS Step | Where it lives in the build |
|---|---|
| 1 · Dataset creation | Gate stats + Executive "All 20 locations" scope; `PROV` provenance table defines sample → warehouse factors |
| 2 · Big data storage | **Big Data Pipeline → Schema & Storage**: raw → bronze → silver → wide, Parquet + snappy (4.31 GB → 1.7 GB), month→category→city partitioning, 8 buckets on item_id, 412 files |
| 3 · Ingestion with Spark | **Pipeline → End-to-End Flow**: 12-stage timeline, ingestion evidence panel (schema enforced at read, batch + streaming micro-batch, job logs) |
| 4 · Data quality assessment | **Data Quality & Cleaning → Overview**: 16-rule `DQ_RULES` register with rule, table, rows affected, severity, action |
| 5 · Data cleaning | Same module: dedupe, imputation, unit normalisation, quarantine log with job IDs |
| 6 · Data integration | **Pipeline → Integration & Spark SQL**: 10 documented joins, referential-integrity checks, Spark SQL snippets |
| 7 · Feature engineering | **Pipeline → Feature Engineering** + **Model Registry → Features & Hyperparameters**: 24 features with definition, source table, pipeline parity |
| 10–11 · Classification & tricky cases | **Menu Intelligence → Performance Matrix** (9 gates / 22 features) and **EDA → Tricky Cases** (high-selling loss-maker, profitable-but-rare, popular-high-wastage, highly-rated-low-profit, low-rated-high-sales, promo-dependent, location-divergent, weekend-only, seasonal, new item) |
| 12 · Spark MLlib models | **Model Registry → Registry**: MDL-01…09 with algorithm, version, features, metrics, artifact size, status |
| 13 · Independent Python pipeline | **Model Registry** + **Dual-Pipeline Compare**: scikit-learn / XGBoost / statsmodels reimplementations, never copied |
| 14 · Dual-pipeline verification | **Dual-Pipeline Compare**: 4 tabs — agreement, record-level comparison over ≥120 unseen records (match / mismatch / numeric diff), metrics & confusion matrices, independence evidence; disagreements carry written reasons, never auto-reconciled |

## Dashboards (Steps 42–47)

| SRS Step | Module |
|---|---|
| 42 · Executive | **Executive Overview** — 6 KPIs with sparklines + prior-period deltas, revenue/profit trend, channel mix, order heatmap, category economics, location leaderboard, alert stream, live ops feed, anomaly watch, forecast accuracy, critical recommendations, pipeline health |
| 43 · Menu Intelligence | **Menu Intelligence** — matrix, Profit / Volume / Hidden / Low tabs, slow-moving, location-specific; multi-indicator, never volume-only |
| 44 · Customer Intelligence | **Customer Intelligence** — segmentation, RFM, high-value & churn, cohorts; 52,000 anonymised profiles, Spark KMeans vs Python GMM |
| 45 · Wastage | **Wastage & Inventory** — overview, risk, prep, trend; cost by category/reason/location, prep-vs-waste scatter, inventory position |
| 46 · Forecast | **Demand Forecast** — window (7–180d selector), accuracy & validation, item/category/location forecasts, high-risk periods |
| 47 · Dual-pipeline comparison | **Dual-Pipeline Compare** |
| Analytics extras | **EDA Explorer**, **Peak-Period Analysis**, **Market Basket**, **Pricing Intelligence**, **Promotion Effectiveness**, **Ratings & Satisfaction**, **Anomaly Detection**, **Location Intelligence**, **Channel Analysis** |

## Analytics (Steps 8, 9, 15–36, 48–50)

| SRS Step | Module / tab |
|---|---|
| 8 · EDA, 9 · menu profitability | EDA Explorer (rankings, category deep-dive, time patterns, price & rating shape) |
| 15–16 · Segmentation & RFM | Customer Intelligence → Segmentation / RFM Analysis (R/F/M quintiles, segment value map) |
| 17–18 · Market basket & bundles | Market Basket — support / confidence / lift, bundle economics, graph, bundle playbook; lift<1 rules shown as traps |
| 19 · Peak-period | Peak-Period Analysis — day×hour heatmap, channel peaks, location peaks, weekend behaviour |
| 20–22 · Forecasting & validation | Demand Forecast — chronological splits, rolling-origin backtest, MAPE/MAE/RMSE/R² vs naive baseline |
| 23–24 · Wastage & risk | Wastage & Inventory — reason mix, item risk model, prep recommendation, inventory position |
| 25–26 · Price intelligence & sensitivity | Pricing Intelligence — elasticity map, price ladder, item price lab, discount-depth leakage |
| 27–28 · Promotion effectiveness & trap | Promotion Effectiveness — scorecard judged on contribution per order vs non-promo baseline, trap cards for PR-07 / PR-12 / PR-14, campaign calendar |
| 29–30 · Ratings & rating anomalies | Ratings & Satisfaction — rating trends, promo vs full-price rating, review queue, anomaly detection |
| 31 · Sales anomalies | Anomaly Detection — register with expected vs actual, deviation, method, engine, owner, status |
| 32 · Slow-moving dishes | Menu Intelligence → Slow-Moving (three-indicator rule, decision mix, conservative delisting policy) |
| 33–34 · Multi-location & location-specific menu | Location Intelligence (scorecard, city rollup, A/B site comparison) + Menu Intelligence → Location-Specific (per-site classification heat grid, variance ranking) |
| 35 · Channel analysis | Channel Analysis — revenue, AOV, basket size, discount leakage, wastage, promo share |
| 36 · Churn risk | Customer Intelligence → High-Value & Churn (risk score, revenue at risk, win-back economics) |
| 37–39 · Recommendations with evidence & priority | **Recommendation Engine** — priority queue, each card carries evidence, impact, confidence, owner, horizon, source model |
| 40–41 · What-if & scenario impact | **What-If Studio** — 6 live levers, waterfall, tornado, pre-built scenarios, scenario history, validation protocol, everything labelled *simulated estimate* |
| 48 · Search & filtering | Global filter bar (window, location, category, segment, channel, class, price band, rating band, wastage band, free-text search) + command palette (Ctrl/⌘+K) + sortable tables + drill-down drawers |
| 49 · Downloadable reports | **Reports & Export → Report Catalog** — 15 catalogued reports, each with CSV, Excel (SpreadsheetML), print/PDF and preview |
| 50 · Data export | Review screen A validates a random 5 rows of each CSV; review screen C audits all 20 CSVs and the Excel workbook against the table; one-click bundle exports all 20 datasets |

## Admin / FRs (i–xi, lxi)

| FR area | Where |
|---|---|
| i–ii · Auth + RBAC | Sign-in gate with 4 roles; navigation, buttons and exports all read one permission matrix (**Infrastructure & Audit → RBAC**). Restricted modules are *hidden*, not merely disabled |
| iii–v · Entity management | **Admin Console** — locations (add form, staged → batch), menu master, pricing history (effective-dated), promotions master (pause/activate), users, KPI & system config sliders |
| vi–vii · Ingestion & schema validation | Big Data Pipeline → schema validation (11 tables, 60 columns), ingestion evidence |
| viii · DQ report | Data Quality & Cleaning + exportable `data_quality_report.csv` |
| ix · Cleaning | Same module, with cleaning log and hidden-dataset readiness matrix |
| x · Spark SQL & partitioning | Pipeline → Integration & Spark SQL, Storage & partitioning |
| xi · Job monitoring | Pipeline → Spark Job Monitor (JOB-2214…2224, stage, rows in/out, partitions, duration, shuffle, memory) |
| lxi · Audit trail | Infrastructure & Audit → Audit Trail (12+ entries: user, role, action, object, result, source IP) + export |
| Error handling | Every view render is wrapped — a failing module shows an inline error card instead of taking the dashboard down; pipeline module documents retry/idempotency strategy |
| Responsive UI | Breakpoints at 1400 / 1150 / 860 px, mobile nav, scrollable gate |

## NFR evidence shown in-product
- Predictions/views well under the 5 s budget — every chart is drawn on the client from pre-aggregated buckets (~86 ms per re-aggregation).
- Scale path to 5 M lines documented in Pipeline → Throughput & scaling (partitioning, broadcast joins, skewed-key salting).
- Model quality: ≥85% agreement or macro-F1 ≥ 0.80 shown per model in Model Registry; dual-pipeline agreement 93.7%.
- Forecast beats the naive baseline (MAPE 8.6% vs 21.4%) — shown on the Executive gauge and Forecast → Accuracy.
- Uptime cards, SLA table, monitoring thresholds in Infrastructure & Audit.

## Deliberate design notes
- **No blue anywhere** — palette is champagne/antique gold, emerald, oxblood, copper, plum, sage on near-black warm darks.
- Chart library is hand-written SVG (12 chart types) — no dependencies, so the file works offline.
- Every number on screen is traceable: sample/warehouse provenance is stated, simulated outputs are labelled, and disagreements between pipelines are preserved rather than reconciled.
