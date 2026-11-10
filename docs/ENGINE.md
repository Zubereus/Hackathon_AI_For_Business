# Go Simulation & Optimization Engine (`engine-go`)

`engine-go` is the stateless, deterministic computation core and public HTTP API gateway (`:8080`) for **What-If AI**. It executes CPU-bound Monte Carlo counterfactual simulations and constrained grid optimizations while proxying Python ML endpoints (`/api/ingest/*`, `/api/elasticity/*`, `/api/nlq/*`, `/api/backtest`) to `ml-py` (`:8000`).

## Architecture & Guarantees
1. **Stateless & File-Free at Runtime**: `engine-go` stores zero datasets or sessions in memory or disk (excluding test fixtures/golden JSON loaded strictly during `go test`). Every simulation/optimization request carries all required product parameters and bootstrap elasticity samples.
2. **Core-Count-Independent Determinism**: Both [`RunSimulationRaw`](file:///c:/Users/ASUS/AI_Project/Hackathon_AI_For_Business/engine-go/internal/sim/simulate.go) and [`RunGridOptimizeWithStep`](file:///c:/Users/ASUS/AI_Project/Hackathon_AI_For_Business/engine-go/internal/optimize/grid.go) derive per-index random draws via stateless 64-bit `splitmix64` mixing (`baseSeed ^ (uint64(i+1) * 0x9e3779b97f4a7c15)`). Consequently, responses under `GOMAXPROCS=1` and `GOMAXPROCS=8` (or 16+) are **byte-for-byte identical**.
3. **Zero NaN / Inf Policy**: Every boundary condition (`n_sims`, `price_change_pct`, `elasticity_samples`, `sigma_resid`, margin `<= 0` in `ComputeBreakEvenElasticity`) is guarded. Invalid requests return HTTP `422 Unprocessable Entity` with descriptive messages; undefined break-even elasticity returns `null` rather than `NaN`/`Inf`.
4. **Zero LLM Dependencies**: Go imports only standard library packages (`math`, `sync`, `runtime`, `net/http`, etc.).

## Mathematical Specification (`docs/ARCHITECTURE.md`)
For baseline price $P_0$, baseline period demand $Q_0$, unit cost $C$, optional fixed cost $F$, optional stock ceiling $S$, target price $P_1 = P_0 \cdot (1 + \Delta p / 100)$, and a bootstrap draw $e_i$ from `elasticity_samples`:
- Iso-elastic quantity demand: $Q_{1,i} = Q_0 \cdot (P_1 / P_0)^{e_i}$
- Optional Box-Muller log-normal residual noise ($\sigma_{\text{resid}} > 0$): $Q_{1,i} \leftarrow Q_{1,i} \cdot \exp(\sigma_{\text{resid}} \cdot Z_i)$
- Inventory cap (when `stock_available` is provided): $Q_{1,\text{sold},i} = \min(Q_{1,i}, S)$
- Period profit: $\Pi_i = (P_1 - C) \cdot Q_{1,\text{sold},i} - F$
- Break-even elasticity: $e^* = \frac{\ln((P_0 - C)/(P_1 - C))}{\ln(P_1 / P_0)}$ when $P_1 \neq P_0$, $P_0 > C$, and $P_1 > C$; `null` otherwise.
- Scenario cards:
  - `base`: $P_0, Q_0$ (clamped if stock cap applies)
  - `optimistic` / `pessimistic`: 10th and 90th percentiles of price sensitivity ($|e|$ sorted ascending), ordered by scenario profit (`optimistic >= expected >= pessimistic`).
  - `expected`: median elasticity ($p_{50}$).

## HTTP API Routes (`engine-go/cmd/engine/main.go`)
- `GET /health`, `GET /api/health` → `{"status":"ok"}`
- `POST /api/simulate` → Monte Carlo scenario & profit distribution
- `POST /api/optimize` → Parallel grid search (`-30%..+30%` default or `[-max_price_change_pct, +max_price_change_pct]`, step `1%`) for `max_expected_profit` or `hit_target` under `min_margin_pct`, `budget_vnd`, and `respect_stock`
- `ANY /api/ingest/*`, `/api/elasticity/*`, `/api/nlq/*`, `/api/backtest` → Reverse proxy to `ML_URL` (default `http://localhost:8000`)

## Verification & Benchmarks
- **Go version**: `go1.27.3 windows/amd64` on AMD Ryzen 9 8945HS w/ Radeon 780M Graphics
- **Static analysis**: `go vet ./...` — 0 issues
- **Unit, golden, determinism, and race tests**: `go test -v -race ./...` — **all packages PASS**:
  - `github.com/whatif-ai/engine-go/cmd/engine` (`2.471s`): `TestHealthEndpoint`, `TestSimulateHandlerWithFixture`, `TestSimulateValidationReturns422`
  - `github.com/whatif-ai/engine-go/internal/optimize` (`1.478s`): `TestGridOptimizeMaxExpectedProfit`, `TestGridOptimizeConstraintsAndHitTarget`
  - `github.com/whatif-ai/engine-go/internal/sim` (`1.568s`): `TestProposalGoldenCases` (`e=-0.5`, `-1.0`, `-2.0` vs proposal table within 0.1%), `TestEdgeGoldenCases` (`edge_stock_binding`, `edge_cost_gte_price`, `edge_single_sample_with_fixed_cost` + `p5==p50==p95`), `TestDeterminismAcrossGOMAXPROCS` (`GOMAXPROCS=1` vs `8` byte-identical JSON), `TestValidationGuardrails`, `TestFixtureIntegration`
- **Performance Benchmark (`BenchmarkOptimizeGrid_100x5000`)**:
  - Workload: 101 price candidates (`-50%..+50%` step `1%`) x `5,000` Monte Carlo draws each (`505,000` total simulations per call)
  - Command: `go test -bench=BenchmarkOptimizeGrid_100x5000 -benchmem -run=^$ ./internal/optimize/`
  - Measured output: `73 iterations`, **`38,776,681 ns/op` (`38.8 ms` per full optimization)**, `8,958,745 B/op`, `4,592 allocs/op` (< 2.0s budget by ~51x).

