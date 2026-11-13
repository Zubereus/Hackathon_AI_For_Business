"""SQLite-backed Business Decision Journal for tracking Simulated -> Implemented -> Actual outcomes."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator, List, Optional
import pandas as pd

from app.schemas.contracts import (
    DecisionRecord,
    JournalCreateRequest,
    JournalListResponse,
    JournalUpdateRequest,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def get_db_path() -> str:
    """Resolve persistent SQLite journal path inside configured workdir."""
    explicit = os.getenv("WHATIF_JOURNAL_DB")
    if explicit:
        parent = os.path.dirname(explicit)
        if parent:
            os.makedirs(parent, exist_ok=True)
        return explicit
    workdir = os.getenv("WHATIF_WORKDIR", "workdir")
    os.makedirs(workdir, exist_ok=True)
    return os.path.join(workdir, "decisions.db")


@contextmanager
def _connect(db_path: Optional[str] = None) -> Iterator[sqlite3.Connection]:
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                dataset_id TEXT NOT NULL,
                data_label TEXT NOT NULL,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                title TEXT NOT NULL,
                decision_type TEXT NOT NULL,
                horizon_days INTEGER NOT NULL,
                planned_price_vnd INTEGER NOT NULL,
                planned_price_change_pct REAL NOT NULL,
                planned_restock_units INTEGER NOT NULL DEFAULT 0,
                assumptions_json TEXT NOT NULL,
                expected_qty REAL NOT NULL,
                expected_revenue_vnd REAL NOT NULL,
                expected_profit_vnd REAL NOT NULL,
                p5_profit_vnd REAL NOT NULL,
                p95_profit_vnd REAL NOT NULL,
                prob_beat_base REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'planned',
                implemented_at TEXT,
                evaluated_at TEXT,
                actual_qty REAL,
                actual_revenue_vnd REAL,
                actual_profit_vnd REAL,
                notes TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.commit()
        yield conn
    finally:
        conn.close()


def _row_to_record(row: sqlite3.Row) -> DecisionRecord:
    assumptions = json.loads(row["assumptions_json"]) if row["assumptions_json"] else {}
    actual_profit = row["actual_profit_vnd"]
    expected_profit = float(row["expected_profit_vnd"])
    p5 = float(row["p5_profit_vnd"])
    p95 = float(row["p95_profit_vnd"])

    variance_vnd: Optional[float] = None
    variance_pct: Optional[float] = None
    within_band: Optional[bool] = None

    if actual_profit is not None:
        ap = float(actual_profit)
        variance_vnd = round(ap - expected_profit, 0)
        if abs(expected_profit) > 1e-6:
            variance_pct = round(((ap - expected_profit) / abs(expected_profit)) * 100.0, 2)
        lo, hi = min(p5, p95), max(p5, p95)
        within_band = lo <= ap <= hi

    return DecisionRecord(
        id=row["id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        dataset_id=row["dataset_id"],
        data_label=row["data_label"],
        product_id=row["product_id"],
        product_name=row["product_name"],
        title=row["title"],
        decision_type=row["decision_type"],
        horizon_days=int(row["horizon_days"]),
        planned_price_vnd=int(row["planned_price_vnd"]),
        planned_price_change_pct=float(row["planned_price_change_pct"]),
        planned_restock_units=int(row["planned_restock_units"]),
        assumptions=assumptions,
        expected_qty=float(row["expected_qty"]),
        expected_revenue_vnd=float(row["expected_revenue_vnd"]),
        expected_profit_vnd=expected_profit,
        p5_profit_vnd=p5,
        p95_profit_vnd=p95,
        prob_beat_base=float(row["prob_beat_base"]),
        status=row["status"],
        implemented_at=row["implemented_at"],
        evaluated_at=row["evaluated_at"],
        actual_qty=float(row["actual_qty"]) if row["actual_qty"] is not None else None,
        actual_revenue_vnd=float(row["actual_revenue_vnd"]) if row["actual_revenue_vnd"] is not None else None,
        actual_profit_vnd=float(actual_profit) if actual_profit is not None else None,
        profit_variance_vnd=variance_vnd,
        profit_variance_pct=variance_pct,
        within_p5_p95_band=within_band,
        notes=row["notes"] or "",
    )


def create_decision(req: JournalCreateRequest, db_path: Optional[str] = None) -> DecisionRecord:
    """Insert a simulated decision snapshot into persistent journal."""
    dec_id = str(uuid.uuid4())[:12]
    now = _utc_now_iso()
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO decisions (
                id, created_at, updated_at, dataset_id, data_label,
                product_id, product_name, title, decision_type, horizon_days,
                planned_price_vnd, planned_price_change_pct, planned_restock_units,
                assumptions_json, expected_qty, expected_revenue_vnd, expected_profit_vnd,
                p5_profit_vnd, p95_profit_vnd, prob_beat_base, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)
            """,
            (
                dec_id,
                now,
                now,
                req.dataset_id,
                req.data_label,
                req.product_id,
                req.product_name,
                req.title,
                req.decision_type,
                req.horizon_days,
                req.planned_price_vnd,
                req.planned_price_change_pct,
                req.planned_restock_units,
                json.dumps(req.assumptions, ensure_ascii=False),
                req.expected_qty,
                req.expected_revenue_vnd,
                req.expected_profit_vnd,
                req.p5_profit_vnd,
                req.p95_profit_vnd,
                req.prob_beat_base,
                req.notes,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM decisions WHERE id = ?", (dec_id,)).fetchone()
    return _row_to_record(row)


def get_decision(decision_id: str, db_path: Optional[str] = None) -> Optional[DecisionRecord]:
    """Fetch a single decision record by ID."""
    with _connect(db_path) as conn:
        row = conn.execute("SELECT * FROM decisions WHERE id = ?", (decision_id,)).fetchone()
    return _row_to_record(row) if row is not None else None


def list_decisions(
    product_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> JournalListResponse:
    """List persisted decisions with aggregate calibration/outcome metrics."""
    with _connect(db_path) as conn:
        if product_id:
            rows = conn.execute(
                "SELECT * FROM decisions WHERE product_id = ? ORDER BY created_at DESC",
                (product_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM decisions ORDER BY created_at DESC").fetchall()

    items: List[DecisionRecord] = [_row_to_record(r) for r in rows]
    eval_items = [it for it in items if it.actual_profit_vnd is not None]
    eval_count = len(eval_items)
    within_rate: Optional[float] = None
    cum_sim = 0.0
    cum_act = 0.0
    if eval_count > 0:
        in_band = sum(1 for it in eval_items if it.within_p5_p95_band)
        within_rate = round((in_band / eval_count) * 100.0, 1)
        cum_sim = round(sum(it.expected_profit_vnd for it in eval_items), 0)
        cum_act = round(sum(it.actual_profit_vnd or 0.0 for it in eval_items), 0)

    return JournalListResponse(
        items=items,
        total_count=len(items),
        evaluated_count=eval_count,
        within_band_rate_pct=within_rate,
        cumulative_simulated_profit_vnd=cum_sim,
        cumulative_actual_profit_vnd=cum_act,
    )


def update_decision(
    decision_id: str,
    req: JournalUpdateRequest,
    db_path: Optional[str] = None,
) -> Optional[DecisionRecord]:
    """Update lifecycle status, implementation date, actuals, or manager notes."""
    existing = get_decision(decision_id, db_path=db_path)
    if existing is None:
        return None

    now = _utc_now_iso()
    status_val = req.status or existing.status
    impl_at = req.implemented_at if req.implemented_at is not None else existing.implemented_at
    if status_val == "implemented" and not impl_at:
        impl_at = now[:10]

    actual_qty = req.actual_qty if req.actual_qty is not None else existing.actual_qty
    actual_rev = req.actual_revenue_vnd if req.actual_revenue_vnd is not None else existing.actual_revenue_vnd
    actual_prof = req.actual_profit_vnd if req.actual_profit_vnd is not None else existing.actual_profit_vnd
    eval_at = existing.evaluated_at

    if actual_prof is not None and req.actual_profit_vnd is not None:
        status_val = "evaluated"
        eval_at = now
    elif status_val == "evaluated" and not eval_at:
        eval_at = now

    notes_val = req.notes if req.notes is not None else existing.notes

    with _connect(db_path) as conn:
        conn.execute(
            """
            UPDATE decisions SET
                updated_at = ?, status = ?, implemented_at = ?, evaluated_at = ?,
                actual_qty = ?, actual_revenue_vnd = ?, actual_profit_vnd = ?, notes = ?
            WHERE id = ?
            """,
            (
                now,
                status_val,
                impl_at,
                eval_at,
                actual_qty,
                actual_rev,
                actual_prof,
                notes_val,
                decision_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM decisions WHERE id = ?", (decision_id,)).fetchone()
    return _row_to_record(row)


def evaluate_decision_from_dataset(
    df: pd.DataFrame,
    decision_id: str,
    start_date: str,
    horizon_days: Optional[int] = None,
    db_path: Optional[str] = None,
) -> DecisionRecord:
    """Measure real post-decision qty, revenue, and net profit over matching dates in dataset."""
    existing = get_decision(decision_id, db_path=db_path)
    if existing is None:
        raise ValueError(f"Decision '{decision_id}' not found.")

    eff_horizon = horizon_days or existing.horizon_days
    sub = df[df["product_id"].astype(str) == str(existing.product_id)].copy()
    if sub.empty:
        raise ValueError(f"Product '{existing.product_id}' not found in selected dataset.")

    sub["date_str"] = pd.to_datetime(sub["date"]).dt.strftime("%Y-%m-%d")
    sub = sub.sort_values("date_str")
    post = sub[sub["date_str"] >= str(start_date)].head(eff_horizon).copy()
    if post.empty:
        raise ValueError(
            f"No dataset observations found on or after '{start_date}' for '{existing.product_id}'."
        )

    price_col = "price" if "price" in post.columns else "price_vnd"
    qty_col = "quantity" if "quantity" in post.columns else "quantity_sold"
    cost_col = "unit_cost" if "unit_cost" in post.columns else ("unit_cost_vnd" if "unit_cost_vnd" in post.columns else None)

    prices = pd.to_numeric(post[price_col], errors="coerce").fillna(0.0)
    qtys = pd.to_numeric(post[qty_col], errors="coerce").fillna(0.0)
    costs = pd.to_numeric(post[cost_col], errors="coerce").fillna(0.0) if cost_col else 0.0

    act_qty = float(qtys.sum())
    act_rev = float((prices * qtys).sum())
    gross_profit = float(((prices - costs) * qtys).sum())

    extra_cost = 0.0
    for col in ("marketing_cost", "marketing_cost_vnd", "labor_cost", "labor_cost_vnd", "operating_cost", "operating_cost_vnd", "fixed_cost", "fixed_cost_vnd"):
        if col in post.columns:
            extra_cost += float(pd.to_numeric(post[col], errors="coerce").fillna(0.0).sum())

    act_profit = gross_profit - extra_cost
    note_suffix = f" [Auto-evaluated {len(post)} days from {start_date}: {post['date_str'].iloc[0]}..{post['date_str'].iloc[-1]}]"
    merged_note = existing.notes if note_suffix in existing.notes else (existing.notes + note_suffix).strip()

    updated = update_decision(
        decision_id,
        JournalUpdateRequest(
            status="evaluated",
            implemented_at=existing.implemented_at or str(start_date),
            actual_qty=round(act_qty, 2),
            actual_revenue_vnd=round(act_rev, 0),
            actual_profit_vnd=round(act_profit, 0),
            notes=merged_note,
        ),
        db_path=db_path,
    )
    assert updated is not None
    return updated


def delete_decision(decision_id: str, db_path: Optional[str] = None) -> bool:
    """Delete a persisted decision entry by ID."""
    with _connect(db_path) as conn:
        cur = conn.execute("DELETE FROM decisions WHERE id = ?", (decision_id,))
        conn.commit()
        return cur.rowcount > 0

