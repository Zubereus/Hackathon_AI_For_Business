package planning

import (
	"errors"
	"fmt"
	"math"
	"runtime"
	"sort"
	"sync"

	"github.com/whatif-ai/engine-go/internal/sim"
)

// SimulateCashRunway executes deterministic working-capital ratio diagnostics (DIO, DSO, DPO, CCC)
// and parallel indexed Monte Carlo daily cash balance trajectory simulation.
func SimulateCashRunway(req CashRunwayRequest) (CashRunwayResponse, error) {
	if req.HorizonDays < 7 || req.HorizonDays > 180 {
		return CashRunwayResponse{}, fmt.Errorf("horizon_days %d must be between 7 and 180", req.HorizonDays)
	}
	if req.NSims < 1 || req.NSims > 100000 {
		return CashRunwayResponse{}, fmt.Errorf("n_sims %d must be between 1 and 100000", req.NSims)
	}
	if req.DSODays < 0 || req.DSODays > 90 || req.DPODays < 0 || req.DPODays > 120 {
		return CashRunwayResponse{}, errors.New("dso_days must be in [0, 90] and dpo_days in [0, 120]")
	}
	if math.IsNaN(req.ExpectedDailyRevenueVND) || math.IsInf(req.ExpectedDailyRevenueVND, 0) || req.ExpectedDailyRevenueVND < 0 {
		return CashRunwayResponse{}, errors.New("expected_daily_revenue_vnd must be finite and non-negative")
	}
	if math.IsNaN(req.ExpectedDailyCOGSVND) || math.IsInf(req.ExpectedDailyCOGSVND, 0) || req.ExpectedDailyCOGSVND < 0 {
		return CashRunwayResponse{}, errors.New("expected_daily_cogs_vnd must be finite and non-negative")
	}
	if math.IsNaN(req.DailyRevenueStdVND) || math.IsInf(req.DailyRevenueStdVND, 0) || req.DailyRevenueStdVND < 0 {
		return CashRunwayResponse{}, errors.New("daily_revenue_std_vnd must be finite and non-negative")
	}

	var dioDays float64
	if req.ExpectedDailyCOGSVND > 1e-6 && req.OpeningInventoryCostVND > 0 {
		dioDays = float64(req.OpeningInventoryCostVND) / req.ExpectedDailyCOGSVND
	}
	cccDays := dioDays + float64(req.DSODays) - float64(req.DPODays)
	dailyFixedOpex := float64(req.MonthlyFixedOpexVND) / 30.0
	cogsShare := 0.0
	if req.ExpectedDailyRevenueVND > 1e-6 {
		cogsShare = req.ExpectedDailyCOGSVND / req.ExpectedDailyRevenueVND
	}

	outflowDay := req.RestockOutflowDay
	if outflowDay <= 0 {
		outflowDay = 1
	}

	revStd := req.DailyRevenueStdVND
	if revStd == 0 && req.ExpectedDailyRevenueVND > 0 {
		// Conservative default 18% daily CV when daily residual std is omitted
		revStd = req.ExpectedDailyRevenueVND * 0.18
	}

	h := req.HorizonDays
	n := req.NSims
	baseSeed := uint64(req.Seed)

	// Per-day matrix stored row-major [day * n + sim] for cache-friendly sorting
	cashMatrix := make([]float64, h*n)
	breachBuffer := make([]uint8, n)
	shortageZero := make([]uint8, n)

	numWorkers := runtime.GOMAXPROCS(0)
	if numWorkers < 1 {
		numWorkers = 1
	}
	if numWorkers > n {
		numWorkers = n
	}

	var wg sync.WaitGroup
	wg.Add(numWorkers)
	chunk := (n + numWorkers - 1) / numWorkers

	for w := 0; w < numWorkers; w++ {
		start := w * chunk
		end := start + chunk
		if end > n {
			end = n
		}
		if start >= end {
			wg.Done()
			continue
		}
		go func(sIdx, eIdx int) {
			defer wg.Done()
			dailyRev := make([]float64, h)
			dailyCogs := make([]float64, h)
			for s := sIdx; s < eIdx; s++ {
				cash := float64(req.StartingCashVND)
				breached := uint8(0)
				shorted := uint8(0)
				// Mild macro regime shock across the simulation draw (sigma = 0.08 * expected)
				regimeHash := sim.SplitMix64(baseSeed ^ (uint64(s+1) * 0x9e3779b97f4a7c15))
				regimeZ := sim.StdNormalFromSeed(regimeHash)
				regimeMult := math.Max(0.55, 1.0+0.08*regimeZ)

				for d := 0; d < h; d++ {
					daySeed := sim.SplitMix64(regimeHash ^ (uint64(d+1) * 0xbf58476d1ce4e5b9))
					zDay := sim.StdNormalFromSeed(daySeed)
					revToday := math.Max(0.0, req.ExpectedDailyRevenueVND*regimeMult+revStd*zDay)
					dailyRev[d] = revToday
					if cogsShare > 0 {
						dailyCogs[d] = revToday * cogsShare
					} else {
						dailyCogs[d] = req.ExpectedDailyCOGSVND * regimeMult
					}

					inflow := 0.0
					if d >= req.DSODays {
						inflow = dailyRev[d-req.DSODays]
					} else {
						// Initial receivables pipeline collection assumes prior pre-horizon baseline pace
						inflow = req.ExpectedDailyRevenueVND
					}

					cogsOutflow := 0.0
					if d >= req.DPODays {
						cogsOutflow = dailyCogs[d-req.DPODays]
					} else {
						cogsOutflow = req.ExpectedDailyCOGSVND
					}

					extraRestock := 0.0
					if d+1 == outflowDay && req.PlannedRestockCashVND > 0 {
						extraRestock = float64(req.PlannedRestockCashVND)
					}

					cash += inflow - cogsOutflow - dailyFixedOpex - extraRestock
					cashMatrix[d*n+s] = cash
					if cash < float64(req.MinCashBufferVND) {
						breached = 1
					}
					if cash < 0.0 {
						shorted = 1
					}
				}
				breachBuffer[s] = breached
				shortageZero[s] = shorted
			}
		}(start, end)
	}
	wg.Wait()

	trajectory := make([]CashTrajectoryPoint, h)
	scratch := make([]float64, n)
	minExpected := math.MaxFloat64
	minP5 := math.MaxFloat64
	troughDay := 1

	for d := 0; d < h; d++ {
		off := d * n
		copy(scratch, cashMatrix[off:off+n])
		sort.Float64s(scratch)
		sum := 0.0
		for _, v := range scratch {
			sum += v
		}
		mean := sum / float64(n)
		p5 := sim.QuantileSorted(scratch, 0.05)
		p50 := sim.QuantileSorted(scratch, 0.50)
		p95 := sim.QuantileSorted(scratch, 0.95)
		if p50 < minExpected {
			minExpected = p50
			troughDay = d + 1
		}
		if p5 < minP5 {
			minP5 = p5
		}
		trajectory[d] = CashTrajectoryPoint{
			Day:             d + 1,
			P5CashVND:       math.Round(p5),
			P50CashVND:      math.Round(p50),
			P95CashVND:      math.Round(p95),
			ExpectedCashVND: math.Round(mean),
		}
	}

	breachCount := 0
	shortCount := 0
	for s := 0; s < n; s++ {
		if breachBuffer[s] == 1 {
			breachCount++
		}
		if shortageZero[s] == 1 {
			shortCount++
		}
	}
	probBreach := float64(breachCount) / float64(n)
	probShortage := float64(shortCount) / float64(n)

	dailyNetOp := req.ExpectedDailyRevenueVND - req.ExpectedDailyCOGSVND - dailyFixedOpex
	var runwayPtr *float64
	if dailyNetOp < -1e-3 {
		availableAboveZero := math.Max(0.0, float64(req.StartingCashVND)-float64(req.PlannedRestockCashVND))
		rDays := math.Round((availableAboveZero/math.Abs(dailyNetOp))*10) / 10
		runwayPtr = &rDays
	} else {
		// Also check if P5 crosses zero inside horizon
		for _, pt := range trajectory {
			if pt.P5CashVND < 0 {
				fd := float64(pt.Day)
				runwayPtr = &fd
				break
			}
		}
	}

	alertLevel := "healthy"
	if probShortage >= 0.15 || minP5 < 0 {
		alertLevel = "critical"
	} else if probBreach >= 0.20 || minP5 < float64(req.MinCashBufferVND) {
		alertLevel = "caution"
	}

	last := trajectory[h-1]
	return CashRunwayResponse{
		Ratios: WorkingCapitalRatios{
			DIODays:                  math.Round(dioDays*10) / 10,
			DSODays:                  float64(req.DSODays),
			DPODays:                  float64(req.DPODays),
			CashConversionCycleDays:  math.Round(cccDays*10) / 10,
			DailyNetOperatingCashVND: math.Round(dailyNetOp),
			DailyFixedOpexVND:        math.Round(dailyFixedOpex),
		},
		Trajectory:          trajectory,
		EndingP50CashVND:    last.P50CashVND,
		EndingP5CashVND:     last.P5CashVND,
		EndingP95CashVND:    last.P95CashVND,
		MinExpectedCashVND:  math.Round(minExpected),
		MinP5CashVND:        math.Round(minP5),
		TroughDayP50:        troughDay,
		ProbBreachMinBuffer: math.Round(probBreach*10000) / 10000,
		ProbCashShortage:    math.Round(probShortage*10000) / 10000,
		EstimatedRunwayDays: runwayPtr,
		ShortageAlertLevel:  alertLevel,
		Provenance: AssumptionsTrace{
			HistoricalInputsUsed: []string{"opening_inventory_cost_vnd", "expected_daily_revenue_vnd", "expected_daily_cogs_vnd"},
			ModelEstimatesUsed:   []string{"monte_carlo_daily_cash_distribution_p5_p50_p95", "dio_days", "cash_conversion_cycle_days"},
			UserAssumptions:      []string{"starting_cash_vnd", "min_cash_buffer_vnd", "dso_days", "dpo_days", "monthly_fixed_opex_vnd", "planned_restock_cash_vnd", "horizon_days"},
		},
	}, nil
}

