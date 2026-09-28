#!/usr/bin/env python3
"""Restore runtime artifacts that are stored as unfetched Git-LFS pointers.

The model files (``models/**/model.joblib``) and
``processed_data/analytics/order_items_integrated.csv`` are committed through
Git LFS. A ZIP download of the repository, or a clone made without
``git-lfs``, contains only the tiny pointer text instead of the real bytes.
Symptoms:

* startup log: ``Could not load ... model ...: 118`` (pickle ``KeyError``),
* ``GET /api/v1/status`` reports ``DEGRADED`` and the sidebar shows
  "Pipeline degraded",
* order line items come back empty.

This script detects those pointers and regenerates the artifacts using the
repository's own pipeline code — the documented pandas fallback, so **no JVM
or PySpark is required**:

  1. ``python_pipeline/processing/process_dineiq_data.py``
       -> real ``order_items_integrated.csv`` (order line items)
  2. ``python_pipeline/model_artifacts.py``
       -> ``models/python/<task>/vNext`` (self-verifies committed predictions)
  3. ``python -m spark_jobs.run_all --engine pandas --skip ingest sql compare latency``
       -> ``models/<task>/vNext`` (big-data side, pandas fallback engine)

If the checkout has ``.git`` and git-lfs installed, ``git lfs pull`` is the
faster alternative — this script is for archives and machines without LFS.

Usage:  python scripts/restore_artifacts.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
POINTER_PREFIX = b"version https://git-lfs"

# (label, predicate-path) — paths whose absence/pointer state drives each step.
DATA_CSV = BASE / "processed_data" / "analytics" / "order_items_integrated.csv"


def is_pointer(path: Path) -> bool:
    try:
        with open(path, "rb") as handle:
            return handle.read(len(POINTER_PREFIX)) == POINTER_PREFIX
    except OSError:
        return False


def pointer_files() -> list[Path]:
    found: list[Path] = []
    for root in (BASE / "models", BASE / "processed_data"):
        for path in root.rglob("*.joblib"):
            if is_pointer(path):
                found.append(path)
    if DATA_CSV.is_file() and is_pointer(DATA_CSV):
        found.append(DATA_CSV)
    return found


def run(step: str, args: list[str]) -> bool:
    print(f"\n=== {step} ===", flush=True)
    result = subprocess.run([sys.executable, *args], cwd=BASE)
    if result.returncode != 0:
        print(f"!!! {step} failed (exit {result.returncode})", file=sys.stderr)
        return False
    return True


def main() -> int:
    pending = pointer_files()
    if not pending:
        print("No LFS pointer files found — artifacts already present.")
    else:
        print(f"Found {len(pending)} unfetched Git-LFS pointer file(s):")
        for path in pending:
            print(f"  - {path.relative_to(BASE)}")
        if not (BASE / "processed_data" / "orders.csv").is_file():
            print("Missing cleaned inputs (processed_data/*.csv). "
                  "Run: python python_pipeline/run_pipeline.py --skip-generation",
                  file=sys.stderr)
            return 2

        ok = True
        if any(p == DATA_CSV for p in pending):
            ok &= run("Regenerating order_items_integrated.csv "
                      "(data processing step)",
                      ["python_pipeline/processing/process_dineiq_data.py"])
        if any("models" in p.parts and "python" in p.parts for p in pending):
            ok &= run("Training Python-side model artifacts "
                      "(model_artifacts.py)",
                      ["python_pipeline/model_artifacts.py"])
        if any(p.parts[p.parts.index("models") + 1] != "python"
               for p in pending if "models" in p.parts):
            ok &= run("Training big-data-side models (pandas fallback, no JVM)",
                      ["-m", "spark_jobs.run_all", "--engine", "pandas",
                       "--skip", "ingest", "sql", "compare", "latency"])
        if not ok:
            print("\nRestore incomplete — see errors above.", file=sys.stderr)
            return 1

    # Verify through the real application.
    try:
        sys.path.insert(0, str(BASE))
        from src.backend.app import create_app  # noqa: WPS433 (runtime check)

        client = create_app().test_client()
        status = client.get("/api/v1/status").get_json() or {}
    except Exception as exc:  # pragma: no cover - diagnostic only
        print(f"\nCould not verify status: {exc}", file=sys.stderr)
        return 1

    print("\n=== Verification ===")
    print(json.dumps(status, indent=2)[:1200])
    if status.get("status") == "OPERATIONAL":
        print("\nOK — pipeline OPERATIONAL. Restart the server; the "
              "'Could not load model' warnings are gone.")
        return 0
    print("\nStatus is not OPERATIONAL yet — see the response above.",
          file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
