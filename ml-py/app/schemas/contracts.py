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


class BusinessContext(BaseModel):
    """Snapshot of a product's current business situation computed strictly from historical data."""

    base_margin_pct: Optional[float] = Field(None, description="Current gross margin % = (P0 - C) / P0 * 100")
    recent_14d_avg_qty: Optional[float] = Field(None, description="Mean daily units sold in recent 14 days")
    demand_trend_pct: Optional[float] = Field(None, description="% change in recent 14d volume vs prior 14d")
    stock_days_cover: Optional[float] = Field(None, description="Estimated days of stock at baseline demand rate")
    stockout_days_pct: Optional[float] = Field(None, description="Share of historical days with stock == 0")
    promo_share_pct: Optional[float] = Field(None, description="Share of historical days under promotion")
    current_stock_units: Optional[int] = Field(None, description="Latest stock count on hand for capital analytics")
    significant: Optional[bool] = Field(None, description="Whether elasticity is statistically significant")
    warnings: List[str] = Field(default_factory=list, description="Quality & reliability warnings")


class CostBreakdown(BaseModel):
    """Itemized external operating costs per simulation period (integer VND)."""

    marketing_vnd: int = Field(default=0, description="Marketing & ads spend per period in VND")
    labor_vnd: int = Field(default=0, description="Staff & packing labor cost per period in VND")
    operating_vnd: int = Field(default=0, description="Rent, platform & packaging overhead per period in VND")
    other_fixed_vnd: int = Field(default=0, description="Other fixed overhead per period in VND")


class ElasticityResult(BaseModel):
    product_id: str = Field(..., description="Unique product SKU")
    product_name: str = Field(..., description="Human-readable product name")
    current_price_vnd: int = Field(..., description="Active catalog price in integer VND")
    unit_cost_vnd: int = Field(..., description="Unit cost in integer VND")
    baseline_qty_per_period: int = Field(..., description="Monthly baseline quantity")
    stock_available: Optional[int] = Field(None, description="Current stock available units")
    fixed_cost_vnd: int = Field(
        default=0,
        description="Baseline external operating & fixed costs per period in integer VND",
    )
    cost_breakdown: Optional[CostBreakdown] = Field(
        None,
        description="Itemized external operating costs (marketing, labor, overhead) from data",
    )
    elasticity_median: float = Field(..., description="Point estimate / median elasticity")
    elasticity_se: float = Field(..., description="Standard error of elasticity")
    elasticity_samples: List[float] = Field(..., description="Bootstrap elasticity samples distribution")
    significant: bool = Field(default=True, description="Whether elasticity is statistically significant (p < 0.05)")
    price_variation_sd: float = Field(default=0.05, description="Standard deviation of ln(price)")
    warnings: List[str] = Field(default_factory=list, description="Quality warnings")
    business_context: Optional[BusinessContext] = Field(None, description="Current business context diagnostics")


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
    active_product_id: Optional[str] = Field(None, description="Currently selected SKU ID in UI when user writes generic terms like 'sản phẩm'")


class SchedulePhase(BaseModel):
    """One contiguous phase in a multi-step daily price schedule."""

    days: int = Field(..., ge=1, le=90, description="Duration of this phase in days")
    start_change_pct: float = Field(default=0.0, ge=-50.0, le=100.0, description="Initial % change at start of phase")
    daily_step_pct: float = Field(default=0.0, ge=-20.0, le=20.0, description="Daily incremental % change within phase")
    relative_to_prev: bool = Field(default=False, description="True => anchored to prior phase final price factor")
    compound_daily_step: bool = Field(default=False, description="True => compound daily factor by (1 + daily_step_pct/100)")
    step_on_first_day: bool = Field(default=False, description="True => apply 1st daily step immediately on day 1 of phase")
    demand_multiplier: float = Field(default=1.0, ge=0.1, le=20.0, description="Seasonal/event demand multiplier vs normal day")
    elasticity_multiplier: float = Field(default=1.0, ge=0.1, le=5.0, description="Seasonal/event buyer sensitivity multiplier")
    label: Optional[str] = Field(None, description="Human-readable label for this phase")


class DecisionSpec(BaseModel):
    product_id: str = Field(..., description="Resolved product SKU")
    change_type: Literal["price_pct", "price_schedule"] = Field(default="price_pct", description="Type of decision action")
    change_value: float = Field(..., ge=-50.0, le=100.0, description="Percentage change (-50% to +100%)")
    horizon_days: int = Field(default=30, ge=7, le=90, description="Evaluation horizon")
    start_date: Optional[str] = Field(None, description="Optional start date ISO")
    schedule: Optional[List[SchedulePhase]] = Field(None, description="Optional multi-phase daily pricing schedule")
    detected_language: Optional[Literal["en", "vi"]] = Field(None, description="Detected language of user question")
    question_type: Literal["yes_no_feasibility", "what_if_scenario", "schedule_plan", "reverse_goal"] = Field(
        default="what_if_scenario", description="Detected user question intent"
    )
    baseline_period_days: Optional[int] = Field(None, description="Period denominator for baseline daily rate (e.g. 30)")
    event_context: Optional[Dict[str, Any]] = Field(None, description="Detected retail event/seasonality context")
    target_uplift_pct: Optional[float] = Field(None, description="Optional profit uplift goal % for reverse_goal queries")
    decision_goal: Optional[Literal["maximize_profit", "clear_inventory"]] = Field(
        None,
        description="Underlying business goal: maximize net profit vs clear slow stock & unlock capital",
    )
    inventory_age_days: Optional[int] = Field(
        None,
        ge=0,
        le=1095,
        description="Optional age in days that inventory has already sat in the warehouse",
    )
    assumptions_summary: Optional[str] = Field(None, description="Plain-language explanation of agent assumptions")


class SuggestedScenarioPreset(BaseModel):
    """Clickable scenario preset suggested by Decision Coach for multi-option trade-offs."""

    id: str
    label: str
    price_change_pct: float = 0.0
    unit_cost_change_pct: float = 0.0
    extra_fixed_cost_vnd: int = 0
    restock_units: Optional[int] = None
    horizon_days: int = 30
    decision_goal: Optional[Literal["maximize_profit", "clear_inventory"]] = None
    inventory_age_days: Optional[int] = None
    note: Optional[str] = None


class NLQParseFallback(BaseModel):
    error: str
    fallback: Literal["manual_form"] = "manual_form"
    guidance_type: Optional[
        Literal[
            "non_price_scope",
            "glossary",
            "store_health",
            "ambiguous_advice",
            "multi_option_capital",
            "validation_error",
        ]
    ] = None
    helpful_answer: Optional[str] = None
    suggested_scenarios: List[SuggestedScenarioPreset] = Field(default_factory=list)


class NLQExplainRequest(BaseModel):
    scenario_result: Dict[str, Any] = Field(..., description="Full quantitative simulation output")
    business_context: Optional[Dict[str, Any]] = Field(None, description="Current business context snapshot for tailored advice")
    language: Optional[Literal["en", "vi"]] = Field(None, description="Preferred explanation language")
    question: Optional[str] = Field(None, description="Original question text for language & intent alignment")
    decision_spec: Optional[Dict[str, Any]] = Field(None, description="Parsed decision intent & event context")
    optimize_summary: Optional[Dict[str, Any]] = Field(None, description="Optional best candidate from Go reverse optimizer")


class NLQExplainResponse(BaseModel):
    text: str = Field(..., description="Factual narrative & actionable advice using only computed figures")
    direct_answer: Optional[str] = Field(None, description="Direct Yes/No or feasibility answer to the user's question")
    action_verdict: Optional[str] = Field(None, description="Concise go / caution / avoid recommendation headline")
    verdict_level: Optional[Literal["go", "caution", "stop"]] = Field(None, description="Visual severity classification")
    situation_summary: Optional[str] = Field(None, description="Diagnosis of current business state (margin, stock, elasticity)")
    recommendations: List[str] = Field(default_factory=list, description="Concrete actionable steps grounded in engine outputs")


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
    schedule: Optional[List[SchedulePhase]] = None
    business_context: Optional[BusinessContext] = None


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

