# Multi-Agent User Simulation & Evaluation System (`evaluation/`)

Independent black-box evaluation framework for **What-If AI**. Runs three distinct simulated retail users against the observable HTTP endpoints of the live What-If Agent (`POST /api/elasticity/fit`, `/api/nlq/parse`, `/api/simulate`, `/api/optimize`, `/api/nlq/explain`) without modifying or accessing internal application state.

## Architecture

- **`agents/`**: Three independent persona implementations (`NonTechnicalOwnerAgent`, `SkepticalOwnerAgent`, `StrategicDecisionMakerAgent`) inheriting `BaseUserAgent`.
- **`prompts/`**: Persona system prompts defining expectations, vocabulary tolerance, and failure triggers.
- **`simulator/`**:
  - `whatif_client.py`: Strictly observable HTTP client + optional `WhatIfServerHarness` launcher.
  - `conversation_controller.py`: Adaptive multi-turn conversation loop (`accept`, `follow_up`, `challenge_assumption`, `request_clarification`, `explore_alternative`, `stop`).
  - `interaction_manager.py`: Loads real ground-truth synthetic stores (`fashion_shop_12`, `hard_low_price_variation_8`) and stores raw conversation JSONs.
- **`evaluator/`**:
  - `scoring.py`: Deterministic objective verifiers (profit formula identity, scenario ordering, number grounding, out-of-bounds rejection, low-variation warning checks, non-price scope misinterpretation detection, jargon hits) and persona-weighted 9-dimension scoring.
  - `evaluation_engine.py`: Separates objective metrics from subjective persona judgments and emits `evaluation_report.json` + `evaluation_report.md`.

## Quick Run

```powershell
# Reproducible offline evaluation (boots isolated ml-py + engine-go automatically):
python -m evaluation.run_evaluation --mode reproducible --seed 42 --boot-servers

# Attach to an already-running What-If gateway at :8080:
python -m evaluation.run_evaluation --mode reproducible --seed 42 --base-url http://127.0.0.1:8080

# Live LLM user simulation + judge (requires API key in .env / environment):
python -m evaluation.run_evaluation --mode live --seed 42 --boot-servers

# Run evaluation framework unit tests:
python -m pytest evaluation/tests -q
```

