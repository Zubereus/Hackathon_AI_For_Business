"""Scenario C: add delivery-estimate padding for selected customer states."""

import numpy as np
import pandas as pd


def promise_facts(
    orders: pd.DataFrame,
    states: list[str],
    pad_days: int,
) -> dict[str, int | float]:
    """Summarize orders, GMV, and late counts before and after estimate padding."""
    selected = orders[orders["customer_state"].isin(states)]
    orders_in_states = len(selected)
    gmv_in_states = float(selected["gmv"].sum())
    late_before = int((selected["delay_days"] > 0).sum())
    late_after = int((selected["delay_days"] - pad_days > 0).sum())
    late_rate_before = late_before / orders_in_states if orders_in_states else 0.0
    late_rate_after = late_after / orders_in_states if orders_in_states else 0.0
    return {
        "orders_in_states": orders_in_states,
        "gmv_in_states": gmv_in_states,
        "late_before": late_before,
        "late_after": late_after,
        "late_rate_before": late_rate_before,
        "late_rate_after": late_rate_after,
    }


def promise_deltas(
    facts: dict[str, int | float],
    take_rate: float,
    conversion_losses: np.ndarray,
    late_costs: np.ndarray,
) -> np.ndarray:
    """Calculate contribution change for each conversion-loss and late-cost draw."""
    avoided = (facts["late_before"] - facts["late_after"]) * (1 - conversion_losses)
    gmv_lost = facts["gmv_in_states"] * conversion_losses
    return late_costs * avoided - take_rate * gmv_lost


def breakeven_conversion_loss(
    facts: dict[str, int | float],
    take_rate: float,
    late_cost: float,
) -> float:
    """Return the conversion-loss share that makes the policy break even."""
    avoided_late_orders = facts["late_before"] - facts["late_after"]
    if avoided_late_orders <= 0:
        return float("inf")
    avoided_late_value = late_cost * avoided_late_orders
    return avoided_late_value / (
        avoided_late_value + take_rate * facts["gmv_in_states"]
    )
