"""
DineIQ Analytics - Warm-Process Ensemble Scoring Service.

Implements NFR #1: Ensemble predictions from PySpark MLlib and Python models
scored within 5 seconds (< 5000 ms) without retraining.

Models are loaded ONCE per process (warm serving) from the versioned
artifacts under ``models/<task>/v<n>/`` and ``models/python/<task>/v<n>/``.
The ensemble combination rule (documented in
``spark_jobs/ensemble_latency.py`` and documentation/API_CONTRACT.md):

    probability_ensemble = (p_big_data + p_python) / 2
    label = 1 if probability_ensemble >= 0.5 else 0

Supported tasks: ``high_value_order`` (alias ``order_value``),
``customer_churn`` (alias ``churn``) and ``menu_business_class`` (alias
``menu_class``, multiclass).
"""

from __future__ import annotations

from pathlib import Path
import threading
import time

import numpy as np
import pandas as pd

from spark_jobs.ensemble_latency import _load_python_model, NFR_LIMIT_MS
from spark_jobs.mllib_models import load_latest_model, ORDER_FEATURES, CHURN_FEATURES
from spark_jobs.features import MENU_FEATURES

BASE_DIR = Path(__file__).resolve().parents[2]

# Friendly aliases accepted by the REST layer (API_CONTRACT section 1).
TASK_ALIASES = {
    "order_value": "high_value_order",
    "order-value": "high_value_order",
    "high_value_order": "high_value_order",
    "churn": "customer_churn",
    "customer_churn": "customer_churn",
    "menu_class": "menu_business_class",
    "menu_business_class": "menu_business_class",
}

TASK_LABELS = {
    "high_value_order": "High-Value Order",
    "customer_churn": "Customer Churn",
    "menu_business_class": "Menu Business Class",
}

MENU_CLASSES = ["Profit Driver", "Volume Driver", "Hidden Opportunity", "Low Performer"]

MAX_BATCH = 100


class ModelUnavailable(Exception):
    """Raised when versioned artifacts cannot be loaded (HTTP 503)."""


class InvalidRecords(Exception):
    """Raised for malformed scoring payloads (HTTP 400)."""


def _score_binary(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(X)
        if proba.ndim == 2 and proba.shape[1] >= 2:
            return np.asarray(proba[:, 1], dtype=float)
        return np.asarray(proba).reshape(-1)
    preds = np.asarray(model.predict(X), dtype=float)
    return np.where(preds == 1, 0.9, 0.1)


def _score_multiclass(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        return np.asarray(model.predict_proba(X), dtype=float)
    preds = np.asarray(model.predict(X))
    proba = np.full((len(preds), getattr(model, "n_classes_", 4)), 0.0)
    for i, p in enumerate(preds):
        idx = list(getattr(model, "classes_", range(proba.shape[1]))).index(p) \
            if p in list(getattr(model, "classes_", [])) else int(p)
        proba[i, idx] = 1.0
    return proba


class ScoringService:
    """Warm-process ensemble scorer (models preloaded at construction)."""

    def __init__(self, warm: bool = True):
        self.models_dir = BASE_DIR / "models"
        self.python_models_dir = BASE_DIR / "models" / "python"
        self.cases_dir = BASE_DIR / "python_pipeline" / "dual_pipeline"
        self._cache: dict[str, dict] = {}
        self._lock = threading.RLock()
        self.load_error: str | None = None
        if warm:
            self.warm_up()

    # ------------------------------------------------------------------
    def warm_up(self) -> None:
        """Load every available task's model pair once (warm process)."""
        for task in ("high_value_order", "customer_churn", "menu_business_class"):
            try:
                self._load_pair(task)
            except Exception as exc:  # keep serving what we can
                self.load_error = f"{task}: {exc}"

    def _load_pair(self, task: str) -> dict:
        with self._lock:
            if task in self._cache:
                return self._cache[task]
            try:
                pipeline_model, p_meta = load_latest_model(self.models_dir, task)
            except Exception:
                pipeline_model, p_meta = None, {}
            try:
                python_model, py_meta = _load_python_model(self.python_models_dir, task)
            except Exception:
                python_model, py_meta = None, {}
            if pipeline_model is None and python_model is None:
                raise ModelUnavailable(
                    f"No model artifacts available for '{task}' "
                    f"(checked {self.models_dir}/{task} and {self.python_models_dir}/{task})")
            entry = {
                "pipeline_model": pipeline_model,
                "pipeline_meta": p_meta,
                "python_model": python_model,
                "python_meta": py_meta,
            }
            self._cache[task] = entry
            return entry

    @staticmethod
    def feature_columns(task: str) -> list[str]:
        return {
            "high_value_order": ORDER_FEATURES,
            "customer_churn": CHURN_FEATURES,
            "menu_business_class": MENU_FEATURES,
        }[task]

    # ------------------------------------------------------------------
    def predict_ensemble(self, task: str, records: list[dict]) -> dict:
        """Score records with BOTH pipelines and average probabilities."""
        start_time = time.perf_counter()

        canonical = TASK_ALIASES.get(str(task).strip().lower())
        if canonical is None:
            raise InvalidRecords(
                f"Unknown task '{task}'. Expected one of: "
                f"{sorted(set(TASK_ALIASES))}")
        task = canonical

        if not records or not isinstance(records, list):
            raise InvalidRecords("No records provided for prediction")
        if len(records) > MAX_BATCH:
            raise InvalidRecords(
                f"Batch too large: {len(records)} > {MAX_BATCH} records")

        feature_cols = self.feature_columns(task)
        df = pd.DataFrame(records)
        missing = [c for c in feature_cols if c not in df.columns]
        if missing:
            raise InvalidRecords(
                f"Missing feature(s): {', '.join(missing)}. "
                f"Required for '{task}': {', '.join(feature_cols)}")
        X = df[feature_cols].apply(pd.to_numeric, errors="coerce")
        if X.isna().any().any():
            bad = [c for c in feature_cols if X[c].isna().any()]
            raise InvalidRecords(
                f"Non-numeric or missing value in feature(s): {', '.join(bad)}")

        pair = self._load_pair(task)

        binary = task != "menu_business_class"
        # Honest degradation: when one pipeline's artifact is not deployed,
        # score with the surviving model and say so in the response.
        missing_side = None
        if pair["pipeline_model"] is None:
            missing_side = "big_data"
        elif pair["python_model"] is None:
            missing_side = "python"

        def score_pipeline(Xdf):
            model = pair["pipeline_model"] if pair["pipeline_model"] is not None else pair["python_model"]
            return _score_multiclass(model, Xdf) if not binary else _score_binary(model, Xdf)

        if binary:
            if pair["pipeline_model"] is not None:
                pipeline_proba = _score_binary(pair["pipeline_model"], X)
            else:
                pipeline_proba = np.zeros(len(X))
            if pair["python_model"] is not None:
                python_proba = _score_binary(pair["python_model"], X)
            else:
                python_proba = np.zeros(len(X))
            if missing_side:
                combined = pipeline_proba if missing_side == "python" else python_proba
                ensemble_proba = combined.copy()
                decision = f"single model ({'big-data' if missing_side == 'python' else 'python'} artifact only)"
            else:
                ensemble_proba = (pipeline_proba + python_proba) / 2.0
                decision = "probability average, threshold 0.5"
            ensemble_labels = (ensemble_proba >= 0.5).astype(int)
            results = []
            for i in range(len(X)):
                results.append({
                    "index": i,
                    "pipeline_proba": round(float(pipeline_proba[i]), 4),
                    "python_proba": round(float(python_proba[i]), 4),
                    "probability_big_data": round(float(pipeline_proba[i]), 4),
                    "probability_python": round(float(python_proba[i]), 4),
                    "probability_ensemble": round(float(ensemble_proba[i]), 4),
                    "ensemble_proba": round(float(ensemble_proba[i]), 4),
                    "ensemble_label": int(ensemble_labels[i]),
                    "prediction": int(ensemble_labels[i]),
                    "label_name": ("High-Value Order" if task == "high_value_order"
                                   else "Churn Risk") if ensemble_labels[i]
                                  else ("Standard Order" if task == "high_value_order"
                                        else "Retained"),
                    "decision_rule": decision,
                })
        else:
            if pair["pipeline_model"] is not None:
                pipeline_proba = _score_multiclass(pair["pipeline_model"], X)
            else:
                pipeline_proba = np.zeros((len(X), len(MENU_CLASSES)))
            if pair["python_model"] is not None:
                python_proba = _score_multiclass(pair["python_model"], X)
            else:
                python_proba = np.zeros((len(X), len(MENU_CLASSES)))
            n_classes = max(pipeline_proba.shape[1], python_proba.shape[1], 1)
            pad_p = np.zeros((len(X), n_classes))
            pad_y = np.zeros((len(X), n_classes))
            pad_p[:, :pipeline_proba.shape[1]] = pipeline_proba
            pad_y[:, :python_proba.shape[1]] = python_proba
            if missing_side:
                ensemble_proba = pad_p if missing_side == "python" else pad_y
                decision = f"single model ({'big-data' if missing_side == 'python' else 'python'} artifact only), argmax"
            else:
                ensemble_proba = (pad_p + pad_y) / 2.0
                decision = "probability average, argmax"
            class_labels = list(getattr(pair["python_model"], "classes_", [])) \
                or list(getattr(pair["pipeline_model"], "classes_", [])) \
                or MENU_CLASSES[:n_classes]
            class_names = [MENU_CLASSES[int(c)] if isinstance(c, (int, np.integer))
                           and 0 <= int(c) < len(MENU_CLASSES) else str(c)
                           for c in class_labels]
            results = []
            for i in range(len(X)):
                best = int(np.argmax(ensemble_proba[i]))
                results.append({
                    "index": i,
                    "probabilities": {
                        name: round(float(ensemble_proba[i, j]), 4)
                        for j, name in enumerate(class_names)
                    },
                    "probability_ensemble": round(float(ensemble_proba[i, best]), 4),
                    "ensemble_label": best,
                    "prediction": best,
                    "label_name": class_names[best],
                    "decision_rule": decision,
                })

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "task": task,
            "task_label": TASK_LABELS[task],
            "record_count": len(df),
            "latency_ms": round(elapsed_ms, 2),
            "nfr_pass": elapsed_ms < NFR_LIMIT_MS,
            "nfr_limit_ms": NFR_LIMIT_MS,
            "fallback": missing_side,
            "ensemble_version": {
                "big_data": (pair["pipeline_meta"] or {}).get("version"),
                "python": (pair["python_meta"] or {}).get("version"),
            },
            "engine": {
                "big_data": (pair["pipeline_meta"].get("engine") or {}).get("engine")
                if isinstance(pair["pipeline_meta"].get("engine"), dict)
                else pair["pipeline_meta"].get("engine"),
                "python": (pair["python_meta"].get("engine") or {}).get("engine")
                if isinstance(pair["python_meta"].get("engine"), dict)
                else pair["python_meta"].get("engine"),
            },
            "predictions": results,
        }

    # ------------------------------------------------------------------
    def describe_tasks(self) -> list[dict]:
        """Feature specs for the scoring UI (drives the form dynamically)."""
        specs = []
        for task in ("high_value_order", "customer_churn", "menu_business_class"):
            try:
                pair = self._load_pair(task)
                version = {
                    "big_data": (pair["pipeline_meta"] or {}).get("version"),
                    "python": (pair["python_meta"] or {}).get("version"),
                }
                if pair["pipeline_model"] is None or pair["python_model"] is None:
                    status = "single-model"
                else:
                    status = "ready"
            except Exception:
                version = None
                status = "unavailable"
            specs.append({
                "task": task,
                "label": TASK_LABELS[task],
                "type": "multiclass" if task == "menu_business_class" else "binary",
                "features": self.feature_columns(task),
                "aliases": sorted({a for a, t in TASK_ALIASES.items() if t == task}),
                "ensemble_version": version,
                "status": status,
                "max_batch": MAX_BATCH,
            })
        return specs
