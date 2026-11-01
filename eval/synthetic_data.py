"""Generate synthetic marketplace worlds and independent scenario truths."""

import numpy as np
import pandas as pd


STATES = ["SP", "MG", "RJ", "MA", "CE", "PA"]
STATE_PROBS = [0.40, 0.20, 0.15, 0.10, 0.08, 0.07]
SLOW_STATES = ["MA", "CE", "PA"]
TRUE = {
    "take_rate": 0.10,
    "absorbed_share": 0.70,
    "conversion_loss": 0.03,
    "late_cost": 25.0,
}


def make_world(
    kind: str,
    n_orders: int = 60000,
    seed: int = 0,
) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """Create reproducible synthetic orders, items, and planted bad sellers."""
    if kind not in {"seller_driven", "carrier_driven", "neutral"}:
        raise ValueError(f"Unknown world kind: {kind}")
    rng = np.random.default_rng(seed)
    states = rng.choice(STATES, size=n_orders, p=STATE_PROBS)
    seller_ids = np.array([f"seller_{index:03d}" for index in range(200)])
    bad_sellers = seller_ids[:10].tolist() if kind == "seller_driven" else []
    weights = np.ones(200)
    if bad_sellers:
        weights[:10] = 2
    selected_sellers = rng.choice(seller_ids, size=n_orders, p=weights / weights.sum())
    handoff = rng.poisson(3, size=n_orders)
    if bad_sellers:
        handoff += np.isin(selected_sellers, bad_sellers) * 9
    transit = rng.normal(8, 2, size=n_orders)
    if kind == "carrier_driven":
        transit += np.isin(states, SLOW_STATES) * 5
    promised_days = 26 if kind == "neutral" else 17
    delay = np.rint(handoff + transit - promised_days + rng.normal(0, 4, n_orders)).astype(int)
    gmv = rng.gamma(2, 60, size=n_orders)
    freight = rng.gamma(2, 10, size=n_orders)
    order_ids = [f"order_{index:06d}" for index in range(n_orders)]
    orders = pd.DataFrame(
        {
            "order_id": order_ids,
            "customer_state": states,
            "gmv": gmv,
            "freight": freight,
            "delay_days": delay,
            "seller_handoff_days": handoff,
        }
    )
    items = orders.copy()
    items["seller_id"] = selected_sellers
    items["price"] = items["gmv"]
    return orders, items, bad_sellers


def promise_truth(
    orders: pd.DataFrame,
    states: list[str],
    pad_days: int,
    conversion_loss: float,
    seed: int = 1,
    reps: int = 50,
) -> tuple[float, float]:
    """Average simulated avoided late orders and GMV lost; dropped orders are not rescued."""
    selected = orders.loc[orders["customer_state"].isin(states)]
    rng = np.random.default_rng(seed)
    avoided_counts = []
    gmv_losses = []
    for _ in range(reps):
        dropped = rng.random(len(selected)) < conversion_loss
        surviving = selected.loc[~dropped]
        rescued = (
            (surviving["delay_days"] > 0)
            & (surviving["delay_days"] - pad_days <= 0)
        )
        avoided_counts.append(int(rescued.sum()))
        gmv_losses.append(float(selected.loc[dropped, "gmv"].sum()))
    return float(np.mean(avoided_counts)), float(np.mean(gmv_losses))


def probation_truth(
    seller_orders_df: pd.DataFrame,
    removed_ids: list[str],
    absorbed_share: float,
    seed: int = 2,
    reps: int = 50,
) -> tuple[float, float]:
    """Average simulated avoided late orders and lost GMV using bootstrap absorption."""
    removed = seller_orders_df.loc[seller_orders_df["seller_id"].isin(removed_ids)]
    remaining = seller_orders_df.loc[~seller_orders_df["seller_id"].isin(removed_ids)]
    remaining_late = remaining["is_late"].to_numpy(dtype=bool)
    rng = np.random.default_rng(seed)
    avoided_counts = []
    gmv_losses = []
    for _ in range(reps):
        absorbed = rng.random(len(removed)) < absorbed_share
        absorbed_count = int(absorbed.sum())
        if absorbed_count and len(remaining_late):
            absorbed_late = rng.choice(remaining_late, size=absorbed_count, replace=True)
            new_late_count = int(absorbed_late.sum())
        else:
            new_late_count = 0
        avoided_counts.append(int(removed["is_late"].sum()) - new_late_count)
        gmv_losses.append(float(removed.loc[~absorbed, "gmv"].sum()))
    return float(np.mean(avoided_counts)), float(np.mean(gmv_losses))


def true_delta(
    avoided: float,
    gmv_lost: float,
    take_rate: float,
    late_cost: float,
) -> float:
    """Calculate simulated policy value from avoided lateness and lost GMV."""
    return late_cost * avoided - take_rate * gmv_lost
