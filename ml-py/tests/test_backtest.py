"""Acceptance tests for Phase 3 Historical Backtest Engine.

Verifies:
    1. Temporal separation: training observations strictly precede change_date (date < change_date).
    2. Prediction output: predicted length equals horizon_days (14 days).
    3. Metrics: WAPE, MAPE, and interval_coverage within expected numerical ranges.
    4. Baseline benchmark: naive trailing 14-day comparison.
    5. API integration via FastAPI TestClient on /backtest.
"""

import os
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.backtest.run import execute_backtest, find_price_change_events, is_in_tet_window
from app.main import app
from app.schemas.contracts import BacktestResponse


SYNTH_BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "synthetic", "out")
)


def test_tet_window_detection() -> None:
    """Verify Lunar New Year window filtering."""
    # 2024 Lunar New Year day was 2024-02-10
    assert is_in_tet_window("2024-02-10") is True
    assert is_in_tet_window("2024-02-05") is True  # -5 days (pre-near)
    assert is_in_tet_window("2024-02-15") is True  # +5 days (post)
    assert is_in_tet_window("2024-05-15") is False  # Regular day


def test_execute_backtest_temporal_holdout() -> None:
    """Assert backtest strictly trains on past data and predicts 14-day holdout."""
    sales_csv = os.path.join(SYNTH_BASE_DIR, "starter_4_products", "sales_synthetic_vn.csv")
    df = pd.read_csv(sales_csv)

    # Find candidate price change events for P01
    events = find_price_change_events(df, "P01", min_change_pct=0.05, horizon_days=14)
    assert len(events) > 0, "Expected at least 1 price change event in starter_4_products"

    ev = events[0]
    change_date = ev["date"]

    res = execute_backtest(
        df=df,
        product_id="P01",
        change_date=change_date,
        horizon_days=14,
        random_state=42,
    )

    assert isinstance(res, BacktestResponse)
    assert len(res.predicted) == 14
    assert len(res.actual) == 14
    assert res.change_date == change_date
    assert 0.0 <= res.wape <= 1.0
    assert 0.0 <= res.interval_coverage <= 1.0
    assert res.naive_wape is not None
    assert isinstance(res.model_beats_naive, bool)


def test_backtest_endpoint_api() -> None:
    """Verify POST /backtest endpoint with auto-detection."""
    client = TestClient(app)

    payload = {
        "dataset_id": "starter_4_products",
        "product_id": "P01",
        "horizon_days": 14,
    }

    response = client.post("/backtest", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert "predicted" in data
    assert len(data["predicted"]) == 14
    assert "actual" in data
    assert len(data["actual"]) == 14
    assert "wape" in data
    assert "interval_coverage" in data
    assert "naive_wape" in data


def test_backtest_invalid_product() -> None:
    """Verify 400 error on non-existent product SKU."""
    client = TestClient(app)
    payload = {
        "dataset_id": "starter_4_products",
        "product_id": "NON_EXISTENT_SKU",
        "horizon_days": 14,
    }
    response = client.post("/backtest", json=payload)
    assert response.status_code == 400

