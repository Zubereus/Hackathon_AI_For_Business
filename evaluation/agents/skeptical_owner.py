"""Agent 2: Demanding and Skeptical Business Owner."""

from __future__ import annotations

from typing import Any, Dict, List

from evaluation.agents.base import (
    AgentNextStep,
    BaseUserAgent,
    ConversationTurn,
    ScenarioGoal,
)
from evaluation.simulator.whatif_client import WhatIfObservableResponse


class SkepticalOwnerAgent(BaseUserAgent):
    """Experienced analytical owner who verifies math, challenges assumptions, and tests edge cases."""

    agent_id = "skeptical_owner"
    display_name = "Demanding and Skeptical Business Owner"
    prompt_filename = "skeptical_owner.md"

    def build_scenarios(
        self, products_by_dataset: Dict[str, List[Dict[str, Any]]]
    ) -> List[ScenarioGoal]:
        fashion = products_by_dataset.get("fashion_shop_12") or []
        hard_low = products_by_dataset.get("hard_low_price_variation_8") or []
        p_fash = fashion[0]["product_id"] if fashion else "P01"
        p_low = hard_low[0]["product_id"] if hard_low else "P01"

        return [
            ScenarioGoal(
                scenario_id="sk_audit_math_and_assumptions",
                dataset_id="fashion_shop_12",
                active_product_id=p_fash,
                opening_question=f"Nếu tăng giá {p_fash} lên 10% trong 30 ngày thì lợi nhuận ra sao?",
                intent_category="numerical_verification_and_assumptions",
                ground_truth_notes="Verify profit = (P1 - cost)*qty - fixed_cost and scenario ordering opt >= exp >= pess.",
                max_turns=4,
            ),
            ScenarioGoal(
                scenario_id="sk_low_variation_uncertainty",
                dataset_id="hard_low_price_variation_8",
                active_product_id=p_low,
                opening_question=f"Tăng giá {p_low} thêm 12% trong 30 ngày có được không?",
                intent_category="uncertainty_disclosure_audit",
                ground_truth_notes="hard_low_price_variation_8 has flat historical prices; expects explicit uncertainty warning.",
                max_turns=3,
            ),
            ScenarioGoal(
                scenario_id="sk_contradictory_marketing_shock",
                dataset_id="fashion_shop_12",
                active_product_id=p_fash,
                opening_question=f"Nếu doanh thu {p_fash} tăng 20% nhưng chi phí marketing tăng 35%, kết luận của bạn có còn đúng không?",
                intent_category="contradictory_non_price_input",
                ground_truth_notes="Prompt specifies revenue +20% and marketing cost +35% — NOT a unit price change. Must not silently confuse +20% as a +20% price hike.",
                max_turns=2,
            ),
            ScenarioGoal(
                scenario_id="sk_extreme_bounds_rejection",
                dataset_id="fashion_shop_12",
                active_product_id=p_fash,
                opening_question=f"Giảm giá {p_fash} 80% trong 400 ngày thì sao?",
                intent_category="edge_case_bounds",
                ground_truth_notes="Out-of-bounds discount (-80% < -50%) and horizon (400 > 90); MUST fail closed.",
                max_turns=2,
            ),
            ScenarioGoal(
                scenario_id="sk_zero_noop_check",
                dataset_id="fashion_shop_12",
                active_product_id=p_fash,
                opening_question=f"Nếu giữ nguyên giá {p_fash} tăng 0% trong 30 ngày thì lợi nhuận thế nào?",
                intent_category="zero_change_identity",
                ground_truth_notes="At 0% price change, expected profit must match baseline profit and break-even must be null.",
                max_turns=2,
            ),
        ]

    def react_to_response(
        self,
        goal: ScenarioGoal,
        history: List[ConversationTurn],
        last_resp: WhatIfObservableResponse,
        products: List[Dict[str, Any]],
    ) -> AgentNextStep:
        if len(history) >= goal.max_turns:
            return AgentNextStep(action="stop", next_question=None, thought="Hoàn tất kiểm chứng.")

        if self.use_llm:
            llm_step = self._llm_react(goal, history, last_resp)
            if llm_step is not None:
                return llm_step

        observations: List[str] = []

        if goal.intent_category == "edge_case_bounds":
            if last_resp.status == "fallback":
                observations.append("Hệ thống đã chặn đúng ngưỡng vượt biên (-80% / 400 ngày).")
                return AgentNextStep(
                    action="stop",
                    next_question=None,
                    thought="Guardrail hoạt động chuẩn khi bị ép biên cực đoan.",
                    observations=observations,
                )
            observations.append("LỖI NGHIÊM TRỌNG: Hệ thống không chặn tham số vượt biên -80% / 400 ngày!")
            return AgentNextStep(
                action="stop",
                next_question=None,
                thought="Dữ liệu ngoài biên vẫn chạy qua được là rủi ro lớn.",
                observations=observations,
            )

        if goal.intent_category == "contradictory_non_price_input":
            if last_resp.status == "answered":
                parsed_chg = (last_resp.parsed_spec or {}).get("change_value")
                observations.append(
                    f"CẢNH BÁO NGỮ NGHĨA: Câu hỏi nói về doanh thu +20% và chi phí marketing +35%, nhưng hệ thống lại tự diễn giải thành đổi giá {parsed_chg}%!"
                )
            else:
                observations.append("Hệ thống từ chối câu hỏi không phải biến đổi giá (đúng phạm vi mô hình).")
            return AgentNextStep(
                action="stop",
                next_question=None,
                thought="Đã kiểm tra phản ứng của hệ thống với biến chi phí marketing không thuộc giá bán.",
                observations=observations,
            )

        if last_resp.status != "answered" or not last_resp.simulation:
            observations.append(f"Chưa trả lời được truy vấn kiểm chứng ({last_resp.fallback_reason or last_resp.error_detail}).")
            return AgentNextStep(action="stop", next_question=None, thought="Dừng phiên kiểm tra.", observations=observations)

        sim = last_resp.simulation
        scen = sim.get("scenarios", {})
        base = scen.get("base", {})
        exp = scen.get("expected", {})
        expl = last_resp.explanation or {}

        # Audit 1: Zero-change identity
        if goal.intent_category == "zero_change_identity":
            diff = abs(float(exp.get("profit", 0)) - float(base.get("profit", 0)))
            if diff > 1.0:
                observations.append(f"Lệch số ở mức 0%: expected profit lệch base {diff:,.0f} VND.")
            else:
                observations.append("Chuẩn xác: mức 0% khớp hoàn toàn giữa expected và baseline.")
            return AgentNextStep(action="stop", next_question=None, thought="Xác minh xong điểm gốc 0%.", observations=observations)

        # Audit 2: Low variation uncertainty disclosure
        if goal.intent_category == "uncertainty_disclosure_audit":
            adv = sim.get("advisory") or {}
            flags = adv.get("risk_flags") or []
            full_text = f"{expl.get('direct_answer', '')} {expl.get('situation_summary', '')} {expl.get('text', '')}".lower()
            warned = bool(flags) or ("ít" in full_text or "chưa chắc" in full_text or "limited" in full_text or "chưa rõ" in full_text)
            if not warned:
                observations.append("Cảnh báo bất định trên SKU ít biến động giá chưa thể hiện rõ trong lời khuyên.")
            else:
                observations.append("Hệ thống có ghi nhận sự thiếu chắc chắn của dữ liệu cũ.")

            if len(history) == 1:
                return AgentNextStep(
                    action="challenge_assumption",
                    next_question=f"Nếu dữ liệu {goal.active_product_id} không đủ chắc chắn thì tại sao bạn vẫn đưa ra khuyến nghị — hãy cho tôi biết ngưỡng hòa vốn và mức đổi giá -10% thì sao?",
                    thought="Tôi chất vấn thêm khi dữ liệu gốc yếu.",
                    observations=observations,
                )
            return AgentNextStep(action="accept", next_question=None, thought="Đã kiểm tra xử lý bất định.", observations=observations)

        # Audit 3: General proof & follow-up comparison
        if len(history) == 1:
            return AgentNextStep(
                action="challenge_assumption",
                next_question=f"Tại sao bạn kết luận mức lợi nhuận đó? Hãy kiểm tra phương án ngược lại là giảm giá {goal.active_product_id} 10% trong 30 ngày để tôi so sánh hai kịch bản.",
                thought="Cần so sánh đối xứng +10% với -10% để xem kết luận có nhất quán không.",
                observations=observations,
            )

        if len(history) == 2:
            return AgentNextStep(
                action="follow_up",
                next_question=f"Nếu giữ nguyên thời gian 30 ngày nhưng chỉ tăng giá {goal.active_product_id} 5% thì có an toàn hơn 10% không?",
                thought="Kiểm tra tính đơn điệu / nhất quán khi giảm biên độ tăng từ +10% xuống +5%.",
                observations=observations,
            )

        return AgentNextStep(
            action="accept",
            next_question=None,
            thought="Đã thu thập đủ dữ liệu đối chiếu tính nhất quán.",
            observations=observations,
        )

