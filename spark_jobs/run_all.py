"""
DineIQ Big Data pipeline - full run.

  python -m Main.spark_pipeline.run_all [--engine auto|spark|pandas]
                                        [--processed-dir PATH]
                                        [--parquet-dir PATH]
                                        [--reports-dir PATH]
                                        [--evidence-dir PATH]
                                        [--models-dir PATH]
                                        [--python-models-dir PATH]
                                        [--cases-dir PATH]
                                        [--skip latency]

Steps:
  1. ingest_validate    explicit-schema ingestion + validation + Parquet
  2. spark_sql          Spark SQL joins / filters / aggregations
  3. mllib_models       train + evaluate 3 models, save versioned artifacts
  4. dual_pipeline_compare  compare vs Python pipeline on unseen cases
  5. ensemble_latency   NFR 5-second ensemble prediction test

Engine selection: 'spark' when PySpark + JVM are available, otherwise
the documented pandas/pyarrow fallback (labelled on every artifact).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]

from . import (dual_pipeline_compare, ensemble_latency, ingest_validate,  # noqa: E402
               mllib_models, spark_sql)
from .engines import get_engine  # noqa: E402
from .schemas import DATASETS  # noqa: E402


def _load_all(engine, processed_dir: Path) -> dict:
    processed_dir = Path(processed_dir)
    return {
        name: engine.load_csv(name, processed_dir / f"{name}.csv")
        for name in DATASETS
        if (processed_dir / f"{name}.csv").exists()
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--engine", default="auto",
                    choices=["auto", "spark", "pandas"])
    ap.add_argument("--processed-dir", default=str(BASE / "processed_data"))
    ap.add_argument("--parquet-dir", default=str(BASE / "parquet_data"))
    ap.add_argument("--reports-dir", default=str(BASE / "reports"))
    ap.add_argument("--evidence-dir", default=str(BASE / "reports"))
    ap.add_argument("--models-dir", default=str(BASE / "models"))
    ap.add_argument("--python-models-dir",
                    default=str(BASE / "models" / "python"))
    ap.add_argument("--cases-dir", default=str(BASE / "python_pipeline" /
                                               "dual_pipeline"))
    ap.add_argument("--skip", nargs="*", default=[],
                    choices=["ingest", "sql", "models", "compare",
                             "latency"])
    args = ap.parse_args(argv)

    work_root = Path(args.processed_dir).resolve().parents[2]
    engine = get_engine(prefer=args.engine, work_root=work_root)
    print(f"Selected engine: {engine.display}")
    print(f"Input (canonical): {args.processed_dir}")
    print()

    data = {}
    if "ingest" not in args.skip:
        _, data = ingest_validate.run(
            engine, args.processed_dir, args.parquet_dir,
            Path(args.reports_dir) / "spark_pipeline",
            evidence_dir=Path(args.evidence_dir))

    if "sql" not in args.skip:
        if not data:
            data = _load_all(engine, args.processed_dir)
        spark_sql.run(engine, data, Path(args.reports_dir) / "spark_pipeline",
                      Path(args.evidence_dir))

    if "models" not in args.skip:
        mllib_models.run(engine, args.processed_dir, args.models_dir,
                         Path(args.evidence_dir), args.cases_dir)

    if "compare" not in args.skip:
        dual_pipeline_compare.run(engine, args.models_dir, args.cases_dir,
                                  Path(args.evidence_dir) / "dual_pipeline")

    if "latency" not in args.skip:
        res = ensemble_latency.run(
            engine, args.models_dir, args.python_models_dir,
            args.cases_dir, Path(args.evidence_dir) / "latency")
        if not all(r["pass"] for r in res.values()):
            print("\nNFR FAILED - see latency report")
            return 2

    if engine.kind == "spark":  # pragma: no cover - spark path
        engine.stop()
    print("\nBig Data pipeline complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
