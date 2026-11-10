# PHASE 1 — Data layer: synthetic v2 + public dataset + VND
Owner: **A** · Sprint: Wed 11/11 morning (3h) · Depends on: P0 · Unblocks: P2, P3, P8 (validation slides)

## Goal
Two trustworthy data sources, clearly labelled:
(a) **Synthetic Vietnam retail data with known elasticity** (generator v2 is already written and tested — see `data/synthetic/`), used to PROVE the model recovers the truth;
(b) **Public foreign data (M5 preferred, Dunnhumby optional)**, used to VALIDATE THE METHOD (elasticity + backtest on real price variation), converted to VND for display.
Slide message to support (say it plainly): *"Foreign public data validates the method; a real Vietnamese business uploads its own file through the column-mapping step."*

## Allowed paths
`data/synthetic/**`, `data/public/**`, `config/fx.json`, `ml-py/app/data/**`, `ml-py/tests/test_data_*.py`

## Deliverables
1. Run `make data`; commit generated datasets under `data/synthetic/out/` (they are small, ~13 MB) and the recovery table `elasticity_check_v2.csv`.
2. `data/public/README.md`: where to download (Kaggle account needed — the HUMAN downloads, the agent must not scrape): M5 Forecasting files `calendar.csv`, `sell_prices.csv`, `sales_train_evaluation.csv` into `data/public/raw/m5/`. Cite the source and check the dataset terms before showing it on a slide.
3. `ml-py/app/data/m5_loader.py`: build canonical daily frame (`product_id = item_id|store_id`), select N items (default 30) with enough sales (>=2 units/day median) AND price variation (sd ln price >= 0.04), map `event_name_1/2` + SNAP into calendar features, convert USD -> VND with `config/fx.json` (label `PUBLIC_M5`).
4. Optional `dunnhumby_loader.py`: aggregate transactions to product-week (never keep household IDs; no personal data on screen).
5. `ml-py/app/data/calendar_vn.py`: thin wrapper exposing the Vietnamese event calendar (reuse `data/synthetic/vn_calendar.py`; do not duplicate the tables) as model features: per event family windows `pre_far, pre_near, day, post`.

## Rules
- MUST: every loader returns `(canonical_df, label, meta)` and never mutates raw files.
- MUST: VND conversion keeps both columns (`price_orig`, `price_vnd`) so UI can show the original currency on hover.
- MUST NOT: edit `vn_calendar.py` lift numbers to make results look better. They are documented assumptions.
- MUST NOT: commit M5/Dunnhumby raw files (`.gitignore` already blocks `data/public/raw/`).

## Acceptance tests
- `python data/synthetic/check_elasticity_v2.py data/synthetic/out` reproduces the recovery table: full-control spec C mean abs error < 0.15 on `fashion_shop_12`, `grocery_fmcg_15`, `electronics_home_10`, `marketplace_large_40` (values at generation time: 0.082 / 0.109 / 0.127 / 0.098).
- `pytest ml-py/tests/test_data_*.py`: loaders return the canonical columns, no NaN in required fields, VND = USD x rate, items filtered by the stated rules.
- Public-data smoke test is skipped (not failed) if raw files are absent.

## Prompt for the agent
```
Read /AGENTS.md and /phases/PHASE_1_data_layer.md. Implement PHASE 1.
Do NOT rewrite the synthetic generator: it exists in data/synthetic/ (make_synthetic_data_v2.py, vn_calendar.py, check_elasticity_v2.py) and was validated.
Tasks: (1) add ml-py/app/data/calendar_vn.py that reuses vn_calendar.py to produce event-window features; (2) write m5_loader.py exactly per the phase file
(canonical daily frame, item filter by sales volume and price variation, event+SNAP features, USD->VND via config/fx.json, label PUBLIC_M5, keep price_orig);
(3) optional dunnhumby_loader.py aggregating to product-week without household IDs; (4) pytest tests including a skip-if-missing smoke test for M5;
(5) data/public/README.md with download steps for a human. Print a plan first, run the tests, paste real output, append to the status log.
```

## Status log
- 2026-11-10: generator v2 + checker written and validated by the assistant (see README in data/synthetic).
- 2026-11-10: Implemented Phase 1 Data Layer deliverables:
  1. ml-py/app/data/calendar_vn.py wrapping vn_calendar with pre_far, pre_near, day, post event windows.
  2. ml-py/app/data/m5_loader.py transforming Walmart M5 dataset into canonical daily sales schema, converting USD to integer VND via config/fx.json with PUBLIC_M5 badge.
  3. ml-py/app/data/dunnhumby_loader.py aggregating transactions to product-week with strict privacy guarantee (stripping household IDs).
  4. data/public/README.md with manual Kaggle download instructions for human operator.
  5. ml-py/tests/test_data_loaders.py test suite covering calendar features, canonical columns, FX conversions, and skip-if-missing smoke test. Unblocks Phase 2 and Phase 3.
