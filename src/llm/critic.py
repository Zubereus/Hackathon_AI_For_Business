"""Validate numeric claims in generated decision briefs."""

import math
import re
from numbers import Real
from typing import Any


NUMBER_PATTERN = re.compile(
    r"(?<![\w])(?P<sign>[+-]?)(?P<number>"
    r"(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"
    r")(?P<percent>%?)(?![\w])"
)


def _number_matches(text: str) -> list[tuple[float, int, bool]]:
    """Parse numeric claims with their shown precision and percentage marker."""
    matches = []
    for match in NUMBER_PATTERN.finditer(text):
        number_text = match.group("number")
        value = float(number_text.replace(",", ""))
        if match.group("sign") == "-":
            value = -value
        decimals = len(number_text.partition(".")[2])
        matches.append((value, decimals, bool(match.group("percent"))))
    return matches


def extract_numbers(text: str) -> list[float]:
    """Return parsed numeric claims, excluding day labels such as +7d."""
    return [value for value, _, _ in _number_matches(text)]


def _walk_numbers(value: Any) -> list[float]:
    """Collect numeric values recursively from dictionaries and lists."""
    if isinstance(value, dict):
        return [
            number
            for nested_value in value.values()
            for number in _walk_numbers(nested_value)
        ]
    if isinstance(value, (list, tuple)):
        return [
            number
            for nested_value in value
            for number in _walk_numbers(nested_value)
        ]
    if isinstance(value, Real) and not isinstance(value, bool):
        number = float(value)
        return [number] if math.isfinite(number) else []
    if isinstance(value, str):
        return extract_numbers(value)
    return []


def collect_allowed(facts: dict[str, Any]) -> list[float]:
    """Collect fact numbers and their percentage-form equivalents."""
    allowed = []
    for value in _walk_numbers(facts):
        allowed.append(value)
        if -1 <= value <= 1:
            allowed.append(value * 100)
    return allowed


def check_numbers(text: str, facts: dict[str, Any]) -> dict[str, Any]:
    """Check that each material numeric claim is supported by the facts."""
    allowed = collect_allowed(facts)
    checked = 0
    unsupported = []
    for value, decimals, is_percentage in _number_matches(text):
        if not is_percentage and decimals == 0 and 0 <= value <= 10:
            continue
        checked += 1
        tolerance = 0.5 * 10 ** -decimals
        if not any(abs(value - allowed_value) <= tolerance for allowed_value in allowed):
            unsupported.append(value)
    return {
        "ok": not unsupported,
        "checked": checked,
        "unsupported": unsupported,
    }
