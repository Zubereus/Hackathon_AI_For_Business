package planning

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// NormalCDF computes the standard normal cumulative distribution Phi(z).
func NormalCDF(z float64) float64 {
	return 0.5 * math.Erfc(-z/math.Sqrt2)
}

// NormalQuantile approximates Phi^{-1}(p) for p in (0, 1) via Acklam's algorithm (< 1.15e-9 error).
func NormalQuantile(p float64) (float64, error) {
	if math.IsNaN(p) || p <= 0.0 || p >= 1.0 {
		return 0, fmt.Errorf("service level probability p=%.6f must lie strictly in (0, 1)", p)
	}
	const (
		a1 = -3.969683028665376e+01
		a2 = 2.209460984245205e+02
		a3 = -2.759285104469687e+02
		a4 = 1.383577518672690e+02
		a5 = -3.066479806614716e+01
		a6 = 2.506628277459239e+00

		b1 = -5.447609879822406e+01
		b2 = 1.615858368580409e+02
		b3 = -1.556989798598866e+02
		b4 = 6.680131188771972e+01
		b5 = -1.328068155288572e+01

		c1 = -7.784894002430293e-03
		c2 = -3.223964580411365e-01
		c3 = -2.400758277161838e+00
		c4 = -2.549732539343734e+00
		c5 = 4.374664141464968e+00
		c6 = 2.938163982698783e+00

		d1 = 7.784695709041462e-03
		d2 = 3.224671290700398e-01
		d3 = 2.445134137142996e+00
		d4 = 3.754408661907416e+00
	)
	const pLow = 0.02425
	const pHigh = 1.0 - pLow

	if p < pLow {
		q := math.Sqrt(-2.0 * math.Log(p))
		num := (((((c1*q+c2)*q+c3)*q+c4)*q+c5)*q + c6)
		den := ((((d1*q+d2)*q+d3)*q+d4)*q + 1.0)
		return num / den, nil
	}
	if p <= pHigh {
		q := p - 0.5
		r := q * q
		num := (((((a1*r+a2)*r+a3)*r+a4)*r+a5)*r + a6) * q
		den := (((((b1*r+b2)*r+b3)*r+b4)*r+b5)*r + 1.0)
		return num / den, nil
	}
	q := math.Sqrt(-2.0 * math.Log(1.0-p))
	num := (((((c1*q+c2)*q+c3)*q+c4)*q+c5)*q + c6)
	den := ((((d1*q+d2)*q+d3)*q+d4)*q + 1.0)
	return -(num / den), nil
}

// OptimizeReplenishment computes EOQ, safety stock, reorder point, lead-time stockout risk,
// and multi-SKU capital/warehouse-constrained replenishment order allocations.
func OptimizeReplenishment(req ReplenishRequest) (ReplenishResponse, error) {
	if len(req.Items) == 0 {
		return ReplenishResponse{}, errors.New("items cannot be empty")
	}
	if req.CapitalBudgetVND != nil && *req.CapitalBudgetVND < 0 {
		return ReplenishResponse{}, errors.New("capital_budget_vnd cannot be negative")
	}
	if req.WarehouseMaxUnits != nil && *req.WarehouseMaxUnits < 0 {
		return ReplenishResponse{}, errors.New("warehouse_max_units cannot be negative")
	}

	plans := make([]ReplenishSKUPlan, 0, len(req.Items))
	hasSeriesStats := false

	for idx, it := range req.Items {
		if it.ProductID == "" {
			return ReplenishResponse{}, fmt.Errorf("items[%d].product_id is required", idx)
		}
		if it.CurrentPriceVND <= 0 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].current_price_vnd must be positive", idx)
		}
		if it.UnitCostVND < 0 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].unit_cost_vnd cannot be negative", idx)
		}
		if it.BaselineQtyPerPeriod < 0 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].baseline_qty_per_period cannot be negative", idx)
		}
		if math.IsNaN(it.LeadTimeDays) || math.IsInf(it.LeadTimeDays, 0) || it.LeadTimeDays < 0 || it.LeadTimeDays > 180 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].lead_time_days must be in [0, 180]", idx)
		}
		if math.IsNaN(it.LeadTimeStdDays) || math.IsInf(it.LeadTimeStdDays, 0) || it.LeadTimeStdDays < 0 || it.LeadTimeStdDays > 90 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].lead_time_std_days must be in [0, 90]", idx)
		}
		if math.IsNaN(it.OrderingCostVND) || math.IsInf(it.OrderingCostVND, 0) || it.OrderingCostVND < 0 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].ordering_cost_vnd cannot be negative", idx)
		}
		if math.IsNaN(it.HoldingCostPctPerMonth) || math.IsInf(it.HoldingCostPctPerMonth, 0) || it.HoldingCostPctPerMonth < 0 || it.HoldingCostPctPerMonth > 50 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].holding_cost_pct_per_month must be in [0, 50]", idx)
		}

		svcPct := it.ServiceLevelPct
		if svcPct == 0 {
			svcPct = 95.0
		}
		if svcPct < 50.0 || svcPct > 99.9 {
			return ReplenishResponse{}, fmt.Errorf("items[%d].service_level_pct %.2f must be in [50, 99.9]", idx, svcPct)
		}
		zScore, err := NormalQuantile(svcPct / 100.0)
		if err != nil {
			return ReplenishResponse{}, err
		}

		periodDays := it.BaselinePeriodDays
		if periodDays <= 0 {
			periodDays = 30
		}
		mult := it.DemandMultiplier
		if mult <= 0 {
			mult = 1.0
		}

		var muD float64
		var demandSource string
		if it.DailyMeanQty != nil && !math.IsNaN(*it.DailyMeanQty) && *it.DailyMeanQty >= 0 {
			muD = (*it.DailyMeanQty) * mult
			demandSource = "historical_series"
			hasSeriesStats = true
		} else {
			muD = (float64(it.BaselineQtyPerPeriod) / float64(periodDays)) * mult
			demandSource = "baseline_period_estimate"
		}

		var sigmaD float64
		if it.DailyStdQty != nil && !math.IsNaN(*it.DailyStdQty) && *it.DailyStdQty >= 0 {
			sigmaD = (*it.DailyStdQty) * mult
		} else {
			sigmaD = math.Sqrt(math.Max(muD, 1e-6))
		}

		leadTime := it.LeadTimeDays
		if leadTime == 0 {
			leadTime = 1.0
		}
		leadMu := muD * leadTime
		leadVar := leadTime*(sigmaD*sigmaD) + (muD*muD)*(it.LeadTimeStdDays*it.LeadTimeStdDays)
		leadSigma := math.Sqrt(math.Max(leadVar, 1e-9))

		safetyStock := int64(math.Ceil(zScore * leadSigma))
		rop := int64(math.Ceil(leadMu)) + safetyStock

		annualD := muD * 365.0
		holdingRateAnnual := (it.HoldingCostPctPerMonth / 100.0) * 12.0
		annualHoldUnit := float64(it.UnitCostVND) * holdingRateAnnual
		var eoq int64
		if annualD > 0 && it.OrderingCostVND > 0 && annualHoldUnit > 0 {
			eoq = int64(math.Round(math.Sqrt((2.0 * annualD * it.OrderingCostVND) / annualHoldUnit)))
		} else {
			// Fallback to lead-time + 14-day review cycle when user sets ordering or holding cost to 0
			eoq = int64(math.Ceil(muD * math.Max(14.0, leadTime)))
		}
		if eoq < 1 && muD > 0 {
			eoq = 1
		}
		moq := it.MOQUnits
		if moq < 0 {
			moq = 0
		}
		if moq > 0 && eoq < moq {
			eoq = moq
		}

		var daysLeft float64
		if muD > 1e-9 {
			daysLeft = float64(it.StockAvailable) / muD
		} else {
			daysLeft = 999.0
		}

		var stockoutProb float64
		if leadMu <= 1e-9 {
			stockoutProb = 0
		} else if it.StockAvailable <= 0 {
			stockoutProb = 1.0
		} else {
			zCur := (float64(it.StockAvailable) - leadMu) / leadSigma
			stockoutProb = 1.0 - NormalCDF(zCur)
		}

		var uncappedOrder int64
		orderStatus := "ok"
		if it.StockAvailable <= rop {
			orderStatus = "order_now"
			shortfallToTarget := (rop + eoq) - it.StockAvailable
			if shortfallToTarget < eoq {
				shortfallToTarget = eoq
			}
			if shortfallToTarget < moq {
				shortfallToTarget = moq
			}
			uncappedOrder = shortfallToTarget
		} else if it.StockAvailable <= int64(math.Ceil(float64(rop)*1.25)) || stockoutProb >= 0.15 {
			orderStatus = "watch"
		}

		unitMargin := float64(it.CurrentPriceVND - it.UnitCostVND)
		if unitMargin < 0 {
			unitMargin = 0
		}
		expectedShortageUnits := math.Max(0.0, float64(rop)-float64(it.StockAvailable))
		if expectedShortageUnits == 0 && stockoutProb > 0.05 {
			expectedShortageUnits = leadSigma * stockoutProb
		}
		estMarginSaved := expectedShortageUnits * unitMargin
		costPerOrder := float64(uncappedOrder * it.UnitCostVND)
		marginPerVND := 0.0
		if costPerOrder > 0 {
			marginPerVND = estMarginSaved / costPerOrder
		} else if uncappedOrder > 0 {
			marginPerVND = 1e9
		}

		annualHolding := 0.0
		annualOrdering := 0.0
		if eoq > 0 {
			annualHolding = (float64(eoq)/2.0 + float64(safetyStock)) * annualHoldUnit
			if annualD > 0 {
				annualOrdering = (annualD / float64(eoq)) * it.OrderingCostVND
			}
		}

		plans = append(plans, ReplenishSKUPlan{
			ProductID:               it.ProductID,
			ProductName:             it.ProductName,
			DailyMeanQty:            math.Round(muD*100) / 100,
			DailyStdQty:             math.Round(sigmaD*100) / 100,
			CurrentStockUnits:       it.StockAvailable,
			DaysOfStockLeft:         math.Round(daysLeft*10) / 10,
			ZScore:                  math.Round(zScore*1000) / 1000,
			LeadTimeDemandMean:      math.Round(leadMu*100) / 100,
			LeadTimeDemandStd:       math.Round(leadSigma*100) / 100,
			SafetyStockUnits:        safetyStock,
			ReorderPointUnits:       rop,
			EOQUnits:                eoq,
			UncappedOrderUnits:      uncappedOrder,
			RecommendedOrderUnits:   uncappedOrder,
			AllocatedOrderCostVND:   uncappedOrder * it.UnitCostVND,
			StockoutProbInLeadTime:  math.Round(stockoutProb*10000) / 10000,
			EstimatedMarginSavedVND: math.Round(estMarginSaved),
			MarginPerVNDInvested:    math.Round(marginPerVND*10000) / 10000,
			OrderStatus:             orderStatus,
			DeferredByBudget:        false,
			AnnualHoldingCostVND:    math.Round(annualHolding),
			AnnualOrderingCostVND:   math.Round(annualOrdering),
			DemandSource:            demandSource,
		})
	}

	// Capital & Warehouse allocation pass
	var totalUncappedCost int64
	var totalUncappedUnits int64
	for _, p := range plans {
		totalUncappedCost += p.AllocatedOrderCostVND
		totalUncappedUnits += p.UncappedOrderUnits
	}

	budgetBinding := false
	warehouseBinding := false

	// Build priority order descending by MarginPerVNDInvested, tie-break StockoutProb descending, then ProductID
	orderIndices := make([]int, len(plans))
	for i := range orderIndices {
		orderIndices[i] = i
	}
	sort.SliceStable(orderIndices, func(a, b int) bool {
		ia, ib := orderIndices[a], orderIndices[b]
		if math.Abs(plans[ia].MarginPerVNDInvested-plans[ib].MarginPerVNDInvested) > 1e-6 {
			return plans[ia].MarginPerVNDInvested > plans[ib].MarginPerVNDInvested
		}
		if math.Abs(plans[ia].StockoutProbInLeadTime-plans[ib].StockoutProbInLeadTime) > 1e-6 {
			return plans[ia].StockoutProbInLeadTime > plans[ib].StockoutProbInLeadTime
		}
		return plans[ia].ProductID < plans[ib].ProductID
	})

	remainingBudget := int64(math.MaxInt64)
	if req.CapitalBudgetVND != nil {
		remainingBudget = *req.CapitalBudgetVND
		if totalUncappedCost > remainingBudget {
			budgetBinding = true
		}
	}
	remainingWarehouse := int64(math.MaxInt64)
	if req.WarehouseMaxUnits != nil {
		remainingWarehouse = *req.WarehouseMaxUnits
		if totalUncappedUnits > remainingWarehouse {
			warehouseBinding = true
		}
	}

	if budgetBinding || warehouseBinding {
		for _, idx := range orderIndices {
			it := req.Items[idx]
			pl := &plans[idx]
			if pl.UncappedOrderUnits == 0 {
				continue
			}
			maxAffordable := pl.UncappedOrderUnits
			if req.CapitalBudgetVND != nil && it.UnitCostVND > 0 {
				affordableByCash := remainingBudget / it.UnitCostVND
				if affordableByCash < maxAffordable {
					maxAffordable = affordableByCash
				}
			}
			if req.WarehouseMaxUnits != nil && remainingWarehouse < maxAffordable {
				maxAffordable = remainingWarehouse
			}
			if maxAffordable < it.MOQUnits {
				maxAffordable = 0
			}
			if maxAffordable < pl.UncappedOrderUnits {
				pl.DeferredByBudget = true
				if maxAffordable == 0 {
					pl.OrderStatus = "deferred_budget"
				}
			}
			pl.RecommendedOrderUnits = maxAffordable
			pl.AllocatedOrderCostVND = maxAffordable * it.UnitCostVND
			if req.CapitalBudgetVND != nil {
				remainingBudget -= pl.AllocatedOrderCostVND
			}
			if req.WarehouseMaxUnits != nil {
				remainingWarehouse -= maxAffordable
			}
		}
	}

	var totalAllocatedCost int64
	var totalAllocatedUnits int64
	orderNowCount := 0
	deferredCount := 0
	for _, p := range plans {
		totalAllocatedCost += p.AllocatedOrderCostVND
		totalAllocatedUnits += p.RecommendedOrderUnits
		if p.OrderStatus == "order_now" {
			orderNowCount++
		}
		if p.DeferredByBudget {
			deferredCount++
		}
	}

	var budgetUtilPtr *float64
	if req.CapitalBudgetVND != nil && *req.CapitalBudgetVND > 0 {
		u := math.Round((float64(totalAllocatedCost)/float64(*req.CapitalBudgetVND)*100.0)*100) / 100
		budgetUtilPtr = &u
	}

	histInputs := []string{"current_price_vnd", "unit_cost_vnd", "stock_available"}
	if hasSeriesStats {
		histInputs = append(histInputs, "daily_mean_qty (uncensored historical sales)", "daily_std_qty (uncensored historical sales)")
	} else {
		histInputs = append(histInputs, "baseline_qty_per_period")
	}

	return ReplenishResponse{
		Items:                    plans,
		TotalUncappedCostVND:     totalUncappedCost,
		TotalAllocatedCostVND:    totalAllocatedCost,
		TotalAllocatedUnits:      totalAllocatedUnits,
		BudgetUtilizedPct:        budgetUtilPtr,
		CapitalBudgetBinding:     budgetBinding,
		WarehouseCapacityBinding: warehouseBinding,
		OrderNowCount:            orderNowCount,
		DeferredCount:            deferredCount,
		Provenance: AssumptionsTrace{
			HistoricalInputsUsed: histInputs,
			ModelEstimatesUsed:   []string{"normal_quantile_safety_stock", "lead_time_demand_variance", "eoq_formula"},
			UserAssumptions:      []string{"lead_time_days", "lead_time_std_days", "service_level_pct", "ordering_cost_vnd", "holding_cost_pct_per_month", "moq_units", "capital_budget_vnd", "warehouse_max_units"},
		},
	}, nil
}

