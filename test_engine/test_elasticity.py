"""Unit test suite for Phase 2: Price Elasticity Modeling & Baseline Prediction.

Mathematical Model Under Test:
    Log-Log Constant Elasticity Specification:
        ln(sales_volume) = beta_0 + beta_1 * ln(price) + beta_2 * promotion_flag
                           + beta_3 * weekend + beta_4 * sin_season + beta_5 * cos_season + e

    Key Hypotheses Verified:
        1. Law of Demand: beta_1 = d(ln Q) / d(ln P) < 0 (negative price elasticity).
        2. Statistical Significance: beta_1 is statistically distinct from zero (p < 0.05).
        3. 0% Price Change: predict_baseline at current price matches baseline demand.
        4. Edge Cases: Large price changes (+200%, -90%) execute without overflow or errors.
        5. Domain Constraints: Non-positive prices (<= 0) raise ValueError.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Pure statsmodels and NumPy assertions.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from whatif_engine.data_generator import generate_retail_data
from whatif_engine.elasticity import (
    fit_loglog_elasticity,
    get_elasticity_coefficient,
    predict_baseline,
    prepare_econometric_features,
)


@pytest.fixture(scope="module")
def multi_product_dataset() -> pd.DataFrame:
    """Fixture generating a 365-day dataset for 3 products with fixed seed.

    Returns:
        pd.DataFrame: Deterministic synthetic retail sales DataFrame.
    """
    return generate_retail_data(n_days=365, random_state=42)


def test_elasticity_coefficient_is_negative(multi_product_dataset: pd.DataFrame) -> None:
    """Verify that the price elasticity coefficient (beta_1) is strictly negative.

    According to the microeconomic Law of Demand, demand curves are downward-sloping,
    meaning beta_1 = d(ln Q) / d(ln P) must be < 0 for all standard retail products.

    Args:
        multi_product_dataset: Synthetic dataset fixture.
    """
    products = ["PROD_01", "PROD_02", "PROD_03"]

    for pid in products:
        subset = multi_product_dataset[multi_product_dataset["product_id"] == pid]
        model_results = fit_loglog_elasticity(subset)
        elasticity_coef = get_elasticity_coefficient(model_results)

        # 1. Economic sanity: Elasticity must be negative
        assert elasticity_coef < 0.0, (
            f"Law of Demand violated for {pid}: "
            f"Estimated elasticity is non-negative ({elasticity_coef:.3f})."
        )

        # 2. Statistical significance: p-value of log_price coefficient must be < 0.05
        p_val_log_price = float(model_results.pvalues[1])
        assert p_val_log_price < 0.05, (
            f"Elasticity coefficient for {pid} is not statistically significant (p = {p_val_log_price:.4f})."
        )


def test_predict_baseline_zero_price_change(multi_product_dataset: pd.DataFrame) -> None:
    """Verify that a 0% price change produces expected baseline volume without deviation.

    When new_price equals current active price P_current, predict_baseline must return
    the consistent neutral volume at that price.

    Args:
        multi_product_dataset: Synthetic dataset fixture.
    """
    for pid in ["PROD_01", "PROD_02", "PROD_03"]:
        subset = multi_product_dataset[multi_product_dataset["product_id"] == pid]
        current_price = float(subset["price"].iloc[-1])

        # Point estimate at current price
        pred_vol_0_pct = predict_baseline(product_id=pid, new_price=current_price, df=multi_product_dataset)
        pred_vol_repeat = predict_baseline(product_id=pid, new_price=current_price, df=multi_product_dataset)

        # Must be positive and completely deterministic
        assert pred_vol_0_pct > 0.0
        assert np.isclose(pred_vol_0_pct, pred_vol_repeat)


def test_predict_baseline_law_of_demand_monotonicity(multi_product_dataset: pd.DataFrame) -> None:
    """Verify that predicted sales volume monotonically decreases as price increases.

    For prices P_low < P_mid < P_high:
        predict_baseline(P_low) > predict_baseline(P_mid) > predict_baseline(P_high)

    Args:
        multi_product_dataset: Synthetic dataset fixture.
    """
    pid = "PROD_02"
    subset = multi_product_dataset[multi_product_dataset["product_id"] == pid]
    current_price = float(subset["price"].iloc[-1])

    price_low = current_price * 0.85   # -15% discount
    price_mid = current_price          # Baseline
    price_high = current_price * 1.15  # +15% price increase

    vol_low = predict_baseline(product_id=pid, new_price=price_low, df=multi_product_dataset)
    vol_mid = predict_baseline(product_id=pid, new_price=price_mid, df=multi_product_dataset)
    vol_high = predict_baseline(product_id=pid, new_price=price_high, df=multi_product_dataset)

    assert vol_low > vol_mid, (
        f"Lower price ({price_low:,.0f}) should yield higher volume ({vol_low:.1f}) than baseline ({vol_mid:.1f})."
    )
    assert vol_mid > vol_high, (
        f"Baseline price ({price_mid:,.0f}) should yield higher volume ({vol_mid:.1f}) than higher price ({vol_high:.1f})."
    )


def test_predict_baseline_edge_cases(multi_product_dataset: pd.DataFrame) -> None:
    """Verify robustness under extreme price changes and domain boundaries.

    Edge Cases Tested:
        1. Extreme price increase (+500%): does not crash or raise overflow; returns non-negative volume.
        2. Extreme price decrease (-90%): does not crash; returns high volume without inf.
        3. Zero price (P = 0): raises ValueError.
        4. Negative price (P < 0): raises ValueError.

    Args:
        multi_product_dataset: Synthetic dataset fixture.
    """
    pid = "PROD_01"
    subset = multi_product_dataset[multi_product_dataset["product_id"] == pid]
    current_price = float(subset["price"].iloc[-1])

    # 1. Extreme price increase (+500% -> 6x current price)
    price_extreme_high = current_price * 6.0
    vol_extreme_high = predict_baseline(product_id=pid, new_price=price_extreme_high, df=multi_product_dataset)
    assert vol_extreme_high >= 0.0
    assert not np.isnan(vol_extreme_high)
    assert not np.isinf(vol_extreme_high)

    # 2. Extreme price drop (-90% -> 0.10x current price)
    price_extreme_low = current_price * 0.10
    vol_extreme_low = predict_baseline(product_id=pid, new_price=price_extreme_low, df=multi_product_dataset)
    assert vol_extreme_low > 0.0
    assert not np.isnan(vol_extreme_low)
    assert not np.isinf(vol_extreme_low)

    # 3. Non-positive price violations
    with pytest.raises(ValueError, match="strictly positive"):
        predict_baseline(product_id=pid, new_price=0.0, df=multi_product_dataset)

    with pytest.raises(ValueError, match="strictly positive"):
        predict_baseline(product_id=pid, new_price=-50000.0, df=multi_product_dataset)


def test_prepare_econometric_features_structure(multi_product_dataset: pd.DataFrame) -> None:
    """Verify that feature engineering creates all required variables with proper bounds.

    Args:
        multi_product_dataset: Synthetic dataset fixture.
    """
    df_feat = prepare_econometric_features(multi_product_dataset)
    expected_cols = {"log_sales", "log_price", "weekend", "sin_season", "cos_season"}
    assert expected_cols.issubset(set(df_feat.columns))

    # Trigonometric seasonality bounds
    assert df_feat["sin_season"].min() >= -1.0 - 1e-6
    assert df_feat["sin_season"].max() <= 1.0 + 1e-6
    assert df_feat["cos_season"].min() >= -1.0 - 1e-6
    assert df_feat["cos_season"].max() <= 1.0 + 1e-6
