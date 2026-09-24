# DineIQ Analytics / InsightBot
## Restaurant Data Science & Big Data Intelligence Platform

[![Build & Test Status](https://img.shields.io/badge/Test%20Suite-38%2F38%20PASSING-success.svg)](documentation/TESTING.md)
[![Dual Pipeline Agreement](https://img.shields.io/badge/Dual%20Pipeline-100%25%20Match%20(530%2F530)-blue.svg)](documentation/DUAL_PIPELINE.md)
[![NFR Latency](https://img.shields.io/badge/Ensemble%20Latency-90.3ms%20(%3C5s)-brightgreen.svg)](documentation/DUAL_PIPELINE.md)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**DineIQ Analytics** is an integrated, enterprise-scale Big Data and Data Science platform built according to the official competition Software Requirements Specification (SRS).

The system features large-scale synthetic data generation (1,000,000+ order lines), robust raw-to-processed data validation, distributed PySpark & Spark SQL analytical processing, PySpark MLlib & Python Scikit-Learn predictive modeling, independent dual-pipeline comparison, warm-process ensemble scoring (< 5s latency NFR), and interactive executive business intelligence dashboards.

---

## 1. Key Platform Features & SRS Alignment

1. **Big Data Synthetic Dataset Generation**: Realistic, relationship-consistent synthetic generation (1,000,000 order lines, 100,000 orders, 50,000 customers, 150 menu items, 20 locations, 12 months) with injected realistic quality issues (`data_generator/`).
2. **Data Quality & Quarantine Pipeline**: Automated null/duplicate checks, foreign-key integrity validation, and invalid record quarantine (`python_pipeline/cleaning/`).
3. **Distributed Big Data Processing**: PySpark schema ingestion, distributed transformations, and partitioned analytical Parquet storage (`spark_jobs/`).
4. **Spark SQL Analytical Engine**: 10 analytical SQL queries covering sales trends, channel metrics, location rankings, and peak periods (`spark_sql/`).
5. **Dual-Pipeline Architecture & 100% Agreement**: PySpark MLlib and Python Scikit-Learn models independently scored on **530 unseen held-out cases** achieving **100% agreement** (`spark_jobs/dual_pipeline_compare.py`).
6. **Warm-Process Ensemble Model Scoring (< 5s NFR)**: Real-time REST API endpoint scoring warm ensemble predictions in **90.3 ms** (55x under the 5,000 ms budget limit) (`src/services/`).
7. **Restaurant Intelligence Suite (16 Business Analytics)**: Menu business classification (SRS Step 10 rules: Profit Driver, Volume Driver, Hidden Opportunity, Low Performer), RFM customer segmentation, market basket lift analysis, wastage risk, price elasticity, and anomaly detection (`python_pipeline/analytics/`).
8. **Comprehensive Automated Testing**: 38/38 passing unit and integration tests covering generation, cleaning, Spark, ML models, and API endpoints (`tests/`).

---

## 2. Master Repository Architecture

The project is strictly organized by **software responsibilities and SRS modules**:

```text
DineIQ-Analytics/
│
├── README.md                          # Master Technical Documentation
├── AI_USAGE.md                        # Transparency Log for AI Tools
├── CONTRIBUTING.md                    # Git Commit Workflow & Team Matrix
├── requirements.txt                   # Unified Python Dependencies
├── LICENSE                            # MIT License
├── .gitignore                         # Data/Model artifact exclusions
│
├── src/                               # Application Core (UI Integration Ready)
│   ├── backend/                       # Flask Web Backend & Controllers
│   │   ├── app.py                     # Main Flask Application Entry Point
│   │   └── controllers/               # Route Controllers
│   ├── api/                           # REST API Endpoint Implementation
│   │   └── routes.py                  # Analytical & Warm Ensemble Endpoints
│   └── services/                      # Core Business & Scoring Services
│       └── scoring_service.py         # Warm-Process Spark/Python Ensemble Scorer
│
├── templates/                         # HTML UI Templates (Farooq/Zain)
│   └── index.html                     # Executive Dashboard Frame
│
├── static/                            # Web Assets (Farooq/Zain)
│   ├── css/                           # Styling Sheets
│   ├── js/                            # Dashboard Interactive Scripts
│   └── images/                        # Static Visual Assets
│
├── data_generator/                    # 1M Scale Synthetic Data Generator (Ali Jaan)
│   ├── generate_dineiq_data.py        # Relational Data Generator
│   ├── schemas.py                     # Data Schemas & Configurations
│   └── README.md                      # Execution Specs
│
├── raw_data/                          # Local Raw Dataset Layer (.gitignored)
├── processed_data/                    # Transformed Cleaned Dataset Layer (.gitignored)
├── parquet_data/                      # Partitioned Analytical Parquet Store (.gitignored)
│
├── spark_jobs/                        # Distributed PySpark Big Data Pipeline (Hamza)
│   ├── schemas.py                     # StructType Schemas & DDL Specs
│   ├── ingest_validate.py             # Schema & PK/FK Ingestion Validation
│   ├── cleaning.py                    # Distributed Data Standardizer
│   ├── transformations.py            # Analytical Joins & Aggregations
│   ├── features.py                    # MLlib Feature Vectorization
│   ├── mllib_models.py                # 3 MLlib Models (Order Value, Churn, Menu)
│   ├── dual_pipeline_compare.py       # Spark Side Comparison Engine
│   ├── engines.py                     # PySpark/Pandas Fallback Abstraction
│   ├── ensemble_latency.py            # <5s Latency NFR Performance Test
│   └── run_all.py                     # Master Spark Pipeline Runner
│
├── spark_sql/                         # Spark SQL Engine & Query Library (Hamza)
│   ├── queries/                       # Standardized SQL Files
│   └── spark_sql.py                   # PySpark SQL Execution Module
│
├── python_pipeline/                   # Data Science & Python Pipeline (Ali Jaan)
│   ├── cleaning/                      # Data Quality & Quarantine Module
│   ├── processing/                    # Integration & Business Rules
│   ├── analytics/                     # Restaurant Intelligence Modules
│   ├── dual_pipeline/                 # Python Side Comparison & 530 Unseen Cases
│   └── model_artifacts.py             # Scikit-Learn Model Serialization
│
├── notebooks/                         # Analysis & Exploration Notebooks
│   ├── 01_data_generation.ipynb
│   ├── 02_data_quality_check.ipynb
│   ├── 03_cleaning_and_quarantine.ipynb
│   ├── 04_processing_and_integration.ipynb
│   ├── 05_advanced_analytics_and_ml.ipynb
│   └── README.md
│
├── models/                            # Versioned Model Artifact Repositories
│   ├── spark/                         # PySpark Saved Model Artifacts
│   └── python/                        # Joblib Python Saved Model Artifacts
│
├── database/                          # Relational Database Schema & DDL
│   ├── schema.sql                     # Full DDL Schema for Relational Integration
│   └── README.md
│
├── sample_data/                        # Lightweight Sample Datasets
│   ├── raw/
│   ├── cleaned/
│   └── testing/                       # Unseen Dual-Pipeline Benchmark Batch
│
├── tests/                             # Unified Automated Test Suite
│   ├── spark/                         # 14 PySpark Pipeline Tests
│   ├── python/                        # 24 Python Pipeline Tests
│   └── integration/                   # REST API Integration Tests
│
├── documentation/                     # Technical Documentation Suite (Eshmaal)
│   ├── SRS_MAPPING.md                 # Complete Traceability Matrix
│   ├── DATA_DICTIONARY.md             # Field Definitions & FK Dependencies
│   ├── DATABASE_SCHEMA.md             # Entity Relationship Specifications
│   ├── API_CONTRACT.md                # REST API Specifications
│   ├── SPARK_PIPELINE.md              # Distributed Processing Architecture
│   ├── PYTHON_PIPELINE.md             # DS Processing Architecture
│   ├── INSTALLATION.md                # Setup & Environment Guide
│   ├── EXECUTION.md                   # CLI Execution Guide
│   ├── HIDDEN_DATA_READINESS.md       # Robustness Verification
│   ├── MODEL_DOCUMENTATION.md         # ML Training Specs & Metrics
│   ├── DUAL_PIPELINE.md               # 100% Agreement & Latency Verification
│   ├── TESTING.md                     # Test Coverage Report
│   ├── ASSUMPTIONS.md                 # Business Rules & Decisions
│   ├── LIMITATIONS.md                 # System Constraints & Scope
│   └── DEVELOPMENT_LOG.md             # Engineering Decision Log
│
├── reports/                           # Analytical Reports & Committed Evidence
│   ├── intelligence/                  # Business Summary Reports
│   ├── dual_pipeline/                 # Dual Pipeline Agreement CSV Logs
│   ├── model_evaluation/              # Accuracy & Metric Summaries
│   ├── data_quality/                  # Ingestion Quality Reports
│   ├── spark_execution/               # Spark SQL Query Output CSVs
│   └── charts/                        # 20 High-Res Visualizations (PNG)
│
├── screenshots/                       # Application & Dashboard Screenshots
│   └── README.md
│
└── config/                            # Pipeline & Data Generator Config
    └── data_generation_config.yaml
```

---

## 3. Team Responsibilities & Ownership Matrix

Code in this master repository is organized strictly by **functionality**. Team member contributions and ownership are represented below and in `CONTRIBUTING.md`:

| Team Member | Verified Name | Identified GitHub Handle | Role & Module Responsibilities |
|---|---|---|---|
| **Mohammad Hamza Mughal** | Mohammad Hamza Mughal | `@MHamza-9111` | **Project Lead & Big Data Lead**: Overall Architecture, PySpark Pipeline (`spark_jobs/`), Spark SQL (`spark_sql/`), MLlib Models, Dual Pipeline Integration, Backend API (`src/`) |
| **Ali Jaan Shaikh** | Ali Jaan Shaikh | `Ali Jaan` | **Data Science Lead**: Synthetic Data Generator (`data_generator/`), Quality & Quarantine (`python_pipeline/cleaning/`), Advanced Analytics (`python_pipeline/analytics/`), Python Model Artifacts |
| **Eshmaal** | Eshmaal | `Eshmaal` | **Documentation & QA Lead**: SRS Traceability Matrix (`documentation/SRS_MAPPING.md`), Compliance Verification, Technical Documentation Suite, Evidence Auditing |
| **Farooq** | Farooq | `Farooq` | **Frontend & UI Developer**: HTML/Flask Templates (`templates/`), Web Assets (`static/`), Dashboard Frame Layouts |
| **Zain** | Zain / mzain | `mzain` | **Dashboard & UI Integration Lead**: UI Component Integration, Dashboard API Client Wiring, Interactive Chart Visualizations |

---

## 4. Dual-Pipeline Comparison & Latency Performance Evidence

### 4.1 Unseen Case Agreement Metrics
PySpark and Python pipelines independently evaluated **530 unseen test records**:

- **High-Value Order Classification** (300 Unseen Orders): **100.0% Agreement** (300/300 match)
- **Customer Churn Risk Prediction** (200 Unseen Customers): **100.0% Agreement** (200/200 match)
- **Menu Business Classification** (30 Unseen Menu Items): **100.0% Agreement** (30/30 match)

### 4.2 NFR Performance Benchmark
- **Measured Warm Ensemble Latency**: **90.3 ms**
- **SRS Requirement Limit**: **5,000.0 ms**
- **Status**: **PASS (55x faster than required budget)**

---

## 5. Quickstart & Execution Guide

### 5.1 Environment Setup
```bash
python -m venv .venv
# On Windows: .venv\Scripts\activate | On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

### 5.2 Full Pipeline Execution
```bash
# 1. Generate 1M Scale Raw Synthetic Dataset
python data_generator/generate_dineiq_data.py

# 2. Run Python Data Science & Intelligence Pipeline
python python_pipeline/run_pipeline.py --skip-generation

# 3. Train Python ML Model Artifacts
python python_pipeline/model_artifacts.py

# 4. Run PySpark Pipeline, MLlib Training & Dual Pipeline Comparison
python -m spark_jobs.run_all --engine auto

# 5. Execute Complete Test Suite
python -m pytest tests -v
```

### 5.3 Web Server & REST API
```bash
python src/backend/app.py
```
Open `http://localhost:5000` to view the executive dashboard or access `/api/v1/status` for API health metrics.

---

## 6. Technical Documentation & Reports

Detailed technical documentation is available under `documentation/`:
- [SRS Traceability Matrix](documentation/SRS_MAPPING.md)
- [Database Schema Specification](documentation/DATABASE_SCHEMA.md)
- [PySpark Pipeline Architecture](documentation/SPARK_PIPELINE.md)
- [Python DS Pipeline Architecture](documentation/PYTHON_PIPELINE.md)
- [REST API Contract](documentation/API_CONTRACT.md)
- [Dual Pipeline & Latency Metrics](documentation/DUAL_PIPELINE.md)
- [Model Documentation & Metrics](documentation/MODEL_DOCUMENTATION.md)
- [Installation & Execution Guides](documentation/INSTALLATION.md)

---

## 7. License

This repository is licensed under the [MIT License](LICENSE).
