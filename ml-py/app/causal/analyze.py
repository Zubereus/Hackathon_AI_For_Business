"""Honest quasi-experimental causal impact diagnostics: Difference-in-Differences & ITS.

Never claims randomized causality from observational sales data:
- DiD always executes a pre-treatment parallel-trends test and control contamination check.
- ITS always states single-unit identification assumptions and concurrent shock risks.
"""

from __future__ import annotations

import math
from typing import List, Optional
import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

from app.backtest.run import find_price_change_events
from app.schemas.contracts import CausalAnalyzeResponse, CausalSeriesPoint


def _extract_product_series(df: pd.DataFrame, product_id: str) -> pd.DataFrame:
    sub = df[df["product_id"].astype(str) == str(product_id)].copy()
    if sub.empty:
        raise ValueError(f"Product '{product_id}' not found in dataset.")
    price_col = "price" if "price" in sub.columns else "price_vnd"
    qty_col = "quantity" if "quantity" in sub.columns else "quantity_sold"
    cost_col = "unit_cost" if "unit_cost" in sub.columns else ("unit_cost_vnd" if "unit_cost_vnd" in sub.columns else None)
    stock_col = "stock" if "stock" in sub.columns else ("stock_on_hand" if "stock_on_hand" in sub.columns else None)
    promo_col = "promo" if "promo" in sub.columns else ("promo_flag" if "promo_flag" in sub.columns else None)

    out = pd.DataFrame({
        "date": pd.to_datetime(sub["date"]).dt.strftime("%Y-%m-%d"),
        "price": pd.to_numeric(sub[price_col], errors="coerce"),
        "qty": pd.to_numeric(sub[qty_col], errors="coerce"),
        "unit_cost": pd.to_numeric(sub[cost_col], errors="coerce") if cost_col else 0.0,
        "stock": pd.to_numeric(sub[stock_col], errors="coerce") if stock_col else np.nan,
        "promo": pd.to_numeric(sub[promo_col], errors="coerce").fillna(0.0) if promo_col else 0.0,
    })
    out = out.dropna(subset=["date", "price", "qty"]).sort_values("date").reset_index(drop=True)
    return out


def _pick_intervention_date(df: pd.DataFrame, product_id: str, post_days: int) -> str:
    events = find_price_change_events(
        df, product_id, min_change_pct=0.05, min_pre_days=21, horizon_days=post_days
    )
    if events:
        best = max(events, key=lambda ev: abs(ev["price_change_pct"]))
        return str(best["date"])

    prod = _extract_product_series(df, product_id)
    if len(prod) < 28 + post_days:
        raise ValueError(
            f"Need at least {28 + post_days} days of sales for causal impact diagnostics on '{product_id}'."
        )
    # Fallback to post_days window at the tail of history if no >=5% price jump was detected
    return str(prod["date"].iloc[-post_days])


def analyze_causal_impact(
    df: pd.DataFrame,
    product_id: str,
    control_product_id: Optional[str] = None,
    intervention_date: Optional[str] = None,
    post_days: int = 21,
    method: str = "auto",
) -> CausalAnalyzeResponse:
    """Estimate incremental demand, revenue, and profit via DiD or Segmented ITS."""
    treated_df = _extract_product_series(df, product_id)
    if intervention_date is None:
        target_date = _pick_intervention_date(df, product_id, post_days=post_days)
    else:
        target_date = str(intervention_date)

    # Filter censored stockout days when stock column exists and stock == 0
    if treated_df["stock"].notna().any():
        treated_df = treated_df[treated_df["stock"].fillna(1) > 0].copy().reset_index(drop=True)

    pre_all = treated_df[treated_df["date"] < target_date].tail(60).copy()
    post_all = treated_df[treated_df["date"] >= target_date].head(post_days).copy()

    if len(pre_all) < 14 or len(post_all) < 5:
        raise ValueError(
            f"Insufficient observations around {target_date}: got {len(pre_all)} pre-days and {len(post_all)} post-days (require >=14 pre, >=5 post)."
        )

    use_did = False
    if method == "did":
        if not control_product_id or str(control_product_id) == str(product_id):
            raise ValueError("Difference-in-Differences requires a distinct valid control_product_id.")
        use_did = True
    elif method == "auto" and control_product_id and str(control_product_id) != str(product_id):
        use_did = True

    warnings: List[str] = []
    assumptions: List[str] = []

    pre_price_mean = float(pre_all["price"].mean())
    post_price_mean = float(post_all["price"].mean())
    post_cost_mean = float(post_all["unit_cost"].mean()) if post_all["unit_cost"].notna().any() else 0.0
    pre_cost_mean = float(pre_all["unit_cost"].mean()) if pre_all["unit_cost"].notna().any() else post_cost_mean

    if use_did:
        ctrl_df = _extract_product_series(df, str(control_product_id))
        if ctrl_df["stock"].notna().any():
            ctrl_df = ctrl_df[ctrl_df["stock"].fillna(1) > 0].copy()

        window_df_t = pd.concat([pre_all, post_all], ignore_index=True)
        merged = window_df_t.merge(
            ctrl_df[["date", "qty", "price", "promo"]],
            on="date",
            how="inner",
            suffixes=("_t", "_c"),
        ).sort_values("date").reset_index(drop=True)

        pre_m = merged[merged["date"] < target_date].copy()
        post_m = merged[merged["date"] >= target_date].copy()
        if len(pre_m) < 12 or len(post_m) < 5:
            raise ValueError(
                f"Overlapping dates between '{product_id}' and control '{control_product_id}' insufficient ({len(pre_m)} pre, {len(post_m)} post)."
            )

        # Control contamination diagnostic: did control price or promo shift substantially during post?
        ctrl_pre_p = float(pre_m["price_c"].mean())
        ctrl_post_p = float(post_m["price_c"].mean())
        ctrl_p_shift = abs(ctrl_post_p - ctrl_pre_p) / max(ctrl_pre_p, 1e-6)
        ctrl_promo_jump = abs(float(post_m["promo_c"].mean()) - float(pre_m["promo_c"].mean()))
        control_contaminated = (ctrl_p_shift >= 0.03) or (ctrl_promo_jump >= 0.25)
        if control_contaminated:
            warnings.append(
                f"control_contaminated: Control SKU '{control_product_id}' had {ctrl_p_shift*100:.1f}% price shift and {ctrl_promo_jump*100:.0f}% promo change in post window."
            )

        # Pre-treatment parallel trends test: y ~ 1 + treated + time_c + treated:time_c + is_weekend
        pre_panel_t = pd.DataFrame({
            "date": pre_m["date"],
            "y": pre_m["qty_t"],
            "treated": 1.0,
        })
        pre_panel_c = pd.DataFrame({
            "date": pre_m["date"],
            "y": pre_m["qty_c"],
            "treated": 0.0,
        })
        pre_panel = pd.concat([pre_panel_t, pre_panel_c], ignore_index=True)
        pre_dates_dt = pd.to_datetime(pre_panel["date"])
        pre_panel["t_idx"] = (pre_dates_dt - pd.to_datetime(target_date)).dt.days.astype(float)
        pre_panel["treat_x_t"] = pre_panel["treated"] * pre_panel["t_idx"]
        pre_panel["is_weekend"] = (pre_dates_dt.dt.dayofweek >= 5).astype(float)

        X_pt = sm.add_constant(pre_panel[["treated", "t_idx", "treat_x_t", "is_weekend"]], has_constant="add")
        try:
            fit_pt = sm.OLS(pre_panel["y"], X_pt).fit(cov_type="HAC", cov_kwds={"maxlags": 2})
            pt_p_val = float(fit_pt.pvalues.get("treat_x_t", 1.0))
        except Exception:
            fit_pt = sm.OLS(pre_panel["y"], X_pt).fit(cov_type="HC1")
            pt_p_val = float(fit_pt.pvalues.get("treat_x_t", 1.0))
        pt_passed = pt_p_val >= 0.05
        if not pt_passed:
            warnings.append(
                f"parallel_trends_violated: Pre-treatment trend divergence p={pt_p_val:.4f} < 0.05; DiD estimate may reflect pre-existing momentum differences."
            )

        # Full DiD panel regression
        full_t = pd.DataFrame({
            "date": merged["date"],
            "y": merged["qty_t"],
            "treated": 1.0,
            "is_post": (merged["date"] >= target_date).astype(float),
        })
        full_c = pd.DataFrame({
            "date": merged["date"],
            "y": merged["qty_c"],
            "treated": 0.0,
            "is_post": (merged["date"] >= target_date).astype(float),
        })
        panel = pd.concat([full_t, full_c], ignore_index=True)
        p_dates = pd.to_datetime(panel["date"])
        panel["did_att"] = panel["treated"] * panel["is_post"]
        panel["t_idx"] = (p_dates - pd.to_datetime(target_date)).dt.days.astype(float)
        panel["is_weekend"] = (p_dates.dt.dayofweek >= 5).astype(float)

        X_did = sm.add_constant(panel[["treated", "is_post", "did_att", "t_idx", "is_weekend"]], has_constant="add")
        try:
            fit_did = sm.OLS(panel["y"], X_did).fit(cov_type="HAC", cov_kwds={"maxlags": 3})
        except Exception:
            fit_did = sm.OLS(panel["y"], X_did).fit(cov_type="HC1")

        att = float(fit_did.params["did_att"])
        se_att = float(fit_did.bse["did_att"])
        p_val = float(fit_did.pvalues["did_att"])
        ci_low = att - 1.96 * se_att
        ci_high = att + 1.96 * se_att

        # Counterfactual trace for treated SKU = actual_t - did_att during post (and fitted values pre)
        treated_rows = X_did.iloc[: len(merged)].copy()
        cf_rows = treated_rows.copy()
        cf_rows["did_att"] = 0.0
        cf_pred = fit_did.predict(cf_rows).to_numpy(dtype=float)

        series_pts = [
            CausalSeriesPoint(
                date=str(merged["date"].iloc[i]),
                actual_qty=round(float(merged["qty_t"].iloc[i]), 2),
                counterfactual_qty=round(max(0.0, float(cf_pred[i])), 2),
                control_qty=round(float(merged["qty_c"].iloc[i]), 2),
                is_post=bool(merged["date"].iloc[i] >= target_date),
            )
            for i in range(len(merged))
        ]

        # Revenue & profit incremental calculations strictly over post window
        n_post = len(post_m)
        actual_post_qty = float(post_m["qty_t"].sum())
        cf_post_qty = float(np.sum(np.maximum(0.0, cf_pred[len(pre_m) :])))
        inc_rev = actual_post_qty * post_price_mean - cf_post_qty * pre_price_mean
        inc_prof = (
            actual_post_qty * (post_price_mean - post_cost_mean)
            - cf_post_qty * (pre_price_mean - pre_cost_mean)
        )

        assumptions = [
            "Parallel Trends: Without intervention, treated and control SKUs would follow parallel daily demand paths.",
            "No Spillover / SUTVA: Treated SKU price/promo change did not cannibalize or boost the chosen control SKU.",
            "No Simultaneous Shock: No unmeasured store-wide shock affected only one SKU on intervention date.",
        ]
        if pt_passed and not control_contaminated:
            confidence = "moderate_quasi_experimental"
        else:
            confidence = "low_violated_assumptions"

        return CausalAnalyzeResponse(
            method_used="did",
            treated_product_id=str(product_id),
            control_product_id=str(control_product_id),
            intervention_date=target_date,
            pre_days=int(len(pre_m)),
            post_days=int(len(post_m)),
            incremental_daily_qty=round(att, 3),
            incremental_qty_ci95_low=round(ci_low, 3),
            incremental_qty_ci95_high=round(ci_high, 3),
            p_value=round(p_val, 4),
            incremental_total_revenue_vnd=round(inc_rev),
            incremental_total_profit_vnd=round(inc_prof),
            parallel_trends_p_value=round(pt_p_val, 4),
            parallel_trends_passed=pt_passed,
            control_contaminated=control_contaminated,
            causal_confidence=confidence,
            identification_assumptions=assumptions,
            warnings=warnings,
            series=series_pts,
        )

    # ---------------- INTERRUPTED TIME SERIES (ITS) ----------------
    win = pd.concat([pre_all, post_all], ignore_index=True).sort_values("date").reset_index(drop=True)
    dt = pd.to_datetime(win["date"])
    t_idx = (dt - pd.to_datetime(target_date)).dt.days.astype(float).to_numpy()
    is_post = (win["date"] >= target_date).astype(float).to_numpy()
    time_post = t_idx * is_post
    is_weekend = (dt.dt.dayofweek >= 5).astype(float).to_numpy()

    X_its_df = pd.DataFrame({
        "const": 1.0,
        "t_idx": t_idx,
        "is_post": is_post,
        "time_post": time_post,
        "is_weekend": is_weekend,
    })
    y_its = win["qty"].to_numpy(dtype=float)

    try:
        fit_its = sm.OLS(y_its, X_its_df).fit(cov_type="HAC", cov_kwds={"maxlags": 3})
    except Exception:
        fit_its = sm.OLS(y_its, X_its_df).fit(cov_type="HC1")

    cf_df = X_its_df.copy()
    cf_df["is_post"] = 0.0
    cf_df["time_post"] = 0.0
    cf_pred = fit_its.predict(cf_df).to_numpy(dtype=float)

    post_mask = is_post == 1.0
    mean_t_post = float(np.mean(t_idx[post_mask]))

    # Linear contrast vector c for average treatment effect across post horizon
    c_vec = np.zeros(X_its_df.shape[1], dtype=float)
    col_names = list(X_its_df.columns)
    c_vec[col_names.index("is_post")] = 1.0
    c_vec[col_names.index("time_post")] = mean_t_post

    params_vec = fit_its.params.to_numpy(dtype=float)
    cov_mat = fit_its.cov_params().to_numpy(dtype=float)
    att_its = float(c_vec @ params_vec)
    var_its = max(float(c_vec @ cov_mat @ c_vec), 1e-12)
    se_its = math.sqrt(var_its)
    z_its = att_its / se_its
    p_val_its = float(2.0 * (1.0 - stats.norm.cdf(abs(z_its))))
    ci_lo_its = att_its - 1.96 * se_its
    ci_hi_its = att_its + 1.96 * se_its

    actual_post_qty = float(np.sum(y_its[post_mask]))
    cf_post_qty = float(np.sum(np.maximum(0.0, cf_pred[post_mask])))
    inc_rev_its = actual_post_qty * post_price_mean - cf_post_qty * pre_price_mean
    inc_prof_its = (
        actual_post_qty * (post_price_mean - post_cost_mean)
        - cf_post_qty * (pre_price_mean - pre_cost_mean)
    )

    warnings.append(
        "no_control_group: Interrupted Time Series compares post-period against extrapolated pre-trend without a control SKU; external holidays or seasonality shifts can confound the estimate."
    )
    assumptions = [
        "Continuity of Pre-Trend: Absent the intervention, pre-period linear trend & weekend effect would continue unchanged.",
        "No Concurrent Macro Shock: No holiday surge (Tết, 11.11) or external marketing shock coincided with intervention_date.",
    ]

    series_its = [
        CausalSeriesPoint(
            date=str(win["date"].iloc[i]),
            actual_qty=round(float(y_its[i]), 2),
            counterfactual_qty=round(max(0.0, float(cf_pred[i])), 2),
            control_qty=None,
            is_post=bool(post_mask[i]),
        )
        for i in range(len(win))
    ]

    return CausalAnalyzeResponse(
        method_used="its",
        treated_product_id=str(product_id),
        control_product_id=None,
        intervention_date=target_date,
        pre_days=int(len(pre_all)),
        post_days=int(len(post_all)),
        incremental_daily_qty=round(att_its, 3),
        incremental_qty_ci95_low=round(ci_lo_its, 3),
        incremental_qty_ci95_high=round(ci_hi_its, 3),
        p_value=round(p_val_its, 4),
        incremental_total_revenue_vnd=round(inc_rev_its),
        incremental_total_profit_vnd=round(inc_prof_its),
        parallel_trends_p_value=None,
        parallel_trends_passed=None,
        control_contaminated=False,
        causal_confidence="observational_its_only",
        identification_assumptions=assumptions,
        warnings=warnings,
        series=series_its,
    )

