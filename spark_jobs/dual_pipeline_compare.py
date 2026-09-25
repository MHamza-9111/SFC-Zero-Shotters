"""
Step 4 - Dual-pipeline comparison (SRS: independent pipelines compared
on unseen cases).

Inputs (committed, produced by Ali's independent Python pipeline):
  data_cleaning/dual_pipeline/
    order_value_unseen_cases.csv        300 orders + 13 features + actual
    order_value_python_predictions.csv  Python RF predictions
    churn_unseen_cases.csv              200 customers + features + actual
    churn_python_predictions.csv        Python LR predictions + probability
    menu_class_unseen_cases.csv         30 menu cells + features + actual
    menu_class_python_predictions.csv   Python RF predictions

This step loads the LATEST versioned model trained by step 3
(models, never retraining) and scores the same cases. For every
case it records: ID, actual, Python output, pipeline output, match
flag and - for disagreements - a short explanation.

Outputs (committed evidence under reports/dual_pipeline/):
  <task>_comparison.csv   per-case side-by-side
  <task>_agreement.csv    agreement statistics
  dual_pipeline_summary.csv
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from .mllib_models import (CHURN_FEATURES, MENU_FEATURES, ORDER_FEATURES,
                           load_latest_model)


def _explain_order(case, py, sp, proba):
    if py == sp:
        return ""
    near = proba if sp else 1 - proba
    if abs(near - 0.5) < 0.2:
        where = "borderline probability"
    elif case["total_amount"] > case["total_spend"] / max(case["total_orders"], 1) * 1.8:
        where = "order is far above this customer's typical AOV"
    else:
        where = "feature values near the class boundary"
    return f"disagree: python={int(py)} pipeline={int(sp)} " \
           f"(pipeline prob={proba:.3f}, {where})"


def _explain_churn(case, py, sp, proba, py_proba):
    if py == sp:
        return ""
    d = abs(proba - py_proba)
    if d < 0.15:
        where = f"probabilities close ({proba:.2f} vs {py_proba:.2f})"
    else:
        where = (f"probability gap {d:.2f} (pipeline={proba:.2f}, "
                 f"python={py_proba:.2f})")
    return f"disagree: python={int(py)} pipeline={int(sp)} ({where})"


def compare_order_value(models_dir: Path, cases_dir: Path, out_dir: Path):
    cases = pd.read_csv(cases_dir / "order_value_unseen_cases.csv")
    py = pd.read_csv(cases_dir / "order_value_python_predictions.csv")
    df = cases.merge(py, on="order_id", how="left", suffixes=("", "_py"))
    df = df.drop(columns=[c for c in df.columns if c.endswith("_py")])
    model, meta = load_latest_model(models_dir, "high_value_order")

    X = df[ORDER_FEATURES].astype(float)
    df["pipeline_predicted_high_value"] = model.predict(X).astype(int)
    df["pipeline_probability"] = model.predict_proba(X)[:, 1]
    df["match"] = (df["python_predicted_high_value"].astype(int)
                   == df["pipeline_predicted_high_value"].astype(int))
    df["explanation"] = [
        _explain_order(c, c["python_predicted_high_value"],
                       c["pipeline_predicted_high_value"],
                       c["pipeline_probability"])
        for _, c in df.iterrows()
    ]

    n = len(df)
    matches = int(df["match"].sum())
    agg = pd.DataFrame([
        {"task": "high_value_order", "cases": n,
         "matching_cases": matches,
         "disagreeing_cases": n - matches,
         "agreement_percentage": round(100.0 * matches / n, 2),
         "python_accuracy": round(
             float((df["python_predicted_high_value"].astype(int)
                   == df["actual_high_value"].astype(int)).mean()), 4),
         "pipeline_accuracy": round(
             float((df["pipeline_predicted_high_value"].astype(int)
                   == df["actual_high_value"].astype(int)).mean()), 4),
         "actual_positive_rate": round(float(df["actual_high_value"].mean()), 4),
         "model_version": meta["version"],
         "engine": meta["engine"]["engine"],
     }])
    return df, agg, meta


def compare_churn(models_dir: Path, cases_dir: Path, out_dir: Path):
    cases = pd.read_csv(cases_dir / "churn_unseen_cases.csv")
    py = pd.read_csv(cases_dir / "churn_python_predictions.csv")
    df = cases.merge(py, on="customer_id", how="left", suffixes=("", "_py"))
    df = df.drop(columns=[c for c in df.columns if c.endswith("_py")])
    model, meta = load_latest_model(models_dir, "customer_churn")

    # The case file carries the raw customer aggregates; the log
    # features are derived exactly as in the training frame.
    X = pd.DataFrame({
        "recency_days": df["recency_days"].astype(float),
        "f_log_orders": np.log1p(df["total_orders"].astype(float)),
        "f_log_spend": np.log1p(df["total_spend"].astype(float)),
        "average_order_value": df["average_order_value"].astype(float),
        "discount_dependency": df["discount_dependency"].astype(float),
        "promo_dependency": df["promo_dependency"].astype(float),
        "top_category_share": df["top_category_share"].astype(float),
        "unique_categories": df["unique_categories"].astype(float),
    }).fillna(0)
    df["pipeline_predicted_churn"] = model.predict(X).astype(int)
    df["pipeline_probability"] = model.predict_proba(X)[:, 1]
    df["match"] = (df["python_predicted_churn"].astype(int)
                   == df["pipeline_predicted_churn"].astype(int))
    df["explanation"] = [
        _explain_churn(c, c["python_predicted_churn"],
                       c["pipeline_predicted_churn"], c["pipeline_probability"],
                       c["python_churn_probability"])
        for _, c in df.iterrows()
    ]

    n = len(df)
    matches = int(df["match"].sum())
    agg = pd.DataFrame([
        {"task": "customer_churn", "cases": n,
         "matching_cases": matches,
         "disagreeing_cases": n - matches,
         "agreement_percentage": round(100.0 * matches / n, 2),
         "python_accuracy": round(
             float((df["python_predicted_churn"].astype(int)
                   == df["actual_churn"].astype(int)).mean()), 4),
         "pipeline_accuracy": round(
             float((df["pipeline_predicted_churn"].astype(int)
                   == df["actual_churn"].astype(int)).mean()), 4),
         "actual_positive_rate": round(float(df["actual_churn"].mean()), 4),
         "mean_abs_probability_gap": round(
             float((df["pipeline_probability"]
                   - df["python_churn_probability"]).abs().mean()), 4),
         "model_version": meta["version"],
         "engine": meta["engine"]["engine"],
     }])
    return df, agg, meta


def compare_menu(models_dir: Path, cases_dir: Path, out_dir: Path):
    cases = pd.read_csv(cases_dir / "menu_class_unseen_cases.csv")
    py = pd.read_csv(cases_dir / "menu_class_python_predictions.csv")
    df = cases.merge(py, on=["menu_item_id", "restaurant_id"],
                     how="left", suffixes=("", "_py"))
    df = df.drop(columns=[c for c in df.columns if c.endswith("_py")])
    model, meta = load_latest_model(models_dir, "menu_business_class")

    X = df[MENU_FEATURES].astype(float)
    df["pipeline_predicted_class"] = model.predict(X)
    df["match"] = df["python_predicted_class"] == df["pipeline_predicted_class"]
    df["explanation"] = [
        "" if m else (f"disagree: python={pc} pipeline={sc} "
                      f"(actual={ac})")
        for m, pc, sc, ac in zip(df["match"], df["python_predicted_class"],
                                 df["pipeline_predicted_class"],
                                 df["actual_class"])
    ]

    n = len(df)
    matches = int(df["match"].sum())
    agg = pd.DataFrame([
        {"task": "menu_business_class", "cases": n,
         "matching_cases": matches,
         "disagreeing_cases": n - matches,
         "agreement_percentage": round(100.0 * matches / n, 2),
         "python_accuracy": round(
             float((df["python_predicted_class"]
                   == df["actual_class"]).mean()), 4),
         "pipeline_accuracy": round(
             float((df["pipeline_predicted_class"]
                   == df["actual_class"]).mean()), 4),
         "actual_class_distribution":
             json.dumps(df["actual_class"].value_counts().to_dict(),
                        default=str),
         "model_version": meta["version"],
         "engine": meta["engine"]["engine"],
     }])
    return df, agg, meta


def run(engine, models_dir: Path, cases_dir: Path, out_dir: Path) -> pd.DataFrame:
    models_dir = Path(models_dir)
    cases_dir = Path(cases_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("DineIQ Big Data Pipeline - Step 4: Dual-pipeline comparison")
    print(f"engine : {engine.display}")
    print(f"models : {models_dir} (latest version per task, loaded not trained)")
    print("=" * 70)

    summary_rows = []

    df, agg, _ = compare_order_value(models_dir, cases_dir, out_dir)
    df.to_csv(out_dir / "order_value_comparison.csv", index=False)
    agg.to_csv(out_dir / "order_value_agreement.csv", index=False)
    print(f"  high_value_order  : "
          f"{int(agg['matching_cases'].iloc[0])}/300 match "
          f"({agg['agreement_percentage'].iloc[0]}%)")

    df, agg, _ = compare_churn(models_dir, cases_dir, out_dir)
    df.to_csv(out_dir / "churn_comparison.csv", index=False)
    agg.to_csv(out_dir / "churn_agreement.csv", index=False)
    print(f"  customer_churn    : "
          f"{int(agg['matching_cases'].iloc[0])}/200 match "
          f"({agg['agreement_percentage'].iloc[0]}%)")

    df, agg, _ = compare_menu(models_dir, cases_dir, out_dir)
    df.to_csv(out_dir / "menu_class_comparison.csv", index=False)
    agg.to_csv(out_dir / "menu_class_agreement.csv", index=False)
    print(f"  menu_business     : "
          f"{int(agg['matching_cases'].iloc[0])}/30 match "
          f"({agg['agreement_percentage'].iloc[0]}%)")

    summary = pd.concat([
        pd.read_csv(out_dir / "order_value_agreement.csv"),
        pd.read_csv(out_dir / "churn_agreement.csv"),
        pd.read_csv(out_dir / "menu_class_agreement.csv"),
    ], ignore_index=True)
    summary.to_csv(out_dir / "dual_pipeline_summary.csv", index=False)
    (out_dir / "engine.json").write_text(json.dumps(engine.label(), indent=2))
    return summary
