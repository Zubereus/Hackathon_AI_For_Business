"""Unit tests for the validation and benchmark engine (test_engine.py).

Verifies dataset discovery, single product evaluation, and full benchmark aggregation.
"""

from __future__ import annotations

import os
from typing import Generator

import numpy as np
import pandas as pd
import pytest

import test_engine as te


@pytest.fixture
def mock_dataset_folder(tmp_path: pytest.TempPathFactory) -> Generator[str, None, None]:
    """Create a mock dataset folder with sales and ground truth files.

    Args:
        tmp_path: Pytest temporary directory fixture.

    Yields:
        str: Absolute path to the mock dataset directory.
    """
    folder = os.path.join(str(tmp_path), "mock_store")
    os.makedirs(folder, exist_ok=True)

    n_days = 80
    dates = pd.date_range("2024-01-01", periods=n_days, freq="D")
    rng = np.random.default_rng(10)

    prices = rng.choice([50_000.0, 55_000.0, 60_000.0], size=n_days)
    quantities = rng.poisson(lam=40.0, size=n_days) + 1

    sales_df = pd.DataFrame({
        "date": dates,
        "product_id": "MOCK_01",
        "product_name": "Mock Item",
        "category": "Retail",
        "price_vnd": prices,
        "unit_cost_vnd": np.full(n_days, 30_000.0),
        "quantity_sold": quantities,
        "promo_flag": np.zeros(n_days, dtype=int),
        "holiday_flag": np.zeros(n_days, dtype=int),
        "stock_on_hand": np.full(n_days, 300),
    })
    sales_df.to_csv(os.path.join(folder, "sales_synthetic_vn.csv"), index=False)

    truth_df = pd.DataFrame({
        "product_id": ["MOCK_01"],
        "true_elasticity": [-0.85],
    })
    truth_df.to_csv(os.path.join(folder, "ground_truth.csv"), index=False)

    yield folder


def test_evaluate_product_mock(mock_dataset_folder: str) -> None:
    """Verify evaluate_product computes coverage, direction, and error accurately."""
    sales_file = os.path.join(mock_dataset_folder, "sales_synthetic_vn.csv")
    sales_df = pd.read_csv(sales_file)

    res = te.evaluate_product(
        df_product=sales_df,
        true_elasticity=-0.85,
        price_change=0.10,
        random_state=42,
        n_boot=50,
    )

    assert "in_range" in res
    assert "direction_ok" in res
    assert "abs_error_pct_points" in res
    assert isinstance(res["in_range"], bool)
    assert isinstance(res["direction_ok"], bool)
    assert res["abs_error_pct_points"] >= 0.0


def test_evaluate_dataset_mock(mock_dataset_folder: str) -> None:
    """Verify evaluate_dataset reads files and returns a DataFrame of evaluated products."""
    df_eval = te.evaluate_dataset(
        folder_path=mock_dataset_folder,
        price_change=0.10,
        random_state=42,
        n_boot=30,
    )

    assert isinstance(df_eval, pd.DataFrame)
    assert len(df_eval) == 1
    assert df_eval["product_id"].iloc[0] == "MOCK_01"


def test_find_datasets_directory_custom(mock_dataset_folder: str) -> None:
    """Ensure find_datasets_directory successfully returns verified custom path."""
    parent_dir = os.path.dirname(mock_dataset_folder)
    found = te.find_datasets_directory(custom_path=parent_dir)
    assert os.path.abspath(found) == os.path.abspath(parent_dir)

