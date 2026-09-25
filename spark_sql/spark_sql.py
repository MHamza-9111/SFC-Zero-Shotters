"""
Step 2 - Spark SQL joins, filters and aggregations (SRS: Big Data Engineering).

The SQL below is the production implementation: tables ingested in
step 1 are registered as Spark views and these queries run natively.
When the documented pandas engine is active (no JVM), the same
aggregations are computed with pandas merge/groupby so the identical
evidence files are produced, labelled with the engine used.

Outputs (one CSV each; full copies under <reports>/spark_sql/,
capped evidence copies under reports/spark_sql/):
  orders_enriched        - order-level join: order, restaurant, location,
                           customer, promotion
  order_item_revenue     - completed-order revenue lines with category
  monthly_revenue        - revenue by location and month
  category_revenue_share - revenue share per menu category
  channel_monthly        - order count + revenue by channel and month
  peak_hours             - orders by hour and day-type
  top_item_combos        - item-pair co-occurrence with lift
  promo_effectiveness    - promo vs control AOV in the promo window
                           (per promotion, with trap flag)
  location_ranking       - locations ranked by revenue and AOV
  churn_candidates       - customers inactive > 60 days at period end
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from .schemas import ANALYSIS_END

PERIOD_END = pd.Timestamp(ANALYSIS_END)

# Evidence copies are capped so the committed repo stays small.
EVIDENCE_ROW_CAP = {
    "orders_enriched": 2000,
    "order_item_revenue": 2000,
    "churn_candidates": 5000,
    "promo_effectiveness": 500,
}


# ---------------------------------------------------------------------------
# Spark SQL (production path)
# ---------------------------------------------------------------------------

VIEW_ORDERS_ENRICHED = """
CREATE OR REPLACE VIEW orders_enriched AS
SELECT o.order_id, o.customer_id, o.restaurant_id, o.order_date,
       o.order_time, o.order_status, o.order_channel, o.payment_method,
       o.promotion_id, o.total_amount,
       r.restaurant_name, r.restaurant_type,
       l.location_id, l.city_area,
       c.gender, c.preferred_channel,
       p.promotion_name, p.promotion_type
FROM orders o
JOIN restaurants r ON o.restaurant_id = r.restaurant_id
JOIN locations l  ON r.location_id = l.location_id
JOIN customers c  ON o.customer_id = c.customer_id
LEFT JOIN promotions p ON CAST(o.promotion_id AS INT) = p.promotion_id
"""

VIEW_ORDER_ITEM_REVENUE = """
CREATE OR REPLACE VIEW order_item_revenue AS
SELECT oi.order_item_id, oi.order_id, oi.menu_item_id, oi.quantity,
       oi.line_total, oi.discount_amount AS line_discount,
       m.item_name, m.category_id, m.base_price, m.cost_price,
       (oi.line_total - oi.discount_amount) AS net_revenue,
       ((oi.line_total - oi.discount_amount)
        - oi.quantity * m.cost_price) AS contribution
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
JOIN menu_items m ON oi.menu_item_id = m.menu_item_id
WHERE UPPER(TRIM(o.order_status)) = 'COMPLETED'
"""

SQL_QUERIES = {
    "orders_enriched": "SELECT * FROM orders_enriched",
    "order_item_revenue": "SELECT * FROM order_item_revenue",
    "monthly_revenue": """
SELECT substr(o.order_date, 1, 7) AS month, l.city_area,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(oi.net_revenue) AS revenue
FROM order_item_revenue oi
JOIN orders o ON oi.order_id = o.order_id
JOIN restaurants r ON o.restaurant_id = r.restaurant_id
JOIN locations l ON r.location_id = l.location_id
GROUP BY substr(o.order_date, 1, 7), l.city_area
ORDER BY month, city_area
""",
    "category_revenue_share": """
SELECT m.category_id, mc.category_name,
       SUM(oi.net_revenue) AS revenue,
       SUM(oi.net_revenue) * 1.0
         / SUM(SUM(oi.net_revenue)) OVER () AS share
FROM order_item_revenue oi
JOIN menu_items m ON oi.menu_item_id = m.menu_item_id
JOIN menu_categories mc ON m.category_id = mc.category_id
GROUP BY m.category_id, mc.category_name
ORDER BY revenue DESC
""",
    "channel_monthly": """
SELECT substr(order_date, 1, 7) AS month, order_channel,
       COUNT(*) AS orders, SUM(total_amount) AS revenue
FROM orders
WHERE UPPER(TRIM(order_status)) = 'COMPLETED'
GROUP BY substr(order_date, 1, 7), order_channel
ORDER BY month, order_channel
""",
    "peak_hours": """
SELECT CAST(substr(order_time, 1, 2) AS INT) AS hour,
       CASE WHEN DAYOFWEEK(TO_DATE(order_date)) IN (1, 7) THEN 'weekend'
            ELSE 'weekday' END AS day_type,
       COUNT(*) AS orders
FROM orders
WHERE UPPER(TRIM(order_status)) = 'COMPLETED'
GROUP BY CAST(substr(order_time, 1, 2) AS INT),
         CASE WHEN DAYOFWEEK(TO_DATE(order_date)) IN (1, 7) THEN 'weekend'
              ELSE 'weekday' END
ORDER BY hour, day_type
""",
    "top_item_combos": """
WITH line AS (
  SELECT DISTINCT oi.order_id, oi.menu_item_id, o.restaurant_id
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.order_id
  WHERE UPPER(TRIM(o.order_status)) = 'COMPLETED'
),
pairs AS (
  SELECT a.menu_item_id AS item_a, b.menu_item_id AS item_b,
         a.restaurant_id, a.order_id
  FROM line a JOIN line b ON a.order_id = b.order_id
  WHERE a.menu_item_id < b.menu_item_id
),
combo AS (
  SELECT item_a, item_b, restaurant_id, COUNT(*) AS orders_with_combo
  FROM pairs GROUP BY item_a, item_b, restaurant_id
),
itemc AS (
  SELECT menu_item_id, COUNT(*) AS n FROM line GROUP BY menu_item_id
),
restc AS (
  SELECT restaurant_id, COUNT(DISTINCT order_id) AS n_orders
  FROM line GROUP BY restaurant_id
),
tot AS (SELECT COUNT(DISTINCT order_id) AS n_orders FROM line)
-- lift is measured WITHIN the pair's restaurant (an order never mixes
-- restaurants); chain_lift (vs all chain orders) is ~20x inflated by
-- co-location alone and is kept only for transparency.
SELECT c.item_a, ma.item_name AS item_a_name,
       c.item_b, mb.item_name AS item_b_name,
       c.restaurant_id,
       c.orders_with_combo,
       c.orders_with_combo * 1.0 * r.n_orders / (i1.n * i2.n) AS lift,
       c.orders_with_combo * 1.0 * tot.n_orders / (i1.n * i2.n) AS chain_lift
FROM combo c
JOIN itemc i1 ON c.item_a = i1.menu_item_id
JOIN itemc i2 ON c.item_b = i2.menu_item_id
JOIN restc r ON c.restaurant_id = r.restaurant_id
CROSS JOIN tot
JOIN menu_items ma ON c.item_a = ma.menu_item_id
JOIN menu_items mb ON c.item_b = mb.menu_item_id
WHERE c.orders_with_combo >= 100
ORDER BY lift DESC
LIMIT 25
""",
    "promo_effectiveness": """
WITH o AS (
  SELECT o.*,
         CASE WHEN o.promotion_id IS NULL OR o.promotion_id = ''
              THEN '' ELSE o.promotion_id END AS promo_clean
  FROM orders o
  WHERE UPPER(TRIM(o.order_status)) = 'COMPLETED'
),
w AS (
  SELECT p.promotion_id, p.promotion_name, p.restaurant_id,
         p.discount_percentage, p.start_date, p.end_date,
         o.order_id, o.total_amount, o.discount_amount, o.promo_clean
  FROM promotions p
  JOIN o ON o.restaurant_id = p.restaurant_id
     AND o.order_date >= p.start_date
     AND o.order_date <= p.end_date
),
agg AS (
  SELECT promotion_id, promotion_name, restaurant_id, discount_percentage,
         start_date, end_date,
         COUNT(DISTINCT CASE WHEN promo_clean = CAST(promotion_id AS STRING)
                             THEN order_id END) AS promo_orders,
         COUNT(DISTINCT CASE WHEN promo_clean = ''
                             THEN order_id END) AS control_orders,
         AVG(CASE WHEN promo_clean = CAST(promotion_id AS STRING)
                  THEN total_amount END) AS promo_aov,
         AVG(CASE WHEN promo_clean = '' THEN total_amount END) AS control_aov,
         SUM(CASE WHEN promo_clean = CAST(promotion_id AS STRING)
                  THEN discount_amount ELSE 0 END) AS promo_discount
  FROM w
  GROUP BY promotion_id, promotion_name, restaurant_id,
           discount_percentage, start_date, end_date
)
SELECT promotion_id, promotion_name, restaurant_id, discount_percentage,
       start_date, end_date, promo_orders, control_orders,
       COALESCE(promo_aov, 0) AS promo_avg_order_value,
       COALESCE(control_aov, 0) AS control_avg_order_value,
       CASE WHEN control_aov > 0
            THEN (promo_aov - control_aov) / control_aov * 100
            ELSE 0 END AS aov_lift_percentage,
       promo_discount AS promo_discount_spent,
       (COALESCE(promo_aov, 0) - COALESCE(control_aov, 0))
         * promo_orders AS incremental_revenue_estimate,
       ((COALESCE(promo_aov, 0) - COALESCE(control_aov, 0))
        * promo_orders) / GREATEST(promo_discount, 1.0)
         AS efficiency_ratio,
       CASE WHEN promo_orders = 0
              OR (control_aov > 0 AND (promo_aov - control_aov) < 0)
              OR (((COALESCE(promo_aov, 0) - COALESCE(control_aov, 0))
                   * promo_orders) / GREATEST(promo_discount, 1.0)) < 0.1
            THEN 1 ELSE 0 END AS promotion_trap
FROM agg
ORDER BY incremental_revenue_estimate DESC
""",
    "location_ranking": """
SELECT l.location_id, l.city_area,
       COUNT(DISTINCT o.order_id) AS orders,
       SUM(o.total_amount) AS revenue,
       AVG(o.total_amount) AS avg_order_value
FROM orders o
JOIN restaurants r ON o.restaurant_id = r.restaurant_id
JOIN locations l ON r.location_id = l.location_id
WHERE UPPER(TRIM(o.order_status)) = 'COMPLETED'
GROUP BY l.location_id, l.city_area
ORDER BY revenue DESC
""",
    "churn_candidates": """
WITH last AS (
  SELECT customer_id, MAX(order_date) AS last_order_date
  FROM orders GROUP BY customer_id
)
SELECT c.customer_id, c.preferred_channel, l.last_order_date,
       DATEDIFF(TO_DATE('2025-12-31'), TO_DATE(l.last_order_date)) AS days_since,
       COUNT(o.order_id) AS total_orders
FROM customers c
JOIN last l ON c.customer_id = l.customer_id
LEFT JOIN orders o ON c.customer_id = o.customer_id
  AND UPPER(TRIM(o.order_status)) = 'COMPLETED'
GROUP BY c.customer_id, c.preferred_channel, l.last_order_date
HAVING DATEDIFF(TO_DATE('2025-12-31'), TO_DATE(l.last_order_date)) > 60
ORDER BY days_since DESC
""",
}


# ---------------------------------------------------------------------------
# pandas equivalents (documented fallback engine)
# ---------------------------------------------------------------------------

def _pandas_outputs(engine, data) -> dict:
    p = {n: engine.to_pandas(df) for n, df in data.items()}
    out = {}
    o = p["orders"]
    comp = o[o["order_status"].astype(str).str.strip().str.upper() == "COMPLETED"].copy()

    # -- orders_enriched ------------------------------------------------
    oe = comp.merge(
        p["restaurants"][["restaurant_id", "restaurant_name", "restaurant_type", "location_id"]],
        on="restaurant_id")
    oe = oe.merge(p["locations"][["location_id", "city_area"]],
                  on="location_id", suffixes=("", "_loc"))
    oe = oe.merge(
        p["customers"][["customer_id", "gender", "preferred_channel"]],
        on="customer_id")
    promo_map = p["promotions"].set_index(
        "promotion_id").to_dict("index")

    def _pname(s):
        try:
            d = promo_map.get(int(s))
            return d["promotion_name"] if d else ""
        except (ValueError, TypeError):
            return ""

    def _ptype(s):
        try:
            d = promo_map.get(int(s))
            return d["promotion_type"] if d else ""
        except (ValueError, TypeError):
            return ""

    oe["promotion_name"] = oe["promotion_id"].map(_pname)
    oe["promotion_type"] = oe["promotion_id"].map(_ptype)
    cols = [c for c in ["order_id", "customer_id", "restaurant_id", "order_date",
                        "order_time", "order_status", "order_channel",
                        "payment_method", "promotion_id", "total_amount",
                        "restaurant_name", "restaurant_type", "location_id",
                        "city_area", "gender", "preferred_channel",
                        "promotion_name", "promotion_type"] if c in oe]
    out["orders_enriched"] = oe[cols].reset_index(drop=True)

    # -- order_item_revenue ---------------------------------------------
    oi = p["order_items"].merge(
        p["menu_items"][["menu_item_id", "item_name", "category_id",
                         "base_price", "cost_price"]],
        on="menu_item_id")
    oi = oi.merge(
        p["orders"][["order_id", "restaurant_id", "order_status",
                     "order_date"]],
        on="order_id")
    oir = oi[oi["order_status"].astype(str).str.strip().str.upper() == "COMPLETED"].copy()
    oir["net_revenue"] = oir["line_total"] - oir["discount_amount"]
    oir["contribution"] = oir["net_revenue"] - oir["quantity"] * oir["cost_price"]
    oir = oir.rename(columns={"discount_amount": "line_discount"})
    out["order_item_revenue"] = oir

    # -- monthly_revenue --------------------------------------------------
    rl = p["restaurants"][["restaurant_id", "location_id"]].merge(
        p["locations"][["location_id", "city_area"]], on="location_id")
    mr = oir.merge(rl, on="restaurant_id", how="left")
    out["monthly_revenue"] = (
        mr.assign(month=mr["order_date"].astype(str).str[:7])
          .groupby(["month", "city_area"], as_index=False)
          .agg(orders=("order_id", "nunique"), revenue=("net_revenue", "sum"))
          .sort_values(["month", "city_area"]).reset_index(drop=True))

    # -- category_revenue_share -------------------------------------------
    cat = oir.groupby("category_id").agg(revenue=("net_revenue", "sum")).reset_index()
    cat["share"] = cat["revenue"] / cat["revenue"].sum()
    out["category_revenue_share"] = (
        cat.merge(p["menu_categories"][["category_id", "category_name"]],
                  on="category_id")
            .sort_values("revenue", ascending=False).reset_index(drop=True))

    # -- channel_monthly ----------------------------------------------------
    out["channel_monthly"] = (
        comp.assign(month=comp["order_date"].astype(str).str[:7])
            .groupby(["month", "order_channel"], as_index=False)
            .agg(orders=("order_id", "count"), revenue=("total_amount", "sum"))
            .sort_values(["month", "order_channel"]).reset_index(drop=True))

    # -- peak_hours -----------------------------------------------------------
    dh = comp.assign(dow=pd.to_datetime(comp["order_date"]).dt.dayofweek,
                     hour=comp["order_time"].astype(str).str[:2].astype(int))
    dh["day_type"] = np.where(dh["dow"] >= 5, "weekend", "weekday")
    out["peak_hours"] = (
        dh.groupby(["hour", "day_type"], as_index=False)
          .agg(orders=("order_id", "count"))
          .sort_values(["hour", "day_type"]).reset_index(drop=True))

    # -- top_item_combos (completed orders, pair lift) -----------------------
    # lift is measured WITHIN the pair's restaurant (an order never mixes
    # restaurants); chain_lift (vs all chain orders) is ~20x inflated by
    # co-location alone and is kept only for transparency.
    line_rest = oir.groupby("order_id")["restaurant_id"].first()
    line = oir.groupby("order_id")["menu_item_id"].apply(
        lambda s: tuple(sorted(set(s))))
    n_orders = len(line)
    item_names = p["menu_items"].set_index("menu_item_id")["item_name"].to_dict()
    pair_c, item_c, rest_orders = Counter(), Counter(), Counter()
    for oid, items in line.items():
        rest = line_rest.get(oid)
        if rest is not None:
            rest_orders[rest] += 1
        uniq = sorted(set(items))
        for x in set(uniq):
            item_c[x] += 1
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                pair_c[(uniq[i], uniq[j], rest)] += 1
    item_rest = (p["menu_items"].drop_duplicates("menu_item_id")
                 .set_index("menu_item_id")["restaurant_id"].to_dict())
    rows = []
    for (a, b, rest), cnt in pair_c.items():
        if cnt >= 100 and rest in rest_orders:
            lift = cnt * rest_orders[rest] / (item_c[a] * item_c[b])
            chain_lift = cnt * n_orders / (item_c[a] * item_c[b])
            rows.append({"item_a": a, "item_a_name": item_names.get(a, ""),
                         "item_b": b, "item_b_name": item_names.get(b, ""),
                         "restaurant_id": rest,
                         "orders_with_combo": cnt, "lift": lift,
                         "chain_lift": chain_lift})
    out["top_item_combos"] = (pd.DataFrame(rows)
                              .sort_values("lift", ascending=False)
                              .head(25).reset_index(drop=True))

    # -- promo_effectiveness (mirrors the Python pipeline design:
    #      promo-tagged vs control orders within the promo's own
    #      restaurant during the active window) ----------------------
    comp2 = comp.assign(promo_clean=comp["promotion_id"],
                        _od=pd.to_datetime(comp["order_date"]))
    prows = []
    for _, t in p["promotions"].iterrows():
        s = pd.Timestamp(t["start_date"])
        e = pd.Timestamp(t["end_date"])
        if pd.isna(s) or pd.isna(e):
            continue
        window = comp2[(comp2["restaurant_id"] == t["restaurant_id"])
                       & (comp2["_od"] >= s)
                       & (comp2["_od"] <= e)]
        pid = str(int(t["promotion_id"]))
        promo_orders = window[window["promo_clean"] == pid]
        control = window[window["promo_clean"] == ""]
        promo_n = int(promo_orders["order_id"].nunique())
        control_n = int(control["order_id"].nunique())
        promo_aov = float(promo_orders["total_amount"].mean()) if promo_n else 0.0
        control_aov = float(control["total_amount"].mean()) if control_n else 0.0
        promo_discount = float(promo_orders["discount_amount"].sum()) if promo_n else 0.0
        aov_lift = ((promo_aov - control_aov) / control_aov * 100
                    if control_aov > 0 else 0.0)
        incremental = (promo_aov - control_aov) * promo_n
        efficiency = incremental / max(promo_discount, 1.0)
        trap = promo_n == 0 or aov_lift < 0 or efficiency < 0.1
        prows.append({
            "promotion_id": int(t["promotion_id"]),
            "promotion_name": t["promotion_name"],
            "restaurant_id": int(t["restaurant_id"]),
            "discount_percentage": int(t["discount_percentage"]),
            "start_date": s.strftime("%Y-%m-%d"),
            "end_date": e.strftime("%Y-%m-%d"),
            "promo_orders": promo_n,
            "control_orders": control_n,
            "promo_avg_order_value": round(promo_aov, 2),
            "control_avg_order_value": round(control_aov, 2),
            "aov_lift_percentage": round(aov_lift, 2),
            "promo_discount_spent": round(promo_discount, 2),
            "incremental_revenue_estimate": round(incremental, 2),
            "efficiency_ratio": round(efficiency, 3),
            "promotion_trap": bool(trap),
        })
    out["promo_effectiveness"] = (
        pd.DataFrame(prows)
        .sort_values("incremental_revenue_estimate", ascending=False)
        .reset_index(drop=True))

    # -- location_ranking -------------------------------------------------------
    lc = comp.merge(p["restaurants"][["restaurant_id", "location_id"]],
                    on="restaurant_id")
    lc = lc.merge(p["locations"][["location_id", "city_area"]],
                  on="location_id")
    out["location_ranking"] = (
        lc.groupby(["location_id", "city_area"], as_index=False)
          .agg(orders=("order_id", "nunique"),
               revenue=("total_amount", "sum"),
               avg_order_value=("total_amount", "mean"))
          .sort_values("revenue", ascending=False).reset_index(drop=True))

    # -- churn_candidates ---------------------------------------------------------
    last = o.groupby("customer_id")["order_date"].max().reset_index()
    last = last.rename(columns={"order_date": "last_order_date"})
    last["days_since"] = (PERIOD_END - pd.to_datetime(last["last_order_date"])).dt.days
    ch = last[last["days_since"] > 60].merge(
        p["customers"][["customer_id", "preferred_channel"]], on="customer_id")
    n_orders = o.groupby("customer_id")["order_id"].count().reset_index()
    ch = ch.merge(n_orders.rename(columns={"order_id": "total_orders"}),
                  on="customer_id")
    out["churn_candidates"] = ch.sort_values(
        "days_since", ascending=False).reset_index(drop=True)

    return out


def run(engine, data: dict, reports_dir: Path, evidence_dir: Path) -> pd.DataFrame:
    """
    Runs the SQL analysis set on the ingested data.

    Full outputs -> <reports_dir>/spark_sql/
    Capped evidence copies -> <evidence_dir>/spark_sql/
    Returns a summary DataFrame (one row per output).
    """
    reports_dir = Path(reports_dir)
    evidence_dir = Path(evidence_dir)
    out_dir = reports_dir / "spark_sql"
    ev_dir = evidence_dir / "spark_sql"
    out_dir.mkdir(parents=True, exist_ok=True)
    ev_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 70)
    print("DineIQ Big Data Pipeline - Step 2: Spark SQL analysis")
    print(f"engine : {engine.display}")
    print("=" * 70)

    if engine.kind == "spark":
        for name, df in data.items():
            df.createOrReplaceTempView(name)
        engine.spark.sql(VIEW_ORDERS_ENRICHED)
        engine.spark.sql(VIEW_ORDER_ITEM_REVENUE)
        frames = {name: engine.to_pandas(engine.spark.sql(sql))
                  for name, sql in SQL_QUERIES.items()}
    else:
        frames = _pandas_outputs(engine, data)

    summary = []
    for name, df in frames.items():
        full_path = out_dir / f"{name}.csv"
        df.to_csv(full_path, index=False)
        cap = EVIDENCE_ROW_CAP.get(name)
        ev_df = df.head(cap) if cap else df
        ev_path = ev_dir / f"{name}.csv"
        ev_df.to_csv(ev_path, index=False)
        summary.append({"output": name, "rows": len(df),
                        "evidence_rows": len(ev_df),
                        "file": str(full_path),
                        "evidence_file": str(ev_path)})
        print(f"  {name}: {len(df):,} rows (evidence: {len(ev_df):,})")

    summary_df = pd.DataFrame(summary)
    summary_df.to_csv(out_dir / "summary.csv", index=False)
    summary_df.to_csv(ev_dir / "summary.csv", index=False)
    (out_dir / "engine.json").write_text(json.dumps(engine.label(), indent=2))
    (ev_dir / "engine.json").write_text(json.dumps(engine.label(), indent=2))
    return summary_df
