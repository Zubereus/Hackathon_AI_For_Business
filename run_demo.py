"""Run the DecisionDesk policy comparison demo."""

import duckdb
import pandas as pd

from src.data.load import DB_PATH, build_database
from src.data.queries import load_items, load_orders
from src.scenarios.compare import compare_policies
from src.scenarios.seller_probation import seller_orders


def open_database() -> duckdb.DuckDBPyConnection:
    """Build the database if absent, otherwise open it read-only."""
    if DB_PATH.exists():
        return duckdb.connect(str(DB_PATH), read_only=True)
    return build_database()


def load_data(
    con: duckdb.DuckDBPyConnection,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load order-grain and item-grain dataframes."""
    return load_orders(con), load_items(con)


def make_seller_orders(items: pd.DataFrame) -> pd.DataFrame:
    """Aggregate items into one row per seller and order."""
    return seller_orders(items)


def print_policy_comparison(
    orders: pd.DataFrame, seller_order_data: pd.DataFrame
) -> None:
    """Print the policy comparison table rounded to two decimals."""
    table = compare_policies(
        orders,
        seller_order_data,
        thresholds=[50, 100, 150, 200],
        probation_ks=[10, 30, 100],
    )
    print(table.round(2).to_string(index=False))


def print_qualifying_seller_count(seller_order_data: pd.DataFrame) -> None:
    """Print the count of sellers with at least twenty distinct orders."""
    order_counts = seller_order_data.groupby("seller_id")["order_id"].nunique()
    count = int((order_counts >= 20).sum())
    print(f"Sellers with at least 20 orders: {count}")


def main() -> None:
    """Load data and print the policy comparison demo."""
    con = open_database()
    try:
        orders, items = load_data(con)
    finally:
        con.close()
    seller_order_data = make_seller_orders(items)
    print_policy_comparison(orders, seller_order_data)
    print_qualifying_seller_count(seller_order_data)


if __name__ == "__main__":
    main()
