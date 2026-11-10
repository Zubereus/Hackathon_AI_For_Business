"""What-If Decision & Simulation Engine.

Core quantitative logic for the What-If AI platform.
Evaluates the impact of pricing and commercial decisions using econometric
elasticity estimation, statistical scenario modeling, Monte Carlo uncertainty
simulation, and constrained reverse optimization.

Design Rule:
    The LLM never calculates financial numbers. Every calculation is performed
    deterministically using NumPy, SciPy, and Pandas.
"""

from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd


# ---------------- DEFAULT ASSUMPTIONS & HYPERPARAMETERS ----------------
N_BOOTSTRAP: int = 300  # Number of bootstrap iterations for elasticity distribution
N_SIMULATIONS: int = 10_000  # Number of Monte Carlo draws
DEMAND_NOISE_SIGMA: float = 0.05  # Lognormal monthly demand volatility assumption (5%)
LOOKBACK_DAYS: int = 90  # Historical window (days) used to compute baseline demand
HORIZON_DAYS: int = 30  # Forward projection horizon (days, "next month")
LOW_PRICE_SD: float = 0.03  # Minimum threshold for std(ln(price)) to avoid unreliable fits
OPTIMISTIC_PCT: float = 90.0  # Percentile of elasticity distribution for optimistic scenario
PESSIMISTIC_PCT: float = 10.0  # Percentile of elasticity distribution for pessimistic scenario
DEFAULT_SEED: int = 7


def get_rng(random_state: Optional[Union[int, np.random.Generator]] = None) -> np.random.Generator:
    """Initialize a NumPy Generator instance for reproducible pseudo-random numbers.

    Args:
        random_state: Integer seed, an existing np.random.Generator instance, or None.

    Returns:
        np.random.Generator: A seeded or default NumPy random generator.
    """
    if isinstance(random_state, np.random.Generator):
        return random_state
    return np.random.default_rng(random_state)


# ---------------- 1. ECONOMETRICS & DESIGN MATRIX ----------------
def build_design_matrix(df: pd.DataFrame) -> np.ndarray:
    """Construct an econometric design matrix with calendar controls.

    Features included:
        - Intercept (column 0)
        - ln(price_vnd) (column 1, parameter of interest)
        - Weekend indicator (column 2)
        - Promotion flag (column 3)
        - Holiday flag (column 4)
        - Sine annual seasonality (column 5)
        - Cosine annual seasonality (column 6)

    Args:
        df: Pandas DataFrame containing columns 'date', 'price_vnd', 'promo_flag',
            and 'holiday_flag'.

    Returns:
        np.ndarray: 2D array of shape (N, 7) representing the design matrix.
    """
    dates = pd.to_datetime(df["date"])
    day_of_year = dates.dt.dayofyear.to_numpy()
    return np.column_stack([
        np.ones(len(df)),
        np.log(df["price_vnd"].to_numpy()),
        (dates.dt.dayofweek >= 5).astype(float).to_numpy(),
        df["promo_flag"].to_numpy().astype(float),
        df["holiday_flag"].to_numpy().astype(float),
        np.sin(2.0 * np.pi * day_of_year / 365.25),
        np.cos(2.0 * np.pi * day_of_year / 365.25),
    ])


def fit_elasticity(X: np.ndarray, y: np.ndarray) -> float:
    """Fit ordinary least squares (OLS) log-log regression to estimate elasticity.

    Model: ln(quantity) = X @ beta + epsilon.
    Elasticity is the coefficient of ln(price), located at column index 1.

    Args:
        X: Design matrix of shape (N, K) where column 1 is ln(price).
        y: Log-transformed demand values of shape (N,).

    Returns:
        float: Estimated price elasticity coefficient.
    """
    coefs, *_ = np.linalg.lstsq(X, y, rcond=None)
    return float(coefs[1])


def fit_poisson(X: np.ndarray, y: np.ndarray, max_iter: int = 50, tol: float = 1e-9) -> np.ndarray:
    """Fit Poisson regression with log link via Iteratively Reweighted Least Squares (IRLS).

    Model: y ~ Poisson(exp(X @ beta)).
    Solves small-count bias when sales volume is discrete or close to zero.

    Args:
        X: Design matrix of shape (N, K).
        y: Non-negative observed demand counts of shape (N,).
        max_iter: Maximum number of IRLS iterations. Defaults to 50.
        tol: Convergence tolerance for coefficient updates. Defaults to 1e-9.

    Returns:
        np.ndarray: Estimated coefficient vector beta of shape (K,).

    Raises:
        ValueError: If y contains negative values or X and y have incompatible dimensions.
    """
    if np.any(y < 0):
        raise ValueError("Poisson regression requires non-negative target values.")
    if len(X) != len(y):
        raise ValueError(f"X and y length mismatch: {len(X)} vs {len(y)}.")

    beta = np.zeros(X.shape[1], dtype=float)
    # Safe initialisation for intercept
    mean_y = max(float(y.mean()), 1e-6)
    beta[0] = np.log(mean_y)

    for _ in range(max_iter):
        eta = np.clip(X @ beta, -30.0, 30.0)
        mu = np.maximum(np.exp(eta), 1e-9)
        z = eta + (y - mu) / mu
        # W = diag(mu), solve (X.T @ W @ X) beta_new = X.T @ W @ z
        X_weighted = X * mu[:, None]
        new_beta = np.linalg.solve(X.T @ X_weighted, X.T @ (mu * z))

        if np.max(np.abs(new_beta - beta)) < tol:
            beta = new_beta
            break
        beta = new_beta

    return beta


def elasticity_coefficient(X: np.ndarray, y: np.ndarray, method: str = "poisson") -> float:
    """Estimate the elasticity coefficient using the specified regression method.

    Args:
        X: Design matrix where column 1 is ln(price).
        y: Target quantity vector (counts for Poisson, counts for log-log).
        method: Estimation technique, either 'poisson' or 'loglog'.

    Returns:
        float: Price elasticity coefficient.

    Raises:
        ValueError: If method is not 'poisson' or 'loglog'.
    """
    if method == "poisson":
        return float(fit_poisson(X, y)[1])
    if method == "loglog":
        y_positive = np.maximum(y, 1e-6)
        return float(fit_elasticity(X, np.log(y_positive)))
    raise ValueError(f"Unsupported estimation method: '{method}'. Choose 'poisson' or 'loglog'.")


def estimate_elasticity(
    df: pd.DataFrame,
    random_state: Optional[Union[int, np.random.Generator]] = None,
    method: str = "poisson",
    n_boot: int = N_BOOTSTRAP,
) -> Tuple[float, np.ndarray, float]:
    """Estimate price elasticity distribution using bootstrap resampling.

    Args:
        df: Historical sales DataFrame containing 'date', 'price_vnd', 'quantity_sold',
            'promo_flag', and 'holiday_flag'.
        random_state: Seed or np.random.Generator for reproducible bootstrap sampling.
        method: Regression model, 'poisson' (default) or 'loglog'.
        n_boot: Number of bootstrap resamples. Defaults to N_BOOTSTRAP.

    Returns:
        Tuple containing:
            - point (float): Point estimate on full historical data.
            - samples (np.ndarray): Array of length n_boot containing bootstrap estimates.
            - price_sd (float): Standard deviation of ln(price), measuring price variation.

    Raises:
        ValueError: If filtered DataFrame has fewer than 5 positive sales records.
    """
    df_valid = df[df["quantity_sold"] > 0].copy()
    if len(df_valid) < 5:
        raise ValueError("Insufficient data with quantity_sold > 0 to estimate elasticity.")

    X = build_design_matrix(df_valid)
    # Centre ln(price) to improve numerical conditioning without altering its slope
    X[:, 1] = X[:, 1] - X[:, 1].mean()
    y = df_valid["quantity_sold"].to_numpy().astype(float)

    point = elasticity_coefficient(X, y, method=method)

    rng = get_rng(random_state)
    n = len(y)
    samples = np.empty(n_boot, dtype=float)
    for i in range(n_boot):
        indices = rng.integers(0, n, size=n)
        samples[i] = elasticity_coefficient(X[indices], y[indices], method=method)

    price_sd = float(np.log(df_valid["price_vnd"]).std())
    return point, samples, price_sd


# ---------------- 2. BASELINE DEMAND ----------------
def build_baseline(
    df: pd.DataFrame,
    point_elasticity: float,
    horizon_days: int = HORIZON_DAYS,
    lookback_days: int = LOOKBACK_DAYS,
) -> Dict[str, float]:
    """Establish monthly baseline metrics normalized to today's active price.

    Historical daily quantities within the lookback window are scaled to the current
    price using the estimated point elasticity:
        Q_normalized = Q_historical * (P_today / P_historical) ** elasticity

    Args:
        df: Historical sales DataFrame sorted chronologically.
        point_elasticity: Estimated central elasticity coefficient.
        horizon_days: Projection window in days (default: 30 days).
        lookback_days: Lookback window in days (default: 90 days).

    Returns:
        Dict[str, float]: Dictionary with 'price', 'unit_cost', and 'qty' (monthly).

    Raises:
        ValueError: If df is empty.
    """
    if df.empty:
        raise ValueError("Cannot build baseline from an empty DataFrame.")

    recent = df.sort_values("date").tail(lookback_days)
    today_price = float(recent["price_vnd"].iloc[-1])
    unit_cost = float(recent["unit_cost_vnd"].iloc[-1])

    hist_prices = recent["price_vnd"].to_numpy(dtype=float)
    hist_quantities = recent["quantity_sold"].to_numpy(dtype=float)

    price_ratio = today_price / np.maximum(hist_prices, 1e-6)
    daily_normalized = hist_quantities * (price_ratio**point_elasticity)
    monthly_qty = float(np.mean(daily_normalized) * horizon_days)

    return {
        "price": today_price,
        "unit_cost": unit_cost,
        "qty": max(monthly_qty, 0.0),
    }


# ---------------- 3. COMMERCIAL OUTCOMES & SCENARIOS ----------------
def outcomes(
    base: Dict[str, float],
    price_change: float,
    elasticity: Union[float, np.ndarray],
    noise: Union[float, np.ndarray] = 1.0,
    stock: Optional[float] = None,
    fixed_cost: float = 0.0,
) -> Dict[str, Union[float, np.ndarray]]:
    """Compute financial outcomes for a given price change.

    Formulas:
        P_new = P_base * (1 + price_change)
        Demand = Q_base * (1 + price_change) ** elasticity * noise
        Q_sold = min(Demand, Stock) if Stock is provided else Demand
        Revenue = Q_sold * P_new
        Spend = Q_sold * Unit_Cost + Fixed_Cost
        Profit = Revenue - Spend

    Args:
        base: Baseline metrics containing 'price', 'unit_cost', and 'qty'.
        price_change: Percentage price modification (e.g., 0.10 for +10%).
        elasticity: Single float or 1D array of elasticity samples.
        noise: Single float or 1D array of demand multiplier noise.
        stock: Optional maximum physical units available.
        fixed_cost: Monthly fixed operating expenditure in VND.

    Returns:
        Dict[str, Union[float, np.ndarray]]: Computed 'price', 'qty', 'revenue',
            'profit', and 'spend'.
    """
    new_price = base["price"] * (1.0 + price_change)
    price_ratio = 1.0 + price_change
    demand = base["qty"] * (price_ratio**elasticity) * noise

    if stock is not None:
        qty_sold = np.minimum(demand, stock)
    else:
        qty_sold = demand

    revenue = qty_sold * new_price
    spend = qty_sold * base["unit_cost"] + fixed_cost
    profit = revenue - spend

    return {
        "price": new_price,
        "qty": qty_sold,
        "revenue": revenue,
        "profit": profit,
        "spend": spend,
    }


def baseline_outcome(
    base: Dict[str, float], stock: Optional[float] = None, fixed_cost: float = 0.0
) -> Dict[str, float]:
    """Calculate the status-quo outcome with zero price change and zero noise.

    Args:
        base: Baseline dictionary with 'price', 'unit_cost', and 'qty'.
        stock: Optional maximum physical inventory.
        fixed_cost: Monthly fixed cost in VND.

    Returns:
        Dict[str, float]: Status-quo financial outcome.
    """
    res = outcomes(
        base=base,
        price_change=0.0,
        elasticity=0.0,
        noise=1.0,
        stock=stock,
        fixed_cost=fixed_cost,
    )
    return {k: float(v) for k, v in res.items()}


def four_scenarios(
    base: Dict[str, float],
    price_change: float,
    e_samples: np.ndarray,
    point_elasticity: float,
    stock: Optional[float] = None,
    fixed_cost: float = 0.0,
) -> Dict[str, Dict[str, Optional[float]]]:
    """Generate 4 grounded scenarios derived strictly from the elasticity distribution.

    Scenarios:
        - baseline: Current price with zero price change.
        - optimistic: Customers least price-sensitive (90th percentile of e_samples).
        - expected: Central point estimate.
        - pessimistic: Customers most price-sensitive (10th percentile of e_samples).

    Args:
        base: Baseline dictionary.
        price_change: Price change percentage (e.g., 0.10).
        e_samples: 1D array of bootstrap elasticity samples.
        point_elasticity: Point estimate of elasticity.
        stock: Optional inventory constraint.
        fixed_cost: Monthly fixed cost in VND.

    Returns:
        Dict[str, Dict[str, Optional[float]]]: Dictionary mapping scenario names
            to their respective parameters and financial outcomes.
    """
    percentile_optimistic = float(np.percentile(e_samples, OPTIMISTIC_PCT))
    percentile_pessimistic = float(np.percentile(e_samples, PESSIMISTIC_PCT))

    chosen = {
        "optimistic": percentile_optimistic,
        "expected": float(point_elasticity),
        "pessimistic": percentile_pessimistic,
    }

    base_res = baseline_outcome(base, stock=stock, fixed_cost=fixed_cost)
    scenarios: Dict[str, Dict[str, Optional[float]]] = {
        "baseline": {"elasticity": None, **base_res}
    }

    for name, e_val in chosen.items():
        res = outcomes(
            base=base,
            price_change=price_change,
            elasticity=e_val,
            noise=1.0,
            stock=stock,
            fixed_cost=fixed_cost,
        )
        scenarios[name] = {
            "elasticity": e_val,
            "price": float(res["price"]),
            "qty": float(res["qty"]),
            "revenue": float(res["revenue"]),
            "profit": float(res["profit"]),
            "spend": float(res["spend"]),
        }

    return scenarios


def breakeven_elasticity(base: Dict[str, float], price_change: float) -> Optional[float]:
    """Calculate the break-even elasticity threshold.

    The elasticity at which gross profit exactly equals baseline gross profit:
        e_breakeven = ln((P0 - C) / (P1 - C)) / ln(1 + price_change)

    Args:
        base: Baseline dictionary containing 'price' and 'unit_cost'.
        price_change: Proposed fractional price change (e.g., 0.10).

    Returns:
        Optional[float]: Break-even elasticity value, or None if price_change is zero
            or new price is below unit cost.
    """
    p0 = base["price"]
    c = base["unit_cost"]
    p1 = p0 * (1.0 + price_change)

    if abs(price_change) < 1e-9 or p1 <= c:
        return None

    numerator = np.log((p0 - c) / (p1 - c))
    denominator = np.log(1.0 + price_change)
    return float(numerator / denominator)


def draw_uncertainty(
    random_state: Optional[Union[int, np.random.Generator]],
    e_samples: np.ndarray,
    n_sims: int = N_SIMULATIONS,
    noise_sigma: float = DEMAND_NOISE_SIGMA,
) -> Tuple[np.ndarray, np.ndarray]:
    """Sample joint elasticity and market demand noise for Monte Carlo simulations.

    Draws are coupled across runs so that competing price proposals are evaluated
    against identical simulated future worlds.

    Args:
        random_state: Seed or np.random.Generator for reproducibility.
        e_samples: Pool of bootstrap elasticity estimates.
        n_sims: Total number of Monte Carlo iterations.
        noise_sigma: Standard deviation of lognormal demand noise.

    Returns:
        Tuple[np.ndarray, np.ndarray]:
            - Sampled elasticities array of shape (n_sims,).
            - Sampled multiplicative demand noise array of shape (n_sims,).
    """
    rng = get_rng(random_state)
    elasticity_draws = rng.choice(e_samples, size=n_sims)
    noise_draws = rng.lognormal(mean=0.0, sigma=noise_sigma, size=n_sims)
    return elasticity_draws, noise_draws


def monte_carlo_summary(
    base: Dict[str, float],
    price_change: float,
    draws: Tuple[np.ndarray, np.ndarray],
    stock: Optional[float] = None,
    fixed_cost: float = 0.0,
) -> Dict[str, float]:
    """Summarize Monte Carlo uncertainty distributions into key quantiles and metrics.

    Args:
        base: Baseline dictionary.
        price_change: Fractional price change.
        draws: Tuple of (elasticity_draws, noise_draws).
        stock: Optional inventory limit.
        fixed_cost: Monthly fixed operating cost.

    Returns:
        Dict[str, float]: Summary metrics containing 'profit_p5', 'profit_p50',
            'profit_p95', 'prob_profit_above_baseline', and 'revenue_p50'.
    """
    e_draws, noise_draws = draws
    result = outcomes(
        base=base,
        price_change=price_change,
        elasticity=e_draws,
        noise=noise_draws,
        stock=stock,
        fixed_cost=fixed_cost,
    )
    base_profit = float(baseline_outcome(base, stock=stock, fixed_cost=fixed_cost)["profit"])

    profit_arr = np.asarray(result["profit"], dtype=float)
    p5, p50, p95 = np.percentile(profit_arr, [5.0, 50.0, 95.0])
    prob_beat_base = float(np.mean(profit_arr > base_profit))
    median_revenue = float(np.median(result["revenue"]))

    return {
        "profit_p5": float(p5),
        "profit_p50": float(p50),
        "profit_p95": float(p95),
        "prob_profit_above_baseline": prob_beat_base,
        "revenue_p50": median_revenue,
    }


def sensitivity_table(
    base: Dict[str, float],
    price_change: float,
    drops: Tuple[float, ...] = (0.05, 0.10, 0.20),
    stock: Optional[float] = None,
    fixed_cost: float = 0.0,
) -> List[Dict[str, float]]:
    """Generate sensitivity analysis table for deterministic drops in sales volume.

    Args:
        base: Baseline dictionary.
        price_change: Proposed fractional price change.
        drops: Tuple of fixed percentage drops in demand (e.g. 0.05 for -5%).
        stock: Optional inventory limit.
        fixed_cost: Monthly fixed cost.

    Returns:
        List[Dict[str, float]]: List of sensitivity results for each volume drop.
    """
    base_profit = float(baseline_outcome(base, stock=stock, fixed_cost=fixed_cost)["profit"])
    new_price = base["price"] * (1.0 + price_change)
    rows: List[Dict[str, float]] = []

    for drop in drops:
        demanded_qty = base["qty"] * (1.0 - drop)
        qty = min(demanded_qty, stock) if stock is not None else demanded_qty
        profit = qty * (new_price - base["unit_cost"]) - fixed_cost
        profit_change = (profit - base_profit) / base_profit if abs(base_profit) > 1e-9 else 0.0
        rows.append({
            "volume_drop": float(drop),
            "profit": float(profit),
            "profit_change_pct": float(profit_change),
        })

    return rows


# ---------------- 4. REVERSE WHAT-IF OPTIMIZATION ----------------
def reverse_what_if(
    base: Dict[str, float],
    draws: Tuple[np.ndarray, np.ndarray],
    target_growth: float,
    history_range: Tuple[float, float],
    max_spend: Optional[float] = None,
    stock: Optional[float] = None,
    fixed_cost: float = 0.0,
    allow_extrapolation: bool = False,
    step: float = 0.01,
    top: int = 5,
) -> Dict[str, Any]:
    """Perform constrained goal-driven search to discover optimal decision policies.

    Instead of simulating an arbitrary choice, searches the grid of candidate price changes
    to identify options that maximize probability of hitting target profit within budget.

    Args:
        base: Baseline dictionary.
        draws: Tuple of Monte Carlo elasticity and noise draws.
        target_growth: Target profit growth relative to baseline (e.g., 0.10 for +10%).
        history_range: Tuple of (min_rel_price, max_rel_price) observed historically.
        max_spend: Optional working capital expenditure budget. Defaults to baseline spend.
        stock: Optional inventory limit in physical units.
        fixed_cost: Monthly fixed cost.
        allow_extrapolation: If True, explores outside historical price range [-20%, +30%].
        step: Grid search step size (default 0.01 = 1%).
        top: Number of top candidate policies to return.

    Returns:
        Dict[str, Any]: Ranked feasible options, target profit, budget, and reachability.
    """
    e_draws, noise_draws = draws
    hist_low, hist_high = history_range
    low_bound, high_bound = (-0.20, 0.30) if allow_extrapolation else (hist_low, hist_high)

    today = baseline_outcome(base, stock=stock, fixed_cost=fixed_cost)
    target_profit = float(today["profit"]) * (1.0 + target_growth)
    budget = float(today["spend"]) if max_spend is None else float(max_spend)

    options: List[Dict[str, Any]] = []
    # Grid search across candidate price changes
    grid = np.arange(low_bound, high_bound + 1e-9, step)
    for change in grid:
        change_val = float(round(change, 4))
        res = outcomes(
            base=base,
            price_change=change_val,
            elasticity=e_draws,
            noise=noise_draws,
            stock=stock,
            fixed_cost=fixed_cost,
        )
        profit_arr = np.asarray(res["profit"])
        spend_arr = np.asarray(res["spend"])

        success = (profit_arr >= target_profit) & (spend_arr <= budget)
        prob_success = float(np.mean(success))
        expected_profit = float(np.mean(profit_arr))
        expected_spend = float(np.mean(spend_arr))
        is_outside = bool(change_val < hist_low - 1e-9 or change_val > hist_high + 1e-9)

        options.append({
            "price_change": change_val,
            "new_price": float(base["price"] * (1.0 + change_val)),
            "prob_success": prob_success,
            "expected_profit": expected_profit,
            "expected_spend": expected_spend,
            "outside_history": is_outside,
        })

    # Sort descending by probability of success, breaking ties with expected profit
    ranked = sorted(options, key=lambda o: (-o["prob_success"], -o["expected_profit"]))
    top_candidates = ranked[:top]
    reachable = bool(top_candidates and top_candidates[0]["prob_success"] >= 0.50)

    return {
        "target_profit": target_profit,
        "target_growth": target_growth,
        "budget": budget,
        "best_options": top_candidates,
        "reachable": reachable,
        "searched_range": [float(low_bound), float(high_bound)],
    }


# ---------------- 5. END-TO-END PIPELINE ----------------
def analyse(
    csv_path: str,
    product_id: str,
    price_change: float = 0.10,
    reverse_target: Optional[float] = None,
    stock: Optional[float] = None,
    fixed_cost: float = 0.0,
    method: str = "poisson",
    random_state: Optional[Union[int, np.random.Generator]] = DEFAULT_SEED,
    allow_extrapolation: bool = False,
) -> Dict[str, Any]:
    """Execute complete decision analysis pipeline for a specified product.

    Pipeline steps:
        1. Validate data existence for product_id.
        2. Estimate elasticity distribution via bootstrap.
        3. Formulate normalized monthly baseline.
        4. Synthesize Monte Carlo uncertainty draws.
        5. Build 4 statistical scenarios and break-even elasticity.
        6. Compute Monte Carlo summary and deterministic sensitivity tables.
        7. Execute reverse What-If optimization if target is supplied.

    Args:
        csv_path: Path to sales CSV file.
        product_id: Target product identifier.
        price_change: Proposed fractional price change (default: +0.10 = +10%).
        reverse_target: Target profit growth for Reverse What-If (e.g. 0.15 = +15%).
        stock: Physical inventory constraint.
        fixed_cost: Monthly fixed cost in VND.
        method: Estimation model ('poisson' or 'loglog').
        random_state: Random state for deterministic repeatability.
        allow_extrapolation: Whether Reverse What-If may explore outside historical price span.

    Returns:
        Dict[str, Any]: Comprehensive JSON-serializable decision analysis result.

    Raises:
        FileNotFoundError: If csv_path does not exist.
        ValueError: If product_id is not found in the dataset.
    """
    sales = pd.read_csv(csv_path)
    df_prod = sales[sales["product_id"] == product_id].copy()
    if df_prod.empty:
        raise ValueError(f"Product '{product_id}' not found in dataset: {csv_path}")

    rng = get_rng(random_state)
    point, samples, price_sd = estimate_elasticity(df_prod, random_state=rng, method=method)
    base = build_baseline(df_prod, point_elasticity=point)
    draws = draw_uncertainty(rng, samples)

    hist_min_price = float(df_prod["price_vnd"].min())
    hist_max_price = float(df_prod["price_vnd"].max())
    history_range = (
        float(hist_min_price / base["price"] - 1.0),
        float(hist_max_price / base["price"] - 1.0),
    )

    warnings: List[str] = []
    if price_change < history_range[0] - 1e-9 or price_change > history_range[1] + 1e-9:
        warnings.append(
            f"Proposed price change ({price_change:+.0%}) is outside the historical range "
            f"({history_range[0]:+.0%} to {history_range[1]:+.0%}): result is an extrapolation."
        )
    if price_sd < LOW_PRICE_SD:
        warnings.append("Price variation in history is very low: elasticity estimate is volatile.")
    if np.percentile(samples, 90.0) >= 0.0:
        warnings.append("Empirical distribution does not definitively confirm downward-sloping demand.")

    scenarios = four_scenarios(
        base=base,
        price_change=price_change,
        e_samples=samples,
        point_elasticity=point,
        stock=stock,
        fixed_cost=fixed_cost,
    )
    mc_summary = monte_carlo_summary(
        base=base,
        price_change=price_change,
        draws=draws,
        stock=stock,
        fixed_cost=fixed_cost,
    )
    be_elasticity = breakeven_elasticity(base=base, price_change=price_change)
    sens_table = sensitivity_table(
        base=base, price_change=price_change, stock=stock, fixed_cost=fixed_cost
    )

    result: Dict[str, Any] = {
        "product_id": product_id,
        "product_name": str(df_prod["product_name"].iloc[0]),
        "assumptions": {
            "horizon_days": HORIZON_DAYS,
            "lookback_days": LOOKBACK_DAYS,
            "demand_noise_sigma": DEMAND_NOISE_SIGMA,
            "n_simulations": N_SIMULATIONS,
            "stock_limit": stock,
            "fixed_cost": fixed_cost,
            "method": method,
        },
        "elasticity": {
            "point": float(point),
            "p10": float(np.percentile(samples, 10.0)),
            "p90": float(np.percentile(samples, 90.0)),
            "price_sd": float(price_sd),
        },
        "baseline": {
            "price": float(base["price"]),
            "unit_cost": float(base["unit_cost"]),
            "monthly_qty": float(base["qty"]),
        },
        "price_change": float(price_change),
        "history_range": [float(history_range[0]), float(history_range[1])],
        "warnings": warnings,
        "scenarios": scenarios,
        "monte_carlo": mc_summary,
        "breakeven_elasticity": be_elasticity,
        "sensitivity": sens_table,
    }

    if reverse_target is not None:
        rev_res = reverse_what_if(
            base=base,
            draws=draws,
            target_growth=reverse_target,
            history_range=history_range,
            stock=stock,
            fixed_cost=fixed_cost,
            allow_extrapolation=allow_extrapolation,
        )
        result["reverse_what_if"] = rev_res

    return result


# ---------------- 6. FORMATTING & CLI INTERFACE ----------------
def format_currency_vnd(amount: float) -> str:
    """Format floating point numbers into readable VND currency strings.

    Args:
        amount: Numerical amount in VND.

    Returns:
        str: Comma-separated currency string (e.g. '1,000,000').
    """
    return f"{amount:,.0f}"


def print_report(r: Dict[str, Any]) -> None:
    """Print a clean textual executive summary of the decision analysis report.

    Args:
        r: Dictionary produced by analyse().
    """
    e, b = r["elasticity"], r["baseline"]
    print(f"\n=======================================================")
    print(f"BÁO CÁO MÔ PHỎNG: {r['product_id']} - {r['product_name']}")
    print(f"=======================================================")
    print(
        f"Độ co giãn ước lượng: {e['point']:.2f} "
        f"(Khoảng tin cậy 90%: {e['p10']:.2f} đến {e['p90']:.2f})"
    )
    print(
        f"Baseline hàng tháng: Giá {format_currency_vnd(b['price'])} VND, "
        f"Giá vốn {format_currency_vnd(b['unit_cost'])} VND, "
        f"Sản lượng {b['monthly_qty']:,.0f}"
    )

    lo, hi = r["history_range"]
    print(f"Dải giá từng xuất hiện trong lịch sử: {lo:+.0%} đến {hi:+.0%}")
    for warning in r["warnings"]:
        print(f"⚠️ CẢNH BÁO: {warning}")

    print(f"\nĐề xuất thay đổi giá: {r['price_change']:+.0%}")
    print(
        f"{'Kịch bản':<14}{'Độ co giãn':>12}{'Sản lượng':>12}"
        f"{'Doanh thu':>18}{'Lợi nhuận':>18}"
    )
    print("-" * 74)
    for name, s in r["scenarios"].items():
        el_str = "-" if s["elasticity"] is None else f"{s['elasticity']:.2f}"
        qty_val = float(s["qty"]) if s["qty"] is not None else 0.0
        rev_val = float(s["revenue"]) if s["revenue"] is not None else 0.0
        prof_val = float(s["profit"]) if s["profit"] is not None else 0.0
        print(
            f"{name:<14}{el_str:>12}{qty_val:>12,.0f}"
            f"{format_currency_vnd(rev_val):>18}{format_currency_vnd(prof_val):>18}"
        )

    mc = r["monte_carlo"]
    print(
        f"\nMô phỏng Monte Carlo ({r['assumptions']['n_simulations']:,} lượt): "
        f"Lợi nhuận p5-p50-p95 = {format_currency_vnd(mc['profit_p5'])} / "
        f"{format_currency_vnd(mc['profit_p50'])} / {format_currency_vnd(mc['profit_p95'])} VND"
    )
    print(f"Xác suất lợi nhuận vượt cơ sở: {mc['prob_profit_above_baseline']:.1%}")

    be = r["breakeven_elasticity"]
    if be is not None:
        print(f"Độ co giãn hòa vốn: {be:.2f} (nếu nhạy giá hơn ngưỡng này, lợi nhuận sẽ giảm)")

    print("\nPhân tích độ nhạy (Sản lượng giảm cố định):")
    for s in r["sensitivity"]:
        print(
            f"  Sản lượng {-s['volume_drop']:+.0%}: "
            f"Lợi nhuận {format_currency_vnd(s['profit'])} VND ({s['profit_change_pct']:+.1%} vs baseline)"
        )

    if "reverse_what_if" in r:
        rv = r["reverse_what_if"]
        print(f"\n-------------------------------------------------------")
        print(
            f"REVERSE WHAT-IF: Mục tiêu lợi nhuận {format_currency_vnd(rv['target_profit'])} VND "
            f"(+{rv['target_growth']:.0%}), Ngân sách tối đa {format_currency_vnd(rv['budget'])} VND"
        )
        print(
            f"  Dải giá đã quét: {rv['searched_range'][0]:+.0%} đến {rv['searched_range'][1]:+.0%}"
        )
        if not rv["reachable"]:
            print("  ⚠️ Không có mức giá đơn lẻ nào đạt mục tiêu với xác suất >= 50%.")
        for idx, opt in enumerate(rv["best_options"], start=1):
            note = " (ngoài lịch sử)" if opt["outside_history"] else ""
            print(
                f"  #{idx} Giá {opt['price_change']:+.0%} -> {format_currency_vnd(opt['new_price'])} VND: "
                f"P(Thành công) = {opt['prob_success']:.1%}, "
                f"Lợi nhuận kỳ vọng = {format_currency_vnd(opt['expected_profit'])} VND{note}"
            )
    print("=======================================================\n")


def main() -> None:
    """Command-line entrypoint for the What-If simulation engine."""
    parser = argparse.ArgumentParser(
        description="What-If AI: Quantitative Commercial Decision & Simulation Engine"
    )
    parser.add_argument("csv_path", type=str, help="Path to sales history CSV file")
    parser.add_argument("product_id", type=str, help="Product identifier to analyze")
    parser.add_argument(
        "--price-change",
        type=float,
        default=10.0,
        help="Proposed price change in percent (e.g. 10 for +10%%)",
    )
    parser.add_argument(
        "--reverse",
        type=float,
        default=None,
        help="Target profit growth in percent for Reverse What-If (e.g. 15 for +15%%)",
    )
    parser.add_argument(
        "--stock",
        type=float,
        default=None,
        help="Available stock capacity for the period",
    )
    parser.add_argument(
        "--fixed-cost",
        type=float,
        default=0.0,
        help="Monthly fixed overhead cost in VND",
    )
    parser.add_argument(
        "--method",
        choices=["poisson", "loglog"],
        default="poisson",
        help="Econometric estimation technique",
    )
    parser.add_argument(
        "--allow-extrapolation",
        action="store_true",
        help="Allow Reverse What-If to scan outside historical prices",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help="Random seed for reproducible simulations",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output machine-readable JSON format instead of text report",
    )
    args = parser.parse_args()

    result = analyse(
        csv_path=args.csv_path,
        product_id=args.product_id,
        price_change=args.price_change / 100.0,
        reverse_target=None if args.reverse is None else args.reverse / 100.0,
        stock=args.stock,
        fixed_cost=args.fixed_cost,
        method=args.method,
        random_state=args.seed,
        allow_extrapolation=args.allow_extrapolation,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print_report(result)


if __name__ == "__main__":
    main()
