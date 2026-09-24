"""
Execution engines for the DineIQ Big Data pipeline.

  SparkEngine  - PySpark (local mode): explicit-schema CSV ingestion,
                 Spark SQL, partitioned Parquet, Spark MLlib.
  PandasEngine - documented fallback used when no JVM is available:
                 the same steps with pandas + pyarrow Parquet and
                 scikit-learn in place of MLlib. Every artifact it
                 writes is labelled with the engine that produced it.

The SRS deliverable is the Spark engine; the fallback exists so the
pipeline is runnable and verifiable on machines without a JVM.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd


def _java_home_ok() -> bool:
    if shutil.which("java"):
        return True
    jh = os.environ.get("JAVA_HOME")
    return bool(jh and (Path(jh) / "bin" / "java").exists())


def spark_available() -> bool:
    """True when both pyspark and a JVM are importable/executable."""
    try:
        import pyspark  # noqa: F401
    except Exception:
        return False
    return _java_home_ok()


class BaseEngine:
    kind = "base"
    display = "base"

    def __init__(self, work_root: Path):
        self.work_root = Path(work_root)

    def load_csv(self, name: str, path: Path):  # pragma: no cover - abstract
        raise NotImplementedError

    def write_parquet(self, df, path: Path, partition_by: str | None = None):
        raise NotImplementedError

    def read_parquet(self, path: Path):
        raise NotImplementedError

    def to_pandas(self, df) -> pd.DataFrame:
        raise NotImplementedError

    def label(self) -> dict:
        return {
            "engine": self.kind,
            "engine_detail": self.display,
            "work_root": str(self.work_root),
        }


class PandasEngine(BaseEngine):
    kind = "pandas"
    display = "pandas+pyarrow fallback (no JVM available)"

    def __init__(self, work_root: Path):
        super().__init__(work_root)
        self.dtypes = None
        # injected by the caller (spark_pipeline.schemas.PANDAS_DTYPES)
        self.dtype_map = {}

    def load_csv(self, name: str, path: Path) -> pd.DataFrame:
        dtypes = self.dtype_map.get(name)
        df = pd.read_csv(path, dtype=dtypes, low_memory=False)
        # Empty optional strings (promotion_id, email, ...) arrive as NaN;
        # normalize to "" so string logic matches the Spark engine.
        for col in df.columns:
            if df[col].dtype == object or str(df[col].dtype) == "string":
                df[col] = df[col].fillna("").astype(str)
        return df

    def write_parquet(self, df: pd.DataFrame, path: Path,
                      partition_by: str | None = None):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        if partition_by and partition_by in df.columns:
            import pyarrow as pa
            import pyarrow.parquet as pq

            table = pa.Table.from_pandas(df)
            pq.write_to_dataset(
                table,
                root_path=str(path),
                partition_cols=[partition_by],
            )
        else:
            df.to_parquet(path, index=False)

    def read_parquet(self, path: Path) -> pd.DataFrame:
        return pd.read_parquet(path)

    def to_pandas(self, df) -> pd.DataFrame:
        return df


class SparkEngine(BaseEngine):
    kind = "spark"
    display = "PySpark (local[*])"

    def __init__(self, work_root: Path, app_name: str = "DineIQBigData"):
        super().__init__(work_root)
        from pyspark.sql import SparkSession

        self.spark = (
            SparkSession.builder
            .master("local[*]")
            .appName(app_name)
            .config("spark.driver.memory", "4g")
            .config("spark.sql.execution.arrow.pyspark.enabled", "true")
            .getOrCreate()
        )
        self.spark.sparkContext.setLogLevel("ERROR")

    def load_csv(self, name: str, path: Path):
        from pyspark.sql.types import StructType

        ddl = None
        try:
            from .schemas import SPARK_DDL
            ddl = SPARK_DDL[name]
        except Exception:
            pass
        reader = self.spark.read.option("header", "true").option(
            "inferSchema", "false"
        )
        if ddl:
            reader = reader.schema(ddl)
        return reader.csv(str(path))

    def write_parquet(self, df, path: Path, partition_by: str | None = None):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        writer = df.coalesce(1).write.mode("overwrite")
        if partition_by and partition_by in df.columns:
            writer.partitionBy(partition_by).parquet(str(path))
        else:
            writer.parquet(str(path))

    def read_parquet(self, path: Path):
        return self.spark.read.parquet(str(path))

    def to_pandas(self, df) -> pd.DataFrame:
        return df.toPandas()

    def stop(self):
        try:
            self.spark.stop()
        except Exception:
            pass


def get_engine(prefer: str = "auto", work_root: Path | None = None) -> BaseEngine:
    """
    Returns the best available engine.

    prefer:
        "auto"   -> SparkEngine if usable, else PandasEngine
        "spark"  -> SparkEngine (raises if unusable)
        "pandas" -> PandasEngine
    """
    if work_root is None:
        work_root = Path(__file__).resolve().parents[1]

    if prefer == "spark" or (prefer == "auto" and spark_available()):
        try:
            return SparkEngine(work_root)
        except Exception as exc:  # pragma: no cover - depends on env
            if prefer == "spark":
                raise
            print(f"[engine] Spark unavailable ({exc}); falling back to pandas engine.")

    engine = PandasEngine(work_root)
    try:
        from .schemas import PANDAS_DTYPES
        engine.dtype_map = PANDAS_DTYPES
    except Exception:
        engine.dtype_map = {}
    return engine
