# What-If AI — System Architecture, End-to-End Pipeline & API Contracts

> Technical specification for engineering & audit review. Describes the three-tier architecture, complete end-user flow, internal execution sequence of the What-If bot (NLQ parsing → econometrics → parallel Go Monte Carlo → Reverse Grid Optimizer → fail-closed explanation verification), mathematical formulas, privacy boundaries, and test contracts.

---

## 1. High-Level Topology & Design Principle

```text
┌──────────────────────────────────┐
│   React + Vite Frontend (:5173)  │  • Display only (VI | EN, formatVND, charts)
│   web/ (Nginx in Docker)         │  • ZERO business calculation, ZERO raw CSV in localStorage
└────────────────┬─────────────────┘
                 │ HTTP/JSON (VITE_API_BASE, default http://localhost:8080)
                 ▼
┌──────────────────────────────────┐
│  Go Engine & API Gateway (:8080) │  • Single public API gateway + CORS origin guard
│  engine-go/cmd/engine/main.go    │  • Stateless CPU-bound Monte Carlo (goroutines + splitmix64)
│  • POST /api/simulate            │  • Reverse What-If grid search (/api/optimize)
│  • POST /api/optimize            │  • Proxies /api/{ingest,elasticity,nlq,backtest} → ml-py
└────────────────┬─────────────────┘
                 │ HTTP/JSON (ML_URL=http://ml-py:8000 in Docker, :8000 locally)
                 ▼
┌──────────────────────────────────┐
│   Python ML & NLP Service (:8000)│  • CSV profiling, cleanup & Hungarian column mapping
│   ml-py/app/main.py (FastAPI)    │  • Spec-C Poisson GLM elasticity + week-block bootstrap
│                                  │  • VN/EN NLQ DecisionSpec parser + zero-hallucination explainer
└──────────────────────────────────┘
```

### Core Architectural Invariants
1. **Zero LLM Math**: The LLM never computes revenue, profit, margins, break-even points, or probabilities. Every numeric metric is computed deterministically in `ml-py` (`numpy`, `pandas`, `scipy`, `statsmodels`) and `engine-go` (`internal/sim`, `internal/optimize`).
2. **Stateless Go Engine**: `engine-go` stores zero user or sales datasets in memory or disk; every `/api/simulate` and `/api/optimize` request is self-contained and reproducible from `seed`.
3. **Zero Raw Row Exposure**: Uploaded CSV rows stay exclusively in backend session memory (`_UPLOAD_CACHE` / `_COMMITTED_DATASETS` in `ml-py/app/main.py`) and never reach `localStorage` or LLM prompts (LLM column mapping sees only column headers + ≤ 5 masked samples; NLQ sees only `product_id`, `product_name`, and the user's question).
4. **Offline-First Resilience**: All NLP parsing, Hungarian column mapping, econometrics, Monte Carlo, and narrative explanations operate 100% offline with zero `LLM_API_KEY`. The frontend also supports precomputed Go snapshots (`precomputed_fixtures.json`) if the backend is offline.

---

## 2. Full End-to-End Pipeline (End User → What-If Bot → Engine → UI)

### Stage A — Initial Workspace Boot & Data Ingestion
1. **Immediate Boot (`web/src/App.tsx`)**:
   - Opens directly into the ready-to-use `Simulate Price Plan` workspace (`whatif`) with `fashion_shop_12` preloaded (`POST /api/elasticity/fit` → `POST /api/simulate` → `POST /api/nlq/explain`, with graceful offline snapshot fallback).
2. **Optional Custom Store CSV Upload (`web/src/screens/UploadScreen.tsx` → `MappingScreen.tsx`)**:
   - **Step A1 (`POST /api/ingest/profile`)**: Reads CSV via `pd.read_csv(..., dtype=str)` to preserve Vietnamese thousand-dot prices (`"104.000"`). Profiles column dtype guesses, null %, distinct counts, and up to 5 masked sample strings.
   - **Step A2 (`POST /api/ingest/map`)**: Uses `ml-py/app/mapping/assign.py` (`resolve_column_mappings`) combining lexical similarity + value-shape scores via `scipy.optimize.linear_sum_assignment` (Hungarian algorithm):
     - `score >= 0.55` → auto-mapped
     - `0.35 <= score < 0.55` → flagged `"please confirm"`
     - `score < 0.35` → unmapped (`Ignore` or keep as `extra_*` covariate)
     - User confirms in `MappingScreen.tsx` (enforcing required fields: `date`, `quantity`, `price`, and `product_id` or `product_name`).
   - **Step A3 (`POST /api/ingest/commit`)**: Applies `IngestCommitOptions` (`price_unit`: `VND` | `K_VND`, `date_format`, `number_locale`: `vi_VN` | `en_US`, fallback `margin_pct`), filters corrupt/negative rows, aggregates to daily canonical grain, and stores the clean DataFrame under `dataset_id` in session memory.

#### Canonical Sales Schema
| Field | Required | Type | Notes |
|---|---|---|---|
| `date` | Yes | ISO Date | Daily grain after aggregation |
| `quantity` | Yes | int >= 0 | Units sold per day |
| `price` | Yes | int VND | Realized selling price after discounts |
| `product_id` or `product_name` | Yes (≥1) | string | Slugified from `product_name` if `product_id` absent |
| `unit_cost` | No | int VND | Estimated from `margin_pct` assumption if missing (flagged) |
| `category` | No | string | Optional product grouping |
| `stock` | No | int | End-of-day stock; `0` flags censored demand |
| `promo` | No | 0 / 1 | Promotion indicator covariate |
| `extra_*` | No | numeric | Unmapped numeric columns retained as optional covariates |

---

### Stage B — Econometric Elasticity Fitting (`POST /api/elasticity/fit`)
Implemented in `ml-py/app/elasticity/fit.py` (`fit_product_elasticity`) and `ml-py/app/features/build.py` (`build_econometric_design_matrix`):
1. **Calendar & Confounder Controls (Spec-C)**: Builds Vietnamese retail covariates using `ml-py/app/data/calendar_vn.py` (wrapping `data/synthetic/vn_calendar.py`):
   - `ln(price)` (target coefficient $\beta_1$ = price elasticity)
   - `promo`, weekday indicators, payday windows, double-day peaks (`9.9`, `10.10`, `11.11`, `12.12`), and Tết (`pre_far`, `pre_near`, `day`, `post`) + holiday windows.
2. **Model Estimation**: Fits Poisson regression with log link $\mathbb{E}[\text{Quantity}] = \exp(X \beta)$ via `statsmodels` GLM or regularized `poisson_irls_fit` (`ridge = 1e-6`).
3. **Uncertainty via Week-Block Bootstrap (`DEFAULT_N_BOOTSTRAP = 300`)**: Resamples whole calendar weeks with replacement to preserve intra-week demand autocorrelation, generating `elasticity_samples[]` (300 empirical draws) plus residual spread `sigma_resid`.
4. **Honest Reliability Guardrails (`warnings[]`)**:
   - `low_price_variation`: $\text{std}(\ln(\text{price})) < 0.03$
   - `not_significant`: 90% bootstrap confidence interval includes `0`
   - `few_observations`: fewer than `120` usable daily rows
   - `positive_elasticity`: median point estimate $> 0$
5. **Business Context Snapshot (`BusinessContext`)**: Computes `base_margin_pct`, recent `demand_trend_pct`, `stock_days_cover`, and `stock_available` directly from historical data.

---

### Stage C — What-If Financial AI Agent Flow (Step-by-Step)

When an end user asks a natural-language question (e.g., *"60 ngày nữa là Tết, tôi muốn vào 7 ngày từ 60 ngày nữa tăng giá sản phẩm lên 15% thì có được không?"* or *"15 ngày đầu giảm 30%, 15 ngày sau mỗi ngày tăng 1% thì sao?"*), the frontend (`web/src/App.tsx`) runs a **4-step Agent Tool Chain**:

#### Step 1: Semantic & Event-Aware Planning (`POST /api/nlq/parse` → `ml-py/app/llm/parse.py`)
1. Sends **ONLY** `{ question, catalog: [{ product_id, product_name }], active_product_id? }`.
2. **Stopword-safe SKU Resolution**: Matches explicit product ID/name while excluding generic nouns (`"sản phẩm"`, `"product"`) from false fuzzy matches; falls back to UI `active_product_id` only when supplied cleanly.
3. **LLM-First Semantic Extraction (with full offline rule parity)**:
   - Classifies `question_type`: `"yes_no_feasibility"` | `"what_if_scenario"` | `"schedule_plan"` | `"reverse_goal"`.
   - Extracts temporal offsets (`delay_days`, e.g. `60` normal wait days at `0%` change) vs active event windows (`active_days`, e.g. `7` days at `+15%`).
   - Maps Vietnamese retail calendar events (`EVENT_PROFILES`) to empirical seasonal modifiers:
     - `tet` (*Tết*): `demand_multiplier = 1.65`, `elasticity_multiplier = 0.75` (higher holiday volume, softer hike sensitivity)
     - `double_sale` (*9.9 / 11.11 / 12.12*): `demand_multiplier = 1.85`, `elasticity_multiplier = 1.15`
     - `black_friday`: `demand_multiplier = 1.50`, `elasticity_multiplier = 1.10`
     - `gifting` (*8/3 / 20/10 / Valentine / Noel*): `demand_multiplier = 1.45`, `elasticity_multiplier = 0.80`
4. **Fail-Closed Pydantic Validation**: Expands all phases day-by-day across `[1 .. total_days]`, rejecting any day outside `[-50%, +100%]`, horizon outside `[7, 90]` days, or unresolvable SKUs (`{"error": "...", "fallback": "manual_form"}`).

#### Step 2: Deterministic Econometric & Parallel Monte Carlo Simulation (`POST /api/simulate` → `engine-go/internal/sim/simulate.go`)
1. **Input Validation (`ValidateSimulateRequest`)**: Ensures positive price, non-negative cost/baseline qty/stock, non-empty `elasticity_samples`, `n_sims` in `[1, 200000]`, `demand_multiplier` in `[0, 20]`, `elasticity_multiplier` in `[0, 5]`, and single/schedule bounds (`-50%..+100%`, `7..90` days).
2. **Schedule Expansion (`expandScheduleDays`, when `schedule[]` is present)**:
   - Converts phases into daily `{ day, price, ratio, changePct, demandMult, elastMult }` points.
   - Sequential compounding across phases (`relative_to_prev=true`, `compound_daily_step=true`) carries day-to-day factor transitions deterministically.
3. **4 Canonical Point Scenarios & Fair Seasonal Baseline**:
   - When `baseline_period_days > 0` (e.g., `30`), daily baseline velocity is `q0Daily = Q0 / baseline_period_days` and `fixed_cost` scales proportionally over `len(days)`.
   - `base`: `computeScheduleBaseScenario` evaluates keeping `0%` price across the **exact same calendar & seasonal `demandMult`** (so Tết holiday spikes are never misattributed to a price change).
   - `expected` / `optimistic` / `pessimistic`: `50th` / `10th` / `90th` sensitivity percentiles over `|e|`, with `Q_d = q0Daily * demandMult * (P_d / P_0)^(e * elastMult)` capped sequentially by remaining stock.
4. **Parallel Monte Carlo Worker Pool (`nWorkers = runtime.GOMAXPROCS(0)`)**:
   - Allocates `profits := make([]float64, nSims)` (`n_sims = 5000` by default in UI).
   - Splits indices `[0 .. nSims)` across goroutine chunks (`sync.WaitGroup`).
   - **Order-Independent Determinism**: Each simulation index `i` derives its own hash independently:
     ```go
     h1 := splitmix64(baseSeed ^ (uint64(i+1) * 0x9e3779b97f4a7c15))
     e  := samples[h1 % nSamples]
     ```
     When `sigma_resid > 0`, two independent `splitmix64` hashes generate uniform `(u1, u2)` → Box-Muller normal `z` → multiplicative residual noise $\exp(\sigma_{\text{resid}} \cdot z)$.
   - Guarantee: Identical `SimulateRequest` + `seed` produces byte-for-byte identical distributions on `GOMAXPROCS=1` and `GOMAXPROCS=8+`.
5. **Distribution, Break-Even & Business Diagnostics**:
   - Computes empirical `p5`, `p50`, `p95`, `20`-bin profit histogram, and `prob_beat_base` ($P(\text{profit}_i > \text{profit}_{\text{base}})$).
   - Solves exact break-even elasticity $e^*$ (closed-form for single move; 50-step bisection in `computeScheduleBreakEvenElasticity` against the fair seasonal `baseScenario.Profit`).
   - Computes deterministic `AdvisorySummary` (`verdict_code`, `stockout_risk`, `min_margin_pct_in_plan`, `risk_flags[]`).

#### Step 3: Agent Tool Counter-Check via Reverse Optimizer (`POST /api/optimize` when feasibility / goal / event applies)
- For `yes_no_feasibility`, `reverse_goal`, and seasonal-event queries, the app additionally invokes `POST /api/optimize` (with event-scaled period volume and `elasticity_samples * elastMult`) so the explanation agent can verify whether a better/safer candidate price exists and cite it concretely.

#### Step 4: Zero-Hallucination Direct Answer & Plain-Language Explanation (`POST /api/nlq/explain` → `ml-py/app/llm/explain.py`)
1. `build_direct_answer` + `build_advisory_report` synthesize a direct **CÓ / CÂN NHẮC / KHÔNG NÊN** (`direct_answer`), plain-language situation summary, and grounded next steps using engine outputs + optional `optimize_summary`.
2. If `LLMClient.is_configured()`, asks the LLM (`temperature = 0.0`, `timeout = 10s`) to answer the user's exact question directly in 3–4 plain bullet lines from `{ scenario_result, business_context, decision_spec, optimize_summary }`.
3. **Fail-Closed Post-Check (`verify_explanation_numbers`)**:
   - Recursively extracts all input numbers and standard display scales (`1x`, `1e-3`, `1e-6`, `100x`, `0..3` decimals) from `allowed_payload`.
   - Extracts all numeric tokens from the LLM candidate text (handling both `100,000.5` and Vietnamese `100.000,5`, plus `K/M/B` suffixes).
   - If **any** number cannot be matched within tight tolerance (`max(0.11, |ref| * 0.005)`), the entire LLM response is discarded (`used_fallback = True`) and replaced by the deterministic template (`build_template_explanation`).

---

### Stage D — Reverse What-If Grid Optimizer (`POST /api/optimize` → `engine-go/internal/optimize/grid.go`)
1. Sweeps candidate price changes across `[-max_price_change_pct .. +max_price_change_pct]` (default `1%` step → e.g. 61 candidates for ±30%, 101 for ±50%).
2. Runs parallel Monte Carlo (`n_sims` draws per candidate using deterministic per-candidate seed offsets).
3. Evaluates hard business constraints:
   - `min_margin_pct`: $(P_1 - \text{cost}) / P_1 \cdot 100 \ge \text{min\_margin\_pct}$
   - `respect_stock`: expected unconstrained quantity $\le \text{stock\_available}$
   - `budget_vnd`: markdown subsidy $(P_0 - P_1) \cdot Q_1 \le \text{budget\_vnd}$ (when $P_1 < P_0$)
4. Ranks **feasible** candidates ahead of constrained violations by `prob_hit_target` (`objective="hit_target"`) or `expected_profit` (`objective="max_expected_profit"`).

---

## 3. Core Mathematical Formulas (Single Source of Truth)

```text
Demand under price move:
  Q1      = Q0 * (P1 / P0)^e                     (e sampled from bootstrap elasticity_samples)
  Q1_sold = min(Q1 * exp(noise), stock_available) noise ~ N(0, sigma_resid) if sigma_resid > 0 else 0
  Profit  = (P1 - unit_cost) * Q1_sold - fixed_cost

Multi-phase daily schedule (total N days):
  Q0_daily = Q0 / N
  Q_day    = min(Q0_daily * (P_day / P0)^e * exp(noise), remaining_stock)
  Profit   = sum( (P_day - unit_cost) * Q_day ) - fixed_cost

Break-even elasticity (single move, unconstrained, P1 != P0, P0 > cost, P1 > cost):
  e* = ln((P0 - unit_cost) / (P1 - unit_cost)) / ln(P1 / P0)
```

**Golden Reference Test (must pass identically in Python & Go):**
- Given $P_0 = 100{,}000$, $\text{cost} = 60{,}000$, $Q_0 = 10{,}000$, $P_1 = 110{,}000$, $\text{fixed\_cost} = 0$:
  - $e = -0.5 \Rightarrow Q_1 = 9{,}534.6$, $\text{Profit} = 476{,}731{,}292$ (`476.7M ₫`)
  - $e = -1.0 \Rightarrow Q_1 = 9{,}090.9$, $\text{Profit} = 454{,}545{,}455$ (`454.5M ₫`)
  - $e = -2.0 \Rightarrow Q_1 = 8{,}264.5$, $\text{Profit} = 413{,}223{,}140$ (`413.2M ₫`)
  - Break-even $e^* = -2.341$

---

## 4. Data Provenance Labels & Currency Rules

- Every dataset carries an immutable `data_label` badge rendered in the UI (`DataSourceBadge.tsx`):
  - `SYNTHETIC`: Generated benchmark stores (`fashion_shop_12`, `grocery_fmcg_15`, etc.) with known ground-truth elasticity.
  - `PUBLIC_M5`: Public Walmart M5 subset converted to VND via `config/fx.json` (`25.000 ₫/$`, flagged as *illustrative conversion from USD*).
  - `PUBLIC_DUNNHUMBY`: Public Dunnhumby subset converted via `config/fx.json`.
  - `USER`: User-uploaded store CSV kept strictly in transient backend session memory.
- All monetary figures inside Go and Python are integer `VND`; display formatting (`1234567 -> "1.234.567 ₫"`) happens solely at the React UI edge (`web/src/i18n.ts`).

---

## 5. Verification & Runtime Commands

- **Python ML (`ml-py/`)**: `python -m pytest -q` (ingestion, mapping, econometrics, backtest, NLQ parsing & hallucination post-check) + `python -m ruff check --select E9,F63,F7,F82 ml-py e2e`
- **Go Engine (`engine-go/`)**: `go vet ./...` + `go test -race ./...` (golden test, `splitmix64` multi-core determinism, grid optimizer constraints)
- **React Web (`web/`)**: `npm run build` (`tsc && vite build`) + `npm test -- --run` (Vitest unit & bilingual E2E UI flows)
- **Live 3-Tier Cross-Check**: `python -u e2e/demo_path.py` and `python e2e/cross_check_py_go.py` (`<= 0.5%` Py/Go parity)
- **One-Command Container Stack**: `docker compose up --build` (runs `ml-py:8000` → `engine-go:8080` → `web:5173`)
