# What-If AI — Pitch Rehearsal Log, Team Decisions & Submission Checklist

> **CRITICAL ORGANIZER CHECK (FROM `phases/PHASE_8_slides_pitch.md`)**:
> Our team currently has **2 members**, while the hackathon rule lists `>= 3` members present at the final pitch (3–5 rule).
> **Action Required Immediately**: Contact organizers **Ms. Tiên (`0908885090`)** or **Ms. Phúc (`0914327437`)** to confirm whether a 2-member team is approved as-is or if a 3rd member must join before submission.

---

## 1. Team Contributions & Decision Log (For Authentic Team Attribution)
*(Update this table with real member names, slide edits, and demo recording ownership before final submission so every reviewer sees authentic human authorship.)*

| Area | Primary Owner | Key Design & Method Decisions Made by Team |
|---|---|---|
| **Architecture & Contracts** | Member A + Member B | Froze shared JSON schemas (`contracts/`) upfront so `ml-py`, `engine-go`, and `web` developed cleanly in parallel with zero LLM arithmetic. |
| **Econometrics & Data** | Member A | Chose Spec-C Poisson GLM + week-block bootstrap + VN Lunar calendar / double-day windows + automatic `low_price_variation` warnings (`hard_low_price_variation_8` 8/8 flagged). |
| **NLP Mapping & NLQ Guardrails** | Member A | Combined deterministic dictionary/shape scoring + Hungarian assignment (`33/33` offline accuracy, zero leaked rows) and numeric regex post-checking on LLM explanations. |
| **Go Engine & Frontend UX** | Member B | Built stateless `splitmix64` Monte Carlo & grid optimizer (`38.8 ms` / 101x5k) and 6-screen React UI with mandatory data provenance badges & dot-grouped VND edge formatting. |
| **Slides & Final Story** | Both (`[Edit Here]`) | *(Add your concrete headline rewrites, chosen retail store story on Slide 2, and custom visuals created for Canva/PowerPoint/Google Slides export.)* |

---

## 2. Submission Packaging Checklist (Before 23:59 Fri 13/11/2026 — Target 21:00)
- [ ] Replace `[TeamName]` across `slides/DECK_OUTLINE.md` (and your slide tool: PowerPoint/Google Slides/Figma/Canva).
- [ ] Export presentation as **English PDF (`<= 15` pages, fonts embedded)** inside submission folder named `AI4Biz_<TeamName>_2026`.
- [ ] Verify **every slide displays provenance labels directly on charts/tables** (`SYNTHETIC`, `PUBLIC (M5/DUNNHUMBY)`, `YOUR DATA`).
- [ ] Record **<= 2:00 demo video** from the running app (see Storyboard below), crisp 1080p audio/screen capture, zero mocked edits.
- [ ] Run end-to-end pre-submission repo sanity checks (`e2e/demo_path.py`, `e2e/cross_check_py_go.py`, `pytest`, `go test`, `npm test`), commit cleanly, and tag `v0.1-submission`.
- [ ] Upload folder/form via organizers' Google Form well before 21:00.

---

## 3. Pitch Pacing Plan (`15 min Total = <= 13 min Presentation + Demo + 5 min Q&A`)
*(Check exact final-round stopwatch structure on 19/11: typically ~10–11 min slides + 2 min video inside 13 min, followed by 5 min Q&A).*

| Segment | Slides | Speaker | Target Time | Key Transition Cue |
|---|---|---|---|---|
| **Hook & Problem** | Slides 1–4 | Member B | `2:45` | End Slide 4: *"So instead of guessing formulas or trusting LLM arithmetic, how should managers decide?"* |
| **Solution & AI Roles** | Slides 5–7 | Member A | `2:30` | End Slide 7: *"Now let's watch a real Vietnamese CSV move through all three tiers in two minutes."* |
| **2-Min Live/Video Demo** | Slide 8 | Member B narrates | `2:00` | Highlight `VN CSV Upload -> Map Confirm -> Spec-C Fit -> +10% What-If -> Reverse Curve`. |
| **Validation & Honesty** | Slides 9–11 | Member A | `3:00` | Emphasize `SYNTHETIC` ground-truth table + `18/19` holdout + `1/19` honest miss + operational limits. |
| **Moat & Pilot Ask** | Slides 12–13 | Member B | `2:00` | Clear close: 3 retail shops, 60-day shadow + A/B pilot, ready for judge questions. |
| **Total Presentation** | **13 Slides** | **Both** | **`12:15`** | Leaves 45s safety margin under `13:00`. |

---

## 4. 2-Minute Demo Video Storyboard (Anchored to `docs/DEMO.md` & `slides/screens/`)
1. **`0:00 – 0:20` (Upload & Provenance — `01_upload.png`)**: Show home screen, top-right badge, drag-drop `data/synthetic/out/messy_variants/vn_headers_vn_numbers/input.csv` (`YOUR DATA` badge activates immediately).
2. **`0:20 – 0:45` (Mapping & Unit Recovery — `02_mapping.png`)**: Highlight `Ngày bán -> date`, `Giá bán (VNĐ) -> price`, masked samples, dropdown validation blocker, then click **Confirm Mapping & Estimate Elasticity**.
3. **`0:45 – 1:05` (Assumptions & Guardrails — `03_assumptions.png`)**: Show `P01` median `-1.265` (or `-1.19` in fixture mode), `90% CI`, `"controlled observational estimates"` note, editable cost/stock cap.
4. **`1:05 – 1:35` (What-If + Zero Hallucination — `04_whatif.png`)**: Submit NLQ `"If I increase P01 price by 10% for the next 30 days?"`; reveal 4 Scenario Cards, Monte Carlo Profit histogram (`P5`..`P95`), Break-Even Elasticity (`-2.42`), and verified summary prose.
5. **`1:35 – 2:00` (Reverse What-If + Validation — `05_reverse.png`, `06_validation.png`)**: Open Reverse tab (`+10%` uplift target, `25%` min margin), click **Find Optimal Prices**, pan to ranked profit frontier (`<= 39 ms`), finish with `1s` flash on `6. Validation` scorecard.

