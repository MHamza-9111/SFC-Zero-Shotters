# DineIQ Analytics — Machine Learning Model Documentation

This document specifies the training protocols, hyperparameter configurations, evaluation metrics, and model artifact versioning for both the PySpark MLlib and Python Scikit-Learn pipelines.

---

## 1. Machine Learning Tasks Overview

DineIQ Analytics implements machine learning models across three core operational tasks:

1. **High-Value Order Classification** (Primary Task): Predicts whether a completed order falls into the top 10% value tier.
2. **Customer Churn Risk Prediction**: Predicts whether a customer is at risk of churning based on RFM and engagement indicators.
3. **Menu Item Business Classification**: Classifies menu items into 4 business tiers (Profit Driver, Volume Driver, Hidden Opportunity, Low Performer).

---

## 2. Model Evaluation Metrics Summary

| Model Task | Framework / Algorithm | Accuracy | Macro-F1 | Precision | Recall | AUC-ROC | Artifact Version |
|---|---|---|---|---|---|---|---|
| **High-Value Order** | Pipeline RF, pandas fallback (150 trees) | 98.58% | 92.84% (F1) | — | — | 0.9975 | `models/high_value_order/v5` |
| **High-Value Order** | Python Scikit-Learn RF | 98.67% on 300 committed cases | — | — | — | — | `models/python/high_value_order/v6` |
| **Customer Churn** | Pipeline Logistic Regression, pandas fallback | 100.00% | 100.00% | — | — | 1.0000 | `models/customer_churn/v5` |
| **Customer Churn** | Python Scikit-Learn Logistic Regression | 100.00% on 200 committed cases | — | — | — | — | `models/python/customer_churn/v6` |
| **Menu Classification** | Pipeline RF, pandas fallback (150 trees) | 95.83% | 94.95% | — | — | N/A | `models/menu_business_class/v5` |
| **Menu Classification** | Python Scikit-Learn RF (150 trees) | 96.67% on 30 committed cases | 97.14% | — | — | N/A | `models/python/menu_business_class/v2` |

Pipeline evaluation metrics above come from the current training holdout metadata. Python comparison accuracy comes from the committed unseen-case report; menu macro-F1 is recorded in its Python artifact metadata. The churn label is a recency proxy, so its near-perfect score measures reproduction of that rule rather than real customer attrition. The pipeline engine on this machine is pandas because a JVM is unavailable.

---

## 3. Model Versioning & Artifact Storage

Model artifacts are serialized into versioned directories ahead of time to support warm-process serving:
- Pipeline-side artifacts: `models/<task_name>/v<version>/` (Spark on a JVM runtime, pandas fallback otherwise).
- Independent Scikit-Learn artifacts: `models/python/<task_name>/v<version>/`.
