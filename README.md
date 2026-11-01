# DecisionDesk

An AI copilot for a marketplace operations lead. It diagnoses late deliveries, then
compares delivery and freight policies under uncertainty **before** money is spent.

> **Status: draft for team review.** The plan below is a proposal. Nothing here is
> final until we have discussed it (see [Decisions needed](#decisions-needed-from-the-team)).

## The idea in one paragraph

Dashboards tell an operator what happened but cannot compare options. DecisionDesk
answers "why are orders late?" and then ranks candidate policies (seller probation,
free-freight thresholds, longer delivery promises) with explicit assumptions, ranges
and break-even points, always including a "do nothing" option.

Design rules:

1. **The LLM never calculates.** It routes questions, writes SQL or scenario specs and
   explains results. Every number comes from plain Python or SQL.
2. **Observed and assumed are labelled differently.** Anything the data cannot tell us
   (take rate, cost of a late order, order uplift) is an editable assumption, never a
   hardcoded value.
3. **Every number is traceable** to a query or a function.

## Data

[Olist Brazilian E-Commerce](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)
(Kaggle), about 100k orders from 2016 to 2018 across 9 CSV files.

- The raw CSVs are **not committed**. Download them from Kaggle into `data/raw/`.
- Kaggle lists the dataset license as
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Review its
  terms before publishing or using the dataset commercially.
- We analyse delivered orders from Jan 2017 to Aug 2018 (`sql/fct_orders.sql`).

## Quick start

```bash
pip install -r requirements.txt

# 1. put the Olist CSVs in data/raw/ (file names as downloaded from Kaggle)
# 2. build the database and views
python -m src.data.load

# 3. sanity-check the views
python -m src.data.checks

# 4. compare policies on the real data
python run_demo.py

# 5. run the unit tests and the planted-data evaluation
python -m pytest -q tests
python -m eval.run_scenario_eval
```

## What exists today

| Area | Files | State |
|---|---|---|
| Data layer | `src/data/load.py`, `queries.py`, `checks.py`, `sql/*.sql` | Working on real Olist data |
| Diagnosis | `src/tools/diagnose.py`, `impact.py` | Working: stage breakdown by month and state, review score by delay |
| Scenarios | `src/scenarios/` freight, seller probation, delivery promise, Monte Carlo, comparison, sensitivity | Working, unit-tested |
| Evaluation | `eval/synthetic_data.py`, `run_scenario_eval.py` | Working: planted-data check |
| Tests | `tests/` | Passing |

**Not built yet:** text-to-SQL agent and guardrails, LLM router/narrator/critic,
Streamlit UI, the golden question set, demo video and slides.

## Early findings (to be confirmed by the team)

On real Olist data (96,203 delivered orders, Jan 2017 to Aug 2018):

- Lateness is **spiky, not steadily rising**: about 12% in Nov 2017 and 14% to 19% in
  Feb and Mar 2018, but low in most other months. The latest months may look better
  than they were because slow, still-undelivered orders are missing from the data.
- Being late is costly: mean review score is 4.29 on time, 3.29 when 1 to 3 days late,
  2.10 when 4 to 7 days late and 1.70 when 8+ days late (association, not causation).
- By state, handoff time is similar everywhere (about 3 days) while carrier transit
  varies from about 6 days (SP) to 18 to 20 days (MA, CE, PA).
- Under our placeholder assumptions, free-freight policies lose money in every
  tested configuration, and seller probation and a longer delivery promise pay only
  above break-even values for the cost of a late order and the order loss.

These results depend on assumptions (take rate 10 to 15%, cost per late order R$0 to
R$60, conversion loss 0 to 15%) that we made up as placeholders. **They are not
measured from the data.**

## Evaluation: planted-data check

`eval/run_scenario_eval.py` builds three synthetic marketplaces where we know the true
cause of lateness (bad sellers, slow carriers, or neither), simulates each policy's
true effect independently, and compares it with the engine.

Result: the engine picked the correct policy in 3 of 3 worlds, found all 10 planted bad
sellers, and matched the simulated outcome and probation break-even within about 1%.

What this shows: the implementation and the break-even algebra are correct. What it
does **not** show: that the model matches a real marketplace, since the simulation uses
the same economic model as the engine.

## Known limitations

- No cost, promotion or stock data in Olist; take rate and conversion effects are
  assumptions.
- Review data has selection bias; the data covers 2016 to 2018 only.
- Padding the delivery promise only relabels lateness; it assumes customers judge
  delivery against the promise. Treat it as lower-evidence than seller probation.
- Per-state rescue counts are small for some states, so state rankings are noisy.

## Project layout

```
sql/            order-grain and item-grain views
src/data/       load CSVs into DuckDB, queries, sanity checks
src/tools/      diagnosis and impact table
src/scenarios/  policy scenarios, Monte Carlo, comparison, sensitivity
eval/           planted-data evaluation
tests/          unit tests
run_demo.py     runs the policy comparison on real data
```

## Decisions needed from the team

1. **Scope:** is the marketplace-operations decision the story we want to pitch?
2. **Assumption defaults:** take rate, cost of a late order, conversion-loss range.
3. **Scenario B (free freight):** keep as a negative finding, or drop it?
4. **Roles** for the remaining work: text-to-SQL and guardrails, LLM layer, Streamlit UI,
   slides and demo video.
5. **Scoring weights:** the contest summary and detail sections disagree on
   Feasibility and Presentation weights. We should ask the organizers.

## Deadline

Submission is due 13/11 at 23:59.