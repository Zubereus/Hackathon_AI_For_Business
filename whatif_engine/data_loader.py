"""Data ingestion and preprocessing pipeline for What-If AI.

Handles:
    1. Ingestion of raw business sales CSV files.
    2. Column alias normalization (e.g. price_vnd -> price, quantity_sold -> sales_volume).
    3. Schema validation via Pydantic (RetailSalesRecord).
    4. Data quality diagnostics (missing values, negative values, price variation checks).

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Pure Pandas and NumPy data sanitization.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

from whatif_engine.schemas import RetailSalesRecord


# Standard column mapping dictionary to support multiple dataset conventions
COLUMN_ALIASES: Dict[str, str] = {
    "price_vnd": "price",
    "unit_price": "price",
    "unit_cost_vnd": "cost",
    "unit_cost": "cost",
    "cogs": "cost",
    "quantity_sold": "sales_volume",
    "qty": "sales_volume",
    "volume": "sales_volume",
    "quantity": "sales_volume",
    "promo_flag": "promotion_flag",
    "is_promo": "promotion_flag",
    "discount_flag": "promotion_flag",
}


def normalize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize inconsistent CSV column headers into standardized schema names.

    Maps:
        - 'price_vnd', 'unit_price' -> 'price'
        - 'unit_cost_vnd', 'unit_cost', 'cogs' -> 'cost'
        - 'quantity_sold', 'qty', 'volume' -> 'sales_volume'
        - 'promo_flag', 'is_promo' -> 'promotion_flag'

    Args:
        df: Input raw DataFrame.

    Returns:
        pd.DataFrame: DataFrame with standardized column names.
    """
    df_renamed = df.copy()
    rename_dict: Dict[str, str] = {}
    for col in df_renamed.columns:
        col_lower = str(col).strip().lower()
        if col_lower in COLUMN_ALIASES:
            rename_dict[col] = COLUMN_ALIASES[col_lower]

    return df_renamed.rename(columns=rename_dict)


def load_and_preprocess_sales(
    file_path: str,
    product_id: Optional[str] = None,
    validate_schema: bool = True,
) -> Tuple[pd.DataFrame, List[str]]:
    """Load sales data from CSV, normalize columns, validate, and extract diagnostics.

    Args:
        file_path: Path to CSV sales file.
        product_id: Optional filter for a specific product ID.
        validate_schema: If True, validates rows against RetailSalesRecord Pydantic model.

    Returns:
        Tuple containing:
            - pd.DataFrame: Normalized and cleaned DataFrame.
            - List[str]: Data health warnings and diagnostics.

    Raises:
        FileNotFoundError: If file_path does not exist.
        ValueError: If required columns cannot be mapped or data is corrupted.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Sales data file not found: {file_path}")

    raw_df = pd.read_csv(file_path)
    df = normalize_column_names(raw_df)

    # Required standardized columns
    required_cols = {"date", "product_id", "price", "cost", "sales_volume", "promotion_flag"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(
            f"Unable to resolve required columns from CSV. Missing: {missing}. "
            f"Available columns: {list(raw_df.columns)}"
        )

    # Filter by product if specified
    if product_id is not None:
        target_pid = product_id.strip().upper()
        df = df[df["product_id"].astype(str).str.upper() == target_pid].copy()
        if df.empty:
            raise ValueError(f"No records found for product_id '{product_id}' in {file_path}")

    # Remove nulls in key columns
    initial_len = len(df)
    df = df.dropna(subset=["date", "product_id", "price", "cost", "sales_volume"]).copy()
    dropped_nulls = initial_len - len(df)

    warnings: List[str] = []
    if dropped_nulls > 0:
        warnings.append(f"Dropped {dropped_nulls} records containing null values.")

    # Convert types
    df["price"] = df["price"].astype(float)
    df["cost"] = df["cost"].astype(float)
    df["sales_volume"] = df["sales_volume"].astype(float)
    df["promotion_flag"] = df["promotion_flag"].fillna(0).astype(int)

    # Sanity checks
    if np.any(df["price"] <= 0.0):
        warnings.append("Found records with price <= 0; filtered out invalid prices.")
        df = df[df["price"] > 0.0]

    if np.any(df["sales_volume"] < 0.0):
        warnings.append("Found negative sales_volume; clamped to 0.")
        df["sales_volume"] = np.maximum(df["sales_volume"], 0.0)

    # Optional Pydantic row validation
    if validate_schema and not df.empty:
        # Sample first 100 rows for high performance
        sample_rows = df.head(100).to_dict(orient="records")
        for row in sample_rows:
            RetailSalesRecord(**row)

    # Check price variation
    if not df.empty:
        price_sd = float(np.log(df["price"]).std())
        if price_sd < 0.03:
            warnings.append(
                f"Độ biến động giá rất thấp (std(ln(P)) = {price_sd:.3f} < 0.03). "
                "Cần thận trọng khi ước lượng độ co giãn."
            )

    return df.reset_index(drop=True), warnings

