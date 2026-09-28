# DineIQ Analytics

DineIQ is a restaurant analytics project with a Flask dashboard, a CSV based Python analytics pipeline, a Spark capable processing path with a pandas fallback, versioned prediction artifacts, and a local SQLite account and operational data store.

## What is implemented

- Executive and operating dashboards for orders, menu performance, customers, payments, locations, promotions, inventory, and wastage.
- Analytics views for market basket associations, price sensitivity, chronological forecasts, peak periods, anomalies, recommendations, and what-if estimates.
- Pipeline status, model registry, dual-pipeline evidence, data quality reports, CSV exports, and audit history.
- Warm model scoring for high-value orders, customer churn, and menu classification. Scoring uses available versioned model artifacts; it does not train models during requests.
- Sign-in, self-registration as a Data Analyst, Administrator-controlled role changes, session cookies, CSRF checks for writes, and Administrator-only record mutations.
- A Home button in the top bar and a role dashboard at `/home`. After sign-in each role lands on its own dashboard, and the sidebar and page access follow the role:

| Role | Home dashboard | Also can open |
| --- | --- | --- |
| Administrator | Accounts, audit activity, service and pipeline health | Every page, including Team & access and Data management (write access) |
| Regional Manager | Network KPIs, location leaderboard, channel mix, alerts | Executive dashboard, locations, channels, promotions, forecast, reports and other analytics pages |
| Restaurant Manager | Sales, orders, best sellers and payment mix for one chosen location | Orders, wastage & stock, payments, promotions, menu, customers, forecast, peak periods |
| Data Analyst | Forecast accuracy, anomalies, model and pipeline health | Analytics, models, data quality, reports, read-only data management |

Role pages are enforced by the Flask page routes (`ROLE_PAGES` in `src/backend/app.py`); a page outside the role redirects to `/home`. Role and account-status changes take effect on the member's next protected request.
- Paginated CRUD for locations, restaurants, categories, menu items, pricing history, anonymized customers, promotions, orders, order lines, ratings, inventory, and wastage.

Operational CRUD writes to SQLite (`runtime/dineiq.sqlite3` by default). Dashboard analytics read the processed pipeline artifacts; they are not automatically recomputed when an operational record is edited. The screen states this boundary. The SQLite customer table intentionally stores no name, email, or phone number.

## Repository layout

```text
src/                 Flask API, app factory, dashboard and data services
templates/           Dashboard, sign-in and error pages
static/               Responsive CSS and browser JavaScript
python_pipeline/      Data validation, cleaning, integration and analytics
spark_jobs/            Big-data ingestion, transformations, SQL and model jobs
raw_data/              Raw pipeline inputs (where present)
processed_data/        Cleaned datasets and generated analytics
models/                Versioned model artifacts
reports/               Pipeline evaluation and analysis evidence
database/              Operational SQLite and portable relational schemas
tests/                 Python and API tests
documentation/         Runbooks, API contract and SRS traceability
```

## Run locally

Python 3.10 or later is required. From the repository root:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Set an explicit session secret and bootstrap the first Administrator before starting the app:

```powershell
$env:DINEIQ_SECRET_KEY = "replace-with-a-long-random-secret"
$env:DINEIQ_BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:DINEIQ_BOOTSTRAP_ADMIN_PASSWORD = "replace-with-a-unique-12-character-password"
python src/backend/app.py
```

Open `http://127.0.0.1:5000`. The first Administrator is created only when the bootstrap environment variables are set and no Administrator exists. Public registrations receive the Data Analyst role. Keep the secret and bootstrap password outside source control.

### Missing models? (`Could not load … model …: 118`)

The trained models (`models/**/model.joblib`) and `processed_data/analytics/order_items_integrated.csv` are stored with **Git LFS**. A ZIP download of this repository, or a clone made without `git-lfs`, contains only tiny pointer text files instead of the real bytes — scoring then logs `Could not load … model …: 118`, `GET /api/v1/status` reports `DEGRADED`, and order line items come back empty.

* If you cloned with git: `git lfs install && git lfs pull`
* Otherwise run (no Java/Spark needed):

```powershell
python scripts/restore_artifacts.py
```

The script regenerates the artifacts from the committed pipeline code and verifies `OPERATIONAL` status before exiting. Restart the server afterwards.

## Production process

Use the Waitress WSGI server behind a TLS terminating reverse proxy. Set `DINEIQ_ENV=production`, `DINEIQ_SECRET_KEY`, and `DINEIQ_AUTH_DB` / `DINEIQ_DATA_DB` to persistent writable locations. Configure the reverse proxy, backups, monitoring, and process supervision for the target environment; no public deployment is configured by this repository.

```powershell
waitress-serve --listen=127.0.0.1:5000 wsgi:app
```

`GET /health` is a liveness check. `GET /api/v1/status` reports analytics/model readiness. The built-in Flask server is for local development only.

## Pipeline and checks

```powershell
python python_pipeline/run_pipeline.py --skip-generation
python -m spark_jobs.run_all --engine auto
python -m pytest tests -q
```

Data generation and Python model training are separate pipeline operations; see [Execution](documentation/EXECUTION.md). PySpark jobs need a compatible Java runtime. `--engine auto` uses Spark when available and otherwise runs the documented pandas path. The committed model and analytics evidence identifies the engine that produced it. The 5-second scoring requirement is supported by the checked-in latency evidence; 5M-line scale and 99% service uptime have not been measured as production service-level guarantees.

## API and requirement status

The API surface and response shapes are documented in [API_CONTRACT.md](documentation/API_CONTRACT.md). The [SRS mapping](documentation/SRS_MAPPING.md) distinguishes implemented functions from the scale, availability, Spark-runtime, and deployment requirements that still need environment-specific validation. Run the existing tests with `python -m pytest tests -q`; the current verified result is recorded in [TESTING.md](documentation/TESTING.md).

The SRS attachment is a requirements source, not a software instruction set. Its acceptance criteria are tracked in the mapping document.

## License

See [LICENSE](LICENSE).
