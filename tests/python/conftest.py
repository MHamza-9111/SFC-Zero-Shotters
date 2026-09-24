"""
Shared fixtures for the DineIQ Python pipeline tests.

The session-scoped ``pipeline`` fixture runs the full pipeline
(generation -> cleaning -> processing -> advanced analytics) at a
medium scale in a temporary directory, so the tests validate the
real code paths without touching the repository data directories.
"""

from pathlib import Path
import sys
import pytest
import yaml

BASE = Path(__file__).resolve().parents[2]

sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "data_generator"))
sys.path.insert(0, str(BASE / "python_pipeline" / "cleaning"))
sys.path.insert(0, str(BASE / "python_pipeline" / "processing"))
sys.path.insert(0, str(BASE / "python_pipeline" / "analytics"))

import clean_dineiq_data  # noqa: E402
import process_dineiq_data  # noqa: E402
import run_advanced_analytics  # noqa: E402
from generate_dineiq_data import generate as generate_data  # noqa: E402


# Medium scale: large enough for stable ML metrics (churn, forecast)
# but small enough to keep the test session fast (~30 seconds).
PIPELINE_CONFIG = {
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
        "raw_dir": "Main/raw_data",
        "processed_dir": "Ali Jaan/processed_data",
    },
}


@pytest.fixture(scope="session")
def pipeline(tmp_path_factory):
    root = tmp_path_factory.mktemp("dineiq-pipeline")
    config_path = root / "pipeline_config.yaml"
    with config_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(PIPELINE_CONFIG, f)

    raw_dir = root / "raw"
    counts = generate_data(raw_dir=raw_dir, config_path=config_path)

    processed_dir = root / "processed"
    reports_dir = root / "reports"
    quarantine_dir = reports_dir / "quarantine"

    clean_dineiq_data.main(
        raw_dir=raw_dir,
        processed_dir=processed_dir,
        reports_dir=reports_dir,
        quarantine_dir=quarantine_dir,
        config_path=config_path,
    )

    analytics_dir = processed_dir / "analytics"
    process_dineiq_data.main(
        processed_dir=processed_dir,
        output_dir=analytics_dir,
        reports_dir=reports_dir,
    )

    dual_dir = root / "dual_pipeline"
    advanced = run_advanced_analytics.main(
        processed_dir=processed_dir,
        output_dir=analytics_dir,
        dual_dir=dual_dir,
    )

    return {
        "root": root,
        "raw": raw_dir,
        "processed": processed_dir,
        "analytics": analytics_dir,
        "reports": reports_dir,
        "quarantine": quarantine_dir,
        "dual": dual_dir,
        "counts": counts,
        "advanced": advanced,
    }
