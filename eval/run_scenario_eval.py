"""Evaluate scenario engines against independently simulated synthetic truths."""

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from eval.synthetic_data import (
    SLOW_STATES,
    TRUE,
    make_world,
    probation_truth,
    promise_truth,
    true_delta,
)
from src.scenarios.compare import compare_policies
from src.scenarios.seller_probation import (
    breakeven_late_cost,
    probation_facts,
    seller_orders,
    seller_stats,
    worst_sellers,
)


RESULTS_PATH = Path(__file__).with_name("results.json")


def evaluate_engine(
    orders: pd.DataFrame,
    seller_order_data: pd.DataFrame,
) -> pd.DataFrame:
    """Run the scenario engine with the fixed ground-truth assumptions."""
    return compare_policies(
        orders,
        seller_order_data,
        thresholds=[],
        probation_ks=[10],
        promise_states=SLOW_STATES,
        pad_days_options=[3, 7],
        take_rate=TRUE["take_rate"],
        absorbed_range=(TRUE["absorbed_share"], TRUE["absorbed_share"]),
        late_cost_range=(TRUE["late_cost"], TRUE["late_cost"]),
        conversion_loss_range=(TRUE["conversion_loss"], TRUE["conversion_loss"]),
        n_draws=100,
    )


def calculate_truth(
    orders: pd.DataFrame,
    seller_order_data: pd.DataFrame,
    bad_sellers: list[str],
) -> tuple[dict[str, float], dict[str, Any]]:
    """Calculate independent policy truths and break-even data for one world."""
    chosen_sellers = worst_sellers(seller_stats(seller_order_data), 10, 20)
    avoided, gmv_lost = probation_truth(
        seller_order_data, chosen_sellers, TRUE["absorbed_share"]
    )
    probation_value = true_delta(avoided, gmv_lost, TRUE["take_rate"], TRUE["late_cost"])
    truth = {"do nothing": 0.0, "probation: worst 10 sellers": probation_value}
    for pad_days in (3, 7):
        promise_avoided, promise_gmv_lost = promise_truth(
            orders, SLOW_STATES, pad_days, TRUE["conversion_loss"]
        )
        label = f"promise +{pad_days}d, " + "/".join(SLOW_STATES)
        truth[label] = true_delta(
            promise_avoided,
            promise_gmv_lost,
            TRUE["take_rate"],
            TRUE["late_cost"],
        )

    probation_summary = probation_facts(seller_order_data, chosen_sellers)
    engine_break_even = breakeven_late_cost(
        probation_summary, TRUE["take_rate"], TRUE["absorbed_share"]
    )
    truth_break_even = (
        TRUE["take_rate"] * gmv_lost / avoided
        if avoided > 0
        else float("inf")
    )
    recall = (
        len(set(bad_sellers).intersection(chosen_sellers)) / len(bad_sellers)
        if bad_sellers
        else None
    )
    details = {
        "chosen_sellers": chosen_sellers,
        "planted_seller_recall": recall,
        "probation_breakeven_engine": engine_break_even,
        "probation_breakeven_truth": truth_break_even,
    }
    return truth, details


def build_comparison(
    kind: str,
    engine: pd.DataFrame,
    truth: dict[str, float],
    details: dict[str, Any],
) -> dict[str, Any]:
    """Compare engine deltas and rankings against truth for a synthetic world."""
    engine_values = dict(zip(engine["scenario"], engine["expected"]))
    policy_results = []
    relative_errors = []
    for policy, true_value in truth.items():
        engine_value = float(engine_values[policy])
        difference = abs(engine_value - true_value)
        tolerance = max(0.05 * abs(true_value), 500.0)
        passed = difference <= tolerance
        relative_error = difference / abs(true_value) if true_value else (0.0 if difference == 0 else float("inf"))
        relative_errors.append(relative_error)
        policy_results.append(
            {
                "policy": policy,
                "engine": engine_value,
                "truth": true_value,
                "difference": difference,
                "tolerance": tolerance,
                "passed": passed,
                "relative_error": relative_error,
            }
        )
    engine_winner = str(engine.loc[engine["expected"].idxmax(), "scenario"])
    true_winner = max(truth, key=truth.get)
    engine_break_even = details["probation_breakeven_engine"]
    truth_break_even = details["probation_breakeven_truth"]
    both_infinite = np.isinf(engine_break_even) and np.isinf(truth_break_even)
    break_even_passed = both_infinite or (
        np.isfinite(engine_break_even)
        and np.isfinite(truth_break_even)
        and (
            engine_break_even == truth_break_even
            if truth_break_even == 0
            else abs(engine_break_even - truth_break_even) / abs(truth_break_even) <= 0.05
        )
    )
    return {
        "world": kind,
        "policies": policy_results,
        "engine_winner": engine_winner,
        "true_winner": true_winner,
        "ranking_passed": engine_winner == true_winner,
        "all_policy_deltas_passed": all(item["passed"] for item in policy_results),
        "planted_seller_recall": details["planted_seller_recall"],
        "probation_breakeven_engine": engine_break_even,
        "probation_breakeven_truth": truth_break_even,
        "probation_breakeven_passed": bool(break_even_passed),
        "max_relative_error": max(relative_errors, default=0.0),
        "overall_passed": (
            all(item["passed"] for item in policy_results)
            and engine_winner == true_winner
            and bool(break_even_passed)
        ),
    }


def evaluate_world(kind: str) -> dict[str, Any]:
    """Evaluate the scenario engine and truth model for one synthetic world."""
    orders, items, bad_sellers = make_world(kind)
    seller_order_data = seller_orders(items)
    engine = evaluate_engine(orders, seller_order_data)
    truth, details = calculate_truth(orders, seller_order_data, bad_sellers)
    result = build_comparison(kind, engine, truth, details)
    result["engine_table"] = engine.to_dict(orient="records")
    return result


def json_safe(value: Any) -> Any:
    """Replace non-finite floats with readable strings for strict JSON output."""
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, (float, np.floating)) and not np.isfinite(value):
        return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, np.generic):
        return value.item()
    return value


def print_world_table(result: dict[str, Any]) -> None:
    """Print engine versus truth results for one world."""
    table = pd.DataFrame(result["policies"])
    print(f"\n{result['world']} | engine winner: {result['engine_winner']} | true winner: {result['true_winner']}")
    print(table[["policy", "engine", "truth", "passed"]].to_string(index=False))
    print(
        "probation break-even:",
        result["probation_breakeven_engine"],
        "(engine) vs",
        result["probation_breakeven_truth"],
        "(truth); passed:",
        result["probation_breakeven_passed"],
    )
    print("planted-seller recall:", result["planted_seller_recall"])


def main() -> None:
    """Run all synthetic worlds, print comparisons, and save JSON results."""
    results = [evaluate_world(kind) for kind in ("seller_driven", "carrier_driven", "neutral")]
    for result in results:
        print_world_table(result)
    ranking_count = sum(result["ranking_passed"] for result in results)
    errors = [result["max_relative_error"] for result in results]
    max_error = max(errors, default=0.0)
    recalls = [
        result["planted_seller_recall"]
        for result in results
        if result["planted_seller_recall"] is not None
    ]
    mean_recall = float(np.mean(recalls)) if recalls else float("nan")
    print(
        f"\nworlds with correct ranking: {ranking_count}/3 | "
        f"max relative error: {max_error:.2%} | planted-seller recall: {mean_recall:.0%}"
    )
    RESULTS_PATH.write_text(
        json.dumps(json_safe(results), indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
