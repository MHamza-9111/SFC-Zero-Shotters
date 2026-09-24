# DineIQ Analytics — Test Suite & QA Specification

This document details the automated test suite architecture, test execution procedure, and coverage metrics for DineIQ Analytics.

---

## 1. Test Suite Organization

The test suite is organized into modular functional directories under `tests/`:

```text
tests/
├── python/                      # 24 Pytest cases for Python DS pipeline
│   ├── conftest.py              # Shared temporary session pipeline fixture
│   ├── test_generator.py        # Synthetic generator constraint tests
│   ├── test_cleaning.py         # Quarantine & FK integrity tests
│   ├── test_processing.py       # Completed-orders revenue rule tests
│   └── test_advanced_analytics.py # RFM, menu rules, forecast metrics tests
├── spark/                       # 14 Pytest cases for PySpark Big Data pipeline
│   └── test_spark_pipeline.py   # Schema DDL, Spark SQL, MLlib & latency tests
└── integration/                 # Integration tests for REST API endpoints
```

---

## 2. Test Execution & Pass Verification

To run the complete test suite:

```bash
python -m pytest tests -v
```

### Coverage Summary
- **Total Test Cases**: **38 / 38 Passing (100%)**
- **Execution Time**: ~35 seconds
- **Assertions**: Schema validation, zero foreign-key quarantine leaks, exact revenue accounting, NFR latency compliance.
