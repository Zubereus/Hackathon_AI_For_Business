# ROADMAP — 2 people, 9 phases, dates from today (Tue 10/11/2026)

Hard dates: **Fri 13/11 23:59 submit PDF (<=15 slides, English)** | Mon 16/11 finalists announced | **Thu 19/11 pitch (15 min + 5 min Q&A, 2-min demo video)**.
The PDF deck is mandatory; a prototype/MVP is a bonus. Plan: working demo by Fri 14:00, deck exported Fri 18:00, submitted Fri 21:00 (buffer).
Note: the brief's scoring table (Problem 25 / Idea 30 / Feasibility 20 / Presentation 25) differs from the detail headings (Feasibility 25 / Presentation 20) — ask the organisers; until then optimise Idea + Problem + Presentation.

| Phase | Name | Owner | When | Depends on |
|---|---|---|---|---|
| P0 | Foundation & contracts | A + B together | Tue 10/11 evening (2h) | — |
| P1 | Data layer: synthetic v2 (done) + M5/Dunnhumby loader + VND | **A** | Wed AM | P0 |
| P2 | Ingestion & NLP column mapping | **A** | Wed PM | P0, P1 |
| P3 | Elasticity engine + backtest | **A** | Thu | P1, P2 |
| P4 | Go engine: simulate + optimize (+ gateway) | **B** | Wed–Thu | P0 (fixtures only) |
| P5 | React frontend | **B** | Wed–Thu | P0 (fixtures only) |
| P6 | LLM layer: question parser + explainer | **A** | Thu PM (after P3 core) | P3 |
| P7 | Integration, QA, demo freeze | B leads, A supports | Fri to 14:00 | P2–P6 |
| P8 | Slides, pitch, 2-min video | A: method/validation slides · B: problem/product slides | Fri 14:00–21:00, then 14–18/11 | P7 |

## Parallel work, no blocking
A and B never wait for each other: B builds P4/P5 against `contracts/fixtures/elasticity_fixture.json` (made from the synthetic data); A builds P1–P3 and
emits the same contract. Integration (P7) is swapping fixture for live calls.

## Cut line (decide NOW, so Friday is not a panic)
- **MUST (by Fri 14:00):** upload CSV -> mapping screen -> elasticity with CI -> 4 scenarios + profit distribution -> data-source badge + assumptions table. Deck exported.
- **SHOULD:** synthetic-recovery proof slide, M5 backtest number, natural-language question box (with manual form fallback), VND display.
- **STRETCH (after submission, for 19/11):** Reverse What-If optimizer in the UI, LLM explanation, receipt-level ingestion, 2-min video polish.
If Thursday 18:00 phases P4/P5 are behind: ship fixture-backed UI + Python-only simulation, keep Go for after submission.

## Daily rhythm
09:00 15-min sync (blockers, contract changes) -> agent sprints -> 13:00 merge to `main` -> 18:00 merge -> 21:00 status line in each phase file.
Merge rule: tests green + phase acceptance checklist ticked + other member reviews the diff for contract violations only.
