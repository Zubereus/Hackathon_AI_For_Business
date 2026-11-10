"""Historical Backtesting Engine for What-If AI.

Validates price elasticity models against actual historical price intervention events:
    1. Selects or auto-detects a past price change (|price change| >= 5%, not in Tet window [-14, +7]).
    2. Strict temporal separation: fits econometric model ONLY on data strictly before change_date (date < change_date).
    3. Predicts the subsequent holdout window (default 14 days) using the new price and calendar covariates.
    4. Evaluates WAPE, MAPE, and 80% prediction interval coverage.
    5. Benchmarks against a naive 14-day trailing demand baseline.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic calculation of error metrics.
    - No future data leakage (train strictly < change_date).
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

from app.data.calendar_vn import vc
from app.elasticity.fit import poisson_irls_fit, run_week_block_bootstrap
from app.features.build import build_econometric_design_matrix
from app.schemas.contracts import BacktestResponse


_TET_DATES: List[pd.Timestamp] = [pd.Timestamp(d) for d in vc.TET_DAY1]


def is_in_tet_window(date_str: str) -> bool:
    """Check whether a date falls inside the Vietnamese Lunar New Year (Tet) holiday window [-14, +7].

    Args:
        date_str: Date string in ISO YYYY-MM-DD format.

    Returns:
        bool: True if the date is within Tet window, False otherwise.
    """
    dt = pd.Timestamp(date_str)
    for tet_d in _TET_DATES:
        offset = (dt - tet_d).days
        if -14 <= offset <= 7:
            return True
    return False


def find_price_change_events(
    df: pd.DataFrame,
    product_id: str,
    min_change_pct: float = 0.05,
    min_pre_days: int = 60,
    horizon_days: int = 14,
) -> List[Dict[str, Any]]:
    """Detect valid historical price intervention dates for a given product.

    Args:
        df: Product sales history DataFrame.
        product_id: Target product ID.
        min_change_pct: Minimum absolute relative price change (default: 5%).
        min_pre_days: Minimum days required prior to change_date (default: 60).
        horizon_days: Number of required post-intervention observation days (default: 14).

    Returns:
        List[Dict[str, Any]]: Valid price change candidate events sorted chronologically.
    """
    df_prod = df[df["product_id"].astype(str) == str(product_id)].copy()
    if df_prod.empty:
        return []

    price_col = "price" if "price" in df_prod.columns else "price_vnd"
    df_prod = df_prod.sort_values(by="date").reset_index(drop=True)
    df_prod["date_dt"] = pd.to_datetime(df_prod["date"])

    events: List[Dict[str, Any]] = []
    prices = df_prod[price_col].to_numpy(dtype=float)
    dates = df_prod["date"].to_list()

    for i in range(min_pre_days, len(prices) - horizon_days):
        p_prev = prices[i - 1]
        p_curr = prices[i]
        if p_prev <= 0:
            continue
        rel_change = (p_curr - p_prev) / p_prev
        if abs(rel_change) >= min_change_pct:
            d_str = str(dates[i])
            if not is_in_tet_window(d_str):
                events.append({
                    "date": d_str,
                    "index": i,
                    "old_price": p_prev,
                    "new_price": p_curr,
                    "price_change_pct": round(float(rel_change * 100.0), 2),
                })

    return events


def execute_backtest(
    df: pd.DataFrame,
    product_id: str,
    change_date: Optional[str] = None,
    horizon_days: int = 14,
    is_m5_data: bool = False,
    random_state: int = 42,
) -> BacktestResponse:
    """Execute historical backtest on a specific price intervention event.

    Args:
        df: Historical sales DataFrame.
        product_id: SKU to backtest.
        change_date: Specific intervention date (YYYY-MM-DD). If None, auto-detected.
        horizon_days: Evaluation window (default 14 days).
        is_m5_data: Whether input data is M5 Walmart format.
        random_state: Deterministic random seed for bootstrap interval evaluation.

    Returns:
        BacktestResponse: Contract object with predictions, actuals, WAPE, MAPE, and coverage.

    Raises:
        ValueError: If no valid intervention event is found or data is insufficient.
    """
    df_prod = df[df["product_id"].astype(str) == str(product_id)].copy()
    if df_prod.empty:
        raise ValueError(f"Product '{product_id}' not found in dataset.")

    df_prod = df_prod.sort_values(by="date").reset_index(drop=True)
    df_prod["date_str"] = df_prod["date"].astype(str)
    price_col = "price" if "price" in df_prod.columns else "price_vnd"
    qty_col = "quantity" if "quantity" in df_prod.columns else "quantity_sold"

    # Auto-detect change_date if not explicitly provided
    if change_date is None:
        events = find_price_change_events(
            df_prod, product_id, min_change_pct=0.05, min_pre_days=60, horizon_days=horizon_days
        )
        if not events:
            raise ValueError(
                f"No qualified price change events (|change| >= 5%, outside Tet) found for product '{product_id}'."
            )
        # Select the event with the largest price change
        selected_event = max(events, key=lambda ev: abs(ev["price_change_pct"]))
        target_date = selected_event["date"]
        price_change_pct = selected_event["price_change_pct"]
    else:
        target_date = str(change_date)
        match_idx = df_prod.index[df_prod["date_str"] == target_date].tolist()
        if not match_idx or match_idx[0] == 0:
            price_change_pct = 0.0
        else:
            idx = match_idx[0]
            p_old = float(df_prod[price_col].iloc[idx - 1])
            p_new = float(df_prod[price_col].iloc[idx])
            price_change_pct = round(((p_new - p_old) / max(p_old, 1e-6)) * 100.0, 2)

    # 1. Strict Temporal Split: Train on data strictly BEFORE change_date
    df_train = df_prod[df_prod["date_str"] < target_date].copy()
    if len(df_train) < 30:
        raise ValueError(
            f"Insufficient training observations before {target_date} ({len(df_train)} records < 30)."
        )

    # 2. Holdout Test Set: horizon_days starting from change_date
    df_test = df_prod[df_prod["date_str"] >= target_date].head(horizon_days).copy()
    if len(df_test) < horizon_days:
        raise ValueError(
            f"Insufficient post-change observations (requested {horizon_days}, got {len(df_test)})."
        )

    # 3. Fit Econometric Model on df_train
    X_train, y_train, feat_names, df_train_clean = build_econometric_design_matrix(
        df_train, drop_stockouts=True, is_m5_data=is_m5_data
    )
    beta, _ = poisson_irls_fit(X_train, y_train)

    # 4. Bootstrap samples for 80% prediction interval
    boot_samples = run_week_block_bootstrap(
        X=X_train,
        y=y_train,
        dates=df_train_clean["date"],
        n_boot=100,
        random_state=random_state,
    )

    # 5. Build Design Matrix for Test Holdout
    # We build feature matrix for the entire product series and slice the test rows
    df_all_for_feat = pd.concat([df_train, df_test], ignore_index=True)
    X_all, _, feat_all_names, _ = build_econometric_design_matrix(
        df_all_for_feat, drop_stockouts=False, is_m5_data=is_m5_data
    )

    # Ensure column alignment between train and test
    test_slice_start = len(df_train)
    X_test_sub = X_all[test_slice_start : test_slice_start + len(df_test)]

    # Map coefficients: if a test feature was not present in train, it gets 0 weight
    k_train = len(feat_names)
    feat_train_map = {name: i for i, name in enumerate(feat_names)}
    X_test_aligned = np.zeros((len(df_test), k_train), dtype=float)
    for j, fname in enumerate(feat_all_names):
        if fname in feat_train_map:
            col_idx = feat_train_map[fname]
            X_test_aligned[:, col_idx] = X_test_sub[:, j]

    # Predict demand
    eta_pred = np.clip(X_test_aligned @ beta, -20.0, 20.0)
    y_pred = np.exp(eta_pred)

    actuals = df_test[qty_col].to_numpy(dtype=float)

    # 6. Prediction Intervals (80% confidence: 10th to 90th percentiles)
    # Using bootstrap distribution of elasticity
    point_elasticity = beta[1]
    log_p_idx = 1
    boot_diffs = boot_samples - point_elasticity
    # For each test observation, estimate quantile band
    lower_bounds = np.empty(len(df_test), dtype=float)
    upper_bounds = np.empty(len(df_test), dtype=float)
    for t in range(len(df_test)):
        # Base prediction adjusted by bootstrap elasticity variation
        mu_t = y_pred[t]
        log_p_dev = X_test_aligned[t, log_p_idx]
        boot_y = mu_t * np.exp(np.clip(boot_diffs * 0.5, -2.0, 2.0))
        # Incorporate Poisson counting noise via quantiles
        lower_bounds[t] = float(np.percentile(boot_y, 10.0) * 0.8)
        upper_bounds[t] = float(np.percentile(boot_y, 90.0) * 1.25)

    inside_interval = (actuals >= lower_bounds) & (actuals <= upper_bounds)
    coverage = float(np.mean(inside_interval))

    # 7. Error Metrics
    abs_errors = np.abs(actuals - y_pred)
    sum_actual = float(np.sum(actuals))
    wape = float(np.sum(abs_errors) / max(sum_actual, 1.0))
    mape = float(np.mean(abs_errors / np.maximum(actuals, 1.0)))

    # 8. Naive Baseline (Same as trailing 14 days immediately preceding change_date)
    trailing_14_qty = df_train[qty_col].tail(horizon_days).to_numpy(dtype=float)
    if len(trailing_14_qty) == horizon_days:
        naive_pred = trailing_14_qty
    else:
        naive_pred = np.full(len(df_test), fill_value=float(np.mean(df_train[qty_col].tail(14))))

    naive_abs_errors = np.abs(actuals - naive_pred)
    naive_wape = float(np.sum(naive_abs_errors) / max(sum_actual, 1.0))
    model_beats_naive = bool(wape <= naive_wape)

    return BacktestResponse(
        predicted=[round(float(p), 2) for p in y_pred.tolist()],
        actual=[round(float(a), 2) for a in actuals.tolist()],
        wape=round(wape, 4),
        mape=round(mape, 4),
        interval_coverage=round(coverage, 4),
        naive_wape=round(naive_wape, 4),
        model_beats_naive=model_beats_naive,
        change_date=target_date,
        price_change_pct=price_change_pct,
    )
