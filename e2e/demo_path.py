"""End-to-end integration test across Go Gateway (:18080) -> Python ML (:18000).

Boots both services cleanly, uploads the messy Vietnamese retail CSV
(data/synthetic/out/messy_variants/vn_headers_vn_numbers/input.csv),
walks profile -> map -> commit -> elasticity fit -> simulate -> optimize -> nlq,
and asserts contract compliance and scenario profit ordering.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ML_DIR = os.path.join(ROOT, "ml-py")
GO_DIR = os.path.join(ROOT, "engine-go")
CSV_PATH = os.path.join(
    ROOT,
    "data",
    "synthetic",
    "out",
    "messy_variants",
    "vn_headers_vn_numbers",
    "input.csv",
)


def find_free_port() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return str(s.getsockname()[1])


def wait_for_health(url: str, timeout_s: float = 20.0) -> None:
    deadline = time.time() + timeout_s
    last_err = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception as err:
            last_err = err
        time.sleep(0.3)
    raise RuntimeError(f"Service at {url} did not become healthy in {timeout_s}s: {last_err}")


def http_post_json(url: str, payload: dict) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} on {url}: {body}") from err


def http_post_multipart_csv(url: str, file_path: str) -> dict:
    boundary = f"----WhatIfE2E{uuid.uuid4().hex}"
    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        csv_bytes = f.read()

    parts = [
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8"),
        b"Content-Type: text/csv\r\n\r\n",
        csv_bytes,
        f"\r\n--{boundary}--\r\n".encode("utf-8"),
    ]
    body = b"".join(parts)
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Multipart upload HTTP {err.code} on {url}: {err_body}") from err


def main() -> None:
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"Missing messy test CSV: {CSV_PATH}")

    go_bin = os.path.join(ROOT, "engine-go", "e2e_engine_tmp.exe")
    print("[e2e] Building Go engine binary...")
    build_env = os.environ.copy()
    subprocess.run(
        ["go", "build", "-o", go_bin, "./cmd/engine"],
        cwd=GO_DIR,
        env=build_env,
        check=True,
    )

    ML_PORT = find_free_port()
    GO_PORT = find_free_port()
    ML_URL = f"http://127.0.0.1:{ML_PORT}"
    GO_URL = f"http://127.0.0.1:{GO_PORT}"

    ml_log = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix="_ml.log")
    go_log = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix="_go.log")

    ml_env = os.environ.copy()
    ml_env["OMP_NUM_THREADS"] = "1"
    ml_env["OPENBLAS_NUM_THREADS"] = "1"
    ml_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ML_PORT],
        cwd=ML_DIR,
        env=ml_env,
        stdout=ml_log,
        stderr=subprocess.STDOUT,
    )

    go_env = os.environ.copy()
    go_env["PORT"] = GO_PORT
    go_env["ML_URL"] = ML_URL
    go_proc = subprocess.Popen(
        [go_bin],
        cwd=GO_DIR,
        env=go_env,
        stdout=go_log,
        stderr=subprocess.STDOUT,
    )

    try:
        print(f"[e2e] Waiting for ml-py ({ML_URL}/health) and engine-go ({GO_URL}/api/health)...")
        wait_for_health(f"{ML_URL}/health")
        wait_for_health(f"{GO_URL}/api/health")
        print("[e2e] Both services healthy.")

        # 0. Browser CORS check across Go gateway -> ml-py reverse proxy
        cors_req = urllib.request.Request(
            f"{GO_URL}/api/ingest/map",
            data=json.dumps({"upload_id": "nonexistent"}).encode("utf-8"),
            headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(cors_req, timeout=5) as _:
                pass
        except urllib.error.HTTPError as err:
            acao_vals = err.headers.get_all("Access-Control-Allow-Origin") or []
            assert acao_vals == ["http://localhost:5173"], (
                f"Expected single CORS origin header on proxied route, got: {acao_vals}"
            )
        print("[e2e] 0/7 Browser CORS proxy header check OK (single Access-Control-Allow-Origin).")

        # 1. Profile messy Vietnamese CSV THROUGH Go gateway (:18080/api/ingest/profile)
        prof = http_post_multipart_csv(f"{GO_URL}/api/ingest/profile", CSV_PATH)
        upload_id = prof["upload_id"]
        assert prof["n_rows"] > 1000, f"Unexpected row count: {prof['n_rows']}"
        print(f"[e2e] 1/7 Profile OK: upload_id={upload_id}, rows={prof['n_rows']}, cols={len(prof['columns'])}")

        # 2. NLP Column Mapping
        _, map_res = http_post_json(f"{GO_URL}/api/ingest/map", {"upload_id": upload_id})
        assert map_res["missing_required"] == [], f"Missing required cols: {map_res['missing_required']}"
        confirmed_map = {
            item["canonical"]: item["source"]
            for item in map_res["mapping"]
            if item.get("source")
        }
        print(f"[e2e] 2/7 Map OK: mapped={confirmed_map}")

        # 3. Commit & Canonical Transform (VN numbers & dates)
        _, commit_res = http_post_json(
            f"{GO_URL}/api/ingest/commit",
            {
                "upload_id": upload_id,
                "mapping": confirmed_map,
                "options": {
                    "price_unit": "VND",
                    "date_format": "%d/%m/%Y",
                    "number_locale": "vi_VN",
                },
            },
        )
        dataset_id = commit_res["dataset_id"]
        assert commit_res["label"] == "USER"
        print(f"[e2e] 3/7 Commit OK: dataset_id={dataset_id}, label={commit_res['label']}")

        # 4. Econometric Elasticity Fit
        t0 = time.perf_counter()
        _, fit_res = http_post_json(
            f"{GO_URL}/api/elasticity/fit",
            {"dataset_id": dataset_id},
        )
        fit_dt = time.perf_counter() - t0
        assert fit_res["data_label"] == "USER"
        assert len(fit_res["products"]) >= 1
        p0 = fit_res["products"][0]
        assert len(p0["elasticity_samples"]) >= 100
        assert p0["current_price_vnd"] >= 50_000, (
            f"1000x VN number corruption detected! current_price_vnd={p0['current_price_vnd']} (expected >= 50,000)"
        )
        assert p0["unit_cost_vnd"] >= 20_000, (
            f"1000x VN number corruption detected! unit_cost_vnd={p0['unit_cost_vnd']} (expected >= 20,000)"
        )
        print(
            f"[e2e] 4/7 Elasticity Fit OK in {fit_dt:.2f}s: {len(fit_res['products'])} products, "
            f"{p0['product_id']} price={p0['current_price_vnd']:,} VND, cost={p0['unit_cost_vnd']:,} VND, "
            f"qty30d={p0['baseline_qty_per_period']:,}, median e={p0['elasticity_median']:.3f}"
        )

        # 5. Simulate +10% price increase through Go engine
        _, sim_res = http_post_json(
            f"{GO_URL}/api/simulate",
            {
                "product": {
                    "current_price_vnd": p0["current_price_vnd"],
                    "unit_cost_vnd": p0["unit_cost_vnd"],
                    "baseline_qty_per_period": p0["baseline_qty_per_period"],
                    "elasticity_samples": p0["elasticity_samples"],
                },
                "price_change_pct": 10.0,
                "n_sims": 5000,
                "seed": 42,
            },
        )
        scenarios = sim_res["scenarios"]
        for k in ("base", "optimistic", "expected", "pessimistic"):
            assert k in scenarios, f"Missing scenario key: {k}"
        opt_p = scenarios["optimistic"]["profit"]
        exp_p = scenarios["expected"]["profit"]
        pes_p = scenarios["pessimistic"]["profit"]
        assert opt_p >= exp_p >= pes_p, (
            f"Profit ordering failed: opt={opt_p}, exp={exp_p}, pes={pes_p}"
        )
        assert exp_p >= 10_000_000, (
            f"Expected profit {exp_p:,.0f} VND unexpectedly low (possible VN number scale bug)"
        )
        assert scenarios["expected"]["qty"] > 100, (
            f"Expected simulated qty unreasonably low: {scenarios['expected']['qty']}"
        )
        assert len(sim_res["profit_distribution"]["histogram"]) >= 1
        assert sim_res.get("break_even_elasticity") is not None
        print(
            f"[e2e] 5/7 Simulate OK: exp_qty={scenarios['expected']['qty']:,.1f}, "
            f"opt={opt_p:,.0f} >= exp={exp_p:,.0f} >= pess={pes_p:,.0f} VND, "
            f"e*={sim_res['break_even_elasticity']:.3f}"
        )

        # 6. Reverse What-If Optimize
        _, opt_res = http_post_json(
            f"{GO_URL}/api/optimize",
            {
                "product": {
                    "current_price_vnd": p0["current_price_vnd"],
                    "unit_cost_vnd": p0["unit_cost_vnd"],
                    "baseline_qty_per_period": p0["baseline_qty_per_period"],
                    "elasticity_samples": p0["elasticity_samples"],
                },
                "objective": "hit_target",
                "target_profit_uplift_pct": 10.0,
                "constraints": {
                    "max_price_change_pct": 30.0,
                    "min_margin_pct": 20.0,
                    "respect_stock": False,
                },
                "n_sims": 2000,
                "seed": 42,
            },
        )
        assert len(opt_res["ranked"]) >= 10
        best = opt_res["ranked"][0]
        print(
            f"[e2e] 6/7 Optimize OK: best={best['price_vnd']:,} VND ({best['price_change_pct']:+.1f}%), "
            f"prob_hit={best['prob_hit_target']:.2f}"
        )

        # 7. NLQ Parse + Explain
        _, parse_res = http_post_json(
            f"{GO_URL}/api/nlq/parse",
            {
                "question": f"Neu toi tang gia {p0['product_id']} them 10% trong 30 ngay?",
                "catalog": [
                    {"product_id": pr["product_id"], "name": pr["product_name"]}
                    for pr in fit_res["products"]
                ],
            },
        )
        assert parse_res["product_id"] == p0["product_id"]
        assert abs(parse_res["change_value"] - 10.0) < 1e-6

        _, exp_res = http_post_json(
            f"{GO_URL}/api/nlq/explain",
            {"scenario_result": sim_res},
        )
        assert len(exp_res["text"]) > 20
        assert "of 0 units" not in exp_res["text"], (
            f"Explainer emitted 0 units instead of reading Go qty field: {exp_res['text']}"
        )
        print(f"[e2e] 7/8 NLQ OK: {exp_res['text']}")

        # 8. Multi-Phase Schedule ("15 ngay dau giam 30%, 15 ngay sau moi nagyf tang 1%") + Business Context Advice
        _, sched_parse = http_post_json(
            f"{GO_URL}/api/nlq/parse",
            {
                "question": f"Với {p0['product_id']}, 15 ngày đầu giảm 30%, 15 ngày sau mỗi nagyf tăng 1% thì sao?",
                "catalog": [
                    {"product_id": pr["product_id"], "name": pr["product_name"]}
                    for pr in fit_res["products"]
                ],
            },
        )
        assert sched_parse["change_type"] == "price_schedule"
        assert sched_parse["horizon_days"] == 30
        assert len(sched_parse["schedule"]) == 2

        _, sched_sim = http_post_json(
            f"{GO_URL}/api/simulate",
            {
                "product": {
                    "current_price_vnd": p0["current_price_vnd"],
                    "unit_cost_vnd": p0["unit_cost_vnd"],
                    "baseline_qty_per_period": p0["baseline_qty_per_period"],
                    "elasticity_samples": p0["elasticity_samples"],
                },
                "price_change_pct": sched_parse["change_value"],
                "n_sims": 5000,
                "seed": 42,
                "schedule": sched_parse["schedule"],
                "business_context": p0.get("business_context"),
            },
        )
        assert len(sched_sim.get("schedule_trace", [])) == 30
        assert sched_sim.get("advisory") is not None

        _, sched_exp = http_post_json(
            f"{GO_URL}/api/nlq/explain",
            {
                "scenario_result": sched_sim,
                "business_context": p0.get("business_context"),
                "language": "vi",
            },
        )
        assert sched_exp.get("action_verdict")
        assert sched_exp.get("situation_summary")
        assert len(sched_exp.get("recommendations", [])) >= 1
        print(
            f"[e2e] 8/8 Multi-phase Schedule + Advice OK: verdict='{sched_exp['action_verdict']}', "
            f"recs={len(sched_exp['recommendations'])}, trace_days={len(sched_sim['schedule_trace'])}"
        )
        print("[e2e] ALL E2E CHECKS PASSED SUCCESSFULLY!")

    except Exception:
        for label, fobj in (("ml-py", ml_log), ("engine-go", go_log)):
            try:
                fobj.flush()
                fobj.seek(0)
                print(f"\n--- {label} log ---\n{fobj.read()[-3000:]}")
            except Exception:
                pass
        raise
    finally:
        for p in (go_proc, ml_proc):
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        for fobj in (ml_log, go_log):
            name = fobj.name
            fobj.close()
            if os.path.exists(name):
                try:
                    os.remove(name)
                except OSError:
                    pass
        if os.path.exists(go_bin):
            try:
                os.remove(go_bin)
            except OSError:
                pass


if __name__ == "__main__":
    main()
