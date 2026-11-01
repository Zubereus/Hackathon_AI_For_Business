import numpy as np
import pandas as pd

from src.scenarios.delivery_promise import (
    breakeven_conversion_loss,
    promise_deltas,
    promise_facts,
)


ORDERS = pd.DataFrame(
    {
        "customer_state": ["AM", "AM", "SP", "SP"],
        "gmv": [100.0, 200.0, 300.0, 400.0],
        "delay_days": [5, -2, 2, 10],
    }
)


def test_promise_facts_for_selected_state():
    facts = promise_facts(ORDERS, states=["AM"], pad_days=5)

    assert facts == {
        "orders_in_states": 2,
        "gmv_in_states": 300.0,
        "late_before": 1,
        "late_after": 0,
        "late_rate_before": 0.5,
        "late_rate_after": 0.0,
    }


def test_promise_deltas_by_hand():
    facts = promise_facts(ORDERS, states=["AM"], pad_days=5)
    deltas = promise_deltas(
        facts,
        take_rate=0.1,
        conversion_losses=np.array([0.0, 0.5]),
        late_costs=np.array([30.0, 30.0]),
    )

    assert np.allclose(deltas, [30.0, 0.0])


def test_breakeven_conversion_loss_by_hand():
    facts = promise_facts(ORDERS, states=["AM"], pad_days=5)
    assert breakeven_conversion_loss(facts, take_rate=0.1, late_cost=30.0) == 0.5


def test_no_matching_orders_has_zero_rates_and_infinite_breakeven():
    facts = promise_facts(ORDERS, states=["XX"], pad_days=5)

    assert facts["late_rate_before"] == 0.0
    assert facts["late_rate_after"] == 0.0
    assert breakeven_conversion_loss(facts, take_rate=0.1, late_cost=30.0) == float("inf")
