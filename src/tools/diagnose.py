"""Break down delivery lateness by stage and flag unusual monthly rates."""

import duckdb
import pandas as pd


def stage_breakdown(
    con: duckdb.DuckDBPyConnection,
    group_col: str,
) -> pd.DataFrame:
    """Summarize order lateness and delivery stages by month or customer state."""
    if group_col not in {"month", "customer_state"}:
        raise ValueError("group_col must be 'month' or 'customer_state'.")
    query = f"""
        SELECT
            {group_col},
            count(*) AS orders,
            avg(CASE WHEN delay_days > 0 THEN 1.0 ELSE 0.0 END) AS late_rate,
            avg(seller_handoff_days) AS mean_handoff_days,
            avg(carrier_transit_days) AS mean_transit_days,
            avg(seller_handoff_days + carrier_transit_days - delay_days)
                AS mean_promised_days,
            avg(delay_days) AS mean_delay_days
        FROM fct_orders
        GROUP BY {group_col}
        ORDER BY {group_col}
    """
    return con.execute(query).df()


def flag_late_months(
    breakdown: pd.DataFrame,
    z_threshold: float = 2.0,
) -> pd.DataFrame:
    """Flag monthly late rates that differ from all earlier months."""
    result = breakdown.sort_values("month").reset_index(drop=True).copy()
    z_scores: list[float] = []
    anomalies: list[bool] = []
    for index, late_rate in enumerate(result["late_rate"]):
        earlier_rates = result.loc[: index - 1, "late_rate"].dropna()
        if index < 3 or len(earlier_rates) < 2:
            z_scores.append(float("nan"))
            anomalies.append(False)
            continue
        standard_deviation = earlier_rates.std()
        if standard_deviation == 0 or pd.isna(standard_deviation):
            z_scores.append(float("nan"))
            anomalies.append(False)
            continue
        z_score = (late_rate - earlier_rates.mean()) / standard_deviation
        z_scores.append(float(z_score))
        anomalies.append(bool(abs(z_score) > z_threshold))
    result["z_score"] = z_scores
    result["is_anomaly"] = anomalies
    return result


def late_order_split(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Return mean handoff, transit, and promised days among late orders."""
    query = """
        SELECT
            avg(seller_handoff_days) AS mean_handoff_days,
            avg(carrier_transit_days) AS mean_transit_days,
            avg(seller_handoff_days + carrier_transit_days - delay_days)
                AS mean_promised_days
        FROM fct_orders
        WHERE delay_days > 0
    """
    return con.execute(query).df()
