"""Shared Pydantic v2 schemas and API contracts for What-If AI.

Single source of truth mirroring docs/ARCHITECTURE.md.
Used by the Python ML service and exported as JSON Schemas for Go and React.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


# ---------------- DATA LABELS ----------------
DataLabel = Literal["SYNTHETIC", "PUBLIC_M5", "PUBLIC_DUNNHUMBY", "USER"]


# ---------------- INGEST CONTRACTS ----------------
class ColumnProfile(BaseModel):
    name: str = Field(..., description="Column header name")
    dtype_guess: str = Field(..., description="Inferred data type (string, numeric, date)")
    null_pct: float = Field(..., ge=0.0, le=1.0, description="Percentage of missing values")
    n_unique: int = Field(..., ge=0, description="Distinct value count")
    samples: List[Any] = Field(..., description="At most 5 masked sample values")


class IngestProfileResponse(BaseModel):
    upload_id: str = Field(..., description="Temporary identifier for uploaded file")
    n_rows: int = Field(..., ge=0, description="Total row count")
    columns: List[ColumnProfile] = Field(..., description="Profiling per column")


class MappingAlternative(BaseModel):
    source: str = Field(..., description="Source column name")
    score: float = Field(..., ge=0.0, le=1.0, description="Match confidence score")


class ColumnMappingItem(BaseModel):
    canonical: str = Field(..., description="Canonical schema column name")
    source: Optional[str] = Field(None, description="Mapped source column name, or null")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Mapping confidence score")
    method: str = Field(..., description="Resolution method (exact, alias, semantic_embedding)")
    alternatives: List[MappingAlternative] = Field(default_factory=list)


class IngestMapRequest(BaseModel):
    upload_id: str = Field(..., description="Temporary upload identifier")


class IngestMapResponse(BaseModel):
    mapping: List[ColumnMappingItem] = Field(..., description="Proposed column mappings")
    missing_required: List[str] = Field(default_factory=list, description="Mandatory columns unmapped")
    warnings: List[str] = Field(default_factory=list, description="Sanity and quality warnings")


class IngestCommitOptions(BaseModel):
    price_unit: str = Field(default="VND", description="Currency unit of price columns")
    date_format: Optional[str] = Field(None, description="Explicit date parsing format")
    number_locale: Optional[str] = Field(None, description="Locale for number formatting (e.g. vi_VN, en_US)")
    margin_pct: Optional[float] = Field(None, description="Fallback gross margin assumption if unit_cost missing")


class IngestCommitRequest(BaseModel):
    upload_id: str = Field(..., description="Upload identifier to commit")
    mapping: Dict[str, str] = Field(..., description="User-confirmed canonical -> source column map")
    options: IngestCommitOptions = Field(default_factory=IngestCommitOptions)


class IngestCommitResponse(BaseModel):
    dataset_id: str = Field(..., description="Committed dataset identifier")
    label: DataLabel = Field(..., description="Dataset provenance label")
    quality_report: Dict[str, Any] = Field(default_factory=dict, description="Dataset quality summary")


# ---------------- ELASTICITY CONTRACTS ----------------
class ElasticityFitRequest(BaseModel):
    dataset_id: str = Field(..., description="Target dataset identifier")
    product_ids: Optional[List[str]] = Field(None, description="Optional subset of product IDs to fit")


class ElasticityResult(BaseModel):
    product_id: str = Field(..., description="Unique product SKU")
    product_name: str = Field(..., description="Human-readable product name")
    current_price_vnd: int = Field(..., description="Active catalog price in integer VND")
    unit_cost_vnd: int = Field(..., description="Unit cost in integer VND")
    baseline_qty_per_period: int = Field(..., description="Monthly baseline quantity")
    stock_available: Optional[int] = Field(None, description="Current stock available units")
    elasticity_median: float = Field(..., description="Point estimate / median elasticity")
    elasticity_se: float = Field(..., description="Standard error of elasticity")
    elasticity_samples: List[float] = Field(..., description="Bootstrap elasticity samples distribution")
    significant: bool = Field(default=True, description="Whether elasticity is statistically significant (p < 0.05)")
    price_variation_sd: float = Field(default=0.05, description="Standard deviation of ln(price)")
    warnings: List[str] = Field(default_factory=list, description="Quality warnings")


class ElasticityFitResponse(BaseModel):
    period_days: int = Field(default=30, description="Projection horizon in days")
    data_label: DataLabel = Field(default="SYNTHETIC", description="Provenance badge")
    products: List[ElasticityResult] = Field(..., description="List of product elasticity estimates")


class ElasticityFixtureProduct(BaseModel):
    """Schema matching the exact fields in contracts/fixtures/elasticity_fixture.json."""
    product_id: str
    product_name: str
    current_price_vnd: int
    unit_cost_vnd: int
    baseline_qty_per_period: int
    stock_available: Optional[int] = None
    elasticity_median: float
    elasticity_se: float
    elasticity_samples: List[float]


class ElasticityFixturePayload(BaseModel):
    """Schema matching the top-level elasticity_fixture.json."""
    period_days: int
    data_label: str
    products: List[ElasticityFixtureProduct]


# ---------------- BACKTEST CONTRACTS ----------------
class BacktestRequest(BaseModel):
    dataset_id: str = Field(..., description="Dataset identifier")
    product_id: str = Field(..., description="Product SKU to backtest")
    change_date: Optional[str] = Field(None, description="Historical price intervention date (YYYY-MM-DD); auto-detected if not provided")
    horizon_days: int = Field(default=14, ge=7, le=90, description="Evaluation window days")


class BacktestResponse(BaseModel):
    predicted: List[float] = Field(..., description="Daily predicted sales volumes")
    actual: List[float] = Field(..., description="Daily actual observed sales volumes")
    wape: float = Field(..., description="Weighted Absolute Percentage Error")
    mape: float = Field(..., description="Mean Absolute Percentage Error")
    interval_coverage: float = Field(..., description="Percentage of actuals within 80% prediction interval")
    naive_wape: Optional[float] = Field(None, description="Naive 14-day baseline WAPE")
    model_beats_naive: Optional[bool] = Field(None, description="Whether model WAPE <= naive WAPE")
    change_date: Optional[str] = Field(None, description="Price intervention date evaluated")
    price_change_pct: Optional[float] = Field(None, description="Observed percentage price change")


# ---------------- NLQ CONTRACTS ----------------
class CatalogItem(BaseModel):
    product_id: str
    name: str


class NLQParseRequest(BaseModel):
    question: str = Field(..., min_length=3, description="Natural language question from manager")
    catalog: List[CatalogItem] = Field(default_factory=list, description="Product catalog for disambiguation")


class DecisionSpec(BaseModel):
    product_id: str = Field(..., description="Resolved product SKU")
    change_type: Literal["price_pct"] = Field(default="price_pct", description="Type of decision action")
    change_value: float = Field(..., ge=-50.0, le=100.0, description="Percentage change (-50% to +100%)")
    horizon_days: int = Field(default=30, ge=7, le=90, description="Evaluation horizon")
    start_date: Optional[str] = Field(None, description="Optional start date ISO")


class NLQParseFallback(BaseModel):
    error: str
    fallback: Literal["manual_form"] = "manual_form"


class NLQExplainRequest(BaseModel):
    scenario_result: Dict[str, Any] = Field(..., description="Full quantitative simulation output")


class NLQExplainResponse(BaseModel):
    text: str = Field(..., description="Factual narrative summary restating only computed figures")


# ---------------- GO ENGINE CONTRACTS (Mirroring engine-go) ----------------
class ProductSimulateInput(BaseModel):
    current_price_vnd: int
    unit_cost_vnd: int
    baseline_qty_per_period: int
    stock_available: Optional[int] = None
    fixed_cost_vnd: Optional[int] = 0
    elasticity_samples: List[float]


class SimulateRequest(BaseModel):
    product: ProductSimulateInput
    price_change_pct: float
    n_sims: int = Field(default=10000)
    seed: int = Field(default=42)


class ScenarioMetrics(BaseModel):
    qty: float
    revenue: float
    profit: float
    spend: float


class SimulateResponse(BaseModel):
    scenarios: Dict[str, Any] = Field(..., description="base, optimistic, expected, pessimistic")
    profit_distribution: Dict[str, Any] = Field(..., description="histogram, p5, p50, p95")
    break_even_elasticity: Optional[float] = None


class OptimizeConstraints(BaseModel):
    max_price_change_pct: float = Field(default=30.0)
    min_margin_pct: Optional[float] = None
    budget_vnd: Optional[int] = None
    respect_stock: bool = Field(default=True)


class OptimizeRequest(BaseModel):
    product: ProductSimulateInput
    objective: Literal["max_expected_profit", "hit_target"] = "max_expected_profit"
    target_profit_uplift_pct: Optional[float] = None
    constraints: OptimizeConstraints = Field(default_factory=OptimizeConstraints)
    n_sims: int = Field(default=10000)
    seed: int = Field(default=42)


class RankedOption(BaseModel):
    price_vnd: int
    price_change_pct: float
    expected_profit: float
    p5_profit: float
    prob_hit_target: float
    feasible: bool
    violated: List[str] = Field(default_factory=list)


class OptimizeResponse(BaseModel):
    ranked: List[RankedOption]

