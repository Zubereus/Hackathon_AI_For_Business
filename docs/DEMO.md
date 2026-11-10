# What-If AI — 3-Minute Live Demo Script & Fallback Playbook

## 1. Prerequisites & Startup (`make dev`)
Open three terminals from the repository root (`Hackathon_AI_For_Business`):

```bash
# Terminal 1 — Python ML Service (:8000)
cd ml-py && uvicorn app.main:app --port 8000

# Terminal 2 — Go Simulation & Gateway Engine (:8080)
cd engine-go && go run ./cmd/engine

# Terminal 3 — React Web UI (:5173)
cd web && npm run dev
```

Wait until both health endpoints return `{"status":"ok"}`:
- `http://localhost:8000/health`
- `http://localhost:8080/api/health`
Then open **`http://localhost:5173`** in Chrome or Edge.

---

## 2. Rehearsed 3-Minute Click Path

**Goal**: Show a store manager going from a messy real-world CSV to probabilistic counterfactual profit forecasts and reverse target pricing — with explicit data-source badges and zero LLM math.

| Time | Screen | Exact Action | What to Say to Judges |
|---|---|---|---|
| `0:00 – 0:25` | **1. Upload Data** | Drag-and-drop `data/synthetic/out/messy_variants/vn_headers_vn_numbers/input.csv` (has Vietnamese headers `Ngày bán`, `Giá bán (VNĐ)`, DD/MM/YYYY dates, and dot-grouped VND). *(Or click **Load Synthetic Shop Demo** for 1-click speed).* | *"Managers don't clean spreadsheets. We ingest messy Vietnamese CSVs directly and tag provenance on every screen (`YOUR DATA` / `SYNTHETIC`)."* |
| `0:25 – 0:55` | **2. Confirm Columns** | Verify green confidence bars (e.g. `Ngày bán -> date`, `Giá bán (VNĐ) -> price`) and 3 masked samples per column. Notice **Confirm** blocks automatically if a required field is dropped. Click **Confirm Mapping & Estimate Elasticity**. | *"NLP Hungarian assignment handles messy headers without sending raw customer rows to an LLM. Missing costs trigger an explicit margin % fallback."* |
| `0:55 – 1:25` | **3. Assumptions** | Inspect `P01 — Áo thun basic`: median elasticity `-1.19` with 90% bootstrap CI `[-1.32, -1.04]`, healthy signal vs warning chips. Leave stock cap unchecked for restocking. Click **Proceed to What-If Simulation**. | *"We disclose that elasticity is a controlled observational estimate from historical price variation — never fake causality."* |
| `1:25 – 2:15` | **4. What-If Simulation** | Type in the NLQ box: `"If I increase P01 price by 10% for the next 30 days?"` and click **Parse & Simulate Question**. Point to the **4 Scenario Cards** (`Base`, `Optimistic`, `Expected`, `Pessimistic`), **Monte Carlo Profit Distribution**, and **Break-Even Elasticity (`-2.42`)**. | *"The LLM only parses my question to validated JSON and echoes computed numbers back. Go runs 5,000 draws deterministically, showing ranges, not promises."* |
| `2:15 – 2:45` | **5. Reverse What-If** | Switch to Tab **5. Reverse What-If**. Set Objective = `Maximize P(Hit Profit Target)`, Target Uplift = `+10%`, Min Margin = `25%`, click **Find Optimal Prices**. Show the ranked feasible curve. | *"Managers can ask backwards: which price satisfies my profit target and margin guardrails with highest probability? Go evaluates 61 candidates in milliseconds (101x5,000 sims benchmarked at 38.8 ms)."* |
| `2:45 – 3:00` | **6. Validation** | Switch to Tab **6. Validation**. Point to synthetic recovery (`r = 0.960` on fashion shop, `100%` low-price-variation warning catch) and historical backtest (**18/19 = 94.7%** beating naive baseline). | *"We validate recovery, out-of-time backtests, and honest failure modes — ready for pilot testing."* |

---

## 3. Emergency Fallback Plan (Wi-Fi Off / Live LLM Down / Backend Down)

1. **Wi-Fi / LLM API key down during live pitch**:
   - Everything still works! Both Column Mapping (Hungarian dictionary/shape scorer) and NLQ Parse/Explain (`ml-py/app/llm/parse.py` and `explain.py`) automatically run deterministic local fallbacks whenever `OPENAI_API_KEY` / `GEMINI_API_KEY` is absent or network times out.
   - The **Manual Simulation Controls** right beside the NLQ box are always active.
2. **Backend process crash or single-laptop offline demo (`VITE_USE_FIXTURES=1`)**:
   - Either toggle **"Offline Fixtures"** directly in the top-right header pill inside the UI (or open `?demo=1` in the browser URL), OR launch `VITE_USE_FIXTURES=1 npm run dev` in `web/`.
   - All scenario cards, Monte Carlo histograms, and Reverse What-If curves render instantly from Go-precomputed `elasticity_fixture.json` snapshots with full disclosure banner.

## 4. Post-Freeze Backlog (New Ideas After Fri 14:00)
- Multi-SKU cross-elasticity cannibalization matrix
- Automated Dunnhumby CSV one-click downloader integration
- Vietnamese/English UI language switcher toggle consuming `web/src/i18n.ts`
