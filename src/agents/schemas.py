"""Pydantic schemas and data contracts for What-If AI agents.

Defines strict type models for natural language parsing, decision specifications,
and structured commercial narrative reports.

Strict Rule:
    These models serve strictly as schema contracts and validation boundaries.
    No financial arithmetic is executed inside these schemas.
"""

from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class DecisionParseRequest(BaseModel):
    """Raw natural language request from a business manager."""

    query: str = Field(
        ...,
        min_length=3,
        description="Natural language question or command regarding a commercial decision.",
        examples=["Nếu tôi tăng giá sản phẩm áo thun P01 thêm 10% thì lợi nhuận tháng tới thế nào?"],
    )


class DecisionActionSpec(BaseModel):
    """Structured decision parameters parsed from natural language.

    Adheres to strict schema boundaries. Invalid or out-of-range parameters
    are rejected before passing to the quantitative calculation engine.
    """

    product_id: str = Field(
        ...,
        description="Target product SKU or ID, e.g., 'P01'.",
        examples=["P01"],
    )
    action_type: Literal["price_change", "reverse_target"] = Field(
        default="price_change",
        description="Type of decision action: forward price simulation or reverse target optimization.",
    )
    price_change_pct: float = Field(
        default=0.0,
        ge=-0.80,
        le=2.00,
        description="Proposed price change in percent (e.g., 10.0 for +10%, -15.0 for -15%).",
    )
    reverse_target_pct: Optional[float] = Field(
        default=None,
        ge=-0.50,
        le=5.00,
        description="Target profit growth in percent for reverse optimization (e.g. 15.0 for +15%).",
    )
    stock_limit: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Optional physical inventory limit in units.",
    )
    fixed_cost: float = Field(
        default=0.0,
        ge=0.0,
        description="Monthly fixed overhead cost in VND.",
    )
    horizon_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Projection horizon in days.",
    )

    @field_validator("product_id")
    @classmethod
    def validate_product_id(cls, v: str) -> str:
        """Strip whitespace and enforce non-empty identifier."""
        cleaned = v.strip().upper()
        if not cleaned:
            raise ValueError("Product identifier cannot be empty.")
        return cleaned


class ExecutiveNarrative(BaseModel):
    """Structured executive report generated from quantitative simulation outputs."""

    headline: str = Field(
        ...,
        description="High-level one-sentence summary of the decision outcome.",
    )
    key_findings: List[str] = Field(
        ...,
        description="Bulleted core findings: profit direction, expected baseline change, and bounds.",
    )
    risk_assessment: str = Field(
        ...,
        description="Evaluation of downside risk, break-even elasticity, and probability of success.",
    )
    recommendation: str = Field(
        ...,
        description="Actionable strategic recommendation for the business manager.",
    )
