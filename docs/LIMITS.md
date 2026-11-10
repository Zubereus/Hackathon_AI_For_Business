# Methodological & Operational Limits of What-If AI

Every metric and interface in **What-If AI** explicitly discloses these boundaries so business managers never mistake statistical uncertainty ranges for causal guarantees.

## 1. Econometric Identification (Association vs. Proven Causality)
- **Controlled observational estimates**: Historical price elasticity is estimated from observed store variation via Poisson log-link GLM with Tet lunar calendar distances, double-day peaks (`9.9`, `10.10`, `11.11`, `12.12`), paydays, weekdays, and promotion indicators.
- **Unmeasured confounding**: While calendar and promotional controls reduce bias, unobserved shocks (e.g., sudden viral social trends, weather anomalies, supply disruptions, or store closures) can still correlate historical price changes with demand shifts. Controlled experiments (A/B price tests) remain the gold standard for pure causality.

## 2. Structural Modeling Scope
- **No cross-price elasticity in MVP**: Each SKU is modeled independently (`log(Q_i) ~ beta_i * log(P_i)`). Cannibalization across substitute SKUs (e.g., discounting Shirt A stealing demand from Shirt B) or halo effects on complements are not yet jointly estimated.
- **No competitor reaction modeling**: Simulations assume competitor prices remain constant within the 7–90 day horizon. Prolonged price wars would shift the effective demand curve.
- **Stockout demand censoring**: When inventory hits `stock == 0`, observed sales undercount true demand. Days with zero ending stock are weighted down/flagged, so prolonged stockouts reduce effective sample power.
- **Requires historical price variation**: When historical `sd(ln(price)) < 0.04` (flat-price SKUs), the engine explicitly triggers a `low_price_variation` warning instead of producing falsely confident point elasticities (verified on `hard_low_price_variation_8`: 8/8 SKUs flagged).
- **Functional form bounds**: Constant-elasticity (iso-elastic) demand assumes local log-linearity within `[-50%, +100%]`. Extreme pricing outside historical support extrapolates beyond data coverage.

## 3. Data Provenance & Currency Limits
- **Public benchmarks (`PUBLIC_M5`, `PUBLIC_DUNNHUMBY`) validate methodology, not local consumer tastes**: Walmart (US) and Dunnhumby panels test estimation stability on real non-synthetic retail patterns. Any VND figures shown for foreign datasets use an illustrative `25.000 ₫/$` fixed rate (`config/fx.json`) and are never market forecasts for Vietnamese stores.
- **Missing unit cost fallback**: If uploaded CSVs lack cost per SKU, What-If AI asks the user for a fallback gross margin % assumption (`margin_pct`) and visibly flags affected profit calculations as assumption-dependent.
- **No PII or external data retention**: Uploaded store CSVs stay strictly in backend session memory for the active workspace and are never written to browser `localStorage` or LLM prompts (only column headers and at most 5 masked sample values are inspected).

