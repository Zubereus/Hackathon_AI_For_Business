import unittest

import duckdb

from src.tools.impact import delay_impact_table


class DelayImpactTableTests(unittest.TestCase):
    def setUp(self) -> None:
        """Create an in-memory order view with delay-bucket boundary cases."""
        self.con = duckdb.connect(":memory:")
        self.con.execute(
            """
            CREATE TABLE fct_orders (
                order_id VARCHAR,
                delay_days INTEGER,
                review_score DOUBLE
            )
            """
        )
        self.con.executemany(
            "INSERT INTO fct_orders VALUES (?, ?, ?)",
            [
                ("on-time", 0, 5.0),
                ("early", -1, 3.0),
                ("late-1", 1, 4.0),
                ("late-3", 3, 2.0),
                ("late-4", 4, 1.0),
                ("late-7", 7, 5.0),
                ("late-8", 8, 4.0),
                ("late-unknown", None, 1.0),
                ("review-missing", 0, None),
            ],
        )

    def tearDown(self) -> None:
        """Close the in-memory DuckDB connection."""
        self.con.close()

    def test_groups_orders_at_bucket_boundaries(self) -> None:
        """Assign each non-null delay to the expected inclusive bucket."""
        result = delay_impact_table(self.con)
        self.assertEqual(
            result["bucket"].tolist(),
            ["on time", "1-3 days late", "4-7 days late", "8+ days late"],
        )
        self.assertEqual(result["orders"].tolist(), [3, 2, 2, 1])

    def test_calculates_mean_review_score_per_bucket(self) -> None:
        """Average available review scores while counting orders without reviews."""
        result = delay_impact_table(self.con)
        self.assertEqual(
            result["mean_review_score"].tolist(),
            [4.0, 3.0, 3.0, 4.0],
        )


if __name__ == "__main__":
    unittest.main()
