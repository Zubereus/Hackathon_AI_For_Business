"""FastAPI application for What-If AI Python ML service (ml-py).

Implements endpoints specified in docs/ARCHITECTURE.md.
Phase 2 Ingestion & NLP Mapping endpoints (/ingest/profile, /ingest/map, /ingest/commit)
are fully operational with deterministic profiling, Hungarian assignment, and transformation.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple, Union
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from app.backtest.run import execute_backtest
from app.causal.analyze import analyze_causal_impact
from app.elasticity.fit import fit_product_elasticity
from app.ingest.profile import profile_dataframe
from app.ingest.transform import transform_to_canonical
from app.journal.store import (
    create_decision,
    delete_decision,
    evaluate_decision_from_dataset,
    list_decisions,
    update_decision,
)
from app.llm.explain import explain_scenario
from app.llm.parse import parse_question
from app.mapping.assign import resolve_column_mappings
from app.monitoring.evaluate import evaluate_monitoring
from app.schemas.contracts import (
    BacktestRequest,
    BacktestResponse,
    CausalAnalyzeRequest,
    CausalAnalyzeResponse,
    ColumnMappingItem,
    ColumnProfile,
    DataLabel,
    DecisionRecord,
    DecisionSpec,
    ElasticityFitRequest,
    ElasticityFitResponse,
    IngestCommitRequest,
    IngestCommitResponse,
    IngestMapRequest,
    IngestMapResponse,
    IngestProfileResponse,
    JournalCreateRequest,
    JournalEvaluateFromDatasetRequest,
    JournalListResponse,
    JournalUpdateRequest,
    MappingAlternative,
    MonitoringEvaluateRequest,
    MonitoringEvaluateResponse,
    NLQExplainRequest,
    NLQExplainResponse,
    NLQParseFallback,
    NLQParseRequest,
)


app = FastAPI(
    title="What-If AI ML Service",
    version="0.2.0",
    description="Python ML backend for ingestion, NLP mapping, elasticity, and backtesting.",
)
logger = logging.getLogger(__name__)

# Rule: CORS allows localhost:5173 only
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for active sessions / uploads in Phase 2
_UPLOAD_CACHE: Dict[str, pd.DataFrame] = {}
_COMMITTED_DATASETS: Dict[str, pd.DataFrame] = {}

WORKDIR = "workdir"
MAPPINGS_FILE = os.path.join(WORKDIR, "mappings.json")


def get_header_hash(columns: List[str]) -> str:
    """Compute deterministic MD5 hash for a sorted collection of column headers.

    Args:
        columns: List of column header strings.

    Returns:
        str: Hexadecimal hash string.
    """
    sorted_headers = sorted(str(c).strip().lower() for c in columns)
    content = "|".join(sorted_headers)
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def load_mapping_memory() -> Dict[str, Dict[str, str]]:
    """Load previously confirmed column mappings from workdir/mappings.json."""
    if not os.path.exists(MAPPINGS_FILE):
        return {}
    try:
        with open(MAPPINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_mapping_memory(header_hash: str, mapping: Dict[str, str]) -> None:
    """Save user-confirmed column mapping keyed by header set hash."""
    os.makedirs(WORKDIR, exist_ok=True)
    current = load_mapping_memory()
    current[header_hash] = mapping
    with open(MAPPINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(current, f, indent=2, ensure_ascii=False)


@app.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> Dict[str, str]:
    """Health check endpoint for liveness probes."""
    return {"status": "ok"}


# ---------------- INGESTION & NLP MAPPING ENDPOINTS (PHASE 2) ----------------

@app.post("/ingest/profile", response_model=IngestProfileResponse)
async def ingest_profile(file: UploadFile = File(...)) -> IngestProfileResponse:
    """Upload and profile a raw CSV file.

    Analyzes column types, null rates, date/numeric formats, and extracts masked samples.
    """
    try:
        df = pd.read_csv(file.file, dtype=str, keep_default_na=True)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse uploaded CSV: {err}",
        )

    upload_id = str(uuid.uuid4())
    _UPLOAD_CACHE[upload_id] = df

    profiles = profile_dataframe(df)
    column_profiles = [
        ColumnProfile(
            name=p.name,
            dtype_guess=p.dtype_guess,
            null_pct=p.null_pct,
            n_unique=p.n_unique,
            samples=p.samples,
        )
        for p in profiles.values()
    ]

    return IngestProfileResponse(
        upload_id=upload_id,
        n_rows=len(df),
        columns=column_profiles,
    )


@app.post("/ingest/map", response_model=IngestMapResponse)
def ingest_map(request: IngestMapRequest) -> IngestMapResponse:
    """Propose NLP semantic column mapping from raw upload to canonical schema.

    Uses mapping memory if identical headers have been mapped previously;
    otherwise executes Hungarian assignment on composite lexical + shape scores.
    """
    df = _UPLOAD_CACHE.get(request.upload_id)
    if df is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload ID '{request.upload_id}' not found or session expired.",
        )

    header_hash = get_header_hash(list(df.columns))
    memory = load_mapping_memory()

    # If exact header set was previously mapped and confirmed by human
    if header_hash in memory:
        saved_map = memory[header_hash]
        items: List[ColumnMappingItem] = []
        for canon, src in saved_map.items():
            items.append(
                ColumnMappingItem(
                    canonical=canon,
                    source=src,
                    confidence=1.0,
                    method="mapping_memory",
                    alternatives=[],
                )
            )
        return IngestMapResponse(
            mapping=items,
            missing_required=[],
            warnings=["Loaded from confirmed mapping memory."],
        )

    profiles = profile_dataframe(df)
    result = resolve_column_mappings(profiles)

    mapping_models = [
        ColumnMappingItem(
            canonical=m["canonical"],
            source=m["source"],
            confidence=m["confidence"],
            method=m["method"],
            alternatives=[MappingAlternative(**alt) for alt in m["alternatives"]],
        )
        for m in result["mapping"]
    ]

    return IngestMapResponse(
        mapping=mapping_models,
        missing_required=result["missing_required"],
        warnings=result["warnings"],
    )


@app.post("/ingest/commit", response_model=IngestCommitResponse)
def ingest_commit(request: IngestCommitRequest) -> IngestCommitResponse:
    """Commit verified column mappings and transform raw table into canonical daily schema.

    Applies date parsing, number locale normalization, price unit scaling (e.g. x1000),
    and receipt-level transaction aggregation.
    """
    df = _UPLOAD_CACHE.get(request.upload_id)
    if df is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload ID '{request.upload_id}' not found.",
        )

    # Validate mandatory fields are mapped
    missing = [req for req in ["date", "price", "quantity"] if req not in request.mapping]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot commit dataset with missing mandatory fields: {missing}",
        )

    options_dict = request.options.model_dump()
    try:
        canonical_df, quality_report = transform_to_canonical(
            raw_df=df,
            mapping=request.mapping,
            options=options_dict,
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Data transformation error: {err}",
        )

    dataset_id = str(uuid.uuid4())
    _COMMITTED_DATASETS[dataset_id] = canonical_df

    # Save to mapping memory for future identical uploads
    header_hash = get_header_hash(list(df.columns))
    save_mapping_memory(header_hash, request.mapping)

    return IngestCommitResponse(
        dataset_id=dataset_id,
        label="USER",
        quality_report=quality_report,
    )


def resolve_dataset(dataset_id: str) -> Tuple[pd.DataFrame, DataLabel]:
    """Resolve a dataset DataFrame and its provenance DataLabel.

    Checks active committed in-memory datasets first, then checks the pre-generated
    synthetic datasets library, public data, or direct CSV paths.
    """
    if dataset_id in _COMMITTED_DATASETS:
        return _COMMITTED_DATASETS[dataset_id], "USER"

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    synth_path = os.path.join(base_dir, "data", "synthetic", "out", dataset_id, "sales_synthetic_vn.csv")
    if os.path.exists(synth_path):
        return pd.read_csv(synth_path), "SYNTHETIC"

    if os.path.exists(dataset_id):
        df = pd.read_csv(dataset_id)
        lower_id = dataset_id.lower()
        if "m5" in lower_id:
            label: DataLabel = "PUBLIC_M5"
        elif "dunnhumby" in lower_id:
            label = "PUBLIC_DUNNHUMBY"
        elif "synth" in lower_id:
            label = "SYNTHETIC"
        else:
            label = "USER"
        return df, label

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Dataset '{dataset_id}' not found in active uploads or datasets library.",
    )


# ---------------- PHASE 3: ELASTICITY & BACKTEST ENDPOINTS ----------------

@app.post("/elasticity/fit", response_model=ElasticityFitResponse)
def elasticity_fit(request: ElasticityFitRequest) -> ElasticityFitResponse:
    """Fit Spec-C econometric price elasticity model with week-block bootstrap uncertainty."""
    df, label = resolve_dataset(request.dataset_id)

    pid_col = "product_id"
    if pid_col not in df.columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Dataset '{request.dataset_id}' lacks mandatory 'product_id' column.",
        )

    all_pids = sorted(df[pid_col].astype(str).unique().tolist())
    target_pids = request.product_ids if request.product_ids else all_pids

    results = []
    is_m5 = (label == "PUBLIC_M5")
    for pid in target_pids:
        if pid not in all_pids:
            continue
        try:
            prod_result = fit_product_elasticity(
                df=df,
                product_id=pid,
                n_boot=300,
                random_state=42,
                is_m5_data=is_m5,
                period_days=30,
            )
            results.append(prod_result)
        except Exception as err:
            logger.warning("Failed fitting elasticity for product %s: %s", pid, err)

    if not results:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No products successfully fitted for dataset '{request.dataset_id}'.",
        )

    return ElasticityFitResponse(
        period_days=30,
        data_label=label,
        products=results,
    )


@app.post("/backtest", response_model=BacktestResponse)
def backtest_decision(request: BacktestRequest) -> BacktestResponse:
    """Evaluate historical backtest accuracy of price intervention predictions against actuals."""
    df, label = resolve_dataset(request.dataset_id)
    is_m5 = (label == "PUBLIC_M5")

    try:
        response = execute_backtest(
            df=df,
            product_id=request.product_id,
            change_date=request.change_date,
            horizon_days=request.horizon_days,
            is_m5_data=is_m5,
            random_state=42,
        )
        return response
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backtest execution failed: {err}",
        )


# ---------------- PHASE 6: NLQ PARSER & VERIFIED EXPLAINER ENDPOINTS ----------------

@app.post("/nlq/parse", response_model=Union[DecisionSpec, NLQParseFallback])
def nlq_parse(request: NLQParseRequest) -> Union[DecisionSpec, NLQParseFallback]:
    """Parse natural language question into validated DecisionSpec JSON or manual fallback."""
    return parse_question(
        question=request.question,
        catalog=request.catalog,
        active_product_id=request.active_product_id,
    )


@app.post("/nlq/explain", response_model=NLQExplainResponse)
def nlq_explain(request: NLQExplainRequest) -> NLQExplainResponse:
    """Synthesize factual narrative and actionable advice with zero-hallucination verification."""
    res = explain_scenario(
        scenario_result=request.scenario_result,
        business_context=request.business_context,
        language=request.language,
        question=request.question,
        decision_spec=request.decision_spec,
        optimize_summary=request.optimize_summary,
    )
    return NLQExplainResponse(
        text=res["text"],
        direct_answer=res.get("direct_answer"),
        action_verdict=res.get("action_verdict"),
        verdict_level=res.get("verdict_level"),
        situation_summary=res.get("situation_summary"),
        recommendations=res.get("recommendations", []),
    )


# ---------------- PHASE 8: DECISION INTELLIGENCE (MONITORING, CAUSAL, JOURNAL) ----------------

@app.post("/monitoring/evaluate", response_model=MonitoringEvaluateResponse)
def monitoring_evaluate(request: MonitoringEvaluateRequest) -> MonitoringEvaluateResponse:
    """Compute probabilistic calibration (PICP, MPIW, WIS, Pinball), demand regimes & drift."""
    df, label = resolve_dataset(request.dataset_id)
    is_m5 = label == "PUBLIC_M5"
    try:
        return evaluate_monitoring(
            df=df,
            product_id=request.product_id,
            data_label=label,
            is_m5_data=is_m5,
            n_rolling_windows=request.n_rolling_windows,
            seed=request.seed,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Monitoring evaluation failed: {err}",
        )


@app.post("/causal/analyze", response_model=CausalAnalyzeResponse)
def causal_analyze(request: CausalAnalyzeRequest) -> CausalAnalyzeResponse:
    """Estimate quasi-experimental causal impact (DiD with pre-trend test or ITS)."""
    df, _ = resolve_dataset(request.dataset_id)
    try:
        return analyze_causal_impact(
            df=df,
            product_id=request.product_id,
            control_product_id=request.control_product_id,
            intervention_date=request.intervention_date,
            post_days=request.post_days,
            method=request.method,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Causal impact analysis failed: {err}",
        )


@app.get("/journal", response_model=JournalListResponse)
def journal_list(product_id: Optional[str] = None) -> JournalListResponse:
    """List saved decisions and outcome calibration metrics from SQLite journal."""
    return list_decisions(product_id=product_id)


@app.post("/journal", response_model=DecisionRecord, status_code=status.HTTP_201_CREATED)
def journal_create(request: JournalCreateRequest) -> DecisionRecord:
    """Save a simulated decision proposal into persistent SQLite Decision Journal."""
    return create_decision(request)


@app.patch("/journal/{decision_id}", response_model=DecisionRecord)
def journal_update(decision_id: str, request: JournalUpdateRequest) -> DecisionRecord:
    """Update lifecycle status, actuals, or decision notes for a persisted entry."""
    updated = update_decision(decision_id, request)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision '{decision_id}' not found.",
        )
    return updated


@app.post("/journal/{decision_id}/evaluate", response_model=DecisionRecord)
def journal_evaluate_actual(
    decision_id: str,
    request: JournalEvaluateFromDatasetRequest,
) -> DecisionRecord:
    """Measure real post-decision qty, revenue, and profit from matching dates in dataset."""
    df, _ = resolve_dataset(request.dataset_id)
    try:
        return evaluate_decision_from_dataset(
            df=df,
            decision_id=decision_id,
            start_date=request.start_date,
            horizon_days=request.horizon_days,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )


@app.delete("/journal/{decision_id}")
def journal_delete(decision_id: str) -> Dict[str, Any]:
    """Delete a persisted decision entry from SQLite journal."""
    deleted = delete_decision(decision_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Decision '{decision_id}' not found.",
        )
    return {"deleted": True, "id": decision_id}
