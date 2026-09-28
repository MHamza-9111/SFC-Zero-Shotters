
"""Restore runtime artifacts that are stored as unfetched Git-LFS pointers.

The trained model files (``models/**/model.joblib``) are committed through
Git LFS. A ZIP download of the repository, or a clone made without
``git-lfs``, contains only the tiny pointer text instead of the real bytes.
Symptoms:

* startup log: ``Could not load ... model ...: 118`` (pickle ``KeyError``),
* ``GET /api/v1/status`` reports ``DEGRADED`` and the sidebar shows
  "Pipeline degraded",
* model pages report the models as unavailable.

This script detects those pointers and regenerates the artifacts using the
repository's own pipeline code — the documented pandas fallback, so **no JVM
or PySpark is required**:

  1. ``python_pipeline/model_artifacts.py``
       -> ``models/python/<task>/vNext`` (self-verifies committed predictions)
  2. ``python -m spark_jobs.run_all --engine pandas --skip ingest sql compare latency``
       -> ``models/<task>/vNext`` (big-data side, pandas fallback engine)

The order-line dataset is **not** a Git LFS object any more. It ships as
``processed_data/analytics/order_items_integrated.csv.xz`` (13 MB instead of
194 MB) so the serverless bundle stays small; rebuild it with
``python scripts/build_runtime_artifacts.py``.

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


# The order-line dataset is no longer an LFS object: it ships as a compressed
# runtime artifact (13 MB instead of 194 MB) so the serverless bundle fits.
# Rebuild it with ``python scripts/build_runtime_artifacts.py``.
ITEM_ARTIFACT = BASE / "processed_data" / "analytics" / "order_items_integrated.csv.xz"


def is_pointer(path: Path) -> bool:
    try:
        with open(path, "rb") as handle:
            return handle.read(len(POINTER_PREFIX)) == POINTER_PREFIX
    except OSError:
        return False


def latest_model_files() -> list[Path]:
    """Newest ``model.joblib`` per task, for both pipelines.

    The application only ever loads the latest version of each task, so older
    versions (which may legitimately remain as unfetched LFS pointers) must
    not count as "missing" -- otherwise this script would retrain and add a
    new version on every run without ever converging.
    """
    models = BASE / "models"
    if not models.is_dir():
        return []
    task_dirs: list[Path] = []
    for child in sorted(models.iterdir()):
        if not child.is_dir():
            continue
        if child.name == "python":
            task_dirs += [t for t in sorted(child.iterdir()) if t.is_dir()]
        else:
            task_dirs.append(child)
    latest: list[Path] = []
    for task in task_dirs:
        versions = [v for v in task.iterdir()
                    if v.is_dir() and re.fullmatch(r"v\d+", v.name)]
        if versions:
            newest = max(versions, key=lambda v: int(v.name[1:]))
            latest.append(newest / "model.joblib")
    return latest


def pointer_files() -> list[Path]:
    return [path for path in latest_model_files() if is_pointer(path)]


def missing_item_artifact() -> bool:
    """True when the compressed order-line dataset the app reads is absent."""
    return not ITEM_ARTIFACT.is_file()


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
        if missing_item_artifact():
            ok &= run("Rebuilding the compressed order-line runtime artifact",
                      ["scripts/build_runtime_artifacts.py"])
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


    try:
        sys.path.insert(0, str(BASE))
        from src.backend.app import create_app

        client = create_app().test_client()
        status = client.get("/api/v1/status").get_json() or {}
    except Exception as exc:
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
