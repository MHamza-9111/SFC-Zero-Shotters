# Dual-Pipeline Comparison Sets (Python side)

Generated: 2026-09-26 00:07:41

These files are the Python-pipeline side of the SRS dual-pipeline
comparison. Hamza's Spark pipeline must independently re-derive the
predictions on the SAME unseen cases and the two sides are compared
record by record.

## 1. Order-value classification (PRIMARY task, 300 unseen orders)

- `order_value_unseen_cases.csv` - 300 held-out orders with the
  input features and the actual high-value label (top 10% of
  completed-order value, threshold computed on the training split
  only).
- `order_value_python_predictions.csv` - Python RandomForest
  predictions for those exact orders.
- `order_value_classification_report.csv` - Python-side holdout
  metrics for reference.

Comparison: build the same features in Spark from
`processed_data/`, train a Spark MLlib classifier on the
remaining orders, predict the 300 unseen orders, and report
matches, the disagreement list, and the agreement percentage.

## 2. Menu business-class classification

- `menu_class_unseen_cases.csv` - 200 held-out item/restaurant cells
  with the six input features and the actual class label.
- `menu_class_python_predictions.csv` - the Python pipeline's
  RandomForest predictions on those exact cells.

Comparison: for each row, compare `python_predicted_class` with the
Spark MLlib prediction. Report matches, disagreements (with the
disagreement rows), and the agreement percentage (target: document
the result, no fabricated agreement).

## 3. Churn risk classification (200 unseen customers)

- `churn_unseen_cases.csv` - 200 held-out customers (20% test split,
  stratified) with the input features and the actual churn label.
- `churn_python_predictions.csv` - Python logistic-regression
  predictions for those customers.

## 4. Daily demand forecast (last 90 days)

- `forecast_unseen_days.csv` - the chronologically held-out final
  90 days with actual sales, the Python model prediction, and the
  naive baseline prediction.

The Spark pipeline should produce its own forecast for these dates
and the report should compare MAE/RMSE/MAPE of both pipelines
against the actuals.

## Rules

- The Spark side must NOT read these prediction files as inputs.
- Both sides must use the same cleaned data layer
  (`processed_data/`).
- Disagreements must be listed, not hidden.
