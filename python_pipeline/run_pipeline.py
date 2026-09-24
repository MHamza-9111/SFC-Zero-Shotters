"""
DineIQ Analytics - Full Python data pipeline runner.

Runs, in order:
  1. Data generation            (Ali Jaan/data_generator)
  2. Raw data quality assessment (data_quality_check.py)
  3. Cleaning + quarantine       (clean_dineiq_data.py)
  4. Integration + core analytics (process_dineiq_data.py)
  5. Advanced analytics + ML     (run_advanced_analytics.py)

Usage:
  python run_pipeline.py            # full pipeline (full-scale data)
  python run_pipeline.py --skip-generation   # reuse existing raw data
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
GENERATOR = BASE / "data_generator" / "generate_dineiq_data.py"


def run_step(name: str, script: Path, *args: str) -> None:
    print("\n" + "#" * 75)
    print(f"# STEP: {name}")
    print("#" * 75)
    cmd = [sys.executable, str(script), *args]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise SystemExit(
            f"Pipeline step '{name}' failed with code {result.returncode}."
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the full DineIQ Python data pipeline."
    )
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        help="Reuse the existing raw data instead of regenerating it.",
    )
    args = parser.parse_args()

    if not args.skip_generation:
        run_step("Data generation", GENERATOR)

    run_step("Raw data quality assessment", SCRIPTS / "cleaning" / "data_quality_check.py")
    run_step("Data cleaning + quarantine", SCRIPTS / "cleaning" / "clean_dineiq_data.py")
    run_step("Integration + core analytics", SCRIPTS / "processing" / "process_dineiq_data.py")
    run_step("Advanced analytics + ML", SCRIPTS / "analytics" / "run_advanced_analytics.py")

    print("\n" + "=" * 75)
    print("PIPELINE COMPLETE")
    print("=" * 75)
    print("Outputs:")
    print("  Raw data        : raw_data/")
    print("  Processed data  : processed_data/")
    print("  Analytics       : processed_data/analytics/")
    print("  Dual-pipeline   : python_pipeline/dual_pipeline/")
    print("  Reports         : reports/")
    print("  Quarantine      : processed_data/quarantine/")


if __name__ == "__main__":
    main()
