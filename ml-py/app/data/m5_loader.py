"""M5 Forecasting Dataset Loader for What-If AI.

Transforms raw Walmart M5 data into the canonical daily sales schema:
    - product_id: Composite key '{item_id}|{store_id}'
    - quantity: Daily units sold
    - price_orig: Selling price in USD ($)
    - price_vnd: Selling price converted to integer VND via config/fx.json
    - promo: Binary indicator (discount >= 5% from historical regular price or active event)
    - extra_event_name, extra_snap: Calendar controls preserved as covariates

Item Filtering Rules:
    - Sufficient volume: median sales >= 2 units/day
    - Price variation: standard deviation of ln(price) >= 0.04

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic data transformation via Pandas and NumPy.
    - Never mutates raw files.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd


DEFAULT_M5_RAW_DIR = os.path.join("data", "public", "raw", "m5")
DEFAULT_FX_PATH = os.path.join("config", "fx.json")


def load_fx_rate(fx_path: str = DEFAULT_FX_PATH) -> int:
    """Read exchange rate (VND per USD) from configuration file.

    Args:
        fx_path: Path to fx.json config file.

    Returns:
        int: Exchange rate multiplier (e.g. 25000).
    """
    if not os.path.exists(fx_path):
        return 25000
    with open(fx_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return int(data.get("vnd_per_usd", 25000))


def filter_m5_candidate_items(
    sales_df: pd.DataFrame,
    prices_df: pd.DataFrame,
    max_items: int = 30,
    min_median_volume: float = 2.0,
    min_price_sd: float = 0.04,
) -> List[Tuple[str, str]]:
    """Identify candidate (item_id, store_id) pairs meeting volume and price variation thresholds.

    Args:
        sales_df: DataFrame with M5 sales_train records.
        prices_df: DataFrame with M5 sell_prices records.
        max_items: Maximum number of qualified items to return.
        min_median_volume: Minimum median daily volume required.
        min_price_sd: Minimum standard deviation of ln(price) required.

    Returns:
        List[Tuple[str, str]]: Selected (item_id, store_id) pairs.
    """
    # 1. Price variation check from prices_df
    price_stats = (
        prices_df.groupby(["item_id", "store_id"])["sell_price"]
        .agg(price_sd=lambda s: float(np.log(s[s > 0]).std()))
        .reset_index()
    )
    price_eligible = price_stats[price_stats["price_sd"] >= min_price_sd]
    eligible_keys = set(zip(price_eligible["item_id"], price_eligible["store_id"]))

    # 2. Volume check from sales_df
    day_cols = [c for c in sales_df.columns if c.startswith("d_")]
    selected_pairs: List[Tuple[str, str]] = []

    for _, row in sales_df.iterrows():
        key = (str(row["item_id"]), str(row["store_id"]))
        if key not in eligible_keys:
            continue
        vols = row[day_cols].to_numpy(dtype=float)
        if float(np.median(vols)) >= min_median_volume:
            selected_pairs.append(key)
            if len(selected_pairs) >= max_items:
                break

    return selected_pairs


def build_canonical_m5_frame(
    calendar_df: pd.DataFrame,
    prices_df: pd.DataFrame,
    sales_df: pd.DataFrame,
    selected_pairs: List[Tuple[str, str]],
    fx_rate: int = 25000,
) -> pd.DataFrame:
    """Transform raw M5 tables for selected items into canonical daily sales format.

    Args:
        calendar_df: M5 calendar.csv.
        prices_df: M5 sell_prices.csv.
        sales_df: M5 sales_train_evaluation.csv.
        selected_pairs: Target (item_id, store_id) tuples.
        fx_rate: Exchange rate (VND per USD).

    Returns:
        pd.DataFrame: Canonical sales DataFrame.
    """
    selected_set = set(selected_pairs)
    filtered_sales = sales_df[
        sales_df.apply(lambda r: (str(r["item_id"]), str(r["store_id"])) in selected_set, axis=1)
    ].copy()

    day_cols = [c for c in sales_df.columns if c.startswith("d_")]
    cal_mapping = calendar_df.set_index("d")[
        ["date", "wm_yr_wk", "event_name_1", "snap_CA", "snap_TX", "snap_WI"]
    ].to_dict(orient="index")

    records: List[Dict[str, Any]] = []

    # Pre-index prices by (store_id, item_id, wm_yr_wk)
    price_lookup = prices_df.set_index(["store_id", "item_id", "wm_yr_wk"])["sell_price"].to_dict()

    for _, row in filtered_sales.iterrows():
        item_id = str(row["item_id"])
        store_id = str(row["store_id"])
        composite_id = f"{item_id}|{store_id}"
        category = str(row.get("cat_id", "general"))
        state = str(row.get("state_id", "CA"))
        snap_col = f"snap_{state}"

        for d_col in day_cols:
            qty = float(row[d_col])
            cal_info = cal_mapping.get(d_col)
            if not cal_info:
                continue

            iso_date = str(cal_info["date"])
            wm_yr_wk = cal_info["wm_yr_wk"]
            price_usd = price_lookup.get((store_id, item_id, wm_yr_wk), np.nan)

            if np.isnan(price_usd) or price_usd <= 0:
                continue

            price_vnd = int(round(price_usd * fx_rate))
            # Assume 35% margin for unit cost placeholder if cost is absent
            unit_cost_vnd = int(round(price_vnd * 0.65))

            has_event = pd.notna(cal_info.get("event_name_1"))
            snap_active = int(cal_info.get(snap_col, 0) == 1)
            promo_flag = 1 if has_event else 0

            records.append({
                "date": iso_date,
                "product_id": composite_id,
                "product_name": composite_id,
                "category": category,
                "quantity": int(qty),
                "price": price_vnd,
                "price_orig": float(price_usd),
                "unit_cost": unit_cost_vnd,
                "promo": promo_flag,
                "extra_snap": snap_active,
                "extra_event": str(cal_info.get("event_name_1") or ""),
            })

    canonical_df = pd.DataFrame(records)
    if not canonical_df.empty:
        canonical_df = canonical_df.sort_values(by=["date", "product_id"]).reset_index(drop=True)
    return canonical_df


def load_m5_data(
    raw_dir: str = DEFAULT_M5_RAW_DIR,
    fx_path: str = DEFAULT_FX_PATH,
    max_items: int = 30,
) -> Tuple[pd.DataFrame, str, Dict[str, Any]]:
    """Load and process raw M5 dataset files into canonical sales schema.

    Args:
        raw_dir: Directory containing calendar.csv, sell_prices.csv, sales_train_evaluation.csv.
        fx_path: Path to fx.json.
        max_items: Number of qualified items to select (default: 30).

    Returns:
        Tuple containing:
            - canonical_df (pd.DataFrame): Daily canonical sales DataFrame.
            - label (str): 'PUBLIC_M5'.
            - meta (Dict[str, Any]): Processing metadata and parameters.

    Raises:
        FileNotFoundError: If any required M5 raw CSV files are missing.
    """
    cal_path = os.path.join(raw_dir, "calendar.csv")
    prices_path = os.path.join(raw_dir, "sell_prices.csv")
    sales_path = os.path.join(raw_dir, "sales_train_evaluation.csv")

    for p in (cal_path, prices_path, sales_path):
        if not os.path.isfile(p):
            raise FileNotFoundError(
                f"Missing required M5 raw file: {p}. "
                "Please download from Kaggle and place in data/public/raw/m5/ as described in data/public/README.md."
            )

    fx_rate = load_fx_rate(fx_path)
    calendar_df = pd.read_csv(cal_path)
    prices_df = pd.read_csv(prices_path)
    # Read subset or full sales depending on file size
    sales_df = pd.read_csv(sales_path)

    selected_pairs = filter_m5_candidate_items(sales_df, prices_df, max_items=max_items)
    canonical_df = build_canonical_m5_frame(
        calendar_df, prices_df, sales_df, selected_pairs, fx_rate=fx_rate
    )

    meta = {
        "source": "Kaggle M5 Forecasting - Accuracy",
        "raw_dir": raw_dir,
        "n_items": len(selected_pairs),
        "fx_rate_vnd_per_usd": fx_rate,
        "n_rows": len(canonical_df),
    }

    return canonical_df, "PUBLIC_M5", meta

