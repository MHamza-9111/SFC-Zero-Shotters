"""
Python-pipeline model artifacts (owner: Ali Jaan's workspace).

Persists the Python data-science models as versioned artifacts so the
5-second ensemble NFR (Main/SRS_CLARIFICATIONS.md) can load them at
serving time instead of retraining:

  Ali Jaan/models/high_value_order/v<n>/model.joblib + metadata.json
  Ali Jaan/models/customer_churn/v<n>/model.joblib + metadata.json

Training contract (identical to the Spark pipeline's):
  * same canonical input  : Ali Jaan/processed_data/
  * same features         : Main/spark_pipeline/features.py
                            (shared single source of truth - this import
                             is what guarantees feature parity)
  * same hyperparameters  : RandomForest(n=150) / LogisticRegression,
                            random_state 42
  * same leakage control  : the committed dual-pipeline case IDs are
                            excluded from training

Self-validation: after saving, the artifact must reproduce the
committed Python predictions on the committed unseen cases exactly.
If it does not, the script fails - a wrong artifact would silently
corrupt the ensemble.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))

from spark_jobs.features import (  # noqa: E402
    CHURN_FEATURES,
    ORDER_FEATURES,
    build_churn_frame,
    build_order_frame,
    load_base_frames,
)

RANDOM_STATE = 42
PROCESSED_DIR = BASE / "processed_data"
CASES_DIR = BASE / "python_pipeline" / "dual_pipeline"
MODELS_DIR = BASE / "models" / "python"


def _next_version(base: Path) -> int:
    if not base.exists():
        return 1
    vs = [d.name for d in base.iterdir() if d.name.startswith("v")]
    return max((int(v[1:]) for v in vs), default=0) + 1


def _save(joblib_model, base_dir: Path, task: str, meta: dict) -> Path:
    import joblib
    version = _next_version(base_dir / task)
    vdir = base_dir / task / f"v{version}"
    vdir.mkdir(parents=True, exist_ok=True)
    joblib.dump(joblib_model, vdir / "model.joblib")
    meta = dict(meta)
    meta.update({"task": task, "version": version,
                 "engine": "python",
                 "trained_at": time.strftime("%Y-%m-%d %H:%M:%S")})
    (vdir / "metadata.json").write_text(json.dumps(meta, indent=2))
    return vdir


def _verify_order_value(model, vdir: Path) -> None:
    cases = pd.read_csv(CASES_DIR / "order_value_unseen_cases.csv")
    committed = pd.read_csv(CASES_DIR / "order_value_python_predictions.csv")
    X = cases[ORDER_FEATURES].astype(float)
    pred = model.predict(X)
    df = pd.DataFrame({"order_id": cases["order_id"],
                       "artifact_pred": pred,
                       "committed_pred": committed["python_predicted_high_value"]})
    n_match = int((df["artifact_pred"] == df["committed_pred"]).sum())
    if n_match != len(df):
        raise AssertionError(
            f"high_value_order artifact mismatch: {n_match}/{len(df)} "
            f"predictions reproduce the committed Python predictions - "
            f"refusing to ship a divergent artifact ({vdir})")
    print(f"  verified high_value_order artifact: {n_match}/{len(df)} "
          f"committed predictions reproduced exactly")


def _verify_churn(model, vdir: Path) -> None:
    cases = pd.read_csv(CASES_DIR / "churn_unseen_cases.csv")
    committed = pd.read_csv(CASES_DIR / "churn_python_predictions.csv")
    X = pd.DataFrame({
        "recency_days": cases["recency_days"].astype(float),
        "f_log_orders": np.log1p(cases["total_orders"].astype(float)),
        "f_log_spend": np.log1p(cases["total_spend"].astype(float)),
        "average_order_value": cases["average_order_value"].astype(float),
        "discount_dependency": cases["discount_dependency"].astype(float),
        "promo_dependency": cases["promo_dependency"].astype(float),
        "top_category_share": cases["top_category_share"].astype(float),
        "unique_categories": cases["unique_categories"].astype(float),
    }).fillna(0)
    pred = model.predict(X)
    df = pd.DataFrame({"customer_id": cases["customer_id"],
                       "artifact_pred": pred,
                       "committed_pred": committed["python_predicted_churn"]})
    n_match = int((df["artifact_pred"] == df["committed_pred"]).sum())
    if n_match != len(df):
        raise AssertionError(
            f"customer_churn artifact mismatch: {n_match}/{len(df)} "
            f"predictions reproduce the committed Python predictions - "
            f"refusing to ship a divergent artifact ({vdir})")
    print(f"  verified customer_churn artifact: {n_match}/{len(df)} "
          f"committed predictions reproduced exactly")


def main() -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression

    print("=" * 70)
    print("Python pipeline - persisting model artifacts (seed 42)")
    print("=" * 70)
    frames = load_base_frames(PROCESSED_DIR)
    order_cases = pd.read_csv(CASES_DIR / "order_value_unseen_cases.csv")
    churn_cases = pd.read_csv(CASES_DIR / "churn_unseen_cases.csv")

    # ---- high-value order classifier --------------------------------
    # The day_of_week_code mapping is recovered from the committed case
    # file so it is identical to the one the original Python run used
    # (factorize codes are appearance-order dependent).
    from Main.spark_pipeline.features import _day_code_map_from_cases
    day_map = _day_code_map_from_cases(
        CASES_DIR / "order_value_unseen_cases.csv")
    of = build_order_frame(frames, day_map)
    train = of.loc[~of["order_id"].isin(set(order_cases["order_id"]))]
    threshold = float(train["total_amount"].quantile(0.90))
    clf = RandomForestClassifier(n_estimators=150, random_state=RANDOM_STATE,
                                 n_jobs=-1)
    clf.fit(train[ORDER_FEATURES],
            (train["total_amount"] >= threshold).astype(int))
    vdir = _save(clf, MODELS_DIR, "high_value_order", {
        "model": "RandomForestClassifier (sklearn)",
        "features": ORDER_FEATURES,
        "n_train": len(train),
        "threshold": round(threshold, 2),
    })
    print(f"  high_value_order -> {vdir}")
    _verify_order_value(clf, vdir)

    # ---- churn classifier --------------------------------------------
    cf = build_churn_frame(frames)
    train = cf.loc[~cf["customer_id"].isin(set(churn_cases["customer_id"]))]
    lr = LogisticRegression(max_iter=2000, random_state=RANDOM_STATE)
    lr.fit(train[CHURN_FEATURES].fillna(0), train["churned"])
    vdir = _save(lr, MODELS_DIR, "customer_churn", {
        "model": "LogisticRegression (sklearn)",
        "features": CHURN_FEATURES,
        "n_train": len(train),
    })
    print(f"  customer_churn   -> {vdir}")
    _verify_churn(lr, vdir)

    print("Python model artifacts ready.")
    return {}


if __name__ == "__main__":
    main()
