"""Tests for numeric claim validation."""

from src.llm.critic import check_numbers, collect_allowed, extract_numbers


def test_extract_numbers_handles_money_percentages_and_day_labels():
    """Parse money and percentage values but ignore day suffixes."""
    assert extract_numbers("R$7,050 and 79.5% over +7d") == [7050.0, 79.5]


def test_check_numbers_accepts_values_present_in_facts():
    """Accept text whose material numbers are supported by the facts."""
    facts = {"expected": 7050, "probability": 0.795}
    verdict = check_numbers("Expected R$7,050 with a 79.5% probability.", facts)
    assert verdict == {"ok": True, "checked": 2, "unsupported": []}


def test_check_numbers_rejects_unsupported_values():
    """Report unsupported material numeric claims."""
    verdict = check_numbers("The total is 12345.", {"expected": 7050})
    assert verdict == {"ok": False, "checked": 1, "unsupported": [12345.0]}


def test_probability_facts_support_percent_form():
    """Allow a probability fact to be stated as a percentage."""
    assert 79.5 in collect_allowed({"probability": 0.795})
    assert check_numbers("The probability is 79.5%.", {"probability": 0.795})["ok"]


def test_string_facts_support_numbers_in_break_even_text():
    """Extract numeric evidence from string-valued facts."""
    facts = {"scenarios": [{"breakeven": "conv. loss 12%; late cost R$21"}]}
    assert check_numbers("Break-even is 12% and late cost is R$21.", facts)["ok"]
