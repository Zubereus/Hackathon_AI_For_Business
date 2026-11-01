"""Load the Olist CSVs into DuckDB and create the views.

Run from the project root:  python -m src.data.load
"""
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
DB_PATH = ROOT / "data" / "olist.duckdb"
SQL_DIR = ROOT / "sql"

# table name in DuckDB -> csv file name from Kaggle
TABLES = {
    "orders": "olist_orders_dataset.csv",
    "customers": "olist_customers_dataset.csv",
    "order_items": "olist_order_items_dataset.csv",
    "order_reviews": "olist_order_reviews_dataset.csv",
    "products": "olist_products_dataset.csv",
    "sellers": "olist_sellers_dataset.csv",
    "category_translation": "product_category_name_translation.csv",
}

# order matters: fct_items reads from fct_orders
VIEW_FILES = ["fct_orders.sql", "fct_items.sql"]


def load_table(con, table_name, csv_path):
    """Replace one table with the contents of a CSV file."""
    con.execute(
        f"CREATE OR REPLACE TABLE {table_name} AS "
        f"SELECT * FROM read_csv_auto('{csv_path}', sample_size=-1)"
    )
    return table_name


def run_sql_file(con, sql_path):
    """Run every statement in a .sql file."""
    con.execute(sql_path.read_text(encoding="utf-8"))
    return sql_path.name


def build_database(raw_dir=RAW_DIR, db_path=DB_PATH):
    """Build the whole database and return an open connection."""
    con = duckdb.connect(str(db_path))
    loaded = [load_table(con, name, raw_dir / csv) for name, csv in TABLES.items()]
    created = [run_sql_file(con, SQL_DIR / f) for f in VIEW_FILES]
    print("tables:", loaded)
    print("views: ", created)
    return con


if __name__ == "__main__":
    build_database().close()
