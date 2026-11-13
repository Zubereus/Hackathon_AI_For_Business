"""Agent 1: Non-Technical Small Business Owner (Vietnamese online clothing store)."""

from __future__ import annotations

from typing import Any, Dict, List

from evaluation.agents.base import (
    AgentNextStep,
    BaseUserAgent,
    ConversationTurn,
    ScenarioGoal,
)
from evaluation.simulator.whatif_client import WhatIfObservableResponse

_JARGON_TOKENS = (
    "elasticity",
    "monte carlo",
    "co giãn",
    "p5",
    "p95",
    "p50",
    "wape",
    "spearman",
    "xói mòn",
    "phân vị",
    "biên gộp",
    "manual_form",
    "roi",
)


class NonTechnicalOwnerAgent(BaseUserAgent):
    """Simulated Vietnamese online fashion shop owner with minimal finance/IT background."""

    agent_id = "non_technical_owner"
    display_name = "Non-Technical Small Business Owner"
    prompt_filename = "non_technical_owner.md"

    def build_scenarios(
        self, products_by_dataset: Dict[str, List[Dict[str, Any]]]
    ) -> List[ScenarioGoal]:
        fashion_prods = products_by_dataset.get("fashion_shop_12") or []
        p01_id = fashion_prods[0]["product_id"] if fashion_prods else "P01"
        p02_id = fashion_prods[1]["product_id"] if len(fashion_prods) > 1 else p01_id

        candidates = [
            ScenarioGoal(
                scenario_id="nt_profit_drop_why",
                dataset_id="fashion_shop_12",
                active_product_id=p01_id,
                opening_question="Tại sao tháng này tôi bán được nhiều hàng hơn nhưng tiền lời lại ít hơn?",
                intent_category="ambiguous_diagnosis",
                ground_truth_notes="Ambiguous business diagnostic question without explicit SKU or % change.",
                max_turns=3,
            ),
            ScenarioGoal(
                scenario_id="nt_discount_10pct_simple",
                dataset_id="fashion_shop_12",
                active_product_id=p01_id,
                opening_question="Nếu tôi giảm giá áo thun basic 10% thì có ảnh hưởng nhiều đến lợi nhuận không?",
                intent_category="simple_whatif_clarity",
                ground_truth_notes="Clear apparel item by Vietnamese name + -10% discount; evaluates plain-language clarity.",
                max_turns=4,
            ),
            ScenarioGoal(
                scenario_id="nt_jargon_roi",
                dataset_id="fashion_shop_12",
                active_product_id=p01_id,
                opening_question="Tôi không hiểu ROI là gì, giải thích giúp tôi.",
                intent_category="financial_glossary_help",
                ground_truth_notes="Non-calculation glossary / educational question from a novice owner.",
                max_turns=2,
            ),
            ScenarioGoal(
                scenario_id="nt_restock_or_wait",
                dataset_id="fashion_shop_12",
                active_product_id=p02_id,
                opening_question="Tôi nên nhập thêm hàng áo sơ mi trắng hay đợi bán hết hàng tồn kho?",
                intent_category="missing_parameters_guidance",
                ground_truth_notes="Missing quantitative inputs; evaluates whether onboarding/fallback guides kindly.",
                max_turns=3,
            ),
            ScenarioGoal(
                scenario_id="nt_store_health",
                dataset_id="fashion_shop_12",
                active_product_id=p01_id,
                opening_question="Tháng này cửa hàng của tôi có đang kinh doanh tốt không?",
                intent_category="holistic_store_health",
                ground_truth_notes="Store-level health check without pricing action.",
                max_turns=2,
            ),
        ]
        # Deterministic ordering unless seed changes shuffle non-opening checks
        return candidates

    def react_to_response(
        self,
        goal: ScenarioGoal,
        history: List[ConversationTurn],
        last_resp: WhatIfObservableResponse,
        products: List[Dict[str, Any]],
    ) -> AgentNextStep:
        if len(history) >= goal.max_turns:
            return AgentNextStep(
                action="stop",
                next_question=None,
                thought="Đã hỏi xong mục tiêu ban đầu.",
            )

        if self.use_llm:
            llm_step = self._llm_react(goal, history, last_resp)
            if llm_step is not None:
                return llm_step

        observations: List[str] = []

        # Case 1: The app could not parse the question and triggered fallback
        if last_resp.status == "fallback":
            reason = last_resp.fallback_reason or ""
            observations.append(f"Hệ thống báo không hiểu câu hỏi ({reason}).")
            if len(history) == 1 and goal.intent_category in ("ambiguous_diagnosis", "missing_parameters_guidance"):
                return AgentNextStep(
                    action="request_clarification",
                    next_question="Vậy nếu tôi giảm giá áo thun basic 5% trong 14 ngày thì sao, lời lỗ thế nào?",
                    thought="Máy yêu cầu phải có % cụ thể mới chạy, tôi thử hỏi lại đơn giản hơn theo gợi ý.",
                    observations=observations,
                )
            if len(history) == 1 and goal.intent_category in ("financial_glossary_help", "holistic_store_health"):
                observations.append("Ứng dụng chưa hỗ trợ giải thích thuật ngữ hoặc hỏi đáp tổng quan ngoài đổi giá %.")
                return AgentNextStep(
                    action="stop",
                    next_question=None,
                    thought="Ứng dụng chỉ tính đổi giá %, không giải thích được câu hỏi này.",
                    observations=observations,
                )
            return AgentNextStep(
                action="stop",
                next_question=None,
                thought="Tôi thấy hơi khó dùng vì phải nhập đúng mẫu mới hiểu.",
                observations=observations,
            )

        if last_resp.status == "error":
            observations.append(f"Gặp lỗi kỹ thuật: {last_resp.error_detail}")
            return AgentNextStep(
                action="stop",
                next_question=None,
                thought="Trang báo lỗi nên tôi dừng lại.",
                observations=observations,
            )

        # Case 2: Answered — inspect clarity & jargon from non-technical owner perspective
        expl = last_resp.explanation or {}
        combined_text = " ".join(
            [
                str(expl.get("direct_answer") or ""),
                str(expl.get("action_verdict") or ""),
                str(expl.get("situation_summary") or ""),
                str(expl.get("text") or ""),
                " ".join(str(r) for r in (expl.get("recommendations") or [])),
            ]
        ).lower()

        jargon_hits = [tok for tok in _JARGON_TOKENS if tok in combined_text]
        if jargon_hits:
            observations.append(f"Xuất hiện thuật ngữ khó hiểu với người mới: {', '.join(jargon_hits)}")

        already_asked_simple = any("giải thích" in t.question.lower() or "dễ hiểu" in t.question.lower() for t in history)
        if jargon_hits and not already_asked_simple and len(history) < goal.max_turns:
            return AgentNextStep(
                action="request_clarification",
                next_question=f"Tôi thấy có chữ '{jargon_hits[0]}', tôi không rành tài chính — nói ngắn gọn là nên giảm giá áo thun basic 10% hay giữ nguyên giá cũ?",
                thought="Câu trả lời có từ hơi khó hiểu, tôi cần hỏi lại cho chắc là nên làm hay thôi.",
                observations=observations,
            )

        if len(history) == 1:
            return AgentNextStep(
                action="follow_up",
                next_question="Nếu tôi không giảm 10% nữa mà chỉ giảm 5% trong 30 ngày với áo thun basic thì sao?",
                thought="Tôi muốn xem nếu giảm ít hơn một chút thì tiền lời có giữ được tốt hơn không.",
                observations=observations or ["Giải thích khá rõ, đọc được lời khuyên chính."],
            )

        observations.append("Đã nhận được câu trả lời dễ theo dõi cho quyết định giá hằng ngày.")
        return AgentNextStep(
            action="accept",
            next_question=None,
            thought="Tôi đã hiểu nên làm gì cho cửa hàng rồi.",
            observations=observations,
        )

