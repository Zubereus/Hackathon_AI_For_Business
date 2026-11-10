"""Export Pydantic models as shared JSON Schema files in contracts/."""

from __future__ import annotations

import json
import os
import sys

# Add ml-py to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.schemas.contracts import (  # noqa: E402
    DecisionSpec,
    ElasticityFitRequest,
    ElasticityFitResponse,
    ElasticityFixturePayload,
    IngestCommitRequest,
    IngestCommitResponse,
    IngestMapResponse,
    IngestProfileResponse,
    OptimizeRequest,
    OptimizeResponse,
    SimulateRequest,
    SimulateResponse,
)


SCHEMAS_TO_EXPORT = {
    "elasticity_fit_response.schema.json": ElasticityFitResponse,
    "elasticity_fixture.schema.json": ElasticityFixturePayload,
    "simulate_request.schema.json": SimulateRequest,
    "simulate_response.schema.json": SimulateResponse,
    "optimize_request.schema.json": OptimizeRequest,
    "optimize_response.schema.json": OptimizeResponse,
    "decision_spec.schema.json": DecisionSpec,
    "ingest_profile_response.schema.json": IngestProfileResponse,
    "ingest_map_response.schema.json": IngestMapResponse,
    "ingest_commit_response.schema.json": IngestCommitResponse,
}


def export_all_schemas(target_dir: str = "contracts") -> None:
    """Generate and write JSON schemas into target_dir."""
    os.makedirs(target_dir, exist_ok=True)
    for filename, model_cls in SCHEMAS_TO_EXPORT.items():
        file_path = os.path.join(target_dir, filename)
        schema_dict = model_cls.model_json_schema()
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(schema_dict, f, indent=2, ensure_ascii=False)
        print(f"Exported: {file_path}")


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "contracts"
    export_all_schemas(out_dir)

