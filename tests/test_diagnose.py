import unittest

import duckdb
import pandas as pd

from src.tools.diagnose import flag_late_months, late_order_split, stage_breakdown


class DiagnoseTests(unittest.TestCase):
    def setUp(self) -> None:
        """Register sixteen orders with hand-checkable monthly delay rates."""
        rows = []
        monthly_late_counts = [0, 1, 2, 4]
        for month_number, late_count in enumerate(monthly_late_counts, start=1):
            for order_number in range(4):
                rows.append(
                    {
                        "month": pd.Timestamp(2020, month_number, 1),
                        "customer_state": "SP" if order_number % 2 == 0 else "RJ",
                        "seller_handoff_days": 2,
                        "carrier_transit_days": 4,
                        "delay_days": 1 if order_number < late_count else 0,
                    }
                )
        self.orders = pd.DataFrame(rows)
        self.con = duckdb.connect(":memory:")
        self.con.register("fct_orders", self.orders)

    def tearDown(self) -> None:
        """Close the in-memory DuckDB connection."""
        self.con.close()

    def test_stage_breakdown_by_month(self) -> None:
        """Calculate monthly counts, late rates, and mean delivery stages."""
        result = stage_breakdown(self.con, "month")
        self.assertEqual(result["orders"].tolist(), [4, 4, 4, 4])
        self.assertEqual(result["late_rate"].tolist(), [0.0, 0.25, 0.5, 1.0])
        self.assertEqual(result["mean_handoff_days"].tolist(), [2.0] * 4)
        self.assertEqual(result["mean_transit_days"].tolist(), [4.0] * 4)
        self.assertEqual(result["mean_promised_days"].tolist(), [6.0, 5.75, 5.5, 5.0])
        self.assertEqual(result["mean_delay_days"].tolist(), [0.0, 0.25, 0.5, 1.0])

    def test_stage_breakdown_by_state_and_rejects_other_columns(self) -> None:
        """Group state rows correctly and reject unsafe SQL column input."""
        result = stage_breakdown(self.con, "customer_state")
        by_state = result.set_index("customer_state")
        self.assertEqual(by_state.loc["RJ", "orders"], 8)
        self.assertEqual(by_state.loc["SP", "orders"], 8)
        self.assertAlmostEqual(by_state.loc["RJ", "late_rate"], 0.375)
        self.assertAlmostEqual(by_state.loc["SP", "late_rate"], 0.5)
        with self.assertRaises(ValueError):
            stage_breakdown(self.con, "month; DROP TABLE fct_orders")

    def test_flags_months_against_only_earlier_months(self) -> None:
        """Leave the first three z-scores empty and detect a fourth-month spike."""
        result = flag_late_months(stage_breakdown(self.con, "month"))
        self.assertTrue(result.loc[:2, "z_score"].isna().all())
        self.assertAlmostEqual(result.loc[3, "z_score"], 3.0)
        self.assertEqual(result["is_anomaly"].tolist(), [False, False, False, True])

    def test_late_order_split_uses_only_late_orders(self) -> None:
        """Average stage lengths over the seven late orders only."""
        result = late_order_split(self.con)
        self.assertAlmostEqual(result.loc[0, "mean_handoff_days"], 2.0)
        self.assertAlmostEqual(result.loc[0, "mean_transit_days"], 4.0)
        self.assertAlmostEqual(result.loc[0, "mean_promised_days"], 5.0)


if __name__ == "__main__":
    unittest.main()
