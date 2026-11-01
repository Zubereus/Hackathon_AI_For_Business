import numpy as np
import pandas as pd
import pytest

from eval.synthetic_data import make_world, promise_truth, true_delta


def test_make_world_rejects_unknown_kind() -> None:
    """Reject world types outside the supported synthetic scenarios."""
    with pytest.raises(ValueError):
        make_world("unknown", n_orders=10)


def test_make_world_is_reproducible_for_same_seed() -> None:
    """Generate identical tables and bad-seller ids for identical seeds."""
    first_orders, first_items, first_bad = make_world("seller_driven", 100, seed=7)
    second_orders, second_items, second_bad = make_world("seller_driven", 100, seed=7)

    pd.testing.assert_frame_equal(first_orders, second_orders)
    pd.testing.assert_frame_equal(first_items, second_items)
    assert first_bad == second_bad


def test_make_world_changes_with_seed() -> None:
    """Generate different order values when the seed changes."""
    first_orders, _, _ = make_world("neutral", 100, seed=1)
    second_orders, _, _ = make_world("neutral", 100, seed=2)

    assert not first_orders.equals(second_orders)


def test_seller_driven_world_has_more_late_orders_than_neutral() -> None:
    """Planting slow sellers increases the late rate over a neutral world."""
    seller_orders, _, _ = make_world("seller_driven", 60000, seed=3)
    neutral_orders, _, _ = make_world("neutral", 60000, seed=3)

    seller_late_rate = (seller_orders["delay_days"] > 0).mean()
    neutral_late_rate = (neutral_orders["delay_days"] > 0).mean()
    assert seller_late_rate > neutral_late_rate


def test_true_delta_matches_hand_calculation() -> None:
    """Calculate the hand-worked contribution delta."""
    assert true_delta(avoided=10, gmv_lost=100, take_rate=0.1, late_cost=5) == 40.0


def test_promise_truth_without_conversion_loss_counts_rescued_late_orders() -> None:
    """Count only late selected orders rescued by padding when none are dropped."""
    orders = pd.DataFrame(
        {
            "customer_state": ["MA", "MA", "MA", "SP"],
            "gmv": [10.0, 20.0, 30.0, 40.0],
            "delay_days": [1, 3, 4, 2],
        }
    )

    avoided, gmv_lost = promise_truth(
        orders, states=["MA"], pad_days=3, conversion_loss=0.0
    )

    assert avoided == 2.0
    assert gmv_lost == 0.0
