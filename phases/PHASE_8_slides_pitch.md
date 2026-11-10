# PHASE 8 — Slides, pitch, 2-minute video
Owners: **A: method & validation slides · B: problem, product & business slides · both: rehearsal** · Sprint: Fri 14:00–21:00 (submission), Sat–Wed (finalist polish)

## Goal
English PDF, **max 15 slides**, named for submission `AI4Biz_<TeamName>_2026` (folder) -> upload via the organisers' Google Form before **23:59 13/11** (aim 21:00). Pitch 19/11: 15 min total, 2-min demo video + slides, 5 min Q&A, >= 3 team members present — **the team has 2 members: check with the organisers (Ms. Tiên 0908885090 / Ms. Phúc 0914327437) whether a third person is required or whether team size 3–5 is a hard rule for 2 people, today.**

## Allowed paths
`slides/**`, `docs/VALIDATION.md` (read-only here), screenshots in `slides/screens/`

## Slide plan (maps to the organisers' structure; 12–13 slides)
1 Title (team, name, tagline) · 2 Business problem (decisions made by gut feel; one concrete VN retail story) · 3 Target users (shop owner, merchandiser, marketing, ops) ·
4 Insight (what current spreadsheets/BI cannot answer: "what if") · 5 Solution (the 4-step flow) · 6 How AI helps (6 components; LLM only parses/explains) ·
7 How it works (architecture figure; column-mapping layer) · 8 Demo screens · 9 **Validation: synthetic recovery table** (known elasticity recovered; stated plainly it is SIMULATED) ·
10 **Validation: public-data backtest** — say it directly: *"Foreign public data validates the method; a real Vietnamese business uploads its own file through column mapping."* ·
11 Feasibility & value (resources, honest limits, expected value to be measured in pilot) · 12 Competitive advantage (Reverse What-If, uncertainty, mapping for any CSV) · 13 Next steps / pilot ask.

## Rules
- MUST: every number on a slide comes from `docs/VALIDATION.md` or a labelled assumption; no invented savings percentages.
- MUST: label synthetic and foreign data on the slide itself, not in the footnote.
- MUST NOT: include personal data, proprietary data or unlicensed images. Cite M5/Dunnhumby sources.
- MUST: AI-generated drafts are edited by the team — organisers reject work with no real team contribution. Keep a short log of your own decisions in `slides/NOTES.md`.
- Keep text minimal, one message per slide; export PDF and check <= 15 pages.

## Acceptance tests
- PDF opens, <= 15 pages, fonts embedded, English only. Both members can explain every slide without notes.
- Demo video <= 2 minutes recorded from the real app (fixtures-backed is OK if labelled).
- One full timed rehearsal <= 13 minutes, leaving time for Q&A; prepare 10 likely questions (causality, data privacy, why not just ChatGPT, accuracy, who pays).

## Prompt for the agent
```
Read /AGENTS.md, /docs/VALIDATION.md, /docs/LIMITS.md and /phases/PHASE_8_slides_pitch.md. Task: help draft the 13-slide English deck outline and speaker notes for the slides I name.
Use ONLY numbers from docs/VALIDATION.md and label synthetic/foreign data on the slide. Give me concise slide text (max 25 words per slide + one visual suggestion), then 90-second speaker notes per slide.
Also draft 10 hard Q&A questions with 3-sentence answers, including causality limits, privacy, "why not ChatGPT" and who the first paying customer is.
These are drafts for the team to rewrite in their own words.
```

## Status log
- **2026-11-10 (Phase 8 drafted — team review & PDF export remaining)**:
  - Created `slides/DECK_OUTLINE.md` (13 concise English slides adhering strictly to `<= 25` body words per slide, visual specs, explicit `SYNTHETIC` / `PUBLIC (M5/DUNNHUMBY)` / `YOUR DATA` provenance labels directly on data slides, 90-second speaker notes per slide, and strictly verified figures from `docs/VALIDATION.md`, `docs/ENGINE.md`, `docs/LIMITS.md`, and `slides/screens/*.png`).
  - Created `slides/QA_PREP.md` (10 tough judge Q&As with concise 3-sentence answers covering causality vs. correlation, zero-row-leak privacy, ChatGPT/Excel comparison, first paying beachhead & pricing, 18/19 backtest accuracy + 11.11 honest failure, flat-price `low_price_variation` warnings, foreign M5/Dunnhumby scope, missing unit cost / receipt aggregation, cannibalization/competitor bounds, and Go+Python+React offline resilience).
  - Created `slides/NOTES.md` (organizer 2-vs-3 member verification alert for Ms. Tiên/Ms. Phúc, team attribution table template, `AI4Biz_<TeamName>_2026` submission checklist, `12:15` pitch timing split, and 2-minute demo video storyboard mapped to `docs/DEMO.md` and refreshed `slides/screens/01_upload.png` .. `06_validation.png`).
  - Verified all 6 visual screens in `slides/screens/` after Phase 7 `?demo=1` fixture auto-init fix (`04_whatif.png` shows full 4 scenarios + histogram + break-even card; `05_reverse.png` shows full profit-vs-downside curve + ranked feasibility table; `06_validation.png` displays `"Spearman r"` matching `docs/VALIDATION.md`).
  - Remaining human deliverables: customize speaker edits in own words, confirm 2-person team rule with organizers, record `<= 2 min` video from running app, export PDF (`<= 15` pages, embedded fonts), run `<= 13 min` full timed rehearsal, and upload before `23:59 13/11`.
