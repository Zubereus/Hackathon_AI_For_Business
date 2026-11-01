"""Compare delivery-promise and seller-probation policies across assumptions."""

import numpy as np
import pandas as pd

from src.scenarios.delivery_promise import promise_deltas
from src.scenarios.seller_probation import probation_deltas


def sensitivity_grid(
    promise_facts: dict[str, int | float],
    probation_facts: dict[str, int | float],
    take_rate: float,
    absorbed_share: float,
    late_costs: np.ndarray,
    conversion_losses: np.ndarray,
) -> pd.DataFrame:
    """Return policy deltas and the strictly profitable winner for each assumption pair."""
    rows = []
    for late_cost in late_costs:
        for conversion_loss in conversion_losses:
            promise_delta = float(
                promise_deltas(
                    promise_facts,
                    take_rate,
                    np.array([conversion_loss]),
                    np.array([late_cost]),
                )[0]
            )
            probation_delta = float(
                probation_deltas(
                    probation_facts,
                    take_rate,
                    np.array([absorbed_share]),
                    np.array([late_cost]),
                )[0]
            )
            if promise_delta > 0 and promise_delta > probation_delta:
                winner = "promise"
            elif probation_delta > 0 and probation_delta >= promise_delta:
                winner = "probation"
            else:
                winner = "do nothing"
            rows.append(
                {
                    "late_cost": float(late_cost),
                    "conversion_loss": float(conversion_loss),
                    "promise_delta": promise_delta,
                    "probation_delta": probation_delta,
                    "winner": winner,
                }
            )
    return pd.DataFrame(
        rows,
        columns=[
            "late_cost",
            "conversion_loss",
            "promise_delta",
            "probation_delta",
            "winner",
        ],
    )
