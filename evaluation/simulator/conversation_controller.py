"""Adaptive multi-turn conversation controller for one simulated user session."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List

from evaluation.agents.base import BaseUserAgent, ConversationTurn, ScenarioGoal
from evaluation.simulator.whatif_client import WhatIfHttpClient, WhatIfObservableResponse


@dataclass
class ConversationSession:
    """Complete auditable record of one multi-turn evaluation interaction."""

    agent_id: str
    agent_display_name: str
    scenario_id: str
    dataset_id: str
    intent_category: str
    ground_truth_notes: str
    active_product_id: str
    final_action: str
    turns: List[ConversationTurn] = field(default_factory=list)
    raw_responses: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _compact_sim(resp: WhatIfObservableResponse) -> Dict[str, Any] | None:
    if not resp.simulation:
        return None
    scen = resp.simulation.get("scenarios", {})
    trace = resp.simulation.get("schedule_trace") or []
    return {
        "scenarios": scen,
        "profit_distribution": {
            k: v for k, v in (resp.simulation.get("profit_distribution") or {}).items() if k != "histogram"
        },
        "break_even_elasticity": resp.simulation.get("break_even_elasticity"),
        "prob_beat_base": resp.simulation.get("prob_beat_base"),
        "advisory": resp.simulation.get("advisory"),
        "schedule_trace_days": len(trace),
        "schedule_trace_endpoints": [trace[0], trace[-1]] if len(trace) >= 2 else trace,
    }


def _compact_opt(resp: WhatIfObservableResponse) -> Dict[str, Any] | None:
    if not resp.optimization:
        return None
    ranked = resp.optimization.get("ranked") or []
    return {
        "total_candidates": len(ranked),
        "top_feasible": next((r for r in ranked if r.get("feasible")), None),
        "top_overall": ranked[0] if ranked else None,
    }


class ConversationController:
    """Drives adaptive multi-turn dialogue between a User Simulation Agent and What-If Agent."""

    def __init__(self, client: WhatIfHttpClient, sim_seed: int = 42) -> None:
        self.client = client
        self.sim_seed = sim_seed

    def run_session(
        self,
        agent: BaseUserAgent,
        goal: ScenarioGoal,
        products: List[Dict[str, Any]],
    ) -> ConversationSession:
        session = ConversationSession(
            agent_id=agent.agent_id,
            agent_display_name=agent.display_name,
            scenario_id=goal.scenario_id,
            dataset_id=goal.dataset_id,
            intent_category=goal.intent_category,
            ground_truth_notes=goal.ground_truth_notes,
            active_product_id=goal.active_product_id or (products[0]["product_id"] if products else ""),
            final_action="stop",
        )

        current_question = goal.opening_question
        user_action = "opening_question"
        seen_questions = set()

        for turn_idx in range(1, goal.max_turns + 1):
            seen_questions.add(current_question.strip().lower())
            resp = self.client.ask_question(
                question=current_question,
                products=products,
                active_product_id=goal.active_product_id,
                seed=self.sim_seed,
            )

            turn = ConversationTurn(
                turn_index=turn_idx,
                user_action=user_action,
                question=current_question,
                agent_thought="",
                response_status=resp.status,
                latency_ms=resp.latency_ms,
                parsed_spec=resp.parsed_spec,
                simulation_summary=_compact_sim(resp),
                optimization_summary=_compact_opt(resp),
                explanation=resp.explanation,
                fallback_reason=resp.fallback_reason,
                error_detail=resp.error_detail,
            )
            session.turns.append(turn)
            session.raw_responses.append(
                {
                    "turn": turn_idx,
                    "status": resp.status,
                    "parsed_spec": resp.parsed_spec,
                    "simulation": _compact_sim(resp),
                    "explanation": resp.explanation,
                    "fallback_reason": resp.fallback_reason,
                    "error_detail": resp.error_detail,
                }
            )

            decision = agent.react_to_response(goal, session.turns, resp, products)
            turn.agent_thought = decision.thought
            turn.persona_observations = decision.observations
            session.final_action = decision.action

            if decision.action in ("accept", "stop") or not decision.next_question:
                break
            nxt = decision.next_question.strip()
            if nxt.lower() in seen_questions:
                break
            current_question = nxt
            user_action = decision.action

        return session

