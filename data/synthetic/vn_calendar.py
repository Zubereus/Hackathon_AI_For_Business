"""
Vietnamese retail calendar used by the synthetic generator.

Each event = a SHAPE (lift by day offset around the event date) x a per-category-group GAIN.
effective_multiplier = 1 + (shape_lift - 1) * gain[group]

Lunar dates (Tet, Mid-Autumn, Hung Kings) are hard-coded for 2023-2026 (no lunar library needed).
VERIFY these against an official calendar before quoting them on a slide.
All lift sizes are ASSUMPTIONS for simulation, not market statistics.
"""
import numpy as np
import pandas as pd

TET_DAY1 = ["2023-01-22", "2024-02-10", "2025-01-29", "2026-02-17"]
MID_AUTUMN = ["2023-09-29", "2024-09-17", "2025-10-06", "2026-09-25"]   # 15th day of 8th lunar month
HUNG_KINGS = ["2023-04-29", "2024-04-18", "2025-04-07", "2026-04-26"]   # 10th day of 3rd lunar month

# Category -> macro group (used to pick event gains)
GROUP_OF = {
    "Thời trang": "fashion", "Giày dép": "fashion", "Phụ kiện": "fashion",
    "Mỹ phẩm": "beauty", "Chăm sóc cá nhân": "beauty",
    "Điện tử": "electronics", "Gia dụng": "home",
    "Thực phẩm": "grocery", "Đồ uống": "grocery", "Bánh kẹo": "sweets",
}
GROUPS = ["fashion", "beauty", "electronics", "home", "grocery", "sweets"]

def _g(fashion, beauty, electronics, home, grocery, sweets):
    return dict(fashion=fashion, beauty=beauty, electronics=electronics, home=home, grocery=grocery, sweets=sweets)

# ---- shapes: {offset_in_days: lift}.  offset 0 = event day ----
def _ramp(start, end, lo, hi):
    n = end - start + 1
    return {start + i: lo + (hi - lo) * (i / max(n - 1, 1)) for i in range(n)}

TET_SHAPE = {**_ramp(-14, -1, 1.10, 2.00),                       # pre-Tet shopping rush
             **{0: 0.35, 1: 0.30, 2: 0.30, 3: 0.40},             # shops closed / online lull
             **{4: 0.70, 5: 0.80, 6: 0.85, 7: 0.90}}             # slow recovery
MIDAUTUMN_SHAPE = {**_ramp(-14, -1, 1.10, 1.80), 0: 1.30, 1: 0.80}
DOUBLE_SHAPE = lambda peak: {-1: 1.05, 0: peak, 1: 0.92, 2: 0.95, 3: 0.97}   # peak then "hangover" dip
BLACKFRI_SHAPE = {-1: 1.10, 0: 1.70, 1: 1.35, 2: 1.30, 3: 0.95}
WOMEN_SHAPE = {-2: 1.20, -1: 1.40, 0: 1.70, 1: 0.90}                         # 8/3 and 20/10
VALENTINE_SHAPE = {-1: 1.15, 0: 1.40, 1: 0.95}
CHRISTMAS_SHAPE = {-3: 1.10, -2: 1.20, -1: 1.30, 0: 1.40, 1: 0.90}
TEACHER_SHAPE = {-1: 1.10, 0: 1.25}
HOLIDAY_30_4 = {-2: 1.10, -1: 1.20, 0: 1.25, 1: 1.25, 2: 1.10}
NATIONAL_DAY = {-1: 1.10, 0: 1.15, 1: 1.10}
HUNG_SHAPE = {-1: 1.05, 0: 1.10}
BACK_TO_SCHOOL = {o: 1.15 for o in range(-14, 8)}                              # ~Aug 17 - Sep 8 anchored on Sep 1

# (event_name, shape, gains)
EVENT_SPECS = {
    "tet":          (TET_SHAPE,        _g(1.00, 0.90, 0.50, 0.70, 1.30, 1.50)),
    "mid_autumn":   (MIDAUTUMN_SHAPE,  _g(0.20, 0.20, 0.10, 0.10, 0.60, 2.00)),
    "sale_11_11":   (DOUBLE_SHAPE(2.40), _g(1.00, 1.00, 1.20, 0.90, 0.40, 0.30)),
    "sale_12_12":   (DOUBLE_SHAPE(1.90), _g(1.00, 1.00, 1.20, 0.90, 0.40, 0.30)),
    "sale_9_9":     (DOUBLE_SHAPE(1.80), _g(1.00, 1.00, 1.20, 0.90, 0.40, 0.30)),
    "sale_10_10":   (DOUBLE_SHAPE(1.50), _g(1.00, 1.00, 1.20, 0.90, 0.40, 0.30)),
    "sale_minor":   (DOUBLE_SHAPE(1.30), _g(1.00, 1.00, 1.20, 0.90, 0.40, 0.30)),  # 3.3 ... 8.8
    "black_friday": (BLACKFRI_SHAPE,   _g(1.00, 0.80, 1.30, 1.00, 0.30, 0.20)),
    "women_8_3":    (WOMEN_SHAPE,      _g(0.90, 1.30, 0.30, 0.30, 0.30, 0.50)),
    "women_20_10":  (WOMEN_SHAPE,      _g(0.90, 1.30, 0.30, 0.30, 0.30, 0.50)),
    "valentine":    (VALENTINE_SHAPE,  _g(0.80, 1.20, 0.30, 0.20, 0.20, 0.80)),
    "christmas":    (CHRISTMAS_SHAPE,  _g(0.90, 0.60, 0.70, 0.40, 0.40, 1.00)),
    "teachers_20_11": (TEACHER_SHAPE,  _g(0.30, 0.50, 0.10, 0.10, 0.10, 0.80)),
    "holiday_30_4": (HOLIDAY_30_4,     _g(1.00, 0.50, 0.50, 0.50, 0.60, 0.50)),
    "national_2_9": (NATIONAL_DAY,     _g(0.50, 0.30, 0.50, 0.50, 0.70, 0.40)),
    "hung_kings":   (HUNG_SHAPE,       _g(0.30, 0.10, 0.10, 0.10, 0.50, 0.30)),
    "back_to_school": (BACK_TO_SCHOOL, _g(1.00, 0.30, 0.50, 0.30, 0.10, 0.10)),
}

# Typical retailer PRICE behaviour on events (creates realistic price/event confounding):
#   (probability of discounting, (min_discount, max_discount))  negative discount = price HIKE
PRICE_POLICY = {
    "tet":          {"grocery": (0.6, (-0.05, -0.02)), "sweets": (0.6, (-0.06, -0.02)),
                     "default": (0.2, (0.00, 0.05))},        # Tet: grocery/sweets prices rise
    "sale_11_11":   {"default": (0.90, (0.10, 0.25))},
    "sale_12_12":   {"default": (0.85, (0.08, 0.20))},
    "sale_9_9":     {"default": (0.80, (0.08, 0.18))},
    "sale_10_10":   {"default": (0.70, (0.05, 0.15))},
    "sale_minor":   {"default": (0.60, (0.05, 0.12))},
    "black_friday": {"default": (0.85, (0.10, 0.20))},
    "women_8_3":    {"beauty": (0.80, (0.08, 0.18)), "fashion": (0.70, (0.05, 0.15)), "default": (0.15, (0.0, 0.05))},
    "women_20_10":  {"beauty": (0.80, (0.08, 0.18)), "fashion": (0.70, (0.05, 0.15)), "default": (0.15, (0.0, 0.05))},
    "valentine":    {"beauty": (0.50, (0.05, 0.10)), "default": (0.10, (0.0, 0.05))},
    "christmas":    {"default": (0.40, (0.05, 0.12))},
    "mid_autumn":   {"sweets": (0.30, (0.0, 0.05)), "default": (0.0, (0.0, 0.0))},
}
PRICE_POLICY_WINDOW = {"tet": range(-14, 0), "mid_autumn": range(-10, 1), "black_friday": range(-1, 3),
                       "sale_11_11": range(0, 1), "sale_12_12": range(0, 1), "sale_9_9": range(0, 1),
                       "sale_10_10": range(0, 1), "sale_minor": range(0, 1)}   # others: offsets of the shape keys <= 0 or so


def _event_dates(start, end):
    """Return list of (event_name, Timestamp) occurrences for every year in [start, end]."""
    s, e = pd.Timestamp(start), pd.Timestamp(end)
    out = []
    pad = pd.Timedelta(days=20)
    for d in TET_DAY1:       out.append(("tet", pd.Timestamp(d)))
    for d in MID_AUTUMN:     out.append(("mid_autumn", pd.Timestamp(d)))
    for d in HUNG_KINGS:     out.append(("hung_kings", pd.Timestamp(d)))
    for y in range(s.year - 1, e.year + 2):
        out += [("sale_11_11", pd.Timestamp(y, 11, 11)), ("sale_12_12", pd.Timestamp(y, 12, 12)),
                ("sale_9_9", pd.Timestamp(y, 9, 9)), ("sale_10_10", pd.Timestamp(y, 10, 10)),
                ("women_8_3", pd.Timestamp(y, 3, 8)), ("women_20_10", pd.Timestamp(y, 10, 20)),
                ("valentine", pd.Timestamp(y, 2, 14)), ("christmas", pd.Timestamp(y, 12, 24)),
                ("teachers_20_11", pd.Timestamp(y, 11, 20)), ("holiday_30_4", pd.Timestamp(y, 4, 30)),
                ("national_2_9", pd.Timestamp(y, 9, 2)), ("back_to_school", pd.Timestamp(y, 9, 1))]
        out += [("sale_minor", pd.Timestamp(y, m, m)) for m in range(3, 9)]
        nov1 = pd.Timestamp(y, 11, 1)
        first_fri = nov1 + pd.Timedelta(days=(4 - nov1.dayofweek) % 7)
        out.append(("black_friday", first_fri + pd.Timedelta(days=21)))   # 4th Friday of November
    return [(n, d) for n, d in out if s - pad <= d <= e + pad]


def build_calendar(start, end):
    """
    One row per day with:
      is_weekend, is_payday_window, doy, event_name (dominant event of the day or ""), event_offset,
      m_<group> = event multiplier for each macro group (product of all events active that day),
      holiday_flag (legacy: 1 if any event with lift>=1.3 or Tet pre-window), in_tet_closure
    """
    cal = pd.DataFrame({"date": pd.date_range(start, end, freq="D")})
    n = len(cal)
    cal["is_weekend"] = (cal["date"].dt.dayofweek >= 5).astype(int)
    cal["is_payday_window"] = cal["date"].dt.day.between(5, 10).astype(int)
    cal["doy"] = cal["date"].dt.dayofyear
    mult = {g: np.ones(n) for g in GROUPS}
    names = np.array([""] * n, dtype=object)
    offsets = np.full(n, 99)
    peak_strength = np.zeros(n)
    index_of = {d: i for i, d in enumerate(cal["date"])}
    for name, d0 in _event_dates(start, end):
        shape, gains = EVENT_SPECS[name]
        for off, lift in shape.items():
            day = d0 + pd.Timedelta(days=off)
            i = index_of.get(day)
            if i is None:
                continue
            for g in GROUPS:
                gain = gains[g] if lift >= 1 else min(gains[g], 1.0)   # slumps are not amplified
                mult[g][i] *= 1 + (lift - 1) * gain
            strength = abs(lift - 1)
            if strength > peak_strength[i]:
                peak_strength[i], names[i], offsets[i] = strength, name, off
    for g in GROUPS:
        cal[f"m_{g}"] = mult[g]
    cal["event_name"], cal["event_offset"] = names, offsets
    cal["holiday_flag"] = (peak_strength >= 0.3).astype(int)
    return cal


def price_event_factor(rng, cal, group):
    """Per-day price factor (<1 = markdown, >1 = hike) that retailers typically apply around events."""
    n = len(cal)
    factor = np.ones(n)
    occurrence_choice = {}
    for i, (name, off) in enumerate(zip(cal["event_name"], cal["event_offset"])):
        if name not in PRICE_POLICY:
            continue
        window = PRICE_POLICY_WINDOW.get(name, range(-1, 1))
        if off not in window:
            continue
        spec = PRICE_POLICY[name].get(group, PRICE_POLICY[name]["default"])
        prob, (lo, hi) = spec
        key = (name, cal["date"].iloc[i].year, group)
        if key not in occurrence_choice:            # one decision per event occurrence and group
            occurrence_choice[key] = (rng.random() < prob, rng.uniform(lo, hi) if hi != lo else lo)
        applies, depth = occurrence_choice[key]
        if applies:
            factor[i] = 1 - depth
    return factor
