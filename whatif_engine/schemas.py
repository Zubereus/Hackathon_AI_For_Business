"""Pydantic schemas and contracts for retail data and What-If simulation.

Provides data validation models for:
    1. Input retail transaction records (RetailSalesRecord).
    2. Batch dataset validation (RetailDataset).
    3. Simulation input parameters (SimulationInput).
    4. Quantitative simulation outcomes (SimulationOutput).

Strict Rule:
    Schemas strictly handle contract definition, data sanitization, and type validation.
    No financial math is performed within these models.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator


class RetailSalesRecord(BaseModel):
    """Data validation model for a single daily retail product sales record.

    Attributes:
        date: Observation date (YYYY-MM-DD).
        product_id: Unique product identifier or SKU.
        price: Unit selling price (must be strictly positive).
        cost: Unit purchase or production cost (must be non-negative).
        sales_volume: Units sold on this date (must be non-negative).
        promotion_flag: Binary indicator for active promotion (0 or 1).
    """

    date: str = Field(
        ...,
        description="Date of sales observation in ISO format (YYYY-MM-DD).",
        examples=["2024-01-15"],
    )
    product_id: str = Field(
        ...,
        min_length=1,
        description="Unique product identifier (e.g. 'PROD_01').",
        examples=["PROD_01"],
    )
    price: float = Field(
        ...,
        gt=0.0,
        description="Unit selling price in currency units (must be > 0).",
        examples=[120000.0],
    )
    cost: float = Field(
        ...,
        ge=0.0,
        description="Unit cost of goods sold in currency units (must be >= 0).",
        examples=[70000.0],
    )
    sales_volume: float = Field(
        ...,
        ge=0.0,
        description="Total quantity sold on this date (must be >= 0).",
        examples=[45.0],
    )
    promotion_flag: int = Field(
        ...,
        description="Promotion indicator: 1 if discount/promo active, else 0.",
        examples=[1],
    )

    @field_validator("product_id")
    @classmethod
    def validate_product_id(cls, v: str) -> str:
        """Strip whitespace and enforce uppercase product identifier."""
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("product_id cannot be empty or whitespace.")
        return cleaned

    @field_validator("promotion_flag")
    @classmethod
    def validate_promotion_flag(cls, v: int) -> int:
        """Ensure promotion flag is strictly binary (0 or 1)."""
        if v not in (0, 1):
            raise ValueError(f"promotion_flag must be 0 or 1, got {v}.")
        return v

    @field_validator("date")
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        """Validate date string parses as a valid ISO calendar date."""
        try:
            date.fromisoformat(v)
        except ValueError as err:
            raise ValueError(f"Invalid date format '{v}'. Expected YYYY-MM-DD.") from err
        return v


class RetailDataset(BaseModel):
    """Collection wrapper for batch validation of retail sales records."""

    records: List[RetailSalesRecord] = Field(
        ...,
        description="List of validated daily sales records.",
    )


class SimulationInput(BaseModel):
    """Model specifying input parameters for a forward What-If price change simulation.

    Attributes:
        product_id: Target product ID to simulate.
        price_change_pct: Proposed percentage price change (e.g., +10.0 for +10%).
        horizon_days: Forward projection window in days (default: 30 days).
        stock_limit: Optional maximum available inventory units.
        fixed_cost: Monthly fixed operating costs in currency units.
        random_seed: Seed for reproducible Monte Carlo draws.
    """

    product_id: str = Field(
        ...,
        min_length=1,
        description="Target product SKU to analyze.",
        examples=["PROD_01"],
    )
    price_change_pct: float = Field(
        default=0.0,
        ge=-80.0,
        le=200.0,
        description="Proposed price change in percent (e.g. 10.0 = +10%).",
        examples=[10.0],
    )
    horizon_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Forecast simulation horizon in days.",
        examples=[30],
    )
    stock_limit: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Physical stock constraint in units.",
        examples=[1500.0],
    )
    fixed_cost: float = Field(
        default=0.0,
        ge=0.0,
        description="Monthly fixed overhead cost in currency units.",
        examples=[5000000.0],
    )
    random_seed: int = Field(
        default=42,
        description="Random seed for deterministic simulations.",
        examples=[42],
    )


class ScenarioMetric(BaseModel):
    """Quantitative financial output for a single simulation scenario."""

    elasticity: Optional[float] = Field(
        default=None,
        description="Price elasticity value applied in this scenario.",
    )
    price: float = Field(..., description="Simulated unit price.")
    qty: float = Field(..., description="Simulated total sales volume.")
    revenue: float = Field(..., description="Simulated gross revenue.")
    profit: float = Field(..., description="Simulated net commercial profit.")
    spend: float = Field(..., description="Simulated total cost of goods sold + fixed cost.")


class SimulationOutput(BaseModel):
    """Structured container for full decision simulation results."""

    product_id: str
    product_name: str
    baseline: Dict[str, float]
    scenarios: Dict[str, ScenarioMetric]
    monte_carlo: Dict[str, float]
    breakeven_elasticity: Optional[float]
    warnings: List[str] = Field(default_factory=list)

