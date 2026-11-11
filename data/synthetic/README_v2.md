# Synthetic Vietnamese retail data v2 — ALL DATA IS SIMULATED

Purpose: prove that the elasticity model recovers a KNOWN price elasticity, in a setting where sales swing with Vietnamese holidays and sale days.
Never present it as a real company's data (the app badge says `SYNTHETIC`).

## What changed vs v1
| v1 | v2 |
|---|---|
| one `holiday_flag`, same x1.6 lift for everything | 17 events with pre-ramp / peak / post-slump, per category group (Tet, 11.11, 12.12, 9.9, 10.10, Black Friday, 8/3, 20/10, 14/2, Christmas, Mid-Autumn, 30/4, 2/9, Hung Kings, back-to-school, monthly double-days) |
| prices change at random, unrelated to the calendar | retailers also mark down on 11.11/BF/8-3/20-10 and RAISE grocery prices before Tet -> price is correlated with events (realistic confounding) |
| unlimited stock | replenishment with lead time; ~3-5% stockout days, concentrated at peaks (censored demand) |
| flat demand | trend, payday window (day 5-10), weekday pattern per category, yearly seasonality per category, rare outlier spikes |
| 2024-2025 | 2024-01-01 .. 2026-10-31 (three Tets) |
| - | `ground_truth_daily.csv` (uncensored demand + event multiplier) and `messy_variants/` for the column mapper |

## Demand formula
`E[Q] = base_qty x trend x season_g x weekday_g x payday x event_multiplier_g x (price/base_price)^TRUE_ELASTICITY x promo_lift`
-> lognormal noise -> Poisson -> outlier spikes -> capped by stock.
Event multiplier = `1 + (shape_lift - 1) x gain_group`. All lifts and gains are ASSUMPTIONS in `vn_calendar.py` (not market statistics).
Lunar dates (Tet, Mid-Autumn, Hung Kings) are hard-coded for 2023-2026: verify before quoting.

## Why the calendar matters — worked example (11.11, electronics)
1. True elasticity e = -1.5. The shop marks the price down 20%: ratio 0.8.
2. Price effect on demand = 0.8^(-1.5) = 1.3975.
3. Event multiplier for electronics on 11.11 = 1 + (2.40 - 1) x 1.2 = 2.68.
4. Quantity jumps by 2.68 x 1.3975 = 3.745x.
5. A model that ignores the calendar attributes all of it to price: implied elasticity = ln(3.745) / ln(0.8) = 1.320 / -0.223 = **-5.9** (true: -1.5).
Before Tet the opposite happens: grocery prices rise a few percent while demand more than doubles, pushing a naive estimate toward zero or positive.
`check_elasticity_v2.py` shows the effect on the generated data: spec B (v1-style controls) is often WORSE than naive; spec C (event windows) recovers the truth.

## Files per dataset (`out/<name>/`)
`sales_synthetic_vn.csv` (input for the app) · `ground_truth.csv` (true elasticity — the model must never see it) · `ground_truth_daily.csv` (audit) · `config.json` · `elasticity_check_v2.csv`
Columns of the sales file: date, product_id, product_name, category, price_vnd, unit_cost_vnd, quantity_sold, promo_flag, holiday_flag, stock_on_hand.

| dataset | products | purpose |
|---|---|---|
| starter_4_products | 4 | quick demo |
| fashion_shop_12 | 12 | main demo, high elasticity |
| grocery_fmcg_15 | 15 | low elasticity, big Tet peak |
| electronics_home_10 | 10 | very price sensitive, 11.11 / BF peaks, higher noise |
| marketplace_large_40 | 40 | many categories, load test |
| hard_low_price_variation_8 | 8 | price almost constant: the app must WARN, estimates are unreliable by design |
| hard_event_confounded_12 | 12 | tiny price tests + heavy event pricing: hardest identification case |
| messy_variants/ | 5 files | column-mapper test set with `mapping_truth.json` |

## Run
```
python make_synthetic_data_v2.py          # writes ./out
python check_elasticity_v2.py out         # recovery table for A (naive), B (v1 controls), C (full controls)
```
Needs Python 3, numpy, pandas, scipy is NOT required.

## Recovery results at generation time (spec C unless noted; 90% robust CI)
| dataset | mean abs error | bias | CI coverage | rank corr. | naive (A) mean abs err | v1-style (B) mean abs err |
|---|---|---|---|---|---|---|
| fashion_shop_12 | 0.082 | +0.053 | 92% | 0.97 | 0.190 | 0.266 |
| grocery_fmcg_15 | 0.109 | -0.016 | 80% | 0.79 | 0.265 | 0.392 |
| electronics_home_10 | 0.127 | +0.071 | 90% | 0.94 | 0.280 | 0.233 |
| marketplace_large_40 | 0.098 | +0.006 | 88% | 0.94 | 0.219 | 0.203 |
| starter_4_products | 0.048 | -0.003 | 100% | 1.00 | 0.151 | 0.206 |
| hard_event_confounded_12 | 0.260 | -0.074 | 83% | 0.60 | 0.188 | 0.439 |
| hard_low_price_variation_8 | 0.487 | -0.366 | 100% (very wide CI) | 0.37 | 2.631 | 2.712 |

Honest reading: with realistic price variation the controlled model recovers elasticity to about +/-0.1; in the two "hard" sets it does not — which is the point:
the app must show wide intervals and warnings there. Do not tune the model on `ground_truth.csv`.
