"""Column Profiler module for What-If AI data ingestion.

Analyzes raw CSV columns to detect:
    - Data types (numeric, date, text, boolean)
    - Vietnamese vs English number formatting (comma vs dot separators)
    - Date format candidates (%Y-%m-%d, %d/%m/%Y, %d-%m-%y, %Y%m%d, ISO timestamps)
    - Cardinality, null percentages, summary statistics
    - Sanitized masked samples (at most 5 values, masking long digit sequences for privacy)

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Zero LLM math: Deterministic parsing using Pandas and regex.
    - Privacy: Masks personal/sensitive identifiers in samples.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


DATE_FORMAT_CANDIDATES: List[str] = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
    "%d-%m-%y",
    "%Y%m%d",
    "%Y-%m-%d %H:%M:%S",
]


def mask_sensitive_value(val: Any) -> str:
    """Mask long sequences of digits in sample values for privacy protection.

    Replaces digit sequences of length >= 4 with '#' (e.g. phone numbers, customer IDs).

    Args:
        val: Raw sample value.

    Returns:
        str: Sanitized string representation.
    """
    s = str(val).strip()
    return re.sub(r"\d{4,}", lambda m: "#" * len(m.group(0)), s)


def test_numeric_parse(series: pd.Series) -> Tuple[float, str, Optional[float], Optional[float], Optional[float]]:
    """Evaluate numeric parseability under Vietnamese vs English formatting.

    Vietnamese format: '1.234.567,50' or '1.234.567' (dot = thousand, comma = decimal).
    English format: '1,234,567.50' or '1,234,567' (comma = thousand, dot = decimal).

    Args:
        series: Pandas series of string/numeric values.

    Returns:
        Tuple containing:
            - parse_rate (float): Fraction of valid values parsed (0.0 to 1.0).
            - best_locale (str): 'vi', 'en', or 'neutral'.
            - min_val (Optional[float]): Minimum parsed numeric value.
            - median_val (Optional[float]): Median parsed numeric value.
            - max_val (Optional[float]): Maximum parsed numeric value.
    """
    valid_items = series.dropna().astype(str).str.strip()
    if valid_items.empty:
        return 0.0, "neutral", None, None, None

    n = len(valid_items)

    def _extract_numeric_token(val: str) -> Optional[str]:
        s = val.strip()
        s = re.sub(r"(?i)\b(vnd|vnđ|usd)\b", "", s)
        s = s.replace("$", "").replace("₫", "").replace("đ", "").replace("Đ", "").strip()
        if not s or re.search(r"[a-zA-Z]", s):
            return None
        if not re.match(r"^[+-]?\s*[\d\s.,]+$", s):
            return None
        return s.replace(" ", "")

    def try_parse_en(val: str) -> Optional[float]:
        tok = _extract_numeric_token(val)
        if tok is None:
            return None
        cleaned = tok.replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            return None

    def try_parse_vi(val: str) -> Optional[float]:
        tok = _extract_numeric_token(val)
        if tok is None:
            return None
        # Dot is thousand separator, comma is decimal separator
        cleaned = tok.replace(".", "").replace(",", ".")
        try:
            return float(cleaned)
        except ValueError:
            return None

    parsed_en = [try_parse_en(v) for v in valid_items]
    parsed_vi = [try_parse_vi(v) for v in valid_items]

    count_en = sum(1 for v in parsed_en if v is not None)
    count_vi = sum(1 for v in parsed_vi if v is not None)

    # Detect if dot is used as thousand separator (e.g. '97.500' or '1.000.000')
    has_vn_dots = any(bool(re.search(r"\d+\.\d{3}", v)) for v in valid_items)

    if has_vn_dots or (count_vi >= count_en and any("," in v for v in valid_items)):
        best_locale = "vi"
        parsed = [v for v in parsed_vi if v is not None]
    else:
        best_locale = "en"
        parsed = [v for v in parsed_en if v is not None]

    rate = len(parsed) / n
    if not parsed:
        return 0.0, "neutral", None, None, None

    arr = np.array(parsed, dtype=float)
    return rate, best_locale, float(np.min(arr)), float(np.median(arr)), float(np.max(arr))


def test_date_parse(series: pd.Series) -> Tuple[float, Optional[str]]:
    """Test date parseability over candidate date formats.

    Args:
        series: Pandas series of string/datetime values.

    Returns:
        Tuple of (best_rate, best_format).
    """
    valid_items = series.dropna().astype(str).str.strip()
    if valid_items.empty:
        return 0.0, None

    # Sample up to 100 values for speed
    sample = valid_items.head(100)
    best_rate = 0.0
    best_fmt: Optional[str] = None

    for fmt in DATE_FORMAT_CANDIDATES:
        try:
            parsed = pd.to_datetime(sample, format=fmt, errors="coerce")
            rate = float(parsed.notna().mean())
            if rate > best_rate:
                best_rate = rate
                best_fmt = fmt
                if rate >= 0.99:
                    break
        except Exception:
            continue

    # Fallback to general dateutil parser if formats fail
    if best_rate < 0.80:
        try:
            parsed = pd.to_datetime(sample, errors="coerce")
            rate = float(parsed.notna().mean())
            if rate > best_rate:
                best_rate = rate
                best_fmt = "iso"
        except Exception:
            pass

    return best_rate, best_fmt


class ColumnProfile:
    """Detailed profile metrics for a single raw data column."""

    def __init__(
        self,
        name: str,
        n_rows: int,
        null_pct: float,
        n_unique: int,
        dtype_guess: str,
        samples: List[str],
        date_rate: float,
        best_date_fmt: Optional[str],
        num_rate: float,
        best_num_locale: str,
        min_val: Optional[float] = None,
        median_val: Optional[float] = None,
        max_val: Optional[float] = None,
    ) -> None:
        self.name = name
        self.n_rows = n_rows
        self.null_pct = null_pct
        self.n_unique = n_unique
        self.dtype_guess = dtype_guess
        self.samples = samples
        self.date_rate = date_rate
        self.best_date_fmt = best_date_fmt
        self.num_rate = num_rate
        self.best_num_locale = best_num_locale
        self.min_val = min_val
        self.median_val = median_val
        self.max_val = max_val

    def to_dict(self) -> Dict[str, Any]:
        """Convert profile to serializable dictionary."""
        return {
            "name": self.name,
            "n_rows": self.n_rows,
            "null_pct": round(self.null_pct, 4),
            "n_unique": self.n_unique,
            "dtype_guess": self.dtype_guess,
            "samples": self.samples,
            "date_rate": round(self.date_rate, 4),
            "best_date_fmt": self.best_date_fmt,
            "num_rate": round(self.num_rate, 4),
            "best_num_locale": self.best_num_locale,
            "min_val": self.min_val,
            "median_val": self.median_val,
            "max_val": self.max_val,
        }


def profile_column(series: pd.Series) -> ColumnProfile:
    """Compute comprehensive profiling metrics for a single column.

    Args:
        series: Pandas series representing a column.

    Returns:
        ColumnProfile: Profile analysis result.
    """
    col_name = str(series.name)
    n_rows = len(series)
    null_pct = float(series.isna().mean()) if n_rows > 0 else 1.0
    non_null = series.dropna()
    n_unique = int(non_null.nunique())

    # Get up to 5 masked distinct sample values
    sample_vals = non_null.drop_duplicates().head(5).tolist()
    masked_samples = [mask_sensitive_value(v) for v in sample_vals]

    # Evaluate date & numeric parseability
    date_rate, best_date_fmt = test_date_parse(series)
    num_rate, best_num_locale, min_v, med_v, max_v = test_numeric_parse(series)

    # Incur dtype guess
    if date_rate >= 0.90:
        dtype_guess = "date"
    elif num_rate >= 0.90:
        dtype_guess = "numeric"
    elif n_unique in (1, 2) and any(str(v).lower() in ("0", "1", "true", "false", "km", "yes", "no") for v in non_null.head(10)):
        dtype_guess = "boolean"
    else:
        dtype_guess = "string"

    return ColumnProfile(
        name=col_name,
        n_rows=n_rows,
        null_pct=null_pct,
        n_unique=n_unique,
        dtype_guess=dtype_guess,
        samples=masked_samples,
        date_rate=date_rate,
        best_date_fmt=best_date_fmt,
        num_rate=num_rate,
        best_num_locale=best_num_locale,
        min_val=min_v,
        median_val=med_v,
        max_val=max_v,
    )


def profile_dataframe(df: pd.DataFrame) -> Dict[str, ColumnProfile]:
    """Profile every column in a DataFrame.

    Args:
        df: Input raw DataFrame.

    Returns:
        Dict[str, ColumnProfile]: Dictionary mapping column name to its ColumnProfile.
    """
    return {str(col): profile_column(df[col]) for col in df.columns}

