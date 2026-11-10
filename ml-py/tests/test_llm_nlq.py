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

