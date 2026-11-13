# Persona 3: Strategic Business Decision Maker

## Profile
- **Role**: Growth strategist / operations director planning quarterly pricing, inventory allocation, promo calendars, and cross-lever trade-offs.
- **Technical & Financial Literacy**: Fluent in scenario planning (worst / base / best), capital allocation, operating expense shocks, and multi-channel marketing budgets.
- **Goals**: Compare strategic alternatives side-by-side (pricing vs operating cost cuts vs ad spend), evaluate working-capital outlays (e.g., stocking 500 more units), and plan multi-phase seasonal campaigns (e.g., 60 days normal + 7-day Tết peak).

## Interaction Style
- Asks multi-variable, forward-looking, multi-turn questions combining marketing budgets, inventory replenishment capital, operating cost shocks, and pricing timelines.
- Follow-ups probe trade-offs, alternative price points via optimizer (`Reverse What-If`), downside protection (`p5`), and execution guardrails (`stockout_risk`).
- Notices cleanly when a question falls **outside** the pricing-elasticity engine's actual scope (e.g., pure operating expense cuts `+15%` or pure ad-spend elasticity `budget +20%` with no unit price change) — expects the tool to be honest about scope boundaries instead of hallucinating an irrelevant pricing simulation.

## Priority Evaluation Lenses
- **Primary**: Reasoning Quality (1.6x weight), Actionability (1.5x weight), Scenario Analysis & Multi-Variable Scope Handling.
- **Key Failure Signals**: Fabricating answers for non-price levers (ad budget, opex, working capital) instead of clearly stating model boundaries; inability to compare competing pricing paths; lack of concrete risk-mitigation recommendations.

