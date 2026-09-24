# DineIQ Analytics — Dual Pipeline Comparison & Latency Report

This document reports the empirical validation results comparing the independent PySpark Big Data pipeline against the Python Data Science pipeline, as well as NFR performance latency benchmarks.

---

## 1. Dual Pipeline Agreement Metrics

Per SRS Section 6 requirements, both pipelines independently scored **530 unseen held-out records**:

| Task Area | Unseen Test Cases | Spark Prediction Match | Python Prediction Match | Agreement Percentage | Disagreement Explanation |
|---|---|---|---|---|---|
| **High-Value Order** | 300 Orders | 300 / 300 | 300 / 300 | **100.0%** | None (100% exact match) |
| **Customer Churn Risk** | 200 Customers | 200 / 200 | 200 / 200 | **100.0%** | None (100% exact match) |
| **Menu Classification** | 30 Items | 30 / 30 | 30 / 30 | **100.0%** | None (100% exact match) |
| **Total Evaluation** | **530 Cases** | **530 / 530** | **530 / 530** | **100.0%** | **Perfect Pipeline Alignment** |

Full per-case agreement logs are committed under:
- `reports/dual_pipeline/order_value_comparison.csv`
- `reports/dual_pipeline/churn_comparison.csv`
- `reports/dual_pipeline/menu_class_comparison.csv`

---

## 2. NFR #1 Ensemble Latency Performance Benchmark

Per instructor clarification (`Main/SRS_CLARIFICATIONS.md`), the application must load versioned models into a warm process and generate ensemble predictions for uploaded records **within 5 seconds (< 5000 ms)**.

### Latency Measurement Results (100-Record Batch)
- **Measured Latency**: **90.3 ms**
- **SRS NFR Limit**: **5,000.0 ms**
- **Margin**: **4,909.7 ms under budget (55x faster than limit)**
- **Status**: **PASS**

Committed benchmark evidence: `reports/spark_execution/ensemble_latency_report.csv`.
