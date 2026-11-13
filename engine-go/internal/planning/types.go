// Package planning implements deterministic business decision intelligence modules in Go:
//   - Inventory Replenishment Optimizer (EOQ, safety stock, reorder point, lead-time risk, multi-SKU budget)
//   - Working Capital & Cash Runway Monte Carlo Simulator (DIO, DSO, DPO, CCC, cash trajectory)
//   - Multi-SKU Portfolio Optimizer (Multiple-Choice Knapsack over pricing & restock actions)
//   - Value of Information Analyzer (EVPI, EVSI, ENGS for experiment gating)
package planning

import "github.com/whatif-ai/engine-go/internal/sim"

// AssumptionsTrace makes data provenance explicit on every planning output.
type AssumptionsTrace struct {
	HistoricalInputsUsed []string `json:"historical_inputs_used"`
	ModelEstimatesUsed   []string `json:"model_estimates_used"`
	UserAssumptions      []string `json:"user_assumptions"`
}

// ---------------- 1. INVENTORY REPLENISHMENT ----------------

// ReplenishSKUInput captures historical demand rates and operational assumptions for one SKU.
type ReplenishSKUInput struct {
	ProductID              string   `json:"product_id"`
	ProductName            string   `json:"product_name"`
	CurrentPriceVND        int64    `json:"current_price_vnd"`
	UnitCostVND            int64    `json:"unit_cost_vnd"`
	BaselineQtyPerPeriod   int64    `json:"baseline_qty_per_period"`
	BaselinePeriodDays     int      `json:"baseline_period_days,omitempty"`
	DailyMeanQty           *float64 `json:"daily_mean_qty,omitempty"`
	DailyStdQty            *float64 `json:"daily_std_qty,omitempty"`
	StockAvailable         int64    `json:"stock_available"`
	LeadTimeDays           float64  `json:"lead_time_days"`
	LeadTimeStdDays        float64  `json:"lead_time_std_days"`
	ServiceLevelPct        float64  `json:"service_level_pct"`
	OrderingCostVND        float64  `json:"ordering_cost_vnd"`
	HoldingCostPctPerMonth float64  `json:"holding_cost_pct_per_month"`
	MOQUnits               int64    `json:"moq_units"`
	DemandMultiplier       float64  `json:"demand_multiplier,omitempty"` // Optional forecast regime / promo adjustment (default 1.0)
}

// ReplenishRequest represents POST /api/planning/replenish.
type ReplenishRequest struct {
	Items             []ReplenishSKUInput `json:"items"`
	CapitalBudgetVND  *int64              `json:"capital_budget_vnd,omitempty"`
	WarehouseMaxUnits *int64              `json:"warehouse_max_units,omitempty"`
}

// ReplenishSKUPlan summarizes optimal order policy and budget allocation for one SKU.
type ReplenishSKUPlan struct {
	ProductID               string  `json:"product_id"`
	ProductName             string  `json:"product_name"`
	DailyMeanQty            float64 `json:"daily_mean_qty"`
	DailyStdQty             float64 `json:"daily_std_qty"`
	CurrentStockUnits       int64   `json:"current_stock_units"`
	DaysOfStockLeft         float64 `json:"days_of_stock_left"`
	ZScore                  float64 `json:"z_score"`
	LeadTimeDemandMean      float64 `json:"lead_time_demand_mean"`
	LeadTimeDemandStd       float64 `json:"lead_time_demand_std"`
	SafetyStockUnits        int64   `json:"safety_stock_units"`
	ReorderPointUnits       int64   `json:"reorder_point_units"`
	EOQUnits                int64   `json:"eoq_units"`
	UncappedOrderUnits      int64   `json:"uncapped_order_units"`
	RecommendedOrderUnits   int64   `json:"recommended_order_units"`
	AllocatedOrderCostVND   int64   `json:"allocated_order_cost_vnd"`
	StockoutProbInLeadTime  float64 `json:"stockout_prob_in_lead_time"`
	EstimatedMarginSavedVND float64 `json:"estimated_margin_saved_vnd"`
	MarginPerVNDInvested    float64 `json:"margin_per_vnd_invested"`
	OrderStatus             string  `json:"order_status"` // "order_now" | "watch" | "ok" | "deferred_budget"
	DeferredByBudget        bool    `json:"deferred_by_budget"`
	AnnualHoldingCostVND    float64 `json:"annual_holding_cost_vnd"`
	AnnualOrderingCostVND   float64 `json:"annual_ordering_cost_vnd"`
	DemandSource            string  `json:"demand_source"` // "historical_series" | "baseline_period_estimate"
}

// ReplenishResponse represents the multi-SKU replenishment output.
type ReplenishResponse struct {
	Items                    []ReplenishSKUPlan `json:"items"`
	TotalUncappedCostVND     int64              `json:"total_uncapped_cost_vnd"`
	TotalAllocatedCostVND    int64              `json:"total_allocated_cost_vnd"`
	TotalAllocatedUnits      int64              `json:"total_allocated_units"`
	BudgetUtilizedPct        *float64           `json:"budget_utilized_pct,omitempty"`
	CapitalBudgetBinding     bool               `json:"capital_budget_binding"`
	WarehouseCapacityBinding bool               `json:"warehouse_capacity_binding"`
	OrderNowCount            int                `json:"order_now_count"`
	DeferredCount            int                `json:"deferred_count"`
	Provenance               AssumptionsTrace   `json:"provenance"`
}

// ---------------- 2. WORKING CAPITAL & CASH RUNWAY ----------------

// CashRunwayRequest represents POST /api/planning/runway.
type CashRunwayRequest struct {
	StartingCashVND         int64   `json:"starting_cash_vnd"`
	MinCashBufferVND        int64   `json:"min_cash_buffer_vnd"`
	OpeningInventoryCostVND int64   `json:"opening_inventory_cost_vnd"`
	ExpectedDailyRevenueVND float64 `json:"expected_daily_revenue_vnd"`
	ExpectedDailyCOGSVND    float64 `json:"expected_daily_cogs_vnd"`
	DailyRevenueStdVND      float64 `json:"daily_revenue_std_vnd,omitempty"`
	MonthlyFixedOpexVND     int64   `json:"monthly_fixed_opex_vnd"`
	DSODays                 int     `json:"dso_days"`
	DPODays                 int     `json:"dpo_days"`
	PlannedRestockCashVND   int64   `json:"planned_restock_cash_vnd"`
	RestockOutflowDay       int     `json:"restock_outflow_day,omitempty"` // Default day 1
	HorizonDays             int     `json:"horizon_days"`
	NSims                   int     `json:"n_sims"`
	Seed                    int64   `json:"seed"`
}

// CashTrajectoryPoint stores cross-simulation daily cash balance quantiles.
type CashTrajectoryPoint struct {
	Day             int     `json:"day"`
	P5CashVND       float64 `json:"p5_cash_vnd"`
	P50CashVND      float64 `json:"p50_cash_vnd"`
	P95CashVND      float64 `json:"p95_cash_vnd"`
	ExpectedCashVND float64 `json:"expected_cash_vnd"`
}

// WorkingCapitalRatios holds deterministic cash conversion diagnostics.
type WorkingCapitalRatios struct {
	DIODays                  float64 `json:"dio_days"`
	DSODays                  float64 `json:"dso_days"`
	DPODays                  float64 `json:"dpo_days"`
	CashConversionCycleDays  float64 `json:"cash_conversion_cycle_days"`
	DailyNetOperatingCashVND float64 `json:"daily_net_operating_cash_vnd"`
	DailyFixedOpexVND        float64 `json:"daily_fixed_opex_vnd"`
}

// CashRunwayResponse represents the cash runway simulation output.
type CashRunwayResponse struct {
	Ratios              WorkingCapitalRatios  `json:"ratios"`
	Trajectory          []CashTrajectoryPoint `json:"trajectory"`
	EndingP50CashVND    float64               `json:"ending_p50_cash_vnd"`
	EndingP5CashVND     float64               `json:"ending_p5_cash_vnd"`
	EndingP95CashVND    float64               `json:"ending_p95_cash_vnd"`
	MinExpectedCashVND  float64               `json:"min_expected_cash_vnd"`
	MinP5CashVND        float64               `json:"min_p5_cash_vnd"`
	TroughDayP50        int                   `json:"trough_day_p50"`
	ProbBreachMinBuffer float64               `json:"prob_breach_min_buffer"`
	ProbCashShortage    float64               `json:"prob_cash_shortage"`
	EstimatedRunwayDays *float64              `json:"estimated_runway_days,omitempty"`
	ShortageAlertLevel  string                `json:"shortage_alert_level"` // "healthy" | "caution" | "critical"
	Provenance          AssumptionsTrace      `json:"provenance"`
}

// ---------------- 3. MULTI-SKU PORTFOLIO OPTIMIZATION ----------------

// PortfolioSKUInput defines one SKU candidate pool in joint portfolio optimization.
type PortfolioSKUInput struct {
	ProductID         string                   `json:"product_id"`
	ProductName       string                   `json:"product_name"`
	Product           sim.ProductSimulateInput `json:"product"`
	AllowRestockUnits int64                    `json:"allow_restock_units,omitempty"`
}

// PortfolioOptimizeRequest represents POST /api/planning/portfolio.
type PortfolioOptimizeRequest struct {
	Items                 []PortfolioSKUInput `json:"items"`
	TotalCapitalBudgetVND int64               `json:"total_capital_budget_vnd"`
	WarehouseMaxUnits     *int64              `json:"warehouse_max_units,omitempty"`
	MaxPriceChangePct     float64             `json:"max_price_change_pct"`
	PriceStepPct          float64             `json:"price_step_pct,omitempty"` // Default 5%
	MinMarginPct          *float64            `json:"min_margin_pct,omitempty"`
	RiskAversionLambda    float64             `json:"risk_aversion_lambda"` // >= 0 penalty on (Expected - P5) downside spread
	HorizonDays           int                 `json:"horizon_days"`
	RespectStock          bool                `json:"respect_stock"`
	NSims                 int                 `json:"n_sims"`
	Seed                  int64               `json:"seed"`
}

// PortfolioSKUAllocation describes the selected price and restock plan for one SKU.
type PortfolioSKUAllocation struct {
	ProductID           string  `json:"product_id"`
	ProductName         string  `json:"product_name"`
	BasePriceVND        int64   `json:"base_price_vnd"`
	RecommendedPriceVND int64   `json:"recommended_price_vnd"`
	PriceChangePct      float64 `json:"price_change_pct"`
	RecommendedRestock  int64   `json:"recommended_restock_units"`
	ExpectedQty         float64 `json:"expected_qty"`
	BaseProfitVND       float64 `json:"base_profit_vnd"`
	ExpectedProfitVND   float64 `json:"expected_profit_vnd"`
	P5ProfitVND         float64 `json:"p5_profit_vnd"`
	ProfitUpliftVND     float64 `json:"profit_uplift_vnd"`
	CapitalRequiredVND  int64   `json:"capital_required_vnd"`
	RiskAdjustedUtility float64 `json:"risk_adjusted_utility"`
}

// PortfolioOptimizeResponse summarizes the optimal capital-constrained portfolio decision.
type PortfolioOptimizeResponse struct {
	Allocations                []PortfolioSKUAllocation `json:"allocations"`
	BaseTotalProfitVND         float64                  `json:"base_total_profit_vnd"`
	OptimizedExpectedProfitVND float64                  `json:"optimized_expected_profit_vnd"`
	OptimizedP5ProfitVND       float64                  `json:"optimized_p5_profit_vnd"`
	ProfitUpliftVND            float64                  `json:"profit_uplift_vnd"`
	ProfitUpliftPct            float64                  `json:"profit_uplift_pct"`
	TotalCapitalUsedVND        int64                    `json:"total_capital_used_vnd"`
	TotalPlannedUnits          int64                    `json:"total_planned_units"`
	CapitalBudgetBinding       bool                     `json:"capital_budget_binding"`
	WarehouseCapacityBinding   bool                     `json:"warehouse_capacity_binding"`
	IndependenceAssumption     string                   `json:"independence_assumption"`
	Provenance                 AssumptionsTrace         `json:"provenance"`
}

// ---------------- 4. VALUE OF INFORMATION (EVPI & EVSI) ----------------

// VOIRequest represents POST /api/planning/voi.
type VOIRequest struct {
	Product           sim.ProductSimulateInput `json:"product"`
	MaxPriceChangePct float64                  `json:"max_price_change_pct"`
	PriceStepPct      float64                  `json:"price_step_pct,omitempty"`
	MinMarginPct      *float64                 `json:"min_margin_pct,omitempty"`
	RespectStock      bool                     `json:"respect_stock"`
	HorizonDays       int                      `json:"horizon_days"`
	ExperimentDays    int                      `json:"experiment_days"`
	ExperimentCostVND int64                    `json:"experiment_cost_vnd"`
	Seed              int64                    `json:"seed"`
}

// VOIActionSummary records one candidate price action evaluated under prior uncertainty.
type VOIActionSummary struct {
	PriceChangePct     float64 `json:"price_change_pct"`
	PriceVND           int64   `json:"price_vnd"`
	ExpectedProfitVND  float64 `json:"expected_profit_vnd"`
	BestPosteriorShare float64 `json:"best_posterior_share"` // Fraction of parameter states where this action wins
}

// VOIResponse quantifies EVPI, EVSI, ENGS and experiment recommendation.
type VOIResponse struct {
	CurrentOptimalPriceVND    int64              `json:"current_optimal_price_vnd"`
	CurrentOptimalChangePct   float64            `json:"current_optimal_change_pct"`
	MaxExpectedProfitVND      float64            `json:"max_expected_profit_vnd"`
	ExpectedProfitPerfectInfo float64            `json:"expected_profit_perfect_info_vnd"`
	EVPIVND                   float64            `json:"evpi_vnd"`
	EVPIPctOfProfit           float64            `json:"evpi_pct_of_profit"`
	EVSIVND                   float64            `json:"evsi_vnd"`
	ExperimentCostVND         int64              `json:"experiment_cost_vnd"`
	ENGSVND                   float64            `json:"engs_vnd"`
	BreakEvenInfoCostVND      float64            `json:"break_even_info_cost_vnd"`
	PriorElasticityStd        float64            `json:"prior_elasticity_std"`
	PosteriorElasticityStd    float64            `json:"posterior_elasticity_std"`
	Verdict                   string             `json:"verdict"` // "run_experiment" | "decide_now" | "low_uncertainty"
	ActionLandscape           []VOIActionSummary `json:"action_landscape"`
	Provenance                AssumptionsTrace   `json:"provenance"`
}
