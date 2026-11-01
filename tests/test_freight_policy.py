"""Hand-checkable tests for the freight scenario."""
import numpy as np
import pandas as pd

from src.scenarios.freight_policy import freight_deltas, breakeven_uplift
from src.scenarios.compare import compare_freight_thresholds

# Orders at or above 100: gmv 150 + 300 = 450, freight 20 + 30 = 50
ORDERS = pd.DataFrame({
    "gmv":     [50.0, 150.0, 300.0],
    "freight": [10.0,  20.0,  30.0],
})
REGIONAL_ORDERS = pd.DataFrame({
    "customer_state": ["SP", "AM", "AM"],
    "gmv": [50.0, 150.0, 300.0],
    "freight": [10.0, 20.0, 30.0],
})


def test_deltas_by_hand():
    deltas = freight_deltas(ORDERS, threshold=100, take_rate=0.3,
                            uplifts=np.array([0.0, 0.5]))
    # uplift 0.0 -> 0 - 50*1.0              = -50
    # uplift 0.5 -> 0.5*0.3*450 - 50*1.5    = 67.5 - 75 = -7.5
    assert np.allclose(deltas, [-50.0, -7.5])


def test_breakeven_by_hand():
    # margin = 0.3*450 - 50 = 85 -> 50 / 85
    assert abs(breakeven_uplift(ORDERS, 100, 0.3) - 50 / 85) < 1e-9


def test_breakeven_infinite_when_margin_negative():
    assert breakeven_uplift(ORDERS, 100, 0.05) == float("inf")


def test_state_filtered_subsidy_deltas():
    deltas = freight_deltas(
        REGIONAL_ORDERS,
        threshold=100,
        take_rate=0.3,
        uplifts=np.array([0.0, 0.5]),
        states=["AM"],
        subsidy_share=0.5,
    )
    assert np.allclose(deltas, [-25.0, 30.0])


def test_state_filtered_subsidy_breakeven():
    assert abs(
        breakeven_uplift(
            REGIONAL_ORDERS,
            threshold=100,
            take_rate=0.3,
            states=["AM"],
            subsidy_share=0.5,
        )
        - 25 / 110
    ) < 1e-9


def test_state_filter_with_no_eligible_orders():
    deltas = freight_deltas(
        REGIONAL_ORDERS,
        threshold=100,
        take_rate=0.3,
        uplifts=np.array([0.0, 0.5]),
        states=["SP"],
        subsidy_share=0.5,
    )
    assert np.allclose(deltas, [0.0, 0.0])
    assert breakeven_uplift(
        REGIONAL_ORDERS,
        threshold=100,
        take_rate=0.3,
        states=["SP"],
        subsidy_share=0.5,
    ) == float("inf")


def test_compare_has_do_nothing_row():
    table = compare_freight_thresholds(ORDERS, [100, 200], take_rate=0.3,
                                       uplift_range=(0.0, 0.5), n_draws=200)
    assert "do nothing" in table["scenario"].values
    assert abs(table["p_best"].sum() - 1.0) < 1e-9