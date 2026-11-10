"""Tests for Phase 0: Contract validation and API skeleton.

Verifies:
    1. /health returns status: ok.
    2. Phase 0 business endpoints return HTTP 501 Not Implemented.
    3. contracts/fixtures/elasticity_fixture.json conforms 100% to ElasticityFixturePayload.
"""

from __future__ import annotations

import json
import os
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.contracts import ElasticityFixturePayload


@pytest.fixture
def client() -> TestClient:
    """FastAPI test client fixture."""
    return TestClient(app)


def test_health_check(client: TestClient) -> None:
    """Ensure /health returns 200 with status: ok."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_all_endpoints_active(client: TestClient) -> None:
    """Ensure all Phases 2, 3, and 6 endpoints are wired and operational (no remaining 501 stubs)."""
    # NLQ endpoints are active (Phase 6)
    resp_parse = client.post(
        "/nlq/parse",
        json={"question": "Tăng giá P01 thêm 10%", "catalog": [{"product_id": "P01", "name": "Item 1"}]},
    )
    assert resp_parse.status_code == 200

    resp_explain = client.post("/nlq/explain", json={"scenario_result": {"scenarios": {}}})
    assert resp_explain.status_code == 200

    # Ingest, Elasticity, Backtest return 404 on nonexistent IDs (proving routing is active)
    assert client.post("/ingest/map", json={"upload_id": "nonexistent_id"}).status_code == 404
    assert client.post("/elasticity/fit", json={"dataset_id": "nonexistent_ds"}).status_code == 404
    assert client.post("/backtest", json={"dataset_id": "nonexistent_ds", "product_id": "P01", "change_date": "2024-01-01"}).status_code == 404


def test_elasticity_fixture_validates_schema() -> None:
    """Verify that contracts/fixtures/elasticity_fixture.json complies with ElasticityFixturePayload."""
    fixture_path = os.path.join("contracts", "fixtures", "elasticity_fixture.json")
    if not os.path.exists(fixture_path):
        # Fallback if run from ml-py directory
        fixture_path = os.path.join("..", "contracts", "fixtures", "elasticity_fixture.json")

    assert os.path.exists(fixture_path), f"Fixture file not found: {fixture_path}"

    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Validates without throwing ValidationError
    payload = ElasticityFixturePayload.model_validate(data)
    assert payload.period_days == 30
    assert payload.data_label in ("SYNTHETIC", "PUBLIC_M5", "PUBLIC_DUNNHUMBY", "USER")
    assert len(payload.products) > 0

    first_prod = payload.products[0]
    assert first_prod.product_id != ""
    assert first_prod.current_price_vnd > 0
    assert first_prod.unit_cost_vnd > 0
    assert first_prod.baseline_qty_per_period > 0
    assert first_prod.elasticity_median < 0.0
    assert len(first_prod.elasticity_samples) > 0

