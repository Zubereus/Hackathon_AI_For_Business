"""Unit and reproducibility tests for the Multi-Agent User Simulation & Evaluation System."""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Dict, List

from evaluation.agents.non_technical_owner import NonTechnicalOwnerAgent
from evaluation.agents.skeptical_owner import SkepticalOwnerAgent
from evaluation.agents.strategic_decision_maker import StrategicDecisionMakerAgent
from evaluation.evaluator.evaluation_engine import EvaluationEngine
from evaluation.evaluator.scoring import (
    DIMENSIONS,
    PERSONA_WEIGHTS,
    compute_objective_metrics,
)
from evaluation.simulator.conversation_controller import ConversationController
from evaluation.simulator.whatif_client import WhatIfObservableResponse


class _MockWhatIfClient:
    """Deterministic stub client simulating observable API responses."""

    def ask_question(
        self,
        question: str,
        products: List[Dict[str, Any]],
        active_product_id: str | None = None,
        seed: int = 42,
        n_sims: int = 2000,
    ) -> WhatIfObservableResponse:
        q_low = question.lower()
        if "80%" in q_low or "400" in q_low:
            return WhatIfObservableResponse(
                question=question,
                status="fallback",
                latency_ms=4.2,
                fallback_reason="Horizon 400 days outside [7, 90].",
            )
        if "roi" in q_low or "lời ít" in q_low or "kinh doanh tốt" in q_low:
            return WhatIfObservableResponse(
                question=question,
                status="fallback",
                latency_ms=3.1,
                fallback_reason="Chưa thấy mức tăng/giảm giá cụ thể.",
            )
        if "marketing" in q_low or "quảng cáo" in q_low:
            # Simulates a realistic NLP bug where non-price % gets parsed as price %
            return WhatIfObservableResponse(
                question=question,
                status="answered",
                latency_ms=12.0,
                parsed_spec={"product_id": "P01", "change_value": 20.0, "horizon_days": 30},
                simulation={
                    "scenarios": {
                        "base": {"price_vnd": 100000, "qty": 1000, "profit": 40000000},
                        "optimistic": {"price_vnd": 120000, "qty": 900, "profit": 54000000},
                        "expected": {"price_vnd": 120000, "qty": 800, "profit": 48000000},
                        "pessimistic": {"price_vnd": 120000, "qty": 700, "profit": 42000000},
                    },
                    "profit_distribution": {"p5": 42000000, "p50": 48000000, "p95": 54000000},
                },
                explanation={
                    "action_verdict": "NÊN ÁP DỤNG THỬ",
                    "situation_summary": "Tiền lời chiếm 40.0%.",
                    "text": "• Nếu giữ nguyên giá cũ (100.000 VND): bán 1.000 món, lãi 40.000.000 VND.\n• Với phương án mới: lãi 48.000.000 VND.",
                    "recommendations": ["Theo dõi sản lượng quanh 800 món."],
                },
            )
        return WhatIfObservableResponse(
            question=question,
            status="answered",
            latency_ms=10.5,
            parsed_spec={"product_id": "P01", "change_value": 10.0, "horizon_days": 30},
            simulation={
                "scenarios": {
                    "base": {"price_vnd": 100000, "qty": 1000, "profit": 40000000},
                    "optimistic": {"price_vnd": 110000, "qty": 950, "profit": 47500000},
                    "expected": {"price_vnd": 110000, "qty": 900, "profit": 45000000},
                    "pessimistic": {"price_vnd": 110000, "qty": 820, "profit": 41000000},
                },
                "profit_distribution": {"p5": 41000000, "p50": 45000000, "p95": 47500000},
                "advisory": {"risk_flags": ["low_price_variation"]},
            },
            explanation={
                "direct_answer": "CÓ, NÊN THỰC HIỆN: lãi đạt 45.000.000 VND (tăng so với 40.000.000 VND).",
                "action_verdict": "NÊN ÁP DỤNG THỬ",
                "situation_summary": "Số liệu cũ ít biến động.",
                "text": "• Nếu đổi giá sang 110.000 VND: bán 900 món, lãi 45.000.000 VND.",
                "recommendations": ["Theo dõi bán ra quanh 900 món."],
            },
        )


def test_persona_weights_complete_and_distinct() -> None:
    for agent_id, weights in PERSONA_WEIGHTS.items():
        assert set(weights.keys()) == set(DIMENSIONS), f"Dimension mismatch for {agent_id}"
        assert abs(sum(weights.values()) - 1.0) < 1e-6

    assert PERSONA_WEIGHTS["non_technical_owner"]["usability"] > PERSONA_WEIGHTS["skeptical_owner"]["usability"]
    assert PERSONA_WEIGHTS["skeptical_owner"]["numerical_accuracy"] > PERSONA_WEIGHTS["non_technical_owner"]["numerical_accuracy"]
    assert PERSONA_WEIGHTS["strategic_decision_maker"]["reasoning_quality"] > PERSONA_WEIGHTS["non_technical_owner"]["reasoning_quality"]


def test_adaptive_agents_and_objective_report_generation() -> None:
    sample_prods = {
        "fashion_shop_12": [
            {
                "product_id": "P01",
                "product_name": "Áo thun basic",
                "current_price_vnd": 100000,
                "unit_cost_vnd": 60000,
                "fixed_cost_vnd": 0,
                "baseline_qty_per_period": 1000,
                "elasticity_samples": [-1.1, -1.2],
            }
        ],
        "hard_low_price_variation_8": [
            {
                "product_id": "P01",
                "product_name": "Áo khoác ít đổi giá",
                "current_price_vnd": 100000,
                "unit_cost_vnd": 60000,
                "fixed_cost_vnd": 0,
                "baseline_qty_per_period": 1000,
                "elasticity_samples": [-1.1, -1.2],
            }
        ],
    }

    mock_client = _MockWhatIfClient()
    ctrl = ConversationController(client=mock_client, sim_seed=42)  # type: ignore[arg-type]

    agents = [
        NonTechnicalOwnerAgent(seed=42, use_llm=False),
        SkepticalOwnerAgent(seed=43, use_llm=False),
        StrategicDecisionMakerAgent(seed=44, use_llm=False),
    ]
    sessions = []
    for ag in agents:
        for goal in ag.build_scenarios(sample_prods):
            prods = sample_prods[goal.dataset_id]
            sessions.append(ctrl.run_session(ag, goal, prods))

    objective = compute_objective_metrics(sessions, sample_prods)
    assert objective["bounds_rejection_rate"] == 1.0
    assert objective["math_identity_pass_rate"] == 1.0
    assert objective["number_grounding_pass_rate"] == 1.0
    assert objective["non_price_scope_misinterpretation_count"] >= 1

    with tempfile.TemporaryDirectory() as tmpdir:
        engine = EvaluationEngine(use_llm_judge=False)
        report = engine.evaluate(sessions, sample_prods, seed=42, output_dir=tmpdir)
        assert os.path.exists(report["report_files"]["json"])
        assert os.path.exists(report["report_files"]["markdown"])
        with open(report["report_files"]["json"], "r", encoding="utf-8") as fh:
            loaded = json.load(fh)
        assert set(loaded["agent_evaluations"].keys()) == {
            "non_technical_owner",
            "skeptical_owner",
            "strategic_decision_maker",
        }
        assert len(loaded["fundamental_questions"]) == 3

