# Execution guide

Run commands from the repository root in an activated virtual environment.

## Web application

```powershell
$env:DINEIQ_SECRET_KEY = "a-long-random-secret"
$env:DINEIQ_BOOTSTRAP_ADMIN_EMAIL = "admin@example.com"
$env:DINEIQ_BOOTSTRAP_ADMIN_PASSWORD = "a-unique-password-of-at-least-12-characters"
python src/backend/app.py
```

For hosted use, set persistent `DINEIQ_AUTH_DB` and `DINEIQ_DATA_DB` paths, set `DINEIQ_ENV=production`, terminate TLS at a reverse proxy, then run `waitress-serve --listen=127.0.0.1:5000 wsgi:app`.

## Data pipeline

The generation, cleaning, model training, analytics, and Spark-compatible processing stages are separate commands. Run only the stages needed for the intended dataset.

```powershell
# Generate raw sample data when a configured generator is available
python data_generator/generate_dineiq_data.py

# Rebuild the Python cleaned and analytical datasets
python python_pipeline/run_pipeline.py --skip-generation

# Select Spark when Java/PySpark are installed; auto uses the pandas fallback otherwise
python -m spark_jobs.run_all --engine auto
```

Use `python -m spark_jobs.run_all --help` and each Python pipeline module's `--help` for supported options. Pipeline output is written under `raw_data/`, `processed_data/`, `parquet_data/`, `models/`, and `reports/` according to the configured runner. Inspect the output metadata before describing the engine or metrics. The dashboard reads the current processed/evidence artifacts, while its operational CRUD area writes to a separate SQLite database.

## Existing automated checks

```powershell
python -m pytest tests -q
```

The validated test count and result for the current checkout are recorded in `TESTING.md`.
