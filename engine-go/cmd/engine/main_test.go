package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

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

