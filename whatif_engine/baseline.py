"""Baseline demand normalization and projection module for What-If AI.

Calculates the business baseline representing the current operating state.
Normalizes historical sales volume to today's active price using the estimated
price elasticity coefficient:
    Q_normalized = Q_historical * (P_today / P_historical) ** elasticity

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic calculations using Pandas and NumPy.
"""

from __future__ import annotations

from typing import Dict, Optional
import numpy as np
import pandas as pd


DEFAULT_LOOKBACK_DAYS: int = 90
DEFAULT_HORIZON_DAYS: int = 30


def build_baseline_demand(
    df: pd.DataFrame,
    point_elasticity: float,
    lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    horizon_days: int = DEFAULT_HORIZON_DAYS,
) -> Dict[str, float]:
    """Establish monthly baseline metrics normalized to today's active catalog price.

    Historical daily sales within the lookback window are scaled to the most recent active
    selling price to eliminate distortion from earlier discounts or promotions.

    Formula:
        Price_Ratio = P_today / P_historical
        Daily_Normalized_Qty = Q_historical * (Price_Ratio ** elasticity)
        Monthly_Baseline_Qty = mean(Daily_Normalized_Qty) * horizon_days

    Args:
        df: Historical sales DataFrame containing 'date', 'price', 'cost', and 'sales_volume'.
        point_elasticity: Central estimated price elasticity coefficient (typically negative).
        lookback_days: Recent historical window in days (default: 90 days).
        horizon_days: Forward projection window in days (default: 30 days).

    Returns:
        Dict[str, float]: Baseline operational metrics containing:
            - 'price': Current active price in VND.
            - 'unit_cost': Current active unit cost in VND.
            - 'monthly_qty': Normalized monthly unit demand.
            - 'monthly_revenue': Projected baseline monthly gross revenue.
            - 'monthly_spend': Projected baseline monthly cost of goods sold.
            - 'monthly_profit': Projected baseline monthly gross profit.

    Raises:
        ValueError: If df is empty or missing required columns.
    """
    required_cols = {"date", "price", "cost", "sales_volume"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns in DataFrame: {missing}")

    if df.empty:
        raise ValueError("Cannot establish baseline demand from an empty DataFrame.")

    # Filter to recent lookback window
    recent_df = df.sort_values(by="date").tail(lookback_days).copy()
    if recent_df.empty:
        raise ValueError("No records found within the specified lookback window.")

    today_price = float(recent_df["price"].iloc[-1])
    unit_cost = float(recent_df["cost"].iloc[-1])

    hist_prices = recent_df["price"].to_numpy(dtype=float)
    hist_quantities = recent_df["sales_volume"].to_numpy(dtype=float)

    # Elasticity-adjusted daily volume normalization
    price_ratio = today_price / np.maximum(hist_prices, 1e-6)
    normalized_daily_qty = hist_quantities * (price_ratio**point_elasticity)

    # Scale to monthly projection
    monthly_qty = float(np.mean(normalized_daily_qty) * horizon_days)
    monthly_qty = max(monthly_qty, 0.0)

    monthly_revenue = monthly_qty * today_price
    monthly_spend = monthly_qty * unit_cost
    monthly_profit = monthly_revenue - monthly_spend

    return {
        "price": today_price,
        "unit_cost": unit_cost,
        "monthly_qty": monthly_qty,
        "monthly_revenue": monthly_revenue,
        "monthly_spend": monthly_spend,
        "monthly_profit": monthly_profit,
    }

