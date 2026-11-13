package sim

import (
	"errors"
	"fmt"
	"math"
	"runtime"
	"sort"
	"sync"
)

const (
	minPriceChangePct = -50.0
	maxPriceChangePct = 100.0
	maxSimulations    = 200000
	defaultNumBins    = 20
	minHorizonDays    = 7
	maxHorizonDays    = 90
)

type expandedDay struct {
	day        int
	price      float64
	ratio      float64
	changePct  float64
	demandMult float64
	elastMult  float64
}

func expandScheduleDays(p0 float64, phases []SchedulePhase) ([]expandedDay, error) {
	if len(phases) == 0 {
		return nil, nil
	}
	totalDays := 0
	for i, ph := range phases {
		if ph.Days < 1 || ph.Days > maxHorizonDays {
			return nil, fmt.Errorf("schedule[%d].days %d must be between 1 and %d", i, ph.Days, maxHorizonDays)
		}
		if math.IsNaN(ph.StartChangePct) || math.IsInf(ph.StartChangePct, 0) {
			return nil, fmt.Errorf("schedule[%d].start_change_pct is NaN or Inf", i)
		}
		if math.IsNaN(ph.DailyStepPct) || math.IsInf(ph.DailyStepPct, 0) {
			return nil, fmt.Errorf("schedule[%d].daily_step_pct is NaN or Inf", i)
		}
		if math.IsNaN(ph.DemandMultiplier) || math.IsInf(ph.DemandMultiplier, 0) || ph.DemandMultiplier < 0 || ph.DemandMultiplier > 20 {
			return nil, fmt.Errorf("schedule[%d].demand_multiplier %.2f must be in [0, 20]", i, ph.DemandMultiplier)
		}
		if math.IsNaN(ph.ElasticityMultiplier) || math.IsInf(ph.ElasticityMultiplier, 0) || ph.ElasticityMultiplier < 0 || ph.ElasticityMultiplier > 5 {
			return nil, fmt.Errorf("schedule[%d].elasticity_multiplier %.2f must be in [0, 5]", i, ph.ElasticityMultiplier)
		}
		totalDays += ph.Days
	}
	if totalDays < minHorizonDays || totalDays > maxHorizonDays {
		return nil, fmt.Errorf("total schedule duration %d days must be between %d and %d", totalDays, minHorizonDays, maxHorizonDays)
	}

	days := make([]expandedDay, 0, totalDays)
	prevFactor := 1.0
	dayCounter := 0
	for _, ph := range phases {
		dMult := ph.DemandMultiplier
		if dMult == 0 {
			dMult = 1.0
		}
		eMult := ph.ElasticityMultiplier
		if eMult == 0 {
			eMult = 1.0
		}
		anchor := 1.0 + ph.StartChangePct/100.0
		if ph.RelativeToPrev {
			anchor = prevFactor * (1.0 + ph.StartChangePct/100.0)
		}
		for k := 0; k < ph.Days; k++ {
			dayCounter++
			steps := k
			if ph.StepOnFirstDay {
				steps = k + 1
			}
			var factor float64
			if ph.CompoundDailyStep {
				factor = anchor * math.Pow(1.0+ph.DailyStepPct/100.0, float64(steps))
			} else {
				factor = anchor + float64(steps)*(ph.DailyStepPct/100.0)
			}
			if math.IsNaN(factor) || math.IsInf(factor, 0) || factor <= 0 {
				return nil, fmt.Errorf("day %d produced invalid price factor %.4f", dayCounter, factor)
			}
			pctVsBase := (factor - 1.0) * 100.0
			if pctVsBase < minPriceChangePct-1e-6 || pctVsBase > maxPriceChangePct+1e-6 {
				return nil, fmt.Errorf("day %d price change %.2f%% falls outside allowed bounds [%.0f%%, %.0f%%]", dayCounter, pctVsBase, minPriceChangePct, maxPriceChangePct)
			}
			days = append(days, expandedDay{
				day:        dayCounter,
				price:      p0 * factor,
				ratio:      factor,
				changePct:  pctVsBase,
				demandMult: dMult,
				elastMult:  eMult,
			})
			prevFactor = factor
		}
	}
	return days, nil
}

// ValidateSimulateRequest ensures all numeric inputs are finite and within permitted bounds.
func ValidateSimulateRequest(req SimulateRequest) error {
	if req.Product.CurrentPriceVND <= 0 {
		return errors.New("current_price_vnd must be positive")
	}
	if req.Product.UnitCostVND < 0 {
		return errors.New("unit_cost_vnd cannot be negative")
	}
	if req.Product.BaselineQtyPerPeriod < 0 {
		return errors.New("baseline_qty_per_period cannot be negative")
	}
	if req.Product.StockAvailable != nil && *req.Product.StockAvailable < 0 {
		return errors.New("stock_available cannot be negative")
	}
	if req.Product.FixedCostVND != nil && *req.Product.FixedCostVND < 0 {
		return errors.New("fixed_cost_vnd cannot be negative")
	}
	if req.PlannedRestockUnits != nil && *req.PlannedRestockUnits < 0 {
		return errors.New("planned_restock_units cannot be negative")
	}
	if len(req.Product.ElasticitySamples) == 0 {
		return errors.New("elasticity_samples cannot be empty")
	}
	for i, s := range req.Product.ElasticitySamples {
		if math.IsNaN(s) || math.IsInf(s, 0) {
			return fmt.Errorf("elasticity_samples[%d] is NaN or Inf", i)
		}
	}
	if math.IsNaN(req.PriceChangePct) || math.IsInf(req.PriceChangePct, 0) {
		return errors.New("price_change_pct is NaN or Inf")
	}
	if len(req.Schedule) > 0 {
		if _, err := expandScheduleDays(float64(req.Product.CurrentPriceVND), req.Schedule); err != nil {
			return err
		}
	} else if req.PriceChangePct < minPriceChangePct || req.PriceChangePct > maxPriceChangePct {
		return fmt.Errorf("price_change_pct %.2f out of allowed bounds [%.0f, %.0f]", req.PriceChangePct, minPriceChangePct, maxPriceChangePct)
	}
	if req.HorizonDays != 0 && (req.HorizonDays < minHorizonDays || req.HorizonDays > maxHorizonDays) {
		return fmt.Errorf("horizon_days %d must be between %d and %d", req.HorizonDays, minHorizonDays, maxHorizonDays)
	}
	if req.DecisionGoal != "" && req.DecisionGoal != "maximize_profit" && req.DecisionGoal != "clear_inventory" {
		return fmt.Errorf("decision_goal %q must be maximize_profit or clear_inventory", req.DecisionGoal)
	}
	if req.InventoryAgeDays != nil && *req.InventoryAgeDays < 0 {
		return errors.New("inventory_age_days cannot be negative")
	}
	if req.HoldingCostPctPerMonth != nil {
		hc := *req.HoldingCostPctPerMonth
		if math.IsNaN(hc) || math.IsInf(hc, 0) || hc < 0 || hc > 50 {
			return errors.New("holding_cost_pct_per_month must be finite and in [0, 50]")
		}
	}
	if req.NSims < 1 || req.NSims > maxSimulations {
		return fmt.Errorf("n_sims %d must be between 1 and %d", req.NSims, maxSimulations)
	}
	if req.Product.SigmaResid != nil {
		sr := *req.Product.SigmaResid
		if math.IsNaN(sr) || math.IsInf(sr, 0) || sr < 0 {
			return errors.New("sigma_resid must be finite and non-negative")
		}
	}
	return nil
}

// splitmix64 is a pure deterministic 64-bit mixing hash.
// Guarantees simulation index i always receives identical draws regardless of worker count.
func splitmix64(x uint64) uint64 {
	x += 0x9e3779b97f4a7c15
	x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
	x = (x ^ (x >> 27)) * 0x94d049bb133111eb
	return x ^ (x >> 31)
}

func u64ToUnitFloat(x uint64) float64 {
	// Maps uint64 to (0, 1] strictly positive to make math.Log safe for Box-Muller
	v := float64(x>>11) / float64(uint64(1)<<53)
	if v <= 1e-15 {
		return 1e-15
	}
	return v
}

func computePointScenario(
	price float64,
	q0 float64,
	priceRatio float64,
	elasticity float64,
	cost float64,
	fixedCost float64,
	hasStock bool,
	stockCap float64,
) ScenarioMetrics {
	q := q0 * math.Pow(priceRatio, elasticity)
	if hasStock && q > stockCap {
		q = stockCap
	}
	rev := price * q
	spend := cost*q + fixedCost
	profit := (price-cost)*q - fixedCost
	return ScenarioMetrics{
		PriceVND: price,
		Qty:      q,
		Revenue:  rev,
		Profit:   profit,
		Spend:    spend,
	}
}

func quantileSorted(sorted []float64, p float64) float64 {
	n := len(sorted)
	if n == 0 {
		return 0
	}
	if n == 1 {
		return sorted[0]
	}
	idx := p * float64(n-1)
	lo := int(math.Floor(idx))
	hi := int(math.Ceil(idx))
	if lo == hi {
		return sorted[lo]
	}
	frac := idx - float64(lo)
	return sorted[lo]*(1.0-frac) + sorted[hi]*frac
}

// ComputeBreakEvenElasticity evaluates e* = ln((P0-C)/(P1-C)) / ln(P1/P0).
// Returns nil if undefined (no price change, or margin <= 0 in either state) so NaN/Inf never leak.
func ComputeBreakEvenElasticity(p0, p1, cost float64) *float64 {
	if p0 <= 0 || p1 <= 0 || math.Abs(p1-p0) < 1e-9 {
		return nil
	}
	m0 := p0 - cost
	m1 := p1 - cost
	if m0 <= 0 || m1 <= 0 {
		return nil
	}
	val := math.Log(m0/m1) / math.Log(p1/p0)
	if math.IsNaN(val) || math.IsInf(val, 0) {
		return nil
	}
	return &val
}

func resolveScheduleRates(q0, fixedCost float64, nDays, baselinePeriodDays int) (float64, float64) {
	if baselinePeriodDays > 0 {
		q0Daily := q0 / float64(baselinePeriodDays)
		effectiveFixed := fixedCost * (float64(nDays) / float64(baselinePeriodDays))
		return q0Daily, effectiveFixed
	}
	return q0 / float64(nDays), fixedCost
}

func computeScheduleBaseScenario(
	days []expandedDay,
	p0 float64,
	q0Daily float64,
	cost float64,
	fixedCost float64,
	hasStock bool,
	stockCap float64,
) ScenarioMetrics {
	var soldQty float64
	for _, d := range days {
		qd := q0Daily * d.demandMult
		if hasStock {
			remaining := stockCap - soldQty
			if remaining <= 0 {
				qd = 0
			} else if qd > remaining {
				qd = remaining
			}
		}
		soldQty += qd
	}
	rev := p0 * soldQty
	spend := cost*soldQty + fixedCost
	profit := rev - spend
	return ScenarioMetrics{
		PriceVND: p0,
		Qty:      soldQty,
		Revenue:  rev,
		Profit:   profit,
		Spend:    spend,
	}
}

func computeScheduleScenario(
	days []expandedDay,
	q0Daily float64,
	elasticity float64,
	noiseMult float64,
	cost float64,
	fixedCost float64,
	hasStock bool,
	stockCap float64,
) (ScenarioMetrics, float64) {
	nDays := float64(len(days))

	var unconstrainedQty float64
	var soldQty float64
	var rev float64
	var priceSum float64

	for _, d := range days {
		priceSum += d.price
		qd := q0Daily * d.demandMult * math.Pow(d.ratio, elasticity*d.elastMult) * noiseMult
		unconstrainedQty += qd

		soldToday := qd
		if hasStock {
			remaining := stockCap - soldQty
			if remaining <= 0 {
				soldToday = 0
			} else if soldToday > remaining {
				soldToday = remaining
			}
		}
		soldQty += soldToday
		rev += d.price * soldToday
	}

	spend := cost*soldQty + fixedCost
	profit := rev - spend
	avgPrice := priceSum / nDays
	if soldQty > 0 {
		avgPrice = rev / soldQty
	}
	return ScenarioMetrics{
		PriceVND: avgPrice,
		Qty:      soldQty,
		Revenue:  rev,
		Profit:   profit,
		Spend:    spend,
	}, unconstrainedQty
}

func computeScheduleTrace(
	days []expandedDay,
	q0Daily float64,
	elasticity float64,
	cost float64,
	fixedCost float64,
	hasStock bool,
	stockCap float64,
) []DailySchedulePoint {
	nDays := float64(len(days))
	fixedDaily := fixedCost / nDays
	soldCum := 0.0
	trace := make([]DailySchedulePoint, 0, len(days))
	for _, d := range days {
		qd := q0Daily * d.demandMult * math.Pow(d.ratio, elasticity*d.elastMult)
		if hasStock {
			remaining := stockCap - soldCum
			if remaining <= 0 {
				qd = 0
			} else if qd > remaining {
				qd = remaining
			}
		}
		soldCum += qd
		rev := d.price * qd
		profit := (d.price-cost)*qd - fixedDaily
		trace = append(trace, DailySchedulePoint{
			Day:             d.day,
			PriceVND:        d.price,
			PriceChangePct:  d.changePct,
			ExpectedQty:     qd,
			ExpectedRevenue: rev,
			ExpectedProfit:  profit,
		})
	}
	return trace
}

// computeScheduleBreakEvenElasticity finds unconstrained e* solving schedule profit == seasonal base profit via bisection.
func computeScheduleBreakEvenElasticity(days []expandedDay, p0, q0Daily, cost, fixedCost, baseProfit float64) *float64 {
	if len(days) == 0 || p0 <= cost || q0Daily <= 0 {
		return nil
	}
	firstDay := days[0]
	allEqual := true
	for _, d := range days[1:] {
		if math.Abs(d.price-firstDay.price) > 1e-6 ||
			math.Abs(d.demandMult-firstDay.demandMult) > 1e-6 ||
			math.Abs(d.elastMult-firstDay.elastMult) > 1e-6 {
			allEqual = false
			break
		}
	}
	if allEqual && math.Abs(firstDay.elastMult-1.0) < 1e-6 {
		return ComputeBreakEvenElasticity(p0, firstDay.price, cost)
	}

	evalDiff := func(e float64) float64 {
		var p float64
		for _, d := range days {
			qd := q0Daily * d.demandMult * math.Pow(d.ratio, e*d.elastMult)
			p += (d.price - cost) * qd
		}
		return p - fixedCost - baseProfit
	}

	// Scan [-15.0, 5.0] for root crossing
	step := 0.25
	bestRoot := math.NaN()
	prevE := -15.0
	prevF := evalDiff(prevE)
	for e := -15.0 + step; e <= 5.0+1e-9; e += step {
		currF := evalDiff(e)
		if math.IsNaN(currF) || math.IsInf(currF, 0) {
			prevE, prevF = e, currF
			continue
		}
		if prevF == 0 {
			bestRoot = prevE
			break
		}
		if !math.IsNaN(prevF) && !math.IsInf(prevF, 0) && prevF*currF <= 0 {
			lo, hi := prevE, e
			flo := prevF
			for iter := 0; iter < 50; iter++ {
				mid := 0.5 * (lo + hi)
				fmid := evalDiff(mid)
				if math.Abs(fmid) < 1e-9 || (hi-lo) < 1e-9 {
					lo = mid
					break
				}
				if flo*fmid <= 0 {
					hi = mid
				} else {
					lo, flo = mid, fmid
				}
			}
			bestRoot = lo
			if bestRoot <= 0 {
				break
			}
		}
		prevE, prevF = e, currF
	}
	if math.IsNaN(bestRoot) || math.IsInf(bestRoot, 0) {
		return nil
	}
	return &bestRoot
}

func buildClearanceMetrics(
	req SimulateRequest,
	p0 float64,
	cost float64,
	minPlanPrice float64,
	avgPlanPrice float64,
	activeHorizonDays int,
	periodDays float64,
	q0 float64,
	hasStock bool,
	stockCap float64,
	unconstrainedBaseQty float64,
	unconstrainedExpQty float64,
	baseScenario ScenarioMetrics,
	expScenario ScenarioMetrics,
) *ClearanceMetrics {
	goal := req.DecisionGoal
	if goal == "" {
		goal = "maximize_profit"
	}

	unitRecoveryPct := 100.0
	if cost > 0 {
		unitRecoveryPct = avgPlanPrice / cost * 100.0
	}
	recoversUnitCost := minPlanPrice >= cost-1e-6
	recoversTotalCost := expScenario.Profit >= -1e-6
	extraUnits := expScenario.Qty - baseScenario.Qty
	turnoverSpeedupPct := 0.0
	if baseScenario.Qty > 1e-9 {
		turnoverSpeedupPct = extraUnits / baseScenario.Qty * 100.0
	}
	totalCostCapitalTurned := expScenario.Qty * cost
	extraCapitalFreed := math.Max(0, extraUnits) * cost

	var poolUnits float64
	hasPool := false
	if hasStock {
		poolUnits = stockCap
		hasPool = true
	} else if req.BusinessContext != nil && req.BusinessContext.CurrentStockUnits != nil && *req.BusinessContext.CurrentStockUnits >= 0 {
		poolUnits = float64(*req.BusinessContext.CurrentStockUnits)
		hasPool = true
	} else if req.BusinessContext != nil && req.BusinessContext.StockDaysCover != nil && *req.BusinessContext.StockDaysCover > 0 {
		poolUnits = (*req.BusinessContext.StockDaysCover) * (q0 / math.Max(periodDays, 1.0))
		hasPool = true
	}

	holdingPct := 0.0
	if req.HoldingCostPctPerMonth != nil {
		holdingPct = *req.HoldingCostPctPerMonth
	}
	rDaily := (holdingPct / 100.0) / 30.0
	hDaysF := float64(activeHorizonDays)
	if hDaysF < 1 {
		hDaysF = 1
	}
	baseDaily := unconstrainedBaseQty / hDaysF
	planDaily := unconstrainedExpQty / hDaysF

	var invCapitalPtr, clearedPctPtr, baseDaysPtr, planDaysPtr, daysSavedPtr *float64
	holdingSaved := 0.0
	if hasPool && poolUnits > 0 {
		invCap := poolUnits * cost
		invCapitalPtr = &invCap
		clearedPct := math.Min(100.0, expScenario.Qty/poolUnits*100.0)
		clearedPctPtr = &clearedPct
		if baseDaily > 1e-9 && planDaily > 1e-9 {
			bDays := poolUnits / baseDaily
			pDays := poolUnits / planDaily
			dSaved := math.Max(0, bDays-pDays)
			baseDaysPtr = &bDays
			planDaysPtr = &pDays
			daysSavedPtr = &dSaved
			holdingSaved = 0.5 * invCap * rDaily * dSaved
		}
	} else if extraUnits > 0 && holdingPct > 0 {
		holdingSaved = extraUnits * cost * rDaily * hDaysF
	}

	ageTier := ""
	if req.InventoryAgeDays != nil {
		age := *req.InventoryAgeDays
		switch {
		case age >= 60:
			ageTier = "stale"
		case age >= 30:
			ageTier = "aging"
		default:
			ageTier = "new"
		}
	}

	adjustedDelta := (expScenario.Profit - baseScenario.Profit) + holdingSaved
	return &ClearanceMetrics{
		DecisionGoal:              goal,
		HorizonDays:               activeHorizonDays,
		UnitRecoveryPct:           unitRecoveryPct,
		RecoversUnitCost:          recoversUnitCost,
		RecoversTotalCost:         recoversTotalCost,
		ExtraUnitsCleared:         extraUnits,
		TurnoverSpeedupPct:        turnoverSpeedupPct,
		TotalCostCapitalTurnedVND: totalCostCapitalTurned,
		ExtraCapitalFreedVND:      extraCapitalFreed,
		InventoryCapitalVND:       invCapitalPtr,
		StockClearedPct:           clearedPctPtr,
		BaseDaysToClear:           baseDaysPtr,
		PlanDaysToClear:           planDaysPtr,
		DaysSavedToClear:          daysSavedPtr,
		InventoryAgeDays:          req.InventoryAgeDays,
		AgeTier:                   ageTier,
		HoldingCostPctPerMonth:    holdingPct,
		HoldingCostSavedVND:       holdingSaved,
		AdjustedProfitDeltaVND:    adjustedDelta,
	}
}

func buildAdvisorySummary(
	req SimulateRequest,
	p0 float64,
	cost float64,
	minPlanPrice float64,
	avgPlanPrice float64,
	eMedian float64,
	baseProfit float64,
	expProfit float64,
	p5Profit float64,
	unconstrainedExpQty float64,
	probBeatBase float64,
	hasStock bool,
	stockCap float64,
	clearance *ClearanceMetrics,
) *AdvisorySummary {
	baseMarginPct := 0.0
	if p0 > 0 {
		baseMarginPct = (p0 - cost) / p0 * 100.0
	}
	minMarginPct := 0.0
	if minPlanPrice > 0 {
		minMarginPct = (minPlanPrice - cost) / minPlanPrice * 100.0
	}
	deltaVND := expProfit - baseProfit
	deltaPct := 0.0
	if math.Abs(baseProfit) > 1e-9 {
		deltaPct = deltaVND / math.Abs(baseProfit) * 100.0
	}
	p5BeatsBase := p5Profit >= baseProfit-1e-6
	stockoutRisk := hasStock && unconstrainedExpQty > stockCap+1e-6

	var stockUtilPct *float64
	if hasStock && stockCap > 0 {
		u := unconstrainedExpQty / stockCap * 100.0
		stockUtilPct = &u
	}

	regime := "unit_elastic"
	switch {
	case eMedian > 0:
		regime = "anomalous_positive"
	case eMedian > -0.95:
		regime = "inelastic"
	case eMedian < -1.05:
		regime = "elastic"
	}

	flags := make([]string, 0)
	if minMarginPct < 0 {
		flags = append(flags, "margin_negative")
	} else if minMarginPct < 15.0 {
		flags = append(flags, "margin_below_15pct")
	}
	if stockoutRisk {
		flags = append(flags, "stockout_risk")
	}
	if !p5BeatsBase {
		flags = append(flags, "downside_below_base")
	}

	var bizWarnings []string
	if req.BusinessContext != nil {
		bizWarnings = req.BusinessContext.Warnings
		for _, w := range bizWarnings {
			flags = append(flags, w)
		}
	}

	hasDataWarning := func() bool {
		for _, w := range bizWarnings {
			if w == "low_price_variation" || w == "not_significant" || w == "few_observations" || w == "positive_elasticity" {
				return true
			}
		}
		return false
	}()

	isPriceCut := avgPlanPrice < p0-1e-6
	isClearanceGoal := req.DecisionGoal == "clear_inventory"
	adjustedDelta := deltaVND
	extraUnits := 0.0
	if clearance != nil {
		adjustedDelta = clearance.AdjustedProfitDeltaVND
		extraUnits = clearance.ExtraUnitsCleared
	}

	verdict := "CAUTIOUS_TRIAL_RECOMMENDED"
	switch {
	case minMarginPct < 0:
		if isClearanceGoal && isPriceCut {
			verdict = "CLEARANCE_BELOW_COST"
		} else {
			verdict = "MARGIN_EROSION_WARNING"
		}
	case stockoutRisk && isPriceCut:
		verdict = "STOCK_CONSTRAINED_HOLD_OR_RAISE"
	case isClearanceGoal && isPriceCut:
		if expProfit < -1e-6 {
			verdict = "CLEARANCE_BELOW_COST"
		} else if extraUnits > 0.5 {
			if hasDataWarning {
				verdict = "HIGH_UNCERTAINTY_AB_TEST"
			} else if minMarginPct >= 15.0 && (adjustedDelta >= -1.0 || deltaVND >= -0.35*math.Max(math.Abs(baseProfit), 1.0)) {
				verdict = "CLEARANCE_WORTHWHILE"
			} else {
				verdict = "CLEARANCE_PROFITABLE_TRADE_OFF"
			}
		} else {
			verdict = "NEGATIVE_EXPECTED_PROFIT"
		}
	case deltaVND < -1.0 && minMarginPct < 15.0:
		if isPriceCut && expProfit > 0 && extraUnits > 0.5 {
			verdict = "CLEARANCE_PROFITABLE_TRADE_OFF"
		} else {
			verdict = "MARGIN_EROSION_WARNING"
		}
	case deltaVND < -1.0:
		if isPriceCut && expProfit > 0 && minMarginPct >= 15.0 && extraUnits > 0.5 {
			verdict = "CLEARANCE_PROFITABLE_TRADE_OFF"
		} else {
			verdict = "NEGATIVE_EXPECTED_PROFIT"
		}
	case hasDataWarning:
		verdict = "HIGH_UNCERTAINTY_AB_TEST"
	case minMarginPct < 15.0:
		verdict = "MARGIN_EROSION_WARNING"
	case probBeatBase >= 0.80 && p5BeatsBase:
		verdict = "STRONGLY_RECOMMENDED"
	}

	return &AdvisorySummary{
		VerdictCode:            verdict,
		BaseMarginPct:          baseMarginPct,
		MinMarginPctInPlan:     minMarginPct,
		ExpectedProfitDeltaVND: deltaVND,
		ExpectedProfitDeltaPct: deltaPct,
		ProbBeatBase:           probBeatBase,
		P5BeatsBase:            p5BeatsBase,
		StockoutRisk:           stockoutRisk,
		StockUtilizationPct:    stockUtilPct,
		ElasticityRegime:       regime,
		RiskFlags:              flags,
	}
}

// RunSimulationRaw executes Monte Carlo simulation and returns both response and raw simulated profits slice.
func RunSimulationRaw(req SimulateRequest) (SimulateResponse, []float64, error) {
	if err := ValidateSimulateRequest(req); err != nil {
		return SimulateResponse{}, nil, err
	}

	p0 := float64(req.Product.CurrentPriceVND)
	cost := float64(req.Product.UnitCostVND)
	q0 := float64(req.Product.BaselineQtyPerPeriod)
	p1 := p0 * (1.0 + req.PriceChangePct/100.0)
	priceRatio := p1 / p0

	days, err := expandScheduleDays(p0, req.Schedule)
	if err != nil {
		return SimulateResponse{}, nil, err
	}
	isSchedule := len(days) > 0

	fixedCost := 0.0
	if req.Product.FixedCostVND != nil {
		fixedCost = float64(*req.Product.FixedCostVND)
	}

	hasStock := false
	stockCap := 0.0
	if req.Product.StockAvailable != nil {
		hasStock = true
		stockCap = float64(*req.Product.StockAvailable)
	}

	sigmaResid := 0.0
	if req.Product.SigmaResid != nil {
		sigmaResid = *req.Product.SigmaResid
	}

	// 1. Scenarios based on sensitivity percentiles (|e| sorted ascending)
	samplesCopy := make([]float64, len(req.Product.ElasticitySamples))
	copy(samplesCopy, req.Product.ElasticitySamples)
	sort.Slice(samplesCopy, func(i, j int) bool {
		ai := math.Abs(samplesCopy[i])
		aj := math.Abs(samplesCopy[j])
		if ai == aj {
			return samplesCopy[i] < samplesCopy[j]
		}
		return ai < aj
	})

	eP10Sens := quantileSorted(samplesCopy, 0.10)
	eMedian := quantileSorted(samplesCopy, 0.50)
	eP90Sens := quantileSorted(samplesCopy, 0.90)

	periodDays := 30.0
	if req.BaselinePeriodDays > 0 {
		periodDays = float64(req.BaselinePeriodDays)
	}
	activeHorizonDays := int(periodDays)
	effectiveQ0 := q0
	effectiveSingleFixed := fixedCost
	if isSchedule {
		activeHorizonDays = len(days)
	} else if req.HorizonDays > 0 {
		activeHorizonDays = req.HorizonDays
		scale := float64(req.HorizonDays) / periodDays
		effectiveQ0 = q0 * scale
		effectiveSingleFixed = fixedCost * scale
	}

	var baseScenario, expScenario, scenA, scenB ScenarioMetrics
	var unconstrainedBaseQty, unconstrainedExpQty float64
	var minPlanPrice, avgPlanPrice float64
	var scheduleTrace []DailySchedulePoint
	var q0Daily, effectiveFixed float64

	if isSchedule {
		q0Daily, effectiveFixed = resolveScheduleRates(q0, fixedCost, len(days), req.BaselinePeriodDays)
		for _, d := range days {
			unconstrainedBaseQty += q0Daily * d.demandMult
		}
		baseScenario = computeScheduleBaseScenario(days, p0, q0Daily, cost, effectiveFixed, hasStock, stockCap)
		expScenario, unconstrainedExpQty = computeScheduleScenario(days, q0Daily, eMedian, 1.0, cost, effectiveFixed, hasStock, stockCap)
		scenA, _ = computeScheduleScenario(days, q0Daily, eP10Sens, 1.0, cost, effectiveFixed, hasStock, stockCap)
		scenB, _ = computeScheduleScenario(days, q0Daily, eP90Sens, 1.0, cost, effectiveFixed, hasStock, stockCap)
		scheduleTrace = computeScheduleTrace(days, q0Daily, eMedian, cost, effectiveFixed, hasStock, stockCap)
		minPlanPrice = days[0].price
		priceSum := 0.0
		for _, d := range days {
			if d.price < minPlanPrice {
				minPlanPrice = d.price
			}
			priceSum += d.price
		}
		avgPlanPrice = priceSum / float64(len(days))
	} else {
		unconstrainedBaseQty = effectiveQ0
		baseScenario = computePointScenario(p0, effectiveQ0, 1.0, 0.0, cost, effectiveSingleFixed, hasStock, stockCap)
		expScenario = computePointScenario(p1, effectiveQ0, priceRatio, eMedian, cost, effectiveSingleFixed, hasStock, stockCap)
		scenA = computePointScenario(p1, effectiveQ0, priceRatio, eP10Sens, cost, effectiveSingleFixed, hasStock, stockCap)
		scenB = computePointScenario(p1, effectiveQ0, priceRatio, eP90Sens, cost, effectiveSingleFixed, hasStock, stockCap)
		unconstrainedExpQty = effectiveQ0 * math.Pow(priceRatio, eMedian)
		minPlanPrice = p1
		avgPlanPrice = p1
	}

	optScenario, pessScenario := scenA, scenB
	if scenB.Profit > scenA.Profit {
		optScenario, pessScenario = scenB, scenA
	}

	scenarios := map[string]ScenarioMetrics{
		"base":        baseScenario,
		"optimistic":  optScenario,
		"expected":    expScenario,
		"pessimistic": pessScenario,
	}

	// 2. Parallel Monte Carlo Simulation (core-count independent determinism)
	nSims := req.NSims
	profits := make([]float64, nSims)
	samples := req.Product.ElasticitySamples
	nSamples := uint64(len(samples))
	baseSeed := uint64(req.Seed)

	nWorkers := runtime.GOMAXPROCS(0)
	if nWorkers < 1 {
		nWorkers = 1
	}
	if nWorkers > nSims {
		nWorkers = nSims
	}

	var wg sync.WaitGroup
	chunkSize := (nSims + nWorkers - 1) / nWorkers
	for w := 0; w < nWorkers; w++ {
		start := w * chunkSize
		end := start + chunkSize
		if end > nSims {
			end = nSims
		}
		if start >= end {
			continue
		}
		wg.Add(1)
		go func(lo, hi int) {
			defer wg.Done()
			for i := lo; i < hi; i++ {
				h1 := splitmix64(baseSeed ^ (uint64(i+1) * 0x9e3779b97f4a7c15))
				e := samples[h1%nSamples]

				noiseMult := 1.0
				if sigmaResid > 0.0 {
					u1 := u64ToUnitFloat(splitmix64(h1 ^ 0x517cc1b727220a95))
					u2 := u64ToUnitFloat(splitmix64(h1 ^ 0x94d049bb133111eb))
					z := math.Sqrt(-2.0*math.Log(u1)) * math.Cos(2.0*math.Pi*u2)
					noiseMult = math.Exp(sigmaResid * z)
				}

				if isSchedule {
					sc, _ := computeScheduleScenario(days, q0Daily, e, noiseMult, cost, effectiveFixed, hasStock, stockCap)
					profits[i] = sc.Profit
				} else {
					q1 := effectiveQ0 * math.Pow(priceRatio, e) * noiseMult
					if hasStock && q1 > stockCap {
						q1 = stockCap
					}
					profits[i] = (p1-cost)*q1 - effectiveSingleFixed
				}
			}
		}(start, end)
	}
	wg.Wait()

	// 3. Distribution quantiles and histogram
	beatBaseCount := 0
	for i, pr := range profits {
		if math.IsNaN(pr) || math.IsInf(pr, 0) {
			return SimulateResponse{}, nil, fmt.Errorf("simulation %d produced non-finite profit", i)
		}
		if pr > baseScenario.Profit+1e-6 {
			beatBaseCount++
		}
	}
	probBeatBase := float64(beatBaseCount) / float64(nSims)

	sortedProfits := make([]float64, nSims)
	copy(sortedProfits, profits)
	sort.Float64s(sortedProfits)

	p5 := quantileSorted(sortedProfits, 0.05)
	p50 := quantileSorted(sortedProfits, 0.50)
	p95 := quantileSorted(sortedProfits, 0.95)

	minP := sortedProfits[0]
	maxP := sortedProfits[nSims-1]
	hist := buildHistogram(sortedProfits, minP, maxP, defaultNumBins)

	var breakEven *float64
	if isSchedule {
		breakEven = computeScheduleBreakEvenElasticity(days, p0, q0Daily, cost, effectiveFixed, baseScenario.Profit)
	} else {
		breakEven = ComputeBreakEvenElasticity(p0, p1, cost)
	}

	clearance := buildClearanceMetrics(
		req,
		p0,
		cost,
		minPlanPrice,
		avgPlanPrice,
		activeHorizonDays,
		periodDays,
		q0,
		hasStock,
		stockCap,
		unconstrainedBaseQty,
		unconstrainedExpQty,
		baseScenario,
		expScenario,
	)

	advisory := buildAdvisorySummary(
		req,
		p0,
		cost,
		minPlanPrice,
		avgPlanPrice,
		eMedian,
		baseScenario.Profit,
		expScenario.Profit,
		p5,
		unconstrainedExpQty,
		probBeatBase,
		hasStock,
		stockCap,
		clearance,
	)

	waterfall, cashFlow, tornado := buildFinancialDiagnostics(
		req,
		isSchedule,
		days,
		p0,
		p1,
		effectiveQ0,
		q0Daily,
		cost,
		effectiveFixed,
		effectiveSingleFixed,
		eMedian,
		hasStock,
		stockCap,
		expScenario,
		optScenario,
		pessScenario,
	)

	resp := SimulateResponse{
		Scenarios: scenarios,
		ProfitDistribution: ProfitDistribution{
			Histogram: hist,
			P5:        p5,
			P50:       p50,
			P95:       p95,
		},
		BreakEvenElasticity: breakEven,
		ProbBeatBase:        probBeatBase,
		ScheduleTrace:       scheduleTrace,
		Advisory:            advisory,
		Clearance:           clearance,
		Waterfall:           waterfall,
		CashFlow:            cashFlow,
		SensitivityTornado:  tornado,
	}
	return resp, profits, nil
}

func buildFinancialDiagnostics(
	req SimulateRequest,
	isSchedule bool,
	days []expandedDay,
	p0, p1, q0, q0Daily, cost, effectiveFixed, rawFixed, eMedian float64,
	hasStock bool,
	stockCap float64,
	expScenario, optScenario, pessScenario ScenarioMetrics,
) ([]WaterfallStep, *CashFlowSummary, []TornadoFactor) {
	activeFixed := rawFixed
	if isSchedule {
		activeFixed = effectiveFixed
	}

	rev := expScenario.Revenue
	cogs := cost * expScenario.Qty
	grossProfit := rev - cogs
	netProfit := expScenario.Profit

	waterfall := []WaterfallStep{
		{Key: "revenue", AmountVND: rev, StartVND: 0, EndVND: rev, IsTotal: true},
		{Key: "cogs", AmountVND: -cogs, StartVND: rev, EndVND: grossProfit, IsTotal: false},
		{Key: "gross_profit", AmountVND: grossProfit, StartVND: 0, EndVND: grossProfit, IsTotal: true},
		{Key: "fixed_marketing", AmountVND: -activeFixed, StartVND: grossProfit, EndVND: netProfit, IsTotal: false},
		{Key: "net_profit", AmountVND: netProfit, StartVND: 0, EndVND: netProfit, IsTotal: true},
	}

	restockUnits := 0.0
	if req.PlannedRestockUnits != nil {
		restockUnits = float64(*req.PlannedRestockUnits)
	} else if hasStock {
		if expScenario.Qty > stockCap {
			restockUnits = expScenario.Qty - stockCap
		}
	} else {
		restockUnits = expScenario.Qty
	}
	restockCash := cost * restockUnits
	netCash := rev - restockCash - activeFixed

	cashFlow := &CashFlowSummary{
		RevenueVND:           rev,
		CogsVND:              cogs,
		FixedMarketingVND:    activeFixed,
		RestockUnits:         restockUnits,
		RestockCashNeededVND: restockCash,
		NetCashFlowVND:       netCash,
		NetProfitVND:         netProfit,
	}

	// Deterministic Tornado sensitivity factors around current expected plan
	evalScheduleWith := func(priceScale, unitCostVal, fixedVal float64) float64 {
		scaledDays := make([]expandedDay, len(days))
		for i, d := range days {
			sd := d
			sd.price = d.price * priceScale
			sd.ratio = sd.price / p0
			scaledDays[i] = sd
		}
		sc, _ := computeScheduleScenario(scaledDays, q0Daily, eMedian, 1.0, unitCostVal, fixedVal, hasStock, stockCap)
		return sc.Profit
	}

	evalPlan := func(priceScale, unitCostVal, fixedVal float64) float64 {
		if isSchedule {
			return evalScheduleWith(priceScale, unitCostVal, fixedVal)
		}
		pTest := p1 * priceScale
		ratio := pTest / p0
		return computePointScenario(pTest, q0, ratio, eMedian, unitCostVal, fixedVal, hasStock, stockCap).Profit
	}

	// 1. Selling Price ±10% relative to current plan
	pLow := evalPlan(0.90, cost, activeFixed)
	pHigh := evalPlan(1.10, cost, activeFixed)
	priceMin, priceMax := math.Min(pLow, pHigh), math.Max(pLow, pHigh)

	// 2. Buyer reaction p90 vs p10
	reactMin, reactMax := math.Min(pessScenario.Profit, optScenario.Profit), math.Max(pessScenario.Profit, optScenario.Profit)

	// 3. Unit Cost ±10%
	cHighProfit := evalPlan(1.0, cost*0.90, activeFixed)
	cLowProfit := evalPlan(1.0, cost*1.10, activeFixed)
	costMin, costMax := math.Min(cLowProfit, cHighProfit), math.Max(cLowProfit, cHighProfit)

	// 4. Fixed / Marketing Spend shock (±25% if > 0, or +5M VND probe if 0)
	var fLow, fHigh float64
	var fLowLbl, fHighLbl string
	if activeFixed > 1000 {
		fLow = evalPlan(1.0, cost, activeFixed*1.25)
		fHigh = evalPlan(1.0, cost, activeFixed*0.75)
		fLowLbl = "+25%"
		fHighLbl = "-25%"
	} else {
		fLow = evalPlan(1.0, cost, activeFixed+5000000)
		fHigh = netProfit
		fLowLbl = "+5M"
		fHighLbl = "0"
	}
	fixedMin, fixedMax := math.Min(fLow, fHigh), math.Max(fLow, fHigh)

	tornado := []TornadoFactor{
		{
			Key:        "selling_price",
			LowProfit:  priceMin,
			BaseProfit: netProfit,
			HighProfit: priceMax,
			SpreadVND:  priceMax - priceMin,
			LowLabel:   "-10%",
			HighLabel:  "+10%",
		},
		{
			Key:        "buyer_reaction",
			LowProfit:  reactMin,
			BaseProfit: netProfit,
			HighProfit: reactMax,
			SpreadVND:  reactMax - reactMin,
			LowLabel:   "p90",
			HighLabel:  "p10",
		},
		{
			Key:        "unit_cost",
			LowProfit:  costMin,
			BaseProfit: netProfit,
			HighProfit: costMax,
			SpreadVND:  costMax - costMin,
			LowLabel:   "+10%",
			HighLabel:  "-10%",
		},
		{
			Key:        "fixed_marketing",
			LowProfit:  fixedMin,
			BaseProfit: netProfit,
			HighProfit: fixedMax,
			SpreadVND:  fixedMax - fixedMin,
			LowLabel:   fLowLbl,
			HighLabel:  fHighLbl,
		},
	}

	sort.SliceStable(tornado, func(i, j int) bool {
		return tornado[i].SpreadVND > tornado[j].SpreadVND
	})

	return waterfall, cashFlow, tornado
}

// RunSimulation executes Monte Carlo simulation and returns the API response payload.
func RunSimulation(req SimulateRequest) (SimulateResponse, error) {
	resp, _, err := RunSimulationRaw(req)
	return resp, err
}

func buildHistogram(sortedProfits []float64, minP, maxP float64, nBins int) []HistogramBin {
	if maxP-minP < 1e-6 {
		return []HistogramBin{{
			BinStart: minP,
			BinEnd:   maxP,
			Count:    len(sortedProfits),
		}}
	}
	bins := make([]HistogramBin, nBins)
	width := (maxP - minP) / float64(nBins)
	for b := 0; b < nBins; b++ {
		bins[b].BinStart = minP + float64(b)*width
		bins[b].BinEnd = minP + float64(b+1)*width
	}
	for _, val := range sortedProfits {
		idx := int((val - minP) / width)
		if idx >= nBins {
			idx = nBins - 1
		}
		if idx < 0 {
			idx = 0
		}
		bins[idx].Count++
	}
	return bins
}
