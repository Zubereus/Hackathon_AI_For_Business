package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/whatif-ai/engine-go/internal/planning"
	"github.com/whatif-ai/engine-go/internal/sim"
)

func TestHealthEndpoint(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	healthHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}
	var res map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if res["status"] != "ok" {
		t.Fatalf("expected ok status, got %v", res["status"])
	}
}

func TestSimulateHandlerWithFixture(t *testing.T) {
	fixturePath := filepath.Join("..", "..", "..", "contracts", "fixtures", "elasticity_fixture.json")
	raw, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("failed reading fixture: %v", err)
	}
	var payload struct {
		Products []sim.ProductSimulateInput `json:"products"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		t.Fatalf("parse fixture error: %v", err)
	}

	simReq := sim.SimulateRequest{
		Product:        payload.Products[0],
		PriceChangePct: 10.0,
		NSims:          1000,
		Seed:           42,
	}
	body, _ := json.Marshal(simReq)

	req := httptest.NewRequest(http.MethodPost, "/api/simulate", bytes.NewReader(body))
	w := httptest.NewRecorder()
	simulateHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	var resp sim.SimulateResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response error: %v", err)
	}
	if len(resp.Scenarios) != 4 {
		t.Fatalf("expected 4 scenarios, got %d", len(resp.Scenarios))
	}
}

func TestSimulateValidationReturns422(t *testing.T) {
	badBody := []byte(`{"product":{"current_price_vnd":100000,"unit_cost_vnd":50000,"baseline_qty_per_period":100,"elasticity_samples":[]},"price_change_pct":10,"n_sims":100,"seed":1}`)
	req := httptest.NewRequest(http.MethodPost, "/api/simulate", bytes.NewReader(badBody))
	w := httptest.NewRecorder()
	simulateHandler(w, req)

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 Unprocessable Entity, got %d", w.Code)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestReverseProxyDoesNotDuplicateCORSHeaders(t *testing.T) {
	upstreamHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/nlq/parse" {
			t.Fatalf("expected stripped prefix path /nlq/parse, got %s", r.URL.Path)
		}
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		writeJSON(w, http.StatusOK, map[string]string{"ok": "1"})
	})

	targetURL, err := url.Parse("http://ml-py.local")
	if err != nil {
		t.Fatalf("invalid upstream url: %v", err)
	}
	mlProxy := createReverseProxy(targetURL)
	mlProxy.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		rec := httptest.NewRecorder()
		upstreamHandler.ServeHTTP(rec, r)
		return rec.Result(), nil
	})
	mux := http.NewServeMux()
	mux.HandleFunc("/api/nlq/", func(w http.ResponseWriter, r *http.Request) {
		mlProxy.ServeHTTP(w, r)
	})
	handler := corsMiddleware(mux)

	// 1. Proxied POST with browser Origin must return exactly ONE Access-Control-Allow-Origin header
	req := httptest.NewRequest(http.MethodPost, "/api/nlq/parse", bytes.NewReader([]byte(`{}`)))
	req.Header.Set("Origin", "http://localhost:5173")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}
	origins := w.Result().Header.Values("Access-Control-Allow-Origin")
	if len(origins) != 1 || origins[0] != "http://localhost:5173" {
		t.Fatalf("expected single Access-Control-Allow-Origin header, got %v", origins)
	}

	// 2. Preflight OPTIONS must succeed cleanly with 204 No Content and expose PATCH/DELETE
	preReq := httptest.NewRequest(http.MethodOptions, "/api/nlq/parse", nil)
	preReq.Header.Set("Origin", "http://localhost:5173")
	preW := httptest.NewRecorder()
	handler.ServeHTTP(preW, preReq)
	if preW.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for OPTIONS preflight, got %d", preW.Code)
	}
	allowMethods := preW.Result().Header.Get("Access-Control-Allow-Methods")
	if !strings.Contains(allowMethods, "PATCH") || !strings.Contains(allowMethods, "DELETE") {
		t.Fatalf("expected CORS Access-Control-Allow-Methods to allow PATCH & DELETE, got %q", allowMethods)
	}
}

func TestPlanningHandlersRoundTrip(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/planning/replenish", func(w http.ResponseWriter, r *http.Request) {
		decodeAndRun(w, r, planning.OptimizeReplenishment)
	})
	mux.HandleFunc("POST /api/planning/runway", func(w http.ResponseWriter, r *http.Request) {
		decodeAndRun(w, r, planning.SimulateCashRunway)
	})
	mux.HandleFunc("POST /api/planning/portfolio", func(w http.ResponseWriter, r *http.Request) {
		decodeAndRun(w, r, planning.OptimizePortfolio)
	})
	mux.HandleFunc("POST /api/planning/voi", func(w http.ResponseWriter, r *http.Request) {
		decodeAndRun(w, r, planning.AnalyzeValueOfInformation)
	})
	h := corsMiddleware(mux)

	sampleProd := sim.ProductSimulateInput{
		CurrentPriceVND:      200000,
		UnitCostVND:          100000,
		BaselineQtyPerPeriod: 300,
		ElasticitySamples:    []float64{-1.8, -1.5, -1.2},
	}

	assertPostOK := func(path string, payload any) []byte {
		t.Helper()
		raw, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal %s payload: %v", path, err)
		}
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
		req.Header.Set("Origin", "http://localhost:5173")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("%s expected 200 OK, got %d: %s", path, w.Code, w.Body.String())
		}
		return w.Body.Bytes()
	}

	repBytes := assertPostOK("/api/planning/replenish", planning.ReplenishRequest{
		Items: []planning.ReplenishSKUInput{{
			ProductID:              "P01",
			ProductName:            "SKU A",
			CurrentPriceVND:        200000,
			UnitCostVND:            100000,
			BaselineQtyPerPeriod:   300,
			StockAvailable:         60,
			LeadTimeDays:           7,
			LeadTimeStdDays:        2,
			ServiceLevelPct:        95,
			OrderingCostVND:        150000,
			HoldingCostPctPerMonth: 2,
		}},
	})
	var repResp planning.ReplenishResponse
	if err := json.Unmarshal(repBytes, &repResp); err != nil || len(repResp.Items) != 1 || repResp.Items[0].EOQUnits <= 0 {
		t.Fatalf("unexpected replenish response: %s (err=%v)", string(repBytes), err)
	}

	runBytes := assertPostOK("/api/planning/runway", planning.CashRunwayRequest{
		StartingCashVND:         50000000,
		MinCashBufferVND:        15000000,
		OpeningInventoryCostVND: 20000000,
		ExpectedDailyRevenueVND: 4000000,
		ExpectedDailyCOGSVND:    2000000,
		MonthlyFixedOpexVND:     12000000,
		DSODays:                 3,
		DPODays:                 10,
		HorizonDays:             30,
		NSims:                   500,
		Seed:                    42,
	})
	var runResp planning.CashRunwayResponse
	if err := json.Unmarshal(runBytes, &runResp); err != nil || len(runResp.Trajectory) != 30 {
		t.Fatalf("unexpected runway response: %s (err=%v)", string(runBytes), err)
	}

	portBytes := assertPostOK("/api/planning/portfolio", planning.PortfolioOptimizeRequest{
		Items: []planning.PortfolioSKUInput{{
			ProductID:   "P01",
			ProductName: "SKU A",
			Product:     sampleProd,
		}},
		TotalCapitalBudgetVND: 80000000,
		MaxPriceChangePct:     20,
		PriceStepPct:          10,
		HorizonDays:           30,
		NSims:                 400,
		Seed:                  42,
	})
	var portResp planning.PortfolioOptimizeResponse
	if err := json.Unmarshal(portBytes, &portResp); err != nil || len(portResp.Allocations) != 1 {
		t.Fatalf("unexpected portfolio response: %s (err=%v)", string(portBytes), err)
	}

	voiBytes := assertPostOK("/api/planning/voi", planning.VOIRequest{
		Product:           sampleProd,
		MaxPriceChangePct: 20,
		PriceStepPct:      10,
		HorizonDays:       30,
		ExperimentDays:    14,
		ExperimentCostVND: 1500000,
		Seed:              42,
	})
	var voiResp planning.VOIResponse
	if err := json.Unmarshal(voiBytes, &voiResp); err != nil || len(voiResp.ActionLandscape) == 0 {
		t.Fatalf("unexpected voi response: %s (err=%v)", string(voiBytes), err)
	}
}
