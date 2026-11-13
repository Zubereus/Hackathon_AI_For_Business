"""Objective deterministic scorers and persona-weighted dimension calculators."""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Set

from evaluation.simulator.conversation_controller import ConversationSession

DIMENSIONS: List[str] = [
    "usability",
    "clarity",
    "numerical_accuracy",
    "assumption_transparency",
    "consistency",
    "reasoning_quality",
    "uncertainty_handling",
    "actionability",
    "robustness",
]

PERSONA_WEIGHTS: Dict[str, Dict[str, float]] = {
    "non_technical_owner": {
        "usability": 0.22,
        "clarity": 0.22,
        "actionability": 0.14,
        "robustness": 0.10,
        "uncertainty_handling": 0.08,
        "assumption_transparency": 0.08,
        "reasoning_quality": 0.06,
        "consistency": 0.05,
        "numerical_accuracy": 0.05,
    },
    "skeptical_owner": {
        "numerical_accuracy": 0.22,
        "consistency": 0.16,
        "assumption_transparency": 0.16,
        "uncertainty_handling": 0.14,
        "robustness": 0.12,
        "reasoning_quality": 0.08,
        "clarity": 0.05,
        "actionability": 0.04,
        "usability": 0.03,
    },
    "strategic_decision_maker": {
        "reasoning_quality": 0.20,
        "actionability": 0.18,
        "assumption_transparency": 0.14,
        "uncertainty_handling": 0.12,
        "robustness": 0.12,
        "numerical_accuracy": 0.08,
        "consistency": 0.08,
        "clarity": 0.04,
        "usability": 0.04,
    },
}

_TECHNICAL_JARGON = (
    "elasticity",
    "monte carlo",
    "co giãn",
    "p5",
    "p50",
    "p95",
    "wape",
    "spearman",
    "xói mòn",
    "phân vị",
    "biên gộp",
    "manual_form",
)

_NON_PRICE_INTENTS = (
    "contradictory_non_price_input",
    "non_price_marketing_lever",
    "working_capital_planning",
    "multi_lever_strategy_comparison",
)


def _collect_numbers(obj: Any, bucket: Set[float] | None = None) -> Set[float]:
    if bucket is None:
        bucket = set()
    if isinstance(obj, bool):
        return bucket
    if isinstance(obj, (int, float)) and math.isfinite(obj):
        v = float(obj)
        for scale in (1.0, 1e-3, 1e-6, 100.0):
            for dec in (0, 1, 2, 3):
                bucket.add(round(v * scale, dec))
                bucket.add(abs(round(v * scale, dec)))
    elif isinstance(obj, dict):
        for val in obj.values():
            _collect_numbers(val, bucket)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            _collect_numbers(item, bucket)
    return bucket


def _check_text_grounding(text: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Independent black-box verification that explanation numbers exist in engine JSON."""
    if not text.strip():
        return {"grounded": False, "ungrounded_tokens": ["empty"]}
    allowed = _collect_numbers(payload)
    quantiles = {1.0, 5.0, 10.0, 50.0, 80.0, 90.0, 95.0}
    raw_matches = re.findall(r"(?<![a-zA-Z_])[-+]?\d+(?:[.,]\d+)*", text)
    bad: List[str] = []
    for tok in raw_matches:
        cands: List[float] = []
        try:
            cands.append(float(tok.replace(",", "")))
        except ValueError:
            pass
        try:
            cands.append(float(tok.replace(".", "").replace(",", ".")))
        except ValueError:
            pass
        matched = False
        for c in cands:
            if c in quantiles or abs(c) in quantiles:
                matched = True
                break
            if any(abs(c - ref) <= max(0.2, abs(ref) * 0.005) for ref in allowed):
                matched = True
                break
        if not matched:
            bad.append(tok)
    return {"grounded": len(bad) == 0, "ungrounded_tokens": bad}


def compute_objective_metrics(
    sessions: List[ConversationSession],
    products_by_dataset: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """Compute strictly deterministic, observable metrics across all turns."""
    total_turns = 0
    answered_turns = 0
    fallback_turns = 0
    error_turns = 0
    latencies: List[float] = []

    math_checks_passed = 0
    math_checks_total = 0
    ordering_passed = 0
    ordering_total = 0
    grounding_passed = 0
    grounding_total = 0

    bounds_tested = 0
    bounds_rejected = 0

    low_var_tested = 0
    low_var_disclosed = 0

    non_price_tested = 0
    non_price_misinterpreted = 0

    ambiguous_tested = 0
    ambiguous_answered_helpfully = 0

    jargon_hits_total = 0
    weaknesses: List[Dict[str, Any]] = []

    for sess in sessions:
        prods = products_by_dataset.get(sess.dataset_id) or []
        prod_by_id = {p["product_id"]: p for p in prods}

        for turn in sess.turns:
            total_turns += 1
            latencies.append(turn.latency_ms)

            if turn.response_status == "answered":
                answered_turns += 1
            elif turn.response_status == "fallback":
                fallback_turns += 1
            else:
                error_turns += 1

            # 1. Edge-case bounds check
            if sess.intent_category == "edge_case_bounds" and turn.turn_index == 1:
                bounds_tested += 1
                if turn.response_status == "fallback":
                    bounds_rejected += 1
                else:
                    weaknesses.append(
                        {
                            "agent_id": sess.agent_id,
                            "scenario_id": sess.scenario_id,
                            "turn": turn.turn_index,
                            "dimension": "robustness",
                            "severity": "high",
                            "description": f"Extreme out-of-bounds query was NOT rejected: '{turn.question}'",
                        }
                    )

            # 2. Scope / Non-price variable misinterpretation check
            if sess.intent_category in _NON_PRICE_INTENTS and turn.turn_index == 1:
                non_price_tested += 1
                if turn.response_status == "answered":
                    non_price_misinterpreted += 1
                    chg = (turn.parsed_spec or {}).get("change_value")
                    weaknesses.append(
                        {
                            "agent_id": sess.agent_id,
                            "scenario_id": sess.scenario_id,
                            "turn": turn.turn_index,
                            "dimension": "robustness",
                            "severity": "high",
                            "description": (
                                f"Misinterpreted non-price lever ({sess.intent_category}) as a {chg}% "
                                f"unit selling-price simulation instead of disclosing out-of-scope limits."
                            ),
                            "question": turn.question,
                        }
                    )

            # 3. Ambiguous / glossary / store-health UX handling
            if sess.intent_category in (
                "ambiguous_diagnosis",
                "financial_glossary_help",
                "missing_parameters_guidance",
                "holistic_store_health",
            ) and turn.turn_index == 1:
                ambiguous_tested += 1
                if turn.response_status == "answered":
                    ambiguous_answered_helpfully += 1
                else:
                    weaknesses.append(
                        {
                            "agent_id": sess.agent_id,
                            "scenario_id": sess.scenario_id,
                            "turn": turn.turn_index,
                            "dimension": "usability",
                            "severity": "medium",
                            "description": (
                                f"Rejected {sess.intent_category} query with fallback error ('{turn.fallback_reason}') "
                                "instead of providing interactive guidance or educational answer."
                            ),
                            "question": turn.question,
                        }
                    )

            # 4. Quantitative accuracy & grounding when answered
            if turn.response_status == "answered" and turn.simulation_summary:
                sim = turn.simulation_summary
                scen = sim.get("scenarios", {})
                dist = sim.get("profit_distribution", {})
                base = scen.get("base", {})
                opt = scen.get("optimistic", {})
                exp = scen.get("expected", {})
                pess = scen.get("pessimistic", {})

                # Scenario ordering + quantile monotonicity
                ordering_total += 1
                if (
                    float(opt.get("profit", 0)) + 1.0 >= float(exp.get("profit", 0))
                    and float(exp.get("profit", 0)) + 1.0 >= float(pess.get("profit", 0))
                    and float(dist.get("p5", 0)) <= float(dist.get("p50", 0)) + 1.0
                    and float(dist.get("p50", 0)) <= float(dist.get("p95", 0)) + 1.0
                ):
                    ordering_passed += 1
                else:
                    weaknesses.append(
                        {
                            "agent_id": sess.agent_id,
                            "scenario_id": sess.scenario_id,
                            "turn": turn.turn_index,
                            "dimension": "numerical_accuracy",
                            "severity": "high",
                            "description": "Scenario ordering (optimistic >= expected >= pessimistic) or quantile monotonicity violated.",
                        }
                    )

                # Profit identity check for single-step unconstrained/point scenarios
                pid = (turn.parsed_spec or {}).get("product_id")
                prod = prod_by_id.get(pid or "")
                is_sched = bool((turn.parsed_spec or {}).get("schedule"))
                if prod and not is_sched:
                    math_checks_total += 1
                    p0 = float(prod["current_price_vnd"])
                    cost = float(prod["unit_cost_vnd"])
                    fixed = float(prod.get("fixed_cost_vnd") or 0)
                    chg = float((turn.parsed_spec or {}).get("change_value") or 0.0)
                    p1 = p0 * (1.0 + chg / 100.0)
                    exp_qty = float(exp.get("qty", 0))
                    expected_profit_formula = (p1 - cost) * exp_qty - fixed
                    reported_profit = float(exp.get("profit", 0))
                    tol = max(5.0, abs(expected_profit_formula) * 1e-4)
                    if abs(expected_profit_formula - reported_profit) <= tol:
                        math_checks_passed += 1
                    else:
                        weaknesses.append(
                            {
                                "agent_id": sess.agent_id,
                                "scenario_id": sess.scenario_id,
                                "turn": turn.turn_index,
                                "dimension": "numerical_accuracy",
                                "severity": "high",
                                "description": (
                                    f"Formula mismatch: (P1-cost)*qty-fixed={expected_profit_formula:,.0f} "
                                    f"vs reported={reported_profit:,.0f}"
                                ),
                            }
                        )

                # Zero-change check
                if sess.intent_category == "zero_change_identity":
                    if abs(float(exp.get("profit", 0)) - float(base.get("profit", 0))) > 5.0:
                        weaknesses.append(
                            {
                                "agent_id": sess.agent_id,
                                "scenario_id": sess.scenario_id,
                                "turn": turn.turn_index,
                                "dimension": "consistency",
                                "severity": "medium",
                                "description": "At 0% price change, expected profit differed from baseline profit.",
                            }
                        )

                # Uncertainty disclosure on hard_low_price_variation_8
                if sess.dataset_id == "hard_low_price_variation_8":
                    low_var_tested += 1
                    adv = sim.get("advisory") or {}
                    flags = adv.get("risk_flags") or []
                    expl_txt = str((turn.explanation or {}).get("situation_summary") or "") + " " + str(
                        (turn.explanation or {}).get("text") or ""
                    )
                    if flags or any(k in expl_txt.lower() for k in ("ít", "chưa", "limited", "uncertainty")):
                        low_var_disclosed += 1
                    else:
                        weaknesses.append(
                            {
                                "agent_id": sess.agent_id,
                                "scenario_id": sess.scenario_id,
                                "turn": turn.turn_index,
                                "dimension": "uncertainty_handling",
                                "severity": "high",
                                "description": "Failed to disclose low-price-variation uncertainty on hard_low_price_variation_8.",
                            }
                        )

                # Explanation number grounding + jargon count
                expl = turn.explanation or {}
                visible_text = "\n".join(
                    [
                        str(expl.get("direct_answer") or ""),
                        str(expl.get("situation_summary") or ""),
                        str(expl.get("text") or ""),
                        " ".join(str(r) for r in (expl.get("recommendations") or [])),
                    ]
                )
                grounding_total += 1
                if turn.response_status == "answered" and turn.explanation:
                    pass
                g_res = _check_text_grounding(
                    visible_text,
                    {
                        "simulation": sim,
                        "optimization": turn.optimization_summary or {},
                        "parsed_spec": turn.parsed_spec or {},
                        "product_context": prod or {},
                    },
                )
                if g_res["grounded"]:
                    grounding_passed += 1
                else:
                    weaknesses.append(
                        {
                            "agent_id": sess.agent_id,
                            "scenario_id": sess.scenario_id,
                            "turn": turn.turn_index,
                            "dimension": "numerical_accuracy",
                            "severity": "high",
                            "description": f"Potential ungrounded tokens in explanation: {g_res['ungrounded_tokens']}",
                        }
                    )

                low_vis = visible_text.lower()
                turn_jargon = [j for j in _TECHNICAL_JARGON if j in low_vis]
                if turn_jargon and sess.agent_id == "non_technical_owner":
                    jargon_hits_total += len(turn_jargon)
                    weaknesses.append(
                        {
                            "agent_id": sess.agent_id,
                            "scenario_id": sess.scenario_id,
                            "turn": turn.turn_index,
                            "dimension": "clarity",
                            "severity": "low",
                            "description": f"Jargon surfaced for non-technical owner: {turn_jargon}",
                        }
                    )

    return {
        "total_turns": total_turns,
        "answered_turns": answered_turns,
        "fallback_turns": fallback_turns,
        "error_turns": error_turns,
        "avg_latency_ms": round(sum(latencies) / max(len(latencies), 1), 1),
        "math_identity_pass_rate": round(math_checks_passed / max(math_checks_total, 1), 3),
        "scenario_ordering_pass_rate": round(ordering_passed / max(ordering_total, 1), 3),
        "number_grounding_pass_rate": round(grounding_passed / max(grounding_total, 1), 3),
        "bounds_rejection_rate": round(bounds_rejected / max(bounds_tested, 1), 3),
        "low_variation_disclosure_rate": round(low_var_disclosed / max(low_var_tested, 1), 3),
        "non_price_scope_misinterpretation_count": non_price_misinterpreted,
        "non_price_scope_total": non_price_tested,
        "ambiguous_helpful_rate": round(ambiguous_answered_helpfully / max(ambiguous_tested, 1), 3),
        "jargon_hits_non_technical": jargon_hits_total,
        "detected_weaknesses": weaknesses,
    }


def score_agent_dimensions(
    agent_id: str,
    sessions: List[ConversationSession],
    objective: Dict[str, Any],
) -> Dict[str, Any]:
    """Compute per-dimension scores (0..10) for one persona without hiding individual weaknesses."""
    agent_sessions = [s for s in sessions if s.agent_id == agent_id]
    agent_weak = [w for w in objective["detected_weaknesses"] if w["agent_id"] == agent_id]

    def _penalize(base: float, dim: str, weight_per_hit: float = 1.5) -> float:
        hits = [w for w in agent_weak if w["dimension"] == dim]
        penalty = sum(weight_per_hit * (1.5 if w["severity"] == "high" else 1.0 if w["severity"] == "medium" else 0.5) for w in hits)
        return round(max(1.0, min(10.0, base - penalty)), 2)

    answered = sum(1 for s in agent_sessions for t in s.turns if t.response_status == "answered")
    fallbacks = sum(1 for s in agent_sessions for t in s.turns if t.response_status == "fallback")
    total_t = max(1, answered + fallbacks)

    # Objective-grounded dimension scores (0..10)
    num_acc = round(
        10.0
        * (
            0.4 * objective["math_identity_pass_rate"]
            + 0.3 * objective["scenario_ordering_pass_rate"]
            + 0.3 * objective["number_grounding_pass_rate"]
        ),
        2,
    )
    usability = _penalize(9.2 - (fallbacks / total_t) * 3.0, "usability", 1.2)
    clarity = _penalize(9.0, "clarity", 1.0)
    assumption_transp = 8.5 if answered > 0 else 4.0
    # Penalize assumption transparency if system silently turned ad/opex % into price %
    if any("Misinterpreted non-price lever" in w["description"] for w in agent_weak):
        assumption_transp = round(max(2.0, assumption_transp - 3.5), 2)

    consistency = _penalize(9.2, "consistency", 1.5)
    reasoning = 8.8
    if any(w["dimension"] == "robustness" and "Misinterpreted" in w["description"] for w in agent_weak):
        reasoning = round(max(2.5, reasoning - 2.8), 2)
    if agent_id == "non_technical_owner" and objective["ambiguous_helpful_rate"] < 0.5:
        reasoning = round(max(3.0, reasoning - 2.0), 2)

    uncertainty = round(10.0 * objective["low_variation_disclosure_rate"], 2) if agent_id == "skeptical_owner" else 8.4
    actionability = round(8.5 if answered >= 2 else 5.0, 2)
    robustness = _penalize(9.2, "robustness", 1.6)

    dims = {
        "usability": usability,
        "clarity": clarity,
        "numerical_accuracy": num_acc,
        "assumption_transparency": assumption_transp,
        "consistency": consistency,
        "reasoning_quality": reasoning,
        "uncertainty_handling": uncertainty,
        "actionability": actionability,
        "robustness": robustness,
    }
    weights = PERSONA_WEIGHTS[agent_id]
    weighted_index = round(sum(dims[d] * weights[d] for d in DIMENSIONS), 2)

    return {
        "agent_id": agent_id,
        "dimensions": dims,
        "persona_weights": weights,
        "weighted_persona_score": weighted_index,
        "turns_total": total_t,
        "answered_turns": answered,
        "fallback_turns": fallbacks,
        "weaknesses": agent_weak,
    }

