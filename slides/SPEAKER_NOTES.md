# Speaker Notes — What-If AI Pitch Deck (15 Slides · 60–90s per Slide)

> **Presenter Guide — Team Ngọa Hổ Tàng Long**
> Target pace for full walk-through or selective finals cut: **~60–75 seconds per core slide**, **~30–45 seconds on supporting technical proof slides**, keeping **zero unverified financial claims** and calling out **`SYNTHETIC`** vs **`YOUR DATA`** badges naturally.

---

### Slide 01 — Title
> *"Good afternoon, judges. We are Team Ngọa Hổ Tàng Long, presenting What-If AI: business decision intelligence built for Vietnamese retail SMEs. Before a store owner cuts a price, launches a promo, or commits restock capital, What-If AI lets them simulate profit upside and downside risk, validate against historical holdouts, and track realized cash outcomes afterwards. Every calculation runs in deterministic Go and Python engines—zero digits are ever calculated by an LLM—delivering 505,000 Monte Carlo evaluations in 38.8 milliseconds and beating the baseline on 18 of 19 synthetic backtests."*

### Slide 02 — Why This Exists, What It Is, Core Value
> *"Why build this? Today, small retailers price and restock by gut feel or backward-looking spreadsheets. Worse, messy POS CSV exports with Vietnamese headers and dot-thousands slow down basic analysis, while 11.11 and Tết demand surges fool naive math—distorting buyer price sensitivity from minus 1.5 to minus 5.9 on our synthetic stress test. General AI chatbots can't be trusted with money because they invent numbers. So we built 'One CSV in, one decision out': an offline bilingual laptop workspace serving shop owners, merchandisers, marketers, and inventory operators."*

### Slide 03 — The Gap
> *"Compare your options today. Excel gives clean backward arithmetic, but only tests one point at a time and leaves holiday confounding to manual work. Generic chatbots sound confident, yet leak raw sales tables into prompts and fabricate profit math. What-If AI takes standard CSV exports from systems like KiotViet, Sapo, or Excel directly, isolates historical inputs from model estimates and user assumptions, and labels every metric by provenance: YOUR DATA, SYNTHETIC, or PUBLIC."*

### Slide 04 — How It Works (The Hard Shield)
> *"Our core engineering principle is a strict Hard Shield between language and math. When a merchant asks a question in plain English or Vietnamese, the language layer only parses a structured DecisionSpec JSON bounded strictly between minus 50% and plus 100% over 7 to 90 days. Unknown SKUs or out-of-bounds moves fail closed immediately. Next, Python and Go execute all math and hand back exact JSON numbers. Only then does an explainer summarize the result—and `verify_explanation_numbers()` discards any reply containing an ungrounded digit, falling back to a verified template. Even without any API key, offline mapping scores 33/33 fields cleanly, and guardrails pass 30/30 valid prompts while blocking 15/15 invalid ones."*

### Slide 05 — Architecture
> *"Under the hood, three clean containers spin up via a single `docker compose up` command. React TypeScript renders interactive charts in the browser with zero business math and zero raw CSV storage in `localStorage`. Our Go core engine acts as a fast gateway and executes parallel Monte Carlo, target-price grid search, EOQ, and cash runway math—achieving byte-identical repeatability across CPU thread counts and matching our Python reference within 0.022 percent. Finally, Python FastAPI runs econometrics, drift monitoring, and persists the Decision Journal in local SQLite."*

### Slide 06 — Demo Workflow (Single Scenario)
> *"Let's walk through one real flow from our UI in sample snapshot mode. Step one: drop a POS CSV or load a sample shop—zero data leaves browser storage. Step two: 12,420 messy rows auto-map with 72% to 95% alias confidence in seconds. Step three: test a plus-10% hike on item P01—we get a clear verdict banner, 100% odds of beating today's profit, P5 to P95 profit bounds, and a safety cutoff elasticity of minus 2.42. Step four: switch to Find Target Price, and the optimizer plots profit curves and ranks safe compliant prices immediately."*

### Slide 07 — Golden Case Proof
> *"Before adding randomness, we prove exact algebraic fidelity on a classic Golden Case: 100,000 VND unit price, 60,000 VND cost, and 10,000 baseline units equal 400 million VND profit. Testing a 10% hike gives exact analytical profit of 413.2 million in a pessimistic scenario, 454.5 million expected, and 476.7 million optimistic, with an exact break-even cutoff at minus 2.3412. Both Go and Python unit suites verify digit-for-digit agreement."*

### Slide 08 — Pricing Workspaces
> *"On our live end-to-end synthetic P01 scenario, simulating 5,000 draws in Go maps the full risk distribution from a 97.56 million VND safe floor to 101.07 million upside against an 88.88 million baseline. Teams can click six ready-made scenario playbooks—from 7-day Flash Sales to multi-phase Tết Clearances—or let the Reverse Target-Price Finder scan 101 price candidates times 5,000 draws in 38.8 milliseconds while enforcing gross margin and inventory caps."*

### Slide 09 — Capital, Inventory & Cash
> *"Pricing does not live in a vacuum, so our Go planners tie decisions directly to working capital. Store teams see exact reorder sizes and alert points under supplier lead times, simulate cash runway under delayed receivables and payables so cash never dips below their safety buffer, split tight capital across multiple SKUs for risk-adjusted profit, and test whether a small 7-day price trial is worth running before rolling out storewide."*

### Slide 10 — Monitor, Audit & Journal
> *"After launching a decision, What-If AI closes the loop. Our monitoring module alerts the store when buyer behavior or forecast errors drift across demand regimes. Causal audit compares promoted SKUs against steady control items so marketing verifies real incremental profit rather than holiday hype. And our local SQLite Decision Journal links every simulated P5-to-P95 prediction to actual post-launch earnings, continuously recalibrating the next planning cycle."*

### Slide 11 — Validation: Elasticity
> *"Let's be crystal clear on validation: every sensitivity number here comes from synthetic stores where true elasticity is known, never falsely claimed as live Vietnamese receipts. Controlling for Tết, double-day peaks, paydays, and promos keeps mean absolute error between 0.048 and 0.118 across 81 synthetic SKUs—well under our 0.15 bar—and beats naive minus-5.9 holiday distortion down to minus 1.8 versus true minus 1.5. Better yet, 8 out of 8 flat-price SKUs trigger an honest warning instead of faking certainty."*

### Slide 12 — Validation: Backtest & Suites
> *"Across 19 out-of-time historical price interventions—splitting strictly before each change to guarantee zero leakage—our model beats the trailing 14-day naive baseline 18 out of 19 times, or 94.7%, capturing 88.7% of real holdout days inside its 80% uncertainty interval. Just as important, we openly disclose our single miss: grocery P04 on November 11, where model WAPE was 20.6% versus 17.5% naive due to unmodeled promo saturation. We also test noisy real-world formats on public Walmart M5 and Dunnhumby panels, backed by 39 Python tests, 23 Go race-tested checks, 17 frontend tests, and an 8-step live E2E suite."*

### Slide 13 — Business Impact & Deployment Model
> *"What does this unlock operationally? Owners guard cash floors before signing purchase orders, merchandisers rank safe prices in milliseconds, and marketers prove net lift. Because What-If AI runs completely offline on a standard laptop off raw POS CSV exports, there is zero ERP lock-in and zero third-party data leakage. Quantitative turnaround, stockout prevention, and hit-rate KPIs will be measured transparently during our upcoming 60-day pilot."*

### Slide 14 — Honest Limits & Roadmap
> *"Judges appreciate tools that know what they cannot do. Today our estimates are controlled observational inferences, not A/B certainty. Single-SKU modeling skips cross-product cannibalization until POS exports carry basket `order_id`, and competitor reactions wait until `competitor_price_vnd` history is tracked. Flat-price SKUs below 0.03 log-price variation automatically trigger warnings, and scenarios stay inside bounded limits. Those exact guardrails define our pragmatic Schema v2 roadmap."*

### Slide 15 — Next Steps & Team
> *"Our immediate next step is a structured 60-day live pilot across three Vietnamese retail SMEs: two weeks for CSV cleanup and margin calibration, four weeks running simulated decisions alongside real operations in SQLite, and two weeks auditing realized store profit against our P5-to-P95 forecasts. We are asking pilot partners for 90 days of POS exports and 30 minutes of weekly feedback—and we are ready for your questions."*
