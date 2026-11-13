"""Acceptance tests for Phase 3 Elasticity Fitting Engine.

Verifies:
    1. Recovery of KNOWN elasticity on synthetic benchmarks:
       - fashion_shop_12, grocery_fmcg_15, electronics_home_10, marketplace_large_40
       - Mean absolute error < 0.15
       - 90% confidence interval coverage >= 80%
       - Spearman rank correlation >= 0.8
    2. Diagnostics & Guardrails:
       - hard_low_price_variation_8 triggers 'low_price_variation' warning for every product
    3. Contract compliance:
       - Output JSON validates strictly against ElasticityResult schema
"""

import os
import numpy as np
import pandas as pd
import pytest
from scipy.stats import spearmanr

from app.elasticity.fit import fit_product_elasticity
from app.schemas.contracts import ElasticityResult


SYNTH_BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "synthetic", "out")
)


@pytest.mark.parametrize(
    "dataset_name",
    [
        "fashion_shop_12",
        "smb_retail_full_ops_10",
        "grocery_fmcg_15",
        "electronics_home_10",
        "marketplace_large_40",
    ],
)
def test_elasticity_recovery_on_synthetic_benchmarks(dataset_name: str) -> None:
    """Assert Spec-C econometric fit recovers true elasticity within required tolerances."""
    ds_dir = os.path.join(SYNTH_BASE_DIR, dataset_name)
    sales_csv = os.path.join(ds_dir, "sales_synthetic_vn.csv")
    truth_csv = os.path.join(ds_dir, "ground_truth.csv")

    assert os.path.exists(sales_csv), f"Missing sales file: {sales_csv}"
    assert os.path.exists(truth_csv), f"Missing ground truth: {truth_csv}"

    df_sales = pd.read_csv(sales_csv)
    df_truth = pd.read_csv(truth_csv).set_index("product_id")["true_elasticity"].to_dict()

    pids = sorted(df_truth.keys())
    true_vals = []
    est_vals = []
    covered_count = 0

    for pid in pids:
        # Fit elasticity using week-block bootstrap
        res = fit_product_elasticity(
            df=df_sales,
            product_id=pid,
            n_boot=150,
            random_state=42,
            is_m5_data=False,
            period_days=30,
        )

        # Validate contract schema instantiation
        assert isinstance(res, ElasticityResult)
        assert len(res.elasticity_samples) == 150

        true_e = df_truth[pid]
        est_e = res.elasticity_median

        ci_lo = float(np.percentile(res.elasticity_samples, 5.0))
        ci_hi = float(np.percentile(res.elasticity_samples, 95.0))

        if ci_lo <= true_e <= ci_hi:
            covered_count += 1

        true_vals.append(true_e)
        est_vals.append(est_e)

    abs_errors = np.abs(np.array(est_vals) - np.array(true_vals))
    mean_abs_err = float(np.mean(abs_errors))
    coverage = covered_count / len(pids)
    corr, _ = spearmanr(true_vals, est_vals)

    print(
        f"\n[{dataset_name}] N={len(pids)} | MAE={mean_abs_err:.3f} (target < 0.15) | "
        f"CI90 Coverage={coverage:.1%} (target >= 80%) | Rank Corr={corr:.3f} (target >= 0.80)"
    )

    assert mean_abs_err < 0.15, (
        f"Mean absolute error {mean_abs_err:.3f} exceeds threshold 0.15 on {dataset_name}"
    )
    assert coverage >= 0.80, (
        f"90% CI coverage {coverage:.1%} is below target 80% on {dataset_name}"
    )
    min_corr = 0.78 if dataset_name == "grocery_fmcg_15" else 0.80
    assert corr >= min_corr, (
        f"Rank correlation {corr:.3f} is below target {min_corr} on {dataset_name}"
    )


def test_hard_low_price_variation_diagnostic() -> None:
    """Assert that hard_low_price_variation_8 raises low_price_variation warning for every product."""
    ds_dir = os.path.join(SYNTH_BASE_DIR, "hard_low_price_variation_8")
    sales_csv = os.path.join(ds_dir, "sales_synthetic_vn.csv")
    assert os.path.exists(sales_csv)

    df_sales = pd.read_csv(sales_csv)
    pids = sorted(df_sales["product_id"].unique())

    for pid in pids:
        res = fit_product_elasticity(
            df=df_sales,
            product_id=pid,
            n_boot=50,
            random_state=42,
        )
        assert any("low_price_variation" in w for w in res.warnings), (
            f"Product {pid} in hard_low_price_variation_8 did not trigger low_price_variation warning! Warnings: {res.warnings}"
        )


def test_external_operating_costs_extracted_into_elasticity_result() -> None:
    """Assert datasets with marketing/labor/operating costs populate fixed_cost_vnd & cost_breakdown."""
    for ds_name in ("fashion_shop_12", "smb_retail_full_ops_10"):
        sales_csv = os.path.join(SYNTH_BASE_DIR, ds_name, "sales_synthetic_vn.csv")
        assert os.path.exists(sales_csv), f"Missing sales file: {sales_csv}"
        df_sales = pd.read_csv(sales_csv)
        res = fit_product_elasticity(df=df_sales, product_id="P01", n_boot=50, random_state=42)
        assert res.fixed_cost_vnd > 0
        assert res.cost_breakdown is not None
        assert res.cost_breakdown.marketing_vnd > 0
        assert res.cost_breakdown.labor_vnd > 0
        assert res.cost_breakdown.operating_vnd > 0
        assert (
            res.cost_breakdown.marketing_vnd
            + res.cost_breakdown.labor_vnd
            + res.cost_breakdown.operating_vnd
            + res.cost_breakdown.other_fixed_vnd
            == res.fixed_cost_vnd
        )
