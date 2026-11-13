"""Scoring engine evaluating match confidence between source columns and canonical fields.

Combines deterministic name similarity, value shape heuristics, and optional
sentence embedding semantic similarity.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic weighted score combinations.
    - Fails soft: Skips embedding signal seamlessly when model is not available offline.
"""

from __future__ import annotations

import difflib
import re
from typing import Any, Dict, List, Optional, Tuple
import numpy as np

from app.ingest.profile import ColumnProfile
from app.mapping.dictionary import get_normalized_dictionary, strip_accents


NORM_DICT = get_normalized_dictionary()


def clean_header_tokens(header: str) -> str:
    """Clean header string by removing special characters and normalizing whitespace.

    Args:
        header: Raw column header string.

    Returns:
        str: Cleaned, space-separated string.
    """
    cleaned = strip_accents(header)
    # Replace non-alphanumeric with spaces
    cleaned = re.sub(r"[^\w\s]", " ", cleaned)
    # Replace underscores with spaces
    cleaned = cleaned.replace("_", " ")
    return re.sub(r"\s+", " ", cleaned).strip()


def compute_name_score(source_col: str, canonical_field: str) -> float:
    """Compute fuzzy lexical match score between a source column header and canonical field.

    Args:
        source_col: Raw source column name.
        canonical_field: Canonical schema field name (e.g. 'quantity', 'price').

    Returns:
        float: Similarity score between 0.0 and 1.0.
    """
    cleaned_source = clean_header_tokens(source_col)
    compact_source = cleaned_source.replace(" ", "")

    synonyms = NORM_DICT.get(canonical_field, set())

    # 1. Exact match against synonym dictionary
    if cleaned_source in synonyms or compact_source in synonyms:
        return 1.0

    # 2. Token set / Substring match
    source_tokens = set(cleaned_source.split())
    best_score = 0.0

    for syn in synonyms:
        syn_tokens = set(syn.split())
        # If synonym is a complete subset of source header
        if syn_tokens and syn_tokens.issubset(source_tokens):
            score = 0.90 + 0.05 * (len(syn) / max(len(cleaned_source), 1))
            best_score = max(best_score, min(score, 0.98))

        # Check sequence similarity
        ratio = difflib.SequenceMatcher(None, compact_source, syn.replace(" ", "")).ratio()
        if ratio > best_score:
            best_score = ratio

    return float(np.clip(best_score, 0.0, 1.0))


def compute_value_score(profile: ColumnProfile, canonical_field: str) -> float:
    """Compute statistical and type-shape compatibility score for a canonical field.

    Evaluates:
        - date: High date parse rate (>= 90%)
        - price & unit_cost: Positive numeric, broad spread, median in reasonable retail range
        - quantity: Non-negative integers
        - stock: Non-negative integers
        - promo: Low cardinality, binary indicators (0/1)
        - product_id: Repeated codes across dates
        - category: Low cardinality text

    Args:
        profile: Computed profile of candidate column.
        canonical_field: Canonical target field.

    Returns:
        float: Type compatibility score between 0.0 and 1.0.
    """
    if canonical_field == "date":
        if profile.date_rate >= 0.90:
            return 1.0
        if profile.date_rate >= 0.50:
            return 0.60
        return 0.0

    if canonical_field in ("price", "unit_cost"):
        if profile.num_rate >= 0.85:
            # Prices must be strictly positive
            if profile.min_val is not None and profile.min_val > 0.0:
                med = profile.median_val if profile.median_val is not None else 0.0
                # Retail prices in VND or USD typically have positive median
                if med >= 0.50:
                    return 0.95
                return 0.70
            return 0.40
        return 0.0

    if canonical_field == "quantity":
        if profile.num_rate >= 0.85:
            if profile.min_val is not None and profile.min_val >= 0.0:
                # Quantities are usually discrete numbers
                return 0.95
            return 0.40
        return 0.0

    if canonical_field in ("stock", "marketing_cost", "labor_cost", "operating_cost", "fixed_cost"):
        if profile.num_rate >= 0.80:
            if profile.min_val is not None and profile.min_val >= 0.0:
                return 0.90
            return 0.40
        return 0.0

    if canonical_field == "promo":
        # Promo flags are binary (0/1) or boolean
        if profile.n_unique in (1, 2):
            if profile.num_rate >= 0.80 or profile.dtype_guess in ("boolean", "numeric"):
                return 0.95
            return 0.80
        return 0.10

    if canonical_field == "product_id":
        if profile.dtype_guess in ("string", "numeric") and profile.date_rate < 0.50:
            # Product IDs typically repeat across rows (including single-SKU history files)
            if 1 <= profile.n_unique < profile.n_rows:
                return 0.90
            if profile.n_rows < 3 and profile.n_unique >= 1:
                return 0.75
            return 0.45
        return 0.0

    if canonical_field == "product_name":
        if profile.dtype_guess == "string" and profile.date_rate < 0.50:
            return 0.90
        return 0.20

    if canonical_field == "category":
        if profile.dtype_guess == "string" and profile.n_unique < 50:
            return 0.95
        return 0.30

    return 0.50


def combine_scores(
    name_score: float,
    value_score: float,
    embed_score: Optional[float] = None,
) -> float:
    """Combine individual signal scores into composite match confidence.

    Formula (from docs/NLP_COLUMN_MAPPING.md):
        score = 0.35 * name + 0.25 * embed + 0.40 * value
        (If embedding is unavailable, renormalizes to 0.50 * name + 0.50 * value).

    Args:
        name_score: Lexical match score (0.0 to 1.0).
        value_score: Type shape score (0.0 to 1.0).
        embed_score: Optional semantic embedding score (0.0 to 1.0).

    Returns:
        float: Composite match confidence score (0.0 to 1.0).
    """
    # If name is an exact match and value score confirms compatibility, strong boost
    if name_score >= 0.95 and value_score >= 0.70:
        return float(min(0.95 + 0.05 * value_score, 1.0))

    # If value score is completely incompatible (e.g. text column for date/price), penalize heavily
    if value_score < 0.20:
        return float(min(name_score * 0.30, 0.30))

    if embed_score is not None:
        raw = 0.35 * name_score + 0.25 * embed_score + 0.40 * value_score
    else:
        raw = 0.50 * name_score + 0.50 * value_score

    return float(np.clip(raw, 0.0, 1.0))

