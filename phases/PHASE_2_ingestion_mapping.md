# PHASE 2 — Ingestion & NLP column mapping
Owner: **A** · Sprint: Wed 11/11 afternoon (6h) · Depends on: P0, P1 · Unblocks: P3, P5 (mapping screen), P7

## Goal
Any company's CSV -> canonical schema, with confidence and human confirmation. Full design: `docs/NLP_COLUMN_MAPPING.md` (read it first).

## Allowed paths
`ml-py/app/ingest/**`, `ml-py/app/mapping/**`, `ml-py/tests/test_mapping_*.py`, `ml-py/tests/test_ingest_*.py`

## Deliverables
1. `ingest/profile.py` — column profiler (dtype, date-parse rate over several formats, numeric rate with VN/EN separators, cardinality, masked samples).
2. `mapping/dictionary.py` — synonym dictionary per canonical field: Vietnamese (with and without diacritics), English, ERP abbreviations.
3. `mapping/scoring.py` — `name_score`, `value_score`, optional `embed_score` (skip gracefully when the model is unavailable), combine with weights from the design doc.
4. `mapping/assign.py` — Hungarian assignment + thresholds (auto >= 0.55, confirm 0.35–0.55, else unmapped).
5. `mapping/llm_adjudicator.py` — ONLY for ambiguous pairs (top-2 gap < 0.15); sends headers + <= 5 masked samples; strict JSON output; timeout 8 s; on any failure return "unmapped/confirm" (never guess).
6. `ingest/transform.py` — date format, number locale, price unit (x1000), grain detection + aggregation (receipt-level -> daily), canonical frame + quality report.
7. Endpoints `/ingest/profile`, `/ingest/map`, `/ingest/commit` per `docs/ARCHITECTURE.md`; mapping memory keyed by header-set hash in `workdir/mappings.json`.

## Rules
- MUST: deterministic path works with NO network and NO LLM key (LLM and embeddings are optional boosters).
- MUST: a low-confidence mapping is surfaced as "confirm", never silently applied. Required fields missing -> `missing_required` populated, `/commit` refuses.
- MUST NOT: send raw rows or full columns to any LLM. Mask digits in sample values that look like phone numbers/IDs (replace with `#`).
- MUST NOT: special-case the five test files by name. The test set is a measurement, not a lookup table.
- Money/units: output `price` and `unit_cost` as integer VND.

## Acceptance tests
- For each of the 5 folders in `data/synthetic/out/messy_variants/`: `map` result compared with `mapping_truth.json`: **>= 95% of present fields correct overall, 0 wrong mappings with confidence >= 0.55**.
- `commit` on every variant returns a canonical frame; for `vn_headers_vn_numbers` the prices/quantities equal the original `fashion_shop_12` rows (first 6 products) after transformation.
- `receipt_level_transactions` is aggregated to (date, product) with summed quantity and quantity-weighted price; `price_in_thousands_name_only` is scaled x1000 and gets slug ids; missing cost -> `warnings` contains `"unit_cost missing: margin % required"`.
- Runs offline: `pytest -q ml-py/tests/test_mapping_*.py` green with network disabled.

## Prompt for the agent
```
Read /AGENTS.md, /docs/NLP_COLUMN_MAPPING.md, /docs/ARCHITECTURE.md and /phases/PHASE_2_ingestion_mapping.md. Implement PHASE 2.
Plan first (files, signals, thresholds), then build bottom-up with a test after each module: profile -> dictionary -> scoring -> assign -> transform -> endpoints.
Deterministic scoring (rapidfuzz name match on diacritic-stripped tokens + value-shape checks) must work offline; embeddings and the LLM adjudicator are optional boosters
that you wire in last and that fail soft. Measure on data/synthetic/out/messy_variants/*/mapping_truth.json and print a per-variant table
(field, predicted, truth, confidence, correct). Do not special-case file names. Never send raw rows to an LLM; mask digit-like values in samples.
Stop when the acceptance tests in the phase file pass; paste real output; append to the status log.
```

## Status log
- 2026-11-10: Phase 2 Ingestion & NLP Column Mapping implemented and benchmarked:
  1. ml-py/app/ingest/profile.py: column profiler with date/numeric formats, VN/EN locales, masked samples.
  2. ml-py/app/mapping/dictionary.py: normalized synonym dictionary across VN, EN, and ERP headers.
  3. ml-py/app/mapping/scoring.py: name_score, value_score, and composite confidence combinator.
  4. ml-py/app/mapping/assign.py: Hungarian assignment with auto (>=0.55), confirm (0.35-0.55), and unmapped thresholds.
  5. ml-py/app/mapping/llm_adjudicator.py: privacy-safe LLM adjudicator with 8s timeout and soft fallback.
  6. ml-py/app/ingest/transform.py: date normalization, price scaling, receipt-level aggregation, integer VND output.
  7. ml-py/app/main.py: operational endpoints /ingest/profile, /ingest/map, /ingest/commit with mapping memory hash in workdir/mappings.json.
  8. ml-py/tests/test_mapping_variants.py: verified against all 5 messy variants (>=95% accuracy, 0 false positives >=0.55). Unblocks Phase 3 and Phase 5.
