"""Unit & API tests for persistent SQLite Business Decision Journal."""

from __future__ import annotations

import pandas as pd
from fastapi.testclient import TestClient

from app.journal.store import (
    create_decision,
    delete_decision,
    evaluate_decision_from_dataset,
    list_decisions,
    update_decision,
)
from app.main import app
from app.schemas.contracts import JournalCreateRequest, JournalUpdateRequest


def test_journal_sqlite_crud_and_csv_outcome_evaluation(tmp_path, monkeypatch) -> None:
    db_file = str(tmp_path / "test_decisions.db")
    monkeypatch.setenv("WHATIF_JOURNAL_DB", db_file)

    created = create_decision(
        JournalCreateRequest(
            dataset_id="ds-1",
            data_label="SYNTHETIC",
            product_id="P01",
            product_name="Áo Thun",
            title="Giảm giá 10% cuối tuần",
            decision_type="pricing",
            horizon_days=3,
            planned_price_vnd=180000,
            planned_price_change_pct=-10.0,
            planned_restock_units=0,
            assumptions={"elasticity_median": -1.5},
            expected_qty=30.0,
            expected_revenue_vnd=5400000.0,
            expected_profit_vnd=2400000.0,
            p5_profit_vnd=1900000.0,
            p95_profit_vnd=2900000.0,
            prob_beat_base=0.78,
            notes="Theo dõi biên lãi",
        )
    )
    assert created.status == "planned"

    updated = update_decision(
        created.id,
        JournalUpdateRequest(status="implemented", implemented_at="2025-05-01"),
    )
    assert updated is not None and updated.status == "implemented"

    # Evaluate against matching 3 days in CSV: (180k - 100k) * 32 = 2,560,000 profit -> inside [1.9M, 2.9M]
    df = pd.DataFrame({
        "date": ["2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04"],
        "product_id": ["P01", "P01", "P01", "P01"],
        "price": [180000, 180000, 180000, 200000],
        "unit_cost": [100000, 100000, 100000, 100000],
        "quantity": [10, 12, 10, 8],
    })
    evaluated = evaluate_decision_from_dataset(df, created.id, start_date="2025-05-01", horizon_days=3)
    assert evaluated.status == "evaluated"
    assert evaluated.actual_qty == 32.0
    assert evaluated.actual_profit_vnd == 2560000.0
    assert evaluated.profit_variance_vnd == 160000.0
    assert evaluated.within_p5_p95_band is True

    listing = list_decisions()
    assert listing.total_count == 1
    assert listing.evaluated_count == 1
    assert listing.within_band_rate_pct == 100.0

    assert delete_decision(created.id) is True
    assert list_decisions().total_count == 0


def test_journal_http_round_trip(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("WHATIF_JOURNAL_DB", str(tmp_path / "api_decisions.db"))
    client = TestClient(app)

    post_resp = client.post(
        "/journal",
        json={
            "dataset_id": "fashion_shop_12",
            "data_label": "SYNTHETIC",
            "product_id": "P01",
            "product_name": "Sản phẩm P01",
            "title": "Flash sale test",
            "decision_type": "template",
            "horizon_days": 7,
            "planned_price_vnd": 180000,
            "planned_price_change_pct": -10.0,
            "expected_qty": 70,
            "expected_revenue_vnd": 12600000,
            "expected_profit_vnd": 5600000,
            "p5_profit_vnd": 4500000,
            "p95_profit_vnd": 6500000,
            "prob_beat_base": 0.81,
        },
    )
    assert post_resp.status_code == 201
    dec_id = post_resp.json()["id"]

    list_resp = client.get("/journal")
    assert list_resp.status_code == 200
    assert list_resp.json()["total_count"] == 1

    patch_resp = client.patch(
        f"/journal/{dec_id}",
        json={"actual_profit_vnd": 5200000, "notes": "Actual came close to median"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["within_p5_p95_band"] is True

    del_resp = client.delete(f"/journal/{dec_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True

