# What-If AI — 13-Slide Pitch Deck Outline & Speaker Notes (Draft)

> **Human Editing Notice**: All sections below are team-editable drafts built strictly from verified benchmark runs (`docs/VALIDATION.md`, `docs/ENGINE.md`, `docs/LIMITS.md`, `docs/DEMO.md`). Customize `[TeamName]`, presenter names, and store anecdotes in your own words before exporting to PDF (`<= 15 pages`, fonts embedded, English only).

- **Constraint Compliance Check**:
  - Total slides: **13** (`<= 15` limit)
  - Slide body text per slide: **17–24 words** (`<= 25` words limit per `phases/PHASE_8_slides_pitch.md`)
  - Data source labels shown directly on data slides (`SYNTHETIC`, `PUBLIC (M5/DUNNHUMBY)`, `YOUR DATA`)
  - Target pitch runtime: **12–13 minutes** (including ~2-min product demo clip on Slide 8), leaving buffer within the 15-minute slot + 5-minute Q&A.

---

## Slide 1 — Title
- **Slide Text (17 words)**:
  What-If AI — Retail Pricing Simulator.
  Simulate before you decide.
  Team: [TeamName] | AI for Business Hackathon 2026.
- **Visual Suggestion**: Clean dark navy hero frame with the `W?` logo, subtle probability distribution curve silhouette behind the title, and a `100% Zero LLM Math` pill.
- **90s Speaker Notes**:
  Good afternoon, judges. We are Team [TeamName], and this is What-If AI: a retail pricing simulation and counterfactual optimization platform built for small and medium businesses. Our core philosophy is simple: "Simulate before you decide — know before you act." Every day, shop owners make irreversible pricing and markdown calls using intuition or backward-looking spreadsheets. We built a decision simulator that estimates historical price sensitivity, models full demand uncertainty, and searches backwards for profit-maximizing prices under real inventory and margin guardrails — without ever letting a language model guess a single number.

---

## Slide 2 — Business Problem
- **Slide Text (24 words)**:
  VN SMEs set prices by gut feel.
  Spreadsheets track history, never counterfactual profit, downside risk, or break-even thresholds.
  One mispriced promo erodes retail margin.
- **Visual Suggestion**: Split-panel comic/diagram showing a shop manager staring at messy Excel tabs (`gia_ban`, `ton_kho`) vs. an unexpected margin drop after a `11.11` flash discount.
- **90s Speaker Notes**:
  Consider a typical Vietnamese fashion or convenience retailer running 10 to 50 SKUs across POS systems and Excel exports. Data lives across scattered files with inconsistent headers, Vietnamese number formatting, and receipt-level exports. Traditional BI dashboards are rearview mirrors — they tell you last month's revenue, not what happens next month if you raise T-shirt prices by 10% or join a double-day campaign. Without quantitative simulation, a seemingly harmless discount can sacrifice profit margin when demand is actually inelastic, or trigger stockouts before restock arrives. Businesses lack a fast, transparent way to stress-test pricing trade-offs and downside risks before spending real capital.

---

## Slide 3 — Target Users
- **Slide Text (21 words)**:
  Shop owners test price moves safely.
  Merchandisers protect margin; marketers size promos; ops planners respect stock limits using existing POS CSVs.
- **Visual Suggestion**: Four clean persona cards showing each retail role (`Shop Owner`, `Merchandiser`, `Marketing`, `Inventory Ops`) mapped to their daily question ("Break-even price?", "Target profit uplift?", "Promo cap?", "Stock ceiling?").
- **90s Speaker Notes**:
  Our initial beachhead focuses squarely on retail SMEs who already export historical sales, price, and volume tables from tools like KiotViet, Sapo, or Excel. We serve four concrete personas inside a retail business: first, shop owners who want to evaluate whether a price change protects profit; second, merchandisers balancing target profit uplift against minimum gross margin thresholds; third, marketing managers sizing campaign markdown budgets; and fourth, inventory planners ensuring any simulated demand spike still fits available stock. Every workflow begins directly with their existing CSV export — zero ERP integration required on day one.

---

## Slide 4 — Core Insight
- **Slide Text (21 words)**:
  BI explains yesterday; LLMs hallucinate spreadsheet math.
  Retailers need counterfactual profit distributions: full bootstrap elasticity ranges tested before risking store capital.
- **Visual Suggestion**: 3-column comparison table: `Excel / BI` (Backward, point numbers) vs. `Generic Chatbot` (No causal controls, hallucinated numbers) vs. `What-If AI` (Controlled econometrics + Monte Carlo ranges + Reverse optimizer).
- **90s Speaker Notes**:
  Why do both traditional tools and off-the-shelf AI fail here? BI dashboards answer descriptive questions, leaving managers to guess elasticity in Excel. Conversely, pasting raw sales rows into a general LLM chatbot leaks proprietary pricing data and regularly produces plausible-sounding arithmetic errors or ignores double-day promo spikes. Our core insight is to split intelligence cleanly: use econometrics and Monte Carlo simulation for all quantitative math, use NLP only to understand messy schemas and questions, and present managers with full probability distributions and break-even thresholds rather than fragile single-point guesses.

---

## Slide 5 — Solution: The 4-Step Flow
- **Slide Text (22 words)**:
  1. Upload messy CSV.
  2. Confirm NLP column mapping.
  3. Inspect elasticity, caveats, assumptions.
  4. Simulate 5,000 scenarios or Reverse What-If.
- **Visual Suggestion**: Horizontal 4-step workflow ribbon with icons leading from raw CSV -> column confidence bars -> assumptions card -> 4 scenario cards (`Base`, `Optimistic`, `Expected`, `Pessimistic`) + Reverse curve.
- **90s Speaker Notes**:
  What-If AI walks a store manager from raw spreadsheet to validated action in four steps. Step one: drag and drop any messy sales CSV — daily or receipt-level — tagged immediately with a provenance badge (`YOUR DATA`). Step two: our NLP column mapper detects Vietnamese or English headers, unit scales like thousands of VND, and date formats, while requiring explicit human confirmation before committing. Step three: managers inspect median price elasticity, 90% bootstrap intervals, and honest reliability warnings, and adjust costs or stock ceilings. Step four: run 5,000 Monte Carlo draws for any decision or flip to Reverse What-If to rank feasible target-hitting prices.

---

## Slide 6 — How AI Helps (Zero LLM Math)
- **Slide Text (21 words)**:
  Deterministic math computes all figures.
  LLMs parse JSON and explain only.
  Six modules: mapper, calendar GLM, bootstrap, simulator, optimizer, verifier.
- **Visual Suggestion**: Two-color stacked block diagram separating `Blue = Deterministic Math & Rules (Go + Statsmodels)` from `Indigo = Guardrailed Language & Mapping (Strict JSON + Number Post-Check)` with a wall labeled `Zero LLM Math`.
- **90s Speaker Notes**:
  Our engineering guarantee is printed on every screen: the LLM never computes a single number. Instead, AI operates across six disciplined components. First, dictionary, shape scoring, Hungarian assignment, and an optional masked adjudicator map arbitrary spreadsheets. Second, Poisson log-link regression controls for Vietnamese Lunar New Year windows, `9.9` to `12.12` sales, paydays, and stockouts. Third, week-block bootstrap samples full parameter uncertainty. Fourth and fifth, a stateless Go engine executes deterministic Monte Carlo draws and Reverse grid optimization. Sixth, the LLM translates plain questions into validated JSON schemas and narrates engine results — protected by a regex post-checker that rejects any ungrounded digit.

---

## Slide 7 — How It Works (Architecture & Mapping)
- **Slide Text (20 words)**:
  Three tiers: React UI, stateless Go engine (:8080), Python ML (:8000).
  33/33 messy schemas mapped offline; post-check rejects ungrounded numbers.
- **Visual Suggestion**: System architecture diagram matching `README.md` (`React :5173 -> Go :8080 Monte Carlo & Optimizer -> Python :8000 Econometrics/NLQ`) plus privacy shield showing max 5 masked samples (`####`).
- **90s Speaker Notes**:
  Under the hood, three isolated services uphold strict JSON contracts. React handles display formatting (`1.234.567 VND`) and provenance badges while performing zero business math in the browser. All requests hit Go on port 8080, which proxies data fitting to Python (`ml-py` on port 8000) and executes parallel simulations directly using deterministic `splitmix64` RNG so results are byte-identical across single or multi-core hardware. Privacy stays strict by design: CSV uploads remain in session memory, never `localStorage`, and optional LLM calls receive only headers plus at most five digit-masked samples. Across five messy CSV benchmarks, deterministic mapping scored 33 out of 33 fields accurately offline.

---

## Slide 8 — Live Demo Walkthrough (Video / Real App)
- **Slide Text (23 words)**:
  Badge: SYNTHETIC | Live Go Demo.
  P01 +10%: 100.8M VND expected profit (P5 99.6M–P95 102.3M VND), e* = -2.42.
  Reverse grid ranked in 38.8 ms.
- **Visual Suggestion**: Side-by-side high-resolution screenshots from `slides/screens/02_mapping.png`, `slides/screens/04_whatif.png`, and `slides/screens/05_reverse.png` highlighting the `SYNTHETIC` badge and profit histogram (`2-minute video played live here`).
- **90s Speaker Notes**:
  *[Cue 2-minute screen recording or live walkthrough using `docs/DEMO.md` path.]* Watch our live workflow end-to-end. Uploading a raw Vietnamese CSV (`Ngày bán`, `Giá bán`, dot-grouped `104.000`) takes seconds: column mapping confirms all fields and converts strings cleanly into integer VND. Next, asking `"If I increase P01 price by 10% for 30 days?"` returns four scenarios (`Base 89.7M`, `Optimistic 102.1M`, `Expected 100.8M`, `Pessimistic 99.8M VND`) alongside a Monte Carlo distribution (`P5 99.6M` to `P95 102.3M VND`) and break-even elasticity `-2.42` vs. estimated `-1.19`. Switching to Reverse What-If evaluates candidate prices across `[-30%, +30%]` against a 25% margin floor in under 39 milliseconds.

---

## Slide 9 — Validation: Synthetic Ground-Truth Recovery
- **Slide Text (23 words)**:
  LABEL: SYNTHETIC / SIMULATED BENCHMARKS.
  Spec-C MAE 0.048–0.118, Spearman r 0.791–1.000.
  100% (8/8) flat-price SKUs flagged low_price_variation.
  Confounded 11.11 naive -5.9 -> -1.8.
- **Visual Suggestion**: Clean benchmark table quoting `docs/VALIDATION.md` (`fashion_shop_12` MAE `0.075`, `91.7%` CI90, `r=0.960`; `grocery_fmcg_15` `0.109`; `electronics_home_10` `0.118`; `marketplace_large_40` `0.098`; `starter_4_products` `0.048`; plus `hard_low_price_variation_8` 8/8 warning) with prominent amber `SYNTHETIC` pill at top-right.
- **90s Speaker Notes**:
  To prove econometric recovery where ground-truth elasticity is known, we benchmarked our Spec-C Poisson GLM on simulated Vietnamese retail stores — explicitly labeled `SYNTHETIC` on every chart and slide. Across 81 simulated SKUs spanning fashion, FMCG, electronics, and a 40-SKU marketplace, mean absolute error stayed between `0.048` and `0.118` with `80%` to `100%` 90%-confidence coverage — comfortably outperforming naive log-log regressions. Equally important are our two stress tests: when promos collide strictly with `11.11` and `12.12` peaks, naive regression collapses to `-5.9` against true `-1.5`, whereas Spec-C recovers `-1.8`. When historical prices barely move (`sd = 0.013`), 8 out of 8 SKUs trigger our `low_price_variation` warning instead of misleading managers.

---

## Slide 10 — Validation: Out-of-Time Backtest & Public Benchmarks
- **Slide Text (22 words)**:
  LABEL: HOLDOUT BACKTEST + PUBLIC_M5/DUNNHUMBY LOADERS.
  18/19 events (94.7%) beat naive; 88.7% interval coverage.
  Foreign data validates method; stores upload own CSVs.
- **Visual Suggestion**: Screenshot of `slides/screens/06_validation.png` paired with a simple architecture callout: `PUBLIC_M5 (Walmart) / DUNNHUMBY -> USD x 25.000 ₫/$ -> Method Validation Only` alongside the `18/19 (94.7%)` holdout scorecard and `1/19 (11.11 spike)` transparent failure note.
- **90s Speaker Notes**:
  Next, we validate out-of-sample forecasting discipline. Across 19 historical price-change events, our pipeline fits strictly on pre-change dates (`t < change_date`) and predicts a 14-day holdout window: 18 of 19 events (`94.7%`) beat a trailing 14-day naive baseline with `88.7%` average 80%-interval coverage. In fairness, one `11.11` double-day FMCG markdown (`P04`, WAPE `20.6%` vs. naive `17.5%`) missed point accuracy under extreme saturation — though its prediction interval still captured actuals 100% of the time. For external validation, our codebase integrates Kaggle M5 (Walmart) and Dunnhumby loaders (stripping household IDs, converting USD at `25.000 VND/$` with explicit badges). Foreign public data validates the method; a real Vietnamese business uploads its own file through column mapping.

---

## Slide 11 — Feasibility, Operational Scope & Honest Limits
- **Slide Text (21 words)**:
  Runs locally on one laptop; works 100% offline without LLM keys.
  Limits: observational elasticity, no cross-SKU cannibalization or competitor wars yet.
- **Visual Suggestion**: Two balanced columns: `Operational Readiness` (0 GPU needed, `38.8 ms` optimization, rule-based NLQ fallback `30/30` valid & `15/15` reject, offline fixtures fallback) vs. `Honest Method Limits` (controlled observational estimate not proven causality, requires historical price variance, single-SKU independence).
- **90s Speaker Notes**:
  Feasibility matters for student-built software serving real SMEs. What-If AI requires zero GPU clusters: Python fitting finishes in seconds on CPU, Go evaluates a 101-price by 5,000-draw optimization grid in `38.8 ms`, and every component degrades cleanly without Wi-Fi or paid LLM keys — backed by deterministic rules (`30/30` valid parses and `15/15` out-of-range rejections). Just as critical, we refuse to overpromise causality. Every screen reminds users that elasticities are controlled observational estimates, not randomized A/B trials. In MVP scope, SKUs are modeled independently without cross-price cannibalization or competitor retaliation, and pilot savings remain a hypothesis to measure in live stores rather than invented marketing percentages.

---

## Slide 12 — Competitive Advantage
- **Slide Text (19 words)**:
  First Vietnamese SME simulator uniting zero-cleanup CSV mapping, bootstrap risk bands, Reverse What-If optimization (38.8 ms), and mandatory provenance.
- **Visual Suggestion**: 2x2 capability matrix contrasting generic analytics/chatbots with What-If AI's three moats: `1. Reverse What-If under Margin/Budget/Stock Constraints`, `2. Zero-Cleanup VN CSV Mapping`, `3. Strict Zero-LLM-Math Auditability`.
- **90s Speaker Notes**:
  What makes What-If AI uniquely defensible compared to spreadsheet plugins or enterprise pricing suites? First, Reverse What-If flips the workflow: instead of guessing candidate prices blindly, a shop manager declares a profit uplift goal, margin floor, and budget cap, and receives a ranked feasibility frontier in milliseconds. Second, zero-cleanup ingestion speaks messy Vietnamese retail CSVs natively (`Giá bán (VNĐ)`, thousands scaling, receipt aggregation) without exposing customer rows to external APIs. Third, glass-box transparency — bootstrap uncertainty intervals, break-even thresholds, and mandatory provenance badges — earns finance-grade trust that black-box SaaS dashboards and ungrounded chatbots cannot match.

---

## Slide 13 — Next Steps & Pilot Ask
- **Slide Text (22 words)**:
  Seeking 3 Vietnamese retail shops (POS CSV + COGS) for 60-day controlled pilot.
  Goal: measure pricing decision speed and margin accuracy in practice.
- **Visual Suggestion**: 3-stage 60-day pilot roadmap (`Weeks 1–2: Clean Ingestion & Holdout Calibration -> Weeks 3–6: Shadow vs. A/B Store Price Tests -> Week 8: Measure Realized Profit & Adoption`) + contact card.
- **90s Speaker Notes**:
  We are ready to move from validated prototype to controlled real-world learning. Over the next 60 days, we are asking mentors and retail partners to connect us with three Vietnamese retail shops carrying 20 to 200 SKUs and 6+ months of historical POS exports. In weeks one and two, we onboard their CSVs through our zero-cleanup mapper and run historical out-of-time backtests on their real data. In weeks three to six, managers run shadow What-If and Reverse simulations ahead of promotional cycles, comparing predicted profit intervals against realized gross margin before considering A/B store tests. Thank you — we welcome your toughest questions.

