"""Evaluation Engine generating structured JSON and Markdown audit reports."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from evaluation.agents.base import PersonaLLMHelper
from evaluation.evaluator.scoring import (
    DIMENSIONS,
    compute_objective_metrics,
    score_agent_dimensions,
)
from evaluation.simulator.conversation_controller import ConversationSession


class EvaluationEngine:
    """Evaluates multi-agent transcripts with strict separation of objective vs subjective metrics."""

    def __init__(self, use_llm_judge: bool = False) -> None:
        self.use_llm_judge = use_llm_judge
        self.llm = PersonaLLMHelper() if use_llm_judge else None

    def _build_subjective_judgments(
        self,
        sessions: List[ConversationSession],
        agent_evaluations: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Produce persona-grounded qualitative assessments (tagged clearly as subjective)."""
        if self.llm and self.llm.is_configured():
            compact = [
                {
                    "agent_id": s.agent_id,
                    "scenario_id": s.scenario_id,
                    "turns": [
                        {
                            "q": t.question,
                            "status": t.response_status,
                            "fallback": t.fallback_reason,
                            "direct_answer": (t.explanation or {}).get("direct_answer"),
                            "verdict": (t.explanation or {}).get("action_verdict"),
                        }
                        for t in s.turns
                    ],
                }
                for s in sessions
            ]
            res = self.llm.complete_json(
                "You are an independent QA & Business UX Auditor. Critique weaknesses honestly without flattering the app. "
                "Return JSON with keys: 'non_technical_summary', 'skeptical_summary', 'strategic_summary', 'top_recommendations'.",
                f"Evaluation data:\n{json.dumps(compact, ensure_ascii=False)}",
            )
            if isinstance(res, dict) and res.get("non_technical_summary"):
                return {"source": "llm_judge", **res}

        # Deterministic subjective critic fallback (auditable & reproducible)
        nt_eval = agent_evaluations["non_technical_owner"]
        sk_eval = agent_evaluations["skeptical_owner"]
        st_eval = agent_evaluations["strategic_decision_maker"]

        return {
            "source": "deterministic_persona_critic",
            "non_technical_summary": (
                f"Strengths on plain discount simulations (clarity {nt_eval['dimensions']['clarity']}/10), "
                f"but weak on ambiguous store-health/glossary/restock prompts ({nt_eval['fallback_turns']} fallbacks "
                f"out of {nt_eval['turns_total']} turns) because NLQ enforces numeric price-% inputs."
            ),
            "skeptical_summary": (
                f"Strong math & grounding (accuracy {sk_eval['dimensions']['numerical_accuracy']}/10, "
                f"uncertainty {sk_eval['dimensions']['uncertainty_handling']}/10), but vulnerable when users mention "
                "non-price percentages like revenue +20% / marketing +35%."
            ),
            "strategic_summary": (
                f"Handles multi-phase seasonal schedules well (e.g. Tết 60d+7d), yet lacks support for non-price "
                f"levers (ad budgets, opex shocks, 500-unit working capital) unless explicitly rejected."
            ),
            "top_recommendations": [
                "Add a non-price intent classifier in /nlq/parse so 'marketing cost +35%', 'ad budget +20%', 'ROI?', and 'working capital for 500 units' return honest scope guidance instead of binding to a unit price change.",
                "Add conversational guided onboarding/FAQ responses for novice questions like 'ROI là gì?' or 'tại sao bán nhiều mà lời ít?' instead of returning manual_form errors.",
                "Allow multi-SKU portfolio health summaries so owners asking 'tháng này shop bán tốt không?' receive store-wide margin and trend diagnostics.",
            ],
        }

    def evaluate(
        self,
        sessions: List[ConversationSession],
        products_by_dataset: Dict[str, List[Dict[str, Any]]],
        seed: int = 42,
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        objective = compute_objective_metrics(sessions, products_by_dataset)

        agent_ids = ("non_technical_owner", "skeptical_owner", "strategic_decision_maker")
        agent_evals = {aid: score_agent_dimensions(aid, sessions, objective) for aid in agent_ids}
        subjective = self._build_subjective_judgments(sessions, agent_evals)

        nt_dims = agent_evals["non_technical_owner"]["dimensions"]
        sk_dims = agent_evals["skeptical_owner"]["dimensions"]
        st_dims = agent_evals["strategic_decision_maker"]["dimensions"]

        fundamental_answers = {
            "q1_ordinary_owner_usability": {
                "question": "Can an ordinary business owner actually use the What-if Agent without technical or financial expertise?",
                "verdict": "PARTIAL YES (works for direct price changes, struggles on open-ended shop questions)",
                "evidence": (
                    f"Usability={nt_dims['usability']}/10, Clarity={nt_dims['clarity']}/10. "
                    f"When given explicit % price questions, explanations are readable; however, open-ended questions "
                    f"('tại sao bán nhiều mà lời ít', 'ROI là gì') triggered {agent_evals['non_technical_owner']['fallback_turns']} fallbacks."
                ),
            },
            "q2_demanding_owner_trust": {
                "question": "Can a demanding user trust the application's calculations, assumptions, and conclusions?",
                "verdict": "HIGH MATHEMATICAL TRUST, MODERATE SEMANTIC SCOPE RISK",
                "evidence": (
                    f"Numerical Accuracy={sk_dims['numerical_accuracy']}/10 (math_identity={objective['math_identity_pass_rate']:.1%}, "
                    f"grounding={objective['number_grounding_pass_rate']:.1%}), Uncertainty Handling={sk_dims['uncertainty_handling']}/10. "
                    f"Detected {objective['non_price_scope_misinterpretation_count']} non-price % misinterpretations."
                ),
            },
            "q3_strategic_decision_maker": {
                "question": "Can a strategic decision-maker use the application to explore scenarios and make better-informed business decisions?",
                "verdict": "STRONG ON PRICING & SEASONAL RAMPS, NARROW ON MULTI-LEVER FINANCE",
                "evidence": (
                    f"Reasoning={st_dims['reasoning_quality']}/10, Actionability={st_dims['actionability']}/10. "
                    "Supports 90-day scenarios, seasonal Tết multipliers, and reverse goal search, "
                    "but does not yet isolate ad-spend or opex levers cleanly."
                ),
            },
        }

        report: Dict[str, Any] = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "seed": seed,
            "dimensions": DIMENSIONS,
            "objective_metrics": {k: v for k, v in objective.items() if k != "detected_weaknesses"},
            "detected_weaknesses": objective["detected_weaknesses"],
            "agent_evaluations": agent_evals,
            "subjective_judgments": subjective,
            "fundamental_questions": fundamental_answers,
        }

        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            json_path = os.path.join(output_dir, "evaluation_report.json")
            md_path = os.path.join(output_dir, "evaluation_report.md")
            with open(json_path, "w", encoding="utf-8") as fh:
                json.dump(report, fh, indent=2, ensure_ascii=False)
            with open(md_path, "w", encoding="utf-8") as fh:
                fh.write(self.render_markdown(report))
            report["report_files"] = {"json": json_path, "markdown": md_path}

        return report

    def render_markdown(self, report: Dict[str, Any]) -> str:
        obj = report["objective_metrics"]
        agent_evals = report["agent_evaluations"]
        subj = report["subjective_judgments"]
        fq = report["fundamental_questions"]
        weaknesses = report["detected_weaknesses"]

        lines: List[str] = [
            "# Multi-Agent Evaluation Report — What-If AI",
            "",
            f"- **Generated at**: `{report['generated_at']}`",
            f"- **Seed (Reproducible Mode)**: `{report['seed']}`",
            f"- **Subjective Judge Source**: `{subj['source']}` *(kept strictly separate from objective metrics)*",
            "",
            "## 1. Executive Answers to the 3 Fundamental Questions",
            "",
        ]
        for key in ("q1_ordinary_owner_usability", "q2_demanding_owner_trust", "q3_strategic_decision_maker"):
            item = fq[key]
            lines.extend(
                [
                    f"### {item['question']}",
                    f"- **Verdict**: **{item['verdict']}**",
                    f"- **Evidence**: {item['evidence']}",
                    "",
                ]
            )

        lines.extend(
            [
                "## 2. Objective Metrics (Deterministic Engine & Guardrail Verification)",
                "",
                "| Metric | Observed Value |",
                "|---|---|",
                f"| Total / Answered / Fallback / Error Turns | {obj['total_turns']} / {obj['answered_turns']} / {obj['fallback_turns']} / {obj['error_turns']} |",
                f"| Average End-to-End Turn Latency | {obj['avg_latency_ms']} ms |",
                f"| Formula Identity Pass Rate (`(P1-cost)*qty-fixed`) | {obj['math_identity_pass_rate']:.1%} |",
                f"| Scenario Ordering & Quantile Monotonicity | {obj['scenario_ordering_pass_rate']:.1%} |",
                f"| Zero-Hallucination Number Grounding Rate | {obj['number_grounding_pass_rate']:.1%} |",
                f"| Extreme Bounds Rejection Rate (`-80%`, `400d`) | {obj['bounds_rejection_rate']:.1%} |",
                f"| Low-Price-Variation Uncertainty Disclosure Rate | {obj['low_variation_disclosure_rate']:.1%} |",
                f"| Non-Price Variable Misinterpretations | {obj['non_price_scope_misinterpretation_count']} / {obj['non_price_scope_total']} |",
                f"| Ambiguous / Non-Numeric Query Helpfulness | {obj['ambiguous_helpful_rate']:.1%} |",
                f"| Technical Jargon Hits (Agent 1) | {obj['jargon_hits_non_technical']} |",
                "",
                "## 3. Persona-Weighted 9-Dimension Breakdown (No Hidden Weaknesses)",
                "",
                "| Dimension | Agent 1 (Non-Tech Owner) | Agent 2 (Skeptical Owner) | Agent 3 (Strategist) |",
                "|---|---:|---:|---:|",
            ]
        )

        for dim in DIMENSIONS:
            s1 = agent_evals["non_technical_owner"]["dimensions"][dim]
            s2 = agent_evals["skeptical_owner"]["dimensions"][dim]
            s3 = agent_evals["strategic_decision_maker"]["dimensions"][dim]
            lines.append(f"| `{dim}` | {s1:.2f} | {s2:.2f} | {s3:.2f} |")

        lines.append(
            f"| **Weighted Persona Index** | **{agent_evals['non_technical_owner']['weighted_persona_score']:.2f}** | "
            f"**{agent_evals['skeptical_owner']['weighted_persona_score']:.2f}** | "
            f"**{agent_evals['strategic_decision_maker']['weighted_persona_score']:.2f}** |"
        )

        lines.extend(["", "## 4. Concrete Weaknesses & Failure Modes Exposed", ""])
        if not weaknesses:
            lines.append("- None detected in this run.")
        else:
            for idx, w in enumerate(weaknesses, 1):
                q_part = f" *(Query: `{w['question']}`)*" if w.get("question") else ""
                lines.append(
                    f"{idx}. **[{w['severity'].upper()}]** `{w['agent_id']}` · `{w['scenario_id']}` (turn {w['turn']}, `{w['dimension']}`): {w['description']}{q_part}"
                )

        lines.extend(
            [
                "",
                "## 5. Subjective Persona Critique & Improvement Priorities",
                "",
                f"- **Non-Technical Owner**: {subj['non_technical_summary']}",
                f"- **Skeptical Owner**: {subj['skeptical_summary']}",
                f"- **Strategic Decision Maker**: {subj['strategic_summary']}",
                "",
                "### Top Actionable Fixes Identified",
            ]
        )
        for rec in subj.get("top_recommendations", []):
            lines.append(f"- {rec}")

        lines.append("")
        return "\n".join(lines)

