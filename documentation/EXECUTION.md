# DineIQ Analytics — Master Execution & Command Guide

This guide details all CLI commands to run dataset generation, data cleaning, PySpark big data jobs, machine learning model training, dual-pipeline comparison, and automated tests.

---

## 1. Full Pipeline Quickstart

To run the complete data-to-insight pipeline end-to-end:

```bash
# 1. Generate full-scale synthetic dataset (1M+ order lines)
python data_generator/generate_dineiq_data.py

# 2. Run Python cleaning, integration, and restaurant intelligence
python python_pipeline/run_pipeline.py --skip-generation

# 3. Train Python ML model artifacts
python python_pipeline/model_artifacts.py

# 4. Run PySpark Big Data jobs, MLlib training, and Dual-Pipeline comparison
python -m spark_jobs.run_all --engine auto

# 5. Execute automated test suite
python -m pytest tests -v
```

---

## 2. Component Execution Commands

### 2.1 Synthetic Dataset Generator
Generates raw synthetic datasets under `raw_data/`:
```bash
python data_generator/generate_dineiq_data.py
```

### 2.2 Python Pipeline Steps
Run individual data science processing modules:
```bash
# Data quality assessment
python python_pipeline/cleaning/data_quality_check.py

# Data cleaning & quarantine
python python_pipeline/cleaning/clean_dineiq_data.py

# Data processing & integration
python python_pipeline/processing/process_dineiq_data.py

# Advanced analytics & ML intelligence layer
python python_pipeline/analytics/run_advanced_analytics.py
```

### 2.3 PySpark Big Data Pipeline
Run PySpark ingestion, transformations, Spark SQL queries, MLlib model training, and dual-pipeline comparison:
```bash
python -m spark_jobs.run_all --engine spark
```
*(If no JVM is detected, `--engine auto` automatically executes the pandas/pyarrow fallback).*

### 2.4 Rest API & Dashboard Web Application
Start Flask backend server:
```bash
python src/backend/app.py
```
Access dashboard at `http://localhost:5000` or API health check at `http://localhost:5000/api/v1/status`.

### 2.5 Test Suite
Run unit, integration, and performance latency tests:
```bash
python -m pytest tests -v
```
