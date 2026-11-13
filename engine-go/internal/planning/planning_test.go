package planning

import (
	"math"
	"runtime"
	"testing"

	"github.com/whatif-ai/engine-go/internal/sim"
)

func ptrFloat(v float64) *float64 { return &v }
func ptrInt64(v int64) *int64     { return &v }

func TestNormalQuantileAccuracy(t *testing.T) {
	cases := []struct {
		p    float64
		want float64
	}{
		{0.50, 0.0},
		{0.8413447, 1.0},
		{0.95, 1.6448536},
		{0.975, 1.9599640},
		{0.99, 2.3263479},
	}
	for _, tc := range cases {
		got, err := NormalQuantile(tc.p)
		if err != nil {
			t.Fatalf("NormalQuantile(%v) unexpected err: %v", tc.p, err)
		}
		if math.Abs(got-tc.want) > 1e-4 {
			t.Errorf("NormalQuantile(%v) = %.6f, want %.6f", tc.p, got, tc.want)
		}
	}
	if _, err := NormalQuantile(1.0); err == nil {
		t.Error("expected error for p=1.0")
	}
}

func TestOptimizeReplenishmentClosedFormAndBudget(t *testing.T) {
	// Closed-form check:
	// muD = 10/day -> annual D = 3650
	// Ordering cost S = 200,000 VND; unit cost = 100,000 VND; holding = 2%/month => 24%/year => H = 24,000 VND/unit/yr
	// EOQ = sqrt(2 * 3650 * 200000 / 24000) = sqrt(60833.33) ~= 246.64 -> 247 units
	// L = 5 days, sigmaL = 0, sigmaD = 4, service = 95% (z = 1.64485)
	// Safety stock = ceil(1.64485 * sqrt(5) * 4) = ceil(14.71) = 15
	// ROP = 50 + 15 = 65
	req := ReplenishRequest{
		Items: []ReplenishSKUInput{
			{
				ProductID:              "SKU-A",
				ProductName:            "Áo Khoác",
				CurrentPriceVND:        250000,
				UnitCostVND:            100000,
				BaselineQtyPerPeriod:   300,
				DailyMeanQty:           ptrFloat(10.0),
				DailyStdQty:            ptrFloat(4.0),
				StockAvailable:         20, // <= ROP 65 => must order!
				LeadTimeDays:           5,
				LeadTimeStdDays:        0,
				ServiceLevelPct:        95.0,
				OrderingCostVND:        200000,
				HoldingCostPctPerMonth: 2.0,
				MOQUnits:               10,
			},
			{
				ProductID:              "SKU-B",
				ProductName:            "Khăn Len",
				CurrentPriceVND:        110000,
				UnitCostVND:            100000, // thinner unit margin (10k vs 150k)
				BaselineQtyPerPeriod:   300,
				DailyMeanQty:           ptrFloat(10.0),
				DailyStdQty:            ptrFloat(4.0),
				StockAvailable:         20,
				LeadTimeDays:           5,
				LeadTimeStdDays:        0,
				ServiceLevelPct:        95.0,
				OrderingCostVND:        200000,
				HoldingCostPctPerMonth: 2.0,
				MOQUnits:               10,
			},
		},
	}

	resp, err := OptimizeReplenishment(req)
	if err != nil {
		t.Fatalf("OptimizeReplenishment err: %v", err)
	}
	a := resp.Items[0]
	if a.EOQUnits != 247 {
		t.Errorf("SKU-A EOQ = %d, want 247", a.EOQUnits)
	}
	if a.SafetyStockUnits != 15 {
		t.Errorf("SKU-A SafetyStock = %d, want 15", a.SafetyStockUnits)
	}
	if a.ReorderPointUnits != 65 {
		t.Errorf("SKU-A ROP = %d, want 65", a.ReorderPointUnits)
	}
	if a.OrderStatus != "order_now" {
		t.Errorf("SKU-A OrderStatus = %s, want order_now", a.OrderStatus)
	}
	if a.UncappedOrderUnits != 292 { // (65 + 247) - 20 = 292
		t.Errorf("SKU-A UncappedOrderUnits = %d, want 292", a.UncappedOrderUnits)
	}

	// Now impose a tight capital budget (30M VND -> buys max 300 units @ 100k).
	// High-margin SKU-A must get funded ahead of low-margin SKU-B.
	req.CapitalBudgetVND = ptrInt64(30000000)
	constrained, err := OptimizeReplenishment(req)
	if err != nil {
		t.Fatalf("Constrained replenish err: %v", err)
	}
	if !constrained.CapitalBudgetBinding {
		t.Error("expected CapitalBudgetBinding = true")
	}
	if constrained.TotalAllocatedCostVND > 30000000 {
		t.Errorf("allocated cost %d exceeded budget 30M", constrained.TotalAllocatedCostVND)
	}
	if constrained.Items[0].RecommendedOrderUnits != 292 {
		t.Errorf("high-margin SKU-A should get full 292 units, got %d", constrained.Items[0].RecommendedOrderUnits)
	}
	if !constrained.Items[1].DeferredByBudget || constrained.Items[1].RecommendedOrderUnits > 8 {
		t.Errorf("low-margin SKU-B should be deferred/capped to remaining 8 units (or 0 if < MOQ), got %d (deferred=%v)",
			constrained.Items[1].RecommendedOrderUnits, constrained.Items[1].DeferredByBudget)
	}
}

func TestCashRunwayIdentitiesShortageAndDeterminism(t *testing.T) {
	req := CashRunwayRequest{
		StartingCashVND:         20000000,
		MinCashBufferVND:        10000000,
		OpeningInventoryCostVND: 60000000,
		ExpectedDailyRevenueVND: 5000000,
		ExpectedDailyCOGSVND:    3000000,  // DIO = 60M / 3M = 20 days
		MonthlyFixedOpexVND:     90000000, // 3M/day -> daily net op cash = -1M/day
		DSODays:                 5,
		DPODays:                 10, // CCC = 20 + 5 - 10 = 15 days
		PlannedRestockCashVND:   5000000,
		RestockOutflowDay:       1,
		HorizonDays:             30,
		NSims:                   1000,
		Seed:                    77,
	}

	prevProcs := runtime.GOMAXPROCS(1)
	defer runtime.GOMAXPROCS(prevProcs)
	r1, err := SimulateCashRunway(req)
	if err != nil {
		t.Fatalf("SimulateCashRunway err: %v", err)
	}

	runtime.GOMAXPROCS(4)
	r2, err := SimulateCashRunway(req)
	if err != nil {
		t.Fatalf("SimulateCashRunway multi-proc err: %v", err)
	}

	if math.Abs(r1.Ratios.DIODays-20.0) > 1e-6 {
		t.Errorf("DIO = %.2f, want 20.0", r1.Ratios.DIODays)
	}
	if math.Abs(r1.Ratios.CashConversionCycleDays-15.0) > 1e-6 {
		t.Errorf("CCC = %.2f, want 15.0", r1.Ratios.CashConversionCycleDays)
	}
	if r1.ShortageAlertLevel != "critical" {
		t.Errorf("expected critical cash shortage alert when burning 1M/day with 5M restock from 20M starting cash, got %s", r1.ShortageAlertLevel)
	}
	if r1.EndingP50CashVND != r2.EndingP50CashVND || r1.ProbCashShortage != r2.ProbCashShortage {
		t.Errorf("determinism mismatch across GOMAXPROCS: r1=%v vs r2=%v", r1.EndingP50CashVND, r2.EndingP50CashVND)
	}
}

func TestOptimizePortfolioRespectsConstraints(t *testing.T) {
	items := []PortfolioSKUInput{
		{
			ProductID:   "P1",
			ProductName: "Áo Thun",
			Product: sim.ProductSimulateInput{
				CurrentPriceVND:      200000,
				UnitCostVND:          100000,
				BaselineQtyPerPeriod: 120,
				StockAvailable:       ptrInt64(100),
				FixedCostVND:         ptrInt64(1000000),
				ElasticitySamples:    []float64{-1.8, -1.6, -1.7, -1.5, -1.9},
			},
			AllowRestockUnits: 40,
		},
		{
			ProductID:   "P2",
			ProductName: "Quần Jean",
			Product: sim.ProductSimulateInput{
				CurrentPriceVND:      450000,
				UnitCostVND:          220000,
				BaselineQtyPerPeriod: 60,
				StockAvailable:       ptrInt64(50),
				FixedCostVND:         ptrInt64(1500000),
				ElasticitySamples:    []float64{-0.9, -0.8, -1.0, -0.85, -0.95},
			},
			AllowRestockUnits: 20,
		},
	}

	budget := int64(7000000) // Tight capital budget forcing selective restock/allocation
	whMax := int64(180)
	resp, err := OptimizePortfolio(PortfolioOptimizeRequest{
		Items:                 items,
		TotalCapitalBudgetVND: budget,
		WarehouseMaxUnits:     &whMax,
		MaxPriceChangePct:     20.0,
		PriceStepPct:          10.0,
		RiskAversionLambda:    0.25,
		HorizonDays:           30,
		RespectStock:          true,
		NSims:                 500,
		Seed:                  42,
	})
	if err != nil {
		t.Fatalf("OptimizePortfolio err: %v", err)
	}
	if len(resp.Allocations) != 2 {
		t.Fatalf("expected 2 allocations, got %d", len(resp.Allocations))
	}
	if resp.TotalCapitalUsedVND > budget {
		t.Errorf("portfolio capital %d exceeded budget %d", resp.TotalCapitalUsedVND, budget)
	}
	if resp.TotalPlannedUnits > whMax {
		t.Errorf("portfolio planned units %d exceeded warehouse %d", resp.TotalPlannedUnits, whMax)
	}
	if resp.OptimizedExpectedProfitVND+1e-3 < resp.BaseTotalProfitVND {
		t.Errorf("optimized profit %.0f should at least match baseline %.0f when baseline fits budget", resp.OptimizedExpectedProfitVND, resp.BaseTotalProfitVND)
	}
}

func TestValueOfInformationInvariants(t *testing.T) {
	// 1. Zero parameter uncertainty => EVPI == 0, EVSI == 0, low_uncertainty
	zeroVarResp, err := AnalyzeValueOfInformation(VOIRequest{
		Product: sim.ProductSimulateInput{
			CurrentPriceVND:      200000,
			UnitCostVND:          100000,
			BaselineQtyPerPeriod: 150,
			ElasticitySamples:    []float64{-1.4, -1.4, -1.4, -1.4},
		},
		MaxPriceChangePct: 20,
		PriceStepPct:      10,
		HorizonDays:       30,
		ExperimentDays:    14,
		ExperimentCostVND: 500000,
		Seed:              42,
	})
	if err != nil {
		t.Fatalf("VOI zero-var err: %v", err)
	}
	if zeroVarResp.EVPIVND != 0 || zeroVarResp.EVSIVND != 0 {
		t.Errorf("zero uncertainty must yield EVPI=0, EVSI=0; got %.2f, %.2f", zeroVarResp.EVPIVND, zeroVarResp.EVSIVND)
	}
	if zeroVarResp.Verdict != "low_uncertainty" {
		t.Errorf("expected low_uncertainty verdict, got %s", zeroVarResp.Verdict)
	}

	// 2. High uncertainty across inelastic vs elastic regimes => EVPI >= EVSI >= 0
	mixedResp, err := AnalyzeValueOfInformation(VOIRequest{
		Product: sim.ProductSimulateInput{
			CurrentPriceVND:      250000,
			UnitCostVND:          110000,
			BaselineQtyPerPeriod: 300,
			ElasticitySamples:    []float64{-0.4, -0.5, -0.6, -2.5, -2.8, -3.0},
		},
		MaxPriceChangePct: 25,
		PriceStepPct:      5,
		RespectStock:      false,
		HorizonDays:       30,
		ExperimentDays:    21,
		ExperimentCostVND: 100000,
		Seed:              99,
	})
	if err != nil {
		t.Fatalf("VOI mixed err: %v", err)
	}
	if mixedResp.EVPIVND <= 0 {
		t.Errorf("expected EVPI > 0 under split elasticity uncertainty, got %.2f", mixedResp.EVPIVND)
	}
	if mixedResp.EVSIVND < 0 || mixedResp.EVSIVND > mixedResp.EVPIVND+1e-6 {
		t.Errorf("expected 0 <= EVSI (%.2f) <= EVPI (%.2f)", mixedResp.EVSIVND, mixedResp.EVPIVND)
	}
	if math.Abs(mixedResp.ENGSVND-(mixedResp.EVSIVND-100000)) > 1.5 {
		t.Errorf("ENGS (%.2f) mismatch vs EVSI - cost (%.2f)", mixedResp.ENGSVND, mixedResp.EVSIVND-100000)
	}
}
