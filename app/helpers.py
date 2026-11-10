"""Shared data and scenario helpers for the DecisionDesk Streamlit app."""

from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import streamlit as st

from src.data.load import DB_PATH
from src.data.queries import load_items, load_orders
from src.scenarios.delivery_promise import promise_facts
from src.scenarios.seller_probation import (
    probation_facts,
    seller_orders,
    seller_stats,
    worst_sellers,
)
from src.scenarios.sensitivity import sensitivity_grid


@st.cache_resource
def open_db() -> duckdb.DuckDBPyConnection:
    """Open and cache the read-only app database connection."""
    database_path = Path("data/olist.duckdb")
    if not database_path.exists():
        st.error("Database not found. Build it with `python -m src.data.load`.")
        st.stop()
    return duckdb.connect("data/olist.duckdb", read_only=True)


@st.cache_data
def load_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load orders and seller-order data from the read-only DuckDB database."""
    database_path = Path(DB_PATH)
    if not database_path.exists():
        st.error("Database not found. Build it with `python -m src.data.load`.")
        st.stop()

    connection = duckdb.connect(str(database_path), read_only=True)
    try:
        orders = load_orders(connection)
        items = load_items(connection)
    finally:
        connection.close()

    return orders, seller_orders(items)


def promise_vs_probation_grid(
    orders: pd.DataFrame,
    seller_orders_df: pd.DataFrame,
    states: list[str],
    pad_days: int,
    probation_k: int,
    take_rate: float,
    absorbed_share: float,
    late_costs: np.ndarray,
    conversion_losses: np.ndarray,
) -> pd.DataFrame:
    """Compare promise padding and seller probation across assumption values."""
    promise_summary = promise_facts(orders, states, pad_days)
    seller_summary = seller_stats(seller_orders_df)
    removed_sellers = worst_sellers(seller_summary, probation_k, min_orders=20)
    probation_summary = probation_facts(seller_orders_df, removed_sellers)
    return sensitivity_grid(
        promise_summary,
        probation_summary,
        take_rate,
        absorbed_share,
        late_costs,
        conversion_losses,
    )
