"""Acceptance test suite for Phase 2: Ingestion & NLP Column Mapping.

Benchmarks column mapping against the 5 ground-truth messy variants in:
    data/synthetic/out/messy_variants/
        1. vn_headers_vn_numbers
        2. erp_abbrev
        3. english_extra_columns_no_cost_no_stock
        4. price_in_thousands_name_only
        5. receipt_level_transactions

Acceptance Criteria:
    - >= 95% of present fields mapped correctly overall.
    - Zero wrong mappings with confidence >= 0.55 (no silent errors).
    - Commit produces valid canonical daily frames.
    - Receipt-level transactions aggregate to daily grain.
    - price_in_thousands_name_only scales x1000 and derives slug product_ids.
    - Runs 100% offline without network or LLM dependencies.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Tuple
import pandas as pd
import pytest

from app.ingest.profile import profile_dataframe
from app.ingest.transform import transform_to_canonical
from app.mapping.assign import resolve_column_mappings


MESSY_VARIANTS_DIR = os.path.join("data", "synthetic", "out", "messy_variants")
if not os.path.exists(MESSY_VARIANTS_DIR):
    MESSY_VARIANTS_DIR = os.path.join("..", "data", "synthetic", "out", "messy_variants")


@pytest.fixture
def messy_variants() -> List[Tuple[str, pd.DataFrame, Dict[str, Any]]]:
    """Load all 5 messy variant datasets and their ground-truth mapping contracts."""
    variants = []
    variant_folders = sorted(os.listdir(MESSY_VARIANTS_DIR))
    for folder in variant_folders:
        dir_path = os.path.join(MESSY_VARIANTS_DIR, folder)
        if not os.path.isdir(dir_path):
            continue
        csv_file = os.path.join(dir_path, "input.csv")
        truth_file = os.path.join(dir_path, "mapping_truth.json")
        if os.path.exists(csv_file) and os.path.exists(truth_file):
            df = pd.read_csv(csv_file)
            with open(truth_file, "r", encoding="utf-8") as f:
                truth = json.load(f)
            variants.append((folder, df, truth))
    return variants


def test_messy_variants_mapping_accuracy(
    messy_variants: List[Tuple[str, pd.DataFrame, Dict[str, Any]]],
) -> None:
    """Verify >= 95% mapping accuracy and zero false-positive mappings above 0.55 confidence."""
    total_truth_fields = 0
    correct_matches = 0
    wrong_high_confidence = 0

    print("\n" + "=" * 80)
    print(f"{'Variant':<35}{'Field':<15}{'Predicted':<20}{'Truth':<20}{'Conf':>6}{'Status':>8}")
    print("-" * 80)

    for variant_name, df, truth in messy_variants:
        canonical_to_source_truth = truth.get("canonical_to_source", {})
        profiles = profile_dataframe(df)
        mapping_result = resolve_column_mappings(profiles)

        pred_map = {item["canonical"]: item for item in mapping_result["mapping"]}

        for field, true_col in canonical_to_source_truth.items():
            total_truth_fields += 1
            pred_item = pred_map.get(field, {})
            pred_col = pred_item.get("source")
            conf = pred_item.get("confidence", 0.0)

            is_correct = (pred_col == true_col)
            if is_correct:
                correct_matches += 1
            else:
                if conf >= 0.55:
                    wrong_high_confidence += 1

            status_str = "OK" if is_correct else "FAIL"
            print(
                f"{variant_name:<35}{field:<15}{str(pred_col):<20}"
                f"{str(true_col):<20}{conf:>6.2f}{status_str:>8}"
            )

    print("=" * 80)
    accuracy = correct_matches / total_truth_fields if total_truth_fields > 0 else 0.0
    print(f"Overall Mapping Accuracy: {correct_matches}/{total_truth_fields} ({accuracy:.1%})")
    print(f"Wrong Mappings with Confidence >= 0.55: {wrong_high_confidence}")

    # Acceptance criteria
    assert accuracy >= 0.95, f"Mapping accuracy ({accuracy:.1%}) fell below required 95%."
    assert wrong_high_confidence == 0, (
        f"Found {wrong_high_confidence} wrong mappings with confidence >= 0.55. "
        "All ambiguous or incorrect mappings must be flagged for confirmation."
    )


def test_receipt_level_aggregation() -> None:
    """Verify sub-daily receipt-level transactions aggregate to daily grain."""
    dir_path = os.path.join(MESSY_VARIANTS_DIR, "receipt_level_transactions")
    df = pd.read_csv(os.path.join(dir_path, "input.csv"))
    with open(os.path.join(dir_path, "mapping_truth.json"), "r", encoding="utf-8") as f:
        truth = json.load(f)

    profiles = profile_dataframe(df)
    mapping_res = resolve_column_mappings(profiles)

    canonical_df, report = transform_to_canonical(
        raw_df=df,
        mapping=mapping_res["canonical_to_source"],
    )

    assert report["aggregated_from_receipts"] is True
    # In aggregated daily frame, (date, product_id) must be completely unique
    assert not canonical_df.duplicated(subset=["date", "product_id"]).any()
    assert canonical_df["quantity"].min() > 0
    assert canonical_df["price"].min() > 0


def test_price_in_thousands_and_slug_ids() -> None:
    """Verify prices in thousands scale by 1000 and missing product_id derives slug IDs."""
    dir_path = os.path.join(MESSY_VARIANTS_DIR, "price_in_thousands_name_only")
    df = pd.read_csv(os.path.join(dir_path, "input.csv"))
    with open(os.path.join(dir_path, "mapping_truth.json"), "r", encoding="utf-8") as f:
        truth = json.load(f)

    profiles = profile_dataframe(df)
    mapping_res = resolve_column_mappings(profiles)

    canonical_df, report = transform_to_canonical(
        raw_df=df,
        mapping=mapping_res["canonical_to_source"],
        options={"price_unit": 1000},
    )

    # Prices and unit_cost should be in full integer VND (thousands, e.g. >= 50,000)
    assert canonical_df["price"].median() >= 10_000
    assert canonical_df["unit_cost"].median() >= 10_000
    # Slug IDs must be derived since product_id is missing
    assert all("-" in pid or pid.islower() for pid in canonical_df["product_id"].unique())
    # Quality report contains warning for missing stock
    assert any("stock missing" in w for w in report["warnings"])

    # Also verify unit_cost missing fallback on english_extra_columns_no_cost_no_stock
    en_dir = os.path.join(MESSY_VARIANTS_DIR, "english_extra_columns_no_cost_no_stock")
    df_en = pd.read_csv(os.path.join(en_dir, "input.csv"))
    prof_en = profile_dataframe(df_en)
    map_en = resolve_column_mappings(prof_en)
    _, rep_en = transform_to_canonical(df_en, map_en["canonical_to_source"])
    assert any("unit_cost missing" in w for w in rep_en["warnings"])


def test_operating_expense_mapping_and_aggregation() -> None:
    """Verify marketing, labor, operating, and fixed overhead columns auto-map and sum across receipts."""
    raw = pd.DataFrame(
        {
            "order_id": ["10001", "10002", "10003"],
            "Ngày bán": ["2026-01-05", "2026-01-05", "2026-01-06"],
            "Mã SP": ["P01", "P01", "P01"],
            "Giá bán": ["200.000", "200.000", "200.000"],
            "Giá vốn": ["100.000", "100.000", "100.000"],
            "SL bán": ["5", "3", "6"],
            "Chi phí Marketing": ["300.000", "200.000", "450.000"],
            "Nhân công": ["150.000", "100.000", "200.000"],
            "Chi phí vận hành": ["250.000", "150.000", "300.000"],
        }
    )

    profiles = profile_dataframe(raw)
    mapping_res = resolve_column_mappings(profiles)
    c2s = mapping_res["canonical_to_source"]

    assert c2s.get("marketing_cost") == "Chi phí Marketing"
    assert c2s.get("labor_cost") == "Nhân công"
    assert c2s.get("operating_cost") == "Chi phí vận hành"
    assert c2s.get("fixed_cost") is None  # order_id must NOT map to fixed_cost

    canonical_df, report = transform_to_canonical(raw, c2s, options={"number_locale": "vi"})
    assert report["aggregated_from_receipts"] is True
    assert len(canonical_df) == 2

    day1 = canonical_df.iloc[0]
    assert day1["quantity"] == 8
    assert day1["marketing_cost"] == 500_000
    assert day1["labor_cost"] == 250_000
    assert day1["operating_cost"] == 400_000

