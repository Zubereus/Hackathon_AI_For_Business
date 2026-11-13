// Package sim implements the deterministic Monte Carlo retail scenario simulation engine.
// It uses zero ML/LLM dependencies and operates strictly on the request payload.
package sim

// ProductSimulateInput defines product characteristics required for Monte Carlo simulation.
type ProductSimulateInput struct {
	CurrentPriceVND      int64     `json:"current_price_vnd"`
	UnitCostVND          int64     `json:"unit_cost_vnd"`
	BaselineQtyPerPeriod int64     `json:"baseline_qty_per_period"`
	StockAvailable       *int64    `json:"stock_available,omitempty"`
	FixedCostVND         *int64    `json:"fixed_cost_vnd,omitempty"`
	ElasticitySamples    []float64 `json:"elasticity_samples"`
	SigmaResid           *float64  `json:"sigma_resid,omitempty"`
}

// SchedulePhase defines one contiguous pricing segment over a multi-day horizon.
type SchedulePhase struct {
	Days                 int     `json:"days"`
	StartChangePct       float64 `json:"start_change_pct"`
	DailyStepPct         float64 `json:"daily_step_pct"`
	RelativeToPrev       bool    `json:"relative_to_prev,omitempty"`
	CompoundDailyStep    bool    `json:"compound_daily_step,omitempty"`
	StepOnFirstDay       bool    `json:"step_on_first_day,omitempty"`
	DemandMultiplier     float64 `json:"demand_multiplier,omitempty"`
	ElasticityMultiplier float64 `json:"elasticity_multiplier,omitempty"`
	Label                string  `json:"label,omitempty"`
}

// BusinessContext carries historical store/SKU context from ml-py or user overrides.
type BusinessContext struct {
	BaseMarginPct     *float64 `json:"base_margin_pct,omitempty"`
	Recent14dAvgQty   *float64 `json:"recent_14d_avg_qty,omitempty"`
	DailyMeanQty      *float64 `json:"daily_mean_qty,omitempty"`
	DailyStdQty       *float64 `json:"daily_std_qty,omitempty"`
	DemandTrendPct    *float64 `json:"demand_trend_pct,omitempty"`
	StockDaysCover    *float64 `json:"stock_days_cover,omitempty"`
	StockoutDaysPct   *float64 `json:"stockout_days_pct,omitempty"`
	PromoSharePct     *float64 `json:"promo_share_pct,omitempty"`
	CurrentStockUnits *int64   `json:"current_stock_units,omitempty"`
	Significant       *bool    `json:"significant,omitempty"`
	Warnings          []string `json:"warnings,omitempty"`
}

// DailySchedulePoint represents expected metrics for a single day in a multi-phase schedule.
type DailySchedulePoint struct {
	Day             int     `json:"day"`
	PriceVND        float64 `json:"price_vnd"`
	PriceChangePct  float64 `json:"price_change_pct"`
	ExpectedQty     float64 `json:"expected_qty"`
	ExpectedRevenue float64 `json:"expected_revenue"`
	ExpectedProfit  float64 `json:"expected_profit"`
}

// AdvisorySummary captures deterministic quantitative diagnostics for business advice.
type AdvisorySummary struct {
	VerdictCode            string   `json:"verdict_code"`
	BaseMarginPct          float64  `json:"base_margin_pct"`
	MinMarginPctInPlan     float64  `json:"min_margin_pct_in_plan"`
	ExpectedProfitDeltaVND float64  `json:"expected_profit_delta_vnd"`
	ExpectedProfitDeltaPct float64  `json:"expected_profit_delta_pct"`
	ProbBeatBase           float64  `json:"prob_beat_base"`
	P5BeatsBase            bool     `json:"p5_beats_base"`
	StockoutRisk           bool     `json:"stockout_risk"`
	StockUtilizationPct    *float64 `json:"stock_utilization_pct,omitempty"`
	ElasticityRegime       string   `json:"elasticity_regime"`
	RiskFlags              []string `json:"risk_flags"`
}

// SimulateRequest represents a POST /api/simulate payload.
type SimulateRequest struct {
	Product                ProductSimulateInput `json:"product"`
	PriceChangePct         float64              `json:"price_change_pct"`
	NSims                  int                  `json:"n_sims"`
	Seed                   int64                `json:"seed"`
	HorizonDays            int                  `json:"horizon_days,omitempty"`
	Schedule               []SchedulePhase      `json:"schedule,omitempty"`
	BaselinePeriodDays     int                  `json:"baseline_period_days,omitempty"`
	BusinessContext        *BusinessContext     `json:"business_context,omitempty"`
	PlannedRestockUnits    *int64               `json:"planned_restock_units,omitempty"`
	DecisionGoal           string               `json:"decision_goal,omitempty"` // "maximize_profit" | "clear_inventory"
	InventoryAgeDays       *int                 `json:"inventory_age_days,omitempty"`
	HoldingCostPctPerMonth *float64             `json:"holding_cost_pct_per_month,omitempty"`
}

// ClearanceMetrics quantifies cost recovery, working capital freed, and turnover speedups.
type ClearanceMetrics struct {
	DecisionGoal              string   `json:"decision_goal"`
	HorizonDays               int      `json:"horizon_days"`
	UnitRecoveryPct           float64  `json:"unit_recovery_pct"`
	RecoversUnitCost          bool     `json:"recovers_unit_cost"`
	RecoversTotalCost         bool     `json:"recovers_total_cost"`
	ExtraUnitsCleared         float64  `json:"extra_units_cleared"`
	TurnoverSpeedupPct        float64  `json:"turnover_speedup_pct"`
	TotalCostCapitalTurnedVND float64  `json:"total_cost_capital_turned_vnd"`
	ExtraCapitalFreedVND      float64  `json:"extra_capital_freed_vnd"`
	InventoryCapitalVND       *float64 `json:"inventory_capital_vnd,omitempty"`
	StockClearedPct           *float64 `json:"stock_cleared_pct,omitempty"`
	BaseDaysToClear           *float64 `json:"base_days_to_clear,omitempty"`
	PlanDaysToClear           *float64 `json:"plan_days_to_clear,omitempty"`
	DaysSavedToClear          *float64 `json:"days_saved_to_clear,omitempty"`
	InventoryAgeDays          *int     `json:"inventory_age_days,omitempty"`
	AgeTier                   string   `json:"age_tier,omitempty"`
	HoldingCostPctPerMonth    float64  `json:"holding_cost_pct_per_month"`
	HoldingCostSavedVND       float64  `json:"holding_cost_saved_vnd"`
	AdjustedProfitDeltaVND    float64  `json:"adjusted_profit_delta_vnd"`
}

// WaterfallStep represents one bar in the profit calculation waterfall breakdown.
type WaterfallStep struct {
	Key       string  `json:"key"`
	AmountVND float64 `json:"amount_vnd"`
	StartVND  float64 `json:"start_vnd"`
	EndVND    float64 `json:"end_vnd"`
	IsTotal   bool    `json:"is_total"`
}

// CashFlowSummary explicitly separates accounting profit from cash outlay needed for restocking.
type CashFlowSummary struct {
	RevenueVND           float64 `json:"revenue_vnd"`
	CogsVND              float64 `json:"cogs_vnd"`
	FixedMarketingVND    float64 `json:"fixed_marketing_vnd"`
	RestockUnits         float64 `json:"restock_units"`
	RestockCashNeededVND float64 `json:"restock_cash_needed_vnd"`
	NetCashFlowVND       float64 `json:"net_cash_flow_vnd"`
	NetProfitVND         float64 `json:"net_profit_vnd"`
}

// TornadoFactor represents one sensitivity lever in descending order of profit spread.
type TornadoFactor struct {
	Key        string  `json:"key"`
	LowProfit  float64 `json:"low_profit"`
	BaseProfit float64 `json:"base_profit"`
	HighProfit float64 `json:"high_profit"`
	SpreadVND  float64 `json:"spread_vnd"`
	LowLabel   string  `json:"low_label"`
	HighLabel  string  `json:"high_label"`
}

// ScenarioMetrics defines quantitative outcome values for a given scenario.
type ScenarioMetrics struct {
	PriceVND float64 `json:"price_vnd,omitempty"`
	Qty      float64 `json:"qty"`
	Revenue  float64 `json:"revenue"`
	Profit   float64 `json:"profit"`
	Spend    float64 `json:"spend"`
}

// HistogramBin defines one bucket of simulated profit distribution.
type HistogramBin struct {
	BinStart float64 `json:"bin_start"`
	BinEnd   float64 `json:"bin_end"`
	Count    int     `json:"count"`
}

// ProfitDistribution summarizes Monte Carlo profit quantiles and histogram buckets.
type ProfitDistribution struct {
	Histogram []HistogramBin `json:"histogram"`
	P5        float64        `json:"p5"`
	P50       float64        `json:"p50"`
	P95       float64        `json:"p95"`
}

// SimulateResponse represents the simulation output payload.
type SimulateResponse struct {
	Scenarios           map[string]ScenarioMetrics `json:"scenarios"`
	ProfitDistribution  ProfitDistribution         `json:"profit_distribution"`
	BreakEvenElasticity *float64                   `json:"break_even_elasticity,omitempty"`
	ProbBeatBase        float64                    `json:"prob_beat_base"`
	ScheduleTrace       []DailySchedulePoint       `json:"schedule_trace,omitempty"`
	Advisory            *AdvisorySummary           `json:"advisory,omitempty"`
	Clearance           *ClearanceMetrics          `json:"clearance,omitempty"`
	Waterfall           []WaterfallStep            `json:"waterfall,omitempty"`
	CashFlow            *CashFlowSummary           `json:"cash_flow,omitempty"`
	SensitivityTornado  []TornadoFactor            `json:"sensitivity_tornado,omitempty"`
}

// OptimizeConstraints defines constraints for reverse optimization search.
type OptimizeConstraints struct {
	MaxPriceChangePct float64  `json:"max_price_change_pct"`
	MinMarginPct      *float64 `json:"min_margin_pct,omitempty"`
	BudgetVND         *int64   `json:"budget_vnd,omitempty"`
	RespectStock      bool     `json:"respect_stock"`
}

// OptimizeRequest represents a POST /api/optimize payload.
type OptimizeRequest struct {
	Product               ProductSimulateInput `json:"product"`
	Objective             string               `json:"objective"` // "max_expected_profit" | "hit_target"
	TargetProfitUpliftPct *float64             `json:"target_profit_uplift_pct,omitempty"`
	Constraints           OptimizeConstraints  `json:"constraints"`
	NSims                 int                  `json:"n_sims"`
	Seed                  int64                `json:"seed"`
}

// RankedOption defines an evaluated candidate price point proposal.
type RankedOption struct {
	PriceVND       int64    `json:"price_vnd"`
	PriceChangePct float64  `json:"price_change_pct"`
	ExpectedProfit float64  `json:"expected_profit"`
	P5Profit       float64  `json:"p5_profit"`
	ProbHitTarget  float64  `json:"prob_hit_target"`
	Feasible       bool     `json:"feasible"`
	Violated       []string `json:"violated"`
}

// OptimizeResponse represents the reverse optimization ranking result.
type OptimizeResponse struct {
	Ranked []RankedOption `json:"ranked"`
}
