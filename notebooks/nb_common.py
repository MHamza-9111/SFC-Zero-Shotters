"""
Shared helpers for the DineIQ Jupyter pipeline notebooks.

Two run modes:

  MODE = "quick"  (default)
      Medium-scale data (~20k orders / 200k lines) generated into
      notebook/outputs/quick/. Fast (~30 s per notebook), and it
      never touches the repository's canonical data directories.

  MODE = "full"
      Full SRS-scale data (1M order lines) in the canonical
      repository directories:
        raw_data -> processed_data
        -> processed_data/analytics
        -> data_cleaning/dual_pipeline
      Same outputs as run_pipeline.py.

Each notebook is self-contained: it runs every pipeline step it
depends on, but skips a step whose outputs already exist on disk.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

BASE = Path(__file__).resolve().parents[1]

# Make the pipeline modules importable from notebooks.
for _p in (BASE / "data_generator",
           BASE / "python_pipeline" / "cleaning"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)


# Medium scale used by quick mode (matches tests/conftest.py).
QUICK_CONFIG = {
    "seed": 42,
    "scale": {
        "customers": 8000,
        "restaurants": 20,
        "locations": 20,
        "categories": 10,
        "menu_items": 150,
        "orders": 20000,
        "order_items_min": 200000,
        "ratings": 20000,
        "wastage": 10000,
        "months": 12,
    },
    "quality": {
        "missing_value_rate": 0.01,
        "duplicate_rate": 0.005,
        "invalid_value_rate": 0.002,
        "outlier_rate": 0.003,
    },
    "time": {"start_date": "2025-01-01", "end_date": "2025-12-31"},
    "output": {
        "raw_dir": "raw_data",
        "processed_dir": "processed_data",
    },
}


def setup_paths(mode: str = "quick") -> dict:
    """
    Returns a dict of pipeline directories for the given mode.
    """
    if mode == "full":
        return {
            "mode": "full",
            "raw": BASE / "raw_data",
            "processed": BASE / "processed_data",
            "reports": BASE / "python_pipeline" / "cleaning",
            "quarantine": BASE / "python_pipeline" / "cleaning" / "quarantine",
            "analytics": BASE / "processed_data" / "analytics",
            "dual": BASE / "python_pipeline" / "cleaning" / "dual_pipeline",
            "config": BASE / "config" / "data_generation_config.yaml",
        }

    root = BASE / "notebook" / "outputs" / "quick"
    return {
        "mode": "quick",
        "raw": root / "raw",
        "processed": root / "processed",
        "reports": root / "reports",
        "quarantine": root / "reports" / "quarantine",
        "analytics": root / "processed" / "analytics",
        "dual": root / "dual_pipeline",
        "config": root / "quick_config.yaml",
    }


def ensure_config(paths: dict) -> None:
    """
    In quick mode, writes the medium-scale config if it is missing.
    In full mode, the repository config is used as-is.
    """
    if paths["mode"] == "quick":
        paths["config"].parent.mkdir(parents=True, exist_ok=True)
        if not paths["config"].exists():
            with paths["config"].open("w", encoding="utf-8") as f:
                yaml.safe_dump(QUICK_CONFIG, f)


def step_done(*marker_files) -> bool:
    """True when every marker file exists (step already ran)."""
    return all(Path(f).exists() for f in marker_files)


# Marker files that signal each pipeline step completed.
def markers(paths: dict) -> dict:
    return {
        "generation": [paths["raw"] / "orders.csv",
                       paths["raw"] / "order_items.csv"],
        "quality": [paths["reports"] / "data_quality_report.csv"],
        "cleaning": [paths["processed"] / "orders.csv",
                     paths["processed"] / "order_items.csv",
                     paths["reports"] / "cleaning_summary.csv"],
        "processing": [paths["analytics"] / "orders_processed.csv",
                       paths["analytics"] / "menu_item_performance.csv"],
        "advanced": [paths["analytics"] / "advanced_analytics_summary.csv"],
    }
