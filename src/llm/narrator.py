"""Build and validate concise decision briefs."""

import json
from typing import Any, Callable

import pandas as pd

from src.llm.critic import check_numbers


SYSTEM_PROMPT = """You are a careful analyst writing a decision brief for a marketplace operations
lead. Use ONLY the numbers in the FACTS json. Never calculate, estimate or
round differently. Copy the *_text values exactly whenever stating expected
value, gain over doing nothing, or probabilities. Use gain_over_do_nothing_text
for the gain over doing nothing. Copy break-even strings exactly. Never write
a numeric value that is not present in FACTS. Write at most 6 sentences:
(1) which option ranks first by expected value and its gain over doing nothing,
(2) its chance of being best and its chance of losing money, (3) the break-even
for the top two options, (4) one sentence saying which assumptions drive the
ranking, (5) one sentence saying that delivery-promise padding only relabels
lateness and is lower evidence than seller probation, (6) a one-line
recommendation that says 'under these assumptions'. Do not mention anything
that is not in FACTS."""


def build_facts(
    table: pd.DataFrame,
    assumptions: dict[str, Any],
    observed: dict[str, Any],
) -> dict[str, Any]:
    """Build rounded scenario facts for a decision brief."""
    scenarios = []
    for row in table.itertuples(index=False):
        scenarios.append(
            {
                "scenario": row.scenario,
                "expected": int(round(float(row.expected))),
                "p10": int(round(float(row.p10))),
                "p90": int(round(float(row.p90))),
                "p_loss": round(float(row.p_loss), 3),
                "p_best": round(float(row.p_best), 3),
                "breakeven": row.breakeven,
            }
        )
    do_nothing_expected = next(
        (
            scenario["expected"]
            for scenario in scenarios
            if scenario["scenario"] == "do nothing"
        ),
        0,
    )
    for scenario in scenarios:
        scenario["gain_over_do_nothing"] = (
            scenario["expected"] - do_nothing_expected
        )
        scenario["expected_text"] = f"R${scenario['expected']:,}"
        scenario["gain_over_do_nothing_text"] = (
            f"R${scenario['gain_over_do_nothing']:,}"
        )
        scenario["p_best_text"] = f"{scenario['p_best']:.1%}"
        scenario["p_loss_text"] = f"{scenario['p_loss']:.1%}"
    return {
        "scenarios": scenarios,
        "assumptions": assumptions,
        "observed": observed,
    }


def template_brief(facts: dict[str, Any]) -> str:
    """Write a deterministic brief without using a model."""
    scenarios = facts["scenarios"]
    best = max(scenarios, key=lambda scenario: scenario["expected"])
    return (
        f"{best['scenario']} ranks first with an expected change of "
        f"R${best['expected']:,}, a {best['p_best']:.1%} chance of being best, "
        f"and a {best['p_loss']:.1%} chance of losing money. Its break-even is "
        f"{best['breakeven']}. Delivery-promise padding only relabels lateness "
        "and is lower evidence than seller probation."
    )


def write_brief(
    facts: dict[str, Any],
    complete_fn: Callable[[str, str], str],
    language: str = "English",
) -> dict[str, Any]:
    """Generate a brief and replace unsupported model output with a template."""
    user_message = f"Language: {language}\nFACTS:\n" + json.dumps(facts)
    text = complete_fn(SYSTEM_PROMPT, user_message)
    verdict = check_numbers(text, facts)
    attempts = [verdict]
    if verdict["ok"]:
        return {
            "text": text,
            "verdict": verdict,
            "source": "model",
            "raw_text": text,
            "attempts": attempts,
        }

    retry_message = (
        f"{user_message}\nThese numbers are not in FACTS: "
        f"{verdict['unsupported']}. Rewrite without them."
    )
    text = complete_fn(SYSTEM_PROMPT, retry_message)
    retry_verdict = check_numbers(text, facts)
    attempts.append(retry_verdict)
    if retry_verdict["ok"]:
        return {
            "text": text,
            "verdict": retry_verdict,
            "source": "model",
            "raw_text": text,
            "attempts": attempts,
        }

    return {
        "text": template_brief(facts),
        "verdict": retry_verdict,
        "source": "template",
        "raw_text": text,
        "attempts": attempts,
    }
