# Installation and deployment setup

## Requirements

- Python 3.10 or later.
- Java 17 and a compatible PySpark runtime to select the Spark/MLlib execution path. The pandas fallback can run without Java.
- Persistent writable directories for authentication and operational SQLite databases in a hosted environment.
- A TLS terminating reverse proxy and service/process manager for public production hosting.

`requirements.txt` holds only what the web application imports at runtime (Flask, pandas, numpy, scikit-learn, joblib) — this is the file a deployment platform installs. `requirements-pipeline.txt` adds PySpark, pyarrow, Jupyter, matplotlib, Waitress and pytest for running the pipeline, notebooks and tests on a workstation. Use `requirements-pipeline.txt` for local setup.

## Install on Windows

From the repository root in PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-pipeline.txt
```

For the Spark path, install Java 17, check `java -version`, then run `python -m spark_jobs.run_all --engine spark`. Use `--engine auto` to select Spark when available and fall back when it is not.

## Install on Linux or macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-pipeline.txt
```

Install Java 17 separately if the Spark engine is required. Confirm PySpark can start in the chosen runtime before processing full-scale data.

## Start locally

Set the session secret and optional first Administrator credentials in the environment. Use a long random secret and a unique password; do not put either in source control.

```powershell
$env:DINEIQ_SECRET_KEY = "a-long-random-secret"
$env:DINEIQ_BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:DINEIQ_BOOTSTRAP_ADMIN_PASSWORD = "a-unique-password-of-at-least-12-characters"
python src/backend/app.py
```

The app listens on `127.0.0.1:5000` by default. The built-in Flask server is for local development. If bootstrap credentials are omitted, the bootstrap Administrator is not created; do not publish a service before provisioning an Administrator.

## Production process

Run Waitress behind a TLS reverse proxy. Provide these settings through the deployment platform:

| Setting | Purpose |
|---|---|
| `DINEIQ_ENV=production` | Enables secure session cookies by default. |
| `DINEIQ_SECRET_KEY` | Stable secret shared by all web workers that need to validate sessions. |
| `DINEIQ_AUTH_DB` | Persistent path to account and audit database. |
| `DINEIQ_DATA_DB` | Persistent path to operational records database. |
| `DINEIQ_BOOTSTRAP_ADMIN_EMAIL` and `DINEIQ_BOOTSTRAP_ADMIN_PASSWORD` | Optional first-Administrator bootstrap credentials. |
| `DINEIQ_COOKIE_SECURE` | Explicitly override secure cookie setting when required by the proxy setup. |

Example:

```powershell
waitress-serve --listen=127.0.0.1:5000 wsgi:app
```

Configure database backups, access controls, TLS, process supervision, logging, and health monitoring for the host. `GET /health` is a liveness endpoint; `GET /api/v1/status` checks the analytics/model evidence available to the app.

## Deploy to Vercel (serverless)

Vercel detects `wsgi.py` automatically and builds it as a Python function. `vercel.json` supplies the function memory, timeout and the `excludeFiles` list that keeps the bundle under the 500 MB limit.

**Enable Git LFS on the project first.** The trained `models/**/model.joblib` artifacts (~108 MB) are LFS objects. Without this setting Vercel checks out the tiny pointer text instead of the real bytes, the models fail to load, and the model pages report them as unavailable — the rest of the dashboard still works. In the Vercel project:

1. Open **Settings → General**.
2. Tick **Git LFS** (sometimes under *Repository* or *Build & Development Settings*).
3. Redeploy.

Then set the environment variables from the table above under **Settings → Environment Variables** (`DINEIQ_SECRET_KEY` is required; `DINEIQ_BOOTSTRAP_ADMIN_EMAIL` and `DINEIQ_BOOTSTRAP_ADMIN_PASSWORD` create the first Administrator).

Notes for this project:

- **Bundle size.** A Python function is capped at 500 MB uncompressed. The repository is much larger than the application, so `vercel.json` excludes the pipeline, notebooks, raw data, Parquet output and superseded model versions. Keep that list in sync when adding large files.
- **Only the newest model version per task is kept** (`models/<task>/vN` and `models/python/<task>/vN`). The service loads the highest version number, so older versions were ~850 MB of dead weight.
- **The order-line dataset is compressed.** `processed_data/analytics/order_items_integrated.csv.xz` holds all 997,205 rows in 13 MB; the service reads it with the standard-library `lzma` module. Parquet was rejected because `pyarrow` is ~150 MB installed, which costs more than it saves.
- **Filesystem is read-only except `/tmp`.** The app writes the session secret and the auth database under `BASE_DIR/runtime` by default. On a read-only filesystem set `DINEIQ_RUNTIME_DIR=/tmp` and `DINEIQ_AUTH_DB=/tmp/dineiq_auth.sqlite3`. Note that `/tmp` does not persist across invocations, so accounts and sessions reset; use a platform with a writable persistent volume (or a hosted database) for a durable deployment.
- **Cold starts are slow.** The first request loads ~1M rows and warms the models. Raise `maxDuration` in `vercel.json` if you see timeouts.
