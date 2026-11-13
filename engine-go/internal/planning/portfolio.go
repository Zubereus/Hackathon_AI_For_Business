package planning

import (
	"errors"
	"fmt"
	"math"
	"sort"

	"github.com/whatif-ai/engine-go/internal/sim"
)

type portfolioCandidate struct {
	priceChangePct float64
	priceVND       int64
	restockUnits   int64
	expectedQty    float64
	expectedProfit float64
	p5Profit       float64
	capitalReqVND  int64
	plannedUnits   int64
	utility        float64
}

// OptimizePortfolio performs Multiple-Choice Knapsack allocation across multiple SKUs
// to maximize risk-adjusted portfolio profit under shared capital and warehouse constraints.
func OptimizePortfolio(req PortfolioOptimizeRequest) (PortfolioOptimizeResponse, error) {
	if len(req.Items) == 0 {
		return PortfolioOptimizeResponse{}, errors.New("items cannot be empty")
	}
	if req.TotalCapitalBudgetVND < 0 {
		return PortfolioOptimizeResponse{}, errors.New("total_capital_budget_vnd cannot be negative")
	}
	if req.WarehouseMaxUnits != nil && *req.WarehouseMaxUnits < 0 {
		return PortfolioOptimizeResponse{}, errors.New("warehouse_max_units cannot be negative")
	}
	if math.IsNaN(req.MaxPriceChangePct) || math.IsInf(req.MaxPriceChangePct, 0) || req.MaxPriceChangePct < 0 || req.MaxPriceChangePct > 100 {
		return PortfolioOptimizeResponse{}, errors.New("max_price_change_pct must be in [0, 100]")
	}
	if math.IsNaN(req.RiskAversionLambda) || math.IsInf(req.RiskAversionLambda, 0) || req.RiskAversionLambda < 0 {
		return PortfolioOptimizeResponse{}, errors.New("risk_aversion_lambda must be non-negative")
	}
	if req.HorizonDays <= 0 {
		req.HorizonDays = 30
	}
	if req.HorizonDays < 7 || req.HorizonDays > 90 {
		return PortfolioOptimizeResponse{}, fmt.Errorf("horizon_days %d must be between 7 and 90", req.HorizonDays)
	}
	nSims := req.NSims
	if nSims <= 0 {
		nSims = 2000
	}
	if nSims > 50000 {
		nSims = 50000
	}

	step := req.PriceStepPct
	if step <= 0 {
		step = 5.0
	}
	maxChg := req.MaxPriceChangePct
	if maxChg == 0 {
		maxChg = 25.0
	}
	lo := math.Max(-50.0, -maxChg)
	hi := math.Min(100.0, maxChg)

	pctSet := make(map[float64]bool)
	var pctGrid []float64
	for p := lo; p <= hi+1e-9; p += step {
		rp := math.Round(p*100) / 100
		if !pctSet[rp] {
			pctSet[rp] = true
			pctGrid = append(pctGrid, rp)
		}
	}
	if !pctSet[0.0] {
		pctGrid = append(pctGrid, 0.0)
	}
	sort.Float64s(pctGrid)

	nItems := len(req.Items)
	baseProfits := make([]float64, nItems)
	candidatesPerItem := make([][]portfolioCandidate, nItems)

	for i, item := range req.Items {
		if item.ProductID == "" {
			return PortfolioOptimizeResponse{}, fmt.Errorf("items[%d].product_id is required", i)
		}
		prodForSim := item.Product
		if !req.RespectStock {
			prodForSim.StockAvailable = nil
		}

		// Evaluate baseline (0% price change, 0 restock) using exact sim engine
		baseRes, err := sim.RunSimulation(sim.SimulateRequest{
			Product:        prodForSim,
			PriceChangePct: 0.0,
			HorizonDays:    req.HorizonDays,
			NSims:          nSims,
			Seed:           req.Seed + int64(i*101),
		})
		if err != nil {
			return PortfolioOptimizeResponse{}, fmt.Errorf("item %s baseline sim failed: %w", item.ProductID, err)
		}
		baseProfits[i] = baseRes.Scenarios["base"].Profit

		restockOptions := []int64{0}
		if item.AllowRestockUnits > 0 {
			restockOptions = append(restockOptions, item.AllowRestockUnits)
		}

		var cands []portfolioCandidate
		for _, restock := range restockOptions {
			rPtr := restock
			var restockArg *int64
			if restock > 0 {
				restockArg = &rPtr
			}
			for _, pct := range pctGrid {
				candPrice := float64(item.Product.CurrentPriceVND) * (1.0 + pct/100.0)
				if req.MinMarginPct != nil && candPrice > 0 {
					marginPct := ((candPrice - float64(item.Product.UnitCostVND)) / candPrice) * 100.0
					if marginPct < *req.MinMarginPct-1e-9 {
						continue
					}
				}

				res, simErr := sim.RunSimulation(sim.SimulateRequest{
					Product:             prodForSim,
					PriceChangePct:      pct,
					HorizonDays:         req.HorizonDays,
					PlannedRestockUnits: restockArg,
					NSims:               nSims,
					Seed:                req.Seed + int64(i*101),
				})
				if simErr != nil {
					continue
				}

				expProfit := res.Scenarios["expected"].Profit
				p5Profit := res.ProfitDistribution.P5
				expQty := res.Scenarios["expected"].Qty
				downside := math.Max(0.0, expProfit-p5Profit)
				utility := expProfit - req.RiskAversionLambda*downside

				fixedCost := int64(0)
				if item.Product.FixedCostVND != nil {
					fixedCost = *item.Product.FixedCostVND
				}
				// Working capital commitment = COGS of planned volume (beyond existing free shelf? Let's model explicit working capital outlay: COGS replenish + fixed spend)
				var stockUnits int64
				if item.Product.StockAvailable != nil {
					stockUnits = *item.Product.StockAvailable
				}
				unitsToFund := int64(math.Ceil(expQty)) - stockUnits
				if unitsToFund < 0 {
					unitsToFund = 0
				}
				if restock > unitsToFund {
					unitsToFund = restock
				}
				capReq := unitsToFund*item.Product.UnitCostVND + fixedCost
				if capReq < 0 {
					capReq = 0
				}
				plannedStockUnits := stockUnits + restock

				cands = append(cands, portfolioCandidate{
					priceChangePct: pct,
					priceVND:       int64(math.Round(candPrice)),
					restockUnits:   restock,
					expectedQty:    expQty,
					expectedProfit: expProfit,
					p5Profit:       p5Profit,
					capitalReqVND:  capReq,
					plannedUnits:   plannedStockUnits,
					utility:        utility,
				})
			}
		}

		// Guarantee at least one fallback option (baseline) even if min_margin rejected all
		if len(cands) == 0 {
			downside := math.Max(0.0, baseRes.Scenarios["expected"].Profit-baseRes.ProfitDistribution.P5)
			fixedCost := int64(0)
			if item.Product.FixedCostVND != nil {
				fixedCost = *item.Product.FixedCostVND
			}
			var stockUnits int64
			if item.Product.StockAvailable != nil {
				stockUnits = *item.Product.StockAvailable
			}
			cands = append(cands, portfolioCandidate{
				priceChangePct: 0.0,
				priceVND:       item.Product.CurrentPriceVND,
				restockUnits:   0,
				expectedQty:    baseRes.Scenarios["expected"].Qty,
				expectedProfit: baseRes.Scenarios["expected"].Profit,
				p5Profit:       baseRes.ProfitDistribution.P5,
				capitalReqVND:  fixedCost,
				plannedUnits:   stockUnits,
				utility:        baseRes.Scenarios["expected"].Profit - req.RiskAversionLambda*downside,
			})
		}
		candidatesPerItem[i] = cands
	}

	// Multiple-Choice Knapsack DP over discretized capital budget (plus optional Lagrangian multiplier on warehouse units)
	chosen := solveMultipleChoiceKnapsack(candidatesPerItem, req.TotalCapitalBudgetVND, req.WarehouseMaxUnits)

	allocations := make([]PortfolioSKUAllocation, nItems)
	var baseTotal, optExpTotal, optP5Total float64
	var totalCapUsed, totalUnits int64

	for i, item := range req.Items {
		c := candidatesPerItem[i][chosen[i]]
		baseProf := baseProfits[i]
		uplift := c.expectedProfit - baseProf
		baseTotal += baseProf
		optExpTotal += c.expectedProfit
		optP5Total += c.p5Profit
		totalCapUsed += c.capitalReqVND
		totalUnits += c.plannedUnits

		allocations[i] = PortfolioSKUAllocation{
			ProductID:           item.ProductID,
			ProductName:         item.ProductName,
			BasePriceVND:        item.Product.CurrentPriceVND,
			RecommendedPriceVND: c.priceVND,
			PriceChangePct:      c.priceChangePct,
			RecommendedRestock:  c.restockUnits,
			ExpectedQty:         math.Round(c.expectedQty*100) / 100,
			BaseProfitVND:       math.Round(baseProf),
			ExpectedProfitVND:   math.Round(c.expectedProfit),
			P5ProfitVND:         math.Round(c.p5Profit),
			ProfitUpliftVND:     math.Round(uplift),
			CapitalRequiredVND:  c.capitalReqVND,
			RiskAdjustedUtility: math.Round(c.utility),
		}
	}

	totalUplift := optExpTotal - baseTotal
	upliftPct := 0.0
	if math.Abs(baseTotal) > 1e-6 {
		upliftPct = (totalUplift / math.Abs(baseTotal)) * 100.0
	}

	// Check if unconstrained choice would have exceeded capital or warehouse bounds
	var uncapCap int64
	var uncapUnits int64
	for _, cands := range candidatesPerItem {
		best := cands[0]
		for _, c := range cands[1:] {
			if c.utility > best.utility {
				best = c
			}
		}
		uncapCap += best.capitalReqVND
		uncapUnits += best.plannedUnits
	}
	capBinding := req.TotalCapitalBudgetVND > 0 && (uncapCap > req.TotalCapitalBudgetVND || totalCapUsed >= int64(float64(req.TotalCapitalBudgetVND)*0.98))
	whBinding := req.WarehouseMaxUnits != nil && uncapUnits > *req.WarehouseMaxUnits

	return PortfolioOptimizeResponse{
		Allocations:                allocations,
		BaseTotalProfitVND:         math.Round(baseTotal),
		OptimizedExpectedProfitVND: math.Round(optExpTotal),
		OptimizedP5ProfitVND:       math.Round(optP5Total),
		ProfitUpliftVND:            math.Round(totalUplift),
		ProfitUpliftPct:            math.Round(upliftPct*100) / 100,
		TotalCapitalUsedVND:        totalCapUsed,
		TotalPlannedUnits:          totalUnits,
		CapitalBudgetBinding:       capBinding,
		WarehouseCapacityBinding:   whBinding,
		IndependenceAssumption:     "Assumes cross-SKU demand independence (no basket cannibalization or halo cross-elasticity).",
		Provenance: AssumptionsTrace{
			HistoricalInputsUsed: []string{"current_price_vnd", "unit_cost_vnd", "baseline_qty_per_period", "stock_available", "fixed_cost_vnd"},
			ModelEstimatesUsed:   []string{"poisson_elasticity_samples", "monte_carlo_expected_and_p5_profit", "multiple_choice_knapsack_dp"},
			UserAssumptions:      []string{"total_capital_budget_vnd", "warehouse_max_units", "risk_aversion_lambda", "max_price_change_pct", "min_margin_pct", "horizon_days"},
		},
	}, nil
}

func solveMultipleChoiceKnapsack(items [][]portfolioCandidate, budgetVND int64, warehouseMax *int64) []int {
	n := len(items)
	// When no budget & no warehouse limit is active, simply pick maximum utility per item independently
	if budgetVND <= 0 && warehouseMax == nil {
		res := make([]int, n)
		for i, cands := range items {
			bestIdx := 0
			for j := 1; j < len(cands); j++ {
				if cands[j].utility > cands[bestIdx].utility {
					bestIdx = j
				}
			}
			res[i] = bestIdx
		}
		return res
	}

	solveWithPenalty := func(whPenalty float64) ([]int, int64) {
		const numBuckets = 250
		effBudget := budgetVND
		if effBudget <= 0 {
			// Budget effectively unbounded when only warehouse limit applies
			effBudget = 1
			for _, cands := range items {
				var maxC int64
				for _, c := range cands {
					if c.capitalReqVND > maxC {
						maxC = c.capitalReqVND
					}
				}
				effBudget += maxC
			}
		}
		step := float64(effBudget) / float64(numBuckets)
		if step < 1.0 {
			step = 1.0
		}

		// Ensure minimum feasible capital sum check
		var minCapSum int64
		minCapIdx := make([]int, n)
		for i, cands := range items {
			mIdx := 0
			for j := 1; j < len(cands); j++ {
				if cands[j].capitalReqVND < cands[mIdx].capitalReqVND ||
					(cands[j].capitalReqVND == cands[mIdx].capitalReqVND && cands[j].utility > cands[mIdx].utility) {
					mIdx = j
				}
			}
			minCapIdx[i] = mIdx
			minCapSum += cands[mIdx].capitalReqVND
		}
		if budgetVND > 0 && minCapSum > budgetVND {
			// Cannot satisfy budget even with cheapest option per SKU -> return min-capital fallback
			var totalU int64
			for i, idx := range minCapIdx {
				totalU += items[i][idx].plannedUnits
			}
			return minCapIdx, totalU
		}

		negInf := -1e30
		dp := make([]float64, numBuckets+1)
		for b := range dp {
			dp[b] = negInf
		}
		dp[0] = 0.0

		backChoice := make([][]int, n)
		backPrevB := make([][]int, n)

		for i, cands := range items {
			nextDP := make([]float64, numBuckets+1)
			for b := range nextDP {
				nextDP[b] = negInf
			}
			bChoice := make([]int, numBuckets+1)
			bPrev := make([]int, numBuckets+1)
			for b := range bChoice {
				bChoice[b] = -1
				bPrev[b] = -1
			}

			for prevB := 0; prevB <= numBuckets; prevB++ {
				if dp[prevB] <= negInf/2 {
					continue
				}
				for j, c := range cands {
					addB := int(math.Ceil(float64(c.capitalReqVND) / step))
					if c.capitalReqVND == 0 {
						addB = 0
					}
					nextB := prevB + addB
					if nextB > numBuckets {
						continue
					}
					score := dp[prevB] + c.utility - whPenalty*float64(c.plannedUnits)
					if score > nextDP[nextB] {
						nextDP[nextB] = score
						bChoice[nextB] = j
						bPrev[nextB] = prevB
					}
				}
			}
			dp = nextDP
			backChoice[i] = bChoice
			backPrevB[i] = bPrev
		}

		bestB := -1
		bestVal := negInf
		for b := 0; b <= numBuckets; b++ {
			if dp[b] > bestVal {
				bestVal = dp[b]
				bestB = b
			}
		}
		if bestB < 0 {
			var totalU int64
			for i, idx := range minCapIdx {
				totalU += items[i][idx].plannedUnits
			}
			return minCapIdx, totalU
		}

		chosen := make([]int, n)
		curB := bestB
		var totalUnits int64
		for i := n - 1; i >= 0; i-- {
			j := backChoice[i][curB]
			if j < 0 {
				j = minCapIdx[i]
				chosen[i] = j
			} else {
				chosen[i] = j
				curB = backPrevB[i][curB]
			}
			totalUnits += items[i][chosen[i]].plannedUnits
		}
		return chosen, totalUnits
	}

	chosen, units := solveWithPenalty(0.0)
	if warehouseMax == nil || units <= *warehouseMax {
		return chosen
	}

	// Binary search non-negative shadow price (Lagrangian multiplier) on warehouse capacity
	loPen := 0.0
	hiPen := 1e7
	for iter := 0; iter < 24; iter++ {
		mid := 0.5 * (loPen + hiPen)
		cMid, uMid := solveWithPenalty(mid)
		if uMid <= *warehouseMax {
			chosen = cMid
			hiPen = mid
		} else {
			loPen = mid
		}
	}
	return chosen
}
