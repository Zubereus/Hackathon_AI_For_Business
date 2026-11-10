"""Unit and integration test suite for whatif_engine.py.

Tests strictly adhere to:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: All checks verify deterministic formulas and statistical properties.
    - Full coverage of core calculations, edge cases, and constraints.
"""

from __future__ import annotations

import os
from typing import Generator

import numpy as np
import pandas as pd
import pytest

import whatif_engine as w


@pytest.fixture
def sample_sales_df() -> pd.DataFrame:
    """Fixture providing a synthetic DataFrame mimicking sales history.

    Returns:
        pd.DataFrame: 100 days of valid sales records for a single product.
    """
    n_days = 100
    dates = pd.date_range("2024-01-01", periods=n_days, freq="D")
    rng = np.random.default_rng(42)

    # Alternate prices between 100,000 and 120,000 VND to ensure price variation
    prices = rng.choice([100_000.0, 110_000.0, 120_000.0], size=n_days)
    unit_costs = np.full(n_days, 60_000.0)
    promos = rng.choice([0, 1], p=[0.8, 0.2], size=n_days)
    holidays = np.zeros(n_days, dtype=int)
    holidays[10:15] = 1

    # Base demand around 50 units with price sensitivity ~ -1.0
    true_e = -1.0
    expected_qty = 50.0 * (prices / 100_000.0) ** true_e * (1.0 + 0.3 * promos)
    quantities = rng.poisson(lam=expected_qty)

    return pd.DataFrame({
        "date": dates,
        "product_id": "TEST_P01",
        "product_name": "Test Cotton T-Shirt",
        "category": "Apparel",
        "price_vnd": prices,
        "unit_cost_vnd": unit_costs,
        "quantity_sold": np.maximum(quantities, 1),
        "promo_flag": promos,
        "holiday_flag": holidays,
        "stock_on_hand": np.full(n_days, 500),
    })


@pytest.fixture
def sample_csv_file(
    sample_sales_df: pd.DataFrame, tmp_path: pytest.TempPathFactory
) -> Generator[str, None, None]:
    """Fixture writing sample_sales_df to a temporary CSV file.

    Args:
        sample_sales_df: Source DataFrame fixture.
        tmp_path: Pytest temporary path fixture.

    Yields:
        str: Absolute path to temporary CSV file.
    """
    file_path = os.path.join(str(tmp_path), "test_sales.csv")
    sample_sales_df.to_csv(file_path, index=False)
    yield file_path


def test_build_design_matrix(sample_sales_df: pd.DataFrame) -> None:
    """Verify that build_design_matrix produces correct columns and shapes."""
    X = w.build_design_matrix(sample_sales_df)
    assert isinstance(X, np.ndarray)
    assert X.shape == (len(sample_sales_df), 7)
    # Check column 0 is intercept (all 1s)
    assert np.allclose(X[:, 0], 1.0)
    # Check column 1 is ln(price_vnd)
    expected_log_p = np.log(sample_sales_df["price_vnd"].to_numpy())
    assert np.allclose(X[:, 1], expected_log_p)


def test_fit_poisson_convergence(sample_sales_df: pd.DataFrame) -> None:
    """Ensure Poisson regression converges and recovers a negative price coefficient."""
    X = w.build_design_matrix(sample_sales_df)
    y = sample_sales_df["quantity_sold"].to_numpy().astype(float)
    beta = w.fit_poisson(X, y)

    assert isinstance(beta, np.ndarray)
    assert len(beta) == X.shape[1]
    # Price elasticity is at index 1 and must be negative for downward sloping demand
    assert beta[1] < 0.0


def test_fit_poisson_invalid_inputs() -> None:
    """Check that fit_poisson raises ValueError for invalid targets."""
    X = np.ones((5, 2))
    y_negative = np.array([1.0, -2.0, 3.0, 4.0, 5.0])
    with pytest.raises(ValueError, match="non-negative target values"):
        w.fit_poisson(X, y_negative)

    y_mismatch = np.array([1.0, 2.0])
    with pytest.raises(ValueError, match="length mismatch"):
        w.fit_poisson(X, y_mismatch)


def test_elasticity_coefficient_methods(sample_sales_df: pd.DataFrame) -> None:
    """Verify elasticity estimation across both Poisson and Log-Log methods."""
    X = w.build_design_matrix(sample_sales_df)
    y = sample_sales_df["quantity_sold"].to_numpy().astype(float)

    e_poisson = w.elasticity_coefficient(X, y, method="poisson")
    e_loglog = w.elasticity_coefficient(X, y, method="loglog")

    assert isinstance(e_poisson, float)
    assert isinstance(e_loglog, float)
    assert e_poisson < 0.0
    assert e_loglog < 0.0

    with pytest.raises(ValueError, match="Unsupported estimation method"):
        w.elasticity_coefficient(X, y, method="unknown_method")


def test_estimate_elasticity_reproducibility(sample_sales_df: pd.DataFrame) -> None:
    """Confirm that passing identical random_state produces identical bootstrap samples."""
    point1, samples1, sd1 = w.estimate_elasticity(
        sample_sales_df, random_state=123, n_boot=50
    )
    point2, samples2, sd2 = w.estimate_elasticity(
        sample_sales_df, random_state=123, n_boot=50
    )

    assert point1 == point2
    assert sd1 == sd2
    assert np.array_equal(samples1, samples2)
    assert len(samples1) == 50
    assert sd1 > w.LOW_PRICE_SD


def test_build_baseline(sample_sales_df: pd.DataFrame) -> None:
    """Check monthly baseline normalization calculation."""
    point_e = -1.0
    base = w.build_baseline(sample_sales_df, point_elasticity=point_e, horizon_days=30)

    assert "price" in base and "unit_cost" in base and "qty" in base
    assert base["price"] == float(sample_sales_df["price_vnd"].iloc[-1])
    assert base["unit_cost"] == float(sample_sales_df["unit_cost_vnd"].iloc[-1])
    assert base["qty"] > 0.0


def test_outcomes_calculation_and_stock_cap() -> None:
    """Verify deterministic financial formulas for outcomes, including stock capping."""
    base = {"price": 100_000.0, "unit_cost": 60_000.0, "qty": 1_000.0}
    price_change = 0.10  # +10% -> new price = 110,000
    elasticity = -1.0  # (1.1)^(-1) ~= 0.90909 -> demand = 909.09 units

    # Unconstrained
    res_unconstrained = w.outcomes(base, price_change, elasticity, noise=1.0, stock=None)
    assert np.isclose(res_unconstrained["price"], 110_000.0)
    expected_qty = 1_000.0 * (1.1**-1.0)
    assert np.isclose(res_unconstrained["qty"], expected_qty)
    assert np.isclose(res_unconstrained["revenue"], expected_qty * 110_000.0)
    assert np.isclose(res_unconstrained["profit"], expected_qty * (110_000.0 - 60_000.0))

    # Constrained by stock = 500 units
    res_constrained = w.outcomes(
        base, price_change, elasticity, noise=1.0, stock=500.0, fixed_cost=5_000_000.0
    )
    assert res_constrained["qty"] == 500.0
    assert np.isclose(res_constrained["revenue"], 500.0 * 110_000.0)
    expected_profit = 500.0 * (110_000.0 - 60_000.0) - 5_000_000.0
    assert np.isclose(res_constrained["profit"], expected_profit)
    assert np.isclose(res_constrained["spend"], 500.0 * 60_000.0 + 5_000_000.0)


def test_breakeven_elasticity_property() -> None:
    """Verify that at break-even elasticity, profit matches baseline profit exactly."""
    base = {"price": 100_000.0, "unit_cost": 60_000.0, "qty": 1_000.0}
    price_change = 0.10
    be = w.breakeven_elasticity(base, price_change)
    assert be is not None

    base_prof = w.baseline_outcome(base)["profit"]
    be_prof = w.outcomes(base, price_change, elasticity=be)["profit"]
    assert np.isclose(base_prof, be_prof, rtol=1e-5)

    # Zero price change has no break-even elasticity
    assert w.breakeven_elasticity(base, 0.0) is None


def test_four_scenarios_ordering() -> None:
    """Verify that four_scenarios computes consistent percentiles from samples."""
    base = {"price": 100_000.0, "unit_cost": 60_000.0, "qty": 1_000.0}
    # Artificial elasticity samples spanning -2.0 to -0.5
    e_samples = np.linspace(-2.0, -0.5, 100)
    point_e = -1.2

    scenarios = w.four_scenarios(base, price_change=0.10, e_samples=e_samples, point_elasticity=point_e)

    assert "baseline" in scenarios
    assert "optimistic" in scenarios
    assert "expected" in scenarios
    assert "pessimistic" in scenarios

    # For a price INCREASE (+10%), optimistic (least negative e) yields higher profit than pessimistic
    prof_opt = scenarios["optimistic"]["profit"]
    prof_pess = scenarios["pessimistic"]["profit"]
    assert prof_opt is not None and prof_pess is not None
    assert prof_opt > prof_pess


def test_monte_carlo_quantiles() -> None:
    """Verify Monte Carlo summary quantiles follow p5 <= p50 <= p95."""
    base = {"price": 100_000.0, "unit_cost": 60_000.0, "qty": 1_000.0}
    e_samples = np.array([-1.5, -1.2, -1.0, -0.8])
    draws = w.draw_uncertainty(random_state=42, e_samples=e_samples, n_sims=1_000)

    mc = w.monte_carlo_summary(base, price_change=0.10, draws=draws)
    assert mc["profit_p5"] <= mc["profit_p50"] <= mc["profit_p95"]
    assert 0.0 <= mc["prob_profit_above_baseline"] <= 1.0


def test_reverse_what_if_budget_and_target() -> None:
    """Verify Reverse What-If respects budget bounds and ranks by probability of success."""
    base = {"price": 100_000.0, "unit_cost": 60_000.0, "qty": 1_000.0}
    e_samples = np.array([-1.0, -0.9, -1.1])
    draws = w.draw_uncertainty(random_state=42, e_samples=e_samples, n_sims=500)

    res = w.reverse_what_if(
        base=base,
        draws=draws,
        target_growth=0.05,  # +5% profit
        history_range=(-0.10, 0.20),
        step=0.05,
        top=3,
    )

    assert "best_options" in res
    assert len(res["best_options"]) <= 3
    # Check options are sorted descending by prob_success
    probs = [opt["prob_success"] for opt in res["best_options"]]
    assert probs == sorted(probs, reverse=True)


def test_full_analyse_pipeline(sample_csv_file: str) -> None:
    """Execute end-to-end analyse pipeline and verify all schema keys are present."""
    result = w.analyse(
        csv_path=sample_csv_file,
        product_id="TEST_P01",
        price_change=0.10,
        reverse_target=0.10,
        random_state=42,
    )

    assert result["product_id"] == "TEST_P01"
    assert "elasticity" in result
    assert "baseline" in result
    assert "scenarios" in result
    assert "monte_carlo" in result
    assert "breakeven_elasticity" in result
    assert "reverse_what_if" in result
    assert len(result["warnings"]) >= 0


def test_analyse_invalid_product(sample_csv_file: str) -> None:
    """Verify that analyse raises ValueError if product ID is not found."""
    with pytest.raises(ValueError, match="not found in dataset"):
        w.analyse(csv_path=sample_csv_file, product_id="NON_EXISTENT")

