"""
Tests for the DineIQ Big Data pipeline (spark_jobs/).

Runs the real pipeline code on a small generated dataset in a temp
directory (engine: the pandas fallback when no JVM is available - the
same engine-selection logic production uses), with mini dual-pipeline
case sets built the same way as the committed full-scale ones.

Coverage:
  * schemas: DDL / pandas dtype / PK completeness
  * engine selection: auto falls back to pandas without a JVM
  * ingestion: explicit dtypes, quality report, zero FK failures on
    the cleaned layer, negative-value check actually detects bad rows,
    partitioned Parquet written
  * spark_sql: all 10 analysis outputs produced and consistent
  * models: 3 versioned artifacts with metadata + sane metrics
  * dual comparison: per-case files + agreement statistics
  * NFR: warm 100-record ensemble batch < 5000 ms
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
import yaml

BASE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "data_generator"))
sys.path.insert(0, str(BASE / "python_pipeline" / "cleaning"))

import clean_dineiq_data  # noqa: E402
from generate_dineiq_data import generate as generate_data  # noqa: E402

from spark_jobs import (dual_pipeline_compare, ensemble_latency,  # noqa: E402
                        ingest_validate, mllib_models, spark_sql)
from spark_jobs.engines import get_engine, spark_available  # noqa: E402
from spark_jobs.features import (  # noqa: E402
    CHURN_FEATURES,
    MENU_FEATURES,
    ORDER_FEATURES,
    build_churn_frame,
    build_menu_frame,
    build_order_frame,
    load_base_frames,
)
from spark_jobs.schemas import (  # noqa: E402
    DATASETS,
    PANDAS_DTYPES,
    PRIMARY_KEYS,
    SPARK_DDL,
)

CONFIG = {
    "seed": 7,
    "scale": {
        "customers": 1200,
        "restaurants": 8,
        "locations": 8,
        "categories": 10,
        "menu_items": 40,
        "orders": 3000,
        "order_items_min": 30000,
        "ratings": 3000,
        "wastage": 2000,
        "months": 12,
    },
    "quality": {
        "missing_value_rate": 0.01,
        "duplicate_rate": 0.005,
        "invalid_value_rate": 0.002,
        "outlier_rate": 0.003,
    },
    "time": {"start_date": "2025-01-01", "end_date": "2025-12-31"},
    "output": {"raw_dir": "x", "processed_dir": "y"},
}


# ---------------------------------------------------------------------------
# Session fixture: mini pipeline in a temp dir
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def mini_env(tmp_path_factory):
    root = tmp_path_factory.mktemp("dineiq-spark")
    config_path = root / "cfg.yaml"
    config_path.write_text(yaml.safe_dump(CONFIG))

    raw = root / "raw"
    generate_data(raw_dir=raw, config_path=config_path)

    processed = root / "processed"
    reports = root / "reports"
    clean_dineiq_data.main(
        raw_dir=raw,
        processed_dir=processed,
        reports_dir=reports,
        quarantine_dir=reports / "quarantine",
        config_path=config_path,
    )
    return {"root": root, "processed": processed, "reports": reports}


@pytest.fixture(scope="session")
def cases_dir(mini_env, tmp_path_factory):
    """Mini dual-pipeline case sets, same formats as the committed ones."""
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression

    out = tmp_path_factory.mktemp("mini-cases")
    frames = load_base_frames(mini_env["processed"])
    rng = np.random.default_rng(0)

    # -- order value (50 cases) --------------------------------------
    day_map = {d: i for i, d in enumerate(
        ["Monday", "Tuesday", "Wednesday", "Thursday",
         "Friday", "Saturday", "Sunday"])}
    of = build_order_frame(frames, day_map)
    idx = rng.choice(of.index, size=50, replace=False)
    train = of.loc[~of.index.isin(set(idx.tolist()))]
    thr = float(train["total_amount"].quantile(0.90))
    cases = of.loc[sorted(idx.tolist()),
                   ["order_id", "customer_id", "restaurant_id",
                    "order_date", "total_amount"] + ORDER_FEATURES].copy()
    cases["actual_high_value"] = (cases["total_amount"] >= thr).astype(int)
    cases.to_csv(out / "order_value_unseen_cases.csv", index=False)

    py = RandomForestClassifier(n_estimators=150, random_state=42, n_jobs=-1)
    py.fit(train[ORDER_FEATURES],
           (train["total_amount"] >= thr).astype(int))
    pred = py.predict(cases[ORDER_FEATURES])
    pd.DataFrame({"order_id": cases["order_id"],
                  "actual_high_value": cases["actual_high_value"],
                  "python_predicted_high_value": pred}
                 ).to_csv(out / "order_value_python_predictions.csv",
                          index=False)
    _save_py_artifact(out, "high_value_order", py, {"features": ORDER_FEATURES})

    # -- churn (30 cases) ----------------------------------------------
    cf = build_churn_frame(frames)
    cidx = rng.choice(cf.index, size=30, replace=False)
    ctrain = cf.loc[~cf.index.isin(set(cidx.tolist()))]
    ccases = cf.loc[sorted(cidx.tolist()),
                    ["customer_id", "recency_days", "total_orders",
                     "total_spend", "average_order_value",
                     "discount_dependency", "promo_dependency",
                     "top_category_share", "unique_categories",
                     "churned"]].copy()
    ccases = ccases.rename(columns={"churned": "actual_churn"})
    ccases.to_csv(out / "churn_unseen_cases.csv", index=False)

    py = LogisticRegression(max_iter=2000, random_state=42)
    py.fit(ctrain[CHURN_FEATURES].fillna(0), ctrain["churned"])
    X = _churn_X(ccases)
    pred = py.predict(X)
    proba = py.predict_proba(X)[:, 1]
    pd.DataFrame({"customer_id": ccases["customer_id"],
                  "actual_churn": ccases["actual_churn"],
                  "python_predicted_churn": pred,
                  "python_churn_probability": proba}
                 ).to_csv(out / "churn_python_predictions.csv", index=False)
    _save_py_artifact(out, "customer_churn", py, {"features": CHURN_FEATURES})

    # -- menu class (10 cases) -------------------------------------------
    mf = build_menu_frame(frames)
    midx = rng.choice(mf.index, size=min(10, len(mf)), replace=False)
    mtrain = mf.loc[~mf.index.isin(set(midx.tolist()))]
    mcases = mf.loc[sorted(midx.tolist()),
                    ["menu_item_id", "restaurant_id"] + MENU_FEATURES +
                    ["business_class"]].copy()
    # join item_name if available
    menu = frames["menu_items"]
    mcases = mcases.merge(
        menu[["menu_item_id", "item_name"]], on="menu_item_id",
        how="left", suffixes=("", "_m"))
    mcases["item_name"] = mcases.get("item_name_m", mcases["item_name"])
    mcases = mcases.rename(columns={"business_class": "actual_class",
                                    "item_name_m": "item_name"})
    mcases = mcases[["menu_item_id", "restaurant_id", "item_name"] +
                    MENU_FEATURES + ["actual_class"]]
    mcases.to_csv(out / "menu_class_unseen_cases.csv", index=False)

    py = RandomForestClassifier(n_estimators=150, random_state=42, n_jobs=-1)
    py.fit(mtrain[MENU_FEATURES], mtrain["business_class"])
    pred = py.predict(mcases[MENU_FEATURES])
    pd.DataFrame({"menu_item_id": mcases["menu_item_id"],
                  "restaurant_id": mcases["restaurant_id"],
                  "actual_class": mcases["actual_class"],
                  "python_predicted_class": pred}
                 ).to_csv(out / "menu_class_python_predictions.csv",
                          index=False)
    return out


def _churn_X(df: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "recency_days": df["recency_days"].astype(float),
        "f_log_orders": np.log1p(df["total_orders"].astype(float)),
        "f_log_spend": np.log1p(df["total_spend"].astype(float)),
        "average_order_value": df["average_order_value"].astype(float),
        "discount_dependency": df["discount_dependency"].astype(float),
        "promo_dependency": df["promo_dependency"].astype(float),
        "top_category_share": df["top_category_share"].astype(float),
        "unique_categories": df["unique_categories"].astype(float),
    }).fillna(0)


def _save_py_artifact(models_root, task, model, extra):
    import joblib
    vdir = Path(models_root) / task / "v1"
    vdir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, vdir / "model.joblib")
    meta = {"task": task, "version": 1, "engine": "python", **extra}
    (vdir / "metadata.json").write_text(json.dumps(meta, indent=2,
                                                   default=str))
    return vdir


@pytest.fixture(scope="session")
def pipeline_out(mini_env, cases_dir, tmp_path_factory):
    """Runs pipeline steps 1-5 on the mini dataset (pandas engine)."""
    root = tmp_path_factory.mktemp("spark-out")
    engine = get_engine(prefer="pandas", work_root=mini_env["root"])
    parquet = root / "parquet"
    reports = root / "reports"
    evidence = root / "evidence"
    models = root / "models"

    report, data = ingest_validate.run(engine, mini_env["processed"],
                                       parquet, reports / "spark_pipeline")
    summary_sql = spark_sql.run(engine, data, reports / "spark_pipeline",
                                evidence)
    model_summary = mllib_models.run(engine, mini_env["processed"], models,
                                     evidence, cases_dir)
    dual = dual_pipeline_compare.run(engine, models, cases_dir,
                                     evidence / "dual_pipeline")
    lat = ensemble_latency.run(engine, models, cases_dir, cases_dir,
                               evidence / "latency")
    return {"engine": engine, "root": root, "report": report, "data": data,
            "sql": summary_sql, "models": model_summary, "dual": dual,
            "latency": lat, "parquet": parquet, "evidence": evidence,
            "models_dir": models, "cases_dir": cases_dir}


# ---------------------------------------------------------------------------
# Static checks
# ---------------------------------------------------------------------------

def test_schemas_complete():
    assert len(DATASETS) == 12
    for name in DATASETS:
        assert SPARK_DDL[name], f"missing DDL for {name}"
        assert PANDAS_DTYPES[name], f"missing pandas dtypes for {name}"
        assert PRIMARY_KEYS[name] in PANDAS_DTYPES[name], \
            f"PK missing from dtypes for {name}"


def test_engine_selection_without_jvm():
    if spark_available():
        pytest.skip("JVM available - spark engine would be selected")
    engine = get_engine(prefer="auto")
    assert engine.kind == "pandas"
    assert "fallback" in engine.display


def test_engine_label_present(pipeline_out):
    assert pipeline_out["engine"].label()["engine"] == "pandas"


# ---------------------------------------------------------------------------
# Step 1 - ingestion & validation
# ---------------------------------------------------------------------------

def test_ingestion_report_clean(pipeline_out):
    report = pipeline_out["report"]
    fk = report[report["check"].str.startswith("fk_")]
    assert fk["failures"].sum() == 0, fk[fk["failures"] > 0]
    pk = report[report["check"].str.startswith("pk_")]
    assert pk["failures"].sum() == 0
    path = pipeline_out["root"] / "reports" / "spark_pipeline" / \
        "spark_ingestion_quality_report.csv"
    assert path.exists()


def test_negative_value_detection(mini_env):
    """The range checks must catch an intentionally bad row."""
    import shutil
    root = mini_env["root"]
    bad_dir = root / "bad_processed"
    shutil.copytree(mini_env["processed"], bad_dir)
    orders = pd.read_csv(bad_dir / "orders.csv", low_memory=False)
    orders.loc[0, "total_amount"] = -5.0
    orders.to_csv(bad_dir / "orders.csv", index=False)

    engine = get_engine(prefer="pandas", work_root=root)
    reports = root / "bad_reports"
    report, _ = ingest_validate.run(engine, bad_dir, root / "bad_parquet",
                                    reports / "spark_pipeline")
    hit = report[(report["dataset"] == "orders")
                 & (report["check"] == "negative_total_amount")]
    assert len(hit) == 1 and int(hit["failures"].iloc[0]) == 1


def test_parquet_written_and_partitioned(pipeline_out):
    pq = pipeline_out["parquet"]
    for name in DATASETS:
        target = pq / f"{name}.parquet"
        assert target.exists() or target.is_dir(), f"missing {name}.parquet"
    # orders is partitioned by order_month
    assert (pq / "orders.parquet").is_dir()
    parts = [d.name for d in (pq / "orders.parquet").iterdir()
             if d.name.startswith("order_month=")]
    assert len(parts) >= 12, parts
    df = pd.read_parquet(pq / "orders.parquet")
    assert "order_month" in df.columns and len(df) > 0
    # non-partitioned one is a single file
    assert (pq / "ratings.parquet").is_file()


# ---------------------------------------------------------------------------
# Step 2 - SQL analysis
# ---------------------------------------------------------------------------

def test_sql_outputs(pipeline_out):
    expected = ["orders_enriched", "order_item_revenue", "monthly_revenue",
                "category_revenue_share", "channel_monthly", "peak_hours",
                "top_item_combos", "promo_effectiveness", "location_ranking",
                "churn_candidates"]
    for name in expected:
        path = pipeline_out["evidence"] / "spark_sql" / f"{name}.csv"
        assert path.exists(), f"missing {name}"
        df = pd.read_csv(path)
        assert len(df) > 0, f"{name} is empty"

    cat = pd.read_csv(pipeline_out["evidence"] / "spark_sql" /
                      "category_revenue_share.csv")
    assert abs(cat["share"].sum() - 1.0) < 1e-6

    combos = pd.read_csv(pipeline_out["evidence"] / "spark_sql" /
                         "top_item_combos.csv")
    if len(combos):
        assert (combos["orders_with_combo"] >= 100).all()


def test_sql_summary_labels_engine(pipeline_out):
    meta = json.loads((pipeline_out["evidence"] / "spark_sql" /
                       "engine.json").read_text())
    assert meta["engine"] == "pandas"


# ---------------------------------------------------------------------------
# Step 3 - models
# ---------------------------------------------------------------------------

def test_three_versioned_models(pipeline_out):
    for task in ("high_value_order", "customer_churn",
                 "menu_business_class"):
        vdir = pipeline_out["models_dir"] / task / "v1"
        assert vdir.exists(), f"missing model dir {task}"
        assert (vdir / "model.joblib").exists()
        meta = json.loads((vdir / "metadata.json").read_text())
        assert meta["engine"]["engine"] == "pandas"
        assert meta["random_state"] == 42
        assert meta["features"]
    summary = pipeline_out["models"]
    assert len(summary) == 3
    for col in ("eval_accuracy",):
        assert summary[col].between(0.0, 1.0).all()


def test_models_exclude_committed_cases(mini_env, pipeline_out):
    meta = json.loads((pipeline_out["models_dir"] / "high_value_order" /
                       "v1" / "metadata.json").read_text())
    # mini dataset: all completed orders minus the 50 case orders
    frames = load_base_frames(mini_env["processed"])
    of = build_order_frame(
        frames, {d: i for i, d in enumerate(
            ["Monday", "Tuesday", "Wednesday", "Thursday",
             "Friday", "Saturday", "Sunday"])})
    assert meta["n_train"] == len(of) - 50


# ---------------------------------------------------------------------------
# Step 4 - dual comparison
# ---------------------------------------------------------------------------

def test_dual_comparison(pipeline_out):
    ev = pipeline_out["evidence"] / "dual_pipeline"
    for name in ("order_value_comparison", "churn_comparison",
                 "menu_class_comparison"):
        assert (ev / f"{name}.csv").exists()

    ov = pd.read_csv(ev / "order_value_comparison.csv")
    assert len(ov) == 50
    assert {"order_id", "actual_high_value",
            "python_predicted_high_value",
            "pipeline_predicted_high_value", "match",
            "pipeline_probability"} <= set(ov.columns)

    summary = pd.read_csv(ev / "dual_pipeline_summary.csv")
    assert len(summary) == 3
    # Same data + same features + same seed/hyperparameters on both
    # sides -> the mini pipelines must agree on (almost) all cases.
    for _, row in summary.iterrows():
        assert row["agreement_percentage"] >= 95.0, row


def test_disagreements_explained(pipeline_out):
    ev = pipeline_out["evidence"] / "dual_pipeline"
    for name in ("order_value_comparison", "churn_comparison",
                 "menu_class_comparison"):
        df = pd.read_csv(ev / f"{name}.csv")
        bad = df[~df["match"]]
        assert bad["explanation"].astype(str).str.len().gt(0).all() or \
            len(bad) == 0


# ---------------------------------------------------------------------------
# Step 5 - NFR latency
# ---------------------------------------------------------------------------

def test_nfr_latency_passes(pipeline_out):
    ev = pipeline_out["evidence"] / "latency"
    assert (ev / "ensemble_latency_report.csv").exists()
    report = pd.read_csv(ev / "ensemble_latency_report.csv")
    assert (report["pass"] == True).all()  # noqa: E712
    assert (report["total_ms_max"] < 5000).all()

    res = pipeline_out["latency"]["high_value_order"]
    # mini dataset carries 50 order cases, so the warm batch is
    # min(100, 50); the NFR protocol itself is the 100-record batch
    # exercised by the full-scale evidence (reports/latency/).
    assert res["batch_size"] >= 50
    assert res["pass"]
    # sample carries both model versions (versioned artifact NFR rule)
    assert res["python_model_version"] is not None
    assert res["pipeline_model_version"] is not None


def test_latency_report_labels_engine(pipeline_out):
    meta = json.loads((pipeline_out["evidence"] / "latency" /
                       "engine.json").read_text())
    assert meta["engine"] == "pandas"
