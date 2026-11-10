"""Explore historical delivery delays by month, state, and review impact."""

import altair as alt
import streamlit as st

from app.helpers import open_db
from src.tools.diagnose import flag_late_months, late_order_split, stage_breakdown
from src.tools.impact import delay_impact_table


def main() -> None:
    """Render the delivery diagnosis page."""
    st.set_page_config(page_title="Why are orders late?", layout="wide")
    st.title("Why are orders late?")

    connection = open_db()
    monthly = flag_late_months(stage_breakdown(connection, "month"))
    monthly_long = monthly.melt(
        id_vars=["month"],
        value_vars=["mean_handoff_days", "mean_transit_days"],
        var_name="stage",
        value_name="mean_days",
    )
    monthly_long["stage"] = monthly_long["stage"].map(
        {
            "mean_handoff_days": "Seller handoff",
            "mean_transit_days": "Carrier transit",
        }
    )

    st.subheader("Monthly late-order rate")
    late_rate_line = (
        alt.Chart(monthly)
        .mark_line(color="#4c78a8", point=True)
        .encode(
            x=alt.X("month:T", title="Month"),
            y=alt.Y("late_rate:Q", axis=alt.Axis(format="%"), title="Late-order rate"),
            tooltip=[
                alt.Tooltip("month:T", title="Month"),
                alt.Tooltip("late_rate:Q", format=".1%", title="Late rate"),
                alt.Tooltip("orders:Q", format=",", title="Orders"),
            ],
        )
    )
    anomaly_points = (
        alt.Chart(monthly[monthly["is_anomaly"]])
        .mark_point(color="#d62728", size=100, filled=True)
        .encode(
            x=alt.X("month:T"),
            y=alt.Y("late_rate:Q"),
            tooltip=[
                alt.Tooltip("month:T", title="Anomaly month"),
                alt.Tooltip("late_rate:Q", format=".1%", title="Late rate"),
                alt.Tooltip("z_score:Q", format=".2f", title="Z-score"),
            ],
        )
    )
    st.altair_chart(
        (late_rate_line + anomaly_points).properties(height=300),
        width="stretch",
    )

    st.subheader("Monthly time by delivery stage")
    monthly_stage_chart = (
        alt.Chart(monthly_long)
        .mark_line(point=True)
        .encode(
            x=alt.X("month:T", title="Month"),
            y=alt.Y("mean_days:Q", title="Mean days"),
            color=alt.Color("stage:N", title="Delivery stage"),
            tooltip=[
                alt.Tooltip("month:T", title="Month"),
                alt.Tooltip("stage:N", title="Stage"),
                alt.Tooltip("mean_days:Q", format=".1f", title="Mean days"),
            ],
        )
        .properties(height=300)
    )
    st.altair_chart(monthly_stage_chart, width="stretch")

    st.subheader("Delivery delays by customer state")
    states = stage_breakdown(connection, "customer_state")
    maximum_orders = int(states["orders"].max()) if not states.empty else 500
    minimum_orders = st.slider(
        "minimum orders per state",
        min_value=0,
        max_value=max(500, maximum_orders),
        value=500,
        step=100,
    )
    selected_states = (
        states[states["orders"] >= minimum_orders]
        .sort_values("late_rate", ascending=False)
        .reset_index(drop=True)
    )
    st.dataframe(
        selected_states,
        hide_index=True,
        width="stretch",
    )

    state_stages = selected_states.melt(
        id_vars=["customer_state"],
        value_vars=["mean_handoff_days", "mean_transit_days"],
        var_name="stage",
        value_name="mean_days",
    )
    state_stages["stage"] = state_stages["stage"].map(
        {
            "mean_handoff_days": "Seller handoff",
            "mean_transit_days": "Carrier transit",
        }
    )
    state_stage_chart = (
        alt.Chart(state_stages)
        .mark_bar()
        .encode(
            x=alt.X("customer_state:N", sort="-y", title="Customer state"),
            xOffset=alt.XOffset("stage:N"),
            y=alt.Y("mean_days:Q", title="Mean days"),
            color=alt.Color("stage:N", title="Delivery stage"),
            tooltip=[
                alt.Tooltip("customer_state:N", title="State"),
                alt.Tooltip("stage:N", title="Stage"),
                alt.Tooltip("mean_days:Q", format=".1f", title="Mean days"),
            ],
        )
        .properties(height=350)
    )
    st.altair_chart(state_stage_chart, width="stretch")

    st.subheader("Delivery stages among late orders")
    late_only = late_order_split(connection)
    st.caption("This table compares delivery-stage averages for late orders only.")
    st.dataframe(
        late_only.style.format(
            {
                "mean_handoff_days": "{:.1f}",
                "mean_transit_days": "{:.1f}",
                "mean_promised_days": "{:.1f}",
            }
        ),
        hide_index=True,
        width="stretch",
    )

    st.subheader("Review score by delivery delay")
    impact = delay_impact_table(connection)
    impact_chart = (
        alt.Chart(impact)
        .mark_bar(color="#4c78a8")
        .encode(
            x=alt.X(
                "bucket:N",
                sort=["on time", "1-3 days late", "4-7 days late", "8+ days late"],
                title="Delivery delay",
            ),
            y=alt.Y("mean_review_score:Q", title="Mean review score"),
            tooltip=[
                alt.Tooltip("bucket:N", title="Delay"),
                alt.Tooltip("mean_review_score:Q", format=".2f", title="Mean score"),
                alt.Tooltip("orders:Q", format=",", title="Orders"),
            ],
        )
        .properties(height=300)
    )
    st.altair_chart(impact_chart, width="stretch")

    st.info(
        "These are associations in historical data, not proven causes. "
        "Orders that are still undelivered are missing, so the most recent "
        "months may look better than they were."
    )


main()
