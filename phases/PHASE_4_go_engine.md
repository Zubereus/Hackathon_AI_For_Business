# PHASE 4 — Go engine: simulate + optimize (+ gateway)
Owner: **B** · Sprint: Wed–Thu (8h) · Depends on: P0 only (works from fixtures) · Unblocks: P5 wiring, P7

## Goal
A stateless, fast, deterministic simulation and optimization engine in Go that matches the formulas in `docs/ARCHITECTURE.md`.

## Allowed paths
`engine-go/**`, `contracts/golden/**` (create golden cases here), `docs/ENGINE.md`

## Deliverables
1. `internal/sim/simulate.go` — Monte Carlo: per simulation draw `e` from `elasticity_samples`, optional residual noise, apply stock cap, compute profit. Worker pool (goroutines) with per-worker seeded RNG derived from `seed` so results are reproducible regardless of core count.
2. Four scenarios: base, optimistic (10th percentile of price sensitivity), expected (median), pessimistic (90th), plus profit histogram, p5/p50/p95, `break_even_elasticity`.
3. `internal/optimize/grid.go` — grid over price changes (default -30%..+30% step 1%), Monte Carlo per candidate, constraints (max price change, min margin %, budget, stock), objectives `max_expected_profit` and `hit_target` (maximise P(profit >= target)); returns ranked list with `feasible` and `violated`.
4. HTTP handlers `/api/simulate`, `/api/optimize` + input validation (reject price change outside [-50%, +100%], n_sims > 200000, empty samples).
5. `contracts/golden/*.json` — golden cases from `docs/ARCHITECTURE.md` plus 3 edge cases (stock binding, cost >= price, single elasticity sample). Table-driven Go tests load them.
6. Benchmark: `go test -bench` showing time for 100 price points x 5,000 sims.

## Rules
- MUST: the engine holds no state and reads no files except golden tests. All inputs come in the request.
- MUST: same request + seed => byte-identical response, on 1 or 16 cores.
- MUST: never return NaN/Inf; return a 422 with a clear message instead.
- MUST NOT: change contract field names or add required fields. Extra fields allowed only if optional.
- MUST NOT: import ML or LLM code. Go does math only.

## Acceptance tests
- Golden: P0=100000, cost=60000, Q0=10000, P1=110000 -> e=-0.5 gives Q=9534.6, profit 476.7M; e=-1.0 gives 9090.9, 454.5M; e=-2.0 gives 8264.5, 413.2M; break-even e=-2.341 (tolerance 0.1%).
- Determinism test passes with `GOMAXPROCS=1` and `GOMAXPROCS=8`.
- `go vet ./... && go test ./... -race` green. Benchmark prints; 100 x 5,000 sims completes in under 2 seconds on a laptop (report the real figure).
- `curl` with `contracts/fixtures/elasticity_fixture.json` product 1 returns four scenarios in the contract shape.

## Prompt for the agent
```
Read /AGENTS.md, /docs/ARCHITECTURE.md (formulas + golden test) and /phases/PHASE_4_go_engine.md. Implement PHASE 4 in /engine-go (Go 1.22+).
Plan first. Build internal/sim (Monte Carlo with seeded per-worker RNG so output is identical for any GOMAXPROCS), then internal/optimize (price grid + constraints + two objectives),
then the HTTP handlers with strict validation (422 on NaN/out-of-range). Write table-driven tests from contracts/golden/*.json including the proposal's golden numbers,
a determinism test under GOMAXPROCS=1 and 8, and a benchmark. Never read files at runtime, never hold state, never change contract field names.
Run go vet and go test -race, paste real output and benchmark numbers, append to the status log.
```

## Status log
- **2026-11-10 (Phase 4 completed)**:
  - Implemented `engine-go/internal/sim` (`types.go`, `simulate.go` with stateless `splitmix64` per-index RNG, Box-Muller noise, 20-bin histogram, break-even elasticity, strict non-finite guard), `engine-go/internal/optimize` (`grid.go` parallel grid search with `max_expected_profit`/`hit_target` and margin/budget/stock constraints), and `engine-go/cmd/engine/main.go` (HTTP handlers, 422 validation errors, CORS for `http://localhost:5173`, reverse proxy to `ml-py`).
  - Added golden test cases in `contracts/golden/` (`golden_proposal.json`, `golden_edge_stock_binding.json`, `golden_edge_cost_gte_price.json`, `golden_edge_single_sample.json`; corrected `golden_edge_single_sample.json` break-even constant `ln(0.8)/ln(1.1) = -2.3412`).
  - Documented architecture and benchmarks in `docs/ENGINE.md`.
  - Verification outputs (`go1.27.3 windows/amd64`):
    - `go vet ./...`: exit code 0 (clean).
    - `go test -v -race ./...`: PASS across all 3 packages (`cmd/engine` 2.471s, `internal/optimize` 1.478s, `internal/sim` 1.568s), including `GOMAXPROCS=1` vs `8` byte-identical determinism and proposal golden tolerance <= 0.1%.
    - `go test -bench=BenchmarkOptimizeGrid_100x5000 -benchmem -run=^$ ./internal/optimize/`: `BenchmarkOptimizeGrid_100x5000-16   73   38776681 ns/op   8958745 B/op   4592 allocs/op` (~38.8 ms for 101 candidates x 5,000 sims).
    - Live HTTP probe (`POST http://127.0.0.1:18080/api/simulate` on `elasticity_fixture.json` `P01`): returned 4 scenarios (`base`, `optimistic`, `expected`, `pessimistic`), 20 histogram bins, `p5`/`p50`/`p95`, and `break_even_elasticity = -2.4248`.
    - New dependencies added: none (Go standard library only).
