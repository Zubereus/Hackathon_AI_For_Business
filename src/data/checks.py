"""Sanity checks for the views. Run:  python -m src.data.checks"""
import duckdb
from src.data.load import DB_PATH

# Each check is (title, sql). Add new checks by adding a line here.
CHECKS = [
    ("Raw table row counts",
     """SELECT 'orders' AS t, count(*) AS n FROM orders
        UNION ALL SELECT 'order_items', count(*) FROM order_items
        UNION ALL SELECT 'order_reviews', count(*) FROM order_reviews
        UNION ALL SELECT 'sellers', count(*) FROM sellers"""),

    ("fct_orders: size and date range",
     """SELECT count(*) AS orders, min(month) AS first_month, max(month) AS last_month,
               count(DISTINCT order_id) AS distinct_orders
        FROM fct_orders"""),

    ("fct_orders: null counts (review nulls are expected, others should be 0)",
     """SELECT count(*) FILTER (WHERE gmv IS NULL)                 AS null_gmv,
               count(*) FILTER (WHERE delay_days IS NULL)          AS null_delay,
               count(*) FILTER (WHERE seller_handoff_days IS NULL) AS null_handoff,
               count(*) FILTER (WHERE review_score IS NULL)        AS null_review
        FROM fct_orders"""),

    ("Late rate and avg review by month (late = delivered after estimate)",
     """SELECT month, count(*) AS orders,
               round(100 * avg((delay_days > 0)::INT), 2) AS late_pct,
               round(avg(review_score), 2)                AS avg_review
        FROM fct_orders GROUP BY month ORDER BY month"""),

    ("Avg review by delay bucket (should fall as delay grows)",
     """SELECT CASE WHEN delay_days <= 0 THEN '1 on time'
                   WHEN delay_days <= 3 THEN '2 late 1-3d'
                   WHEN delay_days <= 7 THEN '3 late 4-7d'
                   ELSE '4 late 8d+' END AS bucket,
               count(*) AS orders, round(avg(review_score), 2) AS avg_review
        FROM fct_orders GROUP BY bucket ORDER BY bucket"""),

    ("fct_items: same orders as fct_orders? (both numbers should match)",
     """SELECT (SELECT count(DISTINCT order_id) FROM fct_items)  AS orders_in_items,
               (SELECT count(*) FROM fct_orders)                 AS orders_in_fct_orders,
               (SELECT count(*) FROM fct_items WHERE category = 'unknown') AS items_unknown_category"""),
]


def run_check(con, title, sql):
    """Run one check and print its result."""
    print(f"\n== {title}")
    print(con.execute(sql).df().to_string(index=False))


if __name__ == "__main__":
    con = duckdb.connect(str(DB_PATH), read_only=True)
    for title, sql in CHECKS:
        run_check(con, title, sql)
    con.close()
