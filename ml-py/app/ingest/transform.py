"""Data Transformation and Canonical Normalization for What-If AI.

Transforms raw mapped tabular data into the canonical daily retail schema:
    - Parses date formats (%Y-%m-%d, %d/%m/%Y, %d-%m-%y, %Y%m%d, ISO timestamps)
    - Normalizes Vietnamese vs English number strings (dot/comma parsing)
    - Applies price unit scaling (e.g. x1000 if headers specify 'nghìn đồng' / 'k')
    - Derives slug product_id when only product_name is provided
    - Aggregates sub-daily or receipt-level transactions to canonical daily grain:
      quantity = sum(quantity), price = sum(price * qty) / sum(qty)
    - Formats prices and unit costs as integer VND
    - Generates data quality audit report

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic Pandas and NumPy vector transformations.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd

from app.ingest.profile import DATE_FORMAT_CANDIDATES
from app.mapping.dictionary import strip_accents


def slugify(text: str) -> str:
    """Generate a clean slug identifier from a product name.

    Args:
        text: Input product name.

    Returns:
        str: Lowercase ascii hyphen-separated slug.
    """
    clean = strip_accents(str(text))
    clean = re.sub(r"[^\w\s-]", "", clean).strip().lower()
    return re.sub(r"[-\s]+", "-", clean)


def parse_numeric_series(series: pd.Series, locale: str = "en") -> pd.Series:
    """Parse text series containing formatted numbers into floats based on locale.

    Args:
        series: Pandas series.
        locale: 'vi' (dot=thousands, comma=decimals) or 'en' (comma=thousands, dot=decimals).

    Returns:
        pd.Series: Numeric float series with invalid values converted to NaN.
    """
    if pd.api.types.is_numeric_dtype(series):
        return series.astype(float)

    s = series.astype(str).str.strip()

    if locale == "vi":
        # Remove dots as thousand separators, convert comma to dot decimal
        s = s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    else:
        # Remove commas as thousand separators
        s = s.str.replace(",", "", regex=False)

    # Remove non-numeric characters except minus and dot
    cleaned = s.str.replace(r"[^\d.-]", "", regex=True)
    return pd.to_numeric(cleaned, errors="coerce")


def parse_date_series(series: pd.Series, explicit_format: Optional[str] = None) -> pd.Series:
    """Parse various date formats into standardized ISO YYYY-MM-DD string series.

    Args:
        series: Pandas series containing date strings or datetimes.
        explicit_format: Optional explicit strftime format string.

    Returns:
        pd.Series: Standardized ISO date strings (YYYY-MM-DD).
    """
    if pd.api.types.is_datetime64_any_dtype(series):
        return series.dt.strftime("%Y-%m-%d")

    s = series.astype(str).str.strip()

    # Try explicit format if provided
    if explicit_format:
        parsed = pd.to_datetime(s, format=explicit_format, errors="coerce")
        if parsed.notna().mean() >= 0.80:
            return parsed.dt.strftime("%Y-%m-%d")

    # Try common candidates
    for fmt in DATE_FORMAT_CANDIDATES:
        try:
            parsed = pd.to_datetime(s, format=fmt, errors="coerce")
            if parsed.notna().mean() >= 0.80:
                return parsed.dt.strftime("%Y-%m-%d")
        except Exception:
            continue

    # Fallback to general dateutil parsing
    parsed = pd.to_datetime(s, errors="coerce")
    return parsed.dt.strftime("%Y-%m-%d")


def transform_to_canonical(
    raw_df: pd.DataFrame,
    mapping: Dict[str, str],
    options: Optional[Dict[str, Any]] = None,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Transform raw DataFrame into the canonical daily retail schema.

    Args:
        raw_df: Raw input DataFrame.
        mapping: Dictionary mapping canonical field name -> source column name.
        options: Optional configuration options (price_unit, date_format, number_locale, margin_pct).

    Returns:
        Tuple containing:
            - canonical_df (pd.DataFrame): Normalized daily DataFrame.
            - quality_report (Dict[str, Any]): Data quality and transformation audit summary.

    Raises:
        ValueError: If mandatory fields cannot be resolved.
    """
    opts = options or {}
    df = raw_df.copy()
    warnings: List[str] = []

    # 1. Invert mapping to find source column for each canonical field
    # mapping can be canonical -> source
    date_col = mapping.get("date")
    price_col = mapping.get("price")
    qty_col = mapping.get("quantity")
    pid_col = mapping.get("product_id")
    pname_col = mapping.get("product_name")
    cost_col = mapping.get("unit_cost")
    stock_col = mapping.get("stock")
    promo_col = mapping.get("promo")
    cat_col = mapping.get("category")

    if not date_col or not price_col or not qty_col:
        raise ValueError("Missing mandatory fields: 'date', 'price', and 'quantity' must be mapped.")

    if not pid_col and not pname_col:
        raise ValueError("Must map at least one of 'product_id' or 'product_name'.")

    # 2. Detect locale and parse numbers
    raw_locale = opts.get("number_locale")
    if raw_locale:
        locale = "vi" if str(raw_locale).lower().startswith("vi") else "en"
    else:
        # Heuristic check on price column text
        price_sample = df[price_col].dropna().astype(str).head(50)
        has_vn_dots = any(bool(re.search(r"\d+\.\d{3}", v)) for v in price_sample)
        locale = "vi" if has_vn_dots else "en"

    # 3. Detect price unit multiplier (supports string codes like 'VND', 'K_VND' or numeric multipliers)
    raw_unit = opts.get("price_unit", 1.0)
    if isinstance(raw_unit, (int, float)):
        price_multiplier = float(raw_unit)
    else:
        unit_str = str(raw_unit).strip().lower()
        if unit_str in ("", "vnd", "1", "1.0"):
            price_multiplier = 1.0
        elif unit_str in ("k_vnd", "k", "kvnd", "thousand", "nghin", "1000", "1000.0"):
            price_multiplier = 1000.0
        else:
            price_multiplier = float(unit_str)

    if price_multiplier == 1.0:
        header_text = strip_accents(str(price_col)).lower()
        if any(kw in header_text for kw in ("nghin", "ngan", "k vnd", "(k)")):
            price_multiplier = 1000.0

    # 4. Extract and clean canonical columns
    df_clean = pd.DataFrame()
    df_clean["date"] = parse_date_series(df[date_col], explicit_format=opts.get("date_format"))

    parsed_qty = parse_numeric_series(df[qty_col], locale=locale)
    df_clean["quantity"] = np.maximum(parsed_qty.fillna(0.0), 0.0)

    parsed_price = parse_numeric_series(df[price_col], locale=locale) * price_multiplier
    df_clean["price"] = np.maximum(parsed_price.fillna(0.0), 0.0)

    # Resolve product_id and product_name
    if pid_col:
        df_clean["product_id"] = df[pid_col].astype(str).str.strip()
    else:
        df_clean["product_id"] = df[pname_col].astype(str).apply(slugify)

    if pname_col:
        df_clean["product_name"] = df[pname_col].astype(str).str.strip()
    else:
        df_clean["product_name"] = df_clean["product_id"]

    # Category
    if cat_col:
        df_clean["category"] = df[cat_col].astype(str).str.strip()
    else:
        df_clean["category"] = "General"

    # Unit cost handling
    if cost_col:
        cost_mult = price_multiplier if any(kw in strip_accents(str(cost_col)).lower() for kw in ("nghin", "ngan", "k")) else 1.0
        parsed_cost = parse_numeric_series(df[cost_col], locale=locale) * cost_mult
        df_clean["unit_cost"] = np.maximum(parsed_cost.fillna(0.0), 0.0)
    else:
        warnings.append("unit_cost missing: margin % required")
        raw_margin = opts.get("margin_pct")
        margin = float(raw_margin) if raw_margin is not None else 0.35
        if margin > 1.0:
            margin = margin / 100.0
        margin = min(max(margin, 0.01), 0.99)
        df_clean["unit_cost"] = df_clean["price"] * (1.0 - margin)

    # Stock handling
    if stock_col:
        parsed_stock = parse_numeric_series(df[stock_col], locale=locale)
        df_clean["stock"] = np.maximum(parsed_stock.fillna(0.0), 0.0)
    else:
        warnings.append("stock missing: inventory constraints disabled")
        df_clean["stock"] = np.nan

    # Promo handling
    if promo_col:
        raw_promo = df[promo_col].astype(str).str.strip().str.lower()
        df_clean["promo"] = np.where(raw_promo.isin(["1", "true", "yes", "km", "y"]), 1, 0)
    else:
        df_clean["promo"] = 0

    # Drop invalid rows (e.g. unparsable dates)
    valid_mask = df_clean["date"].notna() & (df_clean["price"] > 0)
    df_clean = df_clean[valid_mask].copy()

    # 5. Grain detection and aggregation (e.g. receipt/transaction -> daily)
    # Check if (date, product_id) repeats
    is_sub_daily = bool(df_clean.duplicated(subset=["date", "product_id"]).any())
    if is_sub_daily:
        # Transaction level: aggregate to daily grain
        # quantity = sum(quantity)
        # price = quantity-weighted mean
        df_clean["spend_line"] = df_clean["price"] * df_clean["quantity"]
        df_clean["cost_line"] = df_clean["unit_cost"] * df_clean["quantity"]

        agg_dict: Dict[str, Any] = {
            "quantity": "sum",
            "spend_line": "sum",
            "cost_line": "sum",
            "product_name": "first",
            "category": "first",
            "promo": "max",
        }
        if stock_col:
            agg_dict["stock"] = "last"

        grouped = df_clean.groupby(["date", "product_id"], as_index=False).agg(agg_dict)
        # Recompute weighted unit price and unit cost
        grouped["price"] = np.where(
            grouped["quantity"] > 0,
            grouped["spend_line"] / grouped["quantity"],
            0.0,
        )
        grouped["unit_cost"] = np.where(
            grouped["quantity"] > 0,
            grouped["cost_line"] / grouped["quantity"],
            0.0,
        )
        canonical = grouped.drop(columns=["spend_line", "cost_line"])
    else:
        canonical = df_clean

    # Round price and unit_cost to integer VND
    canonical["price"] = canonical["price"].round().astype(int)
    canonical["unit_cost"] = canonical["unit_cost"].round().astype(int)
    canonical["quantity"] = canonical["quantity"].round().astype(int)

    # Sort canonically
    canonical = canonical.sort_values(by=["date", "product_id"]).reset_index(drop=True)

    # 6. Quality report
    n_prods = int(canonical["product_id"].nunique())
    price_sds = (
        canonical.groupby("product_id")["price"]
        .agg(lambda p: float(np.log(p[p > 0]).std()))
        .tolist()
    )
    mean_price_sd = float(np.nanmean(price_sds)) if price_sds else 0.0

    quality_report = {
        "n_rows": len(canonical),
        "date_min": str(canonical["date"].min()) if not canonical.empty else "",
        "date_max": str(canonical["date"].max()) if not canonical.empty else "",
        "n_products": n_prods,
        "mean_price_sd": round(mean_price_sd, 4),
        "aggregated_from_receipts": is_sub_daily,
        "warnings": warnings,
    }

    return canonical, quality_report

