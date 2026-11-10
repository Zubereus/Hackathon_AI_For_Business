package sim

import (
	"bytes"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type proposalCase struct {
	Label                       string          `json:"label"`
	Request                     SimulateRequest `json:"request"`
	ExpectedQty                 float64         `json:"expected_qty"`
	ExpectedProfit              float64         `json:"expected_profit"`
	ExpectedBreakEvenElasticity float64         `json:"expected_break_even_elasticity"`
}

type proposalGoldenFile struct {
	Name  string         `json:"name"`
	Cases []proposalCase `json:"cases"`
}

type edgeGoldenFile struct {
	Name                        string          `json:"name"`
	Request                     SimulateRequest `json:"request"`
	ExpectedQty                 float64         `json:"expected_qty"`
	ExpectedProfit              float64         `json:"expected_profit"`
	ExpectedBreakEvenElasticity float64         `json:"expected_break_even_elasticity,omitempty"`
	ExpectNilBreakEven          bool            `json:"expect_nil_break_even,omitempty"`
}

func assertRelTol(t *testing.T, name string, got, want, relTol float64) {
	t.Helper()
	denom := math.Max(math.Abs(want), 1e-6)
	if math.Abs(got-want)/denom > relTol {
		t.Fatalf("%s mismatch: got %.4f, want %.4f (tol %.2f%%)", name, got, want, relTol*100)
	}
}

func TestProposalGoldenCases(t *testing.T) {
	goldenPath := filepath.Join("..", "..", "..", "contracts", "golden", "golden_proposal.json")
	raw, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("failed reading proposal golden file %s: %v", goldenPath, err)
	}

	var gf proposalGoldenFile
	if err := json.Unmarshal(raw, &gf); err != nil {
		t.Fatalf("failed parsing proposal golden file: %v", err)
	}

	for _, tc := range gf.Cases {
		t.Run(tc.Label, func(t *testing.T) {
			resp, err := RunSimulation(tc.Request)
			if err != nil {
				t.Fatalf("RunSimulation failed: %v", err)
			}
			expScen := resp.Scenarios["expected"]
			assertRelTol(t, tc.Label+".qty", expScen.Qty, tc.ExpectedQty, 0.001)
			assertRelTol(t, tc.Label+".profit", expScen.Profit, tc.ExpectedProfit, 0.001)
			if resp.BreakEvenElasticity == nil {
				t.Fatalf("expected non-nil break_even_elasticity")
			}
			assertRelTol(t, tc.Label+".break_even", *resp.BreakEvenElasticity, tc.ExpectedBreakEvenElasticity, 0.001)
		})
	}
}

func TestEdgeGoldenCases(t *testing.T) {
	edgeFiles := []string{
		"golden_edge_stock_binding.json",
		"golden_edge_cost_gte_price.json",
		"golden_edge_single_sample.json",
	}

	for _, fname := range edgeFiles {
		path := filepath.Join("..", "..", "..", "contracts", "golden", fname)
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed reading %s: %v", path, err)
		}
		var ef edgeGoldenFile
		if err := json.Unmarshal(raw, &ef); err != nil {
			t.Fatalf("failed parsing %s: %v", fname, err)
		}

		t.Run(ef.Name, func(t *testing.T) {
			resp, err := RunSimulation(ef.Request)
			if err != nil {
				t.Fatalf("RunSimulation failed: %v", err)
			}
			exp := resp.Scenarios["expected"]
			assertRelTol(t, ef.Name+".qty", exp.Qty, ef.ExpectedQty, 0.001)
			assertRelTol(t, ef.Name+".profit", exp.Profit, ef.ExpectedProfit, 0.001)

			if ef.ExpectNilBreakEven {
				if resp.BreakEvenElasticity != nil {
					t.Fatalf("expected nil break_even_elasticity, got %v", *resp.BreakEvenElasticity)
				}
			} else if ef.ExpectedBreakEvenElasticity != 0 {
				if resp.BreakEvenElasticity == nil {
					t.Fatalf("expected non-nil break_even_elasticity")
				}
				assertRelTol(t, ef.Name+".break_even", *resp.BreakEvenElasticity, ef.ExpectedBreakEvenElasticity, 0.001)
			}
			if ef.Name == "edge_single_sample_with_fixed_cost" {
				assertRelTol(t, "single_sample.p5_eq_p50", resp.ProfitDistribution.P5, resp.ProfitDistribution.P50, 1e-6)
				assertRelTol(t, "single_sample.p50_eq_p95", resp.ProfitDistribution.P50, resp.ProfitDistribution.P95, 1e-6)
			}
		})
	}
}

func TestDeterminismAcrossGOMAXPROCS(t *testing.T) {
	sigma := 0.05
	samples := make([]float64, 50)
	for i := range samples {
		samples[i] = -1.2 - float64(i)*0.02
	}
	req := SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      150000,
			UnitCostVND:          90000,
			BaselineQtyPerPeriod: 5000,
			ElasticitySamples:    samples,
			SigmaResid:           &sigma,
		},
		PriceChangePct: 12.0,
		NSims:          5000,
		Seed:           20261110,
	}

	prevProcs := runtime.GOMAXPROCS(1)
	defer runtime.GOMAXPROCS(prevProcs)

	resp1, err := RunSimulation(req)
	if err != nil {
		t.Fatalf("GOMAXPROCS=1 simulation failed: %v", err)
	}
	bytes1, err := json.Marshal(resp1)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	runtime.GOMAXPROCS(8)
	resp8, err := RunSimulation(req)
	if err != nil {
		t.Fatalf("GOMAXPROCS=8 simulation failed: %v", err)
	}
	bytes8, err := json.Marshal(resp8)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	if !bytes.Equal(bytes1, bytes8) {
		t.Fatalf("Determinism violation across GOMAXPROCS=1 and 8!\n1-core: %s\n8-core: %s", string(bytes1), string(bytes8))
	}
}

func TestValidationGuardrails(t *testing.T) {
	tests := []struct {
		name string
		req  SimulateRequest
	}{
		{
			name: "empty_samples",
			req: SimulateRequest{
				Product: ProductSimulateInput{
					CurrentPriceVND: 100000, UnitCostVND: 50000, BaselineQtyPerPeriod: 100,
					ElasticitySamples: []float64{},
				},
				PriceChangePct: 10, NSims: 100, Seed: 1,
			},
		},
		{
			name: "price_change_below_minus_50",
			req: SimulateRequest{
				Product: ProductSimulateInput{
					CurrentPriceVND: 100000, UnitCostVND: 50000, BaselineQtyPerPeriod: 100,
					ElasticitySamples: []float64{-1.5},
				},
				PriceChangePct: -60, NSims: 100, Seed: 1,
			},
		},
		{
			name: "price_change_above_100",
			req: SimulateRequest{
				Product: ProductSimulateInput{
					CurrentPriceVND: 100000, UnitCostVND: 50000, BaselineQtyPerPeriod: 100,
					ElasticitySamples: []float64{-1.5},
				},
				PriceChangePct: 150, NSims: 100, Seed: 1,
			},
		},
		{
			name: "n_sims_over_limit",
			req: SimulateRequest{
				Product: ProductSimulateInput{
					CurrentPriceVND: 100000, UnitCostVND: 50000, BaselineQtyPerPeriod: 100,
					ElasticitySamples: []float64{-1.5},
				},
				PriceChangePct: 10, NSims: 300000, Seed: 1,
			},
		},
		{
			name: "nan_sample",
			req: SimulateRequest{
				Product: ProductSimulateInput{
					CurrentPriceVND: 100000, UnitCostVND: 50000, BaselineQtyPerPeriod: 100,
					ElasticitySamples: []float64{-1.5, math.NaN()},
				},
				PriceChangePct: 10, NSims: 100, Seed: 1,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := RunSimulation(tc.req)
			if err == nil {
				t.Fatalf("expected error for invalid request %s, got nil", tc.name)
			}
		})
	}
}

func TestFixtureIntegration(t *testing.T) {
	fixturePath := filepath.Join("..", "..", "..", "contracts", "fixtures", "elasticity_fixture.json")
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("failed reading elasticity_fixture.json: %v", err)
	}
	var payload struct {
		Products []ProductSimulateInput `json:"products"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("failed parsing fixture: %v", err)
	}
	if len(payload.Products) == 0 {
		t.Fatalf("fixture has zero products")
	}

	resp, err := RunSimulation(SimulateRequest{
		Product:        payload.Products[0],
		PriceChangePct: 10.0,
		NSims:          5000,
		Seed:           42,
	})
	if err != nil {
		t.Fatalf("simulation on fixture failed: %v", err)
	}

	opt := resp.Scenarios["optimistic"].Profit
	exp := resp.Scenarios["expected"].Profit
	pess := resp.Scenarios["pessimistic"].Profit
	if !(opt >= exp && exp >= pess) {
		t.Fatalf("scenario ordering violated: opt=%.0f exp=%.0f pess=%.0f", opt, exp, pess)
	}
	if len(resp.ProfitDistribution.Histogram) == 0 {
		t.Fatalf("expected non-empty histogram")
	}
}
