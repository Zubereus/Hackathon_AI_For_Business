"""Unit & API tests for honest quasi-experimental causal diagnostics (DiD & ITS)."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.causal.analyze import analyze_causal_impact
from app.main import app


def _build_did_panel(
    n_pre: int = 45,
    n_post: int = 21,
    true_att: float = 15.0,
    diverge_pre_trend: bool = False,
    contaminate_control: bool = False,
    seed: int = 99,
) -> tuple[pd.DataFrame, str]:
    rng = np.random.default_rng(seed)
    total = n_pre + n_post
    dates = pd.date_range("2025-02-01", periods=total, freq="D")
    split_date = dates[n_pre].strftime("%Y-%m-%d")
    is_post = (np.arange(total) >= n_pre).astype(float)
    wknd = (dates.dayofweek >= 5).astype(float)
    t = np.arange(total, dtype=float)

    common_trend = 0.1 * t + 4.0 * wknd
    y_ctrl = 40.0 + common_trend + rng.normal(0.0, 1.5, total)
    p_ctrl = np.full(total, 150000.0)
    if contaminate_control:
        p_ctrl = np.where(is_post == 1.0, 110000.0, 150000.0)
        y_ctrl = y_ctrl + 10.0 * is_post

    y_treat = 50.0 + common_trend + true_att * is_post + rng.normal(0.0, 1.5, total)
    if diverge_pre_trend:
        y_treat = y_treat + np.where(is_post == 0.0, 0.8 * t, 0.8 * n_pre)

    p_treat = np.where(is_post == 1.0, 180000.0, 200000.0)

    df_t = pd.DataFrame({
        "date": dates.strftime("%Y-%m-%d"),
        "product_id": "TREATED",
        "price": p_treat,
        "unit_cost": 90000.0,
        "quantity": np.maximum(0.0, y_treat),
        "stock": 500,
    })
    df_c = pd.DataFrame({
        "date": dates.strftime("%Y-%m-%d"),
        "product_id": "CONTROL",
        "price": p_ctrl,
        "unit_cost": 70000.0,
        "quantity": np.maximum(0.0, y_ctrl),
        "stock": 500,
    })
    return pd.concat([df_t, df_c], ignore_index=True), split_date


def test_did_recovers_att_when_assumptions_hold() -> None:
    df, split_date = _build_did_panel(true_att=15.0)
    res = analyze_causal_impact(
        df=df,
        product_id="TREATED",
        control_product_id="CONTROL",
        intervention_date=split_date,
        post_days=21,
        method="did",
    )
    assert res.method_used == "did"
    assert 12.0 <= res.incremental_daily_qty <= 18.0
    assert res.parallel_trends_passed is True
    assert res.control_contaminated is False
    assert res.causal_confidence == "moderate_quasi_experimental"


def test_did_flags_parallel_trends_violation_and_contamination() -> None:
    df_pt, split_date = _build_did_panel(diverge_pre_trend=True)
    res_pt = analyze_causal_impact(
        df=df_pt,
        product_id="TREATED",
        control_product_id="CONTROL",
        intervention_date=split_date,
        post_days=21,
        method="did",
    )
    assert res_pt.parallel_trends_passed is False
    assert res_pt.causal_confidence == "low_violated_assumptions"
    assert any("parallel_trends_violated" in w for w in res_pt.warnings)

    df_cont, _ = _build_did_panel(contaminate_control=True)
    res_cont = analyze_causal_impact(
        df=df_cont,
        product_id="TREATED",
        control_product_id="CONTROL",
        intervention_date=split_date,
        post_days=21,
        method="did",
    )
    assert res_cont.control_contaminated is True
    assert any("control_contaminated" in w for w in res_cont.warnings)


def test_its_single_sku_with_explicit_assumptions() -> None:
    df, split_date = _build_did_panel(true_att=18.0)
    res = analyze_causal_impact(
        df=df,
        product_id="TREATED",
        intervention_date=split_date,
        post_days=21,
        method="its",
    )
    assert res.method_used == "its"
    assert res.causal_confidence == "observational_its_only"
    assert 13.0 <= res.incremental_daily_qty <= 23.0
    assert len(res.identification_assumptions) >= 2


def test_causal_endpoint_live() -> None:
    client = TestClient(app)
    resp = client.post(
        "/causal/analyze",
        json={
            "dataset_id": "fashion_shop_12",
            "product_id": "P01",
            "control_product_id": "P02",
            "post_days": 14,
            "method": "auto",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["method_used"] == "did"
    assert len(body["series"]) > 0

