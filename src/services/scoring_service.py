"""
DineIQ Analytics - Warm-Process Ensemble Scoring Service.

Implements NFR #1: Ensemble predictions from PySpark MLlib and Python models
scored within 5 seconds (< 5000 ms) without retraining.
"""

from __future__ import annotations

from pathlib import Path
import time
import pandas as pd
import numpy as np

from spark_jobs.ensemble_latency import _load_python_model, NFR_LIMIT_MS
from spark_jobs.mllib_models import load_latest_model, ORDER_FEATURES, CHURN_FEATURES
from spark_jobs.engines import get_engine

BASE_DIR = Path(__file__).resolve().parents[2]

TASK_MAP = {
    "order_value": "high_value_order",
    "high_value_order": "high_value_order",
    "churn": "customer_churn",
    "customer_churn": "customer_churn",
    "menu_class": "menu_business_class",
    "menu_business_class": "menu_business_class",
}


class ScoringService:
    def __init__(self):
        self.models_dir = BASE_DIR / "models"
        self.python_models_dir = BASE_DIR / "models" / "python"
        self.cases_dir = BASE_DIR / "python_pipeline" / "dual_pipeline"
        self.engine = get_engine("pandas", work_root=BASE_DIR)

    def predict_ensemble(self, task: str, records: list[dict]) -> dict:
        """
        Loads warm models and computes ensemble predictions.
        """
        start_time = time.perf_counter()
        df = pd.DataFrame(records)

        canonical_task = TASK_MAP.get(task, task)

        # Select features based on task and map user inputs
        if canonical_task == "high_value_order":
            feature_cols = ORDER_FEATURES
            if "order_amount" in df.columns and "avg_unit_price" not in df.columns:
                df["avg_unit_price"] = df["order_amount"]
            if "item_count" in df.columns:
                if "basket_size" not in df.columns:
                    df["basket_size"] = df["item_count"]
                if "basket_quantity" not in df.columns:
                    df["basket_quantity"] = df["item_count"]
            if "customer_orders" in df.columns and "total_orders" not in df.columns:
                df["total_orders"] = df["customer_orders"]
            if "customer_spend" in df.columns and "total_spend" not in df.columns:
                df["total_spend"] = df["customer_spend"]
            if "promo_applied" in df.columns and "is_promo_order" not in df.columns:
                df["is_promo_order"] = df["promo_applied"]

            defaults = {
                "order_hour": 19,
                "day_of_week_code": 5,
                "order_month": 6,
                "is_weekend": 1,
                "is_promo_order": 0,
                "channel_code": 1,
                "payment_code": 1,
                "basket_size": 3,
                "basket_quantity": 4,
                "avg_unit_price": 500.0,
                "discount_rate_percentage": 0.0,
                "total_orders": 5,
                "total_spend": 2500.0,
            }
            for col, val in defaults.items():
                if col not in df.columns:
                    df[col] = val

        elif canonical_task == "customer_churn":
            feature_cols = CHURN_FEATURES
            if "orders" in df.columns and "f_log_orders" not in df.columns:
                df["f_log_orders"] = np.log1p(df["orders"])
            if "spend" in df.columns and "f_log_spend" not in df.columns:
                df["f_log_spend"] = np.log1p(df["spend"])

            defaults = {
                "recency_days": 30,
                "f_log_orders": np.log1p(10),
                "f_log_spend": np.log1p(15000),
                "average_order_value": 1500.0,
                "discount_dependency": 0.1,
                "promo_dependency": 0.2,
                "top_category_share": 0.4,
                "unique_categories": 3,
            }
            for col, val in defaults.items():
                if col not in df.columns:
                    df[col] = val
        else:
            feature_cols = [c for c in df.columns if c not in ["order_id", "customer_id"]]

        X = df[feature_cols].astype(float)

        # 1. Pipeline model scoring
        pipeline_model, p_meta = load_latest_model(self.models_dir, canonical_task)
        if hasattr(pipeline_model, "predict_proba"):
            p_probas = pipeline_model.predict_proba(X)[:, 1]
        else:
            p_preds = pipeline_model.predict(X)
            p_probas = np.where(p_preds == 1, 0.85, 0.15)

        # 2. Python model scoring (if available)
        py_probas = np.array(p_probas)
        try:
            py_model, py_meta = _load_python_model(self.python_models_dir, canonical_task)
            if hasattr(py_model, "predict_proba"):
                py_probas = py_model.predict_proba(X)[:, 1]
            else:
                py_preds = py_model.predict(X)
                py_probas = np.where(py_preds == 1, 0.85, 0.15)
        except Exception:
            pass

        # 3. Ensemble combination (probability average)
        ensemble_probas = (np.array(p_probas) + py_probas) / 2.0
        ensemble_labels = (ensemble_probas >= 0.5).astype(int)

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        return {
            "task": task,
            "canonical_task": canonical_task,
            "record_count": len(df),
            "latency_ms": round(elapsed_ms, 2),
            "nfr_pass": elapsed_ms < NFR_LIMIT_MS,
            "predictions": [
                {
                    "index": i,
                    "pipeline_proba": round(float(p_probas[i]), 4),
                    "python_proba": round(float(py_probas[i]), 4),
                    "ensemble_proba": round(float(ensemble_probas[i]), 4),
                    "ensemble_label": int(ensemble_labels[i]),
                }
                for i in range(len(df))
            ],
        }
