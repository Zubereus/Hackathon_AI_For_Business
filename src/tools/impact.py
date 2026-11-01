"""Summarize review scores by order-delivery delay bucket."""

import duckdb
import pandas as pd


def delay_impact_table(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Return order counts and mean review scores for delivery-delay buckets."""
    query = """
        WITH bucketed_orders AS (
            SELECT
                CASE
                    WHEN delay_days <= 0 THEN 'on time'
                    WHEN delay_days <= 3 THEN '1-3 days late'
                    WHEN delay_days <= 7 THEN '4-7 days late'
                    ELSE '8+ days late'
                END AS bucket,
                review_score
            FROM fct_orders
            WHERE delay_days IS NOT NULL
        )
        SELECT
            bucket,
            count(*) AS orders,
            avg(review_score) AS mean_review_score
        FROM bucketed_orders
        GROUP BY bucket
        ORDER BY CASE bucket
            WHEN 'on time' THEN 1
            WHEN '1-3 days late' THEN 2
            WHEN '4-7 days late' THEN 3
            WHEN '8+ days late' THEN 4
        END
    """
    return con.execute(query).df()
