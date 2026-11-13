"""Econometric Price Elasticity Fitting and Block Bootstrap Engine for What-If AI.

Fits Poisson regression with log link:
    E[Quantity] = exp(X @ beta)
    Elasticity = beta[1] (coefficient on ln(price))

Uncertainty Quantification:
    Block Bootstrap by week (>= 300 iterations) to preserve intra-week temporal autocorrelation.
    Generates the empirical elasticity_samples distribution for the Go simulation engine.

Honest Diagnostics & Guardrails:
    - low_price_variation: std(ln(price)) < 0.03
    - not_significant: 90% confidence interval contains 0
    - few_observations: usable observations < 120 days
    - positive_elasticity: point estimate > 0 (violates Law of Demand)

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic numerical optimization and sampling via NumPy/SciPy.
    - Return ElasticityResult exactly matching the contract.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

try:
    import statsmodels.api as sm
    HAS_STATSMODELS = True
except ImportError:
    sm = None
    HAS_STATSMODELS = False

from app.features.build import build_econometric_design_matrix
from app.schemas.contracts import BusinessContext, CostBreakdown, ElasticityResult


DEFAULT_N_BOOTSTRAP: int = 300
LOW_PRICE_SD_THRESHOLD: float = 0.03
MIN_RECOMMENDED_OBSERVATIONS: int = 120


def poisson_irls_fit(
    X: np.ndarray,
    y: np.ndarray,
    ridge: float = 1e-6,
    max_iter: int = 60,
    tol: float = 1e-8,
) -> Tuple[np.ndarray, np.ndarray]:
    """Fit Poisson regression via IRLS with robust HC1 sandwich covariance matrix.

    Args:
        X: Design matrix of shape (N, K).
        y: Non-negative observed demand counts of shape (N,).
        ridge: L2 regularization parameter for matrix conditioning. Defaults to 1e-6.
        max_iter: Maximum IRLS iterations. Defaults to 60.
        tol: Convergence tolerance for coefficient updates. Defaults to 1e-8.

    Returns:
        Tuple containing:
            - beta (np.ndarray): Estimated coefficient vector of shape (K,).
            - cov (np.ndarray): HC1 robust sandwich covariance matrix of shape (K, K).
    """
    n, k = X.shape
    beta = np.zeros(k, dtype=float)
    mean_y = max(float(y.mean()), 1e-3)
    beta[0] = np.log(mean_y)

    for _ in range(max_iter):
        eta = np.clip(X @ beta, -20.0, 20.0)
        mu = np.exp(eta)
        W = mu
        z = eta + (y - mu) / mu

        # Weighted least squares with ridge penalty: (X.T @ diag(W) @ X + ridge*I) beta = X.T @ (W * z)
        X_weighted = X * W[:, None]
        A = X.T @ X_weighted + ridge * np.eye(k)
        new_beta = np.linalg.solve(A, X.T @ (W * z))

        if np.max(np.abs(new_beta - beta)) < tol:
            beta = new_beta
            break
        beta = new_beta

    # HC1 Robust Sandwich Covariance Matrix: cov = bread @ meat @ bread * (n / (n - k))
    mu_final = np.exp(np.clip(X @ beta, -20.0, 20.0))
    X_w_final = X * mu_final[:, None]
    bread = np.linalg.inv(X.T @ X_w_final + ridge * np.eye(k))
    residuals_sq = ((y - mu_final) ** 2)[:, None]
    meat = X.T @ (X * residuals_sq)

    dof_scale = n / max(n - k, 1)
    cov = bread @ meat @ bread * dof_scale
    return beta, cov


def run_week_block_bootstrap(
    X: np.ndarray,
    y: np.ndarray,
    dates: pd.Series,
    n_boot: int = DEFAULT_N_BOOTSTRAP,
    random_state: Optional[Union[int, np.random.Generator]] = 42,
) -> np.ndarray:
    """Perform vectorized week-block bootstrap resampling.

    Preserves intra-week temporal correlation by resampling rows grouped by 7-day calendar weeks.
    Operates directly on pre-computed feature matrix X and target y for high performance.

    Args:
        X: Pre-computed design matrix of shape (N, K).
        y: Non-negative observed demand counts of shape (N,).
        dates: Corresponding Pandas datetime series for row timestamps.
        n_boot: Number of bootstrap iterations (default: 300).
        random_state: Seed or NumPy Generator for deterministic sampling.

    Returns:
        np.ndarray: 1D array of length n_boot containing bootstrap elasticity estimates.
    """
    rng = np.random.default_rng(random_state)
    dt = pd.to_datetime(dates)
    week_keys = (dt.dt.isocalendar().year * 100 + dt.dt.isocalendar().week).to_numpy()
    unique_weeks = np.unique(week_keys)
    n_weeks = len(unique_weeks)

    if n_weeks < 5:
        n_rows = len(X)
        samples = np.empty(n_boot, dtype=float)
        for i in range(n_boot):
            idx = rng.integers(0, n_rows, size=n_rows)
            b, _ = poisson_irls_fit(X[idx], y[idx])
            samples[i] = float(b[1])
        return samples

    week_row_indices = [np.where(week_keys == w)[0] for w in unique_weeks]
    samples = np.empty(n_boot, dtype=float)
    for i in range(n_boot):
        sampled_week_idxs = rng.integers(0, n_weeks, size=n_weeks)
        boot_row_indices = np.concatenate([week_row_indices[w] for w in sampled_week_idxs])
        try:
            b, _ = poisson_irls_fit(X[boot_row_indices], y[boot_row_indices])
            samples[i] = float(b[1])
        except Exception:
            samples[i] = samples[max(i - 1, 0)]

    return samples


def fit_product_elasticity(
    df: pd.DataFrame,
    product_id: str,
    product_name: Optional[str] = None,
    n_boot: int = DEFAULT_N_BOOTSTRAP,
    random_state: Optional[Union[int, np.random.Generator]] = 42,
    is_m5_data: bool = False,
    period_days: int = 30,
) -> ElasticityResult:
    """Fit full Spec-C econometric elasticity model for a single product.

    Args:
        df: Historical sales DataFrame containing product records.
        product_id: Target product identifier.
        product_name: Optional human-readable product name.
        n_boot: Number of bootstrap samples (default: 300).
        random_state: Random state for reproducible bootstrap.
        is_m5_data: True if data source is Walmart M5.
        period_days: Baseline demand projection window in days (default: 30).

    Returns:
        ElasticityResult: Contract model containing estimates, uncertainty samples, and warnings.

    Raises:
        ValueError: If no records match product_id.
    """
    pid_col = "product_id"
    df_prod = df[df[pid_col].astype(str) == str(product_id)].copy()
    if df_prod.empty:
        raise ValueError(f"Product '{product_id}' not found in dataset.")

    p_name = product_name or str(df_prod["product_name"].iloc[0] if "product_name" in df_prod.columns else product_id)

    # Build design matrix & target
    X, y, feat_names, df_clean = build_econometric_design_matrix(
        df_prod, drop_stockouts=True, is_m5_data=is_m5_data
    )

    # Point estimate & robust standard errors (via statsmodels GLM with HC1 covariance)
    if HAS_STATSMODELS and sm is not None:
        try:
            glm_model = sm.GLM(y, X, family=sm.families.Poisson())
            glm_res = glm_model.fit(cov_type="HC1")
            elasticity_point = float(glm_res.params[1])
            elasticity_se = float(glm_res.bse[1])
        except Exception:
            beta, cov = poisson_irls_fit(X, y)
            elasticity_point = float(beta[1])
            elasticity_se = float(np.sqrt(max(cov[1, 1], 1e-9)))
    else:
        beta, cov = poisson_irls_fit(X, y)
        elasticity_point = float(beta[1])
        elasticity_se = float(np.sqrt(max(cov[1, 1], 1e-9)))

    # Bootstrap distribution (using precomputed X and y)
    samples = run_week_block_bootstrap(
        X=X,
        y=y,
        dates=df_clean["date"],
        n_boot=n_boot,
        random_state=random_state,
    )

    # Diagnostic checks
    price_col = "price" if "price" in df_clean.columns else "price_vnd"
    cost_col = "unit_cost" if "unit_cost" in df_clean.columns else "unit_cost_vnd"
    stock_col = "stock" if "stock" in df_clean.columns else "stock_on_hand"

    price_sd = float(np.log(df_clean[price_col]).std())
    recent_price = int(round(float(df_clean[price_col].iloc[-1])))
    recent_cost = int(round(float(df_clean[cost_col].iloc[-1]))) if cost_col in df_clean.columns else int(round(recent_price * 0.65))

    stock_avail: Optional[int] = None
    if stock_col in df_clean.columns and df_clean[stock_col].notna().any():
        stock_avail = int(round(float(df_clean[stock_col].iloc[-1])))

    # Compute baseline monthly quantity normalized to today's price
    hist_prices = df_clean[price_col].to_numpy(dtype=float)
    hist_quantities = df_clean["quantity" if "quantity" in df_clean.columns else "quantity_sold"].to_numpy(dtype=float)
    price_ratio = recent_price / np.maximum(hist_prices, 1e-6)
    daily_normalized = hist_quantities * (price_ratio**elasticity_point)
    baseline_qty = int(round(float(np.mean(daily_normalized) * period_days)))

    # Evaluate 90% confidence interval
    ci90_lo = float(np.percentile(samples, 5.0))
    ci90_hi = float(np.percentile(samples, 95.0))
    is_significant = bool(not (ci90_lo <= 0.0 <= ci90_hi))

    warnings: List[str] = []
    if price_sd < LOW_PRICE_SD_THRESHOLD:
        warnings.append(
            f"low_price_variation: std(ln(price))={price_sd:.3f} < {LOW_PRICE_SD_THRESHOLD}. "
            "Ước lượng độ co giãn có thể kém tin cậy do giá ít thay đổi."
        )
    if not is_significant:
        warnings.append(
            f"not_significant: Khoảng tin cậy 90% [{ci90_lo:.2f}, {ci90_hi:.2f}] chứa giá trị 0."
        )
    if len(df_clean) < MIN_RECOMMENDED_OBSERVATIONS:
        warnings.append(
            f"few_observations: Chỉ có {len(df_clean)} ngày quan sát khả dụng (< {MIN_RECOMMENDED_OBSERVATIONS} ngày)."
        )
    if elasticity_point >= 0.0:
        warnings.append(
            f"positive_elasticity: Độ co giãn ({elasticity_point:.2f}) không mang dấu âm (vi phạm quy luật cầu)."
        )

    # Current business situation snapshot (computed deterministically from historical data)
    base_margin_pct = round((recent_price - recent_cost) / recent_price * 100.0, 2) if recent_price > 0 else 0.0
    recent_14d_avg = round(float(np.mean(hist_quantities[-14:])), 2) if len(hist_quantities) > 0 else None
    daily_mean_qty = round(float(np.mean(hist_quantities)), 2) if len(hist_quantities) > 0 else None
    daily_std_qty = round(float(np.std(hist_quantities, ddof=1)), 2) if len(hist_quantities) > 1 else (0.0 if len(hist_quantities) == 1 else None)
    demand_trend_pct: Optional[float] = None
    if len(hist_quantities) >= 28:
        prev_14d = float(np.mean(hist_quantities[-28:-14]))
        last_14d = float(np.mean(hist_quantities[-14:]))
        if prev_14d > 1e-6:
            demand_trend_pct = round((last_14d - prev_14d) / prev_14d * 100.0, 1)

    daily_base_rate = max(baseline_qty, 1) / float(max(period_days, 1))
    stock_days_cover = round(float(stock_avail) / max(daily_base_rate, 1e-6), 1) if stock_avail is not None else None
    stockout_days_pct: Optional[float] = None
    if stock_col in df_prod.columns and len(df_prod) > 0:
        stockout_days_pct = round(float((df_prod[stock_col].fillna(0) <= 0).mean() * 100.0), 1)

    promo_col = "promo" if "promo" in df_clean.columns else "promo_flag"
    promo_share_pct = round(float((df_clean[promo_col].fillna(0) > 0).mean() * 100.0), 1) if promo_col in df_clean.columns and len(df_clean) > 0 else 0.0

    def _period_external_cost(col_candidates: Tuple[str, ...]) -> int:
        for col in col_candidates:
            if col in df_prod.columns:
                vals = pd.to_numeric(df_prod[col], errors="coerce").dropna()
                if len(vals) > 0:
                    daily_mean = max(float(vals.mean()), 0.0)
                    return int(round(daily_mean * period_days))
        return 0

    mkt_vnd = _period_external_cost(("marketing_cost", "marketing_cost_vnd"))
    labor_vnd = _period_external_cost(("labor_cost", "labor_cost_vnd"))
    op_vnd = _period_external_cost(("operating_cost", "operating_cost_vnd"))
    other_fixed_vnd = _period_external_cost(("fixed_cost", "fixed_cost_vnd"))
    total_fixed_vnd = mkt_vnd + labor_vnd + op_vnd + other_fixed_vnd
    cost_breakdown = (
        CostBreakdown(
            marketing_vnd=mkt_vnd,
            labor_vnd=labor_vnd,
            operating_vnd=op_vnd,
            other_fixed_vnd=other_fixed_vnd,
        )
        if total_fixed_vnd > 0
        else None
    )

    biz_ctx = BusinessContext(
        base_margin_pct=base_margin_pct,
        recent_14d_avg_qty=recent_14d_avg,
        daily_mean_qty=daily_mean_qty,
        daily_std_qty=daily_std_qty,
        demand_trend_pct=demand_trend_pct,
        stock_days_cover=stock_days_cover,
        stockout_days_pct=stockout_days_pct,
        promo_share_pct=promo_share_pct,
        current_stock_units=stock_avail,
        significant=is_significant,
        warnings=warnings,
    )

    return ElasticityResult(
        product_id=str(product_id),
        product_name=p_name,
        current_price_vnd=recent_price,
        unit_cost_vnd=recent_cost,
        baseline_qty_per_period=max(baseline_qty, 1),
        stock_available=stock_avail,
        fixed_cost_vnd=total_fixed_vnd,
        cost_breakdown=cost_breakdown,
        elasticity_median=round(float(np.median(samples)), 4),
        elasticity_se=round(elasticity_se, 4),
        elasticity_samples=[round(float(s), 4) for s in samples.tolist()],
        significant=is_significant,
        price_variation_sd=round(price_sd, 4),
        warnings=warnings,
        business_context=biz_ctx,
    )
