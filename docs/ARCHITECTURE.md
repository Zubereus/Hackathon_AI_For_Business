# ARCHITECTURE & CONTRACTS

```
React (web :5173)  ──HTTP──►  Go engine (:8080, single public entry)  ──HTTP──►  Python ML (ml-py :8000)
                               • /api/simulate  (Monte Carlo, goroutines)         • ingest + NLP column mapping
                               • /api/optimize  (price grid + constraints)        • elasticity fit + bootstrap
                               • proxies /api/ingest|elasticity|nlq|backtest      • backtest, LLM parse/explain
```
Why this split: Python owns statistics and NLP (pandas, scikit-learn, embeddings). Go owns the CPU-bound, embarrassingly parallel part
(thousands of simulations x hundreds of price points) and is the single stateless gateway. The Go engine holds **no data**: every call carries
what it needs, so it can be developed and tested against `contracts/fixtures/` before the Python side exists.

## Canonical sales schema (output of column mapping, input of everything else)
| field | required | type | notes |
|---|---|---|---|
| date | yes | date (ISO) | daily grain after aggregation |
| quantity | yes | int >= 0 | units sold that day |
| price | yes | int VND | selling price per unit AFTER discounts |
| product_id or product_name | yes (one) | string | if only name exists, id = slug(name) |
| unit_cost | no | int VND | if missing the UI asks for a margin % (assumption, flagged) |
| category | no | string | |
| stock | no | int | end-of-day stock; `stock == 0` marks censored demand |
| promo | no | 0/1 | marketing push flag |
| extra_* | no | numeric | unmapped numeric columns offered as optional covariates |

## Python service (ml-py) — JSON over HTTP
- `POST /ingest/profile` (multipart CSV) -> `{upload_id, n_rows, columns:[{name, dtype_guess, null_pct, n_unique, samples:[<=5 masked]}]}`
- `POST /ingest/map` `{upload_id}` -> `{mapping:[{canonical, source|null, confidence 0..1, method, alternatives:[{source,score}]}], missing_required:[], warnings:[]}`
- `POST /ingest/commit` `{upload_id, mapping, options:{price_unit, date_format, number_locale, margin_pct?}}` -> `{dataset_id, label, quality_report}`
- `POST /elasticity/fit` `{dataset_id, product_ids?}` -> `{products:[ElasticityResult]}`
- `POST /backtest` `{dataset_id, product_id, change_date, horizon_days}` -> `{predicted:[], actual:[], wape, mape, interval_coverage}`
- `POST /nlq/parse` `{question, catalog:[{product_id,name}]}` -> `DecisionSpec` or `{error, fallback:"manual_form"}`
- `POST /nlq/explain` `{scenario_result}` -> `{text}` (text may only restate numbers present in the input)

`ElasticityResult` = fields of one product in `contracts/fixtures/elasticity_fixture.json` plus `significant: bool`, `price_variation_sd`, `warnings:[]`.
`DecisionSpec` = `{product_id, change_type:"price_pct", change_value: -50..+100, horizon_days: 7..90, start_date?}`; out-of-range => rejected.

## Go engine — JSON over HTTP
- `POST /api/simulate` `ScenarioRequest{product:{current_price_vnd, unit_cost_vnd, baseline_qty_per_period, stock_available, fixed_cost_vnd, elasticity_samples[]}, price_change_pct, n_sims, seed}`
  -> `{scenarios:{base, optimistic(p10 elasticity-sensitivity), expected(median), pessimistic(p90)}, profit_distribution:{histogram, p5, p50, p95}, break_even_elasticity}`
- `POST /api/optimize` `{product, objective:"max_expected_profit"|"hit_target", target_profit_uplift_pct?, constraints:{max_price_change_pct, min_margin_pct?, budget_vnd?, respect_stock}, n_sims, seed}`
  -> `{ranked:[{price_vnd, price_change_pct, expected_profit, p5_profit, prob_hit_target, feasible, violated:[]}]}`

### Core formulas (single source of truth — Go and Python reference must agree)
```
Q1      = Q0 * (P1/P0)^e                       e drawn from elasticity_samples (one draw per simulation)
Q1_sold = min(Q1 * exp(noise), stock_available)  noise ~ N(0, sigma_resid) if provided else 0
profit  = (P1 - cost) * Q1_sold - fixed_cost
break-even elasticity: e* = ln((P0-cost)/(P1-cost)) / ln(P1/P0)
```
Optimistic/pessimistic scenarios use the 10th/90th percentile of the elasticity distribution in terms of price sensitivity (|e| smallest/largest).

**Golden test (from the proposal, must pass in Go and Python):** P0=100000, cost=60000, Q0=10000, P1=110000 ->
e=-0.5: Q=9534.6, profit=476.7M | e=-1.0: Q=9090.9, profit=454.5M | e=-2.0: Q=8264.5, profit=413.2M | e*=-2.341.

## Data labels
`label` in {`SYNTHETIC`, `PUBLIC_M5`, `PUBLIC_DUNNHUMBY`, `USER`} travels with the dataset through every response and is rendered as a badge.
