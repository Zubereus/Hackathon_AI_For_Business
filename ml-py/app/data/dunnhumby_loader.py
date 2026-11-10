"""Dunnhumby The Complete Journey dataset loader for What-If AI.

Aggregates raw transaction logs to product-week level.
Strict Privacy Guard:
    Never persists or exposes household IDs (household_key is dropped during aggregation).
    Zero personal or proprietary consumer data displayed on screen or logged.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic grouping via Pandas.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from app.data.m5_loader import load_fx_rate


DEFAULT_DUNNHUMBY_DIR = os.path.join("data", "public", "raw", "dunnhumby")


def load_dunnhumby_data(
    raw_dir: str = DEFAULT_DUNNHUMBY_DIR,
    fx_path: str = os.path.join("config", "fx.json"),
    max_products: int = 50,
) -> Tuple[pd.DataFrame, str, Dict[str, Any]]:
    """Aggregate raw transaction tables into anonymous product-week canonical sales.

    Privacy Guarantee:
        household_key and transaction timestamps are completely omitted from output.
        Grain: (week_no, product_id).

    Args:
        raw_dir: Directory containing transaction_data.csv and product.csv.
        fx_path: Path to fx.json currency configuration.
        max_products: Top N products to include by sales volume.

    Returns:
        Tuple containing:
            - canonical_df (pd.DataFrame): Aggregated product-week sales records.
            - label (str): 'PUBLIC_DUNNHUMBY'.
            - meta (Dict[str, Any]): Processing metadata.

    Raises:
        FileNotFoundError: If required Dunnhumby raw files are missing.
    """
    tx_path = os.path.join(raw_dir, "transaction_data.csv")
    prod_path = os.path.join(raw_dir, "product.csv")

    if not os.path.isfile(tx_path):
        raise FileNotFoundError(
            f"Dunnhumby transaction data not found: {tx_path}. "
            "Please download from Dunnhumby source and place in data/public/raw/dunnhumby/."
        )

    fx_rate = load_fx_rate(fx_path)
    # Read transactions: omit household_key from load for privacy
    tx_df = pd.read_csv(tx_path, usecols=["PRODUCT_ID", "WEEK_NO", "QUANTITY", "SALES_VALUE", "RETAIL_DISC"])
    tx_df.columns = [c.lower() for c in tx_df.columns]

    # Select top products by volume
    top_pids = (
        tx_df.groupby("product_id")["quantity"]
        .sum()
        .sort_values(ascending=False)
        .head(max_products)
        .index
    )
    tx_filtered = tx_df[tx_df["product_id"].isin(top_pids)].copy()

    # Aggregate by product-week (Strictly drops all user-level details)
    agg = (
        tx_filtered.groupby(["week_no", "product_id"])
        .agg(
            quantity=("quantity", "sum"),
            sales_usd=("sales_value", "sum"),
            disc_usd=("retail_disc", "sum"),
        )
        .reset_index()
    )

    # Compute average unit price in USD and convert to integer VND
    agg["price_orig"] = np.where(agg["quantity"] > 0, agg["sales_usd"] / agg["quantity"], 0.0)
    agg["price"] = (agg["price_orig"] * fx_rate).round().astype(int)
    agg["unit_cost"] = (agg["price"] * 0.65).round().astype(int)
    agg["promo"] = (agg["disc_usd"] < -0.05).astype(int)  # Dunnhumby stores discounts as negative numbers
    agg["product_id"] = agg["product_id"].astype(str)
    # Synthesize ISO date representation from week_no (Week 1 = 2023-01-01)
    base_date = pd.Timestamp("2023-01-01")
    agg["date"] = agg["week_no"].apply(lambda w: (base_date + pd.Timedelta(weeks=int(w))).strftime("%Y-%m-%d"))

    canonical_cols = ["date", "product_id", "quantity", "price", "price_orig", "unit_cost", "promo"]
    canonical_df = agg[canonical_cols].sort_values(by=["date", "product_id"]).reset_index(drop=True)

    meta = {
        "source": "Dunnhumby The Complete Journey",
        "privacy": "Aggregated to product-week; all household_keys permanently stripped",
        "n_products": len(top_pids),
        "n_rows": len(canonical_df),
        "fx_rate_vnd_per_usd": fx_rate,
    }

    return canonical_df, "PUBLIC_DUNNHUMBY", meta

