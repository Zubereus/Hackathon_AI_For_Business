"""Econometric Price Elasticity Module for What-If AI.

Mathematical Foundation:
    Constant Elasticity Demand Model (Log-Log Specification)
    ---------------------------------------------------------
    In microeconomics, consumer demand under price changes is modeled as:
        Q = A * (P ^ beta_1) * exp(beta_2 * Promo + Controls + epsilon)

    Taking the natural logarithm of both sides linearizes the equation:
        ln(Q) = beta_0 + beta_1 * ln(P) + beta_2 * Promo + beta_3 * Weekend
                + beta_4 * sin(2 * pi * t / 365.25) + beta_5 * cos(2 * pi * t / 365.25) + epsilon

    Interpretation of Parameters:
        - beta_1 = d(ln Q) / d(ln P) = (dQ / Q) / (dP / P):
          The Price Elasticity of Demand (PED).
          By the Law of Demand, beta_1 < 0 (an increase in price leads to a decrease in demand).
        - beta_2: Log-scale sales volume lift during active promotion periods.
        - beta_3: Weekend shopping multiplier effect.
        - beta_4, beta_5: Harmonic Fourier terms capturing smooth annual seasonality.

    Point Prediction Formulation:
        Given an estimated model and a candidate price P_new:
            ln(Q_pred) = beta_0 + beta_1 * ln(P_new) + Controls_mean
            Q_pred = exp(ln(Q_pred))

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: All regressions executed via statsmodels.api.OLS and NumPy.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
import statsmodels.api as sm


DEFAULT_DATASET_PATH: str = os.path.join("data", "retail_sales_synthetic.csv")

# Global registry storing trained model wrappers per product_id for fast inference
_TRAINED_MODELS: Dict[str, sm.regression.linear_model.RegressionResultsWrapper] = {}
_PRODUCT_DATA_CACHE: Dict[str, pd.DataFrame] = {}


def prepare_econometric_features(df: pd.DataFrame) -> pd.DataFrame:
    """Prepare log-transformed and calendar control features for regression.

    Transforms:
        - log_sales = ln(sales_volume) (clamped to min 1e-6 to avoid ln(0))
        - log_price = ln(price)
        - weekend = binary indicator for Saturday and Sunday
        - sin_season = sin(2 * pi * day_of_year / 365.25)
        - cos_season = cos(2 * pi * day_of_year / 365.25)

    Args:
        df: Input DataFrame containing 'date', 'price', 'sales_volume',
            and 'promotion_flag'.

    Returns:
        pd.DataFrame: Augmented DataFrame with regression feature columns.

    Raises:
        ValueError: If required columns are absent.
    """
    required_cols = {"date", "price", "sales_volume", "promotion_flag"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in DataFrame: {missing}")

    df_clean = df.copy()
    dates = pd.to_datetime(df_clean["date"])
    day_of_year = dates.dt.dayofyear.to_numpy()

    # Avoid ln(0) or ln(negative)
    sales_clamped = np.maximum(df_clean["sales_volume"].to_numpy(dtype=float), 1e-6)
    prices_clamped = np.maximum(df_clean["price"].to_numpy(dtype=float), 1e-6)

    df_clean["log_sales"] = np.log(sales_clamped)
    df_clean["log_price"] = np.log(prices_clamped)
    df_clean["weekend"] = (dates.dt.dayofweek >= 5).astype(float).to_numpy()
    df_clean["sin_season"] = np.sin(2.0 * np.pi * day_of_year / 365.25)
    df_clean["cos_season"] = np.cos(2.0 * np.pi * day_of_year / 365.25)

    return df_clean


def fit_loglog_elasticity(
    df: pd.DataFrame,
) -> sm.regression.linear_model.RegressionResultsWrapper:
    """Fit an Ordinary Least Squares (OLS) log-log regression model using statsmodels.

    Specification:
        log_sales = beta_0 + beta_1 * log_price + beta_2 * promotion_flag
                    + beta_3 * weekend + beta_4 * sin_season + beta_5 * cos_season + e

    Args:
        df: Product sales history DataFrame.

    Returns:
        sm.regression.linear_model.RegressionResultsWrapper: Fitted statsmodels OLS results.

    Raises:
        ValueError: If DataFrame contains fewer than 10 records.
    """
    if len(df) < 10:
        raise ValueError(f"Insufficient data to fit model: {len(df)} records (minimum 10).")

    df_feat = prepare_econometric_features(df)

    feature_cols = ["log_price", "promotion_flag", "weekend", "sin_season", "cos_season"]
    X = df_feat[feature_cols].to_numpy(dtype=float)
    X = sm.add_constant(X)  # Adds column 0: intercept beta_0
    y = df_feat["log_sales"].to_numpy(dtype=float)

    model = sm.OLS(y, X)
    results = model.fit()
    return results


def get_elasticity_coefficient(
    model_results: sm.regression.linear_model.RegressionResultsWrapper,
) -> float:
    """Extract the price elasticity coefficient (beta_1) from a fitted model.

    In the design matrix, column 0 is the constant intercept, and column 1
    corresponds to log_price.

    Args:
        model_results: Fitted statsmodels RegressionResultsWrapper.

    Returns:
        float: Estimated price elasticity of demand coefficient.
    """
    # Parameter index 1 corresponds to log_price
    return float(model_results.params[1])


def train_and_register_product_model(
    product_id: str,
    df: pd.DataFrame,
) -> sm.regression.linear_model.RegressionResultsWrapper:
    """Fit and cache an elasticity model for a specific product_id.

    Args:
        product_id: Unique product SKU (e.g. 'PROD_01').
        df: Sales history DataFrame containing records for product_id.

    Returns:
        sm.regression.linear_model.RegressionResultsWrapper: Fitted model results.

    Raises:
        ValueError: If no records match product_id.
    """
    product_id_clean = product_id.strip().upper()
    subset = df[df["product_id"].astype(str).str.upper() == product_id_clean].copy()
    if subset.empty:
        raise ValueError(f"No records found for product_id '{product_id}'.")

    model_res = fit_loglog_elasticity(subset)
    _TRAINED_MODELS[product_id_clean] = model_res
    _PRODUCT_DATA_CACHE[product_id_clean] = subset
    return model_res


def predict_baseline(
    product_id: str,
    new_price: float,
    df: Optional[pd.DataFrame] = None,
    model: Optional[sm.regression.linear_model.RegressionResultsWrapper] = None,
) -> float:
    """Predict expected sales volume for a product at candidate new_price.

    Mathematical Calculation:
        Given candidate price P_new, calculates expected daily unit volume
        by evaluating the fitted log-log OLS equation at neutral/average control variables:
            ln(Q_pred) = beta_0 + beta_1 * ln(P_new) + beta_2 * mean(promo)
                         + beta_3 * mean(weekend) + beta_4 * mean(sin) + beta_5 * mean(cos)
            Q_pred = max(exp(ln(Q_pred)), 0.0)

    Args:
        product_id: Unique product SKU (e.g. 'PROD_01').
        new_price: Candidate unit price in VND (must be strictly positive).
        df: Optional historical DataFrame. If None, uses cached or default dataset.
        model: Optional pre-fitted statsmodels OLS model. If None, trains or retrieves from cache.

    Returns:
        float: Predicted expected daily sales volume (single-point estimate).

    Raises:
        ValueError: If new_price <= 0.0 or product_id cannot be found.
    """
    if new_price <= 0.0:
        raise ValueError(f"new_price must be strictly positive, got {new_price}.")

    product_id_clean = product_id.strip().upper()

    # 1. Resolve dataset and model
    if model is not None:
        active_model = model
        # Resolve feature means from df or cache
        if df is not None:
            active_df = df[df["product_id"].astype(str).str.upper() == product_id_clean]
        else:
            active_df = _PRODUCT_DATA_CACHE.get(product_id_clean)
    else:
        # Check cache
        if product_id_clean in _TRAINED_MODELS:
            active_model = _TRAINED_MODELS[product_id_clean]
            active_df = _PRODUCT_DATA_CACHE[product_id_clean]
        else:
            # Need to train model
            if df is None:
                if os.path.exists(DEFAULT_DATASET_PATH):
                    df = pd.read_csv(DEFAULT_DATASET_PATH)
                else:
                    from whatif_engine.data_generator import generate_retail_data
                    df = generate_retail_data(n_days=365, random_state=42)

            active_model = train_and_register_product_model(product_id_clean, df)
            active_df = _PRODUCT_DATA_CACHE[product_id_clean]

    # 2. Build exogenous evaluation vector
    # Evaluate at mean of control variables to isolate the pure price effect
    if active_df is not None and not active_df.empty:
        feat_df = prepare_econometric_features(active_df)
        mean_promo = float(feat_df["promotion_flag"].mean())
        mean_weekend = float(feat_df["weekend"].mean())
        mean_sin = float(feat_df["sin_season"].mean())
        mean_cos = float(feat_df["cos_season"].mean())
    else:
        mean_promo = 0.15
        mean_weekend = 2.0 / 7.0
        mean_sin = 0.0
        mean_cos = 0.0

    log_new_price = np.log(new_price)
    # exog layout: [const, log_price, promotion_flag, weekend, sin_season, cos_season]
    exog = np.array([1.0, log_new_price, mean_promo, mean_weekend, mean_sin, mean_cos])

    # 3. Predict log(sales) and transform back to natural units
    log_sales_pred = float(active_model.predict(exog)[0])

    # Guard against numeric overflow on extreme price drops
    log_sales_clamped = np.clip(log_sales_pred, -20.0, 20.0)
    sales_pred = float(np.exp(log_sales_clamped))

    return max(sales_pred, 0.0)
