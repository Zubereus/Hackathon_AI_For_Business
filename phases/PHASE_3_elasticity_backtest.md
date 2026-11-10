# PHASE 3 — Elasticity engine & backtest
Owner: **A** · Sprint: Thu 12/11 (6h) · Depends on: P1, P2 · Unblocks: P6, P7, P8 (validation slides)

## Goal
Per-product price elasticity with uncertainty, honest warnings, and two proofs: (1) recovery of KNOWN elasticity on synthetic data, (2) backtest on a past price change in public (M5) data.

## Allowed paths
`ml-py/app/features/**`, `ml-py/app/elasticity/**`, `ml-py/app/backtest/**`, `ml-py/tests/test_elasticity_*.py`, `ml-py/tests/test_backtest_*.py`, `docs/VALIDATION.md`

## Deliverables
1. `features/build.py` — design matrix: ln(price), weekend, payday window, trend, yearly sin/cos, promo, Vietnamese event windows (from `calendar_vn.py`), for M5 the dataset's own event/SNAP flags; drop `stock == 0` days (censored).
2. `elasticity/fit.py` — Poisson (log-link) regression via `statsmodels` GLM (add it to dependencies), robust SE; elasticity = coefficient of ln(price). **Bootstrap** (block bootstrap by week, >= 300 resamples) to produce `elasticity_samples` for the engine. Return `ElasticityResult` exactly per contract.
3. Warnings: `low_price_variation` (sd ln price < 0.03), `not_significant` (CI contains 0), `few_observations` (< 120 usable days), `positive_elasticity` (e > 0 -> flag as implausible, suggest more data).
4. `backtest/run.py` — choose a past change (|price change| >= 5%, not inside Tet window), fit on data strictly before, predict the next 14 days with the new price and calendar, report WAPE, MAPE, and 80%-interval coverage; also compare against a naive "same as last 14 days" baseline.
5. `docs/VALIDATION.md` — the recovery table (synthetic) and the backtest table (M5), copied from real runs, including the cases that went badly. This file feeds slides.
6. Endpoints `/elasticity/fit`, `/backtest`.

## Rules
- MUST: the spec used in the app = spec C of `data/synthetic/check_elasticity_v2.py` (reuse its logic; do not tune the model on `ground_truth.csv`).
- MUST: tell the user in the UI-facing text that the estimate is controlled-observational, not proven causal.
- MUST NOT: hide bad results. If the model fails on `hard_low_price_variation_8` the response must carry the warning, and the failure goes into VALIDATION.md.
- MUST NOT: use future data in a backtest (fit data < change_date).

## Acceptance tests
- Synthetic: on `fashion_shop_12`, `grocery_fmcg_15`, `electronics_home_10`, `marketplace_large_40` mean abs error of elasticity < 0.15 and 90% CI coverage >= 80%; rank correlation (true vs estimated) >= 0.8.
- `hard_low_price_variation_8` returns `low_price_variation` for every product.
- Backtest: on >= 10 M5 price-change events, model WAPE <= naive baseline WAPE in at least 60% of events (report the real percentage whatever it is).
- Output JSON validates against `contracts/` schemas.

## Prompt for the agent
```
Read /AGENTS.md, /docs/ARCHITECTURE.md, /data/synthetic/check_elasticity_v2.py and /phases/PHASE_3_elasticity_backtest.md. Implement PHASE 3.
Plan first. Reuse the spec-C design from check_elasticity_v2.py (Poisson log-link, Vietnamese event-window dummies, payday, trend, drop stockout days) as the production model with
statsmodels GLM and week-block bootstrap for elasticity_samples. Implement warnings exactly as listed. Build the backtest (fit strictly before the change date, predict 14 days,
WAPE/MAPE/interval coverage vs a naive baseline). Write tests that assert the acceptance numbers on the synthetic datasets and write docs/VALIDATION.md from REAL runs, including failures.
Do not tune anything against ground_truth.csv. Paste real output and append to the status log.
```

## Status log
- **2026-11-10**: Completed Phase 3 (Elasticity Engine & Backtest):
  - Implemented `ml-py/app/features/build.py` (Spec-C econometric design matrix with `ln(price)`, weekend, payday window, harmonic seasonality, trend, Vietnamese event-window dummies, and censored stockout filtering).
  - Implemented `ml-py/app/elasticity/fit.py` (statsmodels Poisson GLM with HC1 sandwich SE, vectorized week-block bootstrap for empirical `elasticity_samples`, and diagnostic guardrails: `low_price_variation`, `not_significant`, `few_observations`, `positive_elasticity`).
  - Implemented `ml-py/app/backtest/run.py` (price intervention detector outside Tet `[-14, +7]`, strict pre-intervention fit `date < change_date`, 14-day out-of-sample forecast with 80% prediction interval coverage, WAPE/MAPE, and naive trailing baseline comparison).
  - Connected `POST /elasticity/fit` and `POST /backtest` endpoints in `ml-py/app/main.py`.
  - Created `ml-py/tests/test_elasticity_engine.py` and `ml-py/tests/test_backtest.py` and executed all tests (`pytest` output: `test_elasticity_engine.py`: 5 passed in 31.12s; `test_backtest.py` + `test_contracts.py` + `test_data_loaders.py` + `test_mapping_variants.py`: 12 passed, 1 skipped).
  - Generated `docs/VALIDATION.md` containing real synthetic recovery metrics, `hard_low_price_variation_8` stress-test warnings, and 19 historical intervention backtests (model beats naive baseline in 18/19 = 94.7% of events).
  - Added `statsmodels` to dependencies and installed it cleanly.
