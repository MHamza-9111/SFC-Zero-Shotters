from pathlib import Path
from datetime import datetime, timedelta
from itertools import combinations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ============================================================
# DineIQ Analytics - Advanced Analytics & Intelligence Layer
# ============================================================
# Implements the SRS intelligence requirements on top of the
# cleaned/integrated Python data layer:
#
#   - RFM analysis and customer segmentation (KMeans)
#   - Data-driven menu business classes (Profit Driver,
#     Volume Driver, Hidden Opportunity, Low Performer)
#     including contradictory cases
#   - Market-basket analysis (support / confidence / lift)
#   - Peak-period analysis
#   - Demand forecasting with chronological validation and
#     MAE / RMSE / MAPE, compared against a naive baseline
#   - Wastage and wastage-risk analysis
#   - Price sensitivity (elasticity)
#   - Promotion effectiveness and promotion-trap detection
#   - Rating and sales anomaly detection
#   - Slow-moving dish detection
#   - Location / channel intelligence
#   - Churn risk modelling (logistic regression)
#   - Evidence-backed prioritized recommendations
#   - What-if scenario estimates
#   - Dual-pipeline comparison sets (unseen cases + Python
#     predictions) for Hamza's Spark side to compare against
#
# Analytical accounting rule: revenue-based analytics use
# COMPLETED orders only (see process_dineiq_data.py).
#
# All models use random_state=42 for reproducibility.
# ============================================================

BASE = Path(__file__).resolve().parents[2]
RUN_TIME = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
RANDOM_STATE = 42


def save(output_dir: Path, df: pd.DataFrame, filename: str) -> Path:
    path = Path(output_dir) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    print(f"  Saved: {filename} ({len(df):,} rows)")
    return path


def mape(y_true, y_pred):
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.mean(np.abs((y_true - y_pred) / np.maximum(y_true, 1.0))) * 100)


def mae(y_true, y_pred):
    return float(np.mean(np.abs(np.asarray(y_true, float) - np.asarray(y_pred, float))))


def rmse(y_true, y_pred):
    d = np.asarray(y_true, float) - np.asarray(y_pred, float)
    return float(np.sqrt(np.mean(d ** 2)))


# ============================================================
# 1. RFM + customer segmentation (KMeans)
# ============================================================

def rfm_segmentation(customers, customer_analytics, cutoff):
    print("\n[1/14] RFM analysis and customer segmentation (KMeans)...")

    active = customer_analytics.loc[
        customer_analytics["total_orders"] > 0
    ].copy()

    active["last_order_date"] = pd.to_datetime(
        active["last_order_date"], errors="coerce"
    )
    active = active.dropna(subset=["last_order_date"])

    active["r_days"] = (cutoff - active["last_order_date"]).dt.days
    active["f_orders"] = active["total_orders"].astype(float)
    active["m_spend"] = active["total_spend"].astype(float)

    for src, dst in [("r_days", "r_score"), ("f_orders", "f_score"), ("m_spend", "m_score")]:
        try:
            if src == "r_days":
                # recent = low days = high score
                active[dst] = pd.qcut(
                    -active[src], 5, labels=[1, 2, 3, 4, 5]
                ).astype(int)
            else:
                active[dst] = pd.qcut(
                    active[src], 5, labels=[1, 2, 3, 4, 5]
                ).astype(int)
        except ValueError:
            active[dst] = 3

    X = np.column_stack([
        -active["r_score"].values.astype(float),
        np.log1p(active["f_orders"].values),
        np.log1p(active["m_spend"].values),
    ])
    Xs = StandardScaler().fit_transform(X)

    kmeans = KMeans(n_clusters=5, n_init=10, random_state=RANDOM_STATE).fit(Xs)
    active["cluster"] = kmeans.labels_

    centers = pd.DataFrame(
        kmeans.cluster_centers_,
        columns=["neg_r", "log_f", "log_m"],
    )
    # Higher r_mean = more recent customers; higher f_mean = more frequent.
    centers["r_mean"] = -centers["neg_r"]
    centers["f_mean"] = centers["log_f"]
    centers["m_mean"] = centers["log_m"]

    # Robust, deterministic segment labelling based on the median of
    # the cluster centers (no arbitrary fixed thresholds).
    #   Champions          = recent AND the most frequent recent cluster
    #   Loyal Customers    = recent AND frequent (not the champion)
    #   Potential Loyalist = recent but not frequent
    #   At Risk - High Val = not recent but was frequent
    #   Hibernating        = not recent and not frequent
    r_cut = centers["r_mean"].median()
    f_cut = centers["f_mean"].median()

    recent_clusters = centers.index[centers["r_mean"] >= r_cut]
    champion = (
        centers.loc[recent_clusters, "f_mean"].idxmax()
        if len(recent_clusters)
        else None
    )

    labels = {}
    for c in centers.itertuples():
        recent = c.r_mean >= r_cut
        freq = c.f_mean >= f_cut
        if recent:
            if c.Index == champion and freq:
                labels[c.Index] = "Champions"
            elif freq:
                labels[c.Index] = "Loyal Customers"
            else:
                labels[c.Index] = "Potential Loyalist"
        elif freq:
            labels[c.Index] = "At Risk - High Value"
        else:
            labels[c.Index] = "Hibernating"

    active["segment"] = active["cluster"].map(labels)

    out = active[[
        "customer_id", "r_days", "f_orders", "m_spend",
        "r_score", "f_score", "m_score", "cluster", "segment",
        "total_spend", "total_orders", "average_order_value",
        "customer_value_segment",
    ]].copy()

    return out


# ============================================================
# 2. Menu business classes
# ============================================================

def menu_business_classes(menu_perf, rating_item, wastage_item):
    print("\n[2/14] Menu business classes (Profit/Volume Driver, Hidden Opportunity, Low Performer)...")

    df = menu_perf.merge(
        rating_item[["menu_item_id", "rating_count", "average_rating"]],
        on="menu_item_id",
        how="left",
    )
    df = df.merge(
        wastage_item[["menu_item_id", "quantity_wasted"]],
        on="menu_item_id",
        how="left",
    )
    df["average_rating"] = df["average_rating"].fillna(0)
    df["quantity_wasted"] = df["quantity_wasted"].fillna(0)
    df["wastage_ratio"] = df["quantity_wasted"] / np.maximum(
        df["units_sold"] + df["quantity_wasted"], 1
    )

    u_med = df["units_sold"].median()
    p_med = df["estimated_profit"].median()
    m_med = df["profit_margin_percentage"].median()

    # SRS Step 10 definitions, using a median split on each indicator:
    #   Profit Driver      - high demand AND high profitability
    #                        (estimated profit and margin both >= median)
    #   Volume Driver      - high demand but comparatively lower
    #                        profitability (every other high-demand item)
    #   Hidden Opportunity - good profitability (margin) but low sales
    #   Low Performer      - weak demand AND weak profitability
    # The four conditions partition all items, so none reaches the default.
    # Keep in sync with spark_jobs/features.py (dual pipeline).
    high_demand = df["units_sold"] >= u_med
    high_profit = df["estimated_profit"] >= p_med
    high_margin = df["profit_margin_percentage"] >= m_med
    conditions = [
        high_demand & high_profit & high_margin,
        high_demand,
        ~high_demand & high_margin,
        ~high_demand & ~high_margin,
    ]
    df["business_class"] = np.select(
        conditions,
        ["Profit Driver", "Volume Driver", "Hidden Opportunity", "Low Performer"],
        default="Low Performer",
    )

    # Contradictory / difficult cases the SRS explicitly requires.
    df["contradictory_case"] = ""
    c1 = (df["units_sold"] >= u_med) & (df["estimated_profit"] < 0)
    df.loc[c1, "contradictory_case"] = "High volume but negative profit"
    c2 = (df["profit_margin_percentage"] >= m_med) & (
        (df["average_rating"] > 0) & (df["average_rating"] < 3)
    )
    df.loc[c2, "contradictory_case"] = "High margin but poor customer rating"
    c3 = (df["estimated_profit"] >= p_med) & (df["wastage_ratio"] > 0.15)
    df.loc[c3, "contradictory_case"] = "High profit but heavy wastage"

    df["features:units"] = df["units_sold"]
    df["features:revenue"] = df["revenue"]
    df["features:profit"] = df["estimated_profit"]
    df["features:margin"] = df["profit_margin_percentage"]
    df["features:rating"] = df["average_rating"]
    df["features:wastage_ratio"] = df["wastage_ratio"]

    return df


# ============================================================
# 2b. Order value classification (primary dual-pipeline task)
# ============================================================

def order_value_classification(orders_completed, items_completed,
                               customer_analytics, holdout_size=300):
    """
    Classifies orders as high-value (top 10% of completed-order
    value) vs normal.

    Returns:
      unseen_cases   - holdout orders with features + actual label
      predictions    - Python RandomForest predictions on holdout
      report         - holdout metrics
    """

    print("\n[2b/14] Order-value classification (dual-pipeline task)...")

    order_agg = items_completed.groupby("order_id").agg(
        basket_size=("order_item_id", "nunique"),
        basket_quantity=("quantity", "sum"),
        avg_unit_price=("unit_price", "mean"),
    ).reset_index()

    df = orders_completed.merge(order_agg, on="order_id", how="left")
    df = df.merge(
        customer_analytics[["customer_id", "total_orders", "total_spend"]],
        on="customer_id",
        how="left",
    )
    df["total_orders"] = df["total_orders"].fillna(0)
    df["total_spend"] = df["total_spend"].fillna(0)

    df["channel_code"] = df["order_channel"].astype("category").cat.codes
    df["payment_code"] = df["payment_method"].fillna("Unknown").astype("category").cat.codes
    df["day_of_week_code"] = pd.factorize(df["day_of_week"])[0]
    df["order_hour"] = df["order_hour"].fillna(-1)

    features = [
        "order_hour",
        "day_of_week_code",
        "order_month",
        "is_weekend",
        "is_promo_order",
        "channel_code",
        "payment_code",
        "basket_size",
        "basket_quantity",
        "avg_unit_price",
        "discount_rate_percentage",
        "total_orders",
        "total_spend",
    ]

    # Holdout FIRST, then threshold on the training side only
    # (no label leakage).
    idx = df.index.to_numpy()
    rng = np.random.default_rng(RANDOM_STATE)
    holdout_idx = rng.choice(idx, size=min(holdout_size, len(idx)), replace=False)
    holdout_set = set(holdout_idx.tolist())

    train = df.loc[~df.index.isin(holdout_set)].copy()
    holdout = df.loc[sorted(holdout_idx)].copy()

    threshold = train["total_amount"].quantile(0.90)
    train["label_high_value"] = (train["total_amount"] >= threshold).astype(int)
    holdout["label_high_value"] = (holdout["total_amount"] >= threshold).astype(int)

    model = RandomForestClassifier(
        n_estimators=150,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(train[features], train["label_high_value"])

    y_pred = model.predict(holdout[features])

    unseen_cases = holdout[
        ["order_id", "customer_id", "restaurant_id", "order_date",
         "total_amount", "label_high_value"] + features
    ].copy()
    unseen_cases = unseen_cases.rename(
        columns={"label_high_value": "actual_high_value"}
    ).reset_index(drop=True)

    predictions = pd.DataFrame({
        "order_id": unseen_cases["order_id"].values,
        "actual_high_value": unseen_cases["actual_high_value"].values,
        "python_predicted_high_value": y_pred,
    })

    from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
    proba = model.predict_proba(holdout[features])[:, 1]
    report = pd.DataFrame([
        {"metric": "holdout_size", "value": len(holdout)},
        {"metric": "high_value_threshold", "value": round(float(threshold), 2)},
        {"metric": "accuracy", "value": round(accuracy_score(holdout["label_high_value"], y_pred), 4)},
        {"metric": "f1", "value": round(f1_score(holdout["label_high_value"], y_pred), 4)},
        {"metric": "roc_auc", "value": round(roc_auc_score(holdout["label_high_value"], proba), 4)},
        {"metric": "model", "value": "RandomForestClassifier (sklearn)"},
        {"metric": "task", "value": "High-value order classification (top 10% of completed order value)"},
    ])

    return unseen_cases, predictions, report


# ============================================================
# 3. Market basket analysis
# ============================================================

def market_basket(items_completed, n_orders):
    print("\n[3/14] Market-basket analysis (support / confidence / lift)...")

    baskets = (
        items_completed[["order_id", "menu_item_id"]]
        .drop_duplicates()
        .groupby("order_id")["menu_item_id"]
        .apply(list)
    )

    pair_counts = {}
    for _oid, item_list in baskets.items():
        unique_items = sorted(set(item_list))
        for a, b in combinations(unique_items, 2):
            pair_counts[(a, b)] = pair_counts.get((a, b), 0) + 1

    if not pair_counts:
        return pd.DataFrame(
            columns=["item_a", "item_b", "pair_orders", "support",
                     "confidence_a_to_b", "confidence_b_to_a", "lift"]
        )

    pair_df = pd.DataFrame(
        [
            {"item_a": a, "item_b": b, "pair_orders": c}
            for (a, b), c in pair_counts.items()
        ]
    )

    item_freq = (
        items_completed[["order_id", "menu_item_id"]]
        .drop_duplicates()
        .groupby("menu_item_id")["order_id"]
        .nunique()
    )

    freq_map = item_freq.to_dict()

    # Every order comes from ONE restaurant and every menu item belongs to
    # ONE restaurant, so a pair can only ever co-occur inside its own
    # restaurant's orders. Support / confidence / lift are therefore
    # measured against that restaurant's completed orders. Measuring against
    # all chain orders (kept as `chain_lift` for transparency) inflates every
    # same-menu pair by ~chain orders / restaurant orders (~20x with 20
    # restaurants) even when the items are bought independently.
    item_rest = (
        items_completed[["menu_item_id", "restaurant_id"]]
        .drop_duplicates("menu_item_id")
        .set_index("menu_item_id")["restaurant_id"]
    )
    rest_orders = items_completed.groupby("restaurant_id")["order_id"].nunique()
    pair_df["restaurant_id"] = pair_df["item_a"].map(item_rest)
    pair_df["restaurant_orders"] = pair_df["restaurant_id"].map(rest_orders)

    pair_df["support"] = pair_df["pair_orders"] / pair_df["restaurant_orders"]
    pair_df["p_a"] = pair_df["item_a"].map(freq_map) / pair_df["restaurant_orders"]
    pair_df["p_b"] = pair_df["item_b"].map(freq_map) / pair_df["restaurant_orders"]

    pair_df["confidence_a_to_b"] = np.where(pair_df["p_a"] > 0, pair_df["support"] / pair_df["p_a"], 0)
    pair_df["confidence_b_to_a"] = np.where(pair_df["p_b"] > 0, pair_df["support"] / pair_df["p_b"], 0)
    pair_df["lift"] = np.where(
        pair_df["p_b"] > 0,
        pair_df["confidence_a_to_b"] / pair_df["p_b"],
        0,
    )
    pair_df["chain_lift"] = pair_df["pair_orders"] * n_orders / (
        pair_df["item_a"].map(freq_map) * pair_df["item_b"].map(freq_map)
    )

    min_pair_orders = max(30, int(n_orders * 0.001))
    pair_df = pair_df.loc[pair_df["pair_orders"] >= min_pair_orders]
    pair_df = pair_df.sort_values("lift", ascending=False).head(200).reset_index(drop=True)

    return pair_df


# ============================================================
# 4. Peak period analysis
# ============================================================

def peak_period_analysis(orders_completed):
    print("\n[4/14] Peak-period analysis...")

    df = orders_completed.groupby(
        ["day_of_week", "is_weekend", "time_period", "order_channel"]
    ).agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
    ).reset_index()

    df["order_share_percentage"] = (
        df["total_orders"] / df["total_orders"].sum()
    ) * 100
    df["is_peak_cell"] = df["total_orders"] >= df["total_orders"].quantile(0.75)

    return df.sort_values("total_orders", ascending=False).reset_index(drop=True)


# ============================================================
# 5. Demand forecasting (chronological validation)
# ============================================================

def demand_forecast(orders_completed, start_date, end_date):
    print("\n[5/14] Demand forecasting with chronological validation...")

    daily = orders_completed.groupby("order_date").agg(
        actual_sales=("total_amount", "sum"),
        actual_orders=("order_id", "nunique"),
    ).reset_index()

    full_index = pd.date_range(start_date, end_date, freq="D", name="order_date")
    daily = daily.set_index("order_date").reindex(full_index)
    daily["actual_sales"] = daily["actual_sales"].fillna(0)
    daily["actual_orders"] = daily["actual_orders"].fillna(0)
    daily = daily.reset_index()
    daily = daily.rename(columns={"order_date": "date"})

    # Chronological split: last 90 days held out for validation.
    test_days = 90

    def build_features(df):
        out = df.copy()
        out["week_index"] = (
            (out["date"] - start_date).dt.days // 7
        ).astype(float)
        # Moving averages are computed on the FULL series first, then
        # the train/test split is applied, so the test window always
        # sees only past data (no leakage, no cold-start NaNs in the
        # held-out period).
        rev = out["actual_sales"]
        out["rev_7d_ma"] = rev.rolling(7, min_periods=1).mean().shift(1)
        out["rev_28d_ma"] = rev.rolling(28, min_periods=1).mean().shift(1)
        dow = pd.get_dummies(out["date"].dt.dayofweek, prefix="dow")
        return pd.concat([out, dow], axis=1)

    full_f = build_features(daily)
    train_f = full_f.iloc[:-test_days].copy()
    test_f = full_f.iloc[-test_days:].copy()

    feature_cols = ["week_index", "rev_7d_ma", "rev_28d_ma"] + [
        c for c in train_f.columns if c.startswith("dow_")
    ]

    # Only day 1 lacks a previous observation for the shifted
    # moving averages; impute that single point with the mean level.
    train_f[feature_cols] = train_f[feature_cols].fillna(
        train_f["actual_sales"].mean()
    )

    model = LinearRegression().fit(train_f[feature_cols], train_f["actual_sales"])

    model_pred = model.predict(test_f[feature_cols])
    naive_pred = test_f["actual_sales"].shift(1).to_numpy(dtype=float).copy()
    naive_pred[0] = test_f["actual_sales"].to_numpy(dtype=float)[0]

    actual = test_f["actual_sales"].values

    metrics = pd.DataFrame([
        {
            "model": "linear_regression (day-of-week + trend + moving averages)",
            "mae": mae(actual, model_pred),
            "rmse": rmse(actual, model_pred),
            "mape": mape(actual, model_pred),
        },
        {
            "model": "naive_baseline (previous day)",
            "mae": mae(actual, naive_pred),
            "rmse": rmse(actual, naive_pred),
            "mape": mape(actual, naive_pred),
        },
    ])

    daily_forecast = test_f[["date"]].copy()
    daily_forecast["actual_sales"] = actual
    daily_forecast["python_model_prediction"] = model_pred
    daily_forecast["naive_prediction"] = naive_pred
    daily_forecast["in_sample"] = False

    return daily_forecast, metrics


# ============================================================
# 6. Wastage risk analysis
# ============================================================

def wastage_risk(wastage_enriched, items_completed):
    print("\n[6/14] Wastage and wastage-risk analysis...")

    wasted = wastage_enriched.groupby(
        ["menu_item_id", "item_name", "restaurant_id"]
    ).agg(
        quantity_wasted=("quantity_wasted", "sum"),
        wastage_cost=("estimated_cost", "sum"),
        wastage_records=("wastage_id", "count"),
    ).reset_index()

    sold = items_completed.groupby(
        ["menu_item_id", "restaurant_id"]
    )["quantity"].sum().rename("units_sold").reset_index()

    df = wasted.merge(sold, on=["menu_item_id", "restaurant_id"], how="left")
    df["units_sold"] = df["units_sold"].fillna(0)
    df["wastage_ratio"] = df["quantity_wasted"] / np.maximum(
        df["quantity_wasted"] + df["units_sold"], 1
    )

    df["risk_level"] = np.select(
        [
            df["wastage_ratio"] > 0.15,
            df["wastage_ratio"] > 0.05,
        ],
        ["High", "Medium"],
        default="Low",
    )

    # Trend: last quarter vs first quarter wastage cost.
    w = wastage_enriched.copy()
    w["wastage_date"] = pd.to_datetime(w["wastage_date"], errors="coerce")
    w["quarter"] = w["wastage_date"].dt.to_period("Q")
    quarters = sorted(w["quarter"].dropna().unique())
    if len(quarters) >= 2:
        first_q = w.loc[w["quarter"] == quarters[0]]["estimated_cost"].sum()
        last_q = w.loc[w["quarter"] == quarters[-1]]["estimated_cost"].sum()
        df["trend_flag"] = (
            "increasing" if last_q > first_q * 1.1
            else "decreasing" if last_q < first_q * 0.9
            else "stable"
        )
    else:
        df["trend_flag"] = "stable"

    df["estimated_saving_30pct"] = (df["wastage_cost"] * 0.30).round(2)

    return df.sort_values("wastage_cost", ascending=False).reset_index(drop=True)


# ============================================================
# 7. Price sensitivity (elasticity)
# ============================================================

def price_sensitivity(items_completed, menu):
    print("\n[7/14] Price sensitivity analysis (price elasticity)...")

    monthly = items_completed.copy()
    monthly["month"] = monthly["order_date"].dt.to_period("M")
    monthly = monthly.groupby(["menu_item_id", "month"]).agg(
        units=("quantity", "sum"),
        avg_price=("unit_price", "mean"),
    ).reset_index()
    monthly = monthly[(monthly["units"] > 0) & (monthly["avg_price"] > 0)]

    rows = []
    for item_id, grp in monthly.groupby("menu_item_id"):
        if len(grp) < 4:
            continue
        x = np.log(grp["avg_price"].values)
        y = np.log(grp["units"].values)
        if x.std() < 1e-9:
            continue
        elasticity = float(np.polyfit(x, y, 1)[0])
        rows.append({
            "menu_item_id": item_id,
            "months_observed": len(grp),
            "average_price": float(grp["avg_price"].mean()),
            "total_units": int(grp["units"].sum()),
            "price_elasticity": round(elasticity, 3),
            "price_sensitive": bool(elasticity < -1.0),
        })

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.merge(
            menu[["menu_item_id", "restaurant_id", "item_name"]],
            on="menu_item_id",
            how="left",
        )
        df = df.sort_values("price_elasticity").reset_index(drop=True)

    return df


# ============================================================
# 8. Promotion effectiveness
# ============================================================

def promotion_effectiveness(promotions, orders_completed, start_date, end_date):
    print("\n[8/14] Promotion effectiveness and trap detection...")

    promos = promotions.copy()
    promos["start_date"] = pd.to_datetime(promos["start_date"], errors="coerce")
    promos["end_date"] = pd.to_datetime(promos["end_date"], errors="coerce")

    o = orders_completed.copy()

    # Empty promotion_id fields come back from CSV as NaN/float;
    # normalize to a clean integer string before string comparison.
    o["promotion_id"] = o["promotion_id"].apply(
        lambda x: "" if pd.isna(x) else str(int(x))
    )

    rows = []
    for p in promos.itertuples():
        if pd.isna(p.start_date) or pd.isna(p.end_date):
            continue

        window = o[
            (o["order_date"] >= p.start_date)
            & (o["order_date"] <= p.end_date)
            & (o["restaurant_id"] == p.restaurant_id)
        ]

        promo_orders = window.loc[window["promotion_id"] == str(p.promotion_id)]
        control = window.loc[window["promotion_id"] == ""]

        promo_n = int(promo_orders["order_id"].nunique())
        control_n = int(control["order_id"].nunique())

        promo_aov = float(promo_orders["total_amount"].mean()) if promo_n else 0.0
        control_aov = float(control["total_amount"].mean()) if control_n else 0.0

        promo_discount = float(promo_orders["discount_amount"].sum()) if promo_n else 0.0

        aov_lift_pct = (
            (promo_aov - control_aov) / control_aov * 100
            if control_aov > 0 else 0.0
        )
        incremental_revenue = (promo_aov - control_aov) * promo_n
        efficiency = incremental_revenue / max(promo_discount, 1.0)

        trap = promo_n == 0 or aov_lift_pct < 0 or efficiency < 0.1

        rows.append({
            "promotion_id": p.promotion_id,
            "promotion_name": p.promotion_name,
            "restaurant_id": p.restaurant_id,
            "discount_percentage": p.discount_percentage,
            "start_date": p.start_date.strftime("%Y-%m-%d"),
            "end_date": p.end_date.strftime("%Y-%m-%d"),
            "promo_orders": promo_n,
            "control_orders": control_n,
            "promo_avg_order_value": round(promo_aov, 2),
            "control_avg_order_value": round(control_aov, 2),
            "aov_lift_percentage": round(aov_lift_pct, 2),
            "promo_discount_spent": round(promo_discount, 2),
            "incremental_revenue_estimate": round(incremental_revenue, 2),
            "efficiency_ratio": round(efficiency, 3),
            "promotion_trap": bool(trap),
        })

    return pd.DataFrame(rows).sort_values("incremental_revenue_estimate", ascending=False).reset_index(drop=True)


# ============================================================
# 9. Anomaly detection
# ============================================================

def anomaly_detection(orders_completed, ratings_enriched):
    print("\n[9/14] Anomaly detection (sales, order totals, ratings)...")

    rows = []

    # Daily sales anomalies per restaurant (z-score).
    daily_rest = orders_completed.groupby(["restaurant_id", "order_date"]).agg(
        sales=("total_amount", "sum")
    ).reset_index()

    for rest, grp in daily_rest.groupby("restaurant_id"):
        mu = grp["sales"].mean()
        sigma = grp["sales"].std()
        if sigma and sigma > 0:
            z = (grp["sales"] - mu) / sigma
            extreme = grp.loc[z.abs() > 3]
            for r in extreme.itertuples():
                rows.append({
                    "anomaly_type": "daily_sales_spike_or_drop",
                    "entity": f"restaurant_{rest}",
                    "period": r.order_date.strftime("%Y-%m-%d"),
                    "value": round(r.sales, 2),
                    "z_score": round(float((r.sales - mu) / sigma), 2),
                    "note": "Daily revenue more than 3 std deviations from restaurant mean",
                })

    # Order total outliers (IQR).
    q1 = orders_completed["total_amount"].quantile(0.25)
    q3 = orders_completed["total_amount"].quantile(0.75)
    iqr = q3 - q1
    upper = q3 + 3 * iqr
    outliers = orders_completed.loc[orders_completed["total_amount"] > upper].head(200)
    for r in outliers.itertuples():
        rows.append({
            "anomaly_type": "order_total_outlier",
            "entity": f"order_{r.order_id}",
            "period": r.order_date.strftime("%Y-%m-%d"),
            "value": round(r.total_amount, 2),
            "z_score": "",
            "note": f"Order total above Q3 + 3*IQR ({upper:.2f})",
        })

    # Rating anomalies per item-month.
    ratings_enriched = ratings_enriched.copy()
    ratings_enriched["review_date"] = pd.to_datetime(
        ratings_enriched["review_date"], errors="coerce"
    )
    ratings_enriched["month"] = ratings_enriched["review_date"].dt.to_period("M").astype(str)
    item_month = ratings_enriched.groupby(
        ["menu_item_id", "month"]
    ).agg(avg_rating=("rating", "mean"), rating_count=("rating_id", "count")).reset_index()
    item_month = item_month[item_month["rating_count"] >= 10]

    item_stats = ratings_enriched.groupby("menu_item_id").agg(
        mu=("rating", "mean"), sigma=("rating", "std")
    )
    for r in item_month.itertuples():
        stats = item_stats.loc[r.menu_item_id]
        if pd.notna(stats.sigma) and stats.sigma > 0:
            z = (r.avg_rating - stats.mu) / stats.sigma
            if abs(z) > 2:
                rows.append({
                    "anomaly_type": "rating_shift",
                    "entity": f"menu_item_{r.menu_item_id}",
                    "period": r.month,
                    "value": round(r.avg_rating, 2),
                    "z_score": round(float(z), 2),
                    "note": "Monthly average rating shifted more than 2 std from item baseline",
                })

    return pd.DataFrame(rows)


# ============================================================
# 10. Slow-moving items
# ============================================================

def slow_moving_items(items_completed, start_date, cutoff):
    print("\n[10/14] Slow-moving dish detection...")

    df = items_completed.copy()
    late_start = cutoff - timedelta(days=60)
    early_end = start_date + timedelta(days=60)

    df["window"] = np.select(
        [
            (df["order_date"] >= late_start) & (df["order_date"] <= cutoff),
            (df["order_date"] >= start_date) & (df["order_date"] <= early_end),
        ],
        ["last_60d", "first_60d"],
        default="mid",
    )

    piv = df.groupby(
        ["menu_item_id", "item_name", "restaurant_id", "window"]
    )["quantity"].sum().unstack(fill_value=0)

    for col in ["last_60d", "first_60d"]:
        if col not in piv.columns:
            piv[col] = 0

    piv = piv.reset_index()
    piv = piv.loc[piv["first_60d"] > 0]

    piv["sales_change_percentage"] = np.where(
        piv["first_60d"] > 0,
        (piv["last_60d"] - piv["first_60d"]) / piv["first_60d"] * 100,
        0,
    )

    # Low-velocity: bottom decile of full-period sales AND bottom
    # decile of recent sales (genuinely slow movers).
    total_units = piv["first_60d"] + piv["last_60d"]
    low_total = total_units <= total_units.quantile(0.10)
    low_recent = piv["last_60d"] <= piv["last_60d"].quantile(0.10)

    piv["status"] = np.select(
        [
            piv["last_60d"] == 0,
            piv["last_60d"] < 0.25 * piv["first_60d"],
            low_total & low_recent,
        ],
        ["no_recent_sales", "declining", "low_velocity"],
        default="stable",
    )

    return (
        piv[piv["status"].isin(["no_recent_sales", "declining", "low_velocity"])]
        .sort_values("first_60d", ascending=False)
        .head(200)
        .reset_index(drop=True)
    )


# ============================================================
# 11. Location / channel intelligence
# ============================================================

def location_channel_intelligence(orders_completed, restaurants, locations):
    print("\n[11/14] Location and channel intelligence...")

    df = orders_completed.merge(
        restaurants[["restaurant_id", "location_id"]],
        on="restaurant_id",
        how="left",
    )
    df = df.merge(
        locations[["location_id", "city_area"]],
        on="location_id",
        how="left",
    )

    out = df.groupby(["city_area", "location_id", "order_channel"]).agg(
        total_orders=("order_id", "nunique"),
        total_sales=("total_amount", "sum"),
        average_order_value=("total_amount", "mean"),
        weekend_orders=("is_weekend", "sum"),
    ).reset_index()

    out["weekend_order_share"] = np.where(
        out["total_orders"] > 0,
        out["weekend_orders"] / out["total_orders"],
        0,
    )
    out["sales_share_percentage"] = (
        out["total_sales"] / max(out["total_sales"].sum(), 1) * 100
    )

    return out.sort_values("total_sales", ascending=False).reset_index(drop=True)


# ============================================================
# 12. Churn risk modelling
# ============================================================

def churn_risk(customer_analytics, items_completed, restaurants, cutoff,
               min_window_days=180):
    print("\n[12/14] Churn risk modelling (logistic regression)...")

    df = customer_analytics.copy()
    df = df.loc[df["total_orders"] > 0]

    df["last_order_date"] = pd.to_datetime(df["last_order_date"], errors="coerce")
    df["first_order_date"] = pd.to_datetime(df["first_order_date"], errors="coerce")

    # Only customers with a stable observation window.
    min_first = cutoff - timedelta(days=min_window_days)
    df = df.loc[df["first_order_date"] <= min_first]

    df["recency_days"] = (cutoff - df["last_order_date"]).dt.days
    df["churned"] = (df["recency_days"] > 60).astype(int)

    # Category behaviour.
    item_cat = items_completed.merge(
        df[["customer_id"]], on="customer_id", how="inner"
    ) if "customer_id" not in items_completed.columns else items_completed
    cat = (
        item_cat.groupby(["customer_id", "category_name"])["quantity"]
        .sum()
        .reset_index()
    )
    total_per_cust = cat.groupby("customer_id")["quantity"].sum().rename("cust_qty")
    cat = cat.merge(total_per_cust, on="customer_id")
    cat["share"] = cat["quantity"] / cat["cust_qty"]

    top_share = cat.groupby("customer_id")["share"].max().rename("top_category_share")
    uniq_cat = cat.groupby("customer_id")["category_name"].nunique().rename("unique_categories")
    df = df.merge(top_share, on="customer_id", how="left")
    df = df.merge(uniq_cat, on="customer_id", how="left")

    df["top_category_share"] = df["top_category_share"].fillna(0)
    df["unique_categories"] = df["unique_categories"].fillna(0)
    df["discount_dependency"] = np.where(
        df["total_spend"] > 0,
        df["total_discount_received"] / df["total_spend"],
        0,
    )
    df["promo_dependency"] = np.where(
        df["total_orders"] > 0, df["promo_orders"] / df["total_orders"], 0
    )

    features = [
        "recency_days",
        "f_log_orders",
        "f_log_spend",
        "average_order_value",
        "discount_dependency",
        "promo_dependency",
        "top_category_share",
        "unique_categories",
    ]

    df["f_log_orders"] = np.log1p(df["total_orders"])
    df["f_log_spend"] = np.log1p(df["total_spend"])

    X = df[features].fillna(0)
    y = df["churned"]

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, df.index,
        test_size=0.2,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    model = LogisticRegression(max_iter=2000, random_state=RANDOM_STATE)
    model.fit(X_train, y_train)

    test_pred = model.predict(X_test)
    test_prob = model.predict_proba(X_test)[:, 1]

    metrics = pd.DataFrame([
        {"metric": "accuracy", "value": round(accuracy_score(y_test, test_pred), 4)},
        {"metric": "roc_auc", "value": round(roc_auc_score(y_test, test_prob), 4)},
        {"metric": "macro_f1", "value": round(f1_score(y_test, test_pred, average="macro"), 4)},
        {"metric": "train_size", "value": len(X_train)},
        {"metric": "test_size", "value": len(X_test)},
        {"metric": "churn_rate", "value": round(float(y.mean()), 4)},
        {"metric": "definition", "value": "No completed order in the final 60 days of the analysis window"},
        {"metric": "observation_window", "value": f"Customers with first order on or before {min_first.date()}"},
        {"metric": "model", "value": "LogisticRegression (sklearn)"},
    ])

    # Score every customer with orders.
    all_customers = customer_analytics.copy()
    all_customers["last_order_date"] = pd.to_datetime(
        all_customers["last_order_date"], errors="coerce"
    )
    scored = all_customers.loc[all_customers["total_orders"] > 0].copy()
    scored["recency_days"] = (cutoff - scored["last_order_date"]).dt.days

    item_cat_all = items_completed.copy()
    cat_all = (
        item_cat_all.groupby(["customer_id", "category_name"])["quantity"]
        .sum()
        .reset_index()
    )
    tot = cat_all.groupby("customer_id")["quantity"].sum().rename("cust_qty")
    cat_all = cat_all.merge(tot, on="customer_id")
    cat_all["share"] = cat_all["quantity"] / cat_all["cust_qty"]
    top_share_all = cat_all.groupby("customer_id")["share"].max().rename("top_category_share")
    uniq_cat_all = cat_all.groupby("customer_id")["category_name"].nunique().rename("unique_categories")

    scored = scored.merge(top_share_all, on="customer_id", how="left")
    scored = scored.merge(uniq_cat_all, on="customer_id", how="left")
    scored["top_category_share"] = scored["top_category_share"].fillna(0)
    scored["unique_categories"] = scored["unique_categories"].fillna(0)
    scored["discount_dependency"] = np.where(
        scored["total_spend"] > 0,
        scored["total_discount_received"] / scored["total_spend"], 0,
    )
    scored["promo_dependency"] = np.where(
        scored["total_orders"] > 0,
        scored["promo_orders"] / scored["total_orders"], 0,
    )
    scored["f_log_orders"] = np.log1p(scored["total_orders"])
    scored["f_log_spend"] = np.log1p(scored["total_spend"])

    X_all = scored[features].fillna(0)
    scored["churn_probability"] = model.predict_proba(X_all)[:, 1]
    scored["churn_risk"] = np.select(
        [
            scored["churn_probability"] >= 0.7,
            scored["churn_probability"] >= 0.4,
        ],
        ["High", "Medium"],
        default="Low",
    )

    out = scored[[
        "customer_id", "churn_risk", "churn_probability",
        "recency_days", "total_orders", "total_spend",
        "average_order_value", "customer_value_segment",
    ]].sort_values("churn_probability", ascending=False).reset_index(drop=True)

    # Unseen test cases for the dual-pipeline comparison.
    # Align predictions with the (shuffled) test split by index.
    pred_series = pd.Series(np.asarray(test_pred), index=X_test.index)
    prob_series = pd.Series(np.asarray(test_prob), index=X_test.index)

    test_cases = df.loc[idx_test, [
        "customer_id", "recency_days", "total_orders", "total_spend",
        "average_order_value", "discount_dependency", "promo_dependency",
        "top_category_share", "unique_categories", "churned",
    ]].head(200).copy()
    test_cases = test_cases.rename(columns={"churned": "actual_churn"})

    test_predictions = pd.DataFrame({
        "customer_id": test_cases["customer_id"].to_numpy(),
        "actual_churn": test_cases["actual_churn"].to_numpy(),
        "python_predicted_churn": pred_series.loc[test_cases.index].to_numpy(),
        "python_churn_probability": prob_series.loc[test_cases.index].to_numpy(),
    })

    return out, metrics, test_cases, test_predictions


# ============================================================
# 13. Recommendations (evidence-backed)
# ============================================================

def build_recommendations(menu_classes, promo_eff, wastage_risk_df,
                          slow_movers, peak_df, churn_out, rating_analysis):
    print("\n[13/14] Evidence-backed recommendations...")

    rows = []

    hidden = menu_classes.loc[
        menu_classes["business_class"] == "Hidden Opportunity"
    ].sort_values("profit_margin_percentage", ascending=False).head(5)
    for r in hidden.itertuples():
        rows.append({
            "priority": "P1",
            "recommendation": "Promote high-margin, low-volume item (bundle, signage, staff suggestion)",
            "target_type": "menu_item",
            "target_id": r.menu_item_id,
            "target_name": f"{r.item_name} @ {r.restaurant_name}",
            "evidence": (
                f"margin {r.profit_margin_percentage:.1f}% (above median) with only "
                f"{r.units_sold:.0f} units sold; class=Hidden Opportunity"
            ),
            "estimated_impact": (
                f"Each extra 100 units adds ~{r.estimated_profit / max(r.units_sold, 1) * 100:.0f} currency units of profit"
            ),
        })

    low = menu_classes.loc[
        (menu_classes["business_class"] == "Low Performer")
        & (menu_classes["estimated_profit"] < 0)
    ].sort_values("estimated_profit").head(5)
    for r in low.itertuples():
        rows.append({
            "priority": "P1",
            "recommendation": "Reprice or retire unprofitable low-volume item",
            "target_type": "menu_item",
            "target_id": r.menu_item_id,
            "target_name": f"{r.item_name} @ {r.restaurant_name}",
            "evidence": (
                f"loss of {abs(r.estimated_profit):.0f} on {r.units_sold:.0f} units "
                f"(margin {r.profit_margin_percentage:.1f}%); class=Low Performer"
            ),
            "estimated_impact": f"Stopping the loss saves ~{abs(r.estimated_profit):.0f} per period",
        })

    traps = promo_eff.loc[promo_eff["promotion_trap"]]
    traps = traps.sort_values("incremental_revenue_estimate").head(3)
    for r in traps.itertuples():
        rows.append({
            "priority": "P2",
            "recommendation": "Pause or restructure underperforming promotion",
            "target_type": "promotion",
            "target_id": r.promotion_id,
            "target_name": r.promotion_name,
            "evidence": (
                f"AOV lift {r.aov_lift_percentage:+.1f}% vs control, "
                f"efficiency {r.efficiency_ratio} on {r.promo_discount_spent:.0f} discount spent"
            ),
            "estimated_impact": "Recovers discount spend without incremental revenue",
        })

    high_waste = wastage_risk_df.loc[
        wastage_risk_df["risk_level"] == "High"
    ].sort_values("wastage_cost", ascending=False).head(5)
    for r in high_waste.itertuples():
        rows.append({
            "priority": "P2",
            "recommendation": "Reduce overproduction / tighten prep planning",
            "target_type": "menu_item",
            "target_id": r.menu_item_id,
            "target_name": f"{r.item_name} @ restaurant {r.restaurant_id}",
            "evidence": (
                f"wastage ratio {r.wastage_ratio:.1%}, cost {r.wastage_cost:.0f}, trend {r.trend_flag}"
            ),
            "estimated_impact": f"30% waste reduction saves ~{r.estimated_saving_30pct:.0f}",
        })

    slow = slow_movers.head(5)
    for r in slow.itertuples():
        rows.append({
            "priority": "P3",
            "recommendation": "Menu review: item lost momentum",
            "target_type": "menu_item",
            "target_id": r.menu_item_id,
            "target_name": f"{r.item_name} @ restaurant {r.restaurant_id}",
            "evidence": (
                f"{r.first_60d:.0f} units in first 60 days vs {r.last_60d:.0f} in last 60 days "
                f"({r.sales_change_percentage:+.0f}%); status={r.status}"
            ),
            "estimated_impact": "Frees menu and kitchen capacity for stronger items",
        })

    if not peak_df.empty:
        p = peak_df.iloc[0]
        rows.append({
            "priority": "P3",
            "recommendation": "Align staffing and prep capacity with peak cell",
            "target_type": "period",
            "target_id": f"{p.day_of_week}/{p.time_period}/{p.order_channel}",
            "target_name": str(p.day_of_week) + " " + str(p.time_period) + " " + str(p.order_channel),
            "evidence": (
                f"peak cell carries {p.order_share_percentage:.1f}% of all orders "
                f"(AOV {p.average_order_value:.0f})"
            ),
            "estimated_impact": "Fewer delays at peak; protects repeat demand",
        })

    at_risk_high_value = churn_out.loc[
        (churn_out["churn_risk"] == "High")
        & (churn_out["customer_value_segment"].isin(["High Value", "Frequent"]))
    ]
    if len(at_risk_high_value) > 0:
        rows.append({
            "priority": "P1",
            "recommendation": "Win-back campaign for at-risk high-value customers",
            "target_type": "customer_group",
            "target_id": "high_value_at_risk",
            "target_name": f"{len(at_risk_high_value)} customers",
            "evidence": (
                f"high churn probability with lifetime spend "
                f"{at_risk_high_value['total_spend'].sum():.0f}"
            ),
            "estimated_impact": "Retaining half of them protects ~"
                                f"{at_risk_high_value['total_spend'].sum() / 2:.0f} lifetime spend",
        })

    worst_ratings = rating_analysis.loc[
        (rating_analysis["average_rating"] < 3.5) & (rating_analysis["rating_count"] >= 20)
    ].sort_values("average_rating").head(3)
    for r in worst_ratings.itertuples():
        rows.append({
            "priority": "P2",
            "recommendation": "Quality check on poorly rated item",
            "target_type": "menu_item",
            "target_id": r.menu_item_id,
            "target_name": r.item_name,
            "evidence": (
                f"average rating {r.average_rating:.2f} across {r.rating_count} ratings"
            ),
            "estimated_impact": "Rating improvement protects demand for a rated item",
        })

    return pd.DataFrame(rows)


# ============================================================
# 14. What-if scenarios
# ============================================================

def what_if_scenarios(menu_classes, price_sens_df):
    print("\n[14/14] What-if scenario estimates...")

    rows = []
    elasticity_by_item = (
        price_sens_df.set_index("menu_item_id")["price_elasticity"].to_dict()
    ) if not price_sens_df.empty else {}

    def scenario(name, scope, price_change, note):
        sub = menu_classes.loc[menu_classes["business_class"] == scope].copy()
        if sub.empty or sub["units_sold"].sum() == 0:
            return None

        baseline_revenue = float(sub["revenue"].sum())
        baseline_profit = float(sub["estimated_profit"].sum())
        base_units = float(sub["units_sold"].sum())

        # Average observed elasticity across the scoped items
        # (fallback -1.0 where no price change was observed).
        # With only 12 monthly observations the estimate is noisy;
        # a non-negative average is not economically plausible for
        # these menu items, so fall back to -1.0 in that case.
        e_avg = float(np.mean(
            [elasticity_by_item.get(int(i), -1.0) for i in sub["menu_item_id"]]
        ))
        if not (e_avg < 0):
            e_avg = -1.0

        # Quantity responds to price through elasticity:
        # %ΔQ = elasticity * %ΔP  (elasticity is negative)
        qty_change_pct = e_avg * price_change
        new_units = base_units * (1 + qty_change_pct / 100.0)

        unit_revenue = baseline_revenue / base_units
        unit_cost = sub["estimated_cost"].sum() / base_units

        new_revenue = new_units * unit_revenue * (1 + price_change / 100.0)
        new_profit = new_units * (
            unit_revenue * (1 + price_change / 100.0) - unit_cost
        )

        rows.append({
            "scenario": name,
            "scope": scope,
            "price_change_percentage": price_change,
            "affected_items": int(len(sub)),
            "baseline_revenue": round(baseline_revenue, 2),
            "baseline_profit": round(baseline_profit, 2),
            "new_revenue_estimate": round(new_revenue, 2),
            "new_profit_estimate": round(new_profit, 2),
            "revenue_change": round(new_revenue - baseline_revenue, 2),
            "profit_change": round(new_profit - baseline_profit, 2),
            "assumption": (
                f"Average price elasticity {e_avg:.2f} from observed price changes; "
                f"quantity responds proportionally; unit cost unchanged. {note}"
            ),
        })
        return rows[-1]

    scenario(
        "price_increase_10pct",
        "Volume Driver",
        10,
        "Tests whether high-volume items can absorb a 10% price increase.",
    )
    scenario(
        "price_decrease_10pct",
        "Hidden Opportunity",
        -10,
        "Tests whether a 10% discount stimulates high-margin, low-volume items.",
    )
    scenario(
        "discount_15pct",
        "Low Performer",
        -15,
        "Tests whether a 15% discount moves unprofitable slow items enough to improve total profit.",
    )

    return pd.DataFrame(rows)


# ============================================================
# Main
# ============================================================

def main(processed_dir=None, output_dir=None, dual_dir=None):

    if processed_dir is None:
        processed_dir = BASE / "processed_data"
    if output_dir is None:
        output_dir = Path(processed_dir) / "analytics"
    if dual_dir is None:
        dual_dir = BASE / "python_pipeline" / "dual_pipeline"

    processed_dir = Path(processed_dir)
    output_dir = Path(output_dir)
    dual_dir = Path(dual_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    dual_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 75)
    print("DineIQ Analytics - Advanced Analytics & Intelligence Layer")
    print("=" * 75)
    print(f"Input : {processed_dir}")
    print(f"Output: {output_dir}")
    print()

    # ------------------------------------------------------------
    # Load
    # ------------------------------------------------------------

    print("Loading processed datasets...")
    customers = pd.read_csv(processed_dir / "customers.csv", low_memory=False)
    menu = pd.read_csv(processed_dir / "menu_items.csv", low_memory=False)
    restaurants = pd.read_csv(processed_dir / "restaurants.csv", low_memory=False)
    locations = pd.read_csv(processed_dir / "locations.csv", low_memory=False)
    promotions = pd.read_csv(processed_dir / "promotions.csv", low_memory=False)

    orders = pd.read_csv(output_dir / "orders_processed.csv", low_memory=False)
    order_items = pd.read_csv(output_dir / "order_items_integrated.csv", low_memory=False)
    customer_analytics = pd.read_csv(output_dir / "customer_analytics.csv", low_memory=False)
    menu_perf = pd.read_csv(output_dir / "menu_item_performance.csv", low_memory=False)
    wastage_enriched = pd.read_csv(output_dir / "wastage_integrated.csv", low_memory=False)
    rating_item = pd.read_csv(output_dir / "rating_item_analysis.csv", low_memory=False)
    ratings_enriched = pd.read_csv(output_dir / "ratings_integrated.csv", low_memory=False)
    wastage_item = pd.read_csv(output_dir / "wastage_item_analysis.csv", low_memory=False)

    orders["order_date"] = pd.to_datetime(orders["order_date"], errors="coerce")
    order_items["order_date"] = pd.to_datetime(order_items["order_date"], errors="coerce")
    orders_completed = orders.loc[orders["is_completed"]].copy()
    items_completed = order_items.loc[order_items["is_completed"]].copy()

    start_date = orders["order_date"].min()
    cutoff = orders["order_date"].max()
    n_orders = int(orders_completed["order_id"].nunique())

    print(f"Analysis window: {start_date.date()} to {cutoff.date()} | completed orders: {n_orders:,}")

    # ------------------------------------------------------------
    # 1. RFM
    # ------------------------------------------------------------
    rfm = rfm_segmentation(customers, customer_analytics, cutoff)
    save(output_dir, rfm, "rfm_segmentation.csv")

    # ------------------------------------------------------------
    # 2. Menu business classes + dual-pipeline comparison set
    # ------------------------------------------------------------
    menu_classes = menu_business_classes(menu_perf, rating_item, wastage_item)
    save(output_dir, menu_classes, "menu_business_classes.csv")

    feature_cols = [
        "units_sold", "revenue", "estimated_profit",
        "profit_margin_percentage", "average_rating", "wastage_ratio",
    ]

    # 20% holdout (150 item/restaurant cells -> 30 unseen cases).
    unseen_idx = menu_classes.index.to_numpy()
    rng = np.random.default_rng(RANDOM_STATE)
    holdout = rng.choice(unseen_idx, size=min(30, len(unseen_idx)), replace=False)
    holdout_set = set(holdout.tolist())

    train_mask = ~menu_classes.index.isin(holdout_set)
    clf = RandomForestClassifier(
        n_estimators=150,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    clf.fit(
        menu_classes.loc[train_mask, feature_cols],
        menu_classes.loc[train_mask, "business_class"],
    )

    unseen_cases = menu_classes.loc[
        sorted(holdout),
        ["menu_item_id", "restaurant_id", "item_name"] + feature_cols + ["business_class"],
    ].copy()
    unseen_cases = unseen_cases.rename(columns={"business_class": "actual_class"})
    unseen_cases = unseen_cases.reset_index(drop=True)
    save(dual_dir, unseen_cases, "menu_class_unseen_cases.csv")

    unseen_pred = pd.DataFrame({
        "menu_item_id": unseen_cases["menu_item_id"].values,
        "restaurant_id": unseen_cases["restaurant_id"].values,
        "actual_class": unseen_cases["actual_class"].values,
        "python_predicted_class": clf.predict(
            unseen_cases[feature_cols]
        ),
    })
    save(dual_dir, unseen_pred, "menu_class_python_predictions.csv")

    # ------------------------------------------------------------
    # 2b. Order-value classification (PRIMARY dual-pipeline task)
    # ------------------------------------------------------------
    order_cases, order_preds, order_report = order_value_classification(
        orders_completed, items_completed, customer_analytics,
        holdout_size=300,
    )
    save(dual_dir, order_cases, "order_value_unseen_cases.csv")
    save(dual_dir, order_preds, "order_value_python_predictions.csv")
    save(dual_dir, order_report, "order_value_classification_report.csv")

    # ------------------------------------------------------------
    # 3. Market basket
    # ------------------------------------------------------------
    basket = market_basket(items_completed, n_orders)
    save(output_dir, basket, "market_basket_pairs.csv")

    # ------------------------------------------------------------
    # 4. Peak periods
    # ------------------------------------------------------------
    peak = peak_period_analysis(orders_completed)
    save(output_dir, peak, "peak_period_analysis.csv")

    # ------------------------------------------------------------
    # 5. Demand forecast
    # ------------------------------------------------------------
    daily_forecast, forecast_metrics = demand_forecast(orders_completed, start_date, cutoff)
    save(output_dir, daily_forecast, "daily_forecast.csv")
    save(output_dir, forecast_metrics, "forecast_evaluation.csv")
    save(dual_dir, daily_forecast, "forecast_unseen_days.csv")

    model_mae = float(forecast_metrics.loc[forecast_metrics["model"].str.startswith("linear"), "mae"].iloc[0])
    naive_mae = float(forecast_metrics.loc[forecast_metrics["model"].str.startswith("naive"), "mae"].iloc[0])
    forecast_beats_baseline = bool(model_mae < naive_mae)

    # ------------------------------------------------------------
    # 6. Wastage risk
    # ------------------------------------------------------------
    waste = wastage_risk(wastage_enriched, items_completed)
    save(output_dir, waste, "wastage_risk_analysis.csv")

    # ------------------------------------------------------------
    # 7. Price sensitivity
    # ------------------------------------------------------------
    price_sens = price_sensitivity(items_completed, menu)
    save(output_dir, price_sens, "price_sensitivity_analysis.csv")

    # ------------------------------------------------------------
    # 8. Promotion effectiveness
    # ------------------------------------------------------------
    promo_eff = promotion_effectiveness(promotions, orders_completed, start_date, cutoff)
    save(output_dir, promo_eff, "promotion_effectiveness.csv")

    # ------------------------------------------------------------
    # 9. Anomaly detection
    # ------------------------------------------------------------
    anomalies = anomaly_detection(orders_completed, ratings_enriched)
    save(output_dir, anomalies, "anomaly_detection.csv")

    # ------------------------------------------------------------
    # 10. Slow movers
    # ------------------------------------------------------------
    slow = slow_moving_items(items_completed, start_date, cutoff)
    save(output_dir, slow, "slow_moving_items.csv")

    # ------------------------------------------------------------
    # 11. Location/channel
    # ------------------------------------------------------------
    loc_chan = location_channel_intelligence(orders_completed, restaurants, locations)
    save(output_dir, loc_chan, "location_channel_intelligence.csv")

    # ------------------------------------------------------------
    # 12. Churn risk
    # ------------------------------------------------------------
    churn, churn_metrics, churn_cases, churn_preds = churn_risk(
        customer_analytics, order_items, restaurants, cutoff
    )
    save(output_dir, churn, "churn_risk.csv")
    save(output_dir, churn_metrics, "churn_model_metrics.csv")
    save(dual_dir, churn_cases, "churn_unseen_cases.csv")
    save(dual_dir, churn_preds, "churn_python_predictions.csv")

    churn_accuracy = float(churn_metrics.loc[churn_metrics["metric"] == "accuracy", "value"].iloc[0])
    churn_macro_f1 = float(churn_metrics.loc[churn_metrics["metric"] == "macro_f1", "value"].iloc[0])

    # ------------------------------------------------------------
    # 13. Recommendations
    # ------------------------------------------------------------
    recs = build_recommendations(
        menu_classes, promo_eff, waste, slow, peak, churn, rating_item
    )
    save(output_dir, recs, "recommendations.csv")

    # ------------------------------------------------------------
    # 14. What-if
    # ------------------------------------------------------------
    whatif = what_if_scenarios(menu_classes, price_sens)
    save(output_dir, whatif, "what_if_analysis.csv")

    # ------------------------------------------------------------
    # Summary + dual-pipeline README
    # ------------------------------------------------------------
    summary = pd.DataFrame([
        {"analysis": "rfm_segmentation", "rows": len(rfm), "key_model": "KMeans(k=5)"},
        {"analysis": "menu_business_classes", "rows": len(menu_classes), "key_model": "median thresholds + RandomForest (comparison set)"},
        {"analysis": "market_basket_pairs", "rows": len(basket), "key_model": "support/confidence/lift"},
        {"analysis": "peak_period_analysis", "rows": len(peak), "key_model": "cell aggregation"},
        {"analysis": "daily_forecast", "rows": len(daily_forecast), "key_model": "LinearRegression vs naive baseline"},
        {"analysis": "wastage_risk_analysis", "rows": len(waste), "key_model": "ratio thresholds + trend"},
        {"analysis": "price_sensitivity_analysis", "rows": len(price_sens), "key_model": "log-log elasticity"},
        {"analysis": "promotion_effectiveness", "rows": len(promo_eff), "key_model": "promo vs control AOV lift"},
        {"analysis": "anomaly_detection", "rows": len(anomalies), "key_model": "z-score + IQR"},
        {"analysis": "slow_moving_items", "rows": len(slow), "key_model": "first-60d vs last-60d"},
        {"analysis": "location_channel_intelligence", "rows": len(loc_chan), "key_model": "aggregation"},
        {"analysis": "churn_risk", "rows": len(churn), "key_model": "LogisticRegression"},
        {"analysis": "recommendations", "rows": len(recs), "key_model": "evidence rules"},
        {"analysis": "what_if_analysis", "rows": len(whatif), "key_model": "elasticity-based scenarios"},
    ])
    summary.to_csv(output_dir / "advanced_analytics_summary.csv", index=False)

    dual_readme = f"""# Dual-Pipeline Comparison Sets (Python side)

Generated: {RUN_TIME}

These files are the Python-pipeline side of the SRS dual-pipeline
comparison. Hamza's Spark pipeline must independently re-derive the
predictions on the SAME unseen cases and the two sides are compared
record by record.

## 1. Order-value classification (PRIMARY task, 300 unseen orders)

- `order_value_unseen_cases.csv` - 300 held-out orders with the
  input features and the actual high-value label (top 10% of
  completed-order value, threshold computed on the training split
  only).
- `order_value_python_predictions.csv` - Python RandomForest
  predictions for those exact orders.
- `order_value_classification_report.csv` - Python-side holdout
  metrics for reference.

Comparison: build the same features in Spark from
`processed_data/`, train a Spark MLlib classifier on the
remaining orders, predict the 300 unseen orders, and report
matches, the disagreement list, and the agreement percentage.

## 2. Menu business-class classification

- `menu_class_unseen_cases.csv` - 200 held-out item/restaurant cells
  with the six input features and the actual class label.
- `menu_class_python_predictions.csv` - the Python pipeline's
  RandomForest predictions on those exact cells.

Comparison: for each row, compare `python_predicted_class` with the
Spark MLlib prediction. Report matches, disagreements (with the
disagreement rows), and the agreement percentage (target: document
the result, no fabricated agreement).

## 3. Churn risk classification (200 unseen customers)

- `churn_unseen_cases.csv` - 200 held-out customers (20% test split,
  stratified) with the input features and the actual churn label.
- `churn_python_predictions.csv` - Python logistic-regression
  predictions for those customers.

## 4. Daily demand forecast (last 90 days)

- `forecast_unseen_days.csv` - the chronologically held-out final
  90 days with actual sales, the Python model prediction, and the
  naive baseline prediction.

The Spark pipeline should produce its own forecast for these dates
and the report should compare MAE/RMSE/MAPE of both pipelines
against the actuals.

## Rules

- The Spark side must NOT read these prediction files as inputs.
- Both sides must use the same cleaned data layer
  (`processed_data/`).
- Disagreements must be listed, not hidden.
"""
    (dual_dir / "README.md").write_text(dual_readme, encoding="utf-8")

    print()
    print("=" * 75)
    print("ADVANCED ANALYTICS COMPLETE")
    print("=" * 75)
    print(f"Analytics output : {output_dir}")
    print(f"Dual-pipeline    : {dual_dir}")
    print()
    print(f"Forecast model MAE: {model_mae:,.0f} | naive MAE: {naive_mae:,.0f} "
          f"| model beats baseline: {forecast_beats_baseline}")
    print(f"Churn accuracy: {churn_accuracy:.2%} | macro F1: {churn_macro_f1:.2f}")
    print()
    for f in sorted(output_dir.glob("*.csv")):
        print(f"  - {f.name}")
    print("=" * 75)

    return {
        "output_dir": output_dir,
        "dual_dir": dual_dir,
        "forecast_beats_baseline": forecast_beats_baseline,
        "churn_accuracy": churn_accuracy,
        "churn_macro_f1": churn_macro_f1,
    }


if __name__ == "__main__":
    main()
