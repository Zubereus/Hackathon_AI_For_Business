"""Small helpers that read data out of DuckDB as DataFrames."""
import pandas as pd


def load_orders(con) -> pd.DataFrame:
    """All delivered orders (one row per order) from fct_orders."""
    return con.execute("SELECT * FROM fct_orders").df()

def load_items(con) -> pd.DataFrame:
    """All order items (one row per item) from fct_items."""
    return con.execute("SELECT * FROM fct_items").df()