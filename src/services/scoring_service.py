"""Warm, versioned model serving for the independent DineIQ pipelines."""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from spark_jobs.features import TASKS
from spark_jobs.mllib_models import load_latest_model
from spark_jobs.ensemble_latency import _load_python_model, NFR_LIMIT_MS

LOGGER = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parents[2]
IDENTIFIER_FIELDS = {"order_id", "customer_id", "menu_item_id", "restaurant_id", "item_name"}
TASK_LABELS = {
    "high_value_order": "High-value order",
    "customer_churn": "Customer churn risk",
    "menu_business_class": "Menu business class",
}
TASK_MAX_BATCH = {"high_value_order": 100, "customer_churn": 200, "menu_business_class": 100}


class InvalidRecords(ValueError):
    """Request records do not match a task's feature contract."""


class BatchTooLarge(ValueError):
    """Request exceeds the task's maximum batch size."""


class ModelsUnavailable(RuntimeError):
    """A required, versioned model could not be loaded."""


@dataclass
class LoadedModel:
    model: object
    metadata: dict
    engine: str
    lock: threading.Lock


class ScoringService:
    """Loads model artifacts once per process and scores without retraining."""

    def __init__(self, base_dir: Path | None = None):
        self.base_dir = Path(base_dir) if base_dir else BASE_DIR
        self.models_dir = self.base_dir / "models"
        self.python_models_dir = self.models_dir / "python"
        self._models: dict[tuple[str, str], LoadedModel] = {}
        self._errors: dict[tuple[str, str], str] = {}
        self._lock = threading.RLock()
        self._spark = None

    @staticmethod
    def _engine_name(metadata: dict) -> str:
        raw = metadata.get("engine", "python")
        return str(raw.get("engine", "python") if isinstance(raw, dict) else raw)

    @staticmethod
    def _latest_metadata(root: Path, task: str) -> tuple[Path, dict]:
        task_dir = root / task
        if not task_dir.is_dir():
            raise FileNotFoundError(f"Model artifacts for {task} were not found")
        versions = []
        for path in task_dir.iterdir():
            if path.is_dir() and path.name.startswith("v") and path.name[1:].isdigit():
                versions.append((int(path.name[1:]), path))
        if not versions:
            raise FileNotFoundError(f"No versioned model artifacts found for {task}")
        version_dir = max(versions, key=lambda pair: pair[0])[1]
        metadata_path = version_dir / "metadata.json"
        if not metadata_path.is_file():
            raise FileNotFoundError(f"Missing model metadata: {metadata_path}")
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        return version_dir, metadata

    def _spark_session(self):
        if self._spark is None:
            from pyspark.sql import SparkSession

            self._spark = (SparkSession.builder.master("local[*]")
                           .appName("DineIQModelServing")
                           .config("spark.sql.execution.arrow.pyspark.enabled", "true")
                           .getOrCreate())
            self._spark.sparkContext.setLogLevel("ERROR")
        return self._spark

    def _load(self, pipeline: str, task: str) -> LoadedModel:
        key = (pipeline, task)
        with self._lock:
            if key in self._models:
                return self._models[key]
            if key in self._errors:
                raise ModelsUnavailable(self._errors[key])
            try:
                if pipeline == "big_data":
                    version_dir, metadata = self._latest_metadata(self.models_dir, task)
                    engine = self._engine_name(metadata)
                    if engine == "spark":
                        self._spark_session()
                    model, loaded_metadata = load_latest_model(self.models_dir, task)
                    metadata = loaded_metadata
                else:
                    model, metadata = _load_python_model(self.python_models_dir, task)
                    engine = self._engine_name(metadata)
                loaded = LoadedModel(model, metadata, engine, threading.Lock())
                self._models[key] = loaded
                return loaded
            except Exception as exc:
                self._errors[key] = str(exc)
                hint = ""
                try:
                    root = self.models_dir if pipeline == "big_data" else self.python_models_dir
                    versions = sorted(
                        (d for d in (root / task).iterdir() if d.name.startswith("v")),
                        key=lambda d: int(d.name[1:]))
                    latest = versions[-1] / "model.joblib"
                    if latest.read_bytes()[:40].startswith(b"version https://git-lfs"):
                        hint = (" — the model file is an unfetched Git-LFS pointer; "
                                "run `python scripts/restore_artifacts.py` or "
                                "`git lfs pull` (see README)")
                except Exception:
                    pass
                LOGGER.warning("Could not load %s model for task %s: %s%s",
                               pipeline, task, exc, hint)
                raise ModelsUnavailable(f"{pipeline} model for {task} is unavailable") from exc

    def warm(self) -> dict:
        """Preload all saved artifacts at application startup."""
        for task in TASKS:
            try:
                self._load("big_data", task)
            except ModelsUnavailable:
                continue
            try:
                self._load("python", task)
            except ModelsUnavailable:
                # Keep other available tasks warm; task_specs reports missing
                # model sides, and the scoring path enforces each task's needs.
                continue
        return self.status()

    def status(self) -> dict:
        return {
            task: {
                "big_data": (self._models.get(("big_data", task)) is not None),
                "python": (self._models.get(("python", task)) is not None),
            }
            for task in TASKS
        }

    @staticmethod
    def _validated_frame(task: str, records: list[dict]) -> tuple[pd.DataFrame, list[str]]:
        if task not in TASKS:
            raise InvalidRecords("Unknown prediction task")
        if not isinstance(records, list) or not records:
            raise InvalidRecords("Provide at least one record")
        limit = TASK_MAX_BATCH[task]
        if len(records) > limit:
            raise BatchTooLarge(f"Batch size exceeds the {limit}-record limit for {task}")
        if any(not isinstance(record, dict) for record in records):
            raise InvalidRecords("Each record must be a JSON object")

        features = list(TASKS[task]["features"])
        allowed = set(features) | IDENTIFIER_FIELDS
        for index, record in enumerate(records):
            unknown = sorted(set(record) - allowed)
            if unknown:
                raise InvalidRecords(f"Unknown feature(s) in record {index + 1}: {', '.join(unknown)}")
            missing = [name for name in features if name not in record]
            if missing:
                raise InvalidRecords(f"Missing feature(s) in record {index + 1}: {', '.join(missing)}")
            for name in features:
                value = record[name]
                if value is None or isinstance(value, (str, bytes)):
                    raise InvalidRecords(f"Feature {name} in record {index + 1} must be numeric")
                try:
                    number = float(value)
                except (TypeError, ValueError, OverflowError) as exc:
                    raise InvalidRecords(f"Feature {name} in record {index + 1} must be numeric") from exc
                if not math.isfinite(number):
                    raise InvalidRecords(f"Feature {name} in record {index + 1} must be finite")

        frame = pd.DataFrame([{name: float(row[name]) for name in features} for row in records],
                             columns=features)
        return frame, features

    def _predict(self, loaded: LoadedModel, frame: pd.DataFrame, task: str):
        model = loaded.model
        if loaded.engine == "spark":
            from pyspark.ml.feature import VectorAssembler

            spark = self._spark_session()
            spark_frame = spark.createDataFrame(frame.assign(__row=np.arange(len(frame))).to_dict("records"))
            # Current Spark artifacts are persisted PipelineModels that own
            # their VectorAssembler/Scaler/Classifier stages. Keep support
            # for older classifier-only artifacts by assembling on demand.
            if hasattr(model, "stages"):
                model_input = spark_frame
            else:
                model_input = VectorAssembler(inputCols=list(frame.columns), outputCol="features").transform(spark_frame)
            with loaded.lock:
                scored = model.transform(model_input).select("__row", "prediction", "probability").toPandas()
            scored = scored.sort_values("__row")
            labels = scored["prediction"].to_numpy().astype(int)
            probabilities = np.vstack([np.asarray(value.toArray(), dtype=float)
                                       for value in scored["probability"]])
            return labels, probabilities

        with loaded.lock:
            if not hasattr(model, "predict_proba"):
                raise ModelsUnavailable(f"{task} model does not expose calibrated probabilities")
            probabilities = np.asarray(model.predict_proba(frame), dtype=float)
            labels = np.asarray(model.predict(frame))
        return labels, probabilities

    def task_specs(self) -> list[dict]:
        specs = []
        for task, definition in TASKS.items():
            big = self._models.get(("big_data", task))
            py = self._models.get(("python", task))
            if big and py:
                status = "ready"
            elif big or py:
                status = "single-model"
            else:
                status = "unavailable"
            specs.append({
                "task": task,
                "label": TASK_LABELS[task],
                "type": definition["type"],
                "features": list(definition["features"]),
                "max_batch": TASK_MAX_BATCH[task],
                "status": status,
            })
        return specs

    def predict_ensemble(self, task: str, records: list[dict]) -> dict:
        aliases = {"order_value": "high_value_order", "churn": "customer_churn"}
        task = aliases.get(task, task)
        started = time.perf_counter()
        frame, _ = self._validated_frame(task, records)

        big = self._models.get(("big_data", task))
        py = self._models.get(("python", task))
        if big is None:
            try:
                big = self._load("big_data", task)
            except ModelsUnavailable:
                if py is None:
                    raise
        if py is None:
            try:
                py = self._load("python", task)
            except ModelsUnavailable:
                py = None
        if big is None and py is None:
            raise ModelsUnavailable(f"No serving model is available for {task}")
        if task != "menu_business_class" and (big is None or py is None):
            raise ModelsUnavailable(f"Both independent models are required for {task}")

        big_labels, big_probabilities = self._predict(big, frame, task) if big else (None, None)
        py_labels, py_probabilities = self._predict(py, frame, task) if py else (None, None)
        multiclass = TASKS[task]["type"] == "multiclass"

        if multiclass:
            selected = big if big else py
            raw_probabilities = big_probabilities if big else py_probabilities
            classes = self._multiclass_labels(selected, raw_probabilities.shape[1])
            big_class_map = py_class_map = None
            if big and py:
                big_classes = self._multiclass_labels(big, big_probabilities.shape[1])
                python_classes = self._multiclass_labels(py, py_probabilities.shape[1])
                if set(big_classes) != set(python_classes):
                    raise ModelsUnavailable("Multiclass pipeline models have different class labels")
                python_columns = [python_classes.index(label) for label in big_classes]
                aligned_python = py_probabilities[:, python_columns]
                raw_probabilities = (big_probabilities + aligned_python) / 2.0
                classes = big_classes
                big_class_map = big_probabilities
                py_class_map = aligned_python
            results = []
            for index, row in enumerate(records):
                class_probabilities = {str(label): round(float(value), 6)
                                       for label, value in zip(classes, raw_probabilities[index])}
                predicted = classes[int(np.argmax(raw_probabilities[index]))]
                result = {
                    "index": index,
                    "label": str(predicted),
                    "label_name": str(predicted),
                    "probabilities": class_probabilities,
                    "probabilities_ensemble": class_probabilities,
                    "probabilities_big_data": ({label: round(float(value), 6)
                                                for label, value in zip(classes, big_class_map[index])}
                                               if big_class_map is not None else None),
                    "probabilities_python": ({label: round(float(value), 6)
                                             for label, value in zip(classes, py_class_map[index])}
                                            if py_class_map is not None else None),
                    "decision_rule": ("mean class probabilities" if big and py
                                      else "single-model class probabilities"),
                }
                for name in IDENTIFIER_FIELDS:
                    if name in row:
                        result[name] = row[name]
                results.append(result)
            fallback = None if big and py else ("big_data" if big else "python")
        else:
            big_positive_col = self._positive_class_column(big.model, big_probabilities) if big else None
            py_positive_col = self._positive_class_column(py.model, py_probabilities) if py else None
            big_positive = big_probabilities[:, big_positive_col] if big else None
            py_positive = py_probabilities[:, py_positive_col] if py else None
            ensemble = (big_positive + py_positive) / 2.0 if big and py else (big_positive if big else py_positive)
            labels = (ensemble >= 0.5).astype(int)
            results = []
            for index, row in enumerate(records):
                result = {
                    "index": index,
                    "ensemble_label": int(labels[index]),
                    "label_name": ("High-value order" if labels[index] else "Standard order")
                    if task == "high_value_order" else ("At risk" if labels[index] else "Not at risk"),
                    "probability_big_data": (round(float(big_positive[index]), 6) if big else None),
                    "probability_python": (round(float(py_positive[index]), 6) if py else None),
                    "probability_ensemble": round(float(ensemble[index]), 6),
                    "decision_rule": "probability average, threshold 0.5" if big and py else "single-model probability, threshold 0.5",
                }
                if task == "high_value_order":
                    result["high_value_predicted"] = int(labels[index])
                else:
                    result["churn_predicted"] = int(labels[index])
                for name in IDENTIFIER_FIELDS:
                    if name in row:
                        result[name] = row[name]
                results.append(result)
            fallback = None if big and py else ("big_data" if big else "python")

        elapsed_ms = (time.perf_counter() - started) * 1000.0
        return {
            "task": task,
            "task_label": TASK_LABELS[task],
            "record_count": len(frame),
            "latency_ms": round(elapsed_ms, 2),
            "nfr_limit_ms": NFR_LIMIT_MS,
            "nfr_pass": bool(elapsed_ms < NFR_LIMIT_MS),
            "ensemble_version": {
                "big_data": big.metadata.get("version") if big else None,
                "python": py.metadata.get("version") if py else None,
            },
            "engine": {
                "big_data": big.engine if big else None,
                "python": py.engine if py else None,
            },
            "fallback": fallback,
            "predictions": results,
        }

    @staticmethod
    def _positive_class_column(model, probabilities: np.ndarray) -> int:
        classes = list(getattr(model, "classes_", []))
        for target in (1, "1", True):
            if target in classes:
                return classes.index(target)
        if probabilities.ndim == 2 and probabilities.shape[1] == 2:
            return 1
        raise ModelsUnavailable("Binary model does not expose a positive class")

    @staticmethod
    def _multiclass_labels(loaded: LoadedModel, width: int) -> list[str]:
        labels = loaded.metadata.get("classes") or list(
            getattr(loaded.model, "classes_", []))
        if len(labels) != width:
            raise ModelsUnavailable("Multiclass model class metadata does not match its probabilities")
        return [str(label) for label in labels]
