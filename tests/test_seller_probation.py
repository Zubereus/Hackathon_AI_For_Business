"""Hand-checkable tests for the seller probation scenario."""
import numpy as np
import pandas as pd

from src.scenarios.seller_probation import (
    seller_stats, worst_sellers, probation_facts,
    probation_deltas, breakeven_late_cost,
)

# Seller A: 2 orders, both late.  Seller B: 3 orders, 1 late.
SO = pd.DataFrame({
    "seller_id": ["A", "A", "B", "B", "B"],
    "order_id":  ["o1", "o2", "o3", "o4", "o5"],
    "gmv":       [100.0] * 5,
    "handoff_days": [3.0] * 5,
    "is_late":   [True, True, False, False, True],
})


def test_worst_seller_is_a():
    stats = seller_stats(SO)
    assert worst_sellers(stats, k=1, min_orders=2) == ["A"]


def test_volume_floor_excludes_small_sellers():
    stats = seller_stats(SO)
    assert worst_sellers(stats, k=1, min_orders=3) == ["B"]


def test_delta_by_hand():
    facts = probation_facts(SO, ["A"])
    # removed: 2 orders, gmv 200, 2 late. rest late rate = 1/3
    # absorbed 0.5 -> gmv lost 100 -> margin lost 10 (take rate 0.1)
    # avoided = 2 - 0.5*2*(1/3) = 5/3 -> 30 * 5/3 = 50 -> delta = 40
    delta = probation_deltas(facts, 0.1, np.array([0.5]), np.array([30.0]))
    assert np.allclose(delta, [40.0])


def test_breakeven_by_hand():
    facts = probation_facts(SO, ["A"])
    # 10 / (5/3) = 6
    assert abs(breakeven_late_cost(facts, 0.1, 0.5) - 6.0) < 1e-9
