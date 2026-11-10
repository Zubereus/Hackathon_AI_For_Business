"""Vietnamese retail event calendar feature extractor for What-If AI.

Wraps data/synthetic/vn_calendar.py without duplicating underlying tables.
Produces structured event-window indicator features for econometric modeling:
    - pre_far: Early anticipation window (e.g., -14 to -8 days before major events)
    - pre_near: Immediate shopping rush (e.g., -7 to -1 days)
    - day: Primary event day (day 0)
    - post: Event hangover / fulfillment recovery period (e.g., +1 to +7 days)

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Reuses vn_calendar.py directly: Never alters or duplicates assumption numbers.
"""

from __future__ import annotations

import os
import sys
from typing import Dict, List, Optional, Set, Tuple, Union
import numpy as np
import pandas as pd


# Ensure project root is in sys.path to import data/synthetic/vn_calendar.py
_CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.abspath(os.path.join(_CURRENT_DIR, "..", "..", ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

try:
    from data.synthetic import vn_calendar as vc
except ImportError:
    # Fallback to local import if executed in isolated path
    import importlib.util
    _vn_cal_path = os.path.join(_PROJECT_ROOT, "data", "synthetic", "vn_calendar.py")
    if os.path.exists(_vn_cal_path):
        _spec = importlib.util.spec_from_file_location("vn_calendar", _vn_cal_path)
        vc = importlib.util.module_from_spec(_spec)  # type: ignore[assignment]
        _spec.loader.exec_module(vc)  # type: ignore[union-attr]
    else:
        raise ImportError(f"Cannot locate vn_calendar.py at {_vn_cal_path}")

# Re-export build_calendar from synthetic calendar module
build_calendar = vc.build_calendar


# Event Family categorizations
EVENT_FAMILIES: Dict[str, Set[str]] = {
    "tet": {"tet"},
    "double_sale": {"sale_9_9", "sale_10_10", "sale_11_11", "sale_12_12", "sale_minor"},
    "black_friday": {"black_friday"},
    "gifting": {"women_8_3", "women_20_10", "valentine", "christmas", "teachers_20_11"},
    "national_holidays": {"holiday_30_4", "national_2_9", "hung_kings"},
    "back_to_school": {"back_to_school"},
}

# Window definitions per family: (name, offset_range)
WINDOW_SPECS: Dict[str, Dict[str, range]] = {
    "tet": {
        "pre_far": range(-14, -7),
        "pre_near": range(-7, 0),
        "day": range(0, 1),
        "post": range(1, 8),
    },
    "double_sale": {
        "pre_near": range(-1, 0),
        "day": range(0, 1),
        "post": range(1, 4),
    },
    "black_friday": {
        "pre_near": range(-1, 0),
        "day": range(0, 1),
        "post": range(1, 4),
    },
    "gifting": {
        "pre_near": range(-2, 0),
        "day": range(0, 1),
        "post": range(1, 2),
    },
    "national_holidays": {
        "pre_near": range(-1, 0),
        "day": range(0, 1),
        "post": range(1, 3),
    },
    "back_to_school": {
        "pre_far": range(-14, -7),
        "pre_near": range(-7, 0),
        "day": range(0, 1),
        "post": range(1, 8),
    },
}


def get_event_family(event_name: str) -> Optional[str]:
    """Resolve an individual event name to its broad macro event family.

    Args:
        event_name: Name string as defined in vn_calendar (e.g. 'sale_11_11', 'tet').

    Returns:
        Optional[str]: Event family name ('tet', 'double_sale', etc.), or None if unrecognized.
    """
    for family, events in EVENT_FAMILIES.items():
        if event_name in events:
            return family
    return None


def extract_vn_event_features(
    dates: Union[pd.Series, pd.DatetimeIndex, List[str]],
    macro_group: Optional[str] = None,
) -> pd.DataFrame:
    """Extract binary event-window indicators and calendar controls for a series of dates.

    Produces feature columns:
        - Calendar controls: 'is_weekend', 'is_payday_window' (days 5-10), 'sin_season', 'cos_season'
        - Event window indicators: e.g. 'evt_tet_pre_near', 'evt_double_sale_day', etc.
        - Synthetic multiplier: 'event_multiplier' (if macro_group is provided)

    Args:
        dates: Sequence of observation dates in YYYY-MM-DD or datetime format.
        macro_group: Optional product category group ('fashion', 'beauty', 'electronics',
            'home', 'grocery', 'sweets') to include synthetic expected demand multipliers.

    Returns:
        pd.DataFrame: DataFrame indexed with features corresponding row-by-row to input dates.
    """
    dt_series = pd.Series(pd.to_datetime(dates))
    start_date = dt_series.min()
    end_date = dt_series.max()

    # Reuse vn_calendar.build_calendar to leverage existing lunar date resolution
    base_cal = vc.build_calendar(start_date, end_date)
    cal_indexed = base_cal.set_index("date")

    # Map input dates to the base calendar records
    aligned = pd.DataFrame({"date": dt_series}).merge(
        base_cal, on="date", how="left"
    )

    day_of_year = dt_series.dt.dayofyear.to_numpy()
    features = pd.DataFrame(index=aligned.index)

    # 1. Base calendar controls
    features["is_weekend"] = (dt_series.dt.dayofweek >= 5).astype(int).to_numpy()
    features["is_payday_window"] = dt_series.dt.day.between(5, 10).astype(int).to_numpy()
    features["sin_season"] = np.sin(2.0 * np.pi * day_of_year / 365.25)
    features["cos_season"] = np.cos(2.0 * np.pi * day_of_year / 365.25)

    # 2. Window indicator features
    for family, windows in WINDOW_SPECS.items():
        for window_name, offset_range in windows.items():
            col_name = f"evt_{family}_{window_name}"
            # Match if row's event belongs to family and offset falls within window range
            is_active = (
                aligned["event_name"].apply(lambda n: get_event_family(str(n)) == family)
                & aligned["event_offset"].isin(offset_range)
            ).astype(int)
            features[col_name] = is_active.to_numpy()

    # 3. Optional synthetic multiplier for simulation/validation
    if macro_group and f"m_{macro_group}" in aligned.columns:
        features["event_multiplier"] = aligned[f"m_{macro_group}"].to_numpy()

    return features

