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
| **High-Value Order** | PySpark RandomForest (n=150) | 99.00% | 0.9708 | 0.9545 | 0.9882 | 0.9990 | `models/spark/high_value_order/v1` |
| **High-Value Order** | Python Scikit-Learn RF | 99.00% | 0.9708 | 0.9545 | 0.9882 | 0.9990 | `models/python/high_value_order/v1` |
| **Customer Churn** | PySpark Logistic Regression | 94.50% | 0.9061 | 0.8919 | 0.9208 | 0.9818 | `models/spark/customer_churn/v1` |
| **Customer Churn** | Python Logistic Regression | 94.50% | 0.9061 | 0.8919 | 0.9208 | 0.9818 | `models/python/customer_churn/v1` |
| **Menu Classification** | PySpark RandomForest (n=150) | 95.83% | 0.9495 | 0.9550 | 0.9583 | N/A | `models/spark/menu_business_class/v1` |

---

## 3. Model Versioning & Artifact Storage

Model artifacts are serialized into versioned directories ahead of time to support warm-process serving:
- PySpark Models: `models/spark/<task_name>/v<version>/`
- Scikit-Learn Models: `models/python/<task_name>/v<version>/`
