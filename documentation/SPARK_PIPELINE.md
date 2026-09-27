# Spark-compatible processing pipeline

The Big Data pipeline lives in `spark_jobs/` and reads the canonical cleaned CSV layer from `processed_data/`. It has a PySpark/Spark SQL/MLlib code path and a pandas/pyarrow/scikit-learn fallback selected by `--engine auto` when no usable JVM is present.

## Run

```powershell
python -m spark_jobs.run_all --help
python -m spark_jobs.run_all --engine auto
```

To exercise the Spark engine, install Java 17 and the dependencies, then run `python -m spark_jobs.run_all --engine spark`. The root `setup_spark.sh` script contains a Linux environment and Spark smoke-test setup; inspect it before running because it can create a virtual environment and install system packages.

## Pipeline stages

1. `spark_jobs/ingest_validate.py` reads the 12 processed datasets, validates keys, relationships, numeric ranges and dates, writes a quality report, and writes partitioned Parquet under `parquet_data/`.
2. `spark_jobs/spark_sql.py` creates revenue, category, channel, peak, basket, promotion, location, and churn evidence.
3. `spark_jobs/mllib_models.py` trains and evaluates model tasks into versioned `models/<task>/v<n>/` artifacts.
4. `spark_jobs/dual_pipeline_compare.py` compares independent pipeline predictions against held-out cases in `python_pipeline/dual_pipeline/`.
5. `spark_jobs/ensemble_latency.py` times warm scoring for the configured order and churn batches and records the result.

Reports are written under `reports/spark_pipeline/` and `reports/`; the existing checked-in outputs also include `reports/spark_execution/`, `reports/dual_pipeline/`, `reports/model_evaluation/`, and `reports/latency/`.

## Checked-in evidence and limits

The current reports label the engine as `pandas` / `pandas+pyarrow fallback (no JVM available)`. They show 100% agreement on the recorded 300 order, 200 churn, and 30 menu cases, and a warm latency maximum below the 5,000 ms limit for the recorded batch. These are results for the checked-in model versions and generated dataset, not generalization guarantees. The Spark/MLlib path is present in code but the committed evidence does not show a Spark execution; it must be run on a compatible JVM host before the SRS Spark execution requirement is accepted.

Check engine labels and model metadata before citing reports. Avoid assuming the values in older reports or prior development logs apply to a newly trained model.
