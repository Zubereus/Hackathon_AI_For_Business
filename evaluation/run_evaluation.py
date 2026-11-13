"""CLI entrypoint to run the Multi-Agent User Simulation & Evaluation System."""

from __future__ import annotations

import argparse
import os
import sys

from evaluation.evaluator.evaluation_engine import EvaluationEngine
from evaluation.simulator.interaction_manager import InteractionManager
from evaluation.simulator.whatif_client import WhatIfHttpClient, WhatIfServerHarness


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Multi-Agent User Simulation System against What-If AI."
    )
    parser.add_argument(
        "--mode",
        choices=("reproducible", "live"),
        default="reproducible",
        help="reproducible = offline seeded runs without external LLM variance; live = LLM user simulation + judge.",
    )
    parser.add_argument("--seed", type=int, default=42, help="Deterministic random seed.")
    parser.add_argument(
        "--base-url",
        default=None,
        help="Existing Go Gateway URL (e.g. http://127.0.0.1:8080). Omit with --boot-servers to spawn isolated servers.",
    )
    parser.add_argument(
        "--boot-servers",
        action="store_true",
        help="Automatically build engine-go and launch isolated ml-py + engine-go subprocesses.",
    )
    args = parser.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    results_dir = os.path.join(os.path.dirname(__file__), "results")
    use_live = args.mode == "live"

    def _execute(client: WhatIfHttpClient) -> int:
        manager = InteractionManager(
            client=client,
            seed=args.seed,
            use_llm_users=use_live,
            conversations_dir=os.path.join(results_dir, "conversations"),
        )
        print(f"[eval] Running 3 independent user agents (mode={args.mode}, seed={args.seed})...")
        run_out = manager.run_all(save_transcripts=True)
        print(
            f"[eval] Completed {len(run_out['sessions'])} multi-turn sessions; saved {len(run_out['saved_files'])} transcript files."
        )

        engine = EvaluationEngine(use_llm_judge=use_live)
        report = engine.evaluate(
            sessions=run_out["sessions"],
            products_by_dataset=run_out["products_by_dataset"],
            seed=args.seed,
            output_dir=results_dir,
        )
        obj = report["objective_metrics"]
        print(
            f"[eval] Objective summary: turns={obj['total_turns']}, math_acc={obj['math_identity_pass_rate']:.1%}, "
            f"grounding={obj['number_grounding_pass_rate']:.1%}, non_price_misinterpret={obj['non_price_scope_misinterpretation_count']}, "
            f"weaknesses={len(report['detected_weaknesses'])}"
        )
        for aid, ev in report["agent_evaluations"].items():
            print(
                f"[eval] {aid}: weighted={ev['weighted_persona_score']:.2f}/10 "
                f"(usability={ev['dimensions']['usability']}, accuracy={ev['dimensions']['numerical_accuracy']}, "
                f"reasoning={ev['dimensions']['reasoning_quality']}, robustness={ev['dimensions']['robustness']})"
            )
        print(f"[eval] Reports saved to {report['report_files']['markdown']} and {report['report_files']['json']}")
        return 0

    if args.boot_servers or not args.base_url:
        print("[eval] Booting isolated ml-py + engine-go black-box target...")
        with WhatIfServerHarness(repo_root=repo_root, offline_llm=not use_live) as client:
            return _execute(client)
    else:
        return _execute(WhatIfHttpClient(base_url=args.base_url))


if __name__ == "__main__":
    sys.exit(main())

