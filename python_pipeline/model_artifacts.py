"""
Python-pipeline model artifacts.

Persists the Python data-science models as versioned artifacts so the
5-second ensemble NFR (SRS_CLARIFICATIONS.md) can load them at
serving time instead of retraining:

  models/python/high_value_order/v<n>/model.joblib + metadata.json
  models/python/customer_churn/v<n>/model.joblib + metadata.json

Training contract (identical to the Spark pipeline's):
  * same canonical input  : processed_data/
  * same features         : spark_jobs/features.py
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
    MENU_FEATURES,
    ORDER_FEATURES,
    build_churn_frame,
    build_menu_frame,
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
        "f_log_orders": np.log1p(cases["total_orders"].astype(float)),
        "f_log_spend": np.log1p(cases["total_spend"].astype(float)),
        "average_order_value": cases["average_order_value"].astype(float),
        "discount_dependency": cases["discount_dependency"].astype(float),
        "promo_dependency": cases["promo_dependency"].astype(float),
        "top_category_share": cases["top_category_share"].astype(float),
        "unique_categories": cases["unique_categories"].astype(float),
        "total_items_purchased": cases["total_items_purchased"].astype(float),
        "weekend_order_share": cases["weekend_order_share"].astype(float),
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


def _verify_menu(model, cases: pd.DataFrame, vdir: Path) -> tuple[float, float]:
    from sklearn.metrics import accuracy_score, f1_score

    predicted = model.predict(cases[MENU_FEATURES])
    committed = pd.read_csv(CASES_DIR / "menu_class_python_predictions.csv")
    n_match = int((predicted == committed["python_predicted_class"]).sum())
    if n_match != len(cases):
        raise AssertionError(
            f"menu_business_class artifact mismatch: {n_match}/{len(cases)} "
            f"predictions reproduce the committed Python predictions - "
            f"refusing to ship a divergent artifact ({vdir})")
    accuracy = float(accuracy_score(cases["actual_class"], predicted))
    macro_f1 = float(f1_score(cases["actual_class"], predicted, average="macro"))
    print(f"  verified menu_business_class artifact: {n_match}/{len(cases)} "
          "committed predictions reproduced exactly")
    return accuracy, macro_f1


def main() -> dict:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import accuracy_score, f1_score

    print("=" * 70)
    print("Python pipeline - persisting model artifacts (seed 42)")
    print("=" * 70)
    frames = load_base_frames(PROCESSED_DIR)
    order_cases = pd.read_csv(CASES_DIR / "order_value_unseen_cases.csv")
    churn_cases = pd.read_csv(CASES_DIR / "churn_unseen_cases.csv")
    menu_cases = pd.read_csv(CASES_DIR / "menu_class_unseen_cases.csv")

    # ---- high-value order classifier --------------------------------
    # The day_of_week_code mapping is recovered from the committed case
    # file so it is identical to the one the original Python run used
    # (factorize codes are appearance-order dependent).
    from spark_jobs.features import _day_code_map_from_cases
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
    lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, random_state=RANDOM_STATE))
    lr.fit(train[CHURN_FEATURES].fillna(0), train["churned"])
    vdir = _save(lr, MODELS_DIR, "customer_churn", {
        "model": "LogisticRegression (sklearn)",
        "features": CHURN_FEATURES,
        "n_train": len(train),
    })
    print(f"  customer_churn   -> {vdir}")
    _verify_churn(lr, vdir)

    # ---- menu business-class classifier -----------------------------
    menu = build_menu_frame(frames)
    excluded_cells = set(zip(menu_cases["menu_item_id"],
                             menu_cases["restaurant_id"]))
    train_mask = [key not in excluded_cells
                  for key in zip(menu["menu_item_id"], menu["restaurant_id"])]
    train = menu.loc[train_mask]
    menu_model = RandomForestClassifier(n_estimators=150,
                                        random_state=RANDOM_STATE,
                                        n_jobs=-1)
    menu_model.fit(train[MENU_FEATURES], train["business_class"])
    menu_predicted = menu_model.predict(menu_cases[MENU_FEATURES])
    menu_accuracy = float(accuracy_score(menu_cases["actual_class"], menu_predicted))
    menu_macro_f1 = float(f1_score(menu_cases["actual_class"], menu_predicted,
                                   average="macro"))
    vdir = _save(menu_model, MODELS_DIR, "menu_business_class", {
        "model": "RandomForestClassifier (sklearn)",
        "features": MENU_FEATURES,
        "n_train": len(train),
        "n_eval": len(menu_cases),
        "classes": sorted(train["business_class"].unique().tolist()),
        "metrics": {"accuracy": round(menu_accuracy, 4),
                    "macro_f1": round(menu_macro_f1, 4)},
        "label_rule": "median-based 4-class menu business rule",
    })
    print(f"  menu_business_class -> {vdir}")
    import joblib
    _verify_menu(joblib.load(vdir / "model.joblib"), menu_cases, vdir)

    print("Python model artifacts ready.")
    return {}


if __name__ == "__main__":
    main()
