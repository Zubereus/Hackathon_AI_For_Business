"""Deterministic econometric monitoring: probabilistic calibration, regime shifts & drift."""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from scipy import stats

from app.elasticity.fit import poisson_irls_fit
from app.features.build import build_econometric_design_matrix
from app.schemas.contracts import (
    CalibrationMetrics,
    ChangePointItem,
    DataLabel,
    DemandRegime,
    DriftMetrics,
    MonitoringEvaluateResponse,
    RegimeAnalysis,
    RegimeSeriesPoint,
    ReliabilityPoint,
    RollingCalibrationWindow,
)


def compute_pinball_loss(y_true: np.ndarray, y_pred_q: np.ndarray, quantile: float) -> float:
    """Compute mean pinball (quantile) loss at quantile tau in (0, 1)."""
    diff = y_true - y_pred_q
    loss = np.maximum(quantile * diff, (quantile - 1.0) * diff)
    return float(np.mean(loss))


def compute_interval_score(
    y_true: np.ndarray,
    lower: np.ndarray,
    upper: np.ndarray,
    alpha: float,
) -> np.ndarray:
    """Compute Bracher et al. interval score for central (1 - alpha) prediction interval."""
    width = np.maximum(upper - lower, 0.0)
    below = np.where(y_true < lower, (2.0 / alpha) * (lower - y_true), 0.0)
    above = np.where(y_true > upper, (2.0 / alpha) * (y_true - upper), 0.0)
    return width + below + above


def compute_wis(
    y_true: np.ndarray,
    q05: np.ndarray,
    q10: np.ndarray,
    q25: np.ndarray,
    q50: np.ndarray,
    q75: np.ndarray,
    q90: np.ndarray,
    q95: np.ndarray,
) -> float:
    """Compute Weighted Interval Score (WIS) over [50%, 80%, 90%] central intervals + median."""
    is_50 = compute_interval_score(y_true, q25, q75, alpha=0.50)
    is_80 = compute_interval_score(y_true, q10, q90, alpha=0.20)
    is_90 = compute_interval_score(y_true, q05, q95, alpha=0.10)
    k = 3.0
    wis_arr = (0.5 * np.abs(y_true - q50) + 0.25 * is_50 + 0.10 * is_80 + 0.05 * is_90) / (k + 0.5)
    return float(np.mean(wis_arr))


def compute_psi(baseline: np.ndarray, recent: np.ndarray, n_bins: int = 8) -> float:
    """Compute Population Stability Index (PSI) between baseline and recent feature distributions."""
    if len(baseline) < 5 or len(recent) < 5:
        return 0.0
    edges = np.quantile(baseline, np.linspace(0.0, 1.0, n_bins + 1))
    edges = np.unique(edges)
    if len(edges) < 3:
        return 0.0
    edges[0] = -np.inf
    edges[-1] = np.inf
    base_counts, _ = np.histogram(baseline, bins=edges)
    rec_counts, _ = np.histogram(recent, bins=edges)
    base_pct = np.clip(base_counts / max(len(baseline), 1), 1e-4, None)
    rec_pct = np.clip(rec_counts / max(len(recent), 1), 1e-4, None)
    base_pct /= base_pct.sum()
    rec_pct /= rec_pct.sum()
    return float(np.sum((rec_pct - base_pct) * np.log(rec_pct / base_pct)))


def compute_durbin_watson(residuals: np.ndarray) -> float:
    """Compute Durbin-Watson statistic (~2.0 implies zero lag-1 residual autocorrelation)."""
    if len(residuals) < 4:
        return 2.0
    denom = float(np.sum(residuals ** 2))
    if denom <= 1e-12:
        return 2.0
    num = float(np.sum(np.diff(residuals) ** 2))
    return float(num / denom)


def _segment_gaussian_loss(arr: np.ndarray) -> float:
    n = len(arr)
    if n <= 1:
        return 0.0
    var = max(float(np.var(arr)), 1e-3)
    return n * math.log(var)


def detect_change_points_bic(
    values: np.ndarray,
    dates: List[str],
    min_seg_len: int = 14,
    max_cps: int = 4,
    penalty_mult: float = 3.2,
) -> Tuple[List[ChangePointItem], List[DemandRegime], np.ndarray]:
    """Binary segmentation change-point detector using penalized Gaussian likelihood (BIC)."""
    n = len(values)
    if n < 2 * min_seg_len:
        mean_v = float(np.mean(values)) if n > 0 else 0.0
        std_v = float(np.std(values, ddof=1)) if n > 1 else 0.0
        cv = std_v / max(mean_v, 1e-6)
        reg = DemandRegime(
            regime_id=1,
            start_date=dates[0] if dates else "",
            end_date=dates[-1] if dates else "",
            n_days=n,
            mean_qty=round(mean_v, 2),
            std_qty=round(std_v, 2),
            cv=round(cv, 3),
            label="baseline",
        )
        return [], [reg], np.full(n, mean_v, dtype=float)

    threshold = penalty_mult * math.log(max(n, 2))
    splits: List[Tuple[int, float]] = []

    def _recurse(start: int, end: int) -> None:
        if end - start < 2 * min_seg_len or len(splits) >= max_cps:
            return
        seg = values[start:end]
        full_loss = _segment_gaussian_loss(seg)
        best_gain = -1.0
        best_idx = -1
        for k in range(start + min_seg_len, end - min_seg_len + 1):
            gain = full_loss - (_segment_gaussian_loss(values[start:k]) + _segment_gaussian_loss(values[k:end]))
            if gain > best_gain:
                best_gain = gain
                best_idx = k
        if best_idx > 0 and best_gain > threshold:
            splits.append((best_idx, best_gain))
            _recurse(start, best_idx)
            _recurse(best_idx, end)

    _recurse(0, n)
    splits.sort(key=lambda item: item[0])

    # Build contiguous segments
    boundaries = [0] + [idx for idx, _ in splits] + [n]
    global_mean = float(np.mean(values))
    regime_means = np.zeros(n, dtype=float)
    regimes: List[DemandRegime] = []

    for r_i in range(len(boundaries) - 1):
        s_idx, e_idx = boundaries[r_i], boundaries[r_i + 1]
        seg = values[s_idx:e_idx]
        m_v = float(np.mean(seg))
        sd_v = float(np.std(seg, ddof=1)) if len(seg) > 1 else 0.0
        cv = sd_v / max(m_v, 1e-6)
        regime_means[s_idx:e_idx] = m_v

        rel_diff = (m_v - global_mean) / max(global_mean, 1e-6)
        if cv > 0.65:
            lbl = "volatile"
        elif rel_diff >= 0.15:
            lbl = "expansion"
        elif rel_diff <= -0.15:
            lbl = "contraction"
        else:
            lbl = "baseline"

        regimes.append(
            DemandRegime(
                regime_id=r_i + 1,
                start_date=dates[s_idx],
                end_date=dates[e_idx - 1],
                n_days=int(e_idx - s_idx),
                mean_qty=round(m_v, 2),
                std_qty=round(sd_v, 2),
                cv=round(cv, 3),
                label=lbl,
            )
        )

    cp_items: List[ChangePointItem] = []
    for i, (cp_idx, gain) in enumerate(splits):
        before_m = regimes[i].mean_qty
        after_m = regimes[i + 1].mean_qty
        pct_shift = ((after_m - before_m) / max(before_m, 1e-6)) * 100.0
        cp_items.append(
            ChangePointItem(
                date=dates[cp_idx],
                index=int(cp_idx),
                before_mean_qty=round(before_m, 2),
                after_mean_qty=round(after_m, 2),
                pct_shift=round(pct_shift, 2),
                bic_gain=round(float(gain), 2),
            )
        )

    return cp_items, regimes, regime_means


def _sample_predictive_quantiles(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    rng: np.random.Generator,
    n_draws: int = 240,
) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
    """Sample predictive demand quantiles from Poisson/NegBin GLM + HC1 parameter covariance."""
    beta, cov = poisson_irls_fit(X_train, y_train)
    cov_sym = 0.5 * (cov + cov.T)
    # Regularize covariance slightly for PSD safety in multivariate_normal
    cov_psd = cov_sym + 1e-8 * np.eye(cov_sym.shape[0])

    mu_train = np.exp(np.clip(X_train @ beta, -20.0, 20.0))
    dof = max(len(y_train) - X_train.shape[1], 1)
    pearson_chi2 = float(np.sum(((y_train - mu_train) ** 2) / np.maximum(mu_train, 0.5)))
    phi = float(np.clip(pearson_chi2 / dof, 1.0, 25.0))

    try:
        beta_draws = rng.multivariate_normal(beta, cov_psd, size=n_draws, method="svd")
    except Exception:
        se_diag = np.sqrt(np.maximum(np.diag(cov_psd), 1e-8))
        beta_draws = beta[None, :] + rng.normal(0.0, se_diag, size=(n_draws, len(beta)))

    eta_mat = np.clip(X_test @ beta_draws.T, -15.0, 12.0)  # (n_test, n_draws)
    mu_mat = np.exp(eta_mat)

    if phi > 1.05:
        shape_mat = np.maximum(mu_mat / (phi - 1.0), 1e-3)
        rate_mu = rng.gamma(shape=shape_mat, scale=(phi - 1.0))
        y_draws = rng.poisson(np.clip(rate_mu, 0.0, 1e6)).astype(float)
    else:
        y_draws = rng.poisson(np.clip(mu_mat, 0.0, 1e6)).astype(float)

    q_levels = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
    qs = np.quantile(y_draws, q_levels, axis=1)
    point_mean = np.exp(np.clip(X_test @ beta, -15.0, 12.0))
    q_dict = {
        "q05": qs[0],
        "q10": qs[1],
        "q25": qs[2],
        "q50": qs[3],
        "q75": qs[4],
        "q90": qs[5],
        "q95": qs[6],
    }
    return point_mean, q_dict


def evaluate_monitoring(
    df: pd.DataFrame,
    product_id: str,
    data_label: DataLabel = "USER",
    is_m5_data: bool = False,
    n_rolling_windows: int = 3,
    seed: int = 42,
) -> MonitoringEvaluateResponse:
    """Run rolling probabilistic calibration, change-point regime detection & drift diagnostics."""
    df_prod = df[df["product_id"].astype(str) == str(product_id)].copy()
    if df_prod.empty:
        raise ValueError(f"Product '{product_id}' not found in dataset.")

    X, y, feature_names, clean_df = build_econometric_design_matrix(
        df_prod, drop_stockouts=True, is_m5_data=is_m5_data
    )
    n = len(clean_df)
    if n < 45:
        raise ValueError(f"Need at least 45 non-stockout days for calibration & drift monitoring (got {n}).")

    dates = clean_df["date"].astype(str).tolist()
    price_col = "price" if "price" in clean_df.columns else "price_vnd"
    prices = clean_df[price_col].to_numpy(dtype=float)

    rng = np.random.default_rng(seed)

    # Expanding-window walk-forward evaluation over trailing ~40% of usable series
    train_start = max(int(n * 0.55), 30)
    oos_len = n - train_start
    if oos_len < 12:
        train_start = n - 12
        oos_len = 12

    eff_windows = max(2, min(n_rolling_windows, max(1, oos_len // 6)))
    fold_bounds = np.linspace(train_start, n, eff_windows + 1, dtype=int)

    all_y: List[np.ndarray] = []
    all_mu: List[np.ndarray] = []
    q_acc: Dict[str, List[np.ndarray]] = {k: [] for k in ("q05", "q10", "q25", "q50", "q75", "q90", "q95")}
    rolling_windows: List[RollingCalibrationWindow] = []

    for w_i in range(eff_windows):
        s_idx, e_idx = int(fold_bounds[w_i]), int(fold_bounds[w_i + 1])
        if e_idx <= s_idx:
            continue
        mu_pred, q_dict = _sample_predictive_quantiles(
            X[:s_idx], y[:s_idx], X[s_idx:e_idx], rng=rng, n_draws=240
        )
        y_w = y[s_idx:e_idx]
        all_y.append(y_w)
        all_mu.append(mu_pred)
        for k, arr in q_dict.items():
            q_acc[k].append(arr)

        wape_w = (float(np.sum(np.abs(y_w - mu_pred))) / max(float(np.sum(y_w)), 1e-6)) * 100.0
        picp80_w = float(np.mean((y_w >= q_dict["q10"]) & (y_w <= q_dict["q90"]))) * 100.0
        mpiw80_w = float(np.mean(q_dict["q90"] - q_dict["q10"]))
        wis_w = compute_wis(
            y_w,
            q_dict["q05"], q_dict["q10"], q_dict["q25"], q_dict["q50"],
            q_dict["q75"], q_dict["q90"], q_dict["q95"],
        )
        rolling_windows.append(
            RollingCalibrationWindow(
                window_label=f"W{w_i + 1}",
                start_date=dates[s_idx],
                end_date=dates[e_idx - 1],
                n_obs=int(e_idx - s_idx),
                wape_pct=round(wape_w, 2),
                picp_80=round(picp80_w, 1),
                mpiw_80=round(mpiw80_w, 2),
                wis=round(wis_w, 3),
            )
        )

    y_oos = np.concatenate(all_y)
    mu_oos = np.concatenate(all_mu)
    q_cat = {k: np.concatenate(v) for k, v in q_acc.items()}

    picp_50 = float(np.mean((y_oos >= q_cat["q25"]) & (y_oos <= q_cat["q75"]))) * 100.0
    picp_80 = float(np.mean((y_oos >= q_cat["q10"]) & (y_oos <= q_cat["q90"]))) * 100.0
    picp_90 = float(np.mean((y_oos >= q_cat["q05"]) & (y_oos <= q_cat["q95"]))) * 100.0
    mpiw_80 = float(np.mean(q_cat["q90"] - q_cat["q10"]))
    rel_mpiw_80 = (mpiw_80 / max(float(np.mean(y_oos)), 1e-6)) * 100.0

    pinball_10 = compute_pinball_loss(y_oos, q_cat["q10"], 0.10)
    pinball_50 = compute_pinball_loss(y_oos, q_cat["q50"], 0.50)
    pinball_90 = compute_pinball_loss(y_oos, q_cat["q90"], 0.90)
    wis_total = compute_wis(
        y_oos,
        q_cat["q05"], q_cat["q10"], q_cat["q25"], q_cat["q50"],
        q_cat["q75"], q_cat["q90"], q_cat["q95"],
    )

    reliability_curve = [
        ReliabilityPoint(
            nominal_quantile=q_val,
            empirical_coverage=round(float(np.mean(y_oos <= q_cat[key])) * 100.0, 1),
            n_obs=int(len(y_oos)),
        )
        for q_val, key in [(10.0, "q10"), (25.0, "q25"), (50.0, "q50"), (75.0, "q75"), (90.0, "q90")]
    ]

    if picp_80 < 68.0:
        cal_status = "under_covered"
    elif picp_80 > 93.0:
        cal_status = "over_dispersed"
    else:
        cal_status = "well_calibrated"

    calibration = CalibrationMetrics(
        n_oos=int(len(y_oos)),
        picp_50=round(picp_50, 1),
        picp_80=round(picp_80, 1),
        picp_90=round(picp_90, 1),
        mpiw_80=round(mpiw_80, 2),
        relative_mpiw_80_pct=round(rel_mpiw_80, 1),
        pinball_q10=round(pinball_10, 3),
        pinball_q50=round(pinball_50, 3),
        pinball_q90=round(pinball_90, 3),
        wis=round(wis_total, 3),
        reliability_curve=reliability_curve,
        rolling_windows=rolling_windows,
        calibration_status=cal_status,
    )

    # ---------------- 2. REGIME DETECTION & ELASTICITY STABILITY ----------------
    # Deseasonalize weekday vs weekend ratio to isolate structural level shifts
    is_weekend = X[:, feature_names.index("is_weekend")] if "is_weekend" in feature_names else np.zeros(n)
    wkdy_mean = float(np.mean(y[is_weekend == 0])) if np.any(is_weekend == 0) else float(np.mean(y))
    wknd_mean = float(np.mean(y[is_weekend == 1])) if np.any(is_weekend == 1) else wkdy_mean
    wk_factor = np.where(is_weekend == 1, np.clip(wknd_mean / max(wkdy_mean, 1e-6), 0.5, 2.0), 1.0)
    y_deseason = y / wk_factor

    cp_items, regimes, regime_means = detect_change_points_bic(
        y_deseason, dates, min_seg_len=max(14, min(21, n // 6))
    )

    # Early vs recent elasticity stability test (when both halves have enough obs & price variation)
    mid = n // 2
    early_e: Optional[float] = None
    recent_e: Optional[float] = None
    shift_z: Optional[float] = None
    shift_p: Optional[float] = None
    elast_stable = True
    log_p_idx = feature_names.index("log_price")
    if mid >= 25 and (n - mid) >= 25:
        if float(np.std(prices[:mid])) > 1e-6 and float(np.std(prices[mid:])) > 1e-6:
            b_early, c_early = poisson_irls_fit(X[:mid], y[:mid])
            b_rec, c_rec = poisson_irls_fit(X[mid:], y[mid:])
            e1 = float(b_early[log_p_idx])
            e2 = float(b_rec[log_p_idx])
            se1 = math.sqrt(max(float(c_early[log_p_idx, log_p_idx]), 1e-8))
            se2 = math.sqrt(max(float(c_rec[log_p_idx, log_p_idx]), 1e-8))
            z_val = (e2 - e1) / math.sqrt(se1 * se1 + se2 * se2)
            p_val = float(2.0 * (1.0 - stats.norm.cdf(abs(z_val))))
            early_e = round(e1, 3)
            recent_e = round(e2, 3)
            shift_z = round(z_val, 3)
            shift_p = round(p_val, 4)
            elast_stable = p_val >= 0.05

    # Trailing 7d rolling average for clean visual timeline
    roll_7d = pd.Series(y).rolling(window=7, min_periods=1).mean().to_numpy()
    step = 1 if n <= 150 else max(1, n // 150)
    preview = [
        RegimeSeriesPoint(
            date=dates[idx],
            actual_qty=round(float(y[idx]), 2),
            rolling_mean_qty=round(float(roll_7d[idx]), 2),
            regime_mean_qty=round(float(regime_means[idx]), 2),
        )
        for idx in range(0, n, step)
    ]

    regime_analysis = RegimeAnalysis(
        change_points=cp_items,
        regimes=regimes,
        early_elasticity=early_e,
        recent_elasticity=recent_e,
        elasticity_shift_z=shift_z,
        elasticity_shift_p_value=shift_p,
        elasticity_stable=elast_stable,
        series_preview=preview,
    )

    # ---------------- 3. DRIFT MONITOR ----------------
    split_idx = train_start
    p_base, p_rec = prices[:split_idx], prices[split_idx:]
    y_base, y_rec = y[:split_idx], y[split_idx:]

    price_psi = compute_psi(p_base, p_rec)
    qty_psi = compute_psi(y_base, y_rec)

    if len(np.unique(p_base)) > 1 or len(np.unique(p_rec)) > 1:
        ks_p_res = stats.ks_2samp(p_base, p_rec)
        p_ks_stat, p_ks_p = float(ks_p_res.statistic), float(ks_p_res.pvalue)
    else:
        p_ks_stat, p_ks_p = 0.0, 1.0

    ks_q_res = stats.ks_2samp(y_base, y_rec)
    q_ks_stat, q_ks_p = float(ks_q_res.statistic), float(ks_q_res.pvalue)

    b_ref, _ = poisson_irls_fit(X[:split_idx], y[:split_idx])
    mu_base = np.exp(np.clip(X[:split_idx] @ b_ref, -15.0, 12.0))
    base_wape = (float(np.sum(np.abs(y_base - mu_base))) / max(float(np.sum(y_base)), 1e-6)) * 100.0
    rec_wape = (float(np.sum(np.abs(y_oos - mu_oos))) / max(float(np.sum(y_oos)), 1e-6)) * 100.0
    err_ratio = rec_wape / max(base_wape, 1e-3)

    resid_oos = y_oos - mu_oos
    mean_bias_pct = (float(np.mean(resid_oos)) / max(float(np.mean(y_oos)), 1e-6)) * 100.0
    dw_stat = compute_durbin_watson(resid_oos)

    flags: List[str] = []
    if price_psi >= 0.25 or p_ks_p < 0.01:
        flags.append("price_distribution_shift")
    if qty_psi >= 0.25 or q_ks_p < 0.01:
        flags.append("demand_distribution_shift")
    if err_ratio >= 1.35 and abs(rec_wape - base_wape) >= 5.0:
        flags.append("forecast_error_degradation")
    if abs(mean_bias_pct) >= 15.0:
        flags.append("residual_mean_bias")
    if dw_stat < 1.35 or dw_stat > 2.65:
        flags.append("residual_autocorrelation")
    if not elast_stable:
        flags.append("elasticity_parameter_shift")
    if len(cp_items) > 0:
        flags.append("structural_break_detected")

    if ("elasticity_parameter_shift" in flags and "forecast_error_degradation" in flags) or len(flags) >= 3:
        d_status = "retrain_recommended"
    elif len(flags) >= 1:
        d_status = "watch"
    else:
        d_status = "healthy"

    drift = DriftMetrics(
        baseline_window=f"{dates[0]} -> {dates[split_idx - 1]}",
        recent_window=f"{dates[split_idx]} -> {dates[-1]}",
        price_psi=round(price_psi, 3),
        price_ks_stat=round(p_ks_stat, 3),
        price_ks_p_value=round(p_ks_p, 4),
        qty_psi=round(qty_psi, 3),
        qty_ks_stat=round(q_ks_stat, 3),
        qty_ks_p_value=round(q_ks_p, 4),
        baseline_wape_pct=round(base_wape, 2),
        recent_wape_pct=round(rec_wape, 2),
        error_drift_ratio=round(err_ratio, 3),
        residual_mean_bias_pct=round(mean_bias_pct, 2),
        durbin_watson=round(dw_stat, 3),
        drift_status=d_status,
        drift_flags=flags,
    )

    return MonitoringEvaluateResponse(
        product_id=str(product_id),
        data_label=data_label,
        total_usable_days=n,
        calibration=calibration,
        regimes=regime_analysis,
        drift=drift,
    )

