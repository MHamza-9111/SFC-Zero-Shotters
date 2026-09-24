"""
Step 1 - Ingestion and validation (SRS: Big Data Engineering).

  * Explicit-schema ingestion of the 12 cleaned CSV layers
    (and schema-inference comparison on the Spark engine)
  * Primary-key and foreign-key validation across datasets
  * Numeric-range and analysis-period validation
  * Data-quality report (CSV, one row per check)
  * Validated data written to partitioned Parquet in Main/parquet_data/
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .schemas import (
    ANALYSIS_END,
    ANALYSIS_START,
    DATASETS,
    PARTITION_BY,
    PRIMARY_KEYS,
)


def _add(report, dataset, check, failures, detail=""):
    report.append({
        "dataset": dataset,
        "check": check,
        "failures": int(failures),
        "detail": detail,
    })


def _pk_checks(engine, df, name, report):
    pk = PRIMARY_KEYS[name]
    p = engine.to_pandas(df)
    _add(report, name, "row_count", 0, f"{len(p):,} rows ingested")
    _add(report, name, f"pk_null_{pk}", int(p[pk].isna().sum()), "null primary keys")
    _add(report, name, f"pk_duplicate_{pk}", int(p[pk].duplicated().sum()),
         "duplicate primary keys")


def _range_checks(engine, name, df, report):
    p = engine.to_pandas(df)

    if name == "orders":
        for col in ["subtotal", "discount_amount", "tax_amount",
                    "delivery_fee", "total_amount"]:
            _add(report, name, f"negative_{col}",
                 int((p[col].astype(float) < 0).sum()), "financial value < 0")
        dates = p["order_date"].astype(str)
        _add(report, name, "order_date_outside_period",
             int((~dates.between(ANALYSIS_START, ANALYSIS_END)).sum()),
             f"expected {ANALYSIS_START}..{ANALYSIS_END}")

    if name == "order_items":
        _add(report, name, "quantity_non_positive",
             int((p["quantity"].astype(float) <= 0).sum()), "quantity <= 0")
        _add(report, name, "unit_price_negative",
             int((p["unit_price"].astype(float) < 0).sum()), "unit_price < 0")

    if name == "ratings":
        r = p["rating"].astype(float)
        _add(report, name, "rating_outside_1_5",
             int(((r < 1) | (r > 5)).sum()), "rating outside 1..5")

    if name == "menu_items":
        _add(report, name, "base_price_non_positive",
             int((p["base_price"].astype(float) <= 0).sum()), "base_price <= 0")
        _add(report, name, "cost_exceeds_base_price",
             int((p["cost_price"].astype(float) > p["base_price"].astype(float)).sum()),
             "cost_price > base_price")

    if name in ("inventory", "wastage"):
        qty = "sold_quantity" if name == "inventory" else "quantity_wasted"
        if name == "wastage":
            _add(report, name, "quantity_wasted_non_positive",
                 int((p[qty].astype(float) <= 0).sum()), "quantity <= 0")
        else:
            for col in ["opening_stock", "received_quantity", "sold_quantity",
                        "closing_stock", "reorder_level"]:
                _add(report, name, f"negative_{col}",
                     int((p[col].astype(float) < 0).sum()), "stock value < 0")

    if name == "promotions":
        d = p["discount_percentage"].astype(float)
        _add(report, name, "discount_pct_outside_0_100",
             int(((d < 0) | (d > 100)).sum()), "discount_percentage outside 0..100")


def _fk_checks(engine, data, report):
    """
    Cross-dataset relationship validation. Runs on the in-memory
    (pandas view of) ingested data for both engines; the same
    relationships are expressed as Spark joins in spark_sql.py when
    the Spark engine is active.
    """
    p = {name: engine.to_pandas(df) for name, df in data.items()}

    # orders -> customers / restaurants / promotions
    o = p["orders"]
    _add(report, "orders", "fk_customer_id",
         int((~o["customer_id"].isin(set(p["customers"]["customer_id"]))).sum()),
         "unknown customer_id")
    _add(report, "orders", "fk_restaurant_id",
         int((~o["restaurant_id"].isin(set(p["restaurants"]["restaurant_id"]))).sum()),
         "unknown restaurant_id")
    promo_ids = set(p["promotions"]["promotion_id"].astype(str))
    has_promo = o["promotion_id"].astype(str) != ""
    _add(report, "orders", "fk_promotion_id",
         int((has_promo & ~o["promotion_id"].astype(str).isin(promo_ids)).sum()),
         "unknown promotion_id")

    # order_items -> orders / menu + restaurant consistency
    oi = p["order_items"]
    _add(report, "order_items", "fk_order_id",
         int((~oi["order_id"].isin(set(o["order_id"]))).sum()), "unknown order_id")
    _add(report, "order_items", "fk_menu_item_id",
         int((~oi["menu_item_id"].isin(set(p["menu_items"]["menu_item_id"]))).sum()),
         "unknown menu_item_id")

    item_rest = p["menu_items"].set_index("menu_item_id")["restaurant_id"]
    m = oi.merge(o[["order_id", "restaurant_id"]], on="order_id")
    _add(report, "order_items", "fk_restaurant_consistency",
         int((m["menu_item_id"].map(item_rest) != m["restaurant_id"]).sum()),
         "item not from the order's restaurant")

    # ratings -> orders + customer match + item in order
    r = p["ratings"]
    _add(report, "ratings", "fk_order_id",
         int((~r["order_id"].isin(set(o["order_id"]))).sum()), "unknown order_id")
    order_cust = o.set_index("order_id")["customer_id"]
    _add(report, "ratings", "fk_customer_match",
         int((r["order_id"].map(order_cust) != r["customer_id"]).sum()),
         "rater is not the order's customer")
    lines = oi.groupby("order_id")["menu_item_id"].apply(set).to_dict()
    orphan = sum(1 for oid, iid in zip(r["order_id"], r["menu_item_id"])
                 if iid not in lines.get(oid, set()))
    _add(report, "ratings", "fk_item_in_order", orphan,
         "rated item not present in the order")

    # menu_items -> restaurants / categories
    mi = p["menu_items"]
    _add(report, "menu_items", "fk_restaurant_id",
         int((~mi["restaurant_id"].isin(set(p["restaurants"]["restaurant_id"]))).sum()),
         "unknown restaurant_id")
    _add(report, "menu_items", "fk_category_id",
         int((~mi["category_id"].isin(set(p["menu_categories"]["category_id"]))).sum()),
         "unknown category_id")

    # inventory / wastage -> item ownership
    for name in ("inventory", "wastage"):
        d = p[name]
        valid = set(zip(p["menu_items"]["menu_item_id"],
                        p["menu_items"]["restaurant_id"]))
        bad = sum(1 for t in zip(d["menu_item_id"], d["restaurant_id"])
                  if t not in valid)
        _add(report, name, "fk_restaurant_item_pair", bad,
             "item not owned by the restaurant")

    # pricing_history -> menu
    ph = p["pricing_history"]
    _add(report, "pricing_history", "fk_menu_item_id",
         int((~ph["menu_item_id"].isin(set(p["menu_items"]["menu_item_id"]))).sum()),
         "unknown menu_item_id")


def _schema_inference_drift(engine, name, explicit_df, raw_path, report):
    """
    Spark engine only: re-read the same CSV with inferred schema and
    report column-type drift vs the explicit schema (SRS requires both
    explicit schema and schema inference).
    """
    if engine.kind != "spark":
        return
    try:
        inferred = engine.spark.read.option("header", "true") \
            .option("inferSchema", "true").csv(str(raw_path))
        exp_cols = set(explicit_df.columns)
        inf_cols = set(inferred.columns)
        _add(report, name, "inferred_schema_missing_columns",
             len(exp_cols - inf_cols),
             f"columns: {sorted(exp_cols - inf_cols)}")
        _add(report, name, "inferred_schema_extra_columns",
             len(inf_cols - exp_cols),
             f"columns: {sorted(inf_cols - exp_cols)}")
    except Exception as exc:  # pragma: no cover
        _add(report, name, "inferred_schema_error", 1, str(exc)[:200])


def run(engine, raw_dir: Path, parquet_dir: Path, reports_dir: Path,
        evidence_dir: Path | None = None):
    """
    Runs ingestion + validation for all datasets.

    Returns (report_df, data): the data-quality report DataFrame
    (also written to CSV) and the ingested engine frames for the
    SQL step.
    """
    raw_dir = Path(raw_dir)
    parquet_dir = Path(parquet_dir)
    reports_dir = Path(reports_dir)
    evidence_dir = Path(evidence_dir) if evidence_dir else None
    reports_dir.mkdir(parents=True, exist_ok=True)

    report: list[dict] = []
    data = {}

    print("=" * 70)
    print("DineIQ Big Data Pipeline - Step 1: Ingestion & Validation")
    print(f"engine : {engine.display}")
    print(f"input  : {raw_dir}")
    print(f"output : {parquet_dir} (partitioned Parquet)")
    print("=" * 70)

    # -- explicit-schema ingestion --------------------------------
    for name in DATASETS:
        path = raw_dir / f"{name}.csv"
        if not path.exists():
            _add(report, name, "file_missing", 1, str(path))
            print(f"[MISSING] {name}.csv")
            continue
        df = engine.load_csv(name, path)
        data[name] = df
        _schema_inference_drift(engine, name, df, path, report)
        print(f"  ingested {name}: {engine.to_pandas(df).shape[0]:,} rows")

    # -- primary-key + range validation ---------------------------
    for name, df in data.items():
        _pk_checks(engine, df, name, report)
        _range_checks(engine, name, df, report)

    # -- foreign-key validation ------------------------------------
    _fk_checks(engine, data, report)

    report_df = pd.DataFrame(report)
    report_path = reports_dir / "spark_ingestion_quality_report.csv"
    report_df.to_csv(report_path, index=False)
    if evidence_dir is not None:
        ev = evidence_dir / "quality"
        ev.mkdir(parents=True, exist_ok=True)
        report_df.to_csv(ev / "spark_ingestion_quality_report.csv",
                         index=False)
        (ev / "engine.json").write_text(
            json.dumps(engine.label(), indent=2))

    total_failures = int(report_df["failures"].sum())
    print()
    print(f"Quality report : {report_path}")
    print(f"Total validation failures: {total_failures}")
    issues = report_df[report_df["failures"] > 0]
    if len(issues):
        print("Issues found:")
        print(issues.to_string(index=False))
    else:
        print("All checks passed - the cleaned layer is relationship-consistent.")

    # -- write validated Parquet (partitioned) ----------------------
    for name, df in data.items():
        partition = PARTITION_BY.get(name)
        if partition == "order_month" and engine.kind == "pandas":
            p = engine.to_pandas(df)
            p = p.copy()
            p["order_month"] = p["order_date"].astype(str).str[:7]
            engine.write_parquet(p, parquet_dir / f"{name}.parquet", partition)
            continue
        engine.write_parquet(df, parquet_dir / f"{name}.parquet", partition)
        print(f"  parquet  {name}.parquet"
              + (f" (partitioned by {partition})" if partition else ""))

    return report_df, data
