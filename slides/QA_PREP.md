# Finals Q&A Preparation — Team Ngọa Hổ Tàng Long (`What-If AI`)

> Grounded strictly in verified repository documentation (`README.md`, `docs/VALIDATION.md`, `docs/LIMITS.md`, `docs/DECISION_INTELLIGENCE_AUDIT.md`, `docs/ENGINE.md`, `phases/`) and verified automated test results.

---

### Q1. Data Credibility: "Your backtests and elasticity numbers are labeled SYNTHETIC—how do we know this works on messy real Vietnamese store data?"
**Answer**: We intentionally never claim synthetic scores are live Vietnamese receipts—instead, we validate the methodology on three levels. First, synthetic Vietnamese stores (`81` SKUs across 5 store archetypes) establish exact known-truth ground-truth error (`MAE 0.048–0.118`) and prove `11.11 / Tết` bias correction (`-5.9` naive reduced to `-1.8` vs true `-1.5`), which cannot be measured cleanly without known counterfactual truth. Second, public retail panels (**Walmart M5** and **Dunnhumby**, explicitly labeled `PUBLIC`) stress-test our ingestion, calendar regressions, and noise handling on real external transactions (`25.000 ₫/$` illustrative conversion via `config/fx.json`). Third, our messy Vietnamese CSV mapper achieves **`33/33 (100%)`** offline accuracy on dot-thousand strings (`104.000`) and Vietnamese headers before any simulation runs. Live store generalization is the exact goal of our **60-day SME pilot**.

---

### Q2. Causal Inference vs Correlation: "Isn't historical observational regression dangerous when pricing decisions look like cause-and-effect?"
**Answer**: Yes—which is why every output carries our explicit disclaimer: *"controlled observational estimate, not A/B test certainty"* (`docs/VALIDATION.md`, `docs/LIMITS.md`). Spec-C controls for Vietnamese calendar seasonality (Tết peaks, double-day `11.11`/`12.12`, paydays, weekends, and promo flags) rather than running naive log-log regressions. When historical price variation is insufficient (`sd(ln P) < 0.03` in `ml-py/app/elasticity/fit.py`), What-If AI **refuses to fake certainty** (`8/8` flat-price SKUs flagged) and computes **EVPI/EVSI** (*Value of Information*) so the owner sees mathematically whether running a controlled 7-day A/B price test is worth the experiment cost first.

---

### Q3. Honest Miss Disclosure: "Why did `grocery_fmcg_15 P04` lose to the naive baseline on November 11?"
**Answer**: On `2025-11-11` (`-28.7%` discount), `grocery_fmcg_15 P04` scored WAPE `20.6%` vs `17.5%` trailing naive—though our `80%` uncertainty band still captured **`100.0%`** of holdout days (`docs/VALIDATION.md`). Mechanically, double-day saturation and inventory ceiling effects shifted local buyer response mid-event outside a stationary iso-elastic curve. Rather than hiding or tuning away one outlier out of `19` (`18/19 = 94.7%` win rate), we keep P04 prominently in both our validation suite and pitch deck so owners respect safety floors (`P5`) during extreme promotional surges.

---

### Q4. LLM Hallucinations & API Failures: "If a merchant types an extreme pricing prompt or loses internet, does the AI hallucinate numbers?"
**Answer**: Never. Zero financial arithmetic touches an LLM. User prompts first pass `ml-py/app/llm/parse.py`, enforcing Pydantic guardrails (`price_change` inside `[-50%, +100%]`, horizon `7–90` days, SKU existence in catalog); **`30/30`** valid queries pass and **`15/15`** malformed/out-of-bounds queries fail closed to the manual form (`phases/PHASE_6_llm_layer.md`). After Python and Go compute exact figures, any generated explanation must pass `verify_explanation_numbers()` in `ml-py/app/llm/explain.py`: **one mismatching digit discards the entire LLM text** and serves our deterministic code template. Furthermore, offline VN/EN rule parsers, Hungarian mapping (`33/33`), and deterministic templates operate cleanly with zero `LLM_API_KEY`.

---

### Q5. Competitive Edge vs KiotViet / Sapo / Excel / ChatGPT: "Why won't an SME just stay in Excel or their POS dashboard?"
**Answer**: Note first that we do not make speculative claims about proprietary POS roadmaps—in fact, What-If AI **accepts CSV exports directly from KiotViet, Sapo, and Excel** so there is zero switching cost. What spreadsheets lack is **probabilistic forward risk** (evaluating 5,000 correlated uncertainty draws, break-even elasticity $e^*$, constrained 101-price grid search in `38.8 ms`, and cash runway lags in a few clicks) without formula breakage. And unlike generic AI chat tools, What-If AI keeps raw POS rows in local RAM (max `5` masked summary samples ever exposed when LLM assist is enabled) and guarantees zero invented financial digits.

---

### Q6. Technical Architecture: "Why run both Go and Python instead of keeping everything in FastAPI?"
**Answer**: Clear separation of strengths keeps both services simple, auditable, and fast. **Python (`ml-py :8000`)** leverages `pandas`, `statsmodels`, `scipy`, and SQLite for messy CSV parsing, GLM econometrics, change-point/drift stats, DiD/ITS audits, and persistence. **Go (`engine-go :8080`)** handles stateless gateway routing and CPU-parallel Monte Carlo, reverse optimization (`38.8 ms` for `101 × 5,000 = 505,000` draws), EOQ/DP portfolio knapsack, and cash runway loops—staying deterministic bit-for-bit across `GOMAXPROCS=1..8+` via counter-based `splitmix64` PRNG and agreeing with Python reference math within **`0.0057%–0.0219%`** (`< 0.5%` gate).

---

### Q7. Data Privacy & Security: "Small shop owners guard supplier costs closely—where do their CSVs go?"
**Answer**: Uploaded CSVs remain in local backend session memory only during computation: **`0` rows are stored in browser `localStorage`**, zero raw rows are logged, and zero raw CSV spreadsheets are ever sent in LLM prompts (optional LLM column assistance receives only column headers and at most `5` length-masked sample snippets via `.env`-configured keys, and disables cleanly offline). Deployment works locally on a single laptop via `docker compose up`.

---

### Q8. Multi-SKU Cannibalization & Competitor Pricing: "If I discount Shirt A, won't it cannibalize Shirt B or trigger a competitor price war?"
**Answer**: Today we treat cross-SKU cannibalization and automated competitor reactions as **explicit scope limits (`docs/LIMITS.md`, `docs/DECISION_INTELLIGENCE_AUDIT.md`)** rather than guessing unidentifiable parameters. Estimating true cross-price elasticities requires basket transaction IDs (`order_id`), and modeling competitive reactions requires competitor historical price series (`competitor_price_vnd`), both absent in single-store summary CSV exports. Rather than fabricating guesses, we reserve those capabilities cleanly for **Schema v2** once pilot stores capture basket receipts and rival price feeds.

---

### Q9. Unit Economics & Monetization: "Have you proven customer ROI or finalized your commercial pricing model?"
**Answer**: We intentionally refuse to fabricate savings percentages, customer counts, or revenue numbers ahead of field evidence. Technical turnaround (`38.8 ms` search), `18/19` synthetic backtest performance, and `39 Pytest / 23 Go / 17 Vitest / 8-of-8 E2E` software checks are verified today. Business KPIs—weekly prep time saved, stockout reduction, realized P5–P95 interval hit rate, and gross margin stability—will be measured directly in our **60-day pilot with 3 SMEs**, alongside validating post-pilot commercial packaging directly with partner stores.

---

### Q10. Feature Readiness: "How do we verify the new Inventory, Runway, Monitoring, Causal, and Journal modules are real code, not slideware?"
**Answer**: Every module presented on Slides 9 and 10 is implemented, wired through `/api/*` endpoints, surfaced in React (`Capital & Portfolio`, `Accuracy Track Record`, and `Decision Journal` tabs), and unit/integration tested cleanly in this repo:
- **Go Planning (`engine-go/internal/planning/`)**: EOQ + Acklam normal quantile safety stock (`replenish.go`), CCC cash runway (`runway.go`), 250-bucket DP knapsack portfolio optimizer (`portfolio.go`), and Bayesian EVPI/EVSI (`voi.go`) — verified by `TestOptimizeReplenishment...`, `TestCashRunway...`, `TestOptimizePortfolio...`, `TestValueOfInformation...` in `go test -race ./...`.
- **Python Intelligence (`ml-py/app/`)**: Rolling PICP/MPIW/Pinball/WIS + BIC regimes + PSI/KS/Durbin-Watson drift (`monitoring/`), HAC DiD & Segmented ITS (`causal/`), and SQLite `decisions.db` (`journal/`) — verified across `39` passing `pytest` suites.
