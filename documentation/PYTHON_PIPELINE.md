# Python data and analytics pipeline

The Python pipeline consumes raw CSVs from `raw_data/` and creates cleaned datasets in `processed_data/`, quarantine and run reports in `reports/`, and analytics under `processed_data/analytics/`. Raw input files remain separate from cleaned outputs.

## Run

```powershell
python python_pipeline/run_pipeline.py --help
python python_pipeline/run_pipeline.py --skip-generation
```

Omit `--skip-generation` to use the configured synthetic generator. The default scale in `config/data_generation_config.yaml` requests 100,000 orders, at least 1,000,000 order lines, 50,000 customers, 20 locations, 100,000 ratings, 50,000 wastage rows, and 12 months. Review the config before running a full generation because it writes to repository data directories.

## Stages

- `data_generator/generate_dineiq_data.py`: create relational raw records and controlled quality defects.
- `python_pipeline/cleaning/data_quality_check.py`: profile missing, duplicate, range, and consistency problems.
- `python_pipeline/cleaning/clean_dineiq_data.py`: standardize datasets, validate primary/foreign-key relations, and quarantine invalid records.
- `python_pipeline/processing/process_dineiq_data.py`: integrate datasets and calculate core metrics. Revenue analytics count completed orders only.
- `python_pipeline/analytics/run_advanced_analytics.py`: calculate RFM segments, menu classes, basket associations, peak periods, chronological forecasts and baseline metrics, wastage risk, price sensitivity, promotion results, anomalies, churn risk, recommendations, and what-if estimates.
- `python_pipeline/model_artifacts.py`: train and version the Python order-value, churn, and menu-class models under `models/python/`; reload each artifact and verify its committed comparison cases.

The independent comparison cases and Python predictions are in `python_pipeline/dual_pipeline/`. The model-serving API reads versioned artifacts and does not retrain on requests.

## Validation

Run the existing Python pipeline checks with `python -m pytest tests/python -q`. The suite runs a medium-sized pipeline fixture in a temporary directory. Checked-in full-scale output and model scores are synthetic-data evidence and need new evaluation on competition or production data.
