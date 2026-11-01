"""Scenario B: subsidized freight for orders above a threshold.

Money model (all in R$):
    gain  = extra_orders_share * take_rate * eligible_gmv
    cost  = subsidy_share * eligible_freight * (1 + extra_orders_share)
    delta = gain - cost          (change in contribution vs doing nothing)

The uplift (extra orders share) is NOT in the data. It is an assumption,
so we pass it in as an array of possible values. subsidy_share is the
assumed share of eligible freight covered by the policy.
"""
import numpy as np
import pandas as pd


def eligible_totals(
    orders: pd.DataFrame,
    threshold: float,
    states: list[str] | None = None,
) -> tuple[float, float]:
    """Total eligible gmv and freight, optionally limited to customer states."""
    eligible = orders[orders["gmv"] >= threshold]
    if states is not None:
        if "customer_state" not in orders.columns:
            raise ValueError("orders must include customer_state when states are set.")
        eligible = eligible[eligible["customer_state"].isin(states)]
    return float(eligible["gmv"].sum()), float(eligible["freight"].sum())


def freight_deltas(orders: pd.DataFrame, threshold: float,
                   take_rate: float, uplifts: np.ndarray,
                   states: list[str] | None = None,
                   subsidy_share: float = 1.0) -> np.ndarray:
    """Change in contribution for each possible uplift value."""
    gmv, freight = eligible_totals(orders, threshold, states)
    gain = uplifts * take_rate * gmv
    cost = subsidy_share * freight * (1 + uplifts)
    return gain - cost


def breakeven_uplift(orders: pd.DataFrame, threshold: float,
                     take_rate: float, states: list[str] | None = None,
                     subsidy_share: float = 1.0) -> float:
    """Uplift needed to break even. Infinity if it can never pay off."""
    gmv, freight = eligible_totals(orders, threshold, states)
    subsidized_freight = subsidy_share * freight
    denominator = take_rate * gmv - subsidized_freight
    return subsidized_freight / denominator if denominator > 0 else float("inf")