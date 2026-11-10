"""Tests for decision brief generation and fallback behavior."""

import pandas as pd

from src.llm.narrator import build_facts, template_brief, write_brief


def make_facts():
    """Build a compact scenario fixture."""
    table = pd.DataFrame(
        [
            {
                "scenario": "promise +7d",
                "expected": 25.0,
                "p10": -5.0,
                "p90": 50.0,
                "p_loss": 0.1,
                "p_best": 0.8,
                "breakeven": "conv. loss 12%",
            },
            {
                "scenario": "do nothing",
                "expected": 0.0,
                "p10": 0.0,
                "p90": 0.0,
                "p_loss": 0.0,
                "p_best": 0.2,
                "breakeven": "-",
            },
        ]
    )
    return build_facts(table, {"take_rate": 0.1}, {"orders": 100})


def test_write_brief_uses_supported_model_output():
    """Return valid model output without retrying."""
    facts = make_facts()
    expected = "promise +7d has expected value R$25 and chance 80%."
    calls = []

    def fake_complete(system, user):
        calls.append((system, user))
        return expected

    result = write_brief(facts, fake_complete)
    assert result["source"] == "model"
    assert result["text"] == expected
    assert result["verdict"]["ok"]
    assert len(calls) == 1


def test_build_facts_includes_formatted_claims_and_gain_over_baseline():
    """Provide ready-formatted amounts and probabilities for model copying."""
    promise = make_facts()["scenarios"][0]
    assert promise["expected_text"] == "R$25"
    assert promise["gain_over_do_nothing"] == 25
    assert promise["gain_over_do_nothing_text"] == "R$25"
    assert promise["p_best_text"] == "80.0%"
    assert promise["p_loss_text"] == "10.0%"


def test_write_brief_retries_then_uses_template():
    """Retry unsupported model output once before using the fallback."""
    facts = make_facts()
    calls = []

    def fake_complete(system, user):
        calls.append((system, user))
        return "The result is 12345."

    result = write_brief(facts, fake_complete)
    assert len(calls) == 2
    assert "12345.0" in calls[1][1]
    assert result["source"] == "template"
    assert result["text"] == template_brief(facts)
