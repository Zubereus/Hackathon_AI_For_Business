# PHASE 5 — React frontend
Owner: **B** · Sprint: Wed–Thu (8h) · Depends on: P0 (fixtures), later P2/P3/P4 live endpoints · Unblocks: P7, P8 (screenshots, demo video)

## Goal
A clear 4-step flow a non-technical manager can follow: **Upload -> Confirm columns -> Review assumptions -> What-If results** (+ Reverse What-If tab as stretch).
Everything shown in VND with thousand separators; every screen carries the data-source badge.

## Allowed paths
`web/**`

## Screens
1. **Upload**: drag-drop CSV, or pick a built-in demo dataset (Synthetic Vietnam shop | Public M5 demo). Shows the badge immediately.
2. **Confirm columns**: table `your column -> field`, confidence bar, 3 sample values, dropdown override, red "required field missing" state, "margin %" input if cost is missing. "Confirm" is disabled until required fields are mapped.
3. **Assumptions**: per product elasticity (median + 90% CI), warnings as chips (low price variation, not significant ...), editable unit cost, fixed cost, stock; a "controlled estimate, not proven causality" note. Edits flow into the simulation.
4. **What-If**: input = natural-language box (stretch: P6) + always-visible manual form (product, price change %, horizon). Output = 4 scenario cards (base/optimistic/expected/pessimistic: price, quantity, revenue, profit), profit distribution chart with p5/p50/p95, break-even elasticity line, VND everywhere, "ranges not promises" wording.
5. **Reverse What-If** (stretch): target "+10% profit", constraints (max price change, stock), ranked table of feasible prices with probability of hitting the target.
6. **Validation** tab (read-only): recovery table from synthetic runs + backtest summary, copied from `docs/VALIDATION.md`.

## Rules
- MUST: develop against `contracts/fixtures/elasticity_fixture.json` first (`VITE_USE_FIXTURES=1`), then flip to live API. UI never calls Python directly — only the Go engine (:8080).
- MUST: badge component on every page; for foreign public data show amounts converted to VND with a tooltip "illustrative conversion from USD at rate X".
- MUST: errors from the API are shown as plain sentences with a manual fallback; never a blank screen. Loading states for every call.
- MUST: no number is computed in the browser except formatting. No LLM text is displayed without the numbers it cites coming from the response object.
- MUST NOT: add a UI framework beyond Tailwind + Recharts. MUST NOT: store uploaded data in localStorage.
- Accessibility basics: labels on inputs, keyboard-operable mapping dropdowns, colour is never the only signal.

## Acceptance tests
- `npm run build` and `npm test` green. Component tests: mapping table blocks confirm when required fields missing; badge renders per label; VND formatter (`1234567 -> "1.234.567 ₫"`).
- With fixtures: full flow demo-able offline in under 60 seconds, no console errors.
- Screenshot of each screen saved to `slides/screens/` (needed for P8).

## Prompt for the agent
```
Read /AGENTS.md, /docs/ARCHITECTURE.md and /phases/PHASE_5_react_frontend.md. Implement PHASE 5 in /web (Vite + React + TypeScript strict + Tailwind + Recharts).
Plan first: routes/components/state shape. Build against contracts/fixtures/elasticity_fixture.json with VITE_USE_FIXTURES=1, behind a small api.ts client so switching to the live Go engine
(:8080) is one env flag. Implement the screens in the phase file in order: Upload, Confirm columns, Assumptions, What-If; Reverse What-If and Validation last.
Rules: only call the Go engine, show a DataSourceBadge on every page, format VND at the edge only, never compute business numbers in the browser, show friendly errors with a manual fallback.
Write component tests for the cases in the phase file, run build + tests, save screenshots to slides/screens/, paste real output, append to the status log.
```

## Status log
- **2026-11-10 (Phase 5 completed)**:
  - Implemented strict TypeScript + Tailwind + Recharts React application in `web/`:
    - Core infrastructure: `web/src/types.ts` (contract-aligned interfaces), `web/src/i18n.ts` (centralized English copy + `formatVND` edge formatter `1234567 -> "1.234.567 ₫"` + FX conversion disclaimer `25.000 ₫/$`), `web/src/api.ts` (single client targeting Go gateway `:8080` with `DEFAULT_USE_FIXTURES` toggle), and `web/src/fixtures/precomputed_fixtures.json` (generated strictly by running `engine-go` on `contracts/fixtures/elasticity_fixture.json` — zero business math runs in the browser).
    - Screens implemented (`web/src/screens/`): `UploadScreen.tsx` (drag-drop CSV + Synthetic Shop / Public M5 demo cards), `MappingScreen.tsx` (confidence bars, 3 masked samples, dropdown overrides, missing-required blocker, optional fallback margin %), `AssumptionsScreen.tsx` (median elasticity + 90% bootstrap CI, warning chips, editable cost/fixed cost/stock cap, "controlled observational estimates" disclaimer), `WhatIfScreen.tsx` (NLQ box + always-visible manual controls, 4 scenario cards, Recharts histogram with instant paint, break-even elasticity panel, verified narrative summary), `ReverseWhatIfScreen.tsx` (grid optimization constraints & curve + ranked table), and `ValidationScreen.tsx` (read-only metrics matching `docs/VALIDATION.md`).
    - Updated `DataSourceBadge.tsx` on all views with symbols + text + USD conversion tooltip for `PUBLIC_M5`/`PUBLIC_DUNNHUMBY`. No uploaded data stored in `localStorage`.
  - Saved 1440x1080 headless Chrome screenshots of all 6 screens to `slides/screens/01_upload.png` .. `06_validation.png`.
  - Verification outputs:
    - `npm run build` (`tsc && vite build`): exit code 0 (`✓ 636 modules transformed`, built in `6.42s`).
    - `npm test` (`vitest run`): **4 / 4 passed in `450ms`** (`formatVND`, `DataSourceBadge`, `MappingScreen` required-field Confirm blocker, offline fixture flow with zero `console.error` calls).
  - New dependencies added to `web/package.json` (per `AGENTS.md` allowance): `recharts@^2.12.7` (charting library), `tailwindcss@^3.4.14`, `postcss`, `autoprefixer` (utility styling), and dev/test runners `vitest@^2.1.5`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` (required for headless component tests under `make test`).
- **2026-11-10 (Frontend Craft & UX Polish — Impeccable Skill)**:
  - Addressed user feedback regarding eye strain, harsh visual contrast, and cramped ergonomics across all screens.
  - Implemented authored SVG icon system (`web/src/components/Icons.tsx`) replacing unicode text glyphs (`⚠`, `↑`, `ℹ`, `■`, `▲`, `●`, `▼`) in strict compliance with the Impeccable craft floor guidelines.
  - Softened overall UI color palette and depth hierarchy in `web/src/index.css` (ambient mesh background, smooth custom scrollbars, tactile range sliders, and tabular numerals).
  - Modernized `web/src/App.tsx` with a glassmorphic top header and an executive workflow stepper with progress feedback.
  - Revamped `UploadScreen.tsx` with welcoming drag-and-drop states and clean benchmark demo cards.
  - Refined `MappingScreen.tsx` with comfortable table padding, accessible dropdowns, and clean confidence meters.
  - Elevated `AssumptionsScreen.tsx` by adding intuitive horizontal confidence interval (CI) visual meter bars for each SKU's bootstrap elasticity uncertainty.
  - Polished `WhatIfScreen.tsx` with restructured scenario cards, quick NLQ suggestion chips, and sleek dark tooltips on the Recharts Monte Carlo distribution.
  - Streamlined `ReverseWhatIfScreen.tsx` and `ValidationScreen.tsx` with clean tabular alignments.
  - Verified with `impeccable detect --json` (0 antipattern findings), `npm test` (4/4 passed), and `npm run build` (clean production build in 6.80s).
- **2026-11-10 (Eye-Care Dark Theme & Balanced Upload Grid Redesign)**:
  - Added native Dark Mode (`dark:`) support across all 6 screens with a sun/moon quick-toggle in the top header (defaults to dark mode to immediately eliminate ocular glare and eye-cramping).
  - Completely redesigned `UploadScreen.tsx` from the stacked blank dashed box layout into a balanced, side-by-side 2-column layout (7-col interactive dropzone with format badges, 5-col featured benchmark scenario cards visible above the fold without scrolling).
  - Cleaned palette to remove AI gradient cliches flagged by Impeccable detector.
  - Verified: `impeccable detect --json` (0 findings), `npm test` (4/4 passed in 1.2s), `npm run build` (production build clean in 12.2s).
