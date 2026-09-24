#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# DineIQ Big Data pipeline - Spark environment setup (production path).
#
# Sets up everything Main/spark_pipeline/ needs to run on the REAL
# Spark engine:
#   1. Python virtual environment + dependencies
#   2. JRE 17 (required by PySpark)
#   3. Smoke test proving the Spark engine is usable
#
# On machines without a JVM (or without network access to install one)
# the pipeline automatically falls back to the documented pandas/pyarrow
# engine (Main/spark_pipeline/engines.py); every artifact then carries
# an engine label recording which engine produced it.
#
# Usage:
#   bash Main/setup_spark.sh
# ---------------------------------------------------------------------------
set -euo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BASE"

echo "==> [1/3] Python environment"
python3 -m venv .venv
./.venv/bin/pip install --upgrade pip
./.venv/bin/pip install -r Main/requirements.txt

echo "==> [2/3] Java runtime (JRE 17)"
if command -v java >/dev/null 2>&1; then
    echo "    java already present: $(java -version 2>&1 | head -1)"
elif command -v apt-get >/dev/null 2>&1; then
    echo "    installing openjdk-17-jre-headless via apt..."
    (sudo apt-get update -y && sudo apt-get install -y openjdk-17-jre-headless) \
        || (apt-get update -y && apt-get install -y openjdk-17-jre-headless)
else
    echo "    WARNING: no java and no apt-get. Install a JRE 17 manually"
    echo "             (e.g. Temurin 17), then re-run this script."
fi
command -v java >/dev/null 2>&1 || {
    echo "ERROR: java still not available - the Spark engine cannot start."
    exit 1
}

echo "==> [3/3] Spark smoke test"
./.venv/bin/python - <<'PY'
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Main.spark_pipeline.engines import get_engine

engine = get_engine(prefer="spark")
df = engine.spark.range(1000)
n = df.count()
assert n == 1000, f"unexpected spark result: {n}"
print(f"Spark engine OK: local session counted {n} rows.")
engine.stop()
PY

echo
echo "Setup complete. Run the full pipeline with:"
echo "  ./.venv/bin/python -m Main.spark_pipeline.run_all --engine spark"
