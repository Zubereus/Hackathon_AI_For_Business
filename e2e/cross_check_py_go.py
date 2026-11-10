"""Cross-check Go /api/simulate against a clean Python reference implementation.

Evaluates 3 products from contracts/fixtures/elasticity_fixture.json with identical
elasticity samples, seed=42, and n_sims=10000, asserting agreement within 0.5%.
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FIXTURE_PATH = os.path.join(ROOT, "contracts", "fixtures", "elasticity_fixture.json")
GO_DIR = os.path.join(ROOT, "engine-go")
GO_PORT = "18085"


def py_quantile(sorted_vals: list[float], p: float) -> float:
    n = len(sorted_vals)
    if n == 1:
        return sorted_vals[0]
    idx = p * (n - 1)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] * (1.0 - (idx - lo)) + sorted_vals[hi] * (idx - lo)


def py_reference_simulate(product: dict, price_change_pct: float, n_sims: int) -> dict:
    """30-line single-source-of-truth Python reference of docs/ARCHITECTURE.md formulas."""
    p0 = float(product["current_price_vnd"])
    c = float(product["unit_cost_vnd"])
    q0 = float(product["baseline_qty_per_period"])
    p1 = p0 * (1.0 + price_change_pct / 100.0)
    ratio = p1 / p0
    samples = [float(x) for x in product["elasticity_samples"]]

    # Percentile scenarios ordered by sensitivity |e|
    by_sens = sorted(samples, key=lambda x: (abs(x), x))
    e_p10, e_p50, e_p90 = py_quantile(by_sens, 0.10), py_quantile(by_sens, 0.50), py_quantile(by_sens, 0.90)

    def pt(price: float, e: float) -> float:
        return (price - c) * (q0 * ((price / p0) ** e if price != p0 else 1.0))

    prof_a, prof_b = pt(p1, e_p10), pt(p1, e_p90)
    # Uniform cycle across all bootstrap samples converges identically at n_sims=10,000
    all_profits = sorted(pt(p1, samples[i % len(samples)]) for i in range(n_sims))
    e_star = math.log((p0 - c) / (p1 - c)) / math.log(ratio)
    return {
        "base_profit": pt(p0, 0.0),
        "optimistic_profit": max(prof_a, prof_b),
        "expected_profit": pt(p1, e_p50),
        "pessimistic_profit": min(prof_a, prof_b),
        "p5": py_quantile(all_profits, 0.05),
        "p50": py_quantile(all_profits, 0.50),
        "p95": py_quantile(all_profits, 0.95),
        "break_even_elasticity": e_star,
    }


def assert_within_tol(label: str, go_val: float, py_val: float, max_rel: float = 0.005) -> None:
    rel = abs(go_val - py_val) / max(abs(py_val), 1e-9)
    assert rel <= max_rel, (
        f"{label} exceeded {max_rel*100:.2f}% tol: Go={go_val:.4f}, Py={py_val:.4f}, rel={rel*100:.4f}%"
    )


def main() -> None:
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    go_bin = os.path.join(GO_DIR, "crosscheck_engine_tmp.exe")
    subprocess.run(["go", "build", "-o", go_bin, "./cmd/engine"], cwd=GO_DIR, check=True)
    env = os.environ.copy()
    env["PORT"] = GO_PORT
    proc = subprocess.Popen([go_bin], cwd=GO_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.7)

    try:
        for prod in fixture["products"][:3]:
            req_prod = {
                "current_price_vnd": prod["current_price_vnd"],
                "unit_cost_vnd": prod["unit_cost_vnd"],
                "baseline_qty_per_period": prod["baseline_qty_per_period"],
                "elasticity_samples": prod["elasticity_samples"],
            }
            payload = {"product": req_prod, "price_change_pct": 10.0, "n_sims": 10000, "seed": 42}
            req = urllib.request.Request(
                f"http://127.0.0.1:{GO_PORT}/api/simulate",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                go_res = json.loads(resp.read().decode("utf-8"))

            py_res = py_reference_simulate(req_prod, 10.0, 10000)

            assert_within_tol(f"{prod['product_id']}.base", go_res["scenarios"]["base"]["profit"], py_res["base_profit"])
            assert_within_tol(f"{prod['product_id']}.opt", go_res["scenarios"]["optimistic"]["profit"], py_res["optimistic_profit"])
            assert_within_tol(f"{prod['product_id']}.exp", go_res["scenarios"]["expected"]["profit"], py_res["expected_profit"])
            assert_within_tol(f"{prod['product_id']}.pes", go_res["scenarios"]["pessimistic"]["profit"], py_res["pessimistic_profit"])
            assert_within_tol(f"{prod['product_id']}.p5", go_res["profit_distribution"]["p5"], py_res["p5"])
            assert_within_tol(f"{prod['product_id']}.p50", go_res["profit_distribution"]["p50"], py_res["p50"])
            assert_within_tol(f"{prod['product_id']}.p95", go_res["profit_distribution"]["p95"], py_res["p95"])
            assert_within_tol(f"{prod['product_id']}.e*", go_res["break_even_elasticity"], py_res["break_even_elasticity"])

            diff_p50 = abs(go_res["profit_distribution"]["p50"] - py_res["p50"]) / abs(py_res["p50"]) * 100
            print(
                f"[cross-check] {prod['product_id']} ({prod['product_name']}): Go P50={go_res['profit_distribution']['p50']:,.0f}, "
                f"Py P50={py_res['p50']:,.0f} (rel diff={diff_p50:.4f}%)"
            )
        print("[cross-check] 3/3 products agreed with Python reference within 0.5%!")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        if os.path.exists(go_bin):
            os.remove(go_bin)


if __name__ == "__main__":
    main()

