"""Interaction manager coordinating the 3 independent user agents and saving raw transcripts."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from evaluation.agents.base import BaseUserAgent
from evaluation.agents.non_technical_owner import NonTechnicalOwnerAgent
from evaluation.agents.skeptical_owner import SkepticalOwnerAgent
from evaluation.agents.strategic_decision_maker import StrategicDecisionMakerAgent
from evaluation.simulator.conversation_controller import ConversationController, ConversationSession
from evaluation.simulator.whatif_client import WhatIfHttpClient


class InteractionManager:
    """Runs all User Simulation Agents against the observable What-If Agent API."""

    def __init__(
        self,
        client: WhatIfHttpClient,
        seed: int = 42,
        use_llm_users: bool = False,
        conversations_dir: str | None = None,
    ) -> None:
        self.client = client
        self.seed = seed
        self.use_llm_users = use_llm_users
        self.controller = ConversationController(client=client, sim_seed=seed)
        if conversations_dir is None:
            here = os.path.dirname(os.path.abspath(__file__))
            conversations_dir = os.path.abspath(os.path.join(here, "..", "results", "conversations"))
        self.conversations_dir = conversations_dir

    def load_ground_truth_datasets(self) -> Dict[str, List[Dict[str, Any]]]:
        """Fetch real observable fitted elasticity catalogs via the What-If API."""
        datasets: Dict[str, List[Dict[str, Any]]] = {}
        for ds_id in ("fashion_shop_12", "hard_low_price_variation_8"):
            fit_res = self.client.fit_dataset(ds_id)
            datasets[ds_id] = fit_res.get("products", [])
        return datasets

    def build_agents(self) -> List[BaseUserAgent]:
        return [
            NonTechnicalOwnerAgent(seed=self.seed, use_llm=self.use_llm_users),
            SkepticalOwnerAgent(seed=self.seed + 1, use_llm=self.use_llm_users),
            StrategicDecisionMakerAgent(seed=self.seed + 2, use_llm=self.use_llm_users),
        ]

    def run_all(self, save_transcripts: bool = True) -> Dict[str, Any]:
        """Execute multi-turn sessions for all 3 agents and store raw conversations."""
        products_by_dataset = self.load_ground_truth_datasets()
        agents = self.build_agents()
        sessions: List[ConversationSession] = []

        for agent in agents:
            goals = agent.build_scenarios(products_by_dataset)
            for goal in goals:
                prods = products_by_dataset.get(goal.dataset_id) or products_by_dataset["fashion_shop_12"]
                sess = self.controller.run_session(agent, goal, prods)
                sessions.append(sess)

        saved_files: List[str] = []
        if save_transcripts:
            os.makedirs(self.conversations_dir, exist_ok=True)
            by_agent: Dict[str, List[Dict[str, Any]]] = {}
            for s in sessions:
                by_agent.setdefault(s.agent_id, []).append(s.to_dict())
            for agent_id, sess_list in by_agent.items():
                out_path = os.path.join(self.conversations_dir, f"{agent_id}_seed{self.seed}.json")
                with open(out_path, "w", encoding="utf-8") as fh:
                    json.dump(
                        {
                            "agent_id": agent_id,
                            "seed": self.seed,
                            "use_llm_users": self.use_llm_users,
                            "generated_at": datetime.now(timezone.utc).isoformat(),
                            "sessions": sess_list,
                        },
                        fh,
                        indent=2,
                        ensure_ascii=False,
                    )
                saved_files.append(out_path)

        return {
            "seed": self.seed,
            "products_by_dataset": products_by_dataset,
            "sessions": sessions,
            "saved_files": saved_files,
        }

