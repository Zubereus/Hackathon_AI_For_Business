package optimize

import (
	"testing"

	"github.com/whatif-ai/engine-go/internal/sim"
)

func TestGridOptimizeMaxExpectedProfit(t *testing.T) {
	req := sim.OptimizeRequest{
		Product: sim.ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 10000,
			ElasticitySamples:    []float64{-1.2, -1.5, -1.8, -1.4, -1.6},
		},
		Objective: "max_expected_profit",
		Constraints: sim.OptimizeConstraints{
			MaxPriceChangePct: 30.0,
			RespectStock:      false,
		},
		NSims: 1000,
		Seed:  42,
	}

	resp, err := RunGridOptimize(req)
	if err != nil {
		t.Fatalf("RunGridOptimize failed: %v", err)
	}
	if len(resp.Ranked) != 61 { // -30..+30 step 1%
		t.Fatalf("expected 61 grid candidates, got %d", len(resp.Ranked))
	}
	if !resp.Ranked[0].Feasible {
		t.Fatalf("expected top ranked option to be feasible")
	}
	if resp.Ranked[0].ExpectedProfit < resp.Ranked[len(resp.Ranked)-1].ExpectedProfit {
		t.Fatalf("ranking not sorted descending by expected profit")
	}
}

func TestGridOptimizeConstraintsAndHitTarget(t *testing.T) {
	uplift := 10.0
	minMargin := 42.0
	budget := int64(20000000)

	req := sim.OptimizeRequest{
		Product: sim.ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 10000,
			ElasticitySamples:    []float64{-1.2, -1.3, -1.1, -1.4},
		},
		Objective:             "hit_target",
		TargetProfitUpliftPct: &uplift,
		Constraints: sim.OptimizeConstraints{
			MaxPriceChangePct: 25.0,
			MinMarginPct:      &minMargin,
			BudgetVND:         &budget,
			RespectStock:      false,
		},
		NSims: 500,
		Seed:  42,
	}

	resp, err := RunGridOptimize(req)
	if err != nil {
		t.Fatalf("RunGridOptimize failed: %v", err)
	}

	// Price cuts must violate min_margin_pct (since at 100k, margin is 40% < 42%, so any cut or 0% violates minMargin 42%)
	foundViolation := false
	for _, opt := range resp.Ranked {
		if opt.PriceChangePct <= 0 {
			if opt.Feasible || len(opt.Violated) == 0 {
				t.Fatalf("expected price_change_pct %.1f to violate min_margin_pct", opt.PriceChangePct)
			}
			foundViolation = true
		}
	}
	if !foundViolation {
		t.Fatalf("expected margin violations on lower price candidates")
	}
}

// BenchmarkOptimizeGrid_100x5000 benchmarks 100 candidate price points x 5,000 Monte Carlo simulations each.
func BenchmarkOptimizeGrid_100x5000(b *testing.B) {
	samples := make([]float64, 300)
	for i := range samples {
		samples[i] = -1.5 + float64(i%15)*0.02 - 0.15
	}

	req := sim.OptimizeRequest{
		Product: sim.ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 10000,
			ElasticitySamples:    samples,
		},
		Objective: "max_expected_profit",
		Constraints: sim.OptimizeConstraints{
			MaxPriceChangePct: 50.0, // -50%..+50% = 101 candidates
			RespectStock:      false,
		},
		NSims: 5000,
		Seed:  42,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		resp, err := RunGridOptimize(req)
		if err != nil {
			b.Fatalf("optimize error: %v", err)
		}
		if len(resp.Ranked) < 100 {
			b.Fatalf("expected >= 100 candidates, got %d", len(resp.Ranked))
		}
	}
}

