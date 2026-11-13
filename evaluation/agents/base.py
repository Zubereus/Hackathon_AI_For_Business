"""Base abstractions for independent User Simulation Agents."""

from __future__ import annotations

import json
import os
import random
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

from evaluation.simulator.whatif_client import WhatIfObservableResponse

AgentDecisionAction = Literal[
    "accept",
    "follow_up",
    "challenge_assumption",
    "request_clarification",
    "explore_alternative",
    "stop",
]


@dataclass
class ConversationTurn:
    """One complete turn in an evaluation conversation."""

    turn_index: int
    user_action: str
    question: str
    agent_thought: str
    response_status: str
    latency_ms: float
    parsed_spec: Optional[Dict[str, Any]] = None
    simulation_summary: Optional[Dict[str, Any]] = None
    optimization_summary: Optional[Dict[str, Any]] = None
    explanation: Optional[Dict[str, Any]] = None
    fallback_reason: Optional[str] = None
    error_detail: Optional[str] = None
    persona_observations: List[str] = field(default_factory=list)


@dataclass
class ScenarioGoal:
    """Seeded scenario exploration brief for a simulated user."""

    scenario_id: str
    dataset_id: str
    active_product_id: Optional[str]
    opening_question: str
    intent_category: str
    ground_truth_notes: str
    max_turns: int = 4


@dataclass
class AgentNextStep:
    """Decision returned by a simulated user after reading the What-If Agent response."""

    action: AgentDecisionAction
    next_question: Optional[str]
    thought: str
    observations: List[str] = field(default_factory=list)


class PersonaLLMHelper:
    """Lightweight isolated LLM wrapper for user-simulation agents (strictly optional).

    Never imported from What-If Agent internals; reads env vars directly when live LLM mode is requested.
    """

    def __init__(self, timeout_s: float = 12.0) -> None:
        self.api_key = (
            os.environ.get("EVAL_LLM_API_KEY")
            or os.environ.get("LLM_API_KEY")
            or os.environ.get("AI_API_KEY")
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or ""
        ).strip()
        raw_prov = (os.environ.get("EVAL_LLM_PROVIDER") or os.environ.get("LLM_PROVIDER") or "").strip().lower()
        if raw_prov:
            self.provider = raw_prov
        elif self.api_key.startswith("AIza"):
            self.provider = "gemini"
        elif self.api_key:
            self.provider = "openai"
        else:
            self.provider = "none"
        self.model = os.environ.get(
            "EVAL_LLM_MODEL",
            "gemini-2.0-flash" if self.provider == "gemini" else "gpt-4o-mini",
        )
        self.timeout_s = timeout_s

    def is_configured(self) -> bool:
        return bool(self.api_key) and self.provider not in ("", "none", "disabled")

    def complete_json(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        if not self.is_configured():
            return None
        try:
            if self.provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
                payload = {
                    "systemInstruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                    "generationConfig": {"temperature": 0.3, "responseMimeType": "application/json"},
                }
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                text = body["candidates"][0]["content"]["parts"][0]["text"]
            else:
                base = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
                url = f"{base}/chat/completions"
                payload = {
                    "model": self.model,
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                }
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                text = body["choices"][0]["message"]["content"]
            return json.loads(text)
        except Exception:
            return None


def summarize_observable_response(resp: WhatIfObservableResponse) -> Dict[str, Any]:
    """Compact observable summary visible to a simulated user."""
    if resp.status != "answered" or not resp.simulation:
        return {
            "status": resp.status,
            "fallback_reason": resp.fallback_reason,
            "error_detail": resp.error_detail,
        }
    scen = resp.simulation.get("scenarios", {})
    exp = scen.get("expected", {})
    base = scen.get("base", {})
    dist = resp.simulation.get("profit_distribution", {})
    adv = resp.simulation.get("advisory") or {}
    expl = resp.explanation or {}
    return {
        "status": resp.status,
        "parsed_product": (resp.parsed_spec or {}).get("product_id"),
        "parsed_change_value": (resp.parsed_spec or {}).get("change_value"),
        "parsed_horizon_days": (resp.parsed_spec or {}).get("horizon_days"),
        "base_profit": base.get("profit"),
        "expected_profit": exp.get("profit"),
        "p5_profit": dist.get("p5"),
        "p95_profit": dist.get("p95"),
        "verdict_code": adv.get("verdict_code"),
        "direct_answer": expl.get("direct_answer"),
        "action_verdict": expl.get("action_verdict"),
        "text": expl.get("text"),
        "recommendations": expl.get("recommendations", []),
    }


class BaseUserAgent:
    """Base class for independent evaluation agents with reproducible & adaptive LLM modes."""

    agent_id: str = "base"
    display_name: str = "Base Agent"
    prompt_filename: str = ""

    def __init__(self, seed: int = 42, use_llm: bool = False) -> None:
        self.rng = random.Random(seed)
        self.use_llm = use_llm
        self.llm = PersonaLLMHelper() if use_llm else None
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        if not self.prompt_filename:
            return ""
        here = os.path.dirname(os.path.abspath(__file__))
        prompt_path = os.path.abspath(os.path.join(here, "..", "prompts", self.prompt_filename))
        if os.path.exists(prompt_path):
            with open(prompt_path, "r", encoding="utf-8") as fh:
                return fh.read()
        return ""

    def build_scenarios(self, products_by_dataset: Dict[str, List[Dict[str, Any]]]) -> List[ScenarioGoal]:
        raise NotImplementedError

    def react_to_response(
        self,
        goal: ScenarioGoal,
        history: List[ConversationTurn],
        last_resp: WhatIfObservableResponse,
        products: List[Dict[str, Any]],
    ) -> AgentNextStep:
        """Decide next user action based strictly on observable response."""
        raise NotImplementedError

    def _llm_react(
        self,
        goal: ScenarioGoal,
        history: List[ConversationTurn],
        last_resp: WhatIfObservableResponse,
    ) -> Optional[AgentNextStep]:
        if not self.llm or not self.llm.is_configured():
            return None
        summary = summarize_observable_response(last_resp)
        sys_p = (
            f"{self.system_prompt}\n\n"
            "You are role-playing this simulated user interacting with the What-If AI retail app. "
            "Respond strictly in JSON with keys:\n"
            '- "action": one of "accept", "follow_up", "challenge_assumption", "request_clarification", "explore_alternative", "stop"\n'
            '- "next_question": realistic natural follow-up question in the user persona voice (or null if action is "accept" or "stop")\n'
            '- "thought": 1-2 sentences of internal persona reaction\n'
            '- "observations": array of 1-3 concrete UX/trust flaws or strengths observed in this turn'
        )
        user_p = (
            f"Scenario intent: {goal.intent_category}\n"
            f"Turn {len(history)} of max {goal.max_turns}.\n"
            f"Last user question: {last_resp.question}\n"
            f"Observable app response: {json.dumps(summary, ensure_ascii=False)}"
        )
        res = self.llm.complete_json(sys_p, user_p)
        if not isinstance(res, dict):
            return None
        act = str(res.get("action") or "stop")
        if act not in ("accept", "follow_up", "challenge_assumption", "request_clarification", "explore_alternative", "stop"):
            act = "stop"
        return AgentNextStep(
            action=act,  # type: ignore[arg-type]
            next_question=res.get("next_question"),
            thought=str(res.get("thought") or ""),
            observations=[str(o) for o in (res.get("observations") or [])],
        )

