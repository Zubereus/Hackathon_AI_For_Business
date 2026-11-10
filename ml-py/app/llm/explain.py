"""Scenario Simulation Explainer with Strict Hallucination Post-Check for What-If AI.

Synthesizes a 3-5 sentence executive summary strictly restating figures computed
by the simulation engine.

Guardrail (Zero Hallucinated Numbers):
    1. Recursively extracts every numeric figure present in the input scenario JSON
       along with standard VND display scales (raw, K, M, percentage, 0-2 decimal rounding).
    2. Extracts every number emitted in the LLM's candidate prose.
    3. If ANY number in the LLM prose cannot be matched to an input figure, the LLM
       prose is discarded and replaced by a deterministic code-generated template.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Works seamlessly offline (code template fallback).
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.llm.client import LLMClient


def extract_allowed_numbers(obj: Any, bucket: Optional[Set[float]] = None) -> Set[float]:
    """Recursively collect all numerical figures and their scaled formats from input JSON."""
    if bucket is None:
        bucket = set()

    if isinstance(obj, bool):
        return bucket
    if isinstance(obj, (int, float)):
        if math.isfinite(obj):
            val = float(obj)
            bucket.add(val)
            bucket.add(abs(val))
            # Support standard retail presentation scales (raw, K, M, %, 0..2 dec)
            for scale in (1.0, 1e-3, 1e-6, 100.0):
                scaled = val * scale
                for dec in (0, 1, 2, 3):
                    bucket.add(round(scaled, dec))
                    bucket.add(abs(round(scaled, dec)))
    elif isinstance(obj, dict):
        for v in obj.values():
            extract_allowed_numbers(v, bucket)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            extract_allowed_numbers(item, bucket)
    elif isinstance(obj, str):
        # Extract numeric tokens embedded in string fields (e.g. "price_change_pct: +10%")
        for tok in re.findall(r"[-+]?\d+(?:[.,]\d+)?", obj):
            try:
                num = float(tok.replace(",", ""))
                bucket.add(num)
                bucket.add(abs(num))
            except ValueError:
                pass
    return bucket


def _parse_text_number(token: str) -> List[float]:
    """Parse a formatted numeric token from prose into candidate float interpretations."""
    clean = token.strip().replace(" ", "")
    multiplier = 1.0
    lower = clean.lower()
    if lower.endswith("m"):
        multiplier = 1e6
        clean = clean[:-1]
    elif lower.endswith("b"):
        multiplier = 1e9
        clean = clean[:-1]
    elif lower.endswith("k"):
        multiplier = 1e3
        clean = clean[:-1]

    candidates: List[float] = []
    # Try English format (comma thousands, dot decimal): e.g. '476,700,000' or '476.7'
    en_str = clean.replace(",", "")
    try:
        v = float(en_str)
        candidates.append(v)
        if multiplier != 1.0:
            candidates.append(v * multiplier)
    except ValueError:
        pass

    # Try Vietnamese format (dot thousands, comma decimal): e.g. '100.000' or '476,7'
    if "." in clean or "," in clean:
        vi_str = clean.replace(".", "").replace(",", ".")
        try:
            v_vi = float(vi_str)
            candidates.append(v_vi)
            if multiplier != 1.0:
                candidates.append(v_vi * multiplier)
        except ValueError:
            pass

    return candidates


def verify_explanation_numbers(text: str, scenario_result: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Verify that EVERY number appearing in explanation text exists in scenario_result.

    Args:
        text: Candidate narrative summary.
        scenario_result: Original simulation payload from the Go engine.

    Returns:
        Tuple containing:
            - is_valid (bool): True if zero ungrounded/hallucinated numbers found.
            - bad_tokens (List[str]): List of unverified numeric strings if invalid.
    """
    if not text or not text.strip():
        return False, ["empty_text"]

    allowed = extract_allowed_numbers(scenario_result)
    # Standard structural percentile indices commonly referenced when describing p5/p10/p50/p90/p95
    structural_quantiles = {5.0, 10.0, 50.0, 90.0, 95.0, 80.0}

    # Match standalone numbers (including formatted 100.000, 476.7M, -2.341, 10%)
    # Avoid splitting identifiers like P01 or SKU-12
    raw_matches = re.findall(r"(?<![a-zA-Z_])[-+]?\d+(?:[.,]\d+)*(?:[kKmMbB])?", text)

    bad_tokens: List[str] = []
    for raw_tok in raw_matches:
        cands = _parse_text_number(raw_tok)
        matched = False
        for c in cands:
            if c in structural_quantiles or abs(c) in structural_quantiles:
                matched = True
                break
            for ref in allowed:
                # Match exact, tight relative tolerance, or 1-decimal rounding window
                if abs(c - ref) <= max(0.11, abs(ref) * 0.005):
                    matched = True
                    break
            if matched:
                break
        if not matched:
            bad_tokens.append(raw_tok)

    return len(bad_tokens) == 0, bad_tokens


def _fmt_vnd(val: Any) -> str:
    """Format integer VND with dot thousand separators."""
    try:
        n = int(round(float(val)))
        return f"{n:,}".replace(",", ".") + " VND"
    except (ValueError, TypeError):
        return str(val)


def build_template_explanation(scenario_result: Dict[str, Any]) -> str:
    """Construct deterministic, 100% factual explanation directly from computed figures."""
    scenarios = scenario_result.get("scenarios", {})
    base = scenarios.get("base", {})
    exp = scenarios.get("expected", {})
    opt = scenarios.get("optimistic", {})
    pess = scenarios.get("pessimistic", {})
    dist = scenario_result.get("profit_distribution", {})
    be = scenario_result.get("break_even_elasticity")

    base_p = base.get("price_vnd") if base.get("price_vnd") is not None else base.get("price", 0)
    new_p = exp.get("price_vnd") if exp.get("price_vnd") is not None else exp.get("price", 0)
    base_profit = base.get("profit_vnd") if base.get("profit_vnd") is not None else base.get("profit", 0)
    exp_profit = exp.get("profit_vnd") if exp.get("profit_vnd") is not None else exp.get("profit", 0)
    opt_profit = opt.get("profit_vnd") if opt.get("profit_vnd") is not None else opt.get("profit", 0)
    pess_profit = pess.get("profit_vnd") if pess.get("profit_vnd") is not None else pess.get("profit", 0)
    exp_qty = exp.get("qty") if exp.get("qty") is not None else exp.get("quantity", 0)

    p5 = dist.get("p5", pess_profit)
    p50 = dist.get("p50", exp_profit)
    p95 = dist.get("p95", opt_profit)

    lines: List[str] = [
        (
            f"Changing price from {_fmt_vnd(base_p)} to {_fmt_vnd(new_p)} yields an expected "
            f"volume of {int(round(float(exp_qty))):,} units and an expected profit of {_fmt_vnd(exp_profit)} "
            f"(compared to the base profit of {_fmt_vnd(base_profit)})."
        ).replace(",", "."),
        (
            f"Across demand uncertainty, simulated profit ranges from {_fmt_vnd(pess_profit)} in the "
            f"pessimistic scenario (90th sensitivity percentile) up to {_fmt_vnd(opt_profit)} in the "
            f"optimistic scenario (10th sensitivity percentile)."
        ),
        (
            f"The Monte Carlo distribution spans p5 = {_fmt_vnd(p5)}, median p50 = {_fmt_vnd(p50)}, "
            f"and p95 = {_fmt_vnd(p95)}."
        ),
    ]

    if be is not None and math.isfinite(float(be)):
        lines.append(
            f"Break-even price elasticity for this move is {round(float(be), 3)}; "
            f"if true customer sensitivity is stronger than this threshold, expected profit declines."
        )

    lines.append(
        "Note: Figures reflect simulated ranges from a controlled observational demand estimate, not proven causality."
    )
    return " ".join(lines)


def explain_scenario(
    scenario_result: Dict[str, Any],
    client: Optional[LLMClient] = None,
    candidate_override_text: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a verified executive summary for simulation outputs.

    Args:
        scenario_result: Complete JSON output from the simulation engine.
        client: Optional configured LLMClient.
        candidate_override_text: Optional mock LLM output (used for hallucination post-check testing).

    Returns:
        Dict with keys 'text', 'used_fallback', and 'rejected_numbers'.
    """
    llm_client = client or LLMClient()
    candidate_text: Optional[str] = candidate_override_text

    if candidate_text is None and llm_client.is_configured():
        sys_prompt = (
            "You are a concise business analytics narrator. Write 3-5 clear sentences summarizing "
            "the retail pricing simulation results below.\n"
            "STRICT RULE: ONLY restate exact numbers present in the provided JSON. Do NOT compute, "
            "extrapolate, or invent any number. State that results are simulated ranges from a "
            "controlled observational model, not guarantees."
        )
        candidate_text = llm_client.complete_text(
            sys_prompt,
            f"Simulation Result JSON:\n{scenario_result}",
        )

    if candidate_text is not None:
        is_valid, bad_tokens = verify_explanation_numbers(candidate_text, scenario_result)
        if is_valid:
            return {
                "text": candidate_text.strip(),
                "used_fallback": False,
                "rejected_numbers": [],
            }
        # Hallucinated or ungrounded number detected -> discard LLM text and fall back
        return {
            "text": build_template_explanation(scenario_result),
            "used_fallback": True,
            "rejected_numbers": bad_tokens,
        }

    return {
        "text": build_template_explanation(scenario_result),
        "used_fallback": True,
        "rejected_numbers": [],
    }
