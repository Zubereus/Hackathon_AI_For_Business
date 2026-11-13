"""Black-box HTTP client and optional isolated server harness for What-If AI.

Strictly interacts with the What-If Agent exclusively through observable HTTP endpoints.
Does NOT access internal Python modules, hidden state, or prompts of the target app.
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
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


def _find_free_port() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return str(s.getsockname()[1])


def _wait_for_health(url: str, timeout_s: float = 25.0) -> None:
    deadline = time.time() + timeout_s
    last_err: Optional[Exception] = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status == 200:
                    return
        except Exception as err:
            last_err = err
        time.sleep(0.25)
    raise RuntimeError(f"Service at {url} did not respond healthy in {timeout_s}s: {last_err}")


@dataclass
class WhatIfObservableResponse:
    """Strictly observable output returned by the What-If Agent to a simulated user."""

    question: str
    status: str  # "answered" | "fallback" | "error"
    latency_ms: float
    fallback_reason: Optional[str] = None
    parsed_spec: Optional[Dict[str, Any]] = None
    simulation: Optional[Dict[str, Any]] = None
    optimization: Optional[Dict[str, Any]] = None
    explanation: Optional[Dict[str, Any]] = None
    error_detail: Optional[str] = None


class WhatIfHttpClient:
    """Observable black-box HTTP client talking to the Go Gateway (:8080)."""

    def __init__(self, base_url: str = "http://127.0.0.1:8080", timeout_s: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s

    def _post_json(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {err.code} on {path}: {body}") from err

    def fit_dataset(self, dataset_id: str) -> Dict[str, Any]:
        """Call /api/elasticity/fit identically to how the web UI loads a dataset."""
        return self._post_json("/api/elasticity/fit", {"dataset_id": dataset_id})

    def simulate(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Direct call to Go /api/simulate for objective cross-checks."""
        return self._post_json("/api/simulate", payload)

    def optimize(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Direct call to Go /api/optimize for objective strategy checks."""
        return self._post_json("/api/optimize", payload)

    def ask_question(
        self,
        question: str,
        products: List[Dict[str, Any]],
        active_product_id: Optional[str] = None,
        seed: int = 42,
        n_sims: int = 2000,
    ) -> WhatIfObservableResponse:
        """Execute the observable What-If Agent turn sequence: parse -> simulate -> [optimize] -> explain."""
        t0 = time.perf_counter()
        catalog = [{"product_id": p["product_id"], "name": p["product_name"]} for p in products]

        try:
            parsed = self._post_json(
                "/api/nlq/parse",
                {
                    "question": question,
                    "catalog": catalog,
                    "active_product_id": active_product_id,
                },
            )
        except Exception as err:
            return WhatIfObservableResponse(
                question=question,
                status="error",
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                error_detail=str(err),
            )

        if "fallback" in parsed:
            return WhatIfObservableResponse(
                question=question,
                status="fallback",
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                fallback_reason=parsed.get("error"),
                parsed_spec=parsed,
            )

        target_pid = parsed.get("product_id")
        target_prod = next((p for p in products if p["product_id"] == target_pid), None)
        if not target_prod:
            return WhatIfObservableResponse(
                question=question,
                status="error",
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                parsed_spec=parsed,
                error_detail=f"Parsed product_id '{target_pid}' missing from loaded products.",
            )

        p0 = int(target_prod["current_price_vnd"])
        cost = int(target_prod["unit_cost_vnd"])
        biz_ctx = dict(target_prod.get("business_context") or {})
        biz_ctx["base_margin_pct"] = round(((p0 - cost) / p0) * 100.0, 2) if p0 > 0 else 0.0
        biz_ctx["significant"] = target_prod.get("significant", True)
        biz_ctx["warnings"] = target_prod.get("warnings", [])

        sim_payload: Dict[str, Any] = {
            "product": {
                "current_price_vnd": p0,
                "unit_cost_vnd": cost,
                "baseline_qty_per_period": int(target_prod["baseline_qty_per_period"]),
                "stock_available": target_prod.get("stock_available"),
                "fixed_cost_vnd": int(target_prod.get("fixed_cost_vnd") or 0),
                "elasticity_samples": target_prod["elasticity_samples"],
            },
            "price_change_pct": float(parsed["change_value"]),
            "n_sims": n_sims,
            "seed": seed,
            "business_context": biz_ctx,
        }
        if parsed.get("schedule"):
            sim_payload["schedule"] = parsed["schedule"]
        if parsed.get("baseline_period_days"):
            sim_payload["baseline_period_days"] = parsed["baseline_period_days"]

        try:
            sim_res = self._post_json("/api/simulate", sim_payload)

            opt_res: Optional[Dict[str, Any]] = None
            opt_summary: Optional[Dict[str, Any]] = None
            q_type = parsed.get("question_type")
            if q_type in ("yes_no_feasibility", "reverse_goal") or parsed.get("event_context"):
                ev_ctx = parsed.get("event_context") or {}
                active_days = ev_ctx.get("active_days") or parsed.get("horizon_days") or 30
                d_mult = float(ev_ctx.get("demand_multiplier") or 1.0)
                e_mult = float(ev_ctx.get("elasticity_multiplier") or 1.0)
                scaled_qty = max(
                    1,
                    round((float(target_prod["baseline_qty_per_period"]) / 30.0) * active_days * d_mult),
                )
                scaled_samples = [float(e) * e_mult for e in target_prod["elasticity_samples"]]
                opt_res = self._post_json(
                    "/api/optimize",
                    {
                        "product": {
                            "current_price_vnd": p0,
                            "unit_cost_vnd": cost,
                            "baseline_qty_per_period": scaled_qty,
                            "stock_available": target_prod.get("stock_available"),
                            "fixed_cost_vnd": int(target_prod.get("fixed_cost_vnd") or 0),
                            "elasticity_samples": scaled_samples,
                        },
                        "objective": "hit_target" if q_type == "reverse_goal" else "max_expected_profit",
                        "target_profit_uplift_pct": parsed.get("target_uplift_pct") or 10.0,
                        "constraints": {
                            "max_price_change_pct": 30.0,
                            "min_margin_pct": 15.0,
                            "respect_stock": target_prod.get("stock_available") is not None,
                        },
                        "n_sims": 1000,
                        "seed": seed,
                    },
                )
                ranked = opt_res.get("ranked") or []
                best_feasible = next((r for r in ranked if r.get("feasible")), ranked[0] if ranked else None)
                if best_feasible:
                    opt_summary = {"best_feasible": best_feasible}

            exp_res = self._post_json(
                "/api/nlq/explain",
                {
                    "scenario_result": sim_res,
                    "business_context": biz_ctx,
                    "language": parsed.get("detected_language") or "vi",
                    "question": question,
                    "decision_spec": parsed,
                    "optimize_summary": opt_summary,
                },
            )
            return WhatIfObservableResponse(
                question=question,
                status="answered",
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                parsed_spec=parsed,
                simulation=sim_res,
                optimization=opt_res,
                explanation=exp_res,
            )
        except Exception as err:
            return WhatIfObservableResponse(
                question=question,
                status="error",
                latency_ms=round((time.perf_counter() - t0) * 1000, 1),
                parsed_spec=parsed,
                error_detail=str(err),
            )


class WhatIfServerHarness:
    """Context manager launching isolated ml-py and engine-go subprocesses for evaluation."""

    def __init__(self, repo_root: str, offline_llm: bool = True) -> None:
        self.repo_root = os.path.abspath(repo_root)
        self.ml_dir = os.path.join(self.repo_root, "ml-py")
        self.go_dir = os.path.join(self.repo_root, "engine-go")
        self.offline_llm = offline_llm
        self.go_bin = os.path.join(self.go_dir, "eval_engine_tmp.exe" if os.name == "nt" else "eval_engine_tmp")
        self.ml_proc: Optional[subprocess.Popen[Any]] = None
        self.go_proc: Optional[subprocess.Popen[Any]] = None
        self.ml_log: Optional[Any] = None
        self.go_log: Optional[Any] = None
        self.go_url: str = ""

    def __enter__(self) -> WhatIfHttpClient:
        subprocess.run(
            ["go", "build", "-o", self.go_bin, "./cmd/engine"],
            cwd=self.go_dir,
            check=True,
        )
        ml_port = _find_free_port()
        go_port = _find_free_port()
        ml_url = f"http://127.0.0.1:{ml_port}"
        self.go_url = f"http://127.0.0.1:{go_port}"

        self.ml_log = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix="_eval_ml.log")
        self.go_log = tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix="_eval_go.log")

        ml_env = os.environ.copy()
        ml_env["OMP_NUM_THREADS"] = "1"
        ml_env["OPENBLAS_NUM_THREADS"] = "1"
        if self.offline_llm:
            ml_env["LLM_PROVIDER"] = "none"
            ml_env["LLM_API_KEY"] = ""
            ml_env["AI_API_KEY"] = ""
            ml_env["PYTEST_CURRENT_TEST"] = "evaluation_harness"

        self.ml_proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ml_port],
            cwd=self.ml_dir,
            env=ml_env,
            stdout=self.ml_log,
            stderr=subprocess.STDOUT,
        )

        go_env = os.environ.copy()
        go_env["PORT"] = go_port
        go_env["ML_URL"] = ml_url
        self.go_proc = subprocess.Popen(
            [self.go_bin],
            cwd=self.go_dir,
            env=go_env,
            stdout=self.go_log,
            stderr=subprocess.STDOUT,
        )

        _wait_for_health(f"{ml_url}/health")
        _wait_for_health(f"{self.go_url}/api/health")
        return WhatIfHttpClient(base_url=self.go_url)

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        for proc in (self.go_proc, self.ml_proc):
            if proc is not None and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        for f in (self.ml_log, self.go_log):
            if f is not None:
                try:
                    name = f.name
                    f.close()
                    if os.path.exists(name):
                        os.remove(name)
                except OSError:
                    pass
        if os.path.exists(self.go_bin):
            try:
                os.remove(self.go_bin)
            except OSError:
                pass

