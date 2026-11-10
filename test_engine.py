"""Validation & Verification Engine for What-If AI.

Benchmarks the What-If simulation engine against ground-truth parameters
across all synthetic retail datasets. Verifies whether:
    1. The statistical scenario interval [Pessimistic, Optimistic] covers the
       true commercial profit.
    2. The expected scenario correctly predicts profit direction (increase vs decrease).
    3. The absolute percentage point deviation between expected and true profit
       remains within acceptable tolerances.

Strict Rules Applied:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: All evaluation metrics computed via NumPy/Pandas.
    - Deterministic execution via explicit random_state.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

import whatif_engine as w


DEFAULT_N_BOOT_FOR_TEST: int = 200
DEFAULT_EVAL_SEED: int = 1


def find_datasets_directory(custom_path: Optional[str] = None) -> str:
    """Locate the root directory containing the evaluation datasets.

    Searches candidates in order:
        1. Explicit custom_path if provided.
        2. Local directory 'datasets' in current working directory.
        3. 'data/synthetic_data/synthetic_data/datasets'.
        4. 'data/datasets'.

    Args:
        custom_path: Optional user-specified path to datasets directory.

    Returns:
        str: Absolute or verified path to existing datasets directory.

    Raises:
        FileNotFoundError: If no valid datasets directory can be found.
    """
    if custom_path and os.path.isdir(custom_path):
        return os.path.abspath(custom_path)

    candidates = [
        "datasets",
        os.path.join("data", "synthetic_data", "synthetic_data", "datasets"),
        os.path.join("data", "datasets"),
    ]

    for candidate in candidates:
        if os.path.isdir(candidate):
            return os.path.abspath(candidate)

    raise FileNotFoundError(
        "Could not find 'datasets' directory. Please provide --datasets-dir or place "
        "data in 'data/synthetic_data/synthetic_data/datasets'."
    )


def evaluate_product(
    df_product: pd.DataFrame,
    true_elasticity: float,
    price_change: float,
    random_state: Optional[Union[int, np.random.Generator]] = None,
    n_boot: int = DEFAULT_N_BOOT_FOR_TEST,
) -> Dict[str, Union[bool, float, str]]:
    """Evaluate whether scenario bounds contain true profit for a single product.

    Args:
        df_product: Historical sales data for one product.
        true_elasticity: True latent price elasticity from ground_truth.csv.
        price_change: Fractional price change tested (e.g. +0.10 or -0.10).
        random_state: Seed or NumPy Generator for reproducible bootstrap estimation.
        n_boot: Number of bootstrap iterations for elasticity distribution.

    Returns:
        Dict[str, Union[bool, float, str]]: Dictionary with metrics:
            - 'in_range': True if true profit is between pessimistic and optimistic.
            - 'direction_ok': True if predicted direction matches true profit direction.
            - 'abs_error_pct_points': Absolute error of expected profit vs truth as % of baseline.
            - 'product_id': Identifier of evaluated product.
    """
    rng = w.get_rng(random_state)
    point, samples, _ = w.estimate_elasticity(
        df=df_product, random_state=rng, method="poisson", n_boot=n_boot
    )
    base = w.build_baseline(df=df_product, point_elasticity=point)
    scenarios = w.four_scenarios(
        base=base,
        price_change=price_change,
        e_samples=samples,
        point_elasticity=point,
    )

    candidate_profits = [
        float(scenarios[name]["profit"])  # type: ignore[arg-type]
        for name in ("optimistic", "expected", "pessimistic")
    ]
    base_profit = float(scenarios["baseline"]["profit"])  # type: ignore[arg-type]
    expected_profit = float(scenarios["expected"]["profit"])  # type: ignore[arg-type]

    # Calculate the true outcome using the secret ground-truth elasticity
    true_outcome = w.outcomes(
        base=base, price_change=price_change, elasticity=true_elasticity
    )
    true_profit = float(true_outcome["profit"])

    # Verification checks
    in_range = bool(min(candidate_profits) <= true_profit <= max(candidate_profits))
    direction_ok = bool(
        np.sign(true_profit - base_profit) == np.sign(expected_profit - base_profit)
    )

    denom = abs(base_profit) if abs(base_profit) > 1e-6 else 1.0
    abs_error_pct_points = float(abs(expected_profit - true_profit) / denom * 100.0)

    prod_id = str(df_product["product_id"].iloc[0])
    return {
        "product_id": prod_id,
        "in_range": in_range,
        "direction_ok": direction_ok,
        "abs_error_pct_points": abs_error_pct_points,
    }


def evaluate_dataset(
    folder_path: str,
    price_change: float,
    random_state: Optional[Union[int, np.random.Generator]] = None,
    n_boot: int = DEFAULT_N_BOOT_FOR_TEST,
) -> pd.DataFrame:
    """Run verification checks on all products within a specific dataset folder.

    Args:
        folder_path: Path to dataset folder containing 'sales_synthetic_vn.csv' and 'ground_truth.csv'.
        price_change: Fractional price change tested.
        random_state: Seed or NumPy Generator for reproducible evaluation.
        n_boot: Number of bootstrap iterations.

    Returns:
        pd.DataFrame: Evaluation records for all products in the dataset.

    Raises:
        FileNotFoundError: If required CSV files are missing in folder_path.
    """
    sales_file = os.path.join(folder_path, "sales_synthetic_vn.csv")
    truth_file = os.path.join(folder_path, "ground_truth.csv")

    if not os.path.isfile(sales_file) or not os.path.isfile(truth_file):
        raise FileNotFoundError(
            f"Required files ('sales_synthetic_vn.csv', 'ground_truth.csv') missing in: {folder_path}"
        )

    sales = pd.read_csv(sales_file)
    truth = (
        pd.read_csv(truth_file)
        .set_index("product_id")["true_elasticity"]
        .to_dict()
    )

    rng = w.get_rng(random_state)
    records: List[Dict[str, Any]] = []

    for pid, group in sales.groupby("product_id"):
        pid_str = str(pid)
        if pid_str not in truth:
            continue
        eval_result = evaluate_product(
            df_product=group,
            true_elasticity=float(truth[pid_str]),
            price_change=price_change,
            random_state=rng,
            n_boot=n_boot,
        )
        records.append(eval_result)

    return pd.DataFrame(records)


def run_full_benchmark(
    datasets_dir: str,
    price_changes: Tuple[float, ...] = (0.10, -0.10),
    random_state: Optional[Union[int, np.random.Generator]] = DEFAULT_EVAL_SEED,
    n_boot: int = DEFAULT_N_BOOT_FOR_TEST,
) -> pd.DataFrame:
    """Run full benchmark across all discovered subdirectories in datasets_dir.

    Args:
        datasets_dir: Root directory containing dataset subfolders.
        price_changes: Tuple of price changes to test. Defaults to (+10%, -10%).
        random_state: Seed or generator for deterministic benchmark runs.
        n_boot: Number of bootstrap iterations.

    Returns:
        pd.DataFrame: Summary benchmark table containing dataset name, coverage,
            directional accuracy, and mean error points.
    """
    dataset_names = sorted([
        d for d in os.listdir(datasets_dir)
        if os.path.isdir(os.path.join(datasets_dir, d))
        and os.path.isfile(os.path.join(datasets_dir, d, "sales_synthetic_vn.csv"))
    ])

    summary_rows: List[Dict[str, Any]] = []

    for name in dataset_names:
        folder = os.path.join(datasets_dir, name)
        for change in price_changes:
            res_df = evaluate_dataset(
                folder_path=folder,
                price_change=change,
                random_state=random_state,
                n_boot=n_boot,
            )
            if res_df.empty:
                continue

            coverage = float(res_df["in_range"].mean())
            direction_acc = float(res_df["direction_ok"].mean())
            mean_err = float(res_df["abs_error_pct_points"].mean())

            summary_rows.append({
                "dataset": name,
                "price_change": f"{change:+.0%}",
                "products": len(res_df),
                "truth_in_scenario_range": f"{coverage:.0%}",
                "direction_correct": f"{direction_acc:.0%}",
                "mean_profit_error_pts": round(mean_err, 2),
            })

    return pd.DataFrame(summary_rows)


def main() -> None:
    """Command-line entrypoint for the verification and benchmark engine."""
    parser = argparse.ArgumentParser(
        description="What-If AI: Ground-Truth Verification & Scenario Benchmark Engine"
    )
    parser.add_argument(
        "--datasets-dir",
        type=str,
        default=None,
        help="Custom path to directory containing dataset subfolders",
    )
    parser.add_argument(
        "--n-boot",
        type=int,
        default=DEFAULT_N_BOOT_FOR_TEST,
        help="Bootstrap iterations per product evaluation",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_EVAL_SEED,
        help="Random seed for reproducible evaluation",
    )
    args = parser.parse_args()

    try:
        data_dir = find_datasets_directory(args.datasets_dir)
    except FileNotFoundError as err:
        print(f"Error: {err}", file=sys.stderr)
        sys.exit(1)

    print(f"\nRunning Ground-Truth Benchmark against: {data_dir}")
    print(f"Bootstrap iterations: {args.n_boot} | Seed: {args.seed}")
    print("-" * 80)

    summary_df = run_full_benchmark(
        datasets_dir=data_dir,
        random_state=args.seed,
        n_boot=args.n_boot,
    )

    if summary_df.empty:
        print("No valid datasets evaluated.")
        return

    print(summary_df.to_string(index=False))
    print("-" * 80)
    print("Definitions:")
    print("  truth_in_scenario_range: % of products where true profit falls inside [pessimistic, optimistic]")
    print("  direction_correct: % of products where expected scenario correctly predicts profit up/down")
    print("  mean_profit_error_pts: |expected profit - true profit| as % of baseline profit\n")


if __name__ == "__main__":
    main()
