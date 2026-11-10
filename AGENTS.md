# AGENTS.md — rules every coding agent must follow (Copilot, Antigravity, others)

Project: **What-If AI** — a decision-simulation tool for retailers. User uploads a sales CSV → column mapping →
price-elasticity estimate with uncertainty → Monte Carlo what-if scenarios → "Reverse What-If" optimizer.
Context: 2-person student hackathon (AI for Business Innovation). Submission deadline 13/11/2026 23:59, final pitch 19/11/2026.

## How you work (every task)
1. Read this file, then the phase file you were pointed to (`phases/PHASE_N_*.md`). The phase file is the scope. Do not do work from other phases.
2. Before writing code, print a SHORT plan: files you will create/edit and the tests you will run. Then implement.
3. Touch only the paths listed under "Allowed paths" in the phase file. If you need a change elsewhere (especially `contracts/`), STOP and tell the human.
4. Finish by running the phase's acceptance tests and pasting the real output. Never claim a test passed without running it.
5. Append a dated entry to the "Status log" at the bottom of the phase file (what was done, what is left, known issues).

## Golden rules (violating these fails the project)
- **The LLM never produces numbers.** LLM = (a) parse a question into JSON, (b) map ambiguous columns, (c) explain results that were computed by code. All figures come from the engine.
- **Label the data source everywhere.** Every chart/table/screen shows a badge: `SYNTHETIC` | `PUBLIC (M5/Dunnhumby)` | `YOUR DATA`. Never present synthetic or foreign public data as a Vietnamese company's real data.
- **No personal or proprietary data** in the repo, in prompts, or in logs. LLM calls receive column headers and at most 5 masked sample values per column — never raw rows. API keys live in `.env` (git-ignored).
- **Contracts first.** `contracts/` and `docs/ARCHITECTURE.md` are the interface between the Python service, the Go engine and the React app. Change them only with both owners' agreement.
- **Honest claims.** Elasticity is a *controlled observational estimate*, not proven causality. UI and slides say so. Never invent benchmark numbers; every number shown comes from a test run or a labelled assumption.
- **Determinism.** Every random process takes a seed and logs it. Same input + seed => same output (the Go engine must match the Python reference within tolerance).
- **Money** is integer VND inside the engine; format with thousand separators only at the UI edge. Foreign data converted with the configurable rate in `config/fx.json` and shown as "illustrative conversion".

## Style
- Python 3.12, type hints, `ruff` + `pytest`, pydantic v2 models for every API payload. Go 1.22+, `gofmt`, `go vet`, table-driven tests. React + TypeScript (strict), Vite, no UI library heavier than Tailwind + Recharts.
- English identifiers and comments. UI text in English (the pitch is English); keep strings in one `web/src/i18n.ts` so Vietnamese can be added.
- Small functions, no clever abstractions, no new dependency without writing the reason in the phase file's status log.
- Commits: `phase-N: <what>`. One PR per phase per owner.

## Repo layout
```
contracts/        JSON schemas + fixtures (shared truth)       docs/       ARCHITECTURE, ROADMAP, NLP mapping design
data/synthetic/   generator v2 + generated datasets            phases/     one markdown file per phase (your instructions)
data/public/      M5 / Dunnhumby loaders (raw files NOT committed)
ml-py/            FastAPI: ingest, mapping, elasticity, backtest, llm      engine-go/  Go: simulate, optimize, API gateway
web/              React app                                     slides/     pitch material
```

## Commands (keep these working)
```
make data        # python data/synthetic/make_synthetic_data_v2.py
make test        # pytest ml-py && go test ./... (in engine-go) && npm test (in web)
make dev         # ml-py :8000, engine-go :8080, web :5173
```
