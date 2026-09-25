"""
DineIQ Analytics - Dashboard Data Service.

Single integration layer between the executive dashboard UI and the real
pipeline outputs produced by the data science platform:

  1. Processed analytical layer (``processed_data/analytics/``) when the
     Python pipeline has been executed locally (rich, full-population).
  2. Committed Spark SQL evidence (``reports/spark_sql/`` and mirrors) -
     always present, used per documentation/API_CONTRACT.md section 4.
  3. Model artifacts (``models/``), dual-pipeline comparison evidence and
     data-quality / cleaning / quarantine reports.

Every widget payload computed here traces back to one of those real
artifacts - no fabricated numbers.  When a source is missing the service
reports an explicit ``data_status`` so the UI can render honest empty
states instead of decorative placeholders.
"""

from __future__ import annotations

import math
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[2]

CURRENCY = {"code": "PKR", "symbol": "Rs.", "locale": "en-PK"}

# Canonical channel / payment labels used across the platform.
DEFAULT_CHANNELS = [
    "Dine-in",
    "Takeaway",
    "Website/App",
    "Third-party Delivery",
]
PAYMENT_UNLABELED = "Unspecified"


def _clean(value):
    """Convert numpy/pandas scalars into JSON-safe Python natives."""
    if value is None:
        return None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def records(df: pd.DataFrame, limit: int | None = None) -> list[dict]:
    """DataFrame -> JSON-safe list of row dicts."""
    if df is None or df.empty:
        return []
    if limit is not None:
        df = df.head(limit)
    out = df.copy()
    out = out.loc[:, ~out.columns.duplicated()]
    out = out.where(pd.notna(out), None)
    return [{k: _clean(v) for k, v in row.items()} for row in out.to_dict("records")]


class DashboardService:
    """Loads pipeline artifacts once and computes widget aggregates."""

    def __init__(self, base_dir: Path | None = None):
        self.base = Path(base_dir) if base_dir else BASE_DIR
        self._lock = threading.RLock()
        self._loaded = False
        self._sources: dict[str, dict] = {}

        # Normalized frames -------------------------------------------------
        self.orders = pd.DataFrame()
        self.items = pd.DataFrame()
        self.monthly = pd.DataFrame()
        self.channel_monthly = pd.DataFrame()
        self.categories = pd.DataFrame()
        self.location_ranking = pd.DataFrame()
        self.peak_hours = pd.DataFrame()
        self.promos = pd.DataFrame()
        self.combos = pd.DataFrame()
        self.churn = pd.DataFrame()
        self.menu_classes = pd.DataFrame()
        self.recommendations = pd.DataFrame()
        self.daily_sales = pd.DataFrame()

        # Reference / report frames -----------------------------------------
        self.dual_summary = pd.DataFrame()
        self.eval_summary = pd.DataFrame()
        self.latency = pd.DataFrame()
        self.cleaning_summary = pd.DataFrame()
        self.quality_summary = pd.DataFrame()
        self.quarantine_counts: dict[str, int] = {}
        self.model_entries: list[dict] = []

        self._date_min: pd.Timestamp | None = None
        self._date_max: pd.Timestamp | None = None

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------
    def ensure_loaded(self, force: bool = False) -> None:
        with self._lock:
            if self._loaded and not force:
                return
            self._sources = {}
            self.orders = self._load_orders()
            self.items = self._load_items()
            self.monthly = self._load_csv(
                "monthly_revenue",
                ["reports/spark_sql/monthly_revenue.csv",
                 "reports/spark_execution/monthly_revenue.csv",
                 "reports/spark_pipeline/spark_sql/monthly_revenue.csv"],
                label="Monthly revenue by area",
            )
            self.channel_monthly = self._load_csv(
                "channel_monthly",
                ["reports/spark_sql/channel_monthly.csv",
                 "reports/spark_execution/channel_monthly.csv",
                 "reports/spark_pipeline/spark_sql/channel_monthly.csv"],
                label="Channel monthly trend",
            )
            self.categories = self._load_csv(
                "category_revenue",
                ["reports/spark_sql/category_revenue_share.csv",
                 "reports/spark_execution/category_revenue_share.csv",
                 "reports/spark_pipeline/spark_sql/category_revenue_share.csv"],
                label="Menu category revenue share",
            )
            self.location_ranking = self._load_csv(
                "location_ranking",
                ["reports/spark_sql/location_ranking.csv",
                 "reports/spark_execution/location_ranking.csv",
                 "reports/spark_pipeline/spark_sql/location_ranking.csv"],
                label="Location performance ranking",
            )
            self.peak_hours = self._load_csv(
                "peak_hours",
                ["reports/spark_sql/peak_hours.csv",
                 "reports/spark_execution/peak_hours.csv",
                 "reports/spark_pipeline/spark_sql/peak_hours.csv"],
                label="Peak ordering hours",
            )
            self.promos = self._load_csv(
                "promo_effectiveness",
                ["reports/spark_sql/promo_effectiveness.csv",
                 "reports/spark_execution/promo_effectiveness.csv",
                 "reports/spark_pipeline/spark_sql/promo_effectiveness.csv"],
                label="Promotion effectiveness",
            )
            self.combos = self._load_csv(
                "top_item_combos",
                ["reports/spark_sql/top_item_combos.csv",
                 "reports/spark_execution/top_item_combos.csv",
                 "reports/spark_pipeline/spark_sql/top_item_combos.csv"],
                label="Market basket combos",
            )
            self.churn = self._load_csv(
                "churn_candidates",
                ["processed_data/analytics/churn_risk.csv",
                 "reports/spark_sql/churn_candidates.csv",
                 "reports/spark_execution/churn_candidates.csv",
                 "reports/spark_pipeline/spark_sql/churn_candidates.csv"],
                label="Customer churn candidates",
            )
            self.recommendations = self._load_csv(
                "recommendations",
                ["processed_data/analytics/recommendations.csv"],
                label="Business recommendations",
            )
            self.daily_sales = self._load_csv(
                "daily_sales",
                ["processed_data/analytics/daily_sales.csv"],
                label="Daily sales (processed layer)",
            )
            self.menu_classes = self._load_menu_classes()
            self._postprocess_frames()
            self.dual_summary = self._load_csv(
                "dual_pipeline",
                ["reports/dual_pipeline/dual_pipeline_summary.csv"],
                label="Dual-pipeline agreement",
            )
            self.eval_summary = self._load_csv(
                "model_evaluation",
                ["reports/model_evaluation/model_evaluation_summary.csv",
                 "reports/models/model_evaluation_summary.csv"],
                label="Model evaluation",
            )
            self.latency = self._load_csv(
                "ensemble_latency",
                ["reports/latency/ensemble_latency_report.csv",
                 "reports/spark_execution/ensemble_latency_report.csv"],
                label="Ensemble latency (NFR)",
            )
            self.cleaning_summary = self._load_csv(
                "cleaning",
                ["reports/cleaning_summary.csv"],
                label="Cleaning & quarantine summary",
            )
            self.quality_summary = self._load_csv(
                "data_quality",
                ["reports/data_quality_summary.csv",
                 "reports/data_quality_report.csv"],
                label="Data quality summary",
            )
            self.quarantine_counts = self._count_quarantine()
            self.model_entries = self._load_model_entries()

            if not self.orders.empty:
                dates = pd.to_datetime(self.orders["order_date"], errors="coerce")
                self._date_min = dates.min()
                self._date_max = dates.max()
            else:
                self._date_min = self._date_max = None

            self._loaded = True

    # -- source helpers -------------------------------------------------

    def _note_source(self, key: str, label: str, path: Path | None,
                     rows: int, layer: str) -> None:
        self._sources[key] = {
            "key": key,
            "label": label,
            "file": str(path.relative_to(self.base)) if path else None,
            "rows": int(rows),
            "layer": layer,          # 'processed' | 'evidence' | 'models' | 'missing'
            "status": "available" if path else "missing",
        }

    def _find(self, candidates: list[str]) -> Path | None:
        for rel in candidates:
            p = self.base / rel
            if p.exists():
                return p
        return None

    def _load_csv(self, key: str, candidates: list[str], label: str) -> pd.DataFrame:
        path = self._find(candidates)
        if path is None:
            self._note_source(key, label, None, 0, "missing")
            return pd.DataFrame()
        try:
            df = pd.read_csv(path, low_memory=False)
        except Exception:
            self._note_source(key, label, None, 0, "missing")
            return pd.DataFrame()
        layer = "processed" if "processed_data" in str(path) else "evidence"
        self._note_source(key, label, path, len(df), layer)
        return df

    # -- normalized orders / items --------------------------------------

    def _load_orders(self) -> pd.DataFrame:
        """Load orders from the processed layer or the committed evidence."""
        processed = self._find(["processed_data/analytics/orders_processed.csv"])
        evidence = self._find([
            "reports/spark_sql/orders_enriched.csv",
            "reports/spark_execution/orders_enriched.csv",
            "reports/spark_pipeline/spark_sql/orders_enriched.csv",
        ])
        path = processed or evidence
        if path is None:
            self._note_source("orders", "Orders (enriched)", None, 0, "missing")
            return pd.DataFrame()

        df = pd.read_csv(path, low_memory=False)
        layer = "processed" if path == processed else "evidence"
        out = pd.DataFrame()
        out["order_id"] = pd.to_numeric(df.get("order_id"), errors="coerce").astype("Int64")
        out["customer_id"] = pd.to_numeric(df.get("customer_id"), errors="coerce").astype("Int64")
        out["restaurant_id"] = pd.to_numeric(df.get("restaurant_id"), errors="coerce").astype("Int64")
        out["location_id"] = pd.to_numeric(df.get("location_id"), errors="coerce").astype("Int64")
        out["city_area"] = df.get("city_area", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        out["restaurant_name"] = df.get("restaurant_name", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        out["restaurant_type"] = df.get("restaurant_type", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        out["order_date"] = pd.to_datetime(df.get("order_date"), errors="coerce")
        out["order_time"] = df.get("order_time", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        if "order_hour" in df.columns:
            out["order_hour"] = pd.to_numeric(df["order_hour"], errors="coerce").astype("Int64")
        else:
            hour = pd.to_datetime(out["order_time"], format="%H:%M:%S", errors="coerce").dt.hour
            out["order_hour"] = hour.astype("Int64")
        out["order_status"] = df.get("order_status", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        if "is_completed" in df.columns:
            out["is_completed"] = df["is_completed"].astype(bool)
        else:
            out["is_completed"] = out["order_status"].str.strip().str.lower() == "completed"
        out["order_channel"] = df.get("order_channel", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        payment = df.get("payment_method", pd.Series(index=df.index, dtype=object)).fillna("").astype(str).str.strip()
        out["payment_method"] = payment.replace({"": PAYMENT_UNLABELED, "nan": PAYMENT_UNLABELED})
        out["promotion_id"] = df.get("promotion_id", pd.Series(index=df.index, dtype=object)).apply(
            lambda x: "" if pd.isna(x) else str(x).split(".")[0]
        )
        out["promotion_name"] = df.get("promotion_name", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        out["promotion_type"] = df.get("promotion_type", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        out["total_amount"] = pd.to_numeric(df.get("total_amount"), errors="coerce").fillna(0.0)
        out["order_date_str"] = out["order_date"].dt.strftime("%Y-%m-%d")
        out = out.dropna(subset=["order_date"]).reset_index(drop=True)

        # Fill location / restaurant labels where the processed layer omits them.
        if "location_id" in df.columns and self.location_ranking is not None:
            pass  # enriched evidence already carries city_area
        self._note_source("orders", "Orders (enriched)", path, len(out), layer)
        return out

    def _load_items(self) -> pd.DataFrame:
        processed = self._find(["processed_data/analytics/order_items_integrated.csv"])
        evidence = self._find([
            "reports/spark_sql/order_item_revenue.csv",
            "reports/spark_execution/order_item_revenue.csv",
            "reports/spark_pipeline/spark_sql/order_item_revenue.csv",
        ])
        path = processed or evidence
        if path is None:
            self._note_source("order_items", "Order line revenue", None, 0, "missing")
            return pd.DataFrame()

        df = pd.read_csv(path, low_memory=False)
        layer = "processed" if path == processed else "evidence"
        out = pd.DataFrame()
        out["order_item_id"] = pd.to_numeric(df.get("order_item_id"), errors="coerce").astype("Int64")
        out["order_id"] = pd.to_numeric(df.get("order_id"), errors="coerce").astype("Int64")
        out["menu_item_id"] = pd.to_numeric(df.get("menu_item_id"), errors="coerce").astype("Int64")
        out["item_name"] = df.get("item_name", pd.Series(index=df.index, dtype=object)).fillna("Menu item").astype(str)
        out["category_id"] = pd.to_numeric(df.get("category_id"), errors="coerce").astype("Int64")
        out["restaurant_id"] = pd.to_numeric(df.get("restaurant_id"), errors="coerce").astype("Int64")
        out["quantity"] = pd.to_numeric(df.get("quantity"), errors="coerce").fillna(0).astype(int)
        out["unit_price"] = pd.to_numeric(df.get("unit_price"), errors="coerce").fillna(0.0)
        out["line_total"] = pd.to_numeric(df.get("line_total"), errors="coerce").fillna(0.0)
        out["base_price"] = pd.to_numeric(df.get("base_price"), errors="coerce")
        out["cost_price"] = pd.to_numeric(df.get("cost_price"), errors="coerce")
        if "net_revenue" in df.columns:
            out["net_revenue"] = pd.to_numeric(df["net_revenue"], errors="coerce").fillna(0.0)
        elif "gross_revenue" in df.columns:
            out["net_revenue"] = (pd.to_numeric(df["gross_revenue"], errors="coerce").fillna(0.0)
                                  - pd.to_numeric(df.get("discount_amount"), errors="coerce").fillna(0.0))
        else:
            out["net_revenue"] = out["line_total"]
        if "contribution" in df.columns:
            out["contribution"] = pd.to_numeric(df["contribution"], errors="coerce").fillna(0.0)
        elif "estimated_profit" in df.columns:
            out["contribution"] = pd.to_numeric(df["estimated_profit"], errors="coerce").fillna(0.0)
        else:
            out["contribution"] = 0.0
        out["order_date"] = pd.to_datetime(df.get("order_date"), errors="coerce")
        out["order_status"] = df.get("order_status", pd.Series(index=df.index, dtype=object)).fillna("").astype(str)
        if "is_completed" in df.columns:
            out["is_completed"] = df["is_completed"].astype(bool)
        else:
            out["is_completed"] = out["order_status"].str.strip().str.lower() == "completed"
        if "category_name" in df.columns:
            out["category_name"] = df["category_name"].fillna("").astype(str)
        else:
            out["category_name"] = ""
        if "city_area" in df.columns:
            out["city_area"] = df["city_area"].fillna("").astype(str)
        else:
            out["city_area"] = ""
        out = out.dropna(subset=["order_date"]).reset_index(drop=True)

        # Back-fill city_area via the restaurant -> area map from orders.
        if out["city_area"].eq("").all() and not self.orders.empty:
            rmap = (self.orders.dropna(subset=["restaurant_id"])
                    .drop_duplicates("restaurant_id")
                    .set_index("restaurant_id")["city_area"].to_dict())
            out["city_area"] = out["restaurant_id"].map(rmap).fillna("")
        if out["category_name"].eq("").all() and not self.categories.empty:
            cmap = dict(zip(self.categories["category_id"].astype(int),
                            self.categories["category_name"]))
            out["category_name"] = out["category_id"].map(cmap).fillna("")

        self._note_source("order_items", "Order line revenue", path, len(out), layer)
        return out

    def _postprocess_frames(self) -> None:
        """Cross-frame enrichment that needs all sources loaded first."""
        if self.items.empty:
            return
        # Category names (categories frame is loaded after items).
        if self.items["category_name"].eq("").any() and not self.categories.empty:
            cmap = dict(zip(
                pd.to_numeric(self.categories["category_id"], errors="coerce").astype("Int64"),
                self.categories["category_name"]))
            missing = self.items["category_name"].eq("")
            self.items.loc[missing, "category_name"] = \
                self.items.loc[missing, "category_id"].map(cmap).fillna("")
        # City areas via the restaurant -> area map from orders.
        if self.items["city_area"].eq("").any() and not self.orders.empty:
            rmap = self._restaurant_area_map()
            missing = self.items["city_area"].eq("")
            self.items.loc[missing, "city_area"] = \
                self.items.loc[missing, "restaurant_id"].map(rmap).fillna("")

    def _load_menu_classes(self) -> pd.DataFrame:
        """Menu business classes: processed analytics, else the dual-pipeline view."""
        processed = self._find([
            "processed_data/analytics/menu_business_classes.csv",
            "reports/spark_execution/menu_business_classes.csv",
        ])
        if processed is not None:
            df = pd.read_csv(processed, low_memory=False)
            self._note_source("menu_classes", "Menu business classes", processed,
                              len(df), "processed")
            return df

        comp = self._find(["reports/dual_pipeline/menu_class_comparison.csv"])
        if comp is not None:
            df = pd.read_csv(comp, low_memory=False)
            self._note_source("menu_classes", "Menu business classes (dual-pipeline)",
                              comp, len(df), "evidence")
            return df
        self._note_source("menu_classes", "Menu business classes", None, 0, "missing")
        return pd.DataFrame()

    def _count_quarantine(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        qdir = self.base / "reports" / "quarantine"
        if qdir.exists():
            for p in sorted(qdir.glob("*_quarantine.csv")):
                try:
                    counts[p.stem.replace("_quarantine", "")] = sum(1 for _ in p.open()) - 1
                except Exception:
                    counts[p.stem.replace("_quarantine", "")] = 0
        return counts

    def _load_model_entries(self) -> list[dict]:
        """Versioned model artifacts per API_CONTRACT section 2."""
        entries: list[dict] = []
        for pipeline_name, root_rel in (("big_data", "models"), ("python", "models/python")):
            root = self.base / root_rel
            if not root.exists():
                continue
            for task_dir in sorted(p for p in root.iterdir() if p.is_dir()):
                task = task_dir.name
                versions = sorted(
                    (d for d in task_dir.iterdir() if d.is_dir() and d.name.startswith("v")),
                    key=lambda d: int(d.name[1:]),
                )
                for vdir in versions:
                    meta_path = vdir / "metadata.json"
                    if not meta_path.exists():
                        continue
                    try:
                        import json
                        meta = json.loads(meta_path.read_text())
                    except Exception:
                        continue
                    entries.append({
                        "task": task,
                        "pipeline": pipeline_name,
                        "version": int(vdir.name[1:]),
                        "artifact": str(vdir.relative_to(self.base)).replace("\\", "/"),
                        "trained_at": meta.get("trained_at"),
                        "engine": (meta.get("engine") or {}).get("engine")
                        if isinstance(meta.get("engine"), dict) else meta.get("engine"),
                        "metrics": meta.get("metrics", {}),
                        "features": meta.get("features", []),
                        "type": meta.get("type"),
                        "threshold": meta.get("threshold"),
                        "label_rule": meta.get("label_rule"),
                    })
        # The active version is the highest v<n> per (task, pipeline).
        latest: dict[tuple[str, str], int] = {}
        for e in entries:
            key = (e["task"], e["pipeline"])
            latest[key] = max(latest.get(key, 0), e["version"])
        for e in entries:
            e["status"] = "active" if e["version"] == latest[(e["task"], e["pipeline"])] else "archived"
        entries.sort(key=lambda e: (e["task"], e["pipeline"], -e["version"]))
        return entries

    # ------------------------------------------------------------------
    # Shared filters
    # ------------------------------------------------------------------
    def _filter_orders(self, location_id=None, date_from=None, date_to=None,
                       completed_only: bool = False) -> pd.DataFrame:
        self.ensure_loaded()
        df = self.orders
        if df.empty:
            return df
        if location_id not in (None, "", "all", "ALL"):
            df = df[df["location_id"] == int(location_id)]
        if completed_only:
            df = df[df["is_completed"]]
        if date_from is not None:
            df = df[df["order_date"] >= pd.Timestamp(date_from)]
        if date_to is not None:
            df = df[df["order_date"] <= pd.Timestamp(date_to)]
        return df

    def _filter_items(self, location_id=None, date_from=None, date_to=None,
                      completed_only: bool = False) -> pd.DataFrame:
        self.ensure_loaded()
        df = self.items
        if df.empty:
            return df
        if completed_only:
            df = df[df["is_completed"]]
        if date_from is not None:
            df = df[df["order_date"] >= pd.Timestamp(date_from)]
        if date_to is not None:
            df = df[df["order_date"] <= pd.Timestamp(date_to)]
        if location_id not in (None, "", "all", "ALL"):
            area = self._area_of(location_id)
            if area:
                df = df[(df["city_area"] == area) | (df["city_area"] == "")]
                # city_area '' when the map is incomplete - fall back to restaurant map
                if df["city_area"].eq("").any():
                    rmap = self._restaurant_area_map()
                    extra = df["city_area"].eq("")
                    df.loc[extra, "city_area"] = df.loc[extra, "restaurant_id"].map(rmap).fillna("")
                    df = df[df["city_area"] == area]
        return df

    def _restaurant_area_map(self) -> dict:
        if self.orders.empty:
            return {}
        return (self.orders.dropna(subset=["restaurant_id"])
                .drop_duplicates("restaurant_id")
                .set_index("restaurant_id")["city_area"].to_dict())

    def _area_of(self, location_id) -> str | None:
        self.ensure_loaded()
        if self.location_ranking.empty:
            return None
        row = self.location_ranking[self.location_ranking["location_id"].astype(str) == str(location_id)]
        if row.empty:
            row = self.orders[self.orders["location_id"].astype(str) == str(location_id)]
            if row.empty:
                return None
            return str(row.iloc[0]["city_area"])
        return str(row.iloc[0]["city_area"])

    def default_date(self) -> pd.Timestamp | None:
        self.ensure_loaded()
        return self._date_max

    # ------------------------------------------------------------------
    # Meta
    # ------------------------------------------------------------------
    def meta(self) -> dict:
        self.ensure_loaded()
        locations = []
        if not self.location_ranking.empty:
            lr = self.location_ranking.copy()
            lr["location_id"] = pd.to_numeric(lr["location_id"], errors="coerce").astype("Int64")
            for row in lr.sort_values("city_area").to_dict("records"):
                locations.append({
                    "location_id": _clean(row.get("location_id")),
                    "city_area": row.get("city_area"),
                    "orders": _clean(row.get("orders")),
                    "revenue": _clean(row.get("revenue")),
                    "avg_order_value": _clean(row.get("avg_order_value")),
                })
        elif not self.orders.empty:
            grouped = (self.orders.groupby(["location_id", "city_area"], dropna=False)
                       .agg(orders=("order_id", "count"), revenue=("total_amount", "sum"))
                       .reset_index().sort_values("city_area"))
            locations = records(grouped)

        categories = []
        if not self.categories.empty:
            for row in self.categories.to_dict("records"):
                categories.append({
                    "category_id": _clean(row.get("category_id")),
                    "category_name": row.get("category_name"),
                    "revenue": _clean(row.get("revenue")),
                    "share": _clean(row.get("share")),
                })

        channels = sorted(set(self.orders["order_channel"].unique()) - {""}) if not self.orders.empty else list(DEFAULT_CHANNELS)
        payments = sorted(set(self.orders["payment_method"].unique())) if not self.orders.empty else []
        statuses = sorted(set(self.orders["order_status"].unique()) - {""}) if not self.orders.empty else []

        return {
            "currency": CURRENCY,
            "locations": locations,
            "categories": categories,
            "channels": channels or list(DEFAULT_CHANNELS),
            "payment_methods": payments,
            "statuses": statuses,
            "date_range": {
                "min": self._date_min.strftime("%Y-%m-%d") if self._date_min is not None else None,
                "max": self._date_max.strftime("%Y-%m-%d") if self._date_max is not None else None,
                "default": self._date_max.strftime("%Y-%m-%d") if self._date_max is not None else None,
            },
            "data_sources": list(self._sources.values()),
            "quarantine": self.quarantine_counts,
        }

    # ------------------------------------------------------------------
    # Overview payload
    # ------------------------------------------------------------------
    def overview(self, location_id=None, date_str: str | None = None) -> dict:
        self.ensure_loaded()
        as_of = pd.Timestamp(date_str) if date_str else self._date_max
        if as_of is None:
            return {"as_of": None, "data_status": "empty", "message": "No order data available"}

        day = self._filter_orders(location_id, as_of, as_of)
        prev_day = self._filter_orders(
            location_id, as_of - timedelta(days=1), as_of - timedelta(days=1))
        day_done = day[day["is_completed"]]
        prev_done = prev_day[prev_day["is_completed"]]

        def kpi(value, prev, support, fmt="number"):
            trend = None
            if prev not in (None, 0) and value is not None:
                trend = round((value - prev) / abs(prev) * 100.0, 2)
            elif prev == 0 and value not in (None, 0):
                trend = None
            return {
                "value": _clean(value),
                "prev": _clean(prev),
                "trend_pct": trend,
                "support": support,
                "format": fmt,
            }

        revenue = float(day_done["total_amount"].sum()) if len(day_done) else 0.0
        prev_revenue = float(prev_done["total_amount"].sum()) if len(prev_done) else 0.0
        orders_n = int(len(day))
        prev_orders_n = int(len(prev_day))
        aov = revenue / len(day_done) if len(day_done) else 0.0
        prev_aov = prev_revenue / len(prev_done) if len(prev_done) else 0.0
        customers_n = int(day["customer_id"].nunique()) if len(day) else 0
        prev_customers_n = int(prev_day["customer_id"].nunique()) if len(prev_day) else 0

        total_locations = int(len(self.location_ranking)) or int(self.orders["location_id"].nunique())
        active_locations = int(day["location_id"].nunique()) if len(day) else 0

        kpis = {
            "revenue": kpi(revenue, prev_revenue,
                           f"{len(day_done)} completed order(s)", "money"),
            "orders": kpi(orders_n, prev_orders_n,
                          f"{len(day) - len(day_done)} cancelled / other", "number"),
            "aov": kpi(aov, prev_aov, "per completed order", "money"),
            "customers": kpi(customers_n, prev_customers_n,
                             "distinct guests served", "number"),
            "locations_active": {
                "value": active_locations,
                "total": total_locations,
                "trend_pct": None,
                "support": f"{active_locations} of {total_locations} areas trading",
                "format": "fraction",
            },
        }

        # Service pulse: real order flow split by channel for the day.
        pulse_channels = []
        observed = {}
        if len(day):
            for name, count in day.groupby("order_channel").size().items():
                observed[name or "Unspecified"] = int(count)
        channel_names = list(dict.fromkeys(
            list(observed.keys())
            + [c for c in (self.orders["order_channel"].unique() if not self.orders.empty else [])
               if c]))
        total_orders = max(sum(observed.values()), 1)
        for name in channel_names[:4]:
            count = observed.get(name, 0)
            pulse_channels.append({
                "name": name or "Unspecified",
                "orders": count,
                "share": round(count / total_orders * 100.0, 1),
            })
        items_sold = int(self._filter_items(location_id, as_of, as_of)["quantity"].sum()) \
            if not self.items.empty else 0

        recent_orders = self._orders_payload(
            self._filter_orders(location_id).sort_values(
                ["order_date", "order_time"], ascending=False).head(6),
            include_items=True)

        transactions = self._transactions_payload(
            self._sort_orders(day, "recent").head(8))

        payment_rows = self._payment_rows(
            self._filter_orders(location_id, as_of, as_of, completed_only=True))
        top_dishes = self._dishes_rows(
            self._filter_items(location_id), limit=5)
        top_areas = self._areas_rows(location_id, limit=5)
        category_mix = [{
            "category_id": _clean(r["category_id"]),
            "name": r["category_name"],
            "revenue": _clean(r["revenue"]),
            "share": round(float(r["share"]) * 100.0, 2) if pd.notna(r["share"]) else None,
        } for _, r in self.categories.iterrows()] if not self.categories.empty else []

        # Monthly summary ("Sales This Month" widget) from the population aggregate.
        month_total = None
        month_trend = None
        month_label = as_of.strftime("%B %Y")
        if not self.monthly.empty:
            mkey = as_of.strftime("%Y-%m")
            month_df = self.monthly[self.monthly["month"].astype(str) == mkey]
            if location_id not in (None, "", "all", "ALL"):
                area = self._area_of(location_id)
                if area:
                    month_df = month_df[month_df["city_area"] == area]
            month_total = float(month_df["revenue"].sum()) if len(month_df) else 0.0
            months_sorted = sorted(self.monthly["month"].astype(str).unique())
            if mkey in months_sorted:
                idx = months_sorted.index(mkey)
                if idx > 0:
                    prev_key = months_sorted[idx - 1]
                    prev_df = self.monthly[self.monthly["month"].astype(str) == prev_key]
                    if location_id not in (None, "", "all", "ALL") and area:
                        prev_df = prev_df[prev_df["city_area"] == area]
                    prev_total = float(prev_df["revenue"].sum())
                    if prev_total:
                        month_trend = round((month_total - prev_total) / prev_total * 100.0, 2)

        return {
            "as_of": as_of.strftime("%Y-%m-%d"),
            "as_of_label": as_of.strftime("%a, %b %d, %Y"),
            "location": self._location_payload(location_id),
            "data_status": "ok" if orders_n or not self.orders.empty else "empty",
            "coverage_note": self._coverage_note(),
            "kpis": kpis,
            "service_pulse": {
                "channels": pulse_channels,
                "items_sold": items_sold,
                "orders": orders_n,
            },
            "recent_orders": recent_orders,
            "payment_methods": payment_rows,
            "recent_transactions": transactions,
            "top_dishes": top_dishes,
            "top_areas": top_areas,
            "category_mix": category_mix,
            "month_summary": {
                "label": month_label,
                "total": _clean(month_total),
                "trend_pct": month_trend,
                "source": "monthly revenue aggregate" if not self.monthly.empty else None,
            },
        }

    def _coverage_note(self) -> str:
        src = self._sources.get("orders", {})
        if src.get("layer") == "processed":
            return f"Full processed pipeline layer ({src.get('rows', 0):,} orders)"
        return ("Pipeline evidence sample - population aggregates shown where "
                "committed (monthly, categories, areas)")

    def _location_payload(self, location_id) -> dict | None:
        if location_id in (None, "", "all", "ALL"):
            return None
        if not self.location_ranking.empty:
            row = self.location_ranking[
                self.location_ranking["location_id"].astype(str) == str(location_id)]
            if not row.empty:
                r = row.iloc[0]
                return {
                    "location_id": _clean(r.get("location_id")),
                    "city_area": r.get("city_area"),
                    "orders": _clean(r.get("orders")),
                    "revenue": _clean(r.get("revenue")),
                    "avg_order_value": _clean(r.get("avg_order_value")),
                }
        return {"location_id": int(location_id), "city_area": self._area_of(location_id)}

    # ------------------------------------------------------------------
    # Revenue series
    # ------------------------------------------------------------------
    def revenue_series(self, range_key: str = "week", location_id=None,
                       date_str: str | None = None) -> dict:
        self.ensure_loaded()
        as_of = pd.Timestamp(date_str) if date_str else self._date_max
        if as_of is None:
            return {"range": range_key, "points": [], "total": 0, "prev_total": 0,
                    "trend_pct": None, "granularity": "day", "data_status": "empty"}

        range_key = (range_key or "week").lower()
        if range_key not in ("today", "week", "month", "year"):
            range_key = "week"

        if range_key == "year":
            return self._year_series(location_id, as_of)

        if range_key == "today":
            start, end, delta = as_of, as_of, timedelta(hours=1)
            labels = [f"{h:02d}:00" for h in range(24)]
            df = self._filter_orders(location_id, start, end, completed_only=True)
            keys = df["order_hour"].astype("Int64")
            points = []
            for h, label in enumerate(labels):
                sel = df[keys == h]
                points.append({
                    "label": label,
                    "value": round(float(sel["total_amount"].sum()), 2) if len(sel) else 0.0,
                    "orders": int(len(sel)),
                })
            prev_start = as_of - timedelta(days=1)
            prev_df = self._filter_orders(location_id, prev_start, prev_start, completed_only=True)
            prev_total = round(float(prev_df["total_amount"].sum()), 2)
            granularity = "hour"
            source = "order evidence (hourly)"
        else:
            days = 7 if range_key == "week" else 30
            end = as_of
            start = as_of - timedelta(days=days - 1)
            df = self._filter_orders(location_id, start, end, completed_only=True)
            points = []
            d = start
            while d <= end:
                sel = df[df["order_date"] == d]
                points.append({
                    "label": d.strftime("%d %b"),
                    "sublabel": d.strftime("%a"),
                    "value": round(float(sel["total_amount"].sum()), 2) if len(sel) else 0.0,
                    "orders": int(len(sel)),
                })
                d += timedelta(days=1)
            prev_end = start - timedelta(days=1)
            prev_start = prev_end - timedelta(days=days - 1)
            prev_df = self._filter_orders(location_id, prev_start, prev_end, completed_only=True)
            prev_total = round(float(prev_df["total_amount"].sum()), 2)
            granularity = "day"
            source = "order evidence (daily)"

        total = round(sum(p["value"] for p in points), 2)
        trend = None
        if prev_total:
            trend = round((total - prev_total) / prev_total * 100.0, 2)
        return {
            "range": range_key,
            "granularity": granularity,
            "points": points,
            "total": total,
            "prev_total": prev_total,
            "trend_pct": trend,
            "orders": int(sum(p["orders"] for p in points)),
            "source": source,
            "data_status": "ok",
        }

    def _year_series(self, location_id, as_of: pd.Timestamp) -> dict:
        """12-month series from the committed population aggregate."""
        if self.monthly.empty:
            return {"range": "year", "points": [], "total": 0, "prev_total": 0,
                    "trend_pct": None, "granularity": "month",
                    "source": "monthly revenue aggregate", "data_status": "empty"}
        df = self.monthly.copy()
        if location_id not in (None, "", "all", "ALL"):
            area = self._area_of(location_id)
            if area:
                df = df[df["city_area"] == area]
        grouped = df.groupby(df["month"].astype(str)).agg(
            value=("revenue", "sum"), orders=("orders", "sum")).reset_index()
        grouped = grouped.sort_values("month")
        points = [{
            "label": pd.Timestamp(f"{m}-01").strftime("%b %y"),
            "sublabel": pd.Timestamp(f"{m}-01").strftime("%B"),
            "value": round(float(v), 2),
            "orders": int(o),
        } for m, v, o in zip(grouped["month"], grouped["value"], grouped["orders"])]
        total = round(sum(p["value"] for p in points), 2)
        # Trend: last month vs the month before it.
        trend = None
        if len(points) >= 2 and points[-2]["value"]:
            trend = round((points[-1]["value"] - points[-2]["value"]) / points[-2]["value"] * 100.0, 2)
        return {
            "range": "year",
            "granularity": "month",
            "points": points,
            "total": total,
            "prev_total": round(total - points[-1]["value"], 2) if points else 0,
            "trend_pct": trend,
            "orders": int(sum(p["orders"] for p in points)),
            "source": "monthly revenue aggregate (population)",
            "data_status": "ok",
        }

    # ------------------------------------------------------------------
    # Orders
    # ------------------------------------------------------------------
    def _orders_payload(self, df: pd.DataFrame, include_items: bool = False) -> list[dict]:
        items_by_order: dict = {}
        if include_items and not self.items.empty:
            sub = self.items[self.items["order_id"].isin(df["order_id"].dropna().unique())] \
                if len(df) else self.items.iloc[0:0]
            for oid, grp in sub.groupby("order_id"):
                lines = []
                for _, r in grp.iterrows():
                    lines.append({
                        "item_name": r["item_name"],
                        "quantity": int(r["quantity"]),
                        "line_total": _clean(r["line_total"]),
                    })
                items_by_order[oid] = lines

        out = []
        for _, r in df.iterrows():
            oid = r["order_id"]
            lines = items_by_order.get(oid, [])
            out.append({
                "order_id": _clean(oid),
                "order_ref": f"DQ-{int(oid):04d}" if pd.notna(oid) else "DQ-????",
                "customer_id": _clean(r["customer_id"]),
                "city_area": r["city_area"],
                "restaurant_name": r["restaurant_name"],
                "restaurant_type": r["restaurant_type"],
                "order_date": r["order_date"].strftime("%Y-%m-%d"),
                "order_time": r["order_time"][:5] if r["order_time"] else None,
                "order_status": r["order_status"],
                "is_completed": bool(r["is_completed"]),
                "order_channel": r["order_channel"],
                "payment_method": r["payment_method"],
                "total_amount": _clean(r["total_amount"]),
                "promotion_name": r["promotion_name"] or None,
                "items": lines,
                "item_summary": self._item_summary(lines),
            })
        return out

    def _item_summary(self, lines: list[dict]) -> str | None:
        if not lines:
            return None
        parts = [f"{l['quantity']}x {l['item_name']}" for l in lines[:2]]
        if len(lines) > 2:
            parts.append(f"+{len(lines) - 2} more")
        return ", ".join(parts)

    def _sort_orders(self, df: pd.DataFrame, sort: str) -> pd.DataFrame:
        if sort == "amount_desc":
            return df.sort_values("total_amount", ascending=False)
        if sort == "amount_asc":
            return df.sort_values("total_amount", ascending=True)
        return df.sort_values(["order_date", "order_time"], ascending=False)

    @staticmethod
    def _order_mask(df: pd.DataFrame, q: str):
        """Order search: free text OR order reference (``DQ-0001`` / ``1397``)."""
        import re
        ql = q.strip().lower()
        mask = (
            df["city_area"].str.lower().str.contains(ql, na=False)
            | df["restaurant_name"].str.lower().str.contains(ql, na=False)
            | df["restaurant_type"].str.lower().str.contains(ql, na=False)
            | df["payment_method"].str.lower().str.contains(ql, na=False)
            | df["order_channel"].str.lower().str.contains(ql, na=False)
        )
        ref = re.sub(r"[^0-9]", "", ql)
        if ref and re.fullmatch(r"(dq[-_\s]*|#|no\.?\s*)?0*\d+", ql):
            mask = mask | (df["order_id"].astype("Int64") == int(ref))
        elif ref:
            mask = mask | df["order_id"].astype(str).str.contains(ql, na=False)
        return mask

    def orders_list(self, location_id=None, q: str = "", status: str = "",
                    channel: str = "", payment: str = "", date_from=None,
                    date_to=None, sort: str = "recent", page: int = 1,
                    page_size: int = 12) -> dict:
        self.ensure_loaded()
        df = self._filter_orders(location_id, date_from, date_to)
        if q:
            df = df[self._order_mask(df, q)]
        if status:
            df = df[df["order_status"].str.lower() == status.lower()]
        if channel:
            df = df[df["order_channel"].str.lower() == channel.lower()]
        if payment:
            df = df[df["payment_method"].str.lower() == payment.lower()]

        df = self._sort_orders(df, sort)

        total = int(len(df))
        page = max(int(page or 1), 1)
        page_size = max(min(int(page_size or 12), 100), 1)
        start = (page - 1) * page_size
        window = df.iloc[start:start + page_size]
        completed = df[df["is_completed"]]
        return {
            "items": self._orders_payload(window, include_items=True),
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max((total + page_size - 1) // page_size, 1),
            "stats": {
                "orders": total,
                "revenue": _clean(float(completed["total_amount"].sum())) if len(completed) else 0.0,
                "aov": _clean(float(completed["total_amount"].mean())) if len(completed) else 0.0,
            },
        }

    def order_detail(self, order_id) -> dict | None:
        self.ensure_loaded()
        df = self.orders[self.orders["order_id"].astype(str) == str(order_id)]
        if df.empty:
            return None
        payload = self._orders_payload(df, include_items=True)[0]
        lines = self.items[self.items["order_id"].astype(str) == str(order_id)] \
            if not self.items.empty else self.items.iloc[0:0]
        detail = []
        for _, r in lines.iterrows():
            detail.append({
                "order_item_id": _clean(r["order_item_id"]),
                "menu_item_id": _clean(r["menu_item_id"]),
                "item_name": r["item_name"],
                "category_name": r["category_name"] or None,
                "quantity": int(r["quantity"]),
                "unit_price": _clean(r["unit_price"]),
                "line_total": _clean(r["line_total"]),
                "net_revenue": _clean(r["net_revenue"]),
                "contribution": _clean(r["contribution"]),
            })
        payload["lines"] = detail
        payload["lines_note"] = (None if detail else
                                 "Line-level detail not present in the loaded data sample")
        return payload

    # ------------------------------------------------------------------
    # Dishes / menu
    # ------------------------------------------------------------------
    def _dishes_rows(self, items_df: pd.DataFrame, limit: int | None = None) -> list[dict]:
        if items_df is None or items_df.empty:
            return []
        grouped = (items_df.groupby(["menu_item_id", "item_name", "category_id", "category_name"], dropna=False)
                   .agg(units=("quantity", "sum"),
                        revenue=("net_revenue", "sum"),
                        contribution=("contribution", "sum"),
                        orders=("order_id", "nunique"))
                   .reset_index()
                   .sort_values("revenue", ascending=False))
        rows = []
        for rank, (_, r) in enumerate(grouped.iterrows(), start=1):
            rows.append({
                "rank": rank,
                "menu_item_id": _clean(r["menu_item_id"]),
                "item_name": r["item_name"],
                "category_id": _clean(r["category_id"]),
                "category_name": r["category_name"] or "Uncategorised",
                "units": int(r["units"]),
                "revenue": _clean(r["revenue"]),
                "contribution": _clean(r["contribution"]),
                "orders": int(r["orders"]),
            })
            if limit and len(rows) >= limit:
                break
        return rows

    def dishes(self, range_key: str = "all", location_id=None,
               date_str: str | None = None, limit: int | None = None,
               q: str = "") -> dict:
        self.ensure_loaded()
        as_of = pd.Timestamp(date_str) if date_str else self._date_max
        date_from = date_to = None
        range_key = (range_key or "all").lower()
        if as_of is not None:
            if range_key == "today":
                date_from = date_to = as_of
            elif range_key == "week":
                date_from, date_to = as_of - timedelta(days=6), as_of
            elif range_key == "month":
                date_from, date_to = as_of - timedelta(days=29), as_of
        df = self._filter_items(location_id, date_from, date_to)
        rows = self._dishes_rows(df, limit=None)
        if q:
            ql = q.lower()
            rows = [r for r in rows if ql in r["item_name"].lower()
                    or ql in (r["category_name"] or "").lower()]
        total = len(rows)
        if limit:
            rows = rows[:limit]
        return {"items": rows, "total": total, "range": range_key,
                "data_status": "ok" if total else "empty",
                "source": self._sources.get("order_items", {}).get("layer")}

    def menu_intelligence(self) -> dict:
        self.ensure_loaded()
        classes = []
        if not self.menu_classes.empty:
            df = self.menu_classes.copy()
            if "python_predicted_class" in df.columns and "predicted_class" not in df.columns:
                df = df.rename(columns={"python_predicted_class": "predicted_class"})
            if "predicted_class" not in df.columns and "actual_class" in df.columns:
                df["predicted_class"] = df.get("pipeline_predicted_class", df["actual_class"])
            if "match" not in df.columns and "actual_class" in df.columns:
                df["match"] = df["actual_class"].astype(str) == df["predicted_class"].astype(str)
            cols = [c for c in [
                "menu_item_id", "restaurant_id", "item_name",
                "units_sold", "revenue", "estimated_profit",
                "profit_margin_percentage", "average_rating", "wastage_ratio",
                "actual_class", "predicted_class", "pipeline_predicted_class",
                "match", "explanation",
            ] if c in df.columns]
            classes = records(df[cols])

        combos = []
        if not self.combos.empty:
            for _, r in self.combos.iterrows():
                combos.append({
                    "item_a": _clean(r.get("item_a")),
                    "item_a_name": r.get("item_a_name"),
                    "item_b": _clean(r.get("item_b")),
                    "item_b_name": r.get("item_b_name"),
                    "restaurant_id": _clean(r.get("restaurant_id")),
                    "orders_with_combo": _clean(r.get("orders_with_combo")),
                    "lift": _clean(r.get("lift")),
                    "chain_lift": _clean(r.get("chain_lift")),
                })
        return {
            "classes": classes,
            "combos": combos,
            "categories": self.meta()["categories"],
            "data_status": "ok" if (classes or combos) else "empty",
            "class_source": self._sources.get("menu_classes", {}),
        }

    def inventory_intelligence(self) -> dict:
        self.ensure_loaded()
        wastage_items = []
        if not self.menu_classes.empty and "wastage_ratio" in self.menu_classes.columns:
            df = self.menu_classes.dropna(subset=["wastage_ratio"]).copy()
            name_col = "item_name" if "item_name" in df.columns else None
            cols = [c for c in [name_col, "menu_item_id", "restaurant_id",
                                "wastage_ratio", "units_sold", "revenue",
                                "average_rating", "actual_class"] if c]
            wastage_items = records(df[cols].sort_values("wastage_ratio", ascending=False))
        slow = self._load_csv(
            "slow_moving", ["processed_data/analytics/slow_moving_items.csv"],
            label="Slow-moving items (processed)")
        risk = self._load_csv(
            "wastage_risk", ["processed_data/analytics/wastage_risk_analysis.csv"],
            label="Wastage risk analysis (processed)")
        return {
            "wastage_items": wastage_items,
            "slow_moving": records(slow) if not slow.empty else [],
            "wastage_risk": records(risk) if not risk.empty else [],
            "charts": [
                {"file": "13_wastage_risk.png", "title": "Wastage Risk & Cost Analysis"},
                {"file": "15_slow_moving_items.png", "title": "Slow-Moving Items (first 60d vs last 60d)"},
            ],
            "data_status": "ok" if wastage_items is not None else "empty",
        }

    # ------------------------------------------------------------------
    # Payments & transactions
    # ------------------------------------------------------------------
    def _payment_rows(self, df: pd.DataFrame) -> list[dict]:
        rows = []
        if df is None or df.empty:
            return rows
        total = float(df["total_amount"].sum()) or 1.0
        grouped = (df.groupby("payment_method")
                   .agg(orders=("order_id", "count"), total=("total_amount", "sum"))
                   .reset_index().sort_values("total", ascending=False))
        for _, r in grouped.iterrows():
            rows.append({
                "method": r["payment_method"] or PAYMENT_UNLABELED,
                "orders": int(r["orders"]),
                "total": round(float(r["total"]), 2),
                "share": round(float(r["total"]) / total * 100.0, 1),
            })
        return rows

    def payments_summary(self, location_id=None, range_key: str = "month",
                         date_str: str | None = None) -> dict:
        self.ensure_loaded()
        as_of = pd.Timestamp(date_str) if date_str else self._date_max
        date_from = date_to = None
        range_key = (range_key or "month").lower()
        if as_of is not None:
            if range_key == "today":
                date_from = date_to = as_of
            elif range_key == "week":
                date_from, date_to = as_of - timedelta(days=6), as_of
            elif range_key == "month":
                date_from, date_to = as_of - timedelta(days=29), as_of
            elif range_key == "year":
                date_from, date_to = self._date_min, self._date_max
        df = self._filter_orders(location_id, date_from, date_to, completed_only=True)
        methods = self._payment_rows(df)

        # Monthly mix per payment method (from the order sample).
        by_month = []
        if not df.empty:
            tmp = df.copy()
            tmp["month"] = tmp["order_date"].dt.strftime("%Y-%m")
            pivot = (tmp.groupby(["month", "payment_method"])["total_amount"]
                     .sum().reset_index())
            for month, grp in pivot.groupby("month"):
                entry = {"month": month}
                for _, r in grp.iterrows():
                    entry[r["payment_method"]] = round(float(r["total_amount"]), 2)
                by_month.append(entry)

        return {
            "methods": methods,
            "total": round(float(df["total_amount"].sum()), 2) if len(df) else 0.0,
            "orders": int(len(df)),
            "by_month": by_month,
            "range": range_key,
            "data_status": "ok" if methods else "empty",
        }

    def _transactions_payload(self, df: pd.DataFrame) -> list[dict]:
        out = []
        if df is None or df.empty:
            return out
        for _, r in df.iterrows():
            method = r["payment_method"] or PAYMENT_UNLABELED
            out.append({
                "order_id": _clean(r["order_id"]),
                "order_ref": f"DQ-{int(r['order_id']):04d}" if pd.notna(r["order_id"]) else "DQ-????",
                "type": f"{method} Payment",
                "method": method,
                "amount": _clean(r["total_amount"]),
                "date": r["order_date"].strftime("%Y-%m-%d"),
                "time": r["order_time"][:5] if r["order_time"] else None,
                "status": "Paid" if r["is_completed"] else ("Cancelled" if r["order_status"] else "Unknown"),
                "order_status": r["order_status"],
                "channel": r["order_channel"],
                "city_area": r["city_area"],
            })
        return out

    def transactions(self, location_id=None, method: str = "", status: str = "",
                     q: str = "", page: int = 1, page_size: int = 12,
                     range_key: str = "all") -> dict:
        self.ensure_loaded()
        date_from = date_to = None
        as_of = self._date_max
        range_key = (range_key or "all").lower()
        if as_of is not None:
            if range_key == "today":
                date_from = date_to = as_of
            elif range_key == "week":
                date_from, date_to = as_of - timedelta(days=6), as_of
            elif range_key == "month":
                date_from, date_to = as_of - timedelta(days=29), as_of
        df = self._filter_orders(location_id, date_from, date_to).sort_values(
            ["order_date", "order_time"], ascending=False)
        if method:
            df = df[df["payment_method"].str.lower() == method.lower()]
        if status:
            want = status.lower()
            if want == "paid":
                df = df[df["is_completed"]]
            elif want == "cancelled":
                df = df[~df["is_completed"]]
        if q:
            df = df[self._order_mask(df, q) | df["payment_method"].str.lower().str.contains(q.strip().lower(), na=False)]
        total = int(len(df))
        page = max(int(page or 1), 1)
        page_size = max(min(int(page_size or 12), 100), 1)
        start = (page - 1) * page_size
        return {
            "items": self._transactions_payload(df.iloc[start:start + page_size]),
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max((total + page_size - 1) // page_size, 1),
            "methods": sorted(df["payment_method"].unique()) if total else [],
            "total_amount": round(float(df["total_amount"].sum()), 2) if total else 0.0,
        }

    # ------------------------------------------------------------------
    # Areas / locations
    # ------------------------------------------------------------------
    def _areas_rows(self, location_id=None, limit: int = 5) -> list[dict]:
        self.ensure_loaded()
        if self.location_ranking.empty:
            return []
        df = self.location_ranking.copy()
        if location_id not in (None, "", "all", "ALL"):
            df = df[df["location_id"].astype(str) == str(location_id)]
        df = df.sort_values("revenue", ascending=False)
        rows = []
        for rank, (_, r) in enumerate(df.iterrows(), start=1):
            rows.append({
                "rank": rank,
                "location_id": _clean(r.get("location_id")),
                "city_area": r.get("city_area"),
                "orders": _clean(r.get("orders")),
                "revenue": _clean(r.get("revenue")),
                "avg_order_value": _clean(r.get("avg_order_value")),
            })
            if limit and len(rows) >= limit:
                break
        return rows

    def locations_summary(self) -> dict:
        self.ensure_loaded()
        rows = self._areas_rows(None, limit=None)
        monthly_series = {}
        months = []
        if not self.monthly.empty:
            months = sorted(self.monthly["month"].astype(str).unique())
            for area, grp in self.monthly.groupby("city_area"):
                by_month = dict(zip(grp["month"].astype(str), grp["revenue"].astype(float)))
                monthly_series[area] = [round(by_month.get(m, 0.0), 2) for m in months]
        restaurant_types = []
        if not self.orders.empty:
            rt = (self.orders.groupby(["restaurant_type"])
                  .agg(orders=("order_id", "count"), revenue=("total_amount", "sum"))
                  .reset_index().sort_values("revenue", ascending=False))
            restaurant_types = records(rt)
        peak = records(self.peak_hours) if not self.peak_hours.empty else []
        return {
            "rows": rows,
            "monthly": {"months": months, "series": monthly_series},
            "restaurant_types": restaurant_types,
            "peak_hours": peak,
            "data_status": "ok" if rows else "empty",
        }

    def peak_hours(self) -> dict:
        self.ensure_loaded()
        return {"rows": records(self.peak_hours) if not self.peak_hours.empty else [],
                "data_status": "ok" if not self.peak_hours.empty else "empty"}

    # ------------------------------------------------------------------
    # Customers / promotions
    # ------------------------------------------------------------------
    def customers_page(self, q: str = "", risk: str = "", page: int = 1,
                       page_size: int = 12) -> dict:
        self.ensure_loaded()
        if self.churn.empty:
            return {"items": [], "total": 0, "page": 1, "pages": 1,
                    "stats": {}, "data_status": "empty"}
        df = self.churn.copy()
        df["days_since"] = pd.to_numeric(df.get("days_since", df.get("recency_days")), errors="coerce")
        df["total_orders"] = pd.to_numeric(df.get("total_orders"), errors="coerce").fillna(0)
        df["customer_id"] = pd.to_numeric(df.get("customer_id"), errors="coerce").astype("Int64")

        def tier(days):
            if pd.isna(days):
                return "unknown"
            if days >= 180:
                return "high"
            if days >= 90:
                return "medium"
            return "low"

        df["risk"] = df["days_since"].apply(tier)
        if risk:
            df = df[df["risk"] == risk.lower()]
        if q:
            ql = q.strip().lower()
            df = df[df["customer_id"].astype(str).str.contains(ql, na=False)
                    | df.get("preferred_channel", pd.Series("", index=df.index))
                    .astype(str).str.lower().str.contains(ql, na=False)]
        df = df.sort_values("days_since", ascending=False, na_position="last")
        total = int(len(df))
        page = max(int(page or 1), 1)
        page_size = max(min(int(page_size or 12), 100), 1)
        start = (page - 1) * page_size
        window = df.iloc[start:start + page_size]

        items = []
        for _, r in window.iterrows():
            items.append({
                "customer_id": _clean(r["customer_id"]),
                "last_order_date": _clean(r.get("last_order_date")),
                "days_since": _clean(r["days_since"]),
                "preferred_channel": r.get("preferred_channel"),
                "total_orders": _clean(r["total_orders"]),
                "risk": r["risk"],
            })
        all_risk = df["risk"] if risk else self.churn.copy()
        if risk:
            pass
        stats = {
            "total": total,
            "high": int((self.churn.assign(
                risk=self.churn.get("days_since", self.churn.get("recency_days"))
                .apply(tier))["risk"] == "high").sum()),
            "medium": int((self.churn.assign(
                risk=self.churn.get("days_since", self.churn.get("recency_days"))
                .apply(tier))["risk"] == "medium").sum()),
            "avg_days": _clean(float(pd.to_numeric(
                self.churn.get("days_since", self.churn.get("recency_days")),
                errors="coerce").mean())),
        }
        return {"items": items, "total": total, "page": page,
                "page_size": page_size,
                "pages": max((total + page_size - 1) // page_size, 1),
                "stats": stats, "data_status": "ok"}

    def promotions_page(self, trap_filter: str = "") -> dict:
        self.ensure_loaded()
        if self.promos.empty:
            return {"items": [], "stats": {}, "data_status": "empty"}
        df = self.promos.copy()
        df["promotion_trap"] = df["promotion_trap"].astype(str).str.lower().isin(["true", "1", "yes"])

        def col_sum(*names):
            for name in names:
                if name in df.columns:
                    return _clean(pd.to_numeric(df[name], errors="coerce").sum())
            return None

        def col_mean(*names):
            for name in names:
                if name in df.columns:
                    return _clean(pd.to_numeric(df[name], errors="coerce").mean())
            return None

        stats = {
            "promotions": int(len(df)),
            "traps": int(df["promotion_trap"].sum()),
            "avg_lift": col_mean("aov_lift_percentage"),
            "total_incremental": col_sum("incremental_revenue_estimate"),
            "total_discount_spend": col_sum("promo_discount_spend", "promo_discount_spent"),
        }
        if trap_filter == "traps":
            df = df[df["promotion_trap"]]
        elif trap_filter == "healthy":
            df = df[~df["promotion_trap"]]
        df = df.sort_values("aov_lift_percentage", ascending=False)
        return {"items": records(df), "stats": stats, "data_status": "ok"}

    def recommendations(self) -> dict:
        self.ensure_loaded()
        if self.recommendations.empty:
            # Fall back to trap-based guidance derived from promo evidence.
            traps = self.promos_page("traps")["items"][:3] if not self.promos.empty else []
            return {"items": [], "derived_from_traps": traps, "data_status": "empty"}
        return {"items": records(self.recommendations), "data_status": "ok"}

    # ------------------------------------------------------------------
    # Models / pipeline status / reports
    # ------------------------------------------------------------------
    def models_info(self) -> dict:
        self.ensure_loaded()
        tasks = {}
        for e in self.model_entries:
            tasks.setdefault(e["task"], set()).add(e["type"] or
                                                  ("multiclass" if e["task"] == "menu_business_class" else "binary"))
        return {
            "models": self.model_entries,
            "tasks": [{"task": t, "type": sorted(types)[0]} for t, types in sorted(tasks.items())],
            "data_status": "ok" if self.model_entries else "empty",
        }

    def pipeline_status(self) -> dict:
        self.ensure_loaded()
        steps = []
        steps.append({
            "name": "Data generation & quality",
            "status": "ok" if not self.quality_summary.empty else "unknown",
            "detail": f"{len(self.quality_summary)} datasets profiled" if not self.quality_summary.empty else "No quality summary found",
        })
        quarantined = sum(self.quarantine_counts.values())
        steps.append({
            "name": "Cleaning & quarantine",
            "status": "ok" if not self.cleaning_summary.empty else "unknown",
            "detail": f"{quarantined} rows quarantined across {len(self.quarantine_counts)} datasets",
        })
        steps.append({
            "name": "Spark SQL analytics",
            "status": "ok" if not self.monthly.empty else "unknown",
            "detail": f"{self._sources.get('monthly_revenue', {}).get('rows', 0)} monthly aggregates",
        })
        steps.append({
            "name": "Model training (MLlib + Scikit-Learn)",
            "status": "ok" if self.model_entries else "unknown",
            "detail": f"{len(self.model_entries)} versioned artifacts",
        })
        nfr = None
        if not self.latency.empty:
            nfr = {
                "pass": bool(self.latency["pass"].astype(str).str.lower().isin(["true", "1", "yes"]).all()),
                "limit_ms": _clean(pd.to_numeric(self.latency["nfr_limit_ms"], errors="coerce").max()),
                "max_ms": _clean(pd.to_numeric(self.latency["total_ms_max"], errors="coerce").max()),
                "rows": records(self.latency),
            }
            steps.append({
                "name": "Ensemble serving (NFR < 5s)",
                "status": "ok" if nfr["pass"] else "fail",
                "detail": f"max {nfr['max_ms']} ms vs {nfr['limit_ms']} ms budget",
            })
        dual = None
        if not self.dual_summary.empty:
            dual = {
                "agreement": _clean(pd.to_numeric(
                    self.dual_summary["agreement_percentage"], errors="coerce").mean()),
                "cases": int(pd.to_numeric(self.dual_summary["cases"], errors="coerce").sum()),
                "rows": records(self.dual_summary),
            }
            steps.append({
                "name": "Dual-pipeline comparison",
                "status": "ok",
                "detail": f"{dual['agreement']}% agreement over {dual['cases']} unseen cases",
            })
        return {
            "steps": steps,
            "ensemble": nfr,
            "dual_pipeline": dual,
            "evaluation": records(self.eval_summary) if not self.eval_summary.empty else [],
            "last_processing_run": self._latest_processing_run(),
            "data_status": "ok",
        }

    def _latest_processing_run(self) -> str | None:
        p = self.base / "reports" / "processing_summary.csv"
        if not p.exists():
            return None
        try:
            df = pd.read_csv(p)
            if "processing_run" in df.columns and len(df):
                return str(df["processing_run"].iloc[-1])
        except Exception:
            return None
        return None

    def reports_catalog(self) -> dict:
        self.ensure_loaded()
        charts_dir = self.base / "reports" / "charts"
        catalog = [
            ("Executive Analytics", [
                ("01_data_quality.png", "01. Data Ingestion Quality Assessment"),
                ("02_daily_forecast.png", "02. Daily Revenue Forecast vs Actual"),
                ("03_monthly_revenue_location.png", "03. Monthly Revenue by Location"),
                ("04_category_revenue_share.png", "04. Menu Category Revenue Share"),
                ("05_peak_hours.png", "05. Peak Hours & Day-of-Week Patterns"),
                ("06_channel_monthly.png", "06. Channel Monthly Performance"),
                ("07_top_item_combos.png", "07. Top Item Combos & Market Basket Lift"),
                ("08_promo_effectiveness.png", "08. Promotion Effectiveness & Traps"),
                ("09_location_ranking.png", "09. Location Performance Ranking"),
            ]),
            ("Restaurant Intelligence Suite", [
                ("10_rfm_segments.png", "10. RFM Customer Segments Profile"),
                ("11_menu_business_classes.png", "11. Menu Business Classes (SRS Step 10)"),
                ("12_churn_risk.png", "12. Customer Churn Risk Distribution"),
                ("13_wastage_risk.png", "13. Wastage Risk & Cost Analysis"),
                ("14_price_sensitivity.png", "14. Price Sensitivity & Elasticity"),
                ("15_slow_moving_items.png", "15. Slow-Moving Menu Items"),
                ("16_anomalies.png", "16. Rating & Sales Anomalies"),
            ]),
            ("Dual Pipeline & Model Serving", [
                ("17_dual_pipeline_agreement.png", "17. Dual Pipeline Agreement (Unseen Match)"),
                ("18_order_value_model.png", "18. High-Value Order Model Evaluation"),
                ("19_churn_model.png", "19. Churn Model Evaluation"),
                ("20_ensemble_latency.png", "20. Ensemble Latency vs 5s NFR Budget"),
            ]),
        ]
        groups = []
        for title, items in catalog:
            groups.append({
                "title": title,
                "charts": [{
                    "file": f,
                    "title": t,
                    "available": (charts_dir / f).exists(),
                    "url": f"/api/v1/charts/{f}",
                } for f, t in items],
            })
        return {
            "groups": groups,
            "quality": records(self.quality_summary),
            "cleaning": records(self.cleaning_summary),
            "quarantine": self.quarantine_counts,
            "dual_pipeline": records(self.dual_summary),
            "evaluation": records(self.eval_summary),
            "recommendations": records(self.recommendations),
            "data_status": "ok",
        }

    # ------------------------------------------------------------------
    # Alerts & search
    # ------------------------------------------------------------------
    def alerts(self) -> dict:
        self.ensure_loaded()
        items = []
        if not self.promos.empty:
            traps = int(self.promos["promotion_trap"].astype(str)
                        .str.lower().isin(["true", "1", "yes"]).sum())
            if traps:
                items.append({
                    "id": "promo-traps",
                    "level": "warn",
                    "title": f"{traps} promotion traps detected",
                    "body": "Promotions whose AOV lift does not cover discount spend.",
                    "href": "/promotions",
                })
        if not self.churn.empty:
            days = pd.to_numeric(self.churn.get("days_since", self.churn.get("recency_days")),
                                 errors="coerce")
            high = int((days >= 180).sum())
            if high:
                items.append({
                    "id": "churn-risk",
                    "level": "danger",
                    "title": f"{high} guests at high churn risk",
                    "body": "No completed order for 180+ days in the analysis window.",
                    "href": "/customers?risk=high",
                })
        quarantined = sum(self.quarantine_counts.values())
        if quarantined:
            items.append({
                "id": "quarantine",
                "level": "info",
                "title": f"{quarantined} rows quarantined",
                "body": "Raw rows parked by the data quality pipeline for review.",
                "href": "/reports",
            })
        if not self.latency.empty:
            ok = bool(self.latency["pass"].astype(str).str.lower()
                      .isin(["true", "1", "yes"]).all())
            max_ms = pd.to_numeric(self.latency["total_ms_max"], errors="coerce").max()
            items.append({
                "id": "nfr",
                "level": "info" if ok else "danger",
                "title": f"Ensemble serving {'healthy' if ok else 'over budget'}",
                "body": f"Slowest warm batch {max_ms} ms vs 5,000 ms NFR budget.",
                "href": "/models",
            })
        if not self.dual_summary.empty:
            agree = pd.to_numeric(self.dual_summary["agreement_percentage"], errors="coerce").mean()
            items.append({
                "id": "dual",
                "level": "info",
                "title": f"Dual-pipeline agreement {agree:.0f}%",
                "body": "PySpark MLlib vs Scikit-Learn unseen-case comparison.",
                "href": "/models",
            })
        return {"items": items, "unread": len(items), "data_status": "ok"}

    def search(self, q: str) -> dict:
        self.ensure_loaded()
        q = (q or "").strip()
        if len(q) < 1:
            return {"orders": [], "dishes": [], "areas": [], "customers": []}
        ql = q.lower()
        orders = self.orders_list(q=q, page_size=5)["items"]
        dishes = self.dishes(q=q, limit=5)["items"]
        areas = [a for a in self._areas_rows(None, limit=None)
                 if ql in (a["city_area"] or "").lower()][:5]
        customers = []
        if not self.churn.empty:
            cust = self.churn.copy()
            cust["customer_id"] = pd.to_numeric(cust["customer_id"], errors="coerce")
            sel = cust[cust["customer_id"].astype(str).str.contains(ql, na=False)].head(5)
            customers = records(sel[["customer_id", "days_since", "total_orders"]]
                                if set(["customer_id", "days_since", "total_orders"]).issubset(cust.columns)
                                else sel)
        return {"orders": orders, "dishes": dishes, "areas": areas,
                "customers": customers}


# Module-level singleton --------------------------------------------------
_service: DashboardService | None = None
_service_lock = threading.Lock()


def get_dashboard_service(base_dir: Path | None = None) -> DashboardService:
    global _service
    with _service_lock:
        if _service is None:
            _service = DashboardService(base_dir)
            _service.ensure_loaded()
        return _service
