"""Compare scenarios side by side, always including 'do nothing'."""
import numpy as np
import pandas as pd

from src.scenarios.montecarlo import draw_uniform, summarize
from src.scenarios.freight_policy import freight_deltas, breakeven_uplift
from src.scenarios.seller_probation import (
    seller_stats, worst_sellers, probation_facts,
    probation_deltas, breakeven_late_cost,
)
from src.scenarios.delivery_promise import (
    promise_facts, promise_deltas, breakeven_conversion_loss,
)


def probability_best(delta_matrix: np.ndarray) -> np.ndarray:
    """Share of draws in which each scenario (row) has the highest delta."""
    winners = delta_matrix.argmax(axis=0)
    return np.bincount(winners, minlength=delta_matrix.shape[0]) / delta_matrix.shape[1]


def compare_freight_thresholds(orders: pd.DataFrame, thresholds: list[float],
                               take_rate: float = 0.15,
                               uplift_range: tuple[float, float] = (0.0, 0.30),
                               n_draws: int = 5000, seed: int = 42,
                               freight_states: list[str] | None = None,
                               subsidy_share: float = 1.0) -> pd.DataFrame:
    """One row per free-freight threshold plus a 'do nothing' row."""
    # Same uplift draws for every scenario, so the comparison is fair.
    uplifts = draw_uniform(*uplift_range, n_draws, seed)

    state_label = f", {'/'.join(freight_states)}" if freight_states is not None else ""
    names = ["do nothing"] + [
        f"freight >= R${t:g}, {subsidy_share:.0%} subsidy{state_label}"
        for t in thresholds
    ]
    deltas = [np.zeros(n_draws)] + [
        freight_deltas(
            orders, t, take_rate, uplifts,
            states=freight_states, subsidy_share=subsidy_share,
        )
        for t in thresholds
    ]
    breakevens = [None] + [
        breakeven_uplift(
            orders, t, take_rate,
            states=freight_states, subsidy_share=subsidy_share,
        )
        for t in thresholds
    ]
    p_best = probability_best(np.vstack(deltas))

    rows = [
        {"scenario": name, **summarize(d), "p_best": pb, "breakeven_uplift": be}
        for name, d, pb, be in zip(names, deltas, p_best, breakevens)
    ]
    return pd.DataFrame(rows).sort_values("expected", ascending=False).reset_index(drop=True)


def compare_policies(orders: pd.DataFrame, seller_orders_df: pd.DataFrame,
                     thresholds: list[float], probation_ks: list[int],
                     take_rate: float = 0.15,
                     uplift_range: tuple[float, float] = (0.0, 0.30),
                     absorbed_range: tuple[float, float] = (0.5, 0.9),
                     late_cost_range: tuple[float, float] = (0.0, 30.0),
                     min_orders: int = 20,
                     n_draws: int = 5000, seed: int = 42,
                     freight_states: list[str] | None = None,
                     subsidy_share: float = 1.0,
                     promise_states: list[str] | None = None,
                     pad_days_options: list[int] | None = None,
                     conversion_loss_range: tuple[float, float] = (0.0, 0.15)
                     ) -> pd.DataFrame:
    """Freight and probation scenarios in ONE table, plus 'do nothing'."""
    uplifts = draw_uniform(*uplift_range, n_draws, seed)
    absorbed = draw_uniform(*absorbed_range, n_draws, seed + 1)
    late_costs = draw_uniform(*late_cost_range, n_draws, seed + 2)

    names = ["do nothing"]
    deltas = [np.zeros(n_draws)]
    breakevens = ["-"]

    for t in thresholds:
        state_label = f", {'/'.join(freight_states)}" if freight_states is not None else ""
        names.append(f"freight >= R${t:g}, {subsidy_share:.0%} subsidy{state_label}")
        deltas.append(
            freight_deltas(
                orders, t, take_rate, uplifts,
                states=freight_states, subsidy_share=subsidy_share,
            )
        )
        breakeven = breakeven_uplift(
            orders, t, take_rate,
            states=freight_states, subsidy_share=subsidy_share,
        )
        breakevens.append(f"uplift {breakeven:.0%}")

    stats = seller_stats(seller_orders_df)
    mid_absorbed = sum(absorbed_range) / 2
    for k in probation_ks:
        facts = probation_facts(seller_orders_df, worst_sellers(stats, k, min_orders))
        names.append(f"probation: worst {k} sellers")
        deltas.append(probation_deltas(facts, take_rate, absorbed, late_costs))
        be = breakeven_late_cost(facts, take_rate, mid_absorbed)
        breakevens.append(f"late cost R${be:.0f}")

    if promise_states is not None and pad_days_options is not None:
        conversion_losses = draw_uniform(
            *conversion_loss_range, n_draws, seed + 3
        )
        mid_late_cost = sum(late_cost_range) / 2
        for pad in pad_days_options:
            facts = promise_facts(orders, promise_states, pad)
            names.append(f"promise +{pad}d, " + "/".join(promise_states))
            deltas.append(
                promise_deltas(facts, take_rate, conversion_losses, late_costs)
            )
            break_even = breakeven_conversion_loss(
                facts, take_rate, mid_late_cost
            )
            breakevens.append(f"conv. loss {break_even:.0%}")

    p_best = probability_best(np.vstack(deltas))
    rows = [
        {"scenario": n, **summarize(d), "p_best": pb, "breakeven": be}
        for n, d, pb, be in zip(names, deltas, p_best, breakevens)
    ]
    return pd.DataFrame(rows).sort_values("expected", ascending=False).reset_index(drop=True)