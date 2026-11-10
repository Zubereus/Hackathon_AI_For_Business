// Package optimize implements deterministic Reverse What-If grid optimization.
package optimize

import (
	"errors"
	"fmt"
	"math"
	"runtime"
	"sort"
	"sync"

	"github.com/whatif-ai/engine-go/internal/sim"
)

// ValidateOptimizeRequest validates bounds, objective, and constraints for optimization.
func ValidateOptimizeRequest(req sim.OptimizeRequest) error {
	if req.Product.CurrentPriceVND <= 0 {
		return errors.New("current_price_vnd must be positive")
	}
	if req.Product.UnitCostVND < 0 {
		return errors.New("unit_cost_vnd cannot be negative")
	}
	if req.Product.BaselineQtyPerPeriod < 0 {
		return errors.New("baseline_qty_per_period cannot be negative")
	}
	if len(req.Product.ElasticitySamples) == 0 {
		return errors.New("elasticity_samples cannot be empty")
	}
	for i, s := range req.Product.ElasticitySamples {
		if math.IsNaN(s) || math.IsInf(s, 0) {
			return fmt.Errorf("elasticity_samples[%d] is NaN or Inf", i)
		}
	}
	if req.NSims < 1 || req.NSims > 200000 {
		return fmt.Errorf("n_sims %d must be between 1 and 200000", req.NSims)
	}
	if req.Objective != "" && req.Objective != "max_expected_profit" && req.Objective != "hit_target" {
		return fmt.Errorf("unsupported objective: %s", req.Objective)
	}
	if math.IsNaN(req.Constraints.MaxPriceChangePct) || math.IsInf(req.Constraints.MaxPriceChangePct, 0) {
		return errors.New("max_price_change_pct is NaN or Inf")
	}
	if req.Constraints.MaxPriceChangePct < 0 || req.Constraints.MaxPriceChangePct > 100 {
		return errors.New("max_price_change_pct must be between 0 and 100")
	}
	if req.TargetProfitUpliftPct != nil {
		if math.IsNaN(*req.TargetProfitUpliftPct) || math.IsInf(*req.TargetProfitUpliftPct, 0) {
			return errors.New("target_profit_uplift_pct is NaN or Inf")
		}
	}
	return nil
}

// RunGridOptimize executes parallel price-grid search over [-range..+range] with constraints.
func RunGridOptimize(req sim.OptimizeRequest) (sim.OptimizeResponse, error) {
	return RunGridOptimizeWithStep(req, 1.0)
}

// RunGridOptimizeWithStep executes grid optimization with an explicit step size in percentage points.
func RunGridOptimizeWithStep(req sim.OptimizeRequest, stepPct float64) (sim.OptimizeResponse, error) {
	if err := ValidateOptimizeRequest(req); err != nil {
		return sim.OptimizeResponse{}, err
	}
	if stepPct <= 0 {
		stepPct = 1.0
	}

	maxChange := req.Constraints.MaxPriceChangePct
	if maxChange == 0 {
		maxChange = 30.0 // Default -30%..+30%
	}
	loPct := math.Max(-50.0, -maxChange)
	hiPct := math.Min(100.0, maxChange)

	var candidatePcts []float64
	for p := loPct; p <= hiPct+1e-9; p += stepPct {
		candidatePcts = append(candidatePcts, math.Round(p*100.0)/100.0)
	}

	p0 := float64(req.Product.CurrentPriceVND)
	cost := float64(req.Product.UnitCostVND)
	q0 := float64(req.Product.BaselineQtyPerPeriod)
	fixedCost := 0.0
	if req.Product.FixedCostVND != nil {
		fixedCost = float64(*req.Product.FixedCostVND)
	}

	qBase := q0
	if req.Constraints.RespectStock && req.Product.StockAvailable != nil && float64(*req.Product.StockAvailable) < qBase {
		qBase = float64(*req.Product.StockAvailable)
	}
	baseProfit := (p0-cost)*qBase - fixedCost

	upliftPct := 0.0
	if req.TargetProfitUpliftPct != nil {
		upliftPct = *req.TargetProfitUpliftPct
	}
	targetProfit := baseProfit * (1.0 + upliftPct/100.0)

	// Configure product copy according to RespectStock constraint
	simProd := req.Product
	if !req.Constraints.RespectStock {
		simProd.StockAvailable = nil
	}

	nCandidates := len(candidatePcts)
	results := make([]sim.RankedOption, nCandidates)

	nWorkers := runtime.GOMAXPROCS(0)
	if nWorkers < 1 {
		nWorkers = 1
	}
	if nWorkers > nCandidates {
		nWorkers = nCandidates
	}

	var wg sync.WaitGroup
	chunk := (nCandidates + nWorkers - 1) / nWorkers
	for w := 0; w < nWorkers; w++ {
		start := w * chunk
		end := start + chunk
		if end > nCandidates {
			end = nCandidates
		}
		if start >= end {
			continue
		}
		wg.Add(1)
		go func(lo, hi int) {
			defer wg.Done()
			for idx := lo; idx < hi; idx++ {
				pct := candidatePcts[idx]
				p1Float := p0 * (1.0 + pct/100.0)
				p1VND := int64(math.Round(p1Float))

				simReq := sim.SimulateRequest{
					Product:        simProd,
					PriceChangePct: pct,
					NSims:          req.NSims,
					Seed:           req.Seed,
				}
				simResp, profits, err := sim.RunSimulationRaw(simReq)
				if err != nil {
					results[idx] = sim.RankedOption{
						PriceVND:       p1VND,
						PriceChangePct: pct,
						Feasible:       false,
						Violated:       []string{err.Error()},
					}
					continue
				}

				var sumProfit float64
				hits := 0
				for _, pr := range profits {
					sumProfit += pr
					if pr >= targetProfit {
						hits++
					}
				}
				expectedProfit := sumProfit / float64(len(profits))
				probHit := float64(hits) / float64(len(profits))

				violated := make([]string, 0)
				if math.Abs(pct) > maxChange+1e-9 {
					violated = append(violated, fmt.Sprintf("max_price_change_pct (%.1f%% > %.1f%%)", math.Abs(pct), maxChange))
				}
				if req.Constraints.MinMarginPct != nil {
					unitMarginPct := 0.0
					if p1Float > 0 {
						unitMarginPct = ((p1Float - cost) / p1Float) * 100.0
					}
					if unitMarginPct < *req.Constraints.MinMarginPct-1e-9 {
						violated = append(violated, fmt.Sprintf("min_margin_pct (%.1f%% < %.1f%%)", unitMarginPct, *req.Constraints.MinMarginPct))
					}
				}
				if req.Constraints.BudgetVND != nil && p1Float < p0 {
					expQty := simResp.Scenarios["expected"].Qty
					promoSubsidy := (p0 - p1Float) * expQty
					if promoSubsidy > float64(*req.Constraints.BudgetVND)+1e-9 {
						violated = append(violated, fmt.Sprintf("budget_vnd (discount cost %.0f > %d)", promoSubsidy, *req.Constraints.BudgetVND))
					}
				}

				results[idx] = sim.RankedOption{
					PriceVND:       p1VND,
					PriceChangePct: pct,
					ExpectedProfit: math.Round(expectedProfit),
					P5Profit:       math.Round(simResp.ProfitDistribution.P5),
					ProbHitTarget:  math.Round(probHit*10000.0) / 10000.0,
					Feasible:       len(violated) == 0,
					Violated:       violated,
				}
			}
		}(start, end)
	}
	wg.Wait()

	objective := req.Objective
	if objective == "" {
		objective = "max_expected_profit"
	}

	sort.SliceStable(results, func(i, j int) bool {
		a, b := results[i], results[j]
		if a.Feasible != b.Feasible {
			return a.Feasible
		}
		if objective == "hit_target" {
			if math.Abs(a.ProbHitTarget-b.ProbHitTarget) > 1e-6 {
				return a.ProbHitTarget > b.ProbHitTarget
			}
		}
		if math.Abs(a.ExpectedProfit-b.ExpectedProfit) > 1e-6 {
			return a.ExpectedProfit > b.ExpectedProfit
		}
		return a.PriceChangePct < b.PriceChangePct
	})

	return sim.OptimizeResponse{Ranked: results}, nil
}

