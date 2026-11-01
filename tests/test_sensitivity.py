import numpy as np
import pytest

from src.scenarios.sensitivity import sensitivity_grid


def test_sensitivity_grid_hand_calculated_winners():
    promise_facts = {
        "orders_in_states": 2,
        "gmv_in_states": 300,
        "late_before": 1,
        "late_after": 0,
        "late_rate_before": 0.5,
        "late_rate_after": 0.0,
    }
    probation_facts = {
        "removed_orders": 2,
        "removed_gmv": 200,
        "removed_late_orders": 2,
        "rest_late_rate": 1 / 3,
        "share_of_orders": 0.4,
    }

    result = sensitivity_grid(
        promise_facts,
        probation_facts,
        take_rate=0.1,
        absorbed_share=0.5,
        late_costs=np.array([3.0, 30.0]),
        conversion_losses=np.array([0.0, 0.5]),
    )

    assert result.columns.tolist() == [
        "late_cost",
        "conversion_loss",
        "promise_delta",
        "probation_delta",
        "winner",
    ]
    assert result["late_cost"].tolist() == [3.0, 3.0, 30.0, 30.0]
    assert result["conversion_loss"].tolist() == [0.0, 0.5, 0.0, 0.5]
    assert result["promise_delta"].tolist() == pytest.approx([3.0, -13.5, 30.0, 0.0])
    assert result["probation_delta"].tolist() == pytest.approx([-5.0, -5.0, 40.0, 40.0])
    assert result["winner"].tolist() == [
        "promise",
        "do nothing",
        "probation",
        "probation",
    ]
