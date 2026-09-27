# Hidden and production dataset readiness

## Current protections

- Generator, Python cleaning, processing, Spark-compatible ingestion and scoring use data frames and observed keys rather than assuming a particular primary-key sequence.
- Cleaning and Spark ingestion produce quality reports and quarantine invalid inputs. Relationship checks cover core foreign keys and selected restaurant/item consistency rules.
- Scoring validates task names, feature names, finite numeric values, and task-specific batch limits before invoking cached model artifacts.
- Dashboard APIs filter and paginate supported list views; database CRUD fields and SQL resources are allowlisted.

## Required validation before competition or production data

- Validate every hidden dataset's actual headers, types, enumerations, null semantics, units, time zone, and financial accounting rules against `spark_jobs/schemas.py` and `python_pipeline/` transformations. Unexpected or missing columns are not universally normalized by every stage.
- Confirm table and feature relationships, promotion definitions, customer anonymization requirements, and the training/evaluation label definitions. Pipeline schema success alone does not validate business semantics.
- Run the pipeline on the full 5M order-line target and record time, peak memory, disk use, quality failures, and output counts. The current evidence does not establish that scale.
- Execute the Spark/MLlib path on a compatible Java/Spark host and check its generated engine labels and artifacts.
- Re-evaluate classifier quality and forecast-vs-baseline results on the hidden or actual target data. Agreement on fixed unseen cases can be high because the pipelines share features and training rules.
- Load-test the deployed WSGI server and database, then measure uptime and response latency under the target concurrency and infrastructure configuration.

## Current evidence boundary

The repository includes 1M-line synthetic dataset configuration and recorded pandas-engine evidence. That is not equivalent to a hidden-data test, an executed Spark job, a 5M-line benchmark, or a 99% uptime measurement. Preserve new reports with their dataset identity, code revision, engine, and run settings.
