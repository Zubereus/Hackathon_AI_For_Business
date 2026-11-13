# Pitch Deck v2 Changelog, Team Action Items & Number Traceability (`WhatIfAI_Pitch_EN_v2.pdf`)

> **Deliverables**: [`WhatIfAI_Pitch_EN_v2.pdf`](WhatIfAI_Pitch_EN_v2.pdf) (15 slides, 16:9, English, Light Theme) · Editable source: [`WhatIfAI_Pitch_EN_v2.html`](WhatIfAI_Pitch_EN_v2.html).

---

## 1. Summary of Structural & Visual Changes (v1 → v2)

| Slide | v1 Structure | v2 Rebuilt Structure & Rationale |
| :---: | :--- | :--- |
| **01** | Dark hero / cover variant | Clean light cover (`#FAF8F3` / `#FFFFFF`), no dark borders; explicit **`SYNTHETIC backtest`** badge beside `18 / 19`; clean team roster (`Nguyễn Hoàng Tùng (Leader) · Phạm Viết Trường · Ngô Thanh Tùng`). |
| **02** | Split Problem + Target Users (legacy Slides 2 & 3) | Unified **Why This Exists · What It Is · Core Value** 3-column canvas + **4-role bottom question strip** (Shop Owner, Merchandiser, Marketing, Inventory Ops). |
| **03** | Competitor Matrix + 3-Layer Epistemology | Focused **Excel/BI vs Generic LLM Chat vs What-If AI** comparison; competitor claim limited strictly to *"Accepts CSV exports from KiotViet, Sapo, Excel"*; preserves 3-layer provenance + all 4 provenance badges. |
| **04** | Text-heavy Zero-LLM explanation | Visual **Hard Shield** pipeline diagram (`Question/CSV → Hard Shield → Python ML + Go Math → verify_explanation_numbers()` → Template fallback) + 3 compact proof tiles (`33/33`, `30/30` & `15/15`, offline mode). |
| **05** | Vertical text-heavy 3-tier list | Added top **3-Tier Request Topology diagram** (`:3000 ➔ :8080 ➔ :8000`) + tight non-stretched cards + reconciled `Python 3.10+ (Docker 3.12-slim)` + determinism proof (`0.0057%–0.0219%`, `GOMAXPROCS 1=8+`). |
| **06** | Small full-page screenshots | Replaced with **4 zoomed UI crops** (`slides/screens/crops/crop_01..03, 05`) tracing one consistent scenario (**CSV → Map → P01 +10% Outcome → Reverse Target Price**) so every UI text element is legible when projected. |
| **07** | Golden Case table + chart | Exact analytical benchmark (`Base 400.0M ₫ → Pess 413.2M / Exp 454.5M / Opt 476.7M`, `e* = -2.3412`) paired with high-contrast bar chart (`Exact match with reference formula`). |
| **08** | Monte Carlo + Templates + Reverse Search | Explicit **`SYNTHETIC · e* = -2.425`** badge directly on histogram & caption (`Base 88.88M -> P5 97.56M -> Exp 99.26M -> P95 101.07M`), 6 editable templates, and exact **`38.8 ms`** reverse grid search. |
| **09** | Technical EOQ/CCC/DP/EVPI jargon in main copy | Rewritten into plain business benefits (*"Reorder Quantity & Timing"*, *"Cash Safety Protection"*, *"Multi-SKU Capital Split"*, *"Test Before Committing"*); math jargon (`Acklam z`, `DIO+DSO-DPO`, `DP`, `EVPI/EVSI`) moved to bottom footnote strip + `ILLUSTRATIVE · USER ASSUMPTIONS` chart. |
| **10** | Heavy BIC/PICP/WIS/DiD/ITS main bullets | Rewritten into 3 benefit blocks + Method Diagram + **4-Step SQLite Feedback Loop diagram** (`Decision → Actual Outcome → Audit vs P5–P95 → Update SQLite`); technical metrics placed in bottom footnote strip. Replaced empty offline snapshot screenshot (`08_journal.png`) with crisp closed-loop diagram. |
| **11** | Spec-C Elasticity Recovery | Every metric tagged **`SYNTHETIC`** (`5 stores, 81 SKUs, MAE 0.048–0.118, 90% CI 80–100%`, `11.11 stress -5.9 -> -1.8 vs -1.5`, flat-price `8/8` at `sd(ln P) < 0.03`) + explicit disclosure: *"never presented as live VN receipts"*. |
| **12** | Backtest + Suites | **`18/19 (94.7%)` · `88.7%` cov (`SYNTHETIC`)** + prominent red-tinted **`grocery_fmcg_15 P04` (`11.11`, `20.6% vs 17.5%`)** disclosure + `PUBLIC (M5/Dunnhumby)` check + live-verified test totals (**`39 Pytest · 23 Go (-race) · 17 Vitest · 8/8 E2E · 3/3 Cross-Check`**). |
| **13** | *(New Slide in v2)* | **Business Impact & Deployment Model**: value across all 4 SME roles, faster/safer decisions, zero-lock-in offline laptop CSV deployment, pilot KPIs (`to be measured in the 60-day pilot`), and commercial placeholder. |
| **14** | Technical limitations list | Structured **Guarded Boundaries (`docs/LIMITS.md`)** + **Schema v2 Upgrade Bar** (`order_id` bundles + `competitor_price_vnd` feed). |
| **15** | Dark closing slide | Unified light canvas (no dark borders), **Weeks 1–2 / 3–6 / 7–8 Pilot Timeline**, explicit SME Pilot Partner Ask, clean Team roster, and `"Thank you · Ready for Q&A"`. |

**Cross-deck typographic & border upgrades**:
- Light `#FAF8F3` / `#FFFFFF` palette standardized on **all 15 slides** (eliminated dark/black borders from Slides 1, 8, and 15).
- Body & table copy raised to **`>= 14pt`** throughout (technical footnotes `10pt` strictly for secondary formula details).
- Removed oversized blank areas inside cards by decoupling text-card heights from fixed `1fr` stretches.

---

## 2. Clean Submission Policy (No Placeholder Clutter)

All inline placeholder tags were removed cleanly per team instruction while keeping **strict factual honesty** (zero invented customer counts, ROI percentages, financial forecasts, or unverified role splits):

- **Slides 1 & 15 (Team)**: Displays verified roster **Ngọa Hổ Tàng Long** — `Nguyễn Hoàng Tùng (Leader)`, `Phạm Viết Trường`, `Ngô Thanh Tùng` cleanly without artificial role labels or placeholder tags.
- **Slide 2 (Why This Exists)**: Focuses strictly on verified product/market gaps `(a)–(d)` (`SYNTHETIC` confounding `-5.9` vs `-1.5`) without synthetic quotes or anecdotes.
- **Slide 13 (Pilot KPIs & Commercial Rollout)**: States qualitatively that quantitative business KPIs (*prep time, stockout prevention, P5–P95 hit rate, margin protection*) will be measured in the 60-day pilot alongside commercial packaging validation.

---

## 3. Discrepancy Reconciliation & Full Number Traceability Matrix

### A. Discrepancies Found & Resolved During Audit

| Conflict / Gap Observed | Sources Checked | Resolution Adopted in v2 Deck |
| :--- | :--- | :--- |
| **`39 ms` / `<= 39 ms` vs `38.8 ms`** | `slides/DECK_OUTLINE.md` (`~39 ms`), `docs/ENGINE.md` (`38,776,681 ns/op` = `38.8 ms`) | Standardized strictly on **`38.8 ms`** (`101 prices × 5,000 draws`) everywhere. |
| **Python `3.10+` vs `3.12`** | `ml-py/pyproject.toml` (`requires-python = ">=3.10"`), `ml-py/Dockerfile` (`FROM python:3.12-slim`), `README.md` (`3.10+`) | Stated explicitly on Slide 5 as **`Python 3.10+ (Docker 3.12-slim)`**. |
| **`sd(ln P) < 0.03` vs `< 0.04`** | `ml-py/app/elasticity/fit.py:42` (`LOW_PRICE_SD_THRESHOLD = 0.03`), `docs/VALIDATION.md` (`< 0.030`), `docs/LIMITS.md:13` (`< 0.04`) | Used code-verified threshold **`sd(ln P) < 0.03`** on Slides 11 & 14; noted stale `0.04` doc text in `docs/LIMITS.md`. |
| **Go / Pytest / E2E Counts** | `README.md` (`8/8 E2E`, `39 Pytest`, `17 Vitest`, `4 Go packages`), live runs (`go test`, `pytest`, `vitest`) | Reported exact live-observed counts on Slide 12: **`39 Pytest · 23 Go (-race) across 4 packages · 17 Vitest across 4 files · 8/8 E2E · 3/3 Cross-Check`**. |

### B. Complete Metric-to-Repo Traceability Table

| Slide(s) | Exact Figure / Claim in Deck | Provenance Label | Verified Repository Source |
| :--- | :--- | :--- | :--- |
| **1, 3, 8, 13** | `38.8 ms` (`101 × 5,000` draws) | Measured Engine Benchmark | `docs/ENGINE.md` (`38,776,681 ns/op`, `BenchmarkOptimizeGrid_100x5000`) |
| **1, 12** | `18 / 19 (94.7%)` beat naive · `88.7%` 80% coverage | **SYNTHETIC** | `docs/VALIDATION.md` (Section 3, 19-event holdout table) |
| **2, 3, 11** | `11.11 / Tết` confounding: `-5.9` naive → `-1.8` Spec-C vs `-1.5` true | **SYNTHETIC** | `docs/VALIDATION.md` (`hard_event_confounded_12`, 12 SKUs) |
| **4** | `33 / 33 (100%)` offline map confidence `>= 0.55` | Deterministic Benchmark | `README.md` & `slides/NOTES.md` |
| **4** | `30 / 30` valid NLQ parsed · `15 / 15` unsafe blocked | Automated Guardrail Suite | `phases/PHASE_6_llm_layer.md:43` (`test_llm_nlq.py`) |
| **5** | Go vs Py P50 diff `0.0057%–0.0219%` (`< 0.5%`), `GOMAXPROCS 1 = 8+` | Live Cross-Check | `e2e/cross_check_py_go.py`, `docs/ENGINE.md`, `README.md` |
| **6** | `12,420` rows (`sales_synthetic_vn.csv`), `95%`/`72%` alias scores, `P01 +10%` snapshot | **Sample Snapshot UI** | `slides/screens/02_mapping.png`, `03_assumptions.png`, `05_reverse.png` |
| **7** | `P0=100k, C=60k, Q0=10k -> Base 400.0M ₫; 413.2M / 454.5M / 476.7M; e*=-2.3412` | Analytical Golden Case | `README.md`, `engine-go/internal/sim/simulate_test.go` |
| **8** | `P01 +10%: Base 88.88M, P5 97.56M, Exp 99.26M, P95 101.07M ₫; e*=-2.425` | **SYNTHETIC** (`e2e`) | `e2e/demo_path.py` (step `5/8` live run output) |
| **11** | 5 stores (`81 SKUs`): `MAE 0.048–0.118`, `90% CI 80–100%`, `r 0.791–1.000` | **SYNTHETIC** | `docs/VALIDATION.md` (Section 2 summary table) |
| **11** | `8 / 8 (100%)` flat-price SKUs flagged (`sd(ln P) = 0.013 < 0.03`) | **SYNTHETIC** | `docs/VALIDATION.md:33`, `ml-py/app/elasticity/fit.py:42` |
| **12** | Disclosed miss `grocery_fmcg_15 P04` (`11.11, -28.7%`): WAPE `20.6% vs 17.5%` naive | **SYNTHETIC** | `docs/VALIDATION.md` (Section 3 table) |
| **12** | Walmart `PUBLIC (M5)` & `Dunnhumby` ingestion (`25.000 ₫/$` illustrative) | **PUBLIC** | `docs/LIMITS.md:17`, `config/fx.json` |
| **12** | `39 Pytest · 23 Go (-race) · 17 Vitest · 8/8 E2E · 3/3 Cross-Check` | Live Verified Suites | Direct tool output from `pytest`, `go test -race`, `vitest`, `e2e/*.py` |
