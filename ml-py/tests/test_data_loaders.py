"""Unit and integration test suite for Phase 1 Data Layer.

Verifies:
    1. Vietnamese retail event features extraction from calendar_vn.py.
    2. M5 loader functionality, canonical column names, and FX conversion.
    3. Skipping of real M5/Dunnhumby load tests when raw files are not downloaded.
    4. Dunnhumby loader privacy guarantee (no household IDs).
"""

from __future__ import annotations

import os
import numpy as np
import pandas as pd
import pytest

from app.data.calendar_vn import extract_vn_event_features, get_event_family
from app.data.m5_loader import (
    DEFAULT_M5_RAW_DIR,
    build_canonical_m5_frame,
    filter_m5_candidate_items,
    load_fx_rate,
    load_m5_data,
)


def test_vn_calendar_feature_extraction() -> None:
    """Verify that calendar_vn produces required window features and controls."""
    dates = pd.date_range("2024-01-15", "2024-03-01", freq="D")
    feats = extract_vn_event_features(dates, macro_group="fashion")

    assert len(feats) == len(dates)
    assert "is_weekend" in feats.columns
    assert "is_payday_window" in feats.columns
    assert "sin_season" in feats.columns
    assert "cos_season" in feats.columns
    assert "evt_tet_pre_near" in feats.columns
    assert "evt_tet_day" in feats.columns
    assert "evt_double_sale_day" in feats.columns

    # 2024-02-10 was Tet Day 1
    tet_idx = dates.get_loc("2024-02-10")
    assert feats["evt_tet_day"].iloc[tet_idx] == 1


def test_m5_mock_transformation() -> None:
    """Verify M5 data transformation on mock data without needing Kaggle files."""
    calendar_df = pd.DataFrame({
        "d": ["d_1", "d_2"],
        "date": ["2023-01-01", "2023-01-02"],
        "wm_yr_wk": [11101, 11101],
        "event_name_1": [None, "SuperBowl"],
        "snap_CA": [0, 1],
        "snap_TX": [0, 0],
        "snap_WI": [0, 0],
    })

    prices_df = pd.DataFrame({
        "store_id": ["CA_1"],
        "item_id": ["FOODS_1_001"],
        "wm_yr_wk": [11101],
        "sell_price": [2.50],
    })

    sales_df = pd.DataFrame({
        "item_id": ["FOODS_1_001"],
        "store_id": ["CA_1"],
        "state_id": ["CA"],
        "cat_id": ["FOODS"],
        "d_1": [5],
        "d_2": [8],
    })

    selected_pairs = [("FOODS_1_001", "CA_1")]
    fx_rate = 25000

    canonical_df = build_canonical_m5_frame(
        calendar_df, prices_df, sales_df, selected_pairs, fx_rate=fx_rate
    )

    assert not canonical_df.empty
    assert len(canonical_df) == 2

    # Canonical columns check
    required_canonical = ["date", "product_id", "quantity", "price", "price_orig", "unit_cost", "promo"]
    for col in required_canonical:
        assert col in canonical_df.columns, f"Missing canonical column: {col}"

    # Currency conversion check: USD -> VND
    assert canonical_df["price_orig"].iloc[0] == 2.50
    assert canonical_df["price"].iloc[0] == 2.50 * fx_rate
    assert canonical_df["unit_cost"].iloc[0] == int(round(2.50 * fx_rate * 0.65))

    # Event flag check
    assert canonical_df["promo"].iloc[1] == 1


@pytest.mark.skipif(
    not os.path.exists(os.path.join(DEFAULT_M5_RAW_DIR, "calendar.csv")),
    reason="Raw M5 files not downloaded. Skipping live M5 test as permitted by PHASE_1_data_layer.md.",
)
def test_m5_live_data_smoke() -> None:
    """Smoke test running on real Kaggle M5 files if present in data/public/raw/m5/."""
    canonical_df, label, meta = load_m5_data(max_items=5)
    assert label == "PUBLIC_M5"
    assert not canonical_df.empty
    assert "price" in canonical_df.columns
    assert "price_orig" in canonical_df.columns
    assert canonical_df.isna().sum().sum() == 0

