// Package main implements the stateless Go simulation engine and API gateway for What-If AI.
// It serves CPU-bound Monte Carlo simulations/optimizations and proxies ML endpoints to ml-py.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/whatif-ai/engine-go/internal/optimize"
	"github.com/whatif-ai/engine-go/internal/sim"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("error encoding JSON response: %v", err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func simulateHandler(w http.ResponseWriter, r *http.Request) {
	var req sim.SimulateRequest
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error": fmt.Sprintf("Invalid JSON payload: %v", err),
		})
		return
	}

	resp, err := sim.RunSimulation(req)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

func optimizeHandler(w http.ResponseWriter, r *http.Request) {
	var req sim.OptimizeRequest
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error": fmt.Sprintf("Invalid JSON payload: %v", err),
		})
		return
	}

	resp, err := optimize.RunGridOptimize(req)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error": err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// createReverseProxy forwards /api/{prefix}/* to mlURL/{prefix}/*
func createReverseProxy(targetURL *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		if strings.HasPrefix(req.URL.Path, "/api/") {
			req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api")
		}
		req.Host = targetURL.Host
	}
	return proxy
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" || origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			allowOrigin := "http://localhost:5173"
			if origin != "" {
				allowOrigin = origin
			}
			w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mlURLStr := os.Getenv("ML_URL")
	if mlURLStr == "" {
		mlURLStr = "http://localhost:8000"
	}

	mlTarget, err := url.Parse(mlURLStr)
	if err != nil {
		log.Fatalf("Invalid ML_URL: %v", err)
	}

	mlProxy := createReverseProxy(mlTarget)

	mux := http.NewServeMux()

	// Health probes
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("GET /api/health", healthHandler)

	// Simulation & optimization endpoints (stateless, CPU-bound math)
	mux.HandleFunc("POST /api/simulate", simulateHandler)
	mux.HandleFunc("POST /api/optimize", optimizeHandler)

	// Reverse proxy routes to ml-py service
	mux.HandleFunc("/api/ingest/", func(w http.ResponseWriter, r *http.Request) {
		mlProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/api/elasticity/", func(w http.ResponseWriter, r *http.Request) {
		mlProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/api/nlq/", func(w http.ResponseWriter, r *http.Request) {
		mlProxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/api/backtest", func(w http.ResponseWriter, r *http.Request) {
		mlProxy.ServeHTTP(w, r)
	})

	serverAddr := fmt.Sprintf(":%s", port)
	log.Printf("What-If AI Go Engine & Gateway listening on %s (proxying ML to %s)", serverAddr, mlURLStr)
	if err := http.ListenAndServe(serverAddr, corsMiddleware(mux)); err != nil {
		log.Fatalf("Server stopped: %v", err)
	}
}
