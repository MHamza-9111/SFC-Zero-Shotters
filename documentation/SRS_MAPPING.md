# DineIQ Analytics — SRS Requirements Traceability Matrix

This document maps every requirement from the official Software Requirements Specification (SRS) to its corresponding implementation location, evidence file, and primary owner within the DineIQ Master Repository.

---

## SRS Traceability Matrix

| SRS Requirement ID | Requirement Description | Repository Location | Status | Primary Evidence / Artifact | Module Owner |
|---|---|---|---|---|---|
| **SRS-01** | Source Code Organization | `src/`, `spark_jobs/`, `python_pipeline/` | **Complete** | Modular functional code tree | Team |
| **SRS-02** | Big Data Synthetic Dataset (1M+ lines) | `data_generator/generate_dineiq_data.py` | **Complete** | Configured scale (1M order lines) | Ali Jaan Shaikh |
| **SRS-03** | Data Ingestion & Quality Validation | `spark_jobs/ingest_validate.py`, `python_pipeline/cleaning/` | **Complete** | `reports/data_quality/` | Hamza / Ali Jaan |
| **SRS-04** | Distributed Data Transformations & Parquet | `spark_jobs/transformations.py`, `parquet_data/` | **Complete** | Partitioned Parquet files | Hamza Mughal |
| **SRS-05** | Spark SQL Analytical Processing | `spark_jobs/spark_sql.py`, `spark_sql/` | **Complete** | `reports/spark_execution/*.csv` | Hamza Mughal |
| **SRS-06** | Spark MLlib Predictive Models | `spark_jobs/mllib_models.py`, `models/spark/` | **Complete** | `reports/model_evaluation/` | Hamza Mughal |
| **SRS-07** | Python Data Science Pipeline | `python_pipeline/analytics/run_advanced_analytics.py` | **Complete** | `processed_data/analytics/*.csv` | Ali Jaan Shaikh |
| **SRS-08** | Dual Pipeline Comparison (100+ unseen cases) | `spark_jobs/dual_pipeline_compare.py` | **Complete** | `reports/dual_pipeline/` (100% match) | Hamza / Ali Jaan |
| **SRS-09** | Restaurant Intelligence (16 Insights) | `python_pipeline/analytics/`, `reports/charts/` | **Complete** | 20 High-Res PNG Visualizations | Ali Jaan / Hamza |
| **SRS-10** | Menu Business Classification Rules | `python_pipeline/analytics/`, `spark_jobs/features.py` | **Complete** | Profit Driver, Volume Driver, etc. | Ali Jaan / Hamza |
| **SRS-11** | NFR Performance Test (< 5s Ensemble Latency) | `spark_jobs/ensemble_latency.py`, `src/services/` | **Complete** | 90.3 ms measured latency (PASS) | Hamza Mughal |
| **SRS-12** | Test Suite Coverage (Unit & Integration) | `tests/spark/`, `tests/python/` | **Complete** | 38/38 passing pytest cases | Team |
| **SRS-13** | Web Application & REST API Contract | `src/backend/`, `src/api/`, `templates/` | **In Progress / Ready** | `documentation/API_CONTRACT.md` | Farooq / Zain |
| **SRS-14** | Complete Technical Documentation Suite | `documentation/*.md` | **Complete** | 15 Markdown Specification Docs | Eshmaal / Team |

---

## Implementation Status Summary

- **Complete**: Requirements fully implemented, validated with empirical run evidence, and backed by automated unit tests.
- **In Progress / Ready**: Backend structure and REST endpoints established according to API contract, UI templates integrated, ready for frontend visual component binding.
