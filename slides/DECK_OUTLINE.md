# What-If AI — 15-Slide English Pitch Deck Outline

- **Competition**: AI for Business Innovation Hackathon 2026
- **Submission Team**: **Team Ngọa Hổ Tàng Long**
  - **Nguyễn Hoàng Tùng** (Leader)
  - **Phạm Viết Trường**
  - **Ngô Thanh Tùng**
- **Deck Deliverables**:
  - Exported PDF (`15` slides, `16:9` `13.333in x 7.5in`, unified light theme): [`WhatIfAI_Pitch_EN_v2.pdf`](WhatIfAI_Pitch_EN_v2.pdf)
  - Source HTML: [`WhatIfAI_Pitch_EN_v2.html`](WhatIfAI_Pitch_EN_v2.html)
  - Companion Docs: [`SPEAKER_NOTES.md`](SPEAKER_NOTES.md) · [`QA_PREP.md`](QA_PREP.md) · [`CHANGES.md`](CHANGES.md)

---

## Slide-by-Slide Sequence (15 Slides)

1. **Slide 01 — Title (`What-If AI · Team Ngọa Hổ Tàng Long`)**
   - Tagline: *Simulate before you decide — Validate with data — Track realized profit*.
   - Verified highlights (`38.8 ms · 101 prices × 5,000 draws`, `18 / 19 beat naive baseline · SYNTHETIC backtest`, `0 digits calculated by LLM`) + hero visual (`hero-retail.jpg`).

2. **Slide 02 — Why This Exists, What It Is & Core Value**
   - 3-column canvas: Problem & `11.11` confounding (`-5.9` vs `-1.5` `SYNTHETIC` stress test), *One CSV in, one decision out* offline pipeline, and 4 value pillars + 4-role SME question strip.

3. **Slide 03 — The Gap**
   - Comparison matrix across **Excel / BI** vs **Generic LLM Chat** vs **What-If AI**, CSV readiness (*Accepts CSV exports from KiotViet, Sapo, Excel*), and 3 epistemic layers (`Historical Inputs`, `Model Estimates`, `User Assumptions`) + provenance badges.

4. **Slide 04 — How It Works (`The Hard Shield`)**
   - Guardrail flow separating NLQ parsing (`DecisionSpec`, `[-50%, +100%]`, `7–90d`) and zero-hallucination `verify_explanation_numbers()` from Python/Go computation + offline benchmarks (`33/33` mapping, `30/30` & `15/15` NLQ gates).

5. **Slide 05 — Infrastructure & 3-Tier Architecture**
   - Topology (`React Web :3000/:5173 -> Go Gateway & Engine :8080 -> Python ML & SQLite :8000`) + `docker compose up`, deterministic `splitmix64`, and `0.0057%–0.0219%` Go/Python parity.

6. **Slide 06 — Demo Workflow (`Single Scenario End-to-End`)**
   - 4 tightly cropped Light-Mode screenshots (`crops/crop_01_csv_upload.png`, `crop_02_column_map.png`, `crop_03_advice_card.png`, `crop_05_reverse_top.png`) showing CSV load -> Hungarian mapping (`95%`/`72%`) -> `P01 +10%` outcome -> Reverse Target Price.

7. **Slide 07 — Golden Case Proof**
   - Exact algebraic verification (`P0=100k, C=60k, Q0=10k -> Base 400.0M ₫`; `+10%`: `413.2M / 454.5M / 476.7M ₫`; `e* = -2.3412`) + bar comparison chart (`chart_golden_profit.png`).

8. **Slide 08 — Pricing Workspaces (`Monte Carlo, Templates & Reverse Search`)**
   - Live `SYNTHETIC` E2E `P01 +10%` profit distribution (`chart_montecarlo_hist.png`: `Base 88.88M ₫`, `P5 97.56M ₫`, `Exp 99.26M ₫`, `P95 101.07M ₫`, `e* = -2.425`), 6 editable scenario playbooks, and `38.8 ms` Reverse Target-Price scan.

9. **Slide 09 — Capital, Inventory & Cash Runway**
   - Plain business workflows (EOQ/ROP restock, Cash Runway safety floor, Multi-SKU capital split, EVPI/EVSI trial check) + illustrative runway fan chart (`chart_cash_runway.png`) + bottom methodology footnote (`Acklam z`, `DIO+DSO-DPO`, `Knapsack DP`, `EVPI/EVSI`).

10. **Slide 10 — Monitor, Audit & Decision Journal**
    - Demand regime breaks (`BIC`), calibration & drift monitoring (`PICP/MPIW/WIS/PSI/KS/DW`), causal verification (`DiD / HAC ITS`), and closed-loop SQLite journal (`decisions.db`) + method diagram (`chart_monitoring_regimes.png`).

11. **Slide 11 — Validation: Elasticity Recovery (`SYNTHETIC`)**
    - 5 synthetic stores (`81 SKUs`, `MAE 0.048–0.118`, `90% CI 80–100%`, `r 0.791–1.000`, `chart_spec_c_mae.png`), `11.11` bias removal (`-5.9 -> -1.8` vs `-1.5`), and `8/8` `low_price_variation` warnings (`sd(ln P) < 0.03`).

12. **Slide 12 — Validation: Out-of-Time Backtest & Engineering Suites**
    - Paired WAPE dumbbell chart across 19 holdout events (`chart_backtest_19.png`: `18/19 = 94.7%` beat baseline, `88.7%` 80%-interval coverage), disclosed miss (`grocery_fmcg_15 P04` on `11.11`: `20.6% vs 17.5%`), `PUBLIC` M5/Dunnhumby check, and verified software suites (`39 Pytest · 23 Go (-race) · 17 Vitest · 8/8 E2E · 3/3 Cross-Check`).

13. **Slide 13 — Business Impact & Deployment Model**
    - Role-by-role operational benefits, single-laptop offline CSV deployment (zero ERP lock-in), and pilot metrics tracked during the 60-day pilot.

14. **Slide 14 — Honest Limits & Schema v2 Roadmap**
    - Guardrails from `docs/LIMITS.md` (controlled observational estimate, `sd(ln P) < 0.03`, single-SKU scope, stockout censoring) + Schema v2 path (`order_id` cross-SKU baskets + `competitor_price_vnd`).

15. **Slide 15 — 60-Day Pilot Plan, Ask & Team**
    - 3-stage pilot roadmap (`Weeks 1–2 Setup`, `Weeks 3–6 Shadow + Live`, `Weeks 7–8 Profit Audit`), SME pilot partner ask, and Team Ngọa Hổ Tàng Long attribution.
