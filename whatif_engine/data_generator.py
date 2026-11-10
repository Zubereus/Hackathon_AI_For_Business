"""Synthetic Retail Data Generator for What-If AI.

Generates realistic daily sales data for retail products over a 365-day period.
Incorporates fundamental economic principles:
    1. Law of Demand: Downward-sloping demand curve (negative price elasticity).
    2. Seasonality: Annual harmonic cycle and weekend shopping lifts.
    3. Promotional Lift: Active promotion days drive discrete demand expansion.
    4. Price Dynamics: Stepped price interventions to provide genuine variation.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Uses pure NumPy and Pandas with deterministic seeds.
"""

from __future__ import annotations

import argparse
import os
from typing import Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd


def get_rng(random_state: Optional[Union[int, np.random.Generator]] = None) -> np.random.Generator:
    """Initialize a NumPy Generator instance for reproducible random numbers.

    Args:
        random_state: Integer seed, an existing np.random.Generator, or None.

    Returns:
        np.random.Generator: Seeded NumPy random generator.
    """
    if isinstance(random_state, np.random.Generator):
        return random_state
    return np.random.default_rng(random_state)


def generate_product_series(
    product_id: str,
    base_price: float,
    unit_cost: float,
    base_volume: float,
    true_elasticity: float,
    promo_lift: float,
    n_days: int = 365,
    start_date: str = "2024-01-01",
    random_state: Optional[Union[int, np.random.Generator]] = None,
) -> pd.DataFrame:
    """Generate 365 days of synthetic daily sales data for a single product.

    Economic Model:
        Expected_Volume = Base_Volume * (Price / Base_Price) ** Elasticity
                          * (1 + promo_lift * Promo_Flag)
                          * Weekend_Lift * Seasonality_Factor
        Observed_Volume ~ Poisson(Expected_Volume)

    Args:
        product_id: Unique product SKU (e.g. 'PROD_01').
        base_price: Standard catalog selling price in VND.
        unit_cost: Constant unit cost of goods sold in VND.
        base_volume: Expected daily sales volume at base_price under neutral conditions.
        true_elasticity: Latent price elasticity coefficient (must be negative).
        promo_lift: Proportional volume lift during promotion (e.g. 0.35 for +35%).
        n_days: Number of days to generate (default: 365).
        start_date: Starting ISO date string (YYYY-MM-DD).
        random_state: Seed or NumPy Generator for reproducible generation.

    Returns:
        pd.DataFrame: DataFrame containing daily records with required schema.

    Raises:
        ValueError: If true_elasticity is non-negative or base_price <= unit_cost.
    """
    if true_elasticity >= 0.0:
        raise ValueError(f"true_elasticity must be negative to obey the law of demand, got {true_elasticity}.")
    if base_price <= unit_cost:
        raise ValueError(f"base_price ({base_price}) must exceed unit_cost ({unit_cost}).")

    rng = get_rng(random_state)
    dates = pd.date_range(start_date, periods=n_days, freq="D")

    # 1. Price dynamics: Introduce realistic periodic discounts & price adjustments
    # Products rotate between standard, discounted (-10% to -20%), and premium (+5% to +10%)
    price_multipliers = np.ones(n_days, dtype=float)
    # Staggered price changes every 30-45 days
    change_points = np.arange(0, n_days, 35)
    for idx, cp in enumerate(change_points):
        end_idx = min(cp + 35, n_days)
        tier = idx % 4
        if tier == 0:
            price_multipliers[cp:end_idx] = 1.00  # Normal price
        elif tier == 1:
            price_multipliers[cp:end_idx] = 0.85  # Deep discount / Flash sale
        elif tier == 2:
            price_multipliers[cp:end_idx] = 0.92  # Moderate promo price
        else:
            price_multipliers[cp:end_idx] = 1.08  # Slight premium price

    prices = np.round(base_price * price_multipliers, -3)  # Round to nearest thousand VND

    # 2. Promotional calendar (~15% of days)
    # Promotions correlate with lower price multipliers
    promo_probs = np.where(price_multipliers < 1.0, 0.40, 0.05)
    promo_flags = (rng.uniform(size=n_days) < promo_probs).astype(int)

    # 3. Calendar & Seasonality factors
    day_of_year = dates.dt.dayofyear.to_numpy()
    # Annual cycle: peak around year-end / holiday season (months 11-12)
    annual_seasonality = 1.0 + 0.20 * np.sin(2.0 * np.pi * (day_of_year - 60) / 365.25)
    # Weekend shopping lift (Saturday and Sunday get a 25% lift)
    is_weekend = (dates.dt.dayofweek >= 5).astype(float)
    weekend_lift = 1.0 + 0.25 * is_weekend

    # 4. Economic Demand Formulation
    price_ratio = prices / base_price
    economic_demand = (
        base_volume
        * (price_ratio**true_elasticity)
        * (1.0 + promo_lift * promo_flags)
        * annual_seasonality
        * weekend_lift
    )

    # 5. Stochastic real-world observation noise (Poisson distribution)
    # Clamped to ensure non-negative integer volumes
    observed_volume = rng.poisson(lam=np.maximum(economic_demand, 1.0)).astype(float)

    return pd.DataFrame({
        "date": dates.strftime("%Y-%m-%d"),
        "product_id": product_id,
        "price": prices,
        "cost": np.full(n_days, unit_cost, dtype=float),
        "sales_volume": observed_volume,
        "promotion_flag": promo_flags,
    })


def generate_retail_data(
    n_days: int = 365,
    start_date: str = "2024-01-01",
    random_state: Optional[Union[int, np.random.Generator]] = 42,
) -> pd.DataFrame:
    """Generate a combined multi-product retail sales dataset.

    Simulates 3 distinct retail products representing different retail sectors:
        - PROD_01 (Essential Fast-Moving Consumer Goods):
            Low price (50k VND), high volume (120 units/day), inelastic demand (e = -0.70).
        - PROD_02 (Apparel / Fashion):
            Moderate price (180k VND), moderate volume (45 units/day), elastic demand (e = -1.25).
        - PROD_03 (Consumer Electronics / Discretionary):
            High price (850k VND), lower volume (15 units/day), highly elastic demand (e = -1.80).

    Args:
        n_days: Number of calendar days to simulate (default: 365).
        start_date: Starting ISO date string (default: '2024-01-01').
        random_state: Seed or generator for deterministic output.

    Returns:
        pd.DataFrame: Concatenated DataFrame of shape (3 * n_days, 6) sorted by date.
    """
    rng = get_rng(random_state)

    product_configs: List[Dict[str, Any]] = [
        {
            "product_id": "PROD_01",
            "base_price": 50_000.0,
            "unit_cost": 30_000.0,
            "base_volume": 120.0,
            "true_elasticity": -0.70,
            "promo_lift": 0.25,
        },
        {
            "product_id": "PROD_02",
            "base_price": 180_000.0,
            "unit_cost": 95_000.0,
            "base_volume": 45.0,
            "true_elasticity": -1.25,
            "promo_lift": 0.40,
        },
        {
            "product_id": "PROD_03",
            "base_price": 850_000.0,
            "unit_cost": 480_000.0,
            "base_volume": 15.0,
            "true_elasticity": -1.80,
            "promo_lift": 0.55,
        },
    ]

    dfs: List[pd.DataFrame] = []
    for cfg in product_configs:
        prod_seed = rng.integers(0, 1_000_000)
        df_prod = generate_product_series(
            product_id=cfg["product_id"],
            base_price=cfg["base_price"],
            unit_cost=cfg["unit_cost"],
            base_volume=cfg["base_volume"],
            true_elasticity=cfg["true_elasticity"],
            promo_lift=cfg["promo_lift"],
            n_days=n_days,
            start_date=start_date,
            random_state=prod_seed,
        )
        dfs.append(df_prod)

    full_df = pd.concat(dfs, ignore_index=True)
    # Sort chronologically by date and product_id
    full_df = full_df.sort_values(by=["date", "product_id"]).reset_index(drop=True)
    return full_df


def save_retail_data(df: pd.DataFrame, output_path: str) -> str:
    """Save generated retail DataFrame to CSV format.

    Args:
        df: DataFrame to save.
        output_path: Target file path on disk.

    Returns:
        str: Absolute path of saved file.
    """
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    df.to_csv(output_path, index=False)
    return os.path.abspath(output_path)


def main() -> None:
    """Command-line entrypoint for synthetic data generation."""
    parser = argparse.ArgumentParser(
        description="Generate synthetic retail sales dataset with realistic demand dynamics"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/retail_sales_synthetic.csv",
        help="Destination path for generated CSV file",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=365,
        help="Number of days to simulate (default: 365)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic generation",
    )
    args = parser.parse_args()

    print(f"Generating retail sales dataset for {args.days} days (seed: {args.seed})...")
    df = generate_retail_data(n_days=args.days, random_state=args.seed)
    saved_path = save_retail_data(df, args.output)

    print(f"Dataset successfully created:")
    print(f"  Location: {saved_path}")
    print(f"  Total records: {len(df):,} rows")
    print(f"  Columns: {list(df.columns)}")
    print(f"  Products: {df['product_id'].unique().tolist()}")
    print("\nSample records:")
    print(df.head(6).to_string(index=False))


if __name__ == "__main__":
    main()

