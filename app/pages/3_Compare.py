"""Compare delivery and seller policies under editable assumptions."""

import json

import altair as alt
import numpy as np
import pandas as pd
import streamlit as st

from app.helpers import load_data, promise_vs_probation_grid
from src.llm.client import complete
from src.llm.narrator import build_facts, template_brief, write_brief
from src.scenarios.compare import compare_policies


def highlight_best_row(row: pd.Series, best_scenario: str) -> list[str]:
    """Highlight the scenario with the highest expected value."""
    style = (
        "background-color: #d9ead3; color: black"
        if row["scenario"] == best_scenario
        else ""
    )
    return [style] * len(row)


def style_winner_column(column: pd.Series) -> pd.Series:
    """Color each sensitivity-grid cell by its winning policy."""
    colors = {
        "promise": "background-color: #cfe2f3; color: #111",
        "probation": "background-color: #d9ead3; color: #111",
        "do nothing": "background-color: #eeeeee; color: #111",
    }
    return column.map(
        lambda winner: colors.get(
            winner, "background-color: #ffffff; color: #111"
        )
    )


def main() -> None:
    """Render the policy comparison page."""
    st.set_page_config(page_title="Compare policies", layout="wide")
    st.title("Compare policies")

    orders, seller_orders_df = load_data()
    available_states = sorted(orders["customer_state"].dropna().unique().tolist())

    observed_group = st.sidebar.container()
    assumptions_group = st.sidebar.container()
    with assumptions_group:
        st.header("Assumptions (editable)")
        take_rate = st.slider(
            "Take rate",
            min_value=0.05,
            max_value=0.30,
            value=0.10,
            step=0.01,
            format="%.2f",
        )
        late_cost_range = st.slider(
            "Cost of one late order (R$)",
            min_value=0,
            max_value=100,
            value=(0, 60),
            step=5,
        )
        absorbed_range = st.slider(
            "Share of removed seller volume absorbed by others",
            min_value=0.3,
            max_value=1.0,
            value=(0.5, 0.9),
            step=0.05,
            format="%.2f",
        )
        conversion_loss_range = st.slider(
            "Conversion loss from a longer promise",
            min_value=0.0,
            max_value=0.20,
            value=(0.0, 0.10),
            step=0.01,
            format="%.2f",
        )
        default_states = [
            state for state in ["MA", "ES", "BA"] if state in available_states
        ]
        promise_states = st.multiselect(
            "Promise states",
            options=available_states,
            default=default_states,
        )
        pad_days_options = st.multiselect(
            "Pad days",
            options=[3, 5, 7, 10],
            default=[3, 7],
        )
        probation_ks = st.multiselect(
            "Probation sizes",
            options=[5, 10, 30],
            default=[10],
        )

    selected_orders = orders[
        orders["customer_state"].isin(promise_states)
    ] if promise_states else orders.iloc[0:0]
    total_orders = len(orders)
    overall_late_rate = float((orders["delay_days"] > 0).mean()) if total_orders else 0.0
    with observed_group:
        st.header("Observed from data")
        st.metric("Delivered orders", f"{total_orders:,}")
        st.metric("Overall late rate", f"{overall_late_rate:.1%}")
        st.caption(
            f"Selected promise states: {len(selected_orders):,} orders · "
            f"R${selected_orders['gmv'].sum():,.0f} GMV"
        )

    if not promise_states:
        st.warning("Select at least one promise state to include delivery-promise scenarios.")
    if not pad_days_options:
        st.warning("Select at least one pad-day option to include delivery-promise scenarios.")
    if not probation_ks:
        st.warning("Select at least one probation size to include seller-probation scenarios.")

    comparison = compare_policies(
        orders,
        seller_orders_df,
        thresholds=[],
        probation_ks=probation_ks,
        take_rate=take_rate,
        absorbed_range=tuple(absorbed_range),
        late_cost_range=tuple(late_cost_range),
        n_draws=3000,
        seed=42,
        promise_states=promise_states or None,
        pad_days_options=pad_days_options if promise_states else None,
        conversion_loss_range=tuple(conversion_loss_range),
    )
    visible_columns = [
        "scenario",
        "expected",
        "p10",
        "p90",
        "p_loss",
        "p_best",
        "breakeven",
    ]
    display_data = comparison[visible_columns].copy()
    best_scenario = str(comparison.loc[comparison["expected"].idxmax(), "scenario"])
    table_style = display_data.style.format(
        {
            "expected": "R${:,.0f}",
            "p10": "R${:,.0f}",
            "p90": "R${:,.0f}",
            "p_loss": "{:.1%}",
            "p_best": "{:.1%}",
        }
    ).apply(highlight_best_row, axis=1, best_scenario=best_scenario)

    st.subheader("Scenario results")
    st.dataframe(table_style, hide_index=True, width="stretch")

    st.subheader("Expected value and 10th–90th percentile range")
    chart = alt.layer(
        alt.Chart(comparison)
        .mark_bar(color="#4c78a8")
        .encode(
            y=alt.Y("scenario:N", sort="-x", title=None),
            x=alt.X("expected:Q", title="Expected change in contribution (R$)"),
            tooltip=["scenario:N", "expected:Q", "p10:Q", "p90:Q"],
        ),
        alt.Chart(comparison)
        .mark_rule(color="#222222", strokeWidth=1)
        .encode(
            y=alt.Y("scenario:N", sort="-x"),
            x=alt.X("p10:Q"),
            x2="p90:Q",
        ),
    ).properties(height=max(180, 42 * len(comparison)))
    st.altair_chart(chart, width="stretch")

    st.subheader("What this means")
    best_row = comparison.loc[comparison["scenario"] == best_scenario].iloc[0]
    st.write(
        f"**{best_scenario}** has the highest expected value under the assumptions shown, "
        f"with a {best_row['p_loss']:.1%} probability of losing money."
    )
    st.write(
        "This ranking depends on the assumption ranges in the sidebar; move the "
        "cost-of-a-late-order or conversion-loss sliders to see it change."
    )
    if best_row["p10"] < 0:
        st.write("It can lose money in the low end of the assumption range.")
    for row in comparison.itertuples(index=False):
        breakeven = (
            "n/a"
            if row.scenario == "do nothing" and row.breakeven == "-"
            else row.breakeven
        )
        st.write(f"- **{row.scenario}:** break-even {breakeven}.")

    if promise_states and pad_days_options and probation_ks:
        promise_scenarios = {
            f"promise +{pad}d, {'/'.join(promise_states)}": pad
            for pad in pad_days_options
        }
        selected_promise_results = comparison[
            comparison["scenario"].isin(promise_scenarios)
        ]
        default_pad = (
            promise_scenarios[selected_promise_results.iloc[0]["scenario"]]
            if not selected_promise_results.empty
            else pad_days_options[0]
        )
        pad = st.selectbox(
            "Promise option",
            options=pad_days_options,
            index=pad_days_options.index(default_pad),
            format_func=lambda value: f"promise +{value}d",
        )
        k = st.selectbox(
            "Probation option",
            options=probation_ks,
            index=0,
            format_func=lambda value: f"worst {value} sellers",
        )
        mid_absorbed = sum(absorbed_range) / 2
        st.subheader("What would flip the ranking")
        st.caption(
            f"Compares promise +{pad}d in {'/'.join(promise_states)} against "
            f"probation of the worst {k} sellers, using take rate "
            f"{take_rate:.2f} and an absorbed share of {mid_absorbed:.2f}."
        )
        sensitivity = promise_vs_probation_grid(
            orders,
            seller_orders_df,
            promise_states,
            pad,
            k,
            take_rate,
            mid_absorbed,
            np.arange(0, 61, 10),
            np.arange(0.0, 0.1001, 0.01),
        )
        winner_table = sensitivity.pivot(
            index="late_cost",
            columns="conversion_loss",
            values="winner",
        )
        winner_table.columns = [f"{value:.0%}" for value in winner_table.columns]
        winner_table.index.name = "Late-order cost (R$)"
        winner_table.columns.name = "Conversion loss"
        st.dataframe(
            winner_table.style.apply(style_winner_column, axis=0),
            width="stretch",
        )
    else:
        st.subheader("What would flip the ranking")
        st.caption(
            "Choose at least one promise state, pad-day option, and probation size "
            "to view the sensitivity grid."
        )

    st.info(
        "Delivery-promise padding only relabels lateness; it assumes customers "
        "judge delivery against the promise. Treat it as lower-evidence than "
        "seller probation."
    )
    st.download_button(
        "Download comparison as CSV",
        data=comparison.to_csv(index=False).encode("utf-8"),
        file_name="decisiondesk_policy_comparison.csv",
        mime="text/csv",
    )

    st.subheader("Decision brief")
    language = st.selectbox("Language", ["English", "Vietnamese"])
    assumptions = {
        "take_rate": take_rate,
        "late_cost_range": late_cost_range,
        "absorbed_range": absorbed_range,
        "conversion_loss_range": conversion_loss_range,
        "promise_states": promise_states,
        "pad_days_options": pad_days_options,
        "probation_sizes": probation_ks,
        "thresholds": [],
    }
    observed = {
        "delivered_orders": total_orders,
        "overall_late_rate": overall_late_rate,
        "selected_state_orders": len(selected_orders),
        "selected_state_gmv": float(selected_orders["gmv"].sum()),
    }
    facts = build_facts(comparison, assumptions, observed)
    with st.expander("Evidence (facts sent to the model)"):
        st.json(json.loads(json.dumps(facts)))

    if st.button("Write decision brief"):
        with st.spinner("Writing decision brief with local Ollama…"):
            try:
                result = write_brief(facts, complete, language)
            except RuntimeError as error:
                st.error(str(error))
                result = {
                    "text": template_brief(facts),
                    "source": "template",
                    "verdict": {"ok": False, "checked": 0, "unsupported": []},
                    "raw_text": "",
                    "attempts": [],
                    "error": str(error),
                }
        st.write(result["text"])
        if result["verdict"]["ok"] and result["source"] == "model":
            st.caption(
                f"All {result['verdict']['checked']} numbers traced to the table"
            )
        elif result["source"] == "template":
            st.caption("Model output was rejected, showing a template")
            with st.expander("Debug: why was the model rejected?"):
                raw_text = result.get("raw_text", "")
                attempts = result.get("attempts", [])
                if result.get("error"):
                    st.error(f"Model request failed: {result['error']}")
                if raw_text or attempts:
                    st.text("Last model output:")
                    st.code(raw_text or "(empty response)")
                    for attempt_number, verdict in enumerate(attempts, start=1):
                        st.write(
                            f"Attempt {attempt_number} unsupported numbers: "
                            f"{verdict['unsupported']}"
                        )
                elif not result.get("error"):
                    st.warning(
                        "No model output or validation attempts were recorded. "
                        "This may be a stale Streamlit process; stop it with "
                        "Ctrl+C and restart using "
                        "`python -m streamlit run app/main.py`."
                    )


main()
