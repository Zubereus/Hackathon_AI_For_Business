# PHASE 6 — LLM layer: question parser + explainer
Owner: **A** · Sprint: Thu 12/11 afternoon (3h) · Depends on: P3 core · Unblocks: P5 NL box, P7

## Goal
Managers type "What if I raise the white shirt price 10% next month?" -> structured `DecisionSpec`; after simulation the LLM explains the result in plain language **using only numbers it was given**.

## Allowed paths
`ml-py/app/llm/**`, `ml-py/tests/test_llm_*.py`, `data/samples/nlq_questions.json`

## Deliverables
1. `llm/client.py` — provider-agnostic wrapper (env `LLM_PROVIDER`, `LLM_API_KEY`), timeout 10 s, 1 retry, no logging of prompts that contain data.
2. `llm/parse.py` — question + product catalog (id, name only) -> JSON validated by pydantic (`DecisionSpec`: price change % in [-50, 100], horizon 7–90 days, product must exist in the catalog; fuzzy-match product names with diacritic stripping before asking the LLM). Out-of-range or unknown product -> `{error, fallback:"manual_form"}`.
3. `llm/explain.py` — input = the exact scenario result JSON; output = 3–5 sentences. **Post-check**: every number in the text must appear in the input (after rounding/formatting); otherwise discard the text and return a templated, code-generated explanation.
4. `data/samples/nlq_questions.json` — >= 40 labelled questions (Vietnamese and English, typos, mixed units, impossible values like "tăng giá 500%") with expected JSON.
5. Endpoints `/nlq/parse`, `/nlq/explain`.

## Rules
- MUST: the app is fully usable without any LLM (manual form + templated explanation).
- MUST: temperature 0, JSON-schema-constrained output when the provider supports it.
- MUST NOT: send datasets, rows, customer data or computed business figures to the model during `parse`; `explain` receives aggregates only.
- MUST NOT: let the LLM choose model parameters, elasticities, or fill in missing numbers.

## Acceptance tests
- On `nlq_questions.json`: >= 90% correct JSON for valid questions, 100% rejection of out-of-range/unknown-product questions (report real figures; if no key is available, run the rule-based fallback parser and report that figure instead).
- Explainer post-check test: a hallucinated number in a fake LLM answer triggers the template fallback.

## Prompt for the agent
```
Read /AGENTS.md, /docs/ARCHITECTURE.md and /phases/PHASE_6_llm_layer.md. Implement PHASE 6.
Plan first. Build a provider-agnostic LLM client (env-configured, timeouts, no data in logs), then parse.py: fuzzy-match product names (strip diacritics) against the catalog, ask the LLM only for
the structured fields, validate with pydantic, reject out-of-range values and unknown products with fallback "manual_form". Then explain.py with a post-check that every number in the text exists in the
input JSON, else return a code-generated template. Create data/samples/nlq_questions.json (>= 40 Vietnamese/English questions incl. typos and impossible values) and tests that measure accuracy.
The system must work with no API key (rule-based parser fallback). Never send rows or computed business figures to parse. Paste real accuracy numbers; append to the status log.
```

## Status log
- **2026-11-10**: Completed Phase 6 (LLM layer: question parser + explainer):
  - Implemented `ml-py/app/llm/client.py` (provider-agnostic wrapper supporting OpenAI-compatible and Gemini endpoints, temperature=0.0, timeout=10s, 1 retry, no data logging).
  - Implemented `ml-py/app/llm/parse.py` (diacritic-stripped fuzzy catalog matching, rule-based offline parser fallback, optional LLM JSON extraction, strict Pydantic `DecisionSpec` validation returning `{"error": ..., "fallback": "manual_form"}` on out-of-range/unknown product).
  - Implemented `ml-py/app/llm/explain.py` (strict zero-hallucination numerical post-check verifying every figure in prose against `scenario_result`, falling back to deterministic code-generated explanation on any mismatch).
  - Created `data/samples/nlq_questions.json` (45 labelled questions across VN/EN, typos, mixed durations, extreme % errors, and unknown products).
  - Wired `POST /nlq/parse` and `POST /nlq/explain` in `ml-py/app/main.py` and updated `ml-py/tests/test_contracts.py`.
  - Executed `ml-py/tests/test_llm_nlq.py` (rule-based offline mode): Valid Question Accuracy = **30/30 (100.0%)**, Rejection Rate = **15/15 (100.0%)**, hallucination post-check verified (`3 passed in 4.23s`).
