"""Unit & API tests for probabilistic calibration, regime detection & drift monitoring."""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.monitoring.evaluate import (
    compute_durbin_watson,
    compute_pinball_loss,
    compute_psi,
    compute_wis,
    detect_change_points_bic,
    evaluate_monitoring,
)


def _make_synthetic_daily_df(n_days: int = 100, tail_jump: bool = False, seed: int = 123) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2025-01-01", periods=n_days, freq="D")
    # Alternate prices across weeks for identifiable elasticity
    prices = np.array([100000.0 if (i // 7) % 2 == 0 else 120000.0 for i in range(n_days)])
    wknd = (dates.dayofweek >= 5).astype(float)
    promo = ((np.arange(n_days) % 14) == 0).astype(float)
    log_mu = 3.0 - 1.5 * np.log(prices / 100000.0) + 0.25 * wknd + 0.20 * promo
    if tail_jump:
        log_mu = np.where(np.arange(n_days) >= int(n_days * 0.65), log_mu + 0.85, log_mu)
    qty = rng.poisson(np.exp(log_mu))
    return pd.DataFrame({
        "date": dates.strftime("%Y-%m-%d"),
        "product_id": "SKU_TEST",
        "price": prices,
        "unit_cost": 55000.0,
        "quantity": qty,
        "stock": 500,
        "promo": promo,
    })


def test_pinball_wis_psi_dw_closed_form() -> None:
    y = np.array([10.0, 20.0])
    q10 = np.array([12.0, 18.0])  # diff = [-2, +2] -> pinball(0.1): [-0.9*-2=1.8, 0.1*2=0.2] -> mean = 1.0
    pb = compute_pinball_loss(y, q10, 0.10)
    assert abs(pb - 1.0) < 1e-9

    # Exact median point match & symmetric intervals: y=10 inside all intervals -> penalty terms 0
    # q25=8,q75=12 (width 4), q10=6,q90=14 (width 8), q05=4,q95=16 (width 12), q50=10
    # WIS = (0.5*0 + 0.25*4 + 0.10*8 + 0.05*12) / 3.5 = (1.0 + 0.8 + 0.6) / 3.5 = 2.4 / 3.5
    wis_val = compute_wis(
        np.array([10.0]),
        np.array([4.0]),
        np.array([6.0]),
        np.array([8.0]),
        np.array([10.0]),
        np.array([12.0]),
        np.array([14.0]),
        np.array([16.0]),
    )
    assert abs(wis_val - (2.4 / 3.5)) < 1e-9

    # Identical distributions give ~0 PSI
    arr = np.linspace(1.0, 100.0, 50)
    assert compute_psi(arr, arr) < 1e-6

    # Alternating +/- residuals produce Durbin-Watson near 4; positive autocorr near 0
    alt = np.array([1.0, -1.0, 1.0, -1.0, 1.0, -1.0])
    assert compute_durbin_watson(alt) > 3.2


def test_change_point_detection_recovers_step_shift() -> None:
    rng = np.random.default_rng(7)
    dates = [d.strftime("%Y-%m-%d") for d in pd.date_range("2025-01-01", periods=90, freq="D")]
    vals = np.concatenate([rng.normal(20.0, 2.0, 45), rng.normal(50.0, 2.0, 45)])
    cps, regimes, _ = detect_change_points_bic(vals, dates, min_seg_len=14)
    assert len(cps) >= 1
    assert any(abs(cp.index - 45) <= 3 for cp in cps)
    assert len(regimes) == len(cps) + 1


def test_evaluate_monitoring_calibration_and_drift() -> None:
    df_stable = _make_synthetic_daily_df(n_days=100, tail_jump=False)
    res = evaluate_monitoring(df_stable, "SKU_TEST", n_rolling_windows=3, seed=42)
    assert res.total_usable_days == 100
    assert 0.0 <= res.calibration.picp_80 <= 100.0
    assert res.calibration.mpiw_80 >= 0.0
    assert res.calibration.wis >= 0.0
    assert len(res.calibration.reliability_curve) == 5
    assert len(res.calibration.rolling_windows) == 3

    df_shifted = _make_synthetic_daily_df(n_days=100, tail_jump=True)
    res_shift = evaluate_monitoring(df_shifted, "SKU_TEST", n_rolling_windows=3, seed=42)
    assert len(res_shift.regimes.change_points) >= 1
    assert "demand_distribution_shift" in res_shift.drift.drift_flags
    assert res_shift.drift.drift_status in ("watch", "retrain_recommended")


def test_monitoring_endpoint_synthetic_catalog() -> None:
    client = TestClient(app)
    resp = client.post(
        "/monitoring/evaluate",
        json={"dataset_id": "fashion_shop_12", "product_id": "P01", "n_rolling_windows": 3, "seed": 42},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["product_id"] == "P01"
    assert "calibration" in body and "regimes" in body and "drift" in body

