"""Agent 3: Strategic Business Decision Maker."""

from __future__ import annotations

from typing import Any, Dict, List

from evaluation.agents.base import (
    AgentNextStep,
    BaseUserAgent,
    ConversationTurn,
    ScenarioGoal,
)
from evaluation.simulator.whatif_client import WhatIfObservableResponse


class StrategicDecisionMakerAgent(BaseUserAgent):
    """Strategist exploring multi-variable trade-offs, capital outlays, and long-term scenarios."""

    agent_id = "strategic_decision_maker"
    display_name = "Strategic Business Decision Maker"
    prompt_filename = "strategic_decision_maker.md"

    def build_scenarios(
        self, products_by_dataset: Dict[str, List[Dict[str, Any]]]
    ) -> List[ScenarioGoal]:
        fashion = products_by_dataset.get("fashion_shop_12") or []
        pid = fashion[0]["product_id"] if fashion else "P01"
        pid2 = fashion[2]["product_id"] if len(fashion) > 2 else pid

        return [
            ScenarioGoal(
                scenario_id="st_tet_seasonal_strategy",
                dataset_id="fashion_shop_12",
                active_product_id=pid,
                opening_question=f"60 ngày nữa là Tết, tôi muốn vào 7 ngày từ 60 ngày nữa tăng giá {pid} lên 15% thì có được không?",
                intent_category="seasonal_multi_phase_strategy",
                ground_truth_notes="Tests temporal offset + Tết seasonality + Yes/No feasibility + alternative trade-off exploration.",
                max_turns=4,
            ),
            ScenarioGoal(
                scenario_id="st_quarterly_scenarios_90d",
                dataset_id="fashion_shop_12",
                active_product_id=pid2,
                opening_question=f"Hãy xây dựng kịch bản xấu nhất, trung bình và tốt nhất cho 90 ngày tiếp theo nếu tăng giá {pid2} thêm 8%.",
                intent_category="long_horizon_risk_scenarios",
                ground_truth_notes="Checks 90-day scenario generation (pessimistic, expected, optimistic + Monte Carlo range).",
                max_turns=3,
            ),
            ScenarioGoal(
                scenario_id="st_marketing_budget_lever",
                dataset_id="fashion_shop_12",
                active_product_id=pid,
                opening_question=f"Nếu tôi tăng ngân sách quảng cáo 20% cho {pid}, doanh thu và lợi nhuận có thể thay đổi thế nào?",
                intent_category="non_price_marketing_lever",
                ground_truth_notes="Asks about ad budget +20% (NOT unit selling price +20%). Evaluates scope honesty.",
                max_turns=2,
            ),
            ScenarioGoal(
                scenario_id="st_inventory_capital_500",
                dataset_id="fashion_shop_12",
                active_product_id=pid,
                opening_question=f"Nếu nhập thêm 500 sản phẩm {pid}, tôi cần chuẩn bị bao nhiêu vốn?",
                intent_category="working_capital_planning",
                ground_truth_notes="Working capital question (500 * unit_cost_vnd). Tests whether system supports non-price inventory capital math.",
                max_turns=2,
            ),
            ScenarioGoal(
                scenario_id="st_compare_3_strategies",
                dataset_id="fashion_shop_12",
                active_product_id=pid,
                opening_question=f"Hãy so sánh ba chiến lược cho {pid}: tăng giá bán 10%, giảm chi phí vận hành và tăng ngân sách marketing.",
                intent_category="multi_lever_strategy_comparison",
                ground_truth_notes="Combines 3 strategic levers; checks whether system separates what it can model (price +10%) from what it cannot (opex/ad spend).",
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
            return AgentNextStep(action="stop", next_question=None, thought="Đã đủ thông tin chiến lược.")

        if self.use_llm:
            llm_step = self._llm_react(goal, history, last_resp)
            if llm_step is not None:
                return llm_step

        observations: List[str] = []

        if goal.intent_category in ("non_price_marketing_lever", "working_capital_planning", "multi_lever_strategy_comparison"):
            if last_resp.status == "answered":
                chg = (last_resp.parsed_spec or {}).get("change_value")
                observations.append(
                    f"RỦI RO PHẠM VI: Hệ thống chỉ mô phỏng biến đổi giá bán, nên đã biến đổi câu hỏi '{goal.intent_category}' thành đổi giá {chg}% thay vì trả lời đúng biến ngân sách/vốn/vận hành."
                )
            else:
                observations.append(
                    f"Hệ thống báo không hỗ trợ trực tiếp biến ngoài giá bán ({last_resp.fallback_reason})."
                )
            return AgentNextStep(
                action="stop",
                next_question=None,
                thought="Ghi nhận giới hạn phạm vi mô hình cho quyết định đa biến.",
                observations=observations,
            )

        if last_resp.status != "answered":
            observations.append(f"Chưa chạy được kịch bản chiến lược ({last_resp.fallback_reason or last_resp.error_detail}).")
            return AgentNextStep(action="stop", next_question=None, thought="Dừng kịch bản.", observations=observations)

        if len(history) == 1 and goal.intent_category == "seasonal_multi_phase_strategy":
            return AgentNextStep(
                action="explore_alternative",
                next_question=f"Còn nếu 15 ngày đầu giảm 30%, 15 ngày sau mỗi ngày tăng 1% cho {goal.active_product_id} thì chiến lược nào lợi nhuận cao và ít rủi ro hơn?",
                thought="So sánh chiến dịch tăng giá Tết với chiến dịch xả hàng rồi hồi giá dần.",
                observations=observations,
            )

        if len(history) == 2 and goal.intent_category == "seasonal_multi_phase_strategy":
            return AgentNextStep(
                action="explore_alternative",
                next_question=f"Muốn lãi {goal.active_product_id} tăng thêm 15% thì nên bán ở mức giá nào?",
                thought="Dùng Reverse Goal để chốt mức giá tối ưu theo mục tiêu lợi nhuận.",
                observations=observations,
            )

        if len(history) == 1 and goal.intent_category == "long_horizon_risk_scenarios":
            return AgentNextStep(
                action="follow_up",
                next_question=f"Nếu sức mua giảm mạnh, mức giá giảm 10% trong 90 ngày cho {goal.active_product_id} có giữ được dòng tiền tốt hơn không?",
                thought="Kiểm tra chiến lược phòng thủ giảm giá khi cầu yếu.",
                observations=observations,
            )

        return AgentNextStep(
            action="accept",
            next_question=None,
            thought="Đã đối chiếu xong các phương án kịch bản.",
            observations=observations,
        )

