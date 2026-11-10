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
)

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
	if req.PriceChangePct < minPriceChangePct || req.PriceChangePct > maxPriceChangePct {
		return fmt.Errorf("price_change_pct %.2f out of allowed bounds [%.0f, %.0f]", req.PriceChangePct, minPriceChangePct, maxPriceChangePct)
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

	baseScenario := computePointScenario(p0, q0, 1.0, 0.0, cost, fixedCost, hasStock, stockCap)
	expScenario := computePointScenario(p1, q0, priceRatio, eMedian, cost, fixedCost, hasStock, stockCap)
	scenA := computePointScenario(p1, q0, priceRatio, eP10Sens, cost, fixedCost, hasStock, stockCap)
	scenB := computePointScenario(p1, q0, priceRatio, eP90Sens, cost, fixedCost, hasStock, stockCap)

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

				q1 := q0 * math.Pow(priceRatio, e) * noiseMult
				if hasStock && q1 > stockCap {
					q1 = stockCap
				}
				profits[i] = (p1-cost)*q1 - fixedCost
			}
		}(start, end)
	}
	wg.Wait()

	// 3. Distribution quantiles and histogram
	for i, pr := range profits {
		if math.IsNaN(pr) || math.IsInf(pr, 0) {
			return SimulateResponse{}, nil, fmt.Errorf("simulation %d produced non-finite profit", i)
		}
	}
	sortedProfits := make([]float64, nSims)
	copy(sortedProfits, profits)
	sort.Float64s(sortedProfits)

	p5 := quantileSorted(sortedProfits, 0.05)
	p50 := quantileSorted(sortedProfits, 0.50)
	p95 := quantileSorted(sortedProfits, 0.95)

	minP := sortedProfits[0]
	maxP := sortedProfits[nSims-1]
	hist := buildHistogram(sortedProfits, minP, maxP, defaultNumBins)

	breakEven := ComputeBreakEvenElasticity(p0, p1, cost)

	resp := SimulateResponse{
		Scenarios: scenarios,
		ProfitDistribution: ProfitDistribution{
			Histogram: hist,
			P5:        p5,
			P50:       p50,
			P95:       p95,
		},
		BreakEvenElasticity: breakEven,
	}
	return resp, profits, nil
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
