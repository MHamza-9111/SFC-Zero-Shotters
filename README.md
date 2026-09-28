# DineIQ Analytics

DineIQ is a restaurant analytics project with a Flask dashboard, a CSV-based Python analytics pipeline, a Spark-capable processing path with a pandas fallback, versioned prediction artifacts, and local SQLite account and operational data stores.

## What is implemented

- Executive and operating dashboards for orders, menu performance, customers, payments, locations, promotions, inventory, and wastage.
- Analytics views for market basket associations, price sensitivity, chronological forecasts, peak periods, anomalies, recommendations, and what-if estimates.
- Pipeline status, model registry, dual-pipeline evidence, data-quality reports, CSV exports, and audit history.
- Warm model scoring for high-value orders, customer churn, and menu classification. Scoring uses available versioned model artifacts; it does not train models during requests.
- Sign-in, self-registration as a Data Analyst, Administrator-controlled role changes, session cookies, CSRF checks for writes, and Administrator-only record mutations.
- A Home button in the top bar and a role dashboard at `/home`. After sign-in each role lands on its own dashboard, and sidebar/page access follows the role:

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
static/              Responsive CSS and browser JavaScript
data_generator/      Synthetic relational data generator
python_pipeline/     Data validation, cleaning, integration and analytics
spark_jobs/          Big-data ingestion, transformations, SQL and model jobs
raw_data/            Raw pipeline inputs
processed_data/      Cleaned datasets and generated analytics
parquet_data/        Parquet output from the Spark-compatible pipeline
models/              Versioned model artifacts
reports/              Pipeline evaluation and analysis evidence
database/             Operational SQLite and portable relational schemas
tests/                Python and API tests
documentation/        Runbooks, API contract and SRS traceability
config/              Data-generation configuration
scripts/              Utility scripts, including artifact restoration
```

## Requirements

- Python 3.10 or later.
- The web runtime dependencies in `requirements.txt`; `requirements-pipeline.txt` adds the pipeline, notebook and test extras on top.
- Java 17 and a compatible PySpark runtime only if the Spark/MLlib execution path is required.
- The pandas fallback does not require Java.
- For hosted production use: persistent writable database locations, a TLS-terminating reverse proxy, and process supervision.

## Install locally

### Windows PowerShell

From the repository root:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-pipeline.txt
```

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-pipeline.txt
```

For Spark execution, install Java 17 separately and confirm:

```bash
java -version
```

## Run the data pipeline

The project has two related processing paths:

1. **Python pipeline** — generation, quality assessment, cleaning/quarantine, integration/core analytics, advanced analytics, and Python model artifacts.
2. **Big Data pipeline** — ingestion/validation, SQL-style analytics, model training, dual-pipeline comparison, and warm ensemble latency evidence. It can use Spark/MLlib or a pandas/pyarrow/scikit-learn fallback.

### Recommended end-to-end run

Run these commands from the repository root with the virtual environment activated.

#### 1. Generate raw data

Use this when you want to regenerate the synthetic raw dataset from `config/data_generation_config.yaml`:

```powershell
python data_generator/generate_dineiq_data.py
```

The current configuration requests 50,000 customers, 20 restaurants/locations, 150 menu items, 100,000 orders, at least 1,000,000 order lines, 100,000 ratings, 50,000 wastage rows, and 12 months of data. Review the configuration before running a full generation because it writes to repository data directories.

#### 2. Run the Python cleaning and analytics pipeline

If raw data was generated in step 1:

```powershell
python python_pipeline/run_pipeline.py --skip-generation
```

Or run generation and all Python stages in one command:

```powershell
python python_pipeline/run_pipeline.py
```

The Python runner executes these stages in order:

1. Data generation (unless `--skip-generation` is used).
2. Raw data quality assessment.
3. Data cleaning and quarantine.
4. Integration and core analytics.
5. Advanced analytics and ML.

Typical outputs are written under `raw_data/`, `processed_data/`, `processed_data/analytics/`, `python_pipeline/dual_pipeline/`, `reports/`, and the Python model artifact directories.

#### 3. Run the Big Data / Spark-compatible pipeline

Recommended when you want the runner to select Spark when available and otherwise use the documented fallback:

```powershell
python -m spark_jobs.run_all --engine auto
```

Force the pandas fallback (no JVM required):

```powershell
python -m spark_jobs.run_all --engine pandas
```

Force Spark:

```powershell
python -m spark_jobs.run_all --engine spark
```

The Big Data runner executes these stages unless skipped:

1. Ingestion, schema validation, and Parquet generation.
2. Spark SQL / equivalent analytics.
3. Model training and evaluation.
4. Dual-pipeline comparison against independent Python predictions.
5. Warm ensemble latency benchmark.

Use `python -m spark_jobs.run_all --help` to see the available directories and `--skip` options.

**Important:** `--engine auto` selects Spark only when a usable PySpark/JVM environment is available. Otherwise it uses the pandas/pyarrow/scikit-learn fallback and records that engine in the generated evidence.

### Pipeline-only reruns

If the raw data already exists and you only need to rebuild the cleaned/analytics layer:

```powershell
python python_pipeline/run_pipeline.py --skip-generation
```

If the cleaned `processed_data/` layer already exists and you only need to rerun the Big Data path:

```powershell
python -m spark_jobs.run_all --engine auto
```

### Restore missing Git-LFS artifacts

The trained `*.joblib` model files are tracked with Git LFS. A ZIP download or a clone without fetched LFS objects can contain pointer files instead of the actual bytes.

Typical symptoms include:

- `Could not load ... model ...: 118` in application logs.
- `GET /api/v1/status` reports `DEGRADED`.
- Model pages report the models as unavailable.

If you cloned with Git LFS:

```powershell
git lfs install
git lfs pull
```

If you are working from a ZIP or otherwise cannot fetch LFS objects, use the repository's restoration script:

```powershell
python scripts/restore_artifacts.py
```

### Runtime datasets

Order line items ship as `processed_data/analytics/order_items_integrated.csv.xz` (13 MB for all 997,205 rows) rather than the 194 MB CSV, so the serverless bundle stays small. The service reads it through the standard-library `lzma` module — no extra dependency.

Rebuild it after the cleaned `processed_data/` layer changes:

```powershell
python python_pipeline/processing/process_dineiq_data.py
python scripts/build_runtime_artifacts.py
```

`scripts/**` is excluded from the deployment bundle, so these run on your machine and are committed.

The restoration script uses the repository's own processing/model code and a pandas fallback for the Big Data-side models, so Java/Spark is not required. It verifies the application status and expects `OPERATIONAL` before you restart the server.

## Verify the pipeline

Run the Python-focused checks:

```powershell
python -m pytest tests/python -q
```

Run the full test suite:

```powershell
python -m pytest tests -q
```

The current checkout's documented test results are recorded in `documentation/TESTING.md`.

For pipeline evidence, inspect:

```text
reports/
reports/spark_pipeline/
reports/dual_pipeline/
reports/latency/
reports/model_evaluation/
reports/spark_execution/
```

Check the generated metadata before describing the engine or metrics. Existing evidence is tied to particular generated data and model versions; it is not a generalization or production-SLO guarantee.

## Run the web application

Set an explicit session secret and, if desired, bootstrap the first Administrator before starting the app.

### Windows PowerShell

```powershell
$env:DINEIQ_SECRET_KEY = "replace-with-a-long-random-secret"
$env:DINEIQ_BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:DINEIQ_BOOTSTRAP_ADMIN_PASSWORD = "replace-with-a-unique-12-character-password"
python src/backend/app.py
```

### Linux / macOS

```bash
export DINEIQ_SECRET_KEY="replace-with-a-long-random-secret"
export DINEIQ_BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
export DINEIQ_BOOTSTRAP_ADMIN_PASSWORD="replace-with-a-unique-12-character-password"
python src/backend/app.py
```

Open `http://127.0.0.1:5000`.

The first Administrator is created only when the bootstrap environment variables are set and no Administrator exists. Public registrations receive the Data Analyst role. Keep secrets and bootstrap credentials outside source control.

### Health and readiness endpoints

- `GET /health` — liveness check.
- `GET /api/v1/status` — analytics/model readiness and pipeline status.

The built-in Flask server is for local development only.

## Production process

Use Waitress behind a TLS-terminating reverse proxy:

```powershell
waitress-serve --listen=127.0.0.1:5000 wsgi:app
```

For production, configure:

| Setting | Purpose |
| --- | --- |
| `DINEIQ_ENV=production` | Enables secure session cookies by default. |
| `DINEIQ_SECRET_KEY` | Stable session secret. |
| `DINEIQ_AUTH_DB` | Persistent path to the account/audit database. |
| `DINEIQ_DATA_DB` | Persistent path to the operational records database. |
| `DINEIQ_BOOTSTRAP_ADMIN_EMAIL` | Optional first-Administrator bootstrap email. |
| `DINEIQ_BOOTSTRAP_ADMIN_PASSWORD` | Optional first-Administrator bootstrap password. |
| `DINEIQ_COOKIE_SECURE` | Explicit cookie-security override when required by the proxy setup. |

Configure TLS, backups, access controls, logging, monitoring, and process supervision for the target host. No public deployment is configured by this repository.

## Pipeline and application boundary

Operational CRUD writes go to SQLite. Dashboard analytics read processed pipeline artifacts. Editing an operational record does **not** automatically rerun the analytics pipeline, and the UI states this boundary.

The model-serving API uses warm, versioned artifacts. Models are not trained during prediction requests.

## API and requirement status

The API surface and response shapes are documented in [API_CONTRACT.md](documentation/API_CONTRACT.md).

The [SRS mapping](documentation/SRS_MAPPING.md) distinguishes implemented functions from scale, availability, Spark-runtime, and deployment requirements that still need environment-specific validation.

The [Execution guide](documentation/EXECUTION.md), [Python pipeline guide](documentation/PYTHON_PIPELINE.md), [Spark pipeline guide](documentation/SPARK_PIPELINE.md), [Dual-pipeline evidence](documentation/DUAL_PIPELINE.md), and [Testing report](documentation/TESTING.md) provide deeper operational details.

The SRS attachment is a requirements source, not a software instruction set. Its acceptance criteria are tracked in the mapping document.

## License

See [LICENSE](LICENSE).
