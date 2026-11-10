"""Feature engineering and econometric design matrix builder for What-If AI.

Implements Specification C from data/synthetic/check_elasticity_v2.py:
    1. Intercept (beta_0)
    2. ln(price) (beta_1, parameter of interest: price elasticity)
    3. Weekend indicator (Saturday / Sunday)
    4. Promotion flag
    5. Holiday flag / Vietnamese event windows (pre-far, pre-near, day, post per family)
    6. Annual harmonic seasonality: sin(2*pi*doy/365.25), cos(2*pi*doy/365.25)
    7. Payday window (days 5 to 10 of each month)
    8. Linear time trend: (date - min_date) / 365.25
    9. Censored demand handling: Drops stockout days (stock == 0)

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic feature array construction via NumPy and Pandas.
"""

from __future__ import annotations

import os
import sys
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

from app.data.calendar_vn import extract_vn_event_features


def build_econometric_design_matrix(
    df: pd.DataFrame,
    drop_stockouts: bool = True,
    is_m5_data: bool = False,
) -> Tuple[np.ndarray, np.ndarray, List[str], pd.DataFrame]:
    """Construct full Spec-C econometric design matrix and target demand vector.

    Args:
        df: Input sales DataFrame with canonical columns ('date', 'price', 'quantity',
            optional 'stock', 'promo', 'extra_snap', 'extra_event').
        drop_stockouts: If True, filters out days where stock == 0 (censored demand).
        is_m5_data: If True, incorporates M5 dataset-specific SNAP and event covariates.

    Returns:
        Tuple containing:
            - X (np.ndarray): 2D design matrix of shape (N, K).
            - y (np.ndarray): Target sales volume array of shape (N,).
            - feature_names (List[str]): List of column names in X.
            - clean_df (pd.DataFrame): Filtered DataFrame corresponding to rows in X and y.

    Raises:
        ValueError: If mandatory columns are missing or insufficient records remain.
    """
    df_clean = df.copy()

    # 1. Filter censored demand: drop days where stock == 0
    if drop_stockouts:
        stock_col = "stock" if "stock" in df_clean.columns else ("stock_on_hand" if "stock_on_hand" in df_clean.columns else None)
        if stock_col:
            df_clean = df_clean[df_clean[stock_col] > 0].copy()

    # Require non-negative volume and positive price
    price_col = "price" if "price" in df_clean.columns else "price_vnd"
    qty_col = "quantity" if "quantity" in df_clean.columns else "quantity_sold"

    df_clean = df_clean[(df_clean[price_col] > 0) & (df_clean[qty_col] >= 0)].copy()
    if len(df_clean) < 10:
        raise ValueError(f"Insufficient usable observations ({len(df_clean)} records).")

    df_clean = df_clean.sort_values(by="date").reset_index(drop=True)
    dates = pd.to_datetime(df_clean["date"])
    doy = dates.dt.dayofyear.to_numpy()

    # 2. Base controls
    intercept = np.ones(len(df_clean), dtype=float)
    log_price = np.log(df_clean[price_col].to_numpy(dtype=float))
    is_weekend = (dates.dt.dayofweek >= 5).astype(float).to_numpy()
    is_payday = dates.dt.day.between(5, 10).astype(float).to_numpy()
    sin_season = np.sin(2.0 * np.pi * doy / 365.25)
    cos_season = np.cos(2.0 * np.pi * doy / 365.25)
    trend = ((dates - dates.min()).dt.days / 365.25).to_numpy(dtype=float)

    promo_col = "promo" if "promo" in df_clean.columns else "promo_flag"
    promo = df_clean[promo_col].fillna(0).astype(float).to_numpy() if promo_col in df_clean.columns else np.zeros(len(df_clean))

    feature_cols: List[np.ndarray] = [
        intercept,
        log_price,
        is_weekend,
        is_payday,
        sin_season,
        cos_season,
        trend,
        promo,
    ]
    feature_names: List[str] = [
        "intercept",
        "log_price",
        "is_weekend",
        "is_payday",
        "sin_season",
        "cos_season",
        "trend",
        "promo",
    ]

    # 3. Calendar event covariates
    if is_m5_data:
        # For M5 Walmart public data: use extra_snap and extra_event
        if "extra_snap" in df_clean.columns:
            feature_cols.append(df_clean["extra_snap"].fillna(0).astype(float).to_numpy())
            feature_names.append("extra_snap")
        if "extra_event" in df_clean.columns:
            has_evt = (df_clean["extra_event"].astype(str).str.strip() != "").astype(float).to_numpy()
            feature_cols.append(has_evt)
            feature_names.append("extra_event")
    else:
        # Vietnamese Retail Calendar event windows
        event_df = extract_vn_event_features(dates)
        event_cols = [c for c in event_df.columns if c.startswith("evt_")]
        for c in event_cols:
            arr = event_df[c].to_numpy(dtype=float)
            # Only include event features that occur at least twice to avoid collinearity
            if np.sum(arr) >= 2.0:
                feature_cols.append(arr)
                feature_names.append(c)

    X = np.column_stack(feature_cols)
    y = df_clean[qty_col].to_numpy(dtype=float)

    return X, y, feature_names, df_clean

