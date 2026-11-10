# PHASE 0 — Foundation & contracts
Owner: **A + B together (pair, 2h)** · Sprint: Tue 10/11 evening · Depends on: nothing · Unblocks: everything

## Goal
Repo skeleton, contracts frozen, both services boot and answer `/health`, fixture loads in all three tiers. After this phase A and B work independently.

## Allowed paths
`contracts/**`, `docs/**`, `ml-py/app/main.py`, `ml-py/pyproject.toml`, `engine-go/**` (skeleton only), `web/**` (skeleton only), `Makefile`, `.github/**`

## Deliverables
1. `ml-py/`: FastAPI app, `GET /health`, pydantic models for every payload in `docs/ARCHITECTURE.md` (empty handlers returning 501).
2. `engine-go/`: `cmd/engine/main.go` with `GET /health`, request/response structs mirroring the contract, handlers returning 501.
3. `web/`: Vite + React + TS app, one page that fetches `/api/health` from the engine and shows the data-source badge component.
4. `contracts/*.schema.json` generated from the pydantic models (`ml-py/scripts/export_schemas.py`).
5. Go proxy: `/api/ingest/*`, `/api/elasticity/*`, `/api/nlq/*`, `/api/backtest` forward to ml-py (config via env `ML_URL`).

## Rules
- MUST: contract field names exactly as in `docs/ARCHITECTURE.md`. MUST NOT: add business logic in this phase.
- MUST: CORS allows `localhost:5173` only. Secrets only via `.env`.
- After this phase `contracts/` is FROZEN: any change needs both owners' OK and a note in `docs/ARCHITECTURE.md`.

## Acceptance tests
- `curl localhost:8000/health` and `curl localhost:8080/api/health` both return `{"status":"ok"}`; the web page shows both statuses.
- `make test` runs (even with 0 real tests) without error.
- `contracts/fixtures/elasticity_fixture.json` validates against the exported schema (a test proves it).

## Prompt for the agent
```
Read /AGENTS.md, /docs/ARCHITECTURE.md and /phases/PHASE_0_foundation.md. Task: implement PHASE 0 exactly.
First print a short plan (files + tests). Then create: (1) ml-py FastAPI skeleton with pydantic v2 models for every payload in ARCHITECTURE.md,
handlers return HTTP 501 except /health; (2) engine-go Go 1.22 skeleton with structs mirroring the contract, /api/health, and reverse-proxy
routes to ML_URL for /api/ingest, /api/elasticity, /api/nlq, /api/backtest; (3) web Vite+React+TS page that calls /api/health and renders a
DataSourceBadge component (SYNTHETIC | PUBLIC_M5 | PUBLIC_DUNNHUMBY | USER); (4) a script exporting JSON schemas into /contracts and a pytest
that validates contracts/fixtures/elasticity_fixture.json. Do not implement business logic. Run the acceptance tests and paste real output.
Append a status entry to the phase file.
```

## Status log
- 2026-11-10: Phase 0 skeleton implemented. Created ml-py FastAPI app with /health and Pydantic v2 schemas for all ARCHITECTURE.md payloads. Created engine-go cmd/engine/main.go with /api/health and reverse proxy to ML_URL. Created web React skeleton with DataSourceBadge and health checker. Exported JSON schemas to contracts/ and verified elasticity_fixture.json structure. Unblocks Phase 1 and Phase 4.
