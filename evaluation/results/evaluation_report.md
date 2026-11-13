# Multi-Agent Evaluation Report — What-If AI

- **Generated at**: `2026-11-12T17:02:22.764622+00:00`
- **Seed (Reproducible Mode)**: `42`
- **Subjective Judge Source**: `deterministic_persona_critic` *(kept strictly separate from objective metrics)*

## 1. Executive Answers to the 3 Fundamental Questions

### Can an ordinary business owner actually use the What-if Agent without technical or financial expertise?
- **Verdict**: **PARTIAL YES (works for direct price changes, struggles on open-ended shop questions)**
- **Evidence**: Usability=2.9/10, Clarity=9.0/10. When given explicit % price questions, explanations are readable; however, open-ended questions ('tại sao bán nhiều mà lời ít', 'ROI là gì') triggered 4 fallbacks.

### Can a demanding user trust the application's calculations, assumptions, and conclusions?
- **Verdict**: **HIGH MATHEMATICAL TRUST, MODERATE SEMANTIC SCOPE RISK**
- **Evidence**: Numerical Accuracy=10.0/10 (math_identity=100.0%, grounding=100.0%), Uncertainty Handling=10.0/10. Detected 3 non-price % misinterpretations.

### Can a strategic decision-maker use the application to explore scenarios and make better-informed business decisions?
- **Verdict**: **STRONG ON PRICING & SEASONAL RAMPS, NARROW ON MULTI-LEVER FINANCE**
- **Evidence**: Reasoning=6.0/10, Actionability=8.5/10. Supports 90-day scenarios, seasonal Tết multipliers, and reverse goal search, but does not yet isolate ad-spend or opex levers cleanly.

## 2. Objective Metrics (Deterministic Engine & Guardrail Verification)

| Metric | Observed Value |
|---|---|
| Total / Answered / Fallback / Error Turns | 24 / 18 / 6 / 0 |
| Average End-to-End Turn Latency | 15.4 ms |
| Formula Identity Pass Rate (`(P1-cost)*qty-fixed`) | 100.0% |
| Scenario Ordering & Quantile Monotonicity | 100.0% |
| Zero-Hallucination Number Grounding Rate | 100.0% |
| Extreme Bounds Rejection Rate (`-80%`, `400d`) | 100.0% |
| Low-Price-Variation Uncertainty Disclosure Rate | 100.0% |
| Non-Price Variable Misinterpretations | 3 / 4 |
| Ambiguous / Non-Numeric Query Helpfulness | 0.0% |
| Technical Jargon Hits (Agent 1) | 0 |

## 3. Persona-Weighted 9-Dimension Breakdown (No Hidden Weaknesses)

| Dimension | Agent 1 (Non-Tech Owner) | Agent 2 (Skeptical Owner) | Agent 3 (Strategist) |
|---|---:|---:|---:|
| `usability` | 2.90 | 8.82 | 8.82 |
| `clarity` | 9.00 | 9.00 | 9.00 |
| `numerical_accuracy` | 10.00 | 10.00 | 10.00 |
| `assumption_transparency` | 8.50 | 5.00 | 5.00 |
| `consistency` | 9.20 | 9.20 | 9.20 |
| `reasoning_quality` | 6.80 | 6.00 | 6.00 |
| `uncertainty_handling` | 8.40 | 10.00 | 8.40 |
| `actionability` | 8.50 | 8.50 | 8.50 |
| `robustness` | 9.20 | 6.80 | 4.40 |
| **Weighted Persona Index** | **7.45** | **8.22** | **7.21** |

## 4. Concrete Weaknesses & Failure Modes Exposed

1. **[MEDIUM]** `non_technical_owner` · `nt_profit_drop_why` (turn 1, `usability`): Rejected ambiguous_diagnosis query with fallback error ('Chưa nhận ra sản phẩm bạn muốn hỏi trong danh mục. Hãy nêu rõ mã hoặc tên sản phẩm (ví dụ P01, Áo thun basic).') instead of providing interactive guidance or educational answer. *(Query: `Tại sao tháng này tôi bán được nhiều hàng hơn nhưng tiền lời lại ít hơn?`)*
2. **[MEDIUM]** `non_technical_owner` · `nt_jargon_roi` (turn 1, `usability`): Rejected financial_glossary_help query with fallback error ('Chưa nhận ra sản phẩm bạn muốn hỏi trong danh mục. Hãy nêu rõ mã hoặc tên sản phẩm (ví dụ P01, Áo thun basic).') instead of providing interactive guidance or educational answer. *(Query: `Tôi không hiểu ROI là gì, giải thích giúp tôi.`)*
3. **[MEDIUM]** `non_technical_owner` · `nt_restock_or_wait` (turn 1, `usability`): Rejected missing_parameters_guidance query with fallback error ('Chưa thấy mức tăng/giảm giá cụ thể (ví dụ +10% hoặc giảm 15%).') instead of providing interactive guidance or educational answer. *(Query: `Tôi nên nhập thêm hàng áo sơ mi trắng hay đợi bán hết hàng tồn kho?`)*
4. **[MEDIUM]** `non_technical_owner` · `nt_store_health` (turn 1, `usability`): Rejected holistic_store_health query with fallback error ('Chưa nhận ra sản phẩm bạn muốn hỏi trong danh mục. Hãy nêu rõ mã hoặc tên sản phẩm (ví dụ P01, Áo thun basic).') instead of providing interactive guidance or educational answer. *(Query: `Tháng này cửa hàng của tôi có đang kinh doanh tốt không?`)*
5. **[HIGH]** `skeptical_owner` · `sk_contradictory_marketing_shock` (turn 1, `robustness`): Misinterpreted non-price lever (contradictory_non_price_input) as a 20.0% unit selling-price simulation instead of disclosing out-of-scope limits. *(Query: `Nếu doanh thu P01 tăng 20% nhưng chi phí marketing tăng 35%, kết luận của bạn có còn đúng không?`)*
6. **[HIGH]** `strategic_decision_maker` · `st_marketing_budget_lever` (turn 1, `robustness`): Misinterpreted non-price lever (non_price_marketing_lever) as a 20.0% unit selling-price simulation instead of disclosing out-of-scope limits. *(Query: `Nếu tôi tăng ngân sách quảng cáo 20% cho P01, doanh thu và lợi nhuận có thể thay đổi thế nào?`)*
7. **[HIGH]** `strategic_decision_maker` · `st_compare_3_strategies` (turn 1, `robustness`): Misinterpreted non-price lever (multi_lever_strategy_comparison) as a 10.0% unit selling-price simulation instead of disclosing out-of-scope limits. *(Query: `Hãy so sánh ba chiến lược cho P01: tăng giá bán 10%, giảm chi phí vận hành và tăng ngân sách marketing.`)*

## 5. Subjective Persona Critique & Improvement Priorities

- **Non-Technical Owner**: Strengths on plain discount simulations (clarity 9.0/10), but weak on ambiguous store-health/glossary/restock prompts (4 fallbacks out of 8 turns) because NLQ enforces numeric price-% inputs.
- **Skeptical Owner**: Strong math & grounding (accuracy 10.0/10, uncertainty 10.0/10), but vulnerable when users mention non-price percentages like revenue +20% / marketing +35%.
- **Strategic Decision Maker**: Handles multi-phase seasonal schedules well (e.g. Tết 60d+7d), yet lacks support for non-price levers (ad budgets, opex shocks, 500-unit working capital) unless explicitly rejected.

### Top Actionable Fixes Identified
- Add a non-price intent classifier in /nlq/parse so 'marketing cost +35%', 'ad budget +20%', 'ROI?', and 'working capital for 500 units' return honest scope guidance instead of binding to a unit price change.
- Add conversational guided onboarding/FAQ responses for novice questions like 'ROI là gì?' or 'tại sao bán nhiều mà lời ít?' instead of returning manual_form errors.
- Allow multi-SKU portfolio health summaries so owners asking 'tháng này shop bán tốt không?' receive store-wide margin and trend diagnostics.
