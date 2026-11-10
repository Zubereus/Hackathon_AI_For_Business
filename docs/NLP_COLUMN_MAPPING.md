# NLP column-mapping layer — design

Goal: accept any company's CSV (any header names, any number of columns, VN/EN/abbreviations, VN number formats) and produce the canonical schema.
Principle: **cheap and deterministic first, LLM only for the ambiguous remainder, human confirms before anything is used.**

## Pipeline (each step has an intermediate output you can print and test)
1. **Profile** every column: dtype guess, % parsable as date (try several formats), % numeric (after stripping `.`/`,` thousand separators and currency text), n_unique, null %, min/median/max, sample values.
2. **Score** every (canonical field, source column) pair with four signals, each in 0..1:
   - `name_score`: normalise header (lowercase, strip Vietnamese diacritics, split snake/camel/space, drop punctuation) then fuzzy match (rapidfuzz) against a synonym dictionary per field, e.g. quantity: `qty, quantity, sl, so luong, sl ban, units, sold, so_luong_ban`; price: `price, gia, gia ban, don gia, unit_prc, sell_price`.
   - `embed_score`: cosine similarity between a multilingual sentence embedding of "header + 3 sample values" and the field description (use `sentence-transformers` multilingual MiniLM; if the model cannot be downloaded offline, skip this signal and renormalise weights).
   - `value_score`: type/shape evidence. date: >=95% parse. price: positive numeric, many distinct values, median in 1e3..1e8 (VND scale). quantity: non-negative integers. stock: non-negative integers that move smoothly. product_id: string repeated across dates, n_unique << n_rows. category: low-cardinality text. promo: binary-like.
   - `llm_score`: ONLY for pairs whose top-2 candidates differ by < 0.15. Send header names + <=5 masked samples, get JSON `{field, column, reason}` back. Never send raw rows.
3. **Combine**: `score = 0.35*name + 0.25*embed + 0.40*value` (tune on the test set; renormalise if embed missing).
4. **Assign** with the Hungarian algorithm (`scipy.optimize.linear_sum_assignment`) so one source column maps to at most one field. Threshold: `score >= 0.55` auto-accept, `0.35..0.55` flag "please confirm", below -> unmapped.
5. **Transform**: detect date format, number locale (`1.234.567` vs `1,234,567.5`), price unit (header contains `nghin`/`ngan`/`k` or median < 1000 while cost scale suggests thousands -> x1000), grain (if (date, product) repeats, aggregate: sum quantity, quantity-weighted mean price).
6. **Quality report**: row count, date range, missing fields, duplicates, price variation (sd of ln price per product), stockout share. Missing optional fields degrade gracefully (cost -> ask margin %, stock -> unconstrained).
7. **Human confirmation** in the UI (table: source column -> field, confidence bar, sample values, dropdown override). Save the confirmed mapping keyed by the hash of the header set so the same company never re-maps.

Unmapped numeric columns are offered as optional covariates (e.g. `ad_spend`, `competitor_price`) — the user ticks which to include.

## Test set (already generated)
`data/synthetic/out/messy_variants/*/{input.csv, mapping_truth.json}` — 5 variants (VN headers + VN numbers, ERP abbreviations, English + junk columns with no cost/stock, price in thousands + name only, receipt-level transactions).
Targets: >= 95% of present fields mapped correctly; **zero silent wrong mappings** (a wrong mapping must be flagged "confirm"); every variant ends with a valid canonical frame equal to the original (within rounding).
