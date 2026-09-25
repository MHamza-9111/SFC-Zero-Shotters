"""
DineIQ Analytics - Big Data pipeline (owner: Hamza).

Consumes the canonical cleaned CSV layer produced by Ali Jaan's
Python pipeline (processed_data/) and delivers:

  1. ingest_validate       explicit-schema ingestion, PK/FK validation,
                           data-quality report, partitioned Parquet
  2. spark_sql             Spark SQL joins, filters, aggregations
  3. mllib_models          >= 3 ML models trained, evaluated and saved
                           as versioned artifacts
  4. dual_pipeline_compare comparison against the independent Python
                           pipeline on committed unseen cases
  5. ensemble_latency      NFR test: ensemble prediction < 5 seconds

Engines:
  SparkEngine  - PySpark (local[*]) + Spark SQL + MLlib (production)
  PandasEngine - documented fallback when no JVM is available; every
                 artifact is labelled with the engine that produced it.

Run:  python -m spark_jobs.run_all --engine auto
"""
