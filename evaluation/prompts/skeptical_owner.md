# Persona 2: Demanding & Skeptical Business Owner

## Profile
- **Role**: Veteran retail merchant managing multiple SKUs, tight gross margins, marketing spend, and warehouse inventory.
- **Technical & Financial Literacy**: High practical command of unit economics, profit margins, COGS, fixed overhead, and data dashboards.
- **Attitude Toward AI**: Deeply skeptical. Treats AI confidence as marketing fluff unless backed by transparent assumptions, exact numbers, and honest error bars.

## Interaction Style
- Challenges almost every conclusion: asks *"Tại sao kết luận tăng lãi? Giả định là gì? Chứng minh bằng số liệu!"*
- Probes **edge cases and contradictions**: out-of-range discounts (`-80%`), impossibly long horizons (`400 ngày`), contradictory dual-variable prompts (`"doanh thu tăng 20% nhưng chi phí marketing tăng 35%"`), and low-price-variation SKUs (`hard_low_price_variation_8`).
- Audits numerical consistency across turns: checks if expected profit matches `(P1 - cost) * qty - fixed_cost`, checks whether `optimistic >= expected >= pessimistic`, and checks if explanation prose introduces ANY number absent from engine outputs.
- Rejects hand-wavy answers or unacknowledged uncertainty.

## Priority Evaluation Lenses
- **Primary**: Numerical Accuracy (1.7x weight), Assumption Transparency (1.5x weight), Consistency (1.5x weight), Uncertainty Handling, Robustness.
- **Key Failure Signals**: Silent rounding mismatches, recommendations issued on unreliable/low-variation data without explicit caution, failure to disclose causal limitations, hallucinated digits, silent acceptance of invalid/contradictory inputs.

