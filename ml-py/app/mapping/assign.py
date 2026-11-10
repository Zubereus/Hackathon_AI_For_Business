"""Global assignment solver for column-to-field matching using Hungarian algorithm.

Guarantees that each source column is assigned to at most one canonical field,
maximizing total global match confidence under threshold constraints.

Threshold Rules (docs/NLP_COLUMN_MAPPING.md):
    - score >= 0.55: Auto-accepted mapping.
    - 0.35 <= score < 0.55: Flagged as 'please confirm'.
    - score < 0.35: Unmapped.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Optimization via scipy.optimize.linear_sum_assignment.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from scipy.optimize import linear_sum_assignment

from app.ingest.profile import ColumnProfile
from app.mapping.scoring import combine_scores, compute_name_score, compute_value_score


CANONICAL_FIELDS: List[str] = [
    "date",
    "product_id",
    "product_name",
    "category",
    "price",
    "unit_cost",
    "quantity",
    "stock",
    "promo",
]

REQUIRED_FIELDS: List[str] = ["date", "quantity", "price"]

AUTO_THRESHOLD: float = 0.55
CONFIRM_THRESHOLD: float = 0.35


def resolve_column_mappings(
    profiles: Dict[str, ColumnProfile],
    embed_scores: Optional[Dict[Tuple[str, str], float]] = None,
) -> Dict[str, Any]:
    """Assign source columns to canonical fields using the Hungarian algorithm.

    Args:
        profiles: Dictionary mapping source column names to their ColumnProfile.
        embed_scores: Optional dictionary of pre-computed embedding scores for (field, col).

    Returns:
        Dict[str, Any]: Assignment results containing:
            - 'mapping': List of mapping objects with canonical, source, confidence, method, alternatives.
            - 'canonical_to_source': Dictionary of accepted/confirmed canonical -> source name.
            - 'missing_required': List of required canonical fields that could not be mapped.
            - 'warnings': Quality and verification warnings.
    """
    source_cols = list(profiles.keys())
    n_fields = len(CANONICAL_FIELDS)
    n_cols = len(source_cols)

    if n_cols == 0:
        return {
            "mapping": [],
            "canonical_to_source": {},
            "missing_required": REQUIRED_FIELDS.copy(),
            "warnings": ["Input dataset contains zero columns."],
        }

    # 1. Compute full pairwise score matrix (n_fields x n_cols)
    score_matrix = np.zeros((n_fields, n_cols), dtype=float)
    for i, field in enumerate(CANONICAL_FIELDS):
        for j, col in enumerate(source_cols):
            prof = profiles[col]
            name_s = compute_name_score(col, field)
            val_s = compute_value_score(prof, field)
            emb_s = embed_scores.get((field, col)) if embed_scores else None
            score_matrix[i, j] = combine_scores(name_s, val_s, emb_s)

    # 2. Hungarian assignment maximizing total confidence
    # linear_sum_assignment minimizes cost, so cost = 1.0 - score
    cost_matrix = 1.0 - score_matrix
    row_ind, col_ind = linear_sum_assignment(cost_matrix)

    assigned_col_for_field: Dict[int, int] = {}
    for r, c in zip(row_ind, col_ind):
        assigned_col_for_field[r] = c

    # 3. Formulate structured response with alternatives
    mapping_items: List[Dict[str, Any]] = []
    canonical_to_source: Dict[str, str] = {}
    missing_required: List[str] = []
    warnings: List[str] = []

    for i, field in enumerate(CANONICAL_FIELDS):
        assigned_c = assigned_col_for_field.get(i)
        best_score = float(score_matrix[i, assigned_c]) if assigned_c is not None else 0.0
        best_col = source_cols[assigned_c] if assigned_c is not None else None

        # Build list of alternative source columns ranked by score
        alternatives: List[Dict[str, Any]] = []
        col_rankings = sorted(
            [(source_cols[j], float(score_matrix[i, j])) for j in range(n_cols) if j != assigned_c],
            key=lambda x: -x[1],
        )
        for alt_col, alt_s in col_rankings[:3]:
            if alt_s >= CONFIRM_THRESHOLD:
                alternatives.append({"source": alt_col, "score": round(alt_s, 4)})

        if best_col and best_score >= CONFIRM_THRESHOLD:
            method = "auto_accepted" if best_score >= AUTO_THRESHOLD else "please_confirm"
            mapping_items.append({
                "canonical": field,
                "source": best_col,
                "confidence": round(best_score, 4),
                "method": method,
                "alternatives": alternatives,
            })
            canonical_to_source[field] = best_col
            if method == "please_confirm":
                warnings.append(
                    f"Trường '{field}' được gán với '{best_col}' với độ tin cậy vừa phải ({best_score:.2f}). Cần xác nhận."
                )
        else:
            mapping_items.append({
                "canonical": field,
                "source": None,
                "confidence": 0.0,
                "method": "unmapped",
                "alternatives": alternatives,
            })
            if field in REQUIRED_FIELDS:
                missing_required.append(field)
                warnings.append(f"Thiếu trường bắt buộc: '{field}'.")

    # Enforce constraint: at least one of product_id or product_name must be present
    has_pid = "product_id" in canonical_to_source
    has_pname = "product_name" in canonical_to_source
    if not has_pid and not has_pname:
        missing_required.append("product_id_or_name")
        warnings.append("Cần ít nhất một trong hai trường: 'product_id' hoặc 'product_name'.")

    return {
        "mapping": mapping_items,
        "canonical_to_source": canonical_to_source,
        "missing_required": missing_required,
        "warnings": warnings,
    }

