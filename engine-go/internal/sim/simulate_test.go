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
	if resp.Advisory == nil || resp.Advisory.VerdictCode == "" {
		t.Fatalf("expected advisory summary to be populated")
	}
}

func TestScheduleEquivalenceToSingleStep(t *testing.T) {
	samples := []float64{-0.8, -1.1, -1.3, -1.5}
	prod := ProductSimulateInput{
		CurrentPriceVND:      100000,
		UnitCostVND:          60000,
		BaselineQtyPerPeriod: 3000,
		ElasticitySamples:    samples,
	}

	singleResp, err := RunSimulation(SimulateRequest{
		Product:        prod,
		PriceChangePct: 10.0,
		NSims:          1000,
		Seed:           42,
	})
	if err != nil {
		t.Fatalf("single step sim failed: %v", err)
	}

	schedResp, err := RunSimulation(SimulateRequest{
		Product:        prod,
		PriceChangePct: 10.0,
		NSims:          1000,
		Seed:           42,
		Schedule: []SchedulePhase{
			{Days: 30, StartChangePct: 10.0, DailyStepPct: 0.0},
		},
	})
	if err != nil {
		t.Fatalf("flat schedule sim failed: %v", err)
	}

	assertRelTol(t, "flat_schedule.expected_qty", schedResp.Scenarios["expected"].Qty, singleResp.Scenarios["expected"].Qty, 1e-6)
	assertRelTol(t, "flat_schedule.expected_profit", schedResp.Scenarios["expected"].Profit, singleResp.Scenarios["expected"].Profit, 1e-6)
	assertRelTol(t, "flat_schedule.p50", schedResp.ProfitDistribution.P50, singleResp.ProfitDistribution.P50, 1e-6)
	if len(schedResp.ScheduleTrace) != 30 {
		t.Fatalf("expected 30 daily trace points, got %d", len(schedResp.ScheduleTrace))
	}
}

func TestMultiPhaseScheduleCompoundRampAndDeterminism(t *testing.T) {
	// Scenario: 15 days at -30%, then 15 days +1% compounded per day
	samples := []float64{-1.0, -1.2, -1.4, -1.6}
	req := SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 3000,
			ElasticitySamples:    samples,
		},
		PriceChangePct: 0.0,
		NSims:          2000,
		Seed:           99,
		Schedule: []SchedulePhase{
			{Days: 15, StartChangePct: -30.0, DailyStepPct: 0.0},
			{Days: 15, StartChangePct: 0.0, DailyStepPct: 1.0, RelativeToPrev: true, CompoundDailyStep: true, StepOnFirstDay: true},
		},
	}

	prev := runtime.GOMAXPROCS(1)
	defer runtime.GOMAXPROCS(prev)
	r1, err := RunSimulation(req)
	if err != nil {
		t.Fatalf("schedule sim 1-core failed: %v", err)
	}
	b1, _ := json.Marshal(r1)

	runtime.GOMAXPROCS(8)
	r8, err := RunSimulation(req)
	if err != nil {
		t.Fatalf("schedule sim 8-core failed: %v", err)
	}
	b8, _ := json.Marshal(r8)

	if !bytes.Equal(b1, b8) {
		t.Fatalf("schedule determinism mismatch between GOMAXPROCS=1 and 8")
	}
	if len(r1.ScheduleTrace) != 30 {
		t.Fatalf("expected 30 trace days, got %d", len(r1.ScheduleTrace))
	}
	// Day 1 must be 70,000 VND; Day 16 must be 70,700 VND; Day 30 = 70,000 * 1.01^15 = 81,267.8 VND
	assertRelTol(t, "day1_price", r1.ScheduleTrace[0].PriceVND, 70000.0, 1e-6)
	assertRelTol(t, "day15_price", r1.ScheduleTrace[14].PriceVND, 70000.0, 1e-6)
	assertRelTol(t, "day16_price", r1.ScheduleTrace[15].PriceVND, 70700.0, 1e-6)
	assertRelTol(t, "day30_price", r1.ScheduleTrace[29].PriceVND, 70000.0*math.Pow(1.01, 15), 1e-6)
}

func TestScheduleValidationAndAdvisoryPostures(t *testing.T) {
	// Invalid schedule pushing daily price below -50%
	_, err := RunSimulation(SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 3000,
			ElasticitySamples:    []float64{-1.2},
		},
		PriceChangePct: 0.0,
		NSims:          100,
		Seed:           1,
		Schedule: []SchedulePhase{
			{Days: 15, StartChangePct: -40.0, DailyStepPct: -2.0}, // drops to -68% -> must reject!
		},
	})
	if err == nil {
		t.Fatalf("expected out-of-bounds schedule error, got nil")
	}

	// Stock constrained discount triggers STOCK_CONSTRAINED_HOLD_OR_RAISE
	lowStock := int64(200)
	respStock, err := RunSimulation(SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 3000,
			StockAvailable:       &lowStock,
			ElasticitySamples:    []float64{-1.3},
		},
		PriceChangePct: -20.0,
		NSims:          200,
		Seed:           1,
	})
	if err != nil {
		t.Fatalf("stock-constrained sim failed: %v", err)
	}
	if respStock.Advisory == nil || respStock.Advisory.VerdictCode != "STOCK_CONSTRAINED_HOLD_OR_RAISE" {
		t.Fatalf("expected STOCK_CONSTRAINED_HOLD_OR_RAISE, got %+v", respStock.Advisory)
	}

	// Low price variation warning triggers HIGH_UNCERTAINTY_AB_TEST
	respWarn, err := RunSimulation(SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 3000,
			ElasticitySamples:    []float64{-1.1, -1.2},
		},
		PriceChangePct: 5.0,
		NSims:          200,
		Seed:           1,
		BusinessContext: &BusinessContext{
			Warnings: []string{"low_price_variation"},
		},
	})
	if err != nil {
		t.Fatalf("warning sim failed: %v", err)
	}
	if respWarn.Advisory == nil || respWarn.Advisory.VerdictCode != "HIGH_UNCERTAINTY_AB_TEST" {
		t.Fatalf("expected HIGH_UNCERTAINTY_AB_TEST, got %+v", respWarn.Advisory)
	}
}

func TestSeasonalEventScheduleAndFairBaseline(t *testing.T) {
	// 60 normal days @ 0% (1.0x demand, 1.0x sensitivity) + 7 Tet peak days @ +15% (1.65x demand, 0.75x sensitivity)
	req := SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 3000, // 100 units/day baseline rate over 30 days
			ElasticitySamples:    []float64{-1.2, -1.4, -1.6},
		},
		PriceChangePct:     0.0,
		BaselinePeriodDays: 30,
		NSims:              1000,
		Seed:               42,
		Schedule: []SchedulePhase{
			{Days: 60, StartChangePct: 0.0, DemandMultiplier: 1.0, ElasticityMultiplier: 1.0, Label: "Normal days"},
			{Days: 7, StartChangePct: 15.0, DemandMultiplier: 1.65, ElasticityMultiplier: 0.75, Label: "Tet peak"},
		},
	}

	resp, err := RunSimulation(req)
	if err != nil {
		t.Fatalf("seasonal schedule sim failed: %v", err)
	}
	if len(resp.ScheduleTrace) != 67 {
		t.Fatalf("expected 67 trace days, got %d", len(resp.ScheduleTrace))
	}
	// Fair seasonal baseline qty = 60*100 + 7*100*1.65 = 7,155 units
	assertRelTol(t, "seasonal_base_qty", resp.Scenarios["base"].Qty, 7155.0, 1e-6)
	// Expected Day 61 qty = 100 * 1.65 * 1.15^(-1.4 * 0.75)
	wantDay61 := 100.0 * 1.65 * math.Pow(1.15, -1.4*0.75)
	assertRelTol(t, "tet_day61_qty", resp.ScheduleTrace[60].ExpectedQty, wantDay61, 1e-6)
}

func TestWaterfallCashFlowAndTornado(t *testing.T) {
	restock := int64(500)
	fixed := int64(10000000)
	req := SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      100000,
			UnitCostVND:          60000,
			BaselineQtyPerPeriod: 1000,
			FixedCostVND:         &fixed,
			ElasticitySamples:    []float64{-1.2, -1.4, -1.6},
		},
		PriceChangePct:      10.0,
		NSims:               500,
		Seed:                42,
		PlannedRestockUnits: &restock,
	}

	resp, err := RunSimulation(req)
	if err != nil {
		t.Fatalf("waterfall simulation failed: %v", err)
	}
	if len(resp.Waterfall) != 5 {
		t.Fatalf("expected 5 waterfall steps, got %d", len(resp.Waterfall))
	}
	rev := resp.Waterfall[0].AmountVND
	cogs := resp.Waterfall[1].AmountVND
	gp := resp.Waterfall[2].AmountVND
	fx := resp.Waterfall[3].AmountVND
	np := resp.Waterfall[4].AmountVND
	assertRelTol(t, "gross_profit_identity", rev+cogs, gp, 1e-6)
	assertRelTol(t, "net_profit_identity", gp+fx, np, 1e-6)
	assertRelTol(t, "expected_profit_matches_waterfall", np, resp.Scenarios["expected"].Profit, 1e-6)

	if resp.CashFlow == nil {
		t.Fatalf("expected CashFlow summary")
	}
	// Upfront restock cash outlay = 500 * 60,000 = 30,000,000 VND
	assertRelTol(t, "restock_cash_needed", resp.CashFlow.RestockCashNeededVND, 30000000.0, 1e-6)
	wantCashFlow := resp.Scenarios["expected"].Revenue - 30000000.0 - 10000000.0
	assertRelTol(t, "net_cash_flow", resp.CashFlow.NetCashFlowVND, wantCashFlow, 1e-6)

	if len(resp.SensitivityTornado) != 4 {
		t.Fatalf("expected 4 tornado sensitivity factors, got %d", len(resp.SensitivityTornado))
	}
	for i := 1; i < len(resp.SensitivityTornado); i++ {
		if resp.SensitivityTornado[i].SpreadVND > resp.SensitivityTornado[i-1].SpreadVND+1e-6 {
			t.Fatalf("tornado not sorted descending: %+v", resp.SensitivityTornado)
		}
	}
}

func TestClearanceGoalHorizonAndHoldingCost(t *testing.T) {
	fixed := int64(30579652)
	currStock := int64(1200)
	ageDays := 90
	holdPct := 3.0

	// 1. Default maximize_profit mode on a profitable -15% 14-day markdown -> balanced trade-off, not blind red reject
	respDefault, err := RunSimulation(SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      234000,
			UnitCostVND:          121000,
			BaselineQtyPerPeriod: 861,
			FixedCostVND:         &fixed,
			ElasticitySamples:    []float64{-1.45, -1.5412, -1.62},
		},
		PriceChangePct:     -15.0,
		HorizonDays:        14,
		BaselinePeriodDays: 30,
		NSims:              1000,
		Seed:               42,
	})
	if err != nil {
		t.Fatalf("14-day default clearance sim failed: %v", err)
	}
	assertRelTol(t, "14d_base_qty_scaled", respDefault.Scenarios["base"].Qty, 861.0*14.0/30.0, 1e-6)
	if respDefault.Clearance == nil || respDefault.Clearance.HorizonDays != 14 {
		t.Fatalf("expected 14-day clearance metrics, got %+v", respDefault.Clearance)
	}
	if !respDefault.Clearance.RecoversUnitCost || !respDefault.Clearance.RecoversTotalCost {
		t.Fatalf("expected full unit & total cost recovery at -15%%, got %+v", respDefault.Clearance)
	}
	if respDefault.Clearance.ExtraUnitsCleared <= 100 || respDefault.Clearance.ExtraCapitalFreedVND <= 12000000 {
		t.Fatalf("expected substantial extra units and capital freed, got %+v", respDefault.Clearance)
	}
	if respDefault.Advisory == nil || respDefault.Advisory.VerdictCode != "CLEARANCE_PROFITABLE_TRADE_OFF" {
		t.Fatalf("expected CLEARANCE_PROFITABLE_TRADE_OFF in default mode, got %+v", respDefault.Advisory)
	}

	// 2. Explicit clear_inventory goal with aging stock + holding cost -> CLEARANCE_WORTHWHILE
	respGoal, err := RunSimulation(SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      234000,
			UnitCostVND:          121000,
			BaselineQtyPerPeriod: 861,
			FixedCostVND:         &fixed,
			ElasticitySamples:    []float64{-1.45, -1.5412, -1.62},
		},
		PriceChangePct:         -15.0,
		HorizonDays:            14,
		BaselinePeriodDays:     30,
		DecisionGoal:           "clear_inventory",
		InventoryAgeDays:       &ageDays,
		HoldingCostPctPerMonth: &holdPct,
		BusinessContext: &BusinessContext{
			CurrentStockUnits: &currStock,
		},
		NSims: 1000,
		Seed:  42,
	})
	if err != nil {
		t.Fatalf("clear_inventory goal sim failed: %v", err)
	}
	if respGoal.Advisory == nil || respGoal.Advisory.VerdictCode != "CLEARANCE_WORTHWHILE" {
		t.Fatalf("expected CLEARANCE_WORTHWHILE, got %+v", respGoal.Advisory)
	}
	if respGoal.Clearance == nil || respGoal.Clearance.HoldingCostSavedVND <= 0 || respGoal.Clearance.AgeTier != "stale" {
		t.Fatalf("expected positive holding cost savings and stale age tier, got %+v", respGoal.Clearance)
	}
	if respGoal.Clearance.DaysSavedToClear == nil || *respGoal.Clearance.DaysSavedToClear <= 5.0 {
		t.Fatalf("expected >5 days saved to clear 1200 units, got %+v", respGoal.Clearance)
	}

	// 3. Deep below-cost cut (-50% -> 117,000 < 121,000) under clearance goal -> CLEARANCE_BELOW_COST
	respCutLoss, err := RunSimulation(SimulateRequest{
		Product: ProductSimulateInput{
			CurrentPriceVND:      234000,
			UnitCostVND:          121000,
			BaselineQtyPerPeriod: 861,
			ElasticitySamples:    []float64{-1.45, -1.5412, -1.62},
		},
		PriceChangePct:   -50.0,
		HorizonDays:      14,
		DecisionGoal:     "clear_inventory",
		InventoryAgeDays: &ageDays,
		NSims:            200,
		Seed:             42,
	})
	if err != nil {
		t.Fatalf("cut-loss clearance sim failed: %v", err)
	}
	if respCutLoss.Clearance == nil || respCutLoss.Clearance.RecoversUnitCost {
		t.Fatalf("expected RecoversUnitCost=false at -50%%, got %+v", respCutLoss.Clearance)
	}
	if respCutLoss.Advisory == nil || respCutLoss.Advisory.VerdictCode != "CLEARANCE_BELOW_COST" {
		t.Fatalf("expected CLEARANCE_BELOW_COST, got %+v", respCutLoss.Advisory)
	}
}
