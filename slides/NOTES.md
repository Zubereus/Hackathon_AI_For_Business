# What-If AI — Pitch Rehearsal Log & Submission Checklist

> **Submission Team (`AI4Biz_NgoaHoTangLong_2026`)**:
> - **Team Name**: **Ngọa Hổ Tàng Long**
> - **Leader**: **Nguyễn Hoàng Tùng**
> - **Members**: **Phạm Viết Trường**, **Ngô Thanh Tùng**

---

## 1. Key Engineering & Product Design Choices

| Area | Core Architecture & Verification Highlights |
|---|---|
| **Architecture & Contracts** | Froze shared JSON schemas (`contracts/`) upfront so `ml-py` (`:8000`), `engine-go` (`:8080`), and `web` (`:5173`) operate cleanly in parallel with strict `Zero LLM Math`. |
| **Econometrics & Monitoring** | Spec-C Poisson GLM + week-block bootstrap + VN Lunar calendar / double-day windows + automatic `low_price_variation` guard (`sd(ln P) < 0.03`, `8/8` flagged), plus `PICP/MPIW/WIS`, `BIC` regimes, `PSI/KS/DW` drift, and `DiD / HAC ITS` audits. |
| **NLP Mapping & NLQ Guardrails** | Combined dictionary/shape scoring + Hungarian assignment (`33/33` offline accuracy, zero leaked raw rows) and numeric regex post-checking (`verify_explanation_numbers()`) on LLM explanations. |
| **Go Engine & React UI** | Built stateless `splitmix64` Monte Carlo, constrained `38.8 ms` (`101 × 5,000`) Reverse Optimizer, EOQ/CCC/DP/EVPI planning endpoints, and bilingual (`VI | EN`) Light/Dark React UI with mandatory provenance badges. |

---

## 2. Submission Packaging Checklist (Before 23:59 Fri 13/11/2026)

- [x] Finalized **Ngọa Hổ Tàng Long** roster (**Nguyễn Hoàng Tùng (Leader)**, **Phạm Viết Trường**, **Ngô Thanh Tùng**) across all deliverables.
- [x] Exported **15-page English PDF (`16:9`, light theme, embedded fonts)** at [`WhatIfAI_Pitch_EN_v2.pdf`](WhatIfAI_Pitch_EN_v2.pdf) alongside [`WhatIfAI_Pitch_EN_v2.html`](WhatIfAI_Pitch_EN_v2.html).
- [x] Prepared presenter scripts ([`SPEAKER_NOTES.md`](SPEAKER_NOTES.md)), 10 judge Q&As ([`QA_PREP.md`](QA_PREP.md)), and discrepancy/traceability audit ([`CHANGES.md`](CHANGES.md)).
- [x] Verified **provenance badges** (`SYNTHETIC`, `PUBLIC`, `YOUR DATA`, `ILLUSTRATIVE`) appear directly on data slides/charts and verified zero `[TEAM TO CONFIRM]` placeholders remain.
- [x] Verified live repo suites (`39` Pytest, `23` Go `-race`, `17` Vitest + `vite build`, `8/8` E2E, `3/3` Python-Go cross-check).
- [ ] Record **<= 2:00 demo video** from the running app (storyboard below), crisp 1080p screen capture, zero mocked edits.
- [ ] Upload final submission package before the organizers' deadline.

---

## 3. Pitch Pacing Plan (`15 Slides · Core Talk + Demo + 5 min Q&A`)

*(Use [`SPEAKER_NOTES.md`](SPEAKER_NOTES.md) for the exact per-slide script.)*

| Segment | Slides | Target Pace | Focus |
|---|---|---|---|
| **Hook, Problem & Gap** | Slides 01–03 | `~2:30` | Cover proof badges, SME pain + `11.11` confounding, Excel vs LLM vs What-If AI. |
| **Hard Shield & Architecture** | Slides 04–05 | `~1:30` | `Zero LLM Math` shield + `docker compose up` 3-tier flow (`0.0057%–0.0219%` parity). |
| **Live Flow, Golden Case & Pricing** | Slides 06–08 | `~2:30` | Tight UI crops, `400.0M -> 454.5M` Golden Case, `P01` Monte Carlo & `38.8 ms` grid search. |
| **Capital Planning & Closed Loop** | Slides 09–10 | `~1:45` | EOQ/Cash Runway/Portfolio/EVPI benefits + regime/drift audit + SQLite Journal loop. |
| **Validation, Impact & Pilot** | Slides 11–15 | `~3:15` | `SYNTHETIC` `MAE 0.048–0.118`, `18/19` + honest `P04` miss, operational impact, limits & 60-day pilot ask. |

---

## 4. 2-Minute Demo Video Storyboard (Anchored to `docs/DEMO.md` & `slides/screens/`)

1. **`0:00 – 0:20` (Upload & Provenance — `01_upload.png`)**: Show home screen, top-right badge, drag-drop `data/synthetic/out/messy_variants/vn_headers_vn_numbers/input.csv` (`YOUR DATA` badge activates immediately).
2. **`0:20 – 0:45` (Mapping & Unit Recovery — `02_mapping.png`)**: Highlight `Ngày bán -> date`, `Giá bán (VNĐ) -> price`, masked samples, dropdown validation blocker, then click **Confirm Mapping & Estimate Elasticity**.
3. **`0:45 – 1:05` (Assumptions & Guardrails — `03_assumptions.png`)**: Show `P01` median `-1.265` (or `-1.19` in fixture mode), `90% CI`, `"controlled observational estimates"` note, editable cost/stock cap.
4. **`1:05 – 1:35` (What-If + Zero Hallucination — `04_whatif.png`)**: Submit NLQ `"If I increase P01 price by 10% for the next 30 days?"`; reveal 4 Scenario Cards, Monte Carlo Profit histogram (`P5`..`P95`), Break-Even Elasticity (`-2.42`), and verified summary prose.
5. **`1:35 – 2:00` (Reverse What-If + Validation — `05_reverse.png`, `06_validation.png`)**: Open Reverse tab (`+10%` uplift target, `25%` min margin), click **Find Optimal Prices**, pan to ranked profit frontier (`38.8 ms`), and finish with a brief look at `Validation` scorecard & `Capital Planning` / `Journal`.
