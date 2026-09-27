# Installation and deployment setup

## Requirements

- Python 3.10 or later.
- Java 17 and a compatible PySpark runtime to select the Spark/MLlib execution path. The pandas fallback can run without Java.
- Persistent writable directories for authentication and operational SQLite databases in a hosted environment.
- A TLS terminating reverse proxy and service/process manager for public production hosting.

## Install on Windows

From the repository root in PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

For the Spark path, install Java 17, check `java -version`, then run `python -m spark_jobs.run_all --engine spark`. Use `--engine auto` to select Spark when available and fall back when it is not.

## Install on Linux or macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
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

Configure database backups, access controls, TLS, process supervision, logging, and health monitoring for the host. `GET /health` is a liveness endpoint; `GET /api/v1/status` checks the analytics/model evidence available to the app. No hosted database or public deployment is configured by this repository.
