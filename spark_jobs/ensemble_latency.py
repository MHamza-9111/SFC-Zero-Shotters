"""
Step 5 - NFR performance test: 5-second ensemble prediction.

Per the instructor clarification (Main/SRS_CLARIFICATIONS.md):

  * On upload, BOTH pipelines' saved models produce the combined
    (ensemble) prediction.
  * Models are loaded from versioned artifacts - NEVER retrained.
  * Measurement is on a warm process with models preloaded.
  * Batch size: ~100 records.
  * Pass condition: total ensemble time < 5000 ms.

This step:
  1. loads the latest pipeline models from Main/models/
  2. loads the Python models from Ali Jaan/models/
     (produced by Ali Jaan/data_cleaning/model_artifacts.py)
  3. times a 100-record batch end-to-end:
       python predict -> pipeline predict -> combine (probability
       average) -> ensemble label
  4. writes the measured latency report (committed evidence).

The same protocol is also re-run by Main/tests/test_spark_pipeline.py
so the NFR is asserted, not just reported.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .mllib_models import CHURN_FEATURES, ORDER_FEATURES, load_latest_model

NFR_LIMIT_MS = 5000.0
BATCH_SIZE = 100
WARMUP_RUNS = 3


def _engine_of(meta: dict):
    e = meta.get("engine")
    return e.get("engine") if isinstance(e, dict) else e


def _load_python_model(models_root: Path, task: str):
    import joblib
    base = Path(models_root) / task
    vs = sorted((d for d in base.iterdir() if d.name.startswith("v")),
                key=lambda d: int(d.name[1:]))
    if not vs:
        raise FileNotFoundError(
            f"Python model artifact missing: {base} "
            f"(run Ali Jaan/data_cleaning/model_artifacts.py)")
    vdir = vs[-1]
    meta = json.loads((vdir / "metadata.json").read_text())
    model = joblib.load(vdir / "model.joblib")
    return model, meta


def _order_batch(cases_dir: Path, n: int = BATCH_SIZE) -> pd.DataFrame:
    cases = pd.read_csv(cases_dir / "order_value_unseen_cases.csv")
    return cases.head(n).reset_index(drop=True)


def _churn_batch(cases_dir: Path, n: int) -> pd.DataFrame:
    cases = pd.read_csv(cases_dir / "churn_unseen_cases.csv")
    return cases.head(n).reset_index(drop=True)


def _churn_features(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "recency_days": df["recency_days"].astype(float),
        "f_log_orders": np.log1p(df["total_orders"].astype(float)),
        "f_log_spend": np.log1p(df["total_spend"].astype(float)),
        "average_order_value": df["average_order_value"].astype(float),
        "discount_dependency": df["discount_dependency"].astype(float),
        "promo_dependency": df["promo_dependency"].astype(float),
        "top_category_share": df["top_category_share"].astype(float),
        "unique_categories": df["unique_categories"].astype(float),
    }).fillna(0)


def measure_ensemble(pipeline_models_dir: Path, python_models_dir: Path,
                     cases_dir: Path, task: str = "high_value_order",
                     batch_size: int = BATCH_SIZE) -> dict:
    """
    Warm-process latency measurement for the ensemble path.

    Returns a dict with per-component and total times (ms).
    """
    cases_dir = Path(cases_dir)
    if task == "high_value_order":
        batch = _order_batch(cases_dir, batch_size)
        Xp = batch[ORDER_FEATURES].astype(float)
        py_model, py_meta = _load_python_model(
            python_models_dir, "high_value_order")
        pl_model, pl_meta = load_latest_model(
            pipeline_models_dir, "high_value_order")
    else:
        batch = _churn_batch(cases_dir, batch_size)
        Xp = _churn_features(batch)
        py_model, py_meta = _load_python_model(
            python_models_dir, "customer_churn")
        pl_model, pl_meta = load_latest_model(
            pipeline_models_dir, "customer_churn")

    def once():
        t0 = time.perf_counter()
        py_proba = py_model.predict_proba(Xp)[:, 1]
        t1 = time.perf_counter()
        pl_proba = pl_model.predict_proba(Xp)[:, 1]
        t2 = time.perf_counter()
        ens_proba = (py_proba + pl_proba) / 2.0
        ens_label = (ens_proba >= 0.5).astype(int)
        t3 = time.perf_counter()
        return {
            "python_ms": (t1 - t0) * 1000,
            "pipeline_ms": (t2 - t1) * 1000,
            "combine_ms": (t3 - t2) * 1000,
            "total_ms": (t3 - t0) * 1000,
            "ensemble_labels": ens_label,
            "ensemble_probabilities": ens_proba,
        }

    # Warm-up: guarantees a warm process / preloaded models.
    for _ in range(WARMUP_RUNS):
        once()

    runs = [once() for _ in range(5)]
    totals = [r["total_ms"] for r in runs]
    result = {
        "task": task,
        "batch_size": len(batch),
        "nfr_limit_ms": NFR_LIMIT_MS,
        "python_model_version": py_meta.get("version"),
        "pipeline_model_version": pl_meta.get("version"),
        "pipeline_engine": _engine_of(pl_meta),
        "python_engine": _engine_of(py_meta),
        "runs_ms": [round(t, 3) for t in totals],
        "total_ms": round(float(np.mean(totals)), 3),
        "total_ms_min": round(float(np.min(totals)), 3),
        "total_ms_max": round(float(np.max(totals)), 3),
        "pass": bool(np.max(totals) < NFR_LIMIT_MS),
        "sample": pd.DataFrame({
            "case_id": (batch["order_id"] if task == "high_value_order"
                        else batch["customer_id"]),
            "ensemble_probability": np.round(
                runs[-1]["ensemble_probabilities"], 4),
            "ensemble_label": runs[-1]["ensemble_labels"],
        }),
    }
    return result


def run(engine, pipeline_models_dir: Path, python_models_dir: Path,
        cases_dir: Path, out_dir: Path) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("DineIQ Big Data Pipeline - Step 5: NFR 5-second ensemble test")
    print(f"engine : {engine.display}")
    print("=" * 70)

    results = {}
    for task, batch in (("high_value_order", BATCH_SIZE),
                        ("customer_churn", 200)):
        res = measure_ensemble(pipeline_models_dir, python_models_dir,
                               cases_dir, task=task, batch_size=batch)
        results[task] = res
        res["sample"].to_csv(out_dir / f"latency_sample_{task}.csv",
                             index=False)
        print(f"  {task}: {res['total_ms']} ms mean over "
              f"{len(res['runs_ms'])} warm runs "
              f"(limit {NFR_LIMIT_MS} ms) -> "
              f"{'PASS' if res['pass'] else 'FAIL'}")

    report = pd.DataFrame([
        {"task": k, "batch_size": v["batch_size"],
         "total_ms_mean": v["total_ms"], "total_ms_min": v["total_ms_min"],
         "total_ms_max": v["total_ms_max"],
         "nfr_limit_ms": v["nfr_limit_ms"],
         "pass": v["pass"],
         "python_model_version": v["python_model_version"],
         "pipeline_model_version": v["pipeline_model_version"],
         "pipeline_engine": v["pipeline_engine"],
         "python_engine": v["python_engine"]}
        for k, v in results.items()
    ])
    report.to_csv(out_dir / "ensemble_latency_report.csv", index=False)
    (out_dir / "engine.json").write_text(json.dumps(engine.label(), indent=2))
    detail = {k: {kk: vv for kk, vv in v.items() if kk != "sample"}
              for k, v in results.items()}
    (out_dir / "ensemble_latency_detail.json").write_text(
        json.dumps(detail, indent=2, default=str))
    return results
