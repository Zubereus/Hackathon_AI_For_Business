"""Scenario A: put the worst late-delivery sellers on probation (remove them).

Observed from the data:
    which sellers are worst, their orders, gmv and late orders,
    and the late rate of everyone else.
Assumptions (passed in, never hardcoded):
    absorbed_share  - share of the removed volume that other sellers pick up
    late_cost       - R$ cost of one late order (refunds, support, bad review)

    delta = late_cost * late_orders_avoided - take_rate * gmv_lost
"""
import numpy as np
import pandas as pd


def seller_orders(items: pd.DataFrame) -> pd.DataFrame:
    """One row per (seller, order) from the item-grain view."""
    grouped = items.groupby(["seller_id", "order_id"], as_index=False).agg(
        gmv=("price", "sum"),
        delay_days=("delay_days", "first"),
        handoff_days=("seller_handoff_days", "first"),
    )
    grouped["is_late"] = grouped["delay_days"] > 0
    return grouped


def seller_stats(so: pd.DataFrame) -> pd.DataFrame:
    """Orders, gmv, late rate and handoff time per seller."""
    return so.groupby("seller_id", as_index=False).agg(
        orders=("order_id", "count"),
        gmv=("gmv", "sum"),
        late_orders=("is_late", "sum"),
        late_rate=("is_late", "mean"),
        mean_handoff_days=("handoff_days", "mean"),
    )


def worst_sellers(stats: pd.DataFrame, k: int, min_orders: int) -> list[str]:
    """Ids of the k sellers with the highest late rate (volume floor applies)."""
    big_enough = stats[stats["orders"] >= min_orders]
    ranked = big_enough.sort_values(["late_rate", "orders"], ascending=False)
    return ranked["seller_id"].head(k).tolist()


def probation_facts(so: pd.DataFrame, removed_ids: list[str]) -> dict:
    """Observed numbers for the removed sellers and for the rest."""
    removed = so[so["seller_id"].isin(removed_ids)]
    rest = so[~so["seller_id"].isin(removed_ids)]
    return {
        "removed_orders": int(len(removed)),
        "removed_gmv": float(removed["gmv"].sum()),
        "removed_late_orders": int(removed["is_late"].sum()),
        "rest_late_rate": float(rest["is_late"].mean()),
        "share_of_orders": len(removed) / len(so),
    }


def late_orders_avoided(facts: dict, absorbed_share):
    """Late orders removed, minus late orders the absorbing sellers add."""
    new_late = absorbed_share * facts["removed_orders"] * facts["rest_late_rate"]
    return facts["removed_late_orders"] - new_late


def probation_deltas(facts: dict, take_rate: float,
                     absorbed_shares: np.ndarray, late_costs: np.ndarray) -> np.ndarray:
    """Change in contribution for each pair of assumption draws."""
    gmv_lost = facts["removed_gmv"] * (1 - absorbed_shares)
    margin_lost = take_rate * gmv_lost
    avoided = late_orders_avoided(facts, absorbed_shares)
    return late_costs * avoided - margin_lost


def breakeven_late_cost(facts: dict, take_rate: float, absorbed_share: float) -> float:
    """Cost per late order needed to break even. Infinity if nothing is avoided."""
    margin_lost = take_rate * facts["removed_gmv"] * (1 - absorbed_share)
    avoided = late_orders_avoided(facts, absorbed_share)
    return margin_lost / avoided if avoided > 0 else float("inf")
