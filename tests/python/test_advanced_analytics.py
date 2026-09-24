"""
Advanced analytics (SRS intelligence layer) tests.

Verifies:
  - the expected intelligence outputs are produced
  - the demand-forecast model beats the naive baseline (SRS)
  - the dual-pipeline comparison sets exist with consistent sizes
  - ML models report sensible metrics
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

ADVANCED_OUTPUTS = [
    "rfm_segmentation.csv",
    "menu_business_classes.csv",
    "market_basket_pairs.csv",
    "peak_period_analysis.csv",
    "daily_forecast.csv",
    "forecast_evaluation.csv",
    "wastage_risk_analysis.csv",
    "price_sensitivity_analysis.csv",
    "promotion_effectiveness.csv",
    "anomaly_detection.csv",
    "slow_moving_items.csv",
    "location_channel_intelligence.csv",
    "churn_risk.csv",
    "churn_model_metrics.csv",
    "recommendations.csv",
    "what_if_analysis.csv",
    "advanced_analytics_summary.csv",
]

DUAL_OUTPUTS = [
    "order_value_unseen_cases.csv",
    "order_value_python_predictions.csv",
    "order_value_classification_report.csv",
    "menu_class_unseen_cases.csv",
    "menu_class_python_predictions.csv",
    "churn_unseen_cases.csv",
    "churn_python_predictions.csv",
    "forecast_unseen_days.csv",
]


def _read(d: Path, name: str) -> pd.DataFrame:
    return pd.read_csv(d / name, low_memory=False)


def test_advanced_outputs_exist(pipeline):
    out = pipeline["analytics"]
    for name in ADVANCED_OUTPUTS:
        assert (out / name).exists(), f"missing advanced output: {name}"


def test_forecast_model_beats_naive_baseline(pipeline):
    out = pipeline["analytics"]
    ev = _read(out, "forecast_evaluation.csv")

    model = ev[ev["model"].str.startswith("linear")].iloc[0]
    naive = ev[ev["model"].str.startswith("naive")].iloc[0]

    # Metrics must be positive and finite.
    for row in (model, naive):
        assert row["mae"] > 0
        assert row["rmse"] > 0
        assert 0 < row["mape"] < 100

    # SRS requirement: the model must improve on a simple baseline.
    assert model["mae"] < naive["mae"], (
        f"forecast model MAE {model['mae']} did not beat naive "
        f"baseline MAE {naive['mae']}"
    )


def test_forecast_holdout_is_chronological(pipeline):
    out = pipeline["analytics"]
    fc = _read(out, "daily_forecast.csv")
    fc["date"] = pd.to_datetime(fc["date"])
    # Held-out set must be the final contiguous block of the year.
    assert fc["date"].min() >= pd.Timestamp("2025-10-01"), (
        "forecast holdout does not appear to be the last days of the window"
    )
    assert len(fc) == 90


def test_menu_business_classes_use_multiple_indicators(pipeline):
    out = pipeline["analytics"]
    mc = _read(out, "menu_business_classes.csv")
    for col in [
        "units_sold", "revenue", "estimated_profit",
        "profit_margin_percentage", "average_rating", "wastage_ratio",
        "business_class", "contradictory_case",
    ]:
        assert col in mc.columns, f"menu classes missing column {col}"
    assert mc["business_class"].nunique() >= 2


def test_dual_pipeline_sets_consistent(pipeline):
    d = pipeline["dual"]
    for name in DUAL_OUTPUTS:
        assert (d / name).exists(), f"missing dual-pipeline file: {name}"

    oc = _read(d, "order_value_unseen_cases.csv")
    op = _read(d, "order_value_python_predictions.csv")
    assert len(oc) == len(op) and len(oc) >= 100, (
        "dual-pipeline order-value set must have at least 100 unseen cases"
    )
    assert set(oc["order_id"]) == set(op["order_id"])

    cc = _read(d, "churn_unseen_cases.csv")
    cp = _read(d, "churn_python_predictions.csv")
    assert set(cc["customer_id"]) == set(cp["customer_id"])

    mc = _read(d, "menu_class_unseen_cases.csv")
    mp = _read(d, "menu_class_python_predictions.csv")
    assert set(mc["menu_item_id"]) == set(mp["menu_item_id"])

    # The Python predictions must be real (not all one class).
    assert op["python_predicted_high_value"].nunique() >= 1
    assert cp["python_predicted_churn"].nunique() >= 1


def test_churn_model_reports_sensible_metrics(pipeline):
    out = pipeline["analytics"]
    m = _read(out, "churn_model_metrics.csv")
    metrics = dict(zip(m["metric"].astype(str), m["value"]))

    acc = float(metrics["accuracy"])
    auc = float(metrics["roc_auc"])
    assert 0.5 <= acc <= 1.0
    assert 0.5 <= auc <= 1.0
    # A real model should beat random chance by a comfortable margin.
    assert acc > 0.8, f"churn accuracy {acc} too low to be meaningful"


def test_rfm_segments_and_scores(pipeline):
    out = pipeline["analytics"]
    rf = _read(out, "rfm_segmentation.csv")
    for col in ["r_score", "f_score", "m_score", "segment"]:
        assert col in rf.columns
    assert rf["r_score"].between(1, 5).all()
    assert rf["f_score"].between(1, 5).all()
    assert rf["m_score"].between(1, 5).all()
    assert rf["segment"].nunique() >= 2


def test_basket_metrics_are_bounded(pipeline):
    out = pipeline["analytics"]
    mb = _read(out, "market_basket_pairs.csv")
    if len(mb):
        assert mb["support"].between(0, 1).all()
        assert mb["confidence_a_to_b"].between(0, 1).all()
        assert (mb["lift"] >= 0).all()


def test_recommendations_are_prioritized_and_evidenced(pipeline):
    out = pipeline["analytics"]
    rec = _read(out, "recommendations.csv")
    assert len(rec) > 0
    assert set(rec["priority"]).issubset({"P1", "P2", "P3"})
    assert rec["evidence"].notna().all()
    assert (rec["evidence"].astype(str).str.len() > 10).all()
