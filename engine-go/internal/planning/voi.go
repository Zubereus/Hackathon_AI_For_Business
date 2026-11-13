package planning

import (
	"errors"
	"fmt"
	"math"
	"sort"

	"github.com/whatif-ai/engine-go/internal/sim"
)

// AnalyzeValueOfInformation computes EVPI, EVSI, ENGS, and break-even experimentation cost
// from posterior elasticity bootstrap draws without requiring external data.
func AnalyzeValueOfInformation(req VOIRequest) (VOIResponse, error) {
	if req.Product.CurrentPriceVND <= 0 {
		return VOIResponse{}, errors.New("current_price_vnd must be positive")
	}
	if req.Product.UnitCostVND < 0 {
		return VOIResponse{}, errors.New("unit_cost_vnd cannot be negative")
	}
	if req.Product.BaselineQtyPerPeriod < 0 {
		return VOIResponse{}, errors.New("baseline_qty_per_period cannot be negative")
	}
	if len(req.Product.ElasticitySamples) == 0 {
		return VOIResponse{}, errors.New("elasticity_samples cannot be empty")
	}
	if req.HorizonDays <= 0 {
		req.HorizonDays = 30
	}
	if req.HorizonDays < 7 || req.HorizonDays > 90 {
		return VOIResponse{}, fmt.Errorf("horizon_days %d must be between 7 and 90", req.HorizonDays)
	}
	if req.ExperimentDays <= 0 {
		req.ExperimentDays = 14
	}
	if req.ExperimentCostVND < 0 {
		return VOIResponse{}, errors.New("experiment_cost_vnd cannot be negative")
	}

	step := req.PriceStepPct
	if step <= 0 {
		step = 5.0
	}
	maxChg := req.MaxPriceChangePct
	if maxChg <= 0 {
		maxChg = 30.0
	}
	lo := math.Max(-50.0, -maxChg)
	hi := math.Min(100.0, maxChg)

	pctSet := make(map[float64]bool)
	var candidatePcts []float64
	for p := lo; p <= hi+1e-9; p += step {
		rp := math.Round(p*100) / 100
		if !pctSet[rp] {
			pctSet[rp] = true
			candidatePcts = append(candidatePcts, rp)
		}
	}
	if !pctSet[0.0] {
		candidatePcts = append(candidatePcts, 0.0)
	}
	sort.Float64s(candidatePcts)

	p0 := float64(req.Product.CurrentPriceVND)
	cost := float64(req.Product.UnitCostVND)
	qScale := float64(req.HorizonDays) / 30.0
	q0 := float64(req.Product.BaselineQtyPerPeriod) * qScale
	fixedCost := 0.0
	if req.Product.FixedCostVND != nil {
		fixedCost = float64(*req.Product.FixedCostVND) * qScale
	}
	hasStock := req.RespectStock && req.Product.StockAvailable != nil
	stockCap := 0.0
	if hasStock {
		stockCap = float64(*req.Product.StockAvailable)
	}

	// Filter actions respecting optional minimum gross margin floor
	var actions []float64
	for _, pct := range candidatePcts {
		price := p0 * (1.0 + pct/100.0)
		if req.MinMarginPct != nil && price > 0 {
			marginPct := ((price - cost) / price) * 100.0
			if marginPct < *req.MinMarginPct-1e-9 {
				continue
			}
		}
		actions = append(actions, pct)
	}
	if len(actions) == 0 {
		actions = []float64{0.0}
	}

	samples := req.Product.ElasticitySamples
	mCount := len(samples)

	// Prior mean and standard deviation of elasticity
	var sumE, sumE2 float64
	for _, e := range samples {
		if math.IsNaN(e) || math.IsInf(e, 0) {
			return VOIResponse{}, errors.New("elasticity_samples contains NaN or Inf")
		}
		sumE += e
		sumE2 += e * e
	}
	muPrior := sumE / float64(mCount)
	varPrior := math.Max(0.0, sumE2/float64(mCount)-muPrior*muPrior)
	stdPrior := math.Sqrt(varPrior)

	profitForActionAndE := func(pct, elast float64) float64 {
		ratio := 1.0 + pct/100.0
		if ratio <= 0 {
			ratio = 1e-6
		}
		price := p0 * ratio
		m := sim.ComputePointScenario(price, q0, ratio, elast, cost, fixedCost, hasStock, stockCap)
		return m.Profit
	}

	// Expected profit per action and best action count across states (EVPI computation)
	expProfitPerAction := make([]float64, len(actions))
	bestStateWins := make([]int, len(actions))
	var sumBestPerState float64

	for _, e := range samples {
		bestIdx := 0
		bestVal := -math.MaxFloat64
		for aIdx, pct := range actions {
			prof := profitForActionAndE(pct, e)
			expProfitPerAction[aIdx] += prof
			if prof > bestVal {
				bestVal = prof
				bestIdx = aIdx
			}
		}
		bestStateWins[bestIdx]++
		sumBestPerState += bestVal
	}

	bestPriorIdx := 0
	maxExpectedProfit := -math.MaxFloat64
	for aIdx := range actions {
		expProfitPerAction[aIdx] /= float64(mCount)
		if expProfitPerAction[aIdx] > maxExpectedProfit {
			maxExpectedProfit = expProfitPerAction[aIdx]
			bestPriorIdx = aIdx
		}
	}
	evupi := sumBestPerState / float64(mCount)
	evpi := math.Max(0.0, evupi-maxExpectedProfit)

	// EVSI calculation via Bayesian normal conjugate preposterior over proposed field trial
	dailyBaseline := math.Max(0.25, float64(req.Product.BaselineQtyPerPeriod)/30.0)
	sigmaResid := 0.25
	if req.Product.SigmaResid != nil && *req.Product.SigmaResid >= 0 {
		sigmaResid = *req.Product.SigmaResid
	}
	// Proposed pilot variance assuming deliberate +/-12% alternating test price design (var(ln P) ~ 0.0144)
	testVar := (1.0 + sigmaResid*sigmaResid) / math.Max(1.0, float64(req.ExperimentDays)*dailyBaseline*0.0144)
	var evsi float64
	stdPost := stdPrior

	if varPrior > 1e-9 {
		w := varPrior / (varPrior + testVar)
		stdSignal := math.Sqrt(varPrior + testVar)
		stdPost = math.Sqrt(w * testVar)

		const nSignals = 200
		const nPostDraws = 40
		baseSeed := uint64(req.Seed) ^ 0xa24baed4963ee407
		var sumExpectedPost float64

		for k := 0; k < nSignals; k++ {
			zSig := sim.StdNormalFromSeed(sim.SplitMix64(baseSeed + uint64(k+1)*13))
			signal := muPrior + stdSignal*zSig
			muPost := (1.0-w)*muPrior + w*signal

			bestA := 0
			bestPostExp := -math.MaxFloat64
			for aIdx, pct := range actions {
				var acc float64
				for r := 0; r < nPostDraws; r++ {
					zP := sim.StdNormalFromSeed(sim.SplitMix64(baseSeed ^ uint64((k+1)*1009+r*37)))
					eDraw := muPost + stdPost*zP
					acc += profitForActionAndE(pct, eDraw)
				}
				avgP := acc / float64(nPostDraws)
				if avgP > bestPostExp {
					bestPostExp = avgP
					bestA = aIdx
				}
			}

			// Evaluate chosen Bayes action against posterior parameter distribution conditioned on signal
			var trueGivenSignal float64
			for r := 0; r < nPostDraws; r++ {
				zP := sim.StdNormalFromSeed(sim.SplitMix64(baseSeed ^ uint64((k+1)*1009+r*37)))
				eDraw := muPost + stdPost*zP
				trueGivenSignal += profitForActionAndE(actions[bestA], eDraw)
			}
			sumExpectedPost += trueGivenSignal / float64(nPostDraws)
		}
		evsi = math.Max(0.0, math.Min(evpi, (sumExpectedPost/float64(nSignals))-maxExpectedProfit))
	}

	engs := evsi - float64(req.ExperimentCostVND)
	evpiPct := 0.0
	if math.Abs(maxExpectedProfit) > 1e-6 {
		evpiPct = (evpi / math.Abs(maxExpectedProfit)) * 100.0
	}

	verdict := "decide_now"
	if evpi < 1.0 && stdPrior < 1e-4 {
		verdict = "low_uncertainty"
	} else if engs > 0.0 && evsi > 0.0 {
		verdict = "run_experiment"
	}

	landscape := make([]VOIActionSummary, len(actions))
	for aIdx, pct := range actions {
		landscape[aIdx] = VOIActionSummary{
			PriceChangePct:     pct,
			PriceVND:           int64(math.Round(p0 * (1.0 + pct/100.0))),
			ExpectedProfitVND:  math.Round(expProfitPerAction[aIdx]),
			BestPosteriorShare: math.Round((float64(bestStateWins[aIdx])/float64(mCount))*10000) / 10000,
		}
	}

	return VOIResponse{
		CurrentOptimalPriceVND:    int64(math.Round(p0 * (1.0 + actions[bestPriorIdx]/100.0))),
		CurrentOptimalChangePct:   actions[bestPriorIdx],
		MaxExpectedProfitVND:      math.Round(maxExpectedProfit),
		ExpectedProfitPerfectInfo: math.Round(evupi),
		EVPIVND:                   math.Round(evpi),
		EVPIPctOfProfit:           math.Round(evpiPct*100) / 100,
		EVSIVND:                   math.Round(evsi),
		ExperimentCostVND:         req.ExperimentCostVND,
		ENGSVND:                   math.Round(engs),
		BreakEvenInfoCostVND:      math.Round(evsi),
		PriorElasticityStd:        math.Round(stdPrior*1000) / 1000,
		PosteriorElasticityStd:    math.Round(stdPost*1000) / 1000,
		Verdict:                   verdict,
		ActionLandscape:           landscape,
		Provenance: AssumptionsTrace{
			HistoricalInputsUsed: []string{"current_price_vnd", "unit_cost_vnd", "baseline_qty_per_period", "stock_available"},
			ModelEstimatesUsed:   []string{"bootstrap_elasticity_samples", "jensen_evpi_preposterior", "normal_conjugate_evsi"},
			UserAssumptions:      []string{"experiment_days", "experiment_cost_vnd", "max_price_change_pct", "min_margin_pct", "horizon_days"},
		},
	}, nil
}

