# What-If AI — Architecture Audit, 12-Feature Gap Analysis, Feasibility & Roadmap

> Audit & design specification for extending **What-If AI** into a **Business Decision Intelligence Platform**. Every architectural claim, file path, symbol name, mathematical equation, and dataset boundary below is grounded directly in the verified repository codebase and test suites.

---

## 1. Step 1: Repository Architecture Audit

### 1.1 Existing 3-Tier Topology & Reusable Services

| Tier | Runtime & Modules | Core Responsibilities Before Extension | Key Strengths & Invariants |
| :--- | :--- | :--- | :--- |
| **Frontend UI** (`web/`) | React 18 + TypeScript (strict) + Vite 5 + Tailwind CSS + Recharts | Presentation-only UI (`VI \| EN` via `web/src/i18n.ts`), theme tokens, CSV upload & column confirmation wizard, 4-tab simulation/optimization workspace, `DataSourceBadge` | Zero business calculations in browser; supports offline snapshot mode (`web/src/fixtures/precomputed_fixtures.json`); zero CSV persistence in `localStorage` |
| **Go Engine & API Gateway** (`engine-go/`) | Go 1.22 (`cmd/engine/main.go`, `internal/sim`, `internal/optimize`) | Stateless Monte Carlo engine (`SplitMix64` order-independent hashing across goroutines), multi-phase price schedule simulator, 50-step bisection break-even elasticity $e^*$, constrained Reverse What-If grid optimizer, HTTP reverse proxy to `ml-py` | Byte-for-byte deterministic across `GOMAXPROCS=1` and `8+`; Python cross-check agreement `< 0.03%`; single public HTTP origin on `:8080` |
| **Python ML & NLP Service** (`ml-py/`) | Python + FastAPI + Pydantic v2 + `pandas`, `numpy`, `scipy`, `statsmodels` (`app/`) | CSV dtype-preserving ingest (`dtype=str`), Hungarian column matcher (`scipy.optimize.linear_sum_assignment`), Spec-C Poisson log-link GLM + week-block bootstrap (`DEFAULT_N_BOOTSTRAP = 300`), out-of-time backtesting, VN/EN `DecisionSpec` parser + fail-closed `verify_explanation_numbers` guardrail | Handles `vi_VN`/`en_US` formats & receipt aggregation; controls for Tết lunar calendar windows, paydays, double-days (`9.9`–`12.12`), stockout censoring; works 100% offline |

### 1.2 Audited Constraints, Data Boundaries & System Limitations

1. **Canonical Sales Schema (`docs/ARCHITECTURE.md`)**: Daily SKU grain with `date`, `quantity`, `price`, `product_id`/`product_name`, optional `unit_cost`, `category`, `stock`, `promo`, and numeric `extra_*` covariates. Missing from canonical SME CSVs: `order_id` / basket line IDs, shipping fee tiers, and daily competitor price series.
2. **State & Persistence Limitation**: Before extension, `_UPLOAD_CACHE` and `_COMMITTED_DATASETS` in `ml-py/app/main.py` lived solely in session memory, and `ml-py/workdir` had no database storing manager decisions or realized outcomes over time.
3. **Gateway CORS Limitation (`engine-go/cmd/engine/main.go`)**: Originally restricted `Access-Control-Allow-Methods` to `GET, POST, OPTIONS`, blocking REST `PATCH` and `DELETE` lifecycle updates from the browser.
4. **Statistical Monitoring Depth**: `ml-py/app/backtest/run.py` evaluated WAPE and 80% coverage strictly around historical price jumps ($\ge 5\%$), leaving probabilistic sharpness/calibration (`PICP`, `MPIW`, `Pinball`, `WIS`), structural demand breaks, feature/concept drift, and quasi-experimental post-event counterfactuals unmeasured.
5. **Explicit Structural Boundaries (`docs/LIMITS.md`)**: Single-SKU iso-elastic demand models (`log(Q_i) ~ beta_i * log(P_i)`) assume zero cross-price elasticity (no cannibalization or basket halo inference without cross-SKU experiment/basket data) and constant competitor pricing inside the simulation horizon.

---

## 2. Step 2: 12-Feature Gap Analysis

| # | Proposed Feature | Classification | Reasoning Grounded in Code & Data | Action Taken |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Inventory Replenishment Optimizer** | **Partially implemented → Completed** | `BusinessContext` previously computed static `stock_days_cover` and `whatif` simulated fixed `planned_restock_units`, lacking historical `daily_mean_qty`/`daily_std_qty`, lead-time uncertainty, Safety Stock, ROP, EOQ, and multi-SKU capital rationing. | **Implemented** in `ml-py/app/elasticity/fit.py` (empirical `daily_mean_qty`, `daily_std_qty`) + `engine-go/internal/planning/replenish.go` (`POST /api/planning/replenish`) + `PlanningScreen.tsx`. |
| **2** | **Working Capital & Cash Runway** | **Partially implemented → Completed** | `WorkingCapitalImpact` only estimated tied-up inventory capital. Missing DIO/DSO/DPO, Cash Conversion Cycle, AP/AR lag dynamics, and daily cash runway distributions. | **Implemented** in `engine-go/internal/planning/runway.go` (`POST /api/planning/runway`) using parallel `SplitMix64` Monte Carlo + `PlanningScreen.tsx`. |
| **3** | **Multi-SKU Portfolio Optimization** | **Partially implemented → Completed** | `fit_dataset` produced elasticities for all catalog SKUs, and `engine-go/internal/optimize` tuned 1 SKU at a time without joint budget or warehouse constraints. | **Implemented** in `engine-go/internal/planning/portfolio.go` (`POST /api/planning/portfolio`) via Multiple-Choice Knapsack DP reusing `sim.RunSimulation`. |
| **4** | **Promotion Optimizer** | **Partially implemented (Sub-capabilities Blocked by Data Schema)** | Percentage discount sweep (`[-50%, +100%]`), `promo` covariate control, multi-phase promo schedules (`SchedulePhase`), and marketing subsidy budgets already exist cleanly. However, **Bundle Pricing**, **Buy X Get Y**, **Free Shipping Thresholds**, and **Cannibalization** require `order_id` basket co-occurrence, basket value distributions, and shipping cost tiers not present in canonical daily SKU CSVs (`docs/LIMITS.md`). Fabricating cross-elasticities from uncorrelated daily rows would violate Non-Negotiable Requirement #6 & #10. | Retained existing promo discount/schedule optimization; **deferred bundles/BXGY/shipping/cannibalization** with exact schema requirements below. |
| **5** | **Causal Impact Analysis** | **Missing → Implemented** | No quasi-experimental counterfactual evaluator existed to measure incremental qty/revenue/profit after an intervention while explicitly testing identification assumptions. | **Implemented** in `ml-py/app/causal/analyze.py` (`POST /causal/analyze`) supporting DiD (with pre-treatment parallel-trends p-value & control contamination audit) and HAC Segmented ITS + `ValidationScreen.tsx`. |
| **6** | **Probabilistic Forecast Calibration** | **Partially implemented (Minimal) → Completed** | `ml-py/app/backtest/run.py` reported only overall 80% coverage on 14d jumps; lacked `PICP@50/80/90`, `MPIW`, `Pinball Loss`, Bracher `WIS`, reliability diagrams, and expanding rolling windows. | **Implemented** in `ml-py/app/monitoring/evaluate.py` (`POST /monitoring/evaluate`) + `ValidationScreen.tsx`. |
| **7** | **Demand Regime Detection** | **Missing → Implemented** | No detector identified deseasonalized structural mean breaks or tested whether price elasticity changed between early and recent halves. | **Implemented** in `ml-py/app/monitoring/evaluate.py` (deseasonalized BIC Binary Segmentation + early/recent elasticity `z`-test) + `ValidationScreen.tsx`. |
| **8** | **Model & Assumption Drift Monitor** | **Missing → Implemented** | No telemetry flagged covariate distribution shifts (`PSI`, `KS`), WAPE degradation ratio, residual bias, or lag-1 autocorrelation (`Durbin-Watson`). | **Implemented** in `ml-py/app/monitoring/evaluate.py` (`POST /monitoring/evaluate`) + `ValidationScreen.tsx`. |
| **9** | **Value of Information (EVPI / EVSI)** | **Missing → Implemented** | Users received 300 bootstrap draws of $\varepsilon$ without quantifying the VND value of resolving elasticity uncertainty (`EVPI`) or whether a field price test (`EVSI`, `ENGS`) pays for itself. | **Implemented** in `engine-go/internal/planning/voi.go` (`POST /api/planning/voi`) + `PlanningScreen.tsx`. |
| **10** | **Competitor Price Intelligence** | **Missing & Blocked by CSV Availability** | Vietnamese SME CSVs (`starter_4_products`, `fashion_shop_12`, etc.) and M5 lack daily competitor price columns; `retail_price.csv` contains monthly `comp_1..3` fields outside the canonical ingest schema. Scraping live competitors is also out-of-scope for offline-resilient SME operation. | **Deferred cleanly** with target ingestion column spec & cross-price/leader-follower model blueprint below. |
| **11** | **Scenario Templates** | **Partially implemented → Completed** | Previously offered only flat `%` presets (`-20%`..`+20%`) and 1 clearance shortcut; lacked structured, assumption-badged playbooks for Flash Sale, Tết Clearance, Marketing Expansion, Inventory Expansion, Cash Preservation, and New Product Launch. | **Implemented** in `web/src/data/scenarioTemplates.ts` (`SCENARIO_TEMPLATES`) integrated directly into `WhatIfScreen.tsx`. |
| **12** | **Business Decision Journal** | **Missing → Implemented** | No database or workflow persisted simulated proposals alongside implementation dates, actual CSV/manual outcomes, manager notes, or $P5$–$P95$ calibration hit rates. | **Implemented** via SQLite (`ml-py/app/journal/store.py`, `decisions.db`), `/api/journal*` endpoints, Save-to-Journal buttons (`WhatIfScreen`, `ReverseWhatIfScreen`), and `JournalScreen.tsx`. |

---

## 3. Step 3: Technical Feasibility, Mathematical Models & API Contracts

### 3.1 Inventory Replenishment Optimizer (`POST /api/planning/replenish`)
- **Required Inputs**:
  - *Historical*: `daily_mean_qty` and `daily_std_qty` (populated by `ml-py/app/elasticity/fit.py`, falling back explicitly to `baseline_qty_per_period / baseline_period_days` and $\sqrt{\mu_D}$ with `demand_source` disclosed), `current_price_vnd`, `unit_cost_vnd`, `stock_available`.
  - *User Assumptions*: `lead_time_days` $\in [0, 180]$, `lead_time_std_days` $\in [0, 90]$, `service_level_pct` $\in [50, 99.9]$, `ordering_cost_vnd`, `holding_cost_pct_per_month` $\in [0, 50]$, `moq_units`, `capital_budget_vnd`, `warehouse_max_units`.
- **Mathematical Model (`engine-go/internal/planning/replenish.go`)**:
  - Service factor via Acklam inverse normal approximation `NormalQuantile(service_level_pct / 100)`.
  - Lead-time demand distribution: $\mu_L = \mu_D L$, $\sigma_L = \sqrt{L \sigma_D^2 + \mu_D^2 \sigma_L^2}$.
  - Safety Stock & Reorder Point: $SS = \lceil z \sigma_L \rceil$, $ROP = \lceil \mu_L \rceil + SS$.
  - Economic Order Quantity: $EOQ = \max\!\left(\text{MOQ}, \text{round}\sqrt{\frac{2 \cdot 365\mu_D \cdot K}{h_{\text{annual}} \cdot C}}\right)$.
  - Priority allocation under `capital_budget_vnd` / `warehouse_max_units`: sorts urgent SKUs by `margin_per_vnd_invested` descending, then `stockout_prob_in_lead_time` descending (`1 - NormalCDF((stock - mu_L) / sigma_L)`).
- **Tests**: `TestReplenishmentEOQAndSafetyStock`, `TestReplenishmentCapitalConstraintDefersLowerPriority` (`engine-go/internal/planning/planning_test.go`).

### 3.2 Working Capital & Cash Runway (`POST /api/planning/runway`)
- **Required Inputs**:
  - *Historical*: `opening_inventory_cost_vnd`, `expected_daily_revenue_vnd`, `expected_daily_cogs_vnd`, optional `daily_revenue_std_vnd` (conservative 18% CV fallback if omitted).
  - *User Assumptions*: `starting_cash_vnd`, `min_cash_buffer_vnd`, `dso_days` $\in [0, 90]$, `dpo_days` $\in [0, 120]$, `monthly_fixed_opex_vnd`, `planned_restock_cash_vnd`, `restock_outflow_day`, `horizon_days` $\in [7, 180]$, `n_sims`, `seed`.
- **Mathematical Model (`engine-go/internal/planning/runway.go`)**:
  - Ratios: $\text{DIO} = \frac{\text{OpeningInventoryCost}}{\text{DailyCOGS}}$, $\text{CCC} = \text{DIO} + \text{DSO} - \text{DPO}$.
  - Parallel Monte Carlo across goroutines using `sim.SplitMix64` and `sim.StdNormalFromSeed`: accounts for macro demand regime multiplier $\max(0.55, 1 + 0.08 z_{\text{macro}})$, daily stochastic sales receipts lagged by `DSO`, daily COGS cash outflow lagged by `DPO`, prorated fixed OPEX (`MonthlyFixedOpex / 30`), and lump-sum `planned_restock_cash_vnd` on `restock_outflow_day`.
  - Outputs daily `p5`, `p50`, `p95`, `expected` trajectories, `prob_breach_min_buffer`, `prob_cash_shortage`, `estimated_runway_days`, and `shortage_alert_level` (`healthy` | `caution` | `critical`).
- **Tests**: `TestCashRunwayDeterminismAndShortageAlert` (`planning_test.go`).

### 3.3 Multi-SKU Portfolio Optimization (`POST /api/planning/portfolio`)
- **Mathematical Model (`engine-go/internal/planning/portfolio.go`)**:
  - Evaluates each SKU across candidate price grid `[-max_price_change_pct .. +max_price_change_pct]` and `[0, allow_restock_units]` **directly invoking `sim.RunSimulation`** (zero duplicated profit/elasticity logic), enforcing optional `min_margin_pct` and `respect_stock`.
  - Risk-adjusted utility per candidate action: $U_{i,j} = \mathbb{E}[\Pi_{i,j}] - \lambda \cdot \max(0, \mathbb{E}[\Pi_{i,j}] - P5(\Pi_{i,j}))$.
  - Solves a discretized **Multiple-Choice Knapsack DP** (`numBuckets = 250`) over `total_capital_budget_vnd`, paired with Lagrangian penalty search when `warehouse_max_units` binds. Explicitly attaches `IndependenceAssumption` disclosure.
- **Tests**: `TestPortfolioOptimizationRespectsCapitalBudget` (`planning_test.go`).

### 3.4 Value of Information (`POST /api/planning/voi`)
- **Mathematical Model (`engine-go/internal/planning/voi.go`)**:
  - Uses the 300 empirical bootstrap elasticity samples $\{e_m\}_{m=1}^M$ via `sim.ComputePointScenario`:
    - $\text{EV|PI} = \frac{1}{M} \sum_{m=1}^M \max_{a \in \mathcal{A}} \Pi(a, e_m)$, $\text{EMV}_{\text{prior}} = \max_{a \in \mathcal{A}} \frac{1}{M}\sum_{m=1}^M \Pi(a, e_m)$, $\text{EVPI} = \max(0, \text{EV|PI} - \text{EMV}_{\text{prior}})$.
    - Normal conjugate preposterior for a proposed `experiment_days` alternating $\pm 12\%$ trial with `sigma_resid`: $w = \frac{\sigma_{\text{prior}}^2}{\sigma_{\text{prior}}^2 + \sigma_{\text{test}}^2}$, evaluating optimal posterior actions across `200` predictive signals $\times$ `40` posterior draws (`SplitMix64`-seeded) to obtain `EVSI`, Net Gain `ENGS = EVSI - experiment_cost_vnd`, `break_even_info_cost_vnd`, and verdict (`run_experiment` | `decide_now` | `low_uncertainty`).
- **Tests**: `TestValueOfInformationBoundsAndZeroUncertainty` (`planning_test.go`).

### 3.5 Probabilistic Calibration, Regimes & Drift (`POST /monitoring/evaluate`)
- **Statistical Pipeline (`ml-py/app/monitoring/evaluate.py`)**:
  - **Rolling Calibration**: Uses expanding-window Poisson IRLS (`ml-py/app/elasticity/fit.py`) + HC1 covariance posterior draws with Negative Binomial overdispersion ($\phi = \max(1, \chi^2_{\text{Pearson}} / \text{dof})$) to evaluate out-of-sample `PICP` (50%/80%/90%), `MPIW@80`, `Pinball Loss` ($q_{10}, q_{50}, q_{90}$), Bracher `WIS`, `reliability_curve`, and per-window WAPE/WIS trends.
  - **Regime Detection**: Deseasonalizes daily quantity by weekend ratio, runs recursive **BIC Binary Segmentation** (`penalty_mult * ln(N)`) to detect change-points (`baseline` | `expansion` | `contraction` | `volatile`), and tests early-half vs recent-half `log(price)` slope stability via two-sided `z`-test ($p < 0.05$ triggers instability).
  - **Drift Monitor**: Computes `PSI` (`8` quantile bins) and 2-sample `Kolmogorov-Smirnov` test on price & quantity (`baseline_window` vs `recent_window`), `error_drift_ratio` (`recent_wape / baseline_wape`), `residual_mean_bias_pct`, and `Durbin-Watson` autocorrelation, assigning `healthy` | `watch` | `retrain_recommended`.
- **Tests**: `ml-py/tests/test_monitoring.py`.

### 3.6 Quasi-Experimental Causal Impact (`POST /causal/analyze`)
- **Statistical Pipeline (`ml-py/app/causal/analyze.py`)**:
  - Filters stockout days (`stock == 0`) to prevent demand censoring bias.
  - **Difference-in-Differences (DiD)** (when a valid `control_product_id` is supplied):
    1. *Pre-treatment Parallel Trends Test*: `y ~ 1 + treated + t_idx + treated:t_idx + is_weekend` (Newey-West HAC `maxlags=2`); flags `parallel_trends_violated` if $p < 0.05$.
    2. *Control Contamination Audit*: flags `control_contaminated` if control SKU shifts mean price $\ge 3\%$ or promo rate $\ge 25\%$ in post window.
    3. Estimates ATT (`treated * is_post`) with HAC `maxlags=3` 95% CI, incremental revenue & profit, and explicit SUTVA/parallel-trends assumptions.
  - **Segmented Interrupted Time Series (ITS)** (fallback when no control SKU exists): `y ~ 1 + t_idx + is_post + time_post + is_weekend` (HAC `maxlags=3`) computing linear contrast ATT across `post_days` and surfacing explicit `no_control_group` warning.
- **Tests**: `ml-py/tests/test_causal.py`.

### 3.7 Business Decision Journal (`GET/POST /journal`, `PATCH/DELETE /journal/{id}`, `POST /journal/{id}/evaluate`)
- **SQLite Persistence (`ml-py/app/journal/store.py`)**: Stores `decisions.db` inside `WHATIF_WORKDIR` (Docker named volume `ml_workdir` mounted at `/app/ml-py/workdir`) with table `decisions`:
  - Identity & lifecycle: `id`, `created_at`, `updated_at`, `dataset_id`, `data_label`, `product_id`, `product_name`, `title`, `decision_type`, `status` (`planned` | `implemented` | `evaluated`), `implemented_at`, `evaluated_at`, `notes`.
  - Plan & Assumptions: `horizon_days`, `planned_price_vnd`, `planned_price_change_pct`, `planned_restock_units`, `assumptions_json`.
  - Simulated Benchmark: `expected_qty`, `expected_revenue_vnd`, `expected_profit_vnd`, `p5_profit_vnd`, `p95_profit_vnd`, `prob_beat_base`.
  - Actuals & Calibration: `actual_qty`, `actual_revenue_vnd`, `actual_profit_vnd` (computed automatically from matching post-decision dataset rows or entered manually), returning `profit_variance_vnd`, `profit_variance_pct`, and `within_p5_p95_band`.
- **Tests**: `ml-py/tests/test_journal.py`.

### 3.8 Deferred Blueprints (#4 Full Promotion Suite & #10 Competitor Intelligence)
- **To unlock #4 (Bundles / BXGY / Free Shipping / Cannibalization)**:
  1. Extend `ml-py/app/ingest/profile.py` & `mapping/dictionary.py` with optional canonical fields: `order_id` (transaction basket key), `shipping_fee_vnd`, `bundle_id`.
  2. Fit multivariate Poisson/Multinomial-Logit cross-price elasticity matrix $E_{ij} = \partial \ln Q_i / \partial \ln P_j$ over co-occurring category baskets only when `order_id` variance supports identification, feeding cross-SKU cannibalization terms into `engine-go/internal/planning/portfolio.go`.
- **To unlock #10 (Competitor Price Intelligence)**:
  1. Add optional ingest columns `competitor_price_vnd`, `competitor_name` (keeping user-supplied store CSV or authorized feed only; zero unauthorized scraping).
  2. Include `ln(competitor_price_vnd)` and price-gap index `ln(P / P_comp)` inside `build_econometric_design_matrix` (`ml-py/app/features/build.py`) when non-null coverage $\ge 70\%$, and add competitor-response sensitivity scenarios inside `engine-go`.

---

## 4. Step 4 & 5: Prioritization & Rollout Summary

| Priority Tier | Capabilities | Business Value | Data Readiness Today | Architecture Alignment |
| :---: | :--- | :---: | :---: | :--- |
| **P1 (Shipped)** | **#1 Replenishment**, **#2 Cash Runway**, **#11 Scenario Templates**, **#12 Decision Journal** | Very High (daily SME stockouts, cash crunch prevention, playbook speed, outcome accountability) | 100% supported by current CSV fields + explicit user cash/lead-time inputs | Go deterministic optimization + SQLite persistence in `ml_workdir` |
| **P2 (Shipped)** | **#3 Portfolio Optimizer**, **#6 Calibration**, **#7 Regimes**, **#8 Drift**, **#5 Causal Audit** | High (multi-SKU budget allocation, model trustworthiness, post-promo attribution) | Supported by existing historical time series & multi-SKU catalogs | Reuses `sim.RunSimulation` & `poisson_irls_fit` without duplication |
| **P3 (Shipped)** | **#9 Value of Information (EVPI/EVSI)** | High Differentiator (decides *when to test vs act now*) | 100% supported by existing 300 bootstrap draws | Pure Go Bayesian preposterior calculation |
| **Blocked / Deferred** | **#4 Bundles / BXGY / Free Shipping**, **#10 Competitor Price Tracking** | High for e-commerce teams | Missing `order_id`, shipping schedule & daily competitor prices in schema | Wait for optional canonical schema v2 inputs to avoid fabricated numbers |

