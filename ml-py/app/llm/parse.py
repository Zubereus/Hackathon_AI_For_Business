"""Natural Language Question (NLQ) Parser for What-If AI.

Converts manager business questions (Vietnamese and English) into validated DecisionSpec JSON:
    - Fuzzy product catalog matching with Vietnamese diacritic stripping
    - Deterministic rule-based extraction of price change %, direction, and horizon
    - Optional LLM extraction when LLM_API_KEY is configured (sends ONLY question + catalog id/name)
    - Strict Pydantic validation (price_pct in [-50, +100], horizon in [7, 90])
    - Fails closed into {"error": ..., "fallback": "manual_form"} on unknown products or out-of-range inputs

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Never send sales rows or computed financial metrics to LLM.
    - Works 100% offline with zero LLM dependencies.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple, Union

from pydantic import ValidationError

from app.llm.client import LLMClient
from app.schemas.contracts import CatalogItem, DecisionSpec, NLQParseFallback


def strip_accents(text: str) -> str:
    """Normalize text to lowercase ASCII with Vietnamese diacritics stripped."""
    s = unicodedata.normalize("NFKD", text.lower().strip())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("đ", "d").replace("Đ", "d")


def normalize_tokens(text: str) -> List[str]:
    """Tokenize cleaned ASCII text into alphanumeric words."""
    cleaned = re.sub(r"[^a-z0-9\s]", " ", strip_accents(text))
    return [tok for tok in cleaned.split() if tok]


def match_product_in_catalog(
    question: str,
    catalog: List[CatalogItem],
) -> Tuple[Optional[CatalogItem], float]:
    """Fuzzy-match a product from catalog against the user question.

    Combines:
        1. Exact product_id token match (e.g. 'P01', 'SKU-12')
        2. Exact normalized product_name substring containment
        3. Token coverage + SequenceMatcher ratio for typos/partial names

    Args:
        question: Manager's natural language question.
        catalog: List of available products (product_id and name only).

    Returns:
        Tuple containing best matched CatalogItem (or None) and confidence score [0..1].
    """
    if not catalog:
        return None, 0.0

    q_norm = " ".join(normalize_tokens(question))
    q_tokens = set(normalize_tokens(question))

    best_item: Optional[CatalogItem] = None
    best_score: float = 0.0

    for item in catalog:
        pid_norm = " ".join(normalize_tokens(item.product_id))
        pname_norm = " ".join(normalize_tokens(item.name))
        pname_tokens = normalize_tokens(item.name)

        # 1. Exact product_id match as word boundary in question
        if pid_norm and re.search(rf"\b{re.escape(pid_norm)}\b", q_norm):
            return item, 1.0

        # 2. Exact product_name substring match
        if pname_norm and pname_norm in q_norm:
            score = 0.98
            if score > best_score:
                best_score = score
                best_item = item
            continue

        # 3. Token overlap + fuzzy typo matching per word
        if pname_tokens:
            matched_token_scores: List[float] = []
            for p_tok in pname_tokens:
                if p_tok in q_tokens:
                    matched_token_scores.append(1.0)
                else:
                    # Handle typos (e.g. 'baisc' vs 'basic', 'shrit' vs 'shirt')
                    best_tok_sim = max(
                        (difflib.SequenceMatcher(None, p_tok, qt).ratio() for qt in q_tokens),
                        default=0.0,
                    )
                    matched_token_scores.append(best_tok_sim if best_tok_sim >= 0.72 else 0.0)

            token_coverage = sum(matched_token_scores) / len(pname_tokens)
            # Also evaluate contiguous window sequence ratio
            seq_sim = 0.0
            q_tok_list = normalize_tokens(question)
            win = len(pname_tokens)
            for idx in range(max(1, len(q_tok_list) - win + 1)):
                window_str = " ".join(q_tok_list[idx : idx + win])
                seq_sim = max(seq_sim, difflib.SequenceMatcher(None, pname_norm, window_str).ratio())

            # Penalize short partial matches if key distinguishing tokens didn't match
            combined = 0.65 * token_coverage + 0.35 * seq_sim
            if combined > best_score:
                best_score = combined
                best_item = item

    # Threshold to avoid matching totally unrelated product names
    if best_score >= 0.62:
        return best_item, best_score
    return None, best_score


def extract_change_pct_rule(question: str) -> Optional[float]:
    """Extract target price change percentage from Vietnamese or English text.

    Recognizes negative modifiers ('giảm', 'cut', 'drop', 'lower', 'discount', 'sale', 'hạ', '-')
    and positive modifiers ('tăng', 'nâng', 'raise', 'increase', 'up', 'hike', 'add', '+').
    """
    q_norm = strip_accents(question)

    # Search for explicit percentage expressions: e.g. '+10%', '-15 %', '20 phan tram', '12.5 percent'
    pct_pattern = re.compile(
        r"([+-]?\s*\d+(?:[.,]\d+)?)\s*(%|(?:phan tram|percent|pct)\b)"
    )
    matches = list(pct_pattern.finditer(q_norm))
    if not matches:
        return None

    m = matches[0]
    raw_num_str = m.group(1).replace(" ", "").replace(",", ".")
    has_explicit_sign = raw_num_str.startswith(("+", "-"))
    val = float(raw_num_str)

    if has_explicit_sign:
        return val

    # Check context words immediately before the number (window of 40 chars) or anywhere before
    prefix_window = q_norm[max(0, m.start() - 50) : m.start()]
    cut_keywords = ("giam", "ha ", "chiet khau", "khuyen mai", "km ", "cut", "drop", "lower", "decrease", "reduce", "discount", "markdown", "off")
    raise_keywords = ("tang", "nang", "cong", "raise", "increase", "hike", "lift", "up", "higher", "add")

    # Find the closest directional cue preceding the match
    last_cut_pos = max((prefix_window.rfind(kw) for kw in cut_keywords), default=-1)
    last_raise_pos = max((prefix_window.rfind(kw) for kw in raise_keywords), default=-1)

    # Also check suffix (e.g. "10% discount", "10% off", "giam gia 10%")
    suffix_window = q_norm[m.end() : min(len(q_norm), m.end() + 25)]
    if "off" in suffix_window or "discount" in suffix_window:
        return -abs(val)

    if last_cut_pos > last_raise_pos:
        return -abs(val)
    if last_raise_pos > last_cut_pos:
        return abs(val)

    # Fallback: check full question before accepting unsigned positive percentage
    if any(kw in q_norm for kw in cut_keywords):
        return -abs(val)
    if any(kw in q_norm for kw in raise_keywords):
        return abs(val)

    return None


def extract_horizon_days_rule(question: str) -> Tuple[int, Optional[str]]:
    """Extract decision horizon in days from Vietnamese or English text.

    Returns:
        Tuple of (horizon_days, error_message_if_explicitly_out_of_range).
    """
    q_norm = strip_accents(question)

    # Exact days: e.g. '14 ngay', '45 days', '365 days', '3 ngay'
    m_day = re.search(r"\b(\d+)\s*(ngay|day|days)\b", q_norm)
    if m_day:
        days = int(m_day.group(1))
        if days < 7 or days > 90:
            return days, f"Horizon {days} days is outside permitted range [7, 90] days."
        return days, None

    # Weeks: e.g. '2 tuan', '3 weeks', 'next week', 'tuan toi'
    m_week = re.search(r"\b(\d+)\s*(tuan|week|weeks)\b", q_norm)
    if m_week:
        days = int(m_week.group(1)) * 7
        if days < 7 or days > 90:
            return days, f"Horizon {days} days is outside permitted range [7, 90] days."
        return days, None
    if re.search(r"\b(tuan toi|tuan sau|next week|1 week|a week)\b", q_norm):
        return 7, None

    # Months: e.g. '2 thang', '1 month', 'thang toi', 'next month', 'thang sau'
    m_month = re.search(r"\b(\d+)\s*(thang|month|months)\b", q_norm)
    if m_month:
        days = int(m_month.group(1)) * 30
        if days < 7 or days > 90:
            return days, f"Horizon {days} days is outside permitted range [7, 90] days."
        return days, None
    if re.search(r"\b(thang toi|thang sau|next month|a month|1 month)\b", q_norm):
        return 30, None

    # Quarters / Years:
    if re.search(r"\b(1 quy|quy toi|next quarter|a quarter|quarter)\b", q_norm):
        return 90, None
    if re.search(r"\b(\d+\s*nam|1 year|next year|nam toi|nam sau|half a year|6 thang)\b", q_norm):
        return 365, "Horizon exceeds maximum 90 days."

    # Default horizon when unspecified
    return 30, None


def parse_question(
    question: str,
    catalog: List[CatalogItem],
    client: Optional[LLMClient] = None,
) -> Union[DecisionSpec, NLQParseFallback]:
    """Parse a business manager's natural language question into DecisionSpec or fallback.

    Args:
        question: Natural language query string.
        catalog: Product catalog containing product_id and name only.
        client: Optional LLMClient instance (for live LLM-assisted extraction).

    Returns:
        DecisionSpec on valid extraction, or NLQParseFallback on error/out-of-range/unknown product.
    """
    if not question or len(question.strip()) < 3:
        return NLQParseFallback(error="Question is empty or too short.", fallback="manual_form")

    # 1. Match product against catalog (fuzzy diacritic-stripped)
    matched_item, match_conf = match_product_in_catalog(question, catalog)

    # 2. Try rule-based extraction first (deterministic, fast, zero-cost)
    change_val = extract_change_pct_rule(question)
    horizon_days, horizon_err = extract_horizon_days_rule(question)

    # 3. If LLM is configured and rule-based failed or matched weakly, query LLM safely
    llm_client = client or LLMClient()
    if (matched_item is None or change_val is None) and llm_client.is_configured():
        catalog_list = [{"product_id": c.product_id, "name": c.name} for c in catalog]
        sys_prompt = (
            "You extract structured retail price-change simulation parameters from a question.\n"
            "Available catalog products (ONLY choose product_id from this list, or null if absent):\n"
            f"{catalog_list}\n"
            "Return strictly JSON with keys:\n"
            '- "product_id": string or null (must exactly match catalog product_id)\n'
            '- "change_type": "price_pct"\n'
            '- "change_value": float (negative for discount/decrease, positive for increase, null if no price change mentioned)\n'
            '- "horizon_days": integer (default 30 if unspecified; convert weeks*7, months*30)\n'
            "Do NOT clamp or invent numbers. Preserve extreme numbers as stated so validation can catch them."
        )
        llm_res = llm_client.complete_json(sys_prompt, f"Question: {question}")
        if isinstance(llm_res, dict):
            if matched_item is None and llm_res.get("product_id"):
                pid_str = str(llm_res["product_id"])
                for item in catalog:
                    if item.product_id == pid_str:
                        matched_item = item
                        break
            if change_val is None and llm_res.get("change_value") is not None:
                try:
                    change_val = float(llm_res["change_value"])
                except (ValueError, TypeError):
                    pass
            if llm_res.get("horizon_days") is not None and horizon_err is None:
                try:
                    h_cand = int(llm_res["horizon_days"])
                    horizon_days = h_cand
                except (ValueError, TypeError):
                    pass

    # 4. Strict Rejection Guardrails
    if horizon_err is not None:
        return NLQParseFallback(error=horizon_err, fallback="manual_form")

    if matched_item is None:
        return NLQParseFallback(
            error="Could not identify a matching product in your uploaded catalog.",
            fallback="manual_form",
        )

    if change_val is None:
        return NLQParseFallback(
            error="Could not identify a target percentage price change (e.g., +10% or -15%).",
            fallback="manual_form",
        )

    # 5. Pydantic Validation (enforces change_value in [-50, 100] and horizon_days in [7, 90])
    try:
        spec = DecisionSpec(
            product_id=matched_item.product_id,
            change_type="price_pct",
            change_value=round(float(change_val), 2),
            horizon_days=int(horizon_days),
        )
        return spec
    except ValidationError as val_err:
        return NLQParseFallback(
            error=f"Requested simulation parameters out of allowed bounds: {val_err.errors()[0]['msg']}",
            fallback="manual_form",
        )
