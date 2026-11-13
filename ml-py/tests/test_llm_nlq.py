"""Acceptance tests for Phase 6 LLM Question Parser and Verified Explainer.

Verifies:
    1. NLQ parser benchmark on data/samples/nlq_questions.json:
       - >= 90% accuracy on valid Vietnamese & English questions
       - 100% rejection rate on out-of-range & unknown-product questions
    2. Explainer hallucination post-check trap:
       - A hallucinated number (not in scenario_result) immediately triggers template fallback.
       - A faithful text using only input numbers is accepted without fallback.
    3. FastAPI endpoint integration on /nlq/parse and /nlq/explain.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List
import pytest
from fastapi.testclient import TestClient

from app.llm.explain import build_template_explanation, explain_scenario, verify_explanation_numbers
from app.llm.parse import parse_question
from app.main import app
from app.schemas.contracts import CatalogItem, DecisionSpec, NLQParseFallback


SAMPLE_QUESTIONS_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "samples", "nlq_questions.json")
)


def load_sample_questions() -> Dict[str, Any]:
    assert os.path.exists(SAMPLE_QUESTIONS_PATH), f"Missing {SAMPLE_QUESTIONS_PATH}"
    with open(SAMPLE_QUESTIONS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_nlq_parser_benchmark_accuracy() -> None:
    """Benchmark parser on 45 labeled test questions without API key (rule-based fallback)."""
    data = load_sample_questions()
    catalog = [CatalogItem(**item) for item in data["test_catalog"]]
    questions = data["questions"]

    valid_questions = [q for q in questions if q["expect_valid"]]
    reject_questions = [q for q in questions if not q["expect_valid"]]

    correct_valid = 0
    for q in valid_questions:
        res = parse_question(question=q["question"], catalog=catalog)
        if isinstance(res, DecisionSpec):
            expected = q["expected"]
            if (
                res.product_id == expected["product_id"]
                and abs(res.change_value - expected["change_value"]) < 0.1
                and res.horizon_days == expected["horizon_days"]
            ):
                correct_valid += 1
            else:
                print(f"[Mismatch] Q: '{q['question']}' | Got: {res} | Expected: {expected}")
        else:
            print(f"[Unexpected Fallback] Q: '{q['question']}' | Err: {res.error}")

    valid_accuracy = correct_valid / len(valid_questions)
    print(f"\nNLQ Valid Question Accuracy: {correct_valid}/{len(valid_questions)} ({valid_accuracy:.1%})")

    # 100% rejection required for out-of-range, unknown products, or non-decisions
    correct_rejections = 0
    for q in reject_questions:
        res = parse_question(question=q["question"], catalog=catalog)
        if isinstance(res, NLQParseFallback):
            assert res.fallback == "manual_form"
            correct_rejections += 1
        else:
            print(f"[Failed to Reject] Q: '{q['question']}' | Parsed as valid: {res}")

    rejection_rate = correct_rejections / len(reject_questions)
    print(f"NLQ Out-of-Range/Unknown Rejection Rate: {correct_rejections}/{len(reject_questions)} ({rejection_rate:.1%})")

    assert valid_accuracy >= 0.90, f"Valid query accuracy {valid_accuracy:.1%} < 90%"
    assert rejection_rate == 1.0, f"Rejection rate {rejection_rate:.1%} != 100%"


def test_explainer_hallucination_post_check_trap() -> None:
    """Assert that a hallucinated number in LLM prose triggers immediate template fallback."""
    scenario_result = {
        "scenarios": {
            "base": {"price_vnd": 100000, "quantity": 10000, "profit_vnd": 400000000},
            "expected": {"price_vnd": 110000, "quantity": 9091, "profit_vnd": 454550000},
            "optimistic": {"price_vnd": 110000, "quantity": 9535, "profit_vnd": 476750000},
            "pessimistic": {"price_vnd": 110000, "quantity": 8265, "profit_vnd": 413250000},
        },
        "profit_distribution": {
            "p5": 413000000,
            "p50": 454550000,
            "p95": 476750000,
        },
        "break_even_elasticity": -2.341,
    }

    # Case A: Faithful text using only real numbers from scenario_result
    faithful_text = (
        "Raising the price to 110.000 VND yields an expected profit of 454.550.000 VND "
        "with volume of 9.091 units. Simulated profit ranges from 413.250.000 VND up to "
        "476.750.000 VND with break-even elasticity of -2.341."
    )
    is_valid, bad_toks = verify_explanation_numbers(faithful_text, scenario_result)
    assert is_valid is True
    assert len(bad_toks) == 0

    res_faithful = explain_scenario(scenario_result, candidate_override_text=faithful_text)
    assert res_faithful["used_fallback"] is False
    assert res_faithful["text"] == faithful_text

    # Case B: Hallucinated number (e.g. inventing 'savings of 78.500.000 VND' or '55% margin')
    hallucinated_text = (
        "Raising the price to 110.000 VND yields an expected profit of 454.550.000 VND "
        "generating an extra savings of 78.500.000 VND with 55% margin."
    )
    is_valid_bad, bad_toks_bad = verify_explanation_numbers(hallucinated_text, scenario_result)
    assert is_valid_bad is False
    assert any("78" in tok for tok in bad_toks_bad)

    res_hallucinated = explain_scenario(scenario_result, candidate_override_text=hallucinated_text)
    # MUST reject hallucinated text and replace with template
    assert res_hallucinated["used_fallback"] is True
    assert "78.500.000" not in res_hallucinated["text"]
    assert "Changing price from 100.000 VND to 110.000 VND" in res_hallucinated["text"]


def test_nlq_api_endpoints() -> None:
    """Verify /nlq/parse and /nlq/explain HTTP routes."""
    client = TestClient(app)

    # 1. POST /nlq/parse
    catalog = [{"product_id": "P01", "name": "Áo thun basic"}]
    payload = {
        "question": "Nếu tôi tăng giá Áo thun basic thêm 10% trong tháng tới?",
        "catalog": catalog,
    }
    resp = client.post("/nlq/parse", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["product_id"] == "P01"
    assert data["change_value"] == 10.0
    assert data["horizon_days"] == 30

    # 2. POST /nlq/explain
    scenario = {
        "scenarios": {
            "base": {"price_vnd": 100000, "profit_vnd": 400000000, "quantity": 10000},
            "expected": {"price_vnd": 110000, "profit_vnd": 454500000, "quantity": 9091},
            "optimistic": {"price_vnd": 110000, "profit_vnd": 476700000, "quantity": 9535},
            "pessimistic": {"price_vnd": 110000, "profit_vnd": 413200000, "quantity": 8265},
        },
        "profit_distribution": {"p5": 413200000, "p50": 454500000, "p95": 476700000},
        "break_even_elasticity": -2.341,
    }
    resp_exp = client.post("/nlq/explain", json={"scenario_result": scenario})
    assert resp_exp.status_code == 200
    exp_data = resp_exp.json()
    assert "text" in exp_data
    assert "454.500.000" in exp_data["text"]
    assert exp_data.get("action_verdict")
    assert len(exp_data.get("recommendations", [])) >= 1


def test_multiphase_schedule_parsing_and_rejection() -> None:
    """Verify multi-phase daily ramp schedules parse deterministically and reject bounds violations."""
    catalog = [CatalogItem(product_id="P01", name="Áo thun basic")]

    # User's exact example (including real typo 'nagyf')
    q_vi = "Với P01, 15 ngày đầu giảm 30%, 15 ngày sau mỗi nagyf tăng 1% thì sao?"
    spec = parse_question(q_vi, catalog)
    assert isinstance(spec, DecisionSpec)
    assert spec.product_id == "P01"
    assert spec.change_type == "price_schedule"
    assert spec.horizon_days == 30
    assert spec.detected_language == "vi"
    assert spec.schedule is not None and len(spec.schedule) == 2
    assert spec.schedule[0].days == 15 and spec.schedule[0].start_change_pct == -30.0
    assert spec.schedule[1].days == 15 and spec.schedule[1].daily_step_pct == 1.0
    assert spec.schedule[1].relative_to_prev is True and spec.schedule[1].compound_daily_step is True

    # Out-of-bounds multi-phase schedule (> 90 total days) must reject
    q_bad_days = "P01: 60 ngày đầu giảm 10%, 60 ngày sau tăng 10%"
    res_bad_days = parse_question(q_bad_days, catalog)
    assert isinstance(res_bad_days, NLQParseFallback)

    # Out-of-bounds daily drop (< -50%) must reject
    q_bad_drop = "P01: 15 ngày đầu giảm 45%, 10 ngày sau mỗi ngày giảm 2%"
    res_bad_drop = parse_question(q_bad_drop, catalog)
    assert isinstance(res_bad_drop, NLQParseFallback)


def test_business_context_actionable_advice_and_verification() -> None:
    """Verify /nlq/explain produces Vietnamese actionable advice grounded in business context."""
    client = TestClient(app)
    scenario = {
        "scenarios": {
            "base": {"price_vnd": 100000, "qty": 3000, "profit": 120000000},
            "expected": {"price_vnd": 80000, "qty": 3600, "profit": 72000000},
            "optimistic": {"price_vnd": 80000, "qty": 3800, "profit": 76000000},
            "pessimistic": {"price_vnd": 80000, "qty": 3300, "profit": 66000000},
        },
        "profit_distribution": {"p5": 66000000, "p50": 72000000, "p95": 76000000},
        "break_even_elasticity": -2.5,
        "prob_beat_base": 0.0,
        "advisory": {
            "verdict_code": "STOCK_CONSTRAINED_HOLD_OR_RAISE",
            "base_margin_pct": 40.0,
            "min_margin_pct_in_plan": 25.0,
            "expected_profit_delta_vnd": -48000000,
            "expected_profit_delta_pct": -40.0,
            "prob_beat_base": 0.0,
            "p5_beats_base": False,
            "stockout_risk": True,
            "stock_utilization_pct": 180.0,
            "elasticity_regime": "elastic",
            "risk_flags": ["stockout_risk", "downside_below_base"],
        },
    }
    biz_ctx = {
        "base_margin_pct": 40.0,
        "demand_trend_pct": 12.5,
        "stock_days_cover": 20.0,
        "warnings": [],
    }
    resp = client.post(
        "/nlq/explain",
        json={
            "scenario_result": scenario,
            "business_context": biz_ctx,
            "language": "vi",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["verdict_level"] == "stop"
    assert "THIẾU HÀNG" in body["action_verdict"]
    assert "40.0%" in body["situation_summary"]
    assert "12.5%" in body["situation_summary"]
    assert len(body["recommendations"]) >= 2


def test_delayed_tet_event_yes_no_agent_pipeline() -> None:
    """Verify delayed seasonal Tết Yes/No query does NOT get misparsed into flat 60-day hike."""
    catalog = [
        CatalogItem(product_id="P01", name="Áo thun basic"),
        CatalogItem(product_id="P08", name="Váy hoa nhí"),
    ]
    q = "60 ngày nữa là Tết tôi muốn vào 7 ngày từ 60 ngày nữa tăng giá sản phẩm lên 15% thì có được không"

    # Without active_product_id, generic 'sản phẩm' must NOT falsely match a random SKU like P08
    res_no_active = parse_question(q, catalog)
    assert isinstance(res_no_active, NLQParseFallback)

    # With active_product_id='P01' from UI, resolves to P01 with 60 normal days + 7 Tết peak days = 67 days
    spec = parse_question(q, catalog, active_product_id="P01")
    assert isinstance(spec, DecisionSpec)
    assert spec.product_id == "P01"
    assert spec.question_type == "yes_no_feasibility"
    assert spec.horizon_days == 67
    assert spec.baseline_period_days == 30
    assert spec.schedule is not None and len(spec.schedule) == 2
    assert spec.schedule[0].days == 60 and spec.schedule[0].start_change_pct == 0.0
    assert spec.schedule[0].demand_multiplier == 1.0
    assert spec.schedule[1].days == 7 and spec.schedule[1].start_change_pct == 15.0
    assert spec.schedule[1].demand_multiplier > 1.5
    assert spec.schedule[1].elasticity_multiplier < 1.0

    # Explainer produces direct Yes/No verdict grounded in engine numbers
    exp = explain_scenario(
        scenario_result={
            "scenarios": {
                "base": {"price_vnd": 100000, "qty": 7155, "profit": 286200000},
                "expected": {"price_vnd": 101725, "qty": 7010, "profit": 292500000},
                "optimistic": {"price_vnd": 101725, "qty": 7060, "profit": 296000000},
                "pessimistic": {"price_vnd": 101725, "qty": 6950, "profit": 288000000},
            },
            "profit_distribution": {"p5": 288000000, "p50": 292500000, "p95": 296000000},
            "prob_beat_base": 0.92,
            "break_even_elasticity": -2.4,
        },
        decision_spec=spec.model_dump(),
        optimize_summary={"best_feasible": {"price_vnd": 115000, "price_change_pct": 15.0, "expected_profit": 292500000}},
        language="vi",
        question=q,
    )
    assert exp["direct_answer"] is not None
    assert exp["direct_answer"].startswith("CÓ")
    assert "Tết" in exp["direct_answer"]


def test_non_price_levers_and_novice_guidance() -> None:
    """Ensure non-price marketing/cost/revenue % are NEVER misinterpreted as unit selling price,
    and novice educational/store-health queries return helpful coaching guidance.
    """
    catalog = [
        CatalogItem(product_id="P01", name="Áo thun basic"),
        CatalogItem(product_id="P02", name="Áo sơ mi trắng"),
    ]

    non_price_queries = [
        "Nếu tôi tăng ngân sách quảng cáo 20% cho P01, doanh thu và lợi nhuận có thể thay đổi thế nào?",
        "Nếu doanh thu P01 tăng 20% nhưng chi phí marketing tăng 35%, kết luận của bạn có còn đúng không?",
        "Hãy so sánh ba chiến lược cho P01: tăng giá bán 10%, giảm chi phí vận hành và tăng ngân sách marketing.",
        "Tôi đang có 100 triệu vốn, 500 sản phẩm tồn kho, doanh thu đang giảm. Tôi nên dùng số vốn này để nhập hàng, chạy quảng cáo hay giảm giá hàng tồn?",
    ]
    for q in non_price_queries:
        res = parse_question(q, catalog, active_product_id="P01")
        assert isinstance(res, NLQParseFallback), f"Expected non-price fallback for: {q}"
        assert res.guidance_type in ("non_price_scope", "multi_option_capital")
        assert res.helpful_answer and len(res.helpful_answer) > 30
        assert len(res.suggested_scenarios) >= 2

    # Glossary & novice questions provide plain-language helpful answers
    res_roi = parse_question("Tôi không hiểu ROI là gì, giải thích giúp tôi.", catalog)
    assert isinstance(res_roi, NLQParseFallback)
    assert res_roi.guidance_type == "glossary"
    assert res_roi.helpful_answer and "ROI" in res_roi.helpful_answer

    res_profit_drop = parse_question(
        "Tại sao tháng này tôi bán được nhiều hàng hơn nhưng tiền lời lại ít hơn?",
        catalog,
    )
    assert isinstance(res_profit_drop, NLQParseFallback)
    assert res_profit_drop.guidance_type == "ambiguous_advice"
    assert res_profit_drop.helpful_answer and "1." in res_profit_drop.helpful_answer

    res_health = parse_question("Tháng này cửa hàng của tôi có đang kinh doanh tốt không?", catalog)
    assert isinstance(res_health, NLQParseFallback)
    assert res_health.guidance_type == "store_health"
    assert res_health.helpful_answer


def test_clearance_goal_inventory_age_and_explainer() -> None:
    """Verify clearance goal parsing, inventory age extraction, and goal-aware advisor verdicts."""
    catalog = [
        CatalogItem(product_id="P01", name="Áo thun basic"),
        CatalogItem(product_id="P02", name="Áo sơ mi trắng"),
    ]
    q = "Hàng P02 đã nhập kho 90 ngày rồi, giảm giá 15% trong 14 ngày để xả kho thu hồi vốn có ổn không?"
    spec = parse_question(q, catalog)
    assert isinstance(spec, DecisionSpec)
    assert spec.product_id == "P02"
    assert spec.horizon_days == 14
    assert spec.inventory_age_days == 90
    assert spec.decision_goal == "clear_inventory"
    assert spec.change_value == -15.0
    assert spec.question_type == "yes_no_feasibility"

    # Clearance query without percentage returns preset options including clear_inventory goal
    q_nopct = "Hàng P02 tồn kho lâu ngày muốn xả hàng thu hồi vốn thì nên giảm thế nào?"
    res_nopct = parse_question(q_nopct, catalog)
    assert isinstance(res_nopct, NLQParseFallback)
    assert res_nopct.helpful_answer
    clearance_presets = [p for p in res_nopct.suggested_scenarios if p.decision_goal == "clear_inventory"]
    assert len(clearance_presets) >= 1

    # CLEARANCE_WORTHWHILE: lower profit delta is acceptable when cost recovered + stock cleared fast
    scenario_worthwhile = {
        "scenarios": {
            "base": {"price_vnd": 234000, "qty": 402, "revenue": 94068000, "profit": 31147496},
            "expected": {"price_vnd": 198900, "qty": 514, "revenue": 102234600, "profit": 25772396},
            "optimistic": {"price_vnd": 198900, "qty": 540, "revenue": 107406000, "profit": 27797196},
            "pessimistic": {"price_vnd": 198900, "qty": 488, "revenue": 97063200, "profit": 23747596},
        },
        "profit_distribution": {"p5": 24100000, "p50": 25772396, "p95": 27400000},
        "break_even_elasticity": -2.4,
        "prob_beat_base": 0.0,
        "advisory": {
            "verdict_code": "CLEARANCE_WORTHWHILE",
            "base_margin_pct": 48.29,
            "min_margin_pct_in_plan": 39.17,
            "expected_profit_delta_vnd": -5375100,
            "expected_profit_delta_pct": -17.26,
            "prob_beat_base": 0.0,
            "p5_beats_base": False,
            "stockout_risk": False,
            "elasticity_regime": "elastic",
            "risk_flags": ["tradeoff_profit_for_cash_clearance"],
        },
        "clearance": {
            "decision_goal": "clear_inventory",
            "horizon_days": 14,
            "unit_recovery_pct": 164.38,
            "recovers_unit_cost": True,
            "recovers_total_cost": True,
            "extra_units_cleared": 112,
            "turnover_speedup_pct": 27.86,
            "total_cost_capital_turned_vnd": 62194000,
            "extra_capital_freed_vnd": 13552000,
            "inventory_capital_vnd": 145200000,
            "stock_cleared_pct": 42.8,
            "base_days_to_clear": 41.8,
            "plan_days_to_clear": 32.7,
            "days_saved_to_clear": 9.1,
            "inventory_age_days": 90,
            "age_tier": "stale",
            "holding_cost_pct_per_month": 2.0,
            "holding_cost_saved_vnd": 135520,
            "adjusted_profit_delta_vnd": -5239580,
        },
    }
    biz_ctx = {
        "base_margin_pct": 48.29,
        "demand_trend_pct": 1.2,
        "stock_days_cover": 41.8,
        "current_stock_units": 1200,
        "warnings": [],
    }
    exp_worth = explain_scenario(
        scenario_result=scenario_worthwhile,
        business_context=biz_ctx,
        decision_spec=spec.model_dump(),
        language="vi",
        question=q,
    )
    assert exp_worth["verdict_level"] == "go"
    assert "XẢ KHO" in exp_worth["action_verdict"]
    assert exp_worth["direct_answer"] is not None and exp_worth["direct_answer"].startswith("CÓ")
    assert "164" in exp_worth["text"] or "hoàn" in exp_worth["text"].lower()
    is_valid_worth, _ = verify_explanation_numbers(exp_worth["text"], scenario_worthwhile)
    assert is_valid_worth is True

    # CLEARANCE_BELOW_COST: deep -50% cut below purchase cost -> stop warning
    scenario_below = {
        "scenarios": {
            "base": {"price_vnd": 234000, "qty": 402, "revenue": 94068000, "profit": 31147496},
            "expected": {"price_vnd": 117000, "qty": 950, "revenue": 111150000, "profit": -18070204},
            "optimistic": {"price_vnd": 117000, "qty": 1000, "revenue": 117000000, "profit": -18270204},
            "pessimistic": {"price_vnd": 117000, "qty": 900, "revenue": 105300000, "profit": -17870204},
        },
        "profit_distribution": {"p5": -18500000, "p50": -18070204, "p95": -17600000},
        "break_even_elasticity": None,
        "prob_beat_base": 0.0,
        "advisory": {
            "verdict_code": "CLEARANCE_BELOW_COST",
            "base_margin_pct": 48.29,
            "min_margin_pct_in_plan": -3.42,
            "expected_profit_delta_vnd": -49217700,
            "expected_profit_delta_pct": -158.0,
            "prob_beat_base": 0.0,
            "p5_beats_base": False,
            "stockout_risk": False,
            "elasticity_regime": "elastic",
            "risk_flags": ["margin_erosion", "below_cost_clearance"],
        },
        "clearance": {
            "decision_goal": "clear_inventory",
            "horizon_days": 14,
            "unit_recovery_pct": 96.69,
            "recovers_unit_cost": False,
            "recovers_total_cost": False,
            "extra_units_cleared": 548,
            "turnover_speedup_pct": 136.32,
            "total_cost_capital_turned_vnd": 114950000,
            "extra_capital_freed_vnd": 66308000,
            "inventory_age_days": 90,
            "age_tier": "stale",
            "holding_cost_pct_per_month": 0.0,
            "holding_cost_saved_vnd": 0,
            "adjusted_profit_delta_vnd": -49217700,
        },
    }
    exp_below = explain_scenario(
        scenario_result=scenario_below,
        business_context=biz_ctx,
        decision_spec=spec.model_dump(),
        language="vi",
    )
    assert exp_below["verdict_level"] == "stop"
    assert "DƯỚI VỐN" in exp_below["action_verdict"]
    is_valid_below, _ = verify_explanation_numbers(exp_below["text"], scenario_below)
    assert is_valid_below is True




