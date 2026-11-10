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

// SimulateRequest represents a POST /api/simulate payload.
type SimulateRequest struct {
	Product        ProductSimulateInput `json:"product"`
	PriceChangePct float64              `json:"price_change_pct"`
	NSims          int                  `json:"n_sims"`
	Seed           int64                `json:"seed"`
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

