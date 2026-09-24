"""
Step 3 - Model training and evaluation (SRS: minimum 3 MLlib models).

Three classification tasks, each mirroring the definitions used by
the independent Python pipeline so the dual-pipeline comparison is
apples-to-apples:

  A. high_value_order  - is the completed order in the top 10% of
     training-side order value?  RandomForest (150 trees, seed 42).
  B. customer_churn    - no completed order in the final 60 days of
     the window (documented recency proxy), stable 180-day
     observation window.  LogisticRegression (seed 42).
  C. menu_business_class - Profit Driver / Volume Driver /
     Hidden Opportunity / Low Performer (median rule, incl.
     contradictory cases).  RandomForest (150 trees, seed 42).

Leakage control: training data EXCLUDES the committed dual-pipeline
case IDs (300 orders / 200 customers / 30 menu cells), which the
comparison stage then scores as unseen.

Every model is persisted as a versioned artifact:
    Main/models/<task>/v<n>/  (model + metadata.json)
so the 5-second ensemble NFR always loads a fixed, inspectable
version (Main/SRS_CLARIFICATIONS.md, rule 1).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

RANDOM_STATE = 42

from .features import (  # noqa: E402
    CHURN_FEATURES,
    MENU_FEATURES,
    ORDER_FEATURES,
    PERIOD_END,
    TASKS,
    _day_code_map_from_cases,
    build_churn_frame,
    build_menu_frame,
    build_order_frame,
    load_base_frames,
)


# ---------------------------------------------------------------------------
# Base-layer loading (shared by both engines)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Training + evaluation
# ---------------------------------------------------------------------------

def _split(frame, key, excluded, test_size, stratify_col=None, seed=RANDOM_STATE):
    """
    Removes the committed unseen-case rows, then cuts an internal
    evaluation split from what remains. Returns (train_final, eval_df).
    The FINAL model is refit on train_final (all non-case rows).
    """
    tr = frame.loc[~frame[key].isin(set(excluded))].copy()
    rng = np.random.default_rng(seed)
    idx = tr.index.to_numpy()
    n_eval = int(len(tr) * test_size)
    if stratify_col is not None:
        from sklearn.model_selection import train_test_split
        train_part, eval_part = train_test_split(
            tr, test_size=test_size, random_state=seed,
            stratify=tr[stratify_col])
    else:
        eval_idx = rng.choice(idx, size=n_eval, replace=False)
        eval_part = tr.loc[tr.index.isin(set(eval_idx.tolist()))]
        train_part = tr.loc[~tr.index.isin(set(eval_idx.tolist()))]
    return tr, train_part, eval_part


def _metrics_binary(y, pred, prob):
    from sklearn.metrics import (accuracy_score, f1_score,
                                 roc_auc_score)
    out = {
        "accuracy": round(float(accuracy_score(y, pred)), 4),
        "f1": round(float(f1_score(y, pred)), 4),
    }
    try:
        out["roc_auc"] = round(float(roc_auc_score(y, prob)), 4)
    except ValueError:
        out["roc_auc"] = None
    return out


def _train_task_a(frames, day_map, excluded_ids):
    from sklearn.ensemble import RandomForestClassifier

    df = build_order_frame(frames, day_map)
    train_final, train_part, eval_part = _split(
        df, "order_id", excluded_ids, 0.2)

    threshold = float(train_final["total_amount"].quantile(0.90))
    train_part = train_part.copy()
    eval_part = eval_part.copy()
    train_part["y"] = (train_part["total_amount"] >= threshold).astype(int)
    eval_part["y"] = (eval_part["total_amount"] >= threshold).astype(int)

    clf = RandomForestClassifier(n_estimators=150, random_state=RANDOM_STATE,
                                 n_jobs=-1)
    clf.fit(train_part[ORDER_FEATURES], train_part["y"])
    pred = clf.predict(eval_part[ORDER_FEATURES])
    prob = clf.predict_proba(eval_part[ORDER_FEATURES])[:, 1]
    metrics = _metrics_binary(eval_part["y"], pred, prob)

    final = RandomForestClassifier(n_estimators=150,
                                   random_state=RANDOM_STATE, n_jobs=-1)
    final.fit(train_final[ORDER_FEATURES],
              (train_final["total_amount"] >= threshold).astype(int))
    return final, metrics, {
        "threshold": round(threshold, 2),
        "n_train": len(train_final),
        "n_eval": len(eval_part),
        "label_rule": "total_amount >= 90th percentile of training orders",
    }


def _train_task_b(frames, excluded_ids):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import (accuracy_score, f1_score, roc_auc_score)

    df = build_churn_frame(frames)
    tr = df.loc[~df["customer_id"].isin(set(excluded_ids))].copy()

    train_part, eval_part = train_test_split(
        tr, test_size=0.2, random_state=RANDOM_STATE,
        stratify=tr["churned"])
    x = train_part[CHURN_FEATURES].fillna(0)
    clf = LogisticRegression(max_iter=2000, random_state=RANDOM_STATE)
    clf.fit(x, train_part["churned"])
    pred = clf.predict(eval_part[CHURN_FEATURES].fillna(0))
    prob = clf.predict_proba(eval_part[CHURN_FEATURES].fillna(0))[:, 1]
    metrics = {
        "accuracy": round(float(accuracy_score(eval_part["churned"], pred)), 4),
        "macro_f1": round(float(
            f1_score(eval_part["churned"], pred, average="macro")), 4),
        "roc_auc": round(float(roc_auc_score(eval_part["churned"], prob)), 4),
    }

    final = LogisticRegression(max_iter=2000, random_state=RANDOM_STATE)
    final.fit(tr[CHURN_FEATURES].fillna(0), tr["churned"])
    return final, metrics, {
        "n_train": len(tr),
        "n_eval": len(eval_part),
        "churn_rate_train": round(float(tr["churned"].mean()), 4),
        "label_rule": "no completed order in final 60 days of window "
                      "(recency proxy); observation window >= 180 days",
    }


def _train_task_c(frames, excluded_cells):
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import (accuracy_score, f1_score)

    df = build_menu_frame(frames)
    key = list(zip(df["menu_item_id"], df["restaurant_id"]))
    keep = [k not in excluded_cells for k in key]
    tr = df.loc[keep].copy()

    rng = np.random.default_rng(RANDOM_STATE)
    n_eval = int(len(tr) * 0.2)
    eval_idx = rng.choice(tr.index.to_numpy(), size=n_eval, replace=False)
    eval_part = tr.loc[tr.index.isin(set(eval_idx.tolist()))]
    train_part = tr.loc[~tr.index.isin(set(eval_idx.tolist()))]

    clf = RandomForestClassifier(n_estimators=150, random_state=RANDOM_STATE,
                                 n_jobs=-1)
    clf.fit(train_part[MENU_FEATURES], train_part["business_class"])
    pred = clf.predict(eval_part[MENU_FEATURES])
    metrics = {
        "accuracy": round(float(accuracy_score(eval_part["business_class"], pred)), 4),
        "macro_f1": round(float(
            f1_score(eval_part["business_class"], pred,
                     average="macro")), 4),
    }
    final = RandomForestClassifier(n_estimators=150, random_state=RANDOM_STATE,
                                   n_jobs=-1)
    final.fit(tr[MENU_FEATURES], tr["business_class"])
    return final, metrics, {
        "n_train": len(tr),
        "n_eval": len(eval_part),
        "classes": sorted(tr["business_class"].unique().tolist()),
        "label_rule": "median-based 4-class rule incl. contradictory cases",
    }


# ---------------------------------------------------------------------------
# Artifact persistence (versioned)
# ---------------------------------------------------------------------------

def _next_version(models_dir: Path, task: str) -> int:
    base = Path(models_dir) / task
    if not base.exists():
        return 1
    vs = [d.name for d in base.iterdir() if d.name.startswith("v")]
    return max((int(v[1:]) for v in vs), default=0) + 1


def _save_model(engine, model, models_dir: Path, task: str,
                metrics: dict, extra: dict, frame=None) -> Path:
    import joblib
    version = _next_version(models_dir, task)
    vdir = Path(models_dir) / task / f"v{version}"
    vdir.mkdir(parents=True, exist_ok=True)

    if engine.kind == "spark":
        model.write().overwrite().save(str(vdir / "model"))
        model_file = "model"
    else:
        joblib.dump(model, vdir / "model.joblib")
        model_file = "model.joblib"

    meta = {
        "task": task,
        "type": TASKS[task]["type"],
        "version": version,
        "engine": engine.label(),
        "model_file": model_file,
        "trained_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "random_state": RANDOM_STATE,
        "features": TASKS[task]["features"],
        "metrics": metrics,
        **extra,
    }
    (vdir / "metadata.json").write_text(json.dumps(meta, indent=2))
    return vdir


def load_latest_model(models_dir: Path, task: str):
    """Loads the newest version of a task's model + metadata."""
    import joblib
    base = Path(models_dir) / task
    vs = sorted((d for d in base.iterdir() if d.name.startswith("v")),
                key=lambda d: int(d.name[1:]))
    if not vs:
        raise FileNotFoundError(f"No saved model for task {task}")
    vdir = vs[-1]
    meta = json.loads((vdir / "metadata.json").read_text())
    if meta["model_file"] == "model.joblib":
        model = joblib.load(vdir / "model.joblib")
    else:  # pragma: no cover - spark path
        from pyspark.ml.classification import (LogisticRegressionModel,
                                               RandomForestClassificationModel)
        cls = (LogisticRegressionModel if task == "customer_churn"
               else RandomForestClassificationModel)
        model = cls.load(str(vdir / "model"))
    return model, meta


# ---------------------------------------------------------------------------
# Step entry point
# ---------------------------------------------------------------------------

def run(engine, processed_dir: Path, models_dir: Path, evidence_dir: Path,
        cases_dir: Path) -> pd.DataFrame:
    processed_dir = Path(processed_dir)
    models_dir = Path(models_dir)
    evidence_dir = Path(evidence_dir)
    cases_dir = Path(cases_dir)

    print("=" * 70)
    print("DineIQ Big Data Pipeline - Step 3: Model training (MLlib)")
    print(f"engine : {engine.display}")
    print("=" * 70)

    frames = load_base_frames(processed_dir)

    order_cases = pd.read_csv(cases_dir / "order_value_unseen_cases.csv")
    churn_cases = pd.read_csv(cases_dir / "churn_unseen_cases.csv")
    menu_cases = pd.read_csv(cases_dir / "menu_class_unseen_cases.csv")
    excluded_orders = set(order_cases["order_id"].tolist())
    excluded_customers = set(churn_cases["customer_id"].tolist())
    excluded_cells = set(zip(menu_cases["menu_item_id"],
                             menu_cases["restaurant_id"]))

    day_map = _day_code_map_from_cases(
        cases_dir / "order_value_unseen_cases.csv")
    print(f"  excluding committed unseen cases: "
          f"{len(excluded_orders)} orders, "
          f"{len(excluded_customers)} customers, "
          f"{len(excluded_cells)} menu cells")

    results = []

    m, met, extra = _train_task_a(frames, day_map, excluded_orders)
    vdir = _save_model(engine, m, models_dir, "high_value_order", met, extra)
    print(f"  high_value_order : acc={met['accuracy']} "
          f"f1={met['f1']} auc={met['roc_auc']} -> {vdir}")
    results.append({"task": "high_value_order", "model": vdir.name,
                    **{f"eval_{k}": v for k, v in met.items()}})

    m, met, extra = _train_task_b(frames, excluded_customers)
    vdir = _save_model(engine, m, models_dir, "customer_churn", met, extra)
    print(f"  customer_churn   : acc={met['accuracy']} "
          f"macro_f1={met['macro_f1']} auc={met['roc_auc']} -> {vdir}")
    results.append({"task": "customer_churn", "model": vdir.name,
                    **{f"eval_{k}": v for k, v in met.items()}})

    m, met, extra = _train_task_c(frames, excluded_cells)
    vdir = _save_model(engine, m, models_dir, "menu_business_class", met, extra)
    print(f"  menu_business    : acc={met['accuracy']} "
          f"macro_f1={met['macro_f1']} -> {vdir}")
    results.append({"task": "menu_business_class", "model": vdir.name,
                    **{f"eval_{k}": v for k, v in met.items()}})

    summary = pd.DataFrame(results)
    ev = evidence_dir / "models"
    ev.mkdir(parents=True, exist_ok=True)
    summary.to_csv(ev / "model_evaluation_summary.csv", index=False)
    (ev / "engine.json").write_text(json.dumps(engine.label(), indent=2))
    return summary
