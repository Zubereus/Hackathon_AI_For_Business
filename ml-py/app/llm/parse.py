"""Semantic Natural Language & Financial Agent Parser for What-If AI.

Converts manager business questions (Vietnamese and English) into validated DecisionSpec JSON:
    - Generic-noun safe fuzzy product catalog matching with Vietnamese diacritic stripping
    - Temporal offset + Vietnamese retail event detection (Tết, 11.11/12.12, Black Friday, 8/3, 20/10)
    - Yes/No feasibility, Reverse Goal, Single-Step, and Multi-Phase Daily Schedule intent classification
    - LLM-first semantic planning when configured, with full offline rule-based parity
    - Strict Pydantic validation (price_pct in [-50, +100], total horizon in [7, 90])

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Never send raw sales rows or computed financial metrics to LLM.
    - Works 100% offline with zero LLM dependencies.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, Union

from pydantic import ValidationError

from app.llm.client import LLMClient
from app.schemas.contracts import (
    CatalogItem,
    DecisionSpec,
    NLQParseFallback,
    SchedulePhase,
    SuggestedScenarioPreset,
)


@dataclass(frozen=True)
class EventProfile:
    key: str
    label_vi: str
    label_en: str
    demand_multiplier: float
    elasticity_multiplier: float
    note_vi: str
    note_en: str


EVENT_PROFILES: Dict[str, EventProfile] = {
    "tet": EventProfile(
        key="tet",
        label_vi="Dịp Tết Nguyên Đán",
        label_en="Tết Holiday Rush",
        demand_multiplier=1.65,
        elasticity_multiplier=0.75,
        note_vi="Sức mua cận Tết thường tăng khoảng 1,65 lần ngày thường và khách ít ngại tăng giá hơn (~25%).",
        note_en="Pre-Tết demand typically lifts ~1.65x normal days while buyer price sensitivity softens by ~25%.",
    ),
    "double_sale": EventProfile(
        key="double_sale",
        label_vi="Ngày siêu sale đôi (9.9 / 11.11 / 12.12)",
        label_en="Double-Day Sale (9.9 / 11.11 / 12.12)",
        demand_multiplier=1.85,
        elasticity_multiplier=1.15,
        note_vi="Lưu lượng khách tăng ~1,85 lần nhưng người mua săn deal nên nhạy giá hơn ~15%.",
        note_en="Traffic jumps ~1.85x, though bargain hunters make demand ~15% more price-sensitive.",
    ),
    "black_friday": EventProfile(
        key="black_friday",
        label_vi="Đợt Black Friday",
        label_en="Black Friday",
        demand_multiplier=1.50,
        elasticity_multiplier=1.10,
        note_vi="Nhu cầu tăng ~1,50 lần và khách so sánh giá kỹ hơn ~10%.",
        note_en="Demand lifts ~1.50x with ~10% higher sensitivity to price changes.",
    ),
    "gifting": EventProfile(
        key="gifting",
        label_vi="Dịp lễ quà tặng (8/3, 20/10, Valentine, Noel)",
        label_en="Gifting Holiday",
        demand_multiplier=1.45,
        elasticity_multiplier=0.80,
        note_vi="Khách mua biếu tặng giúp sức mua tăng ~1,45 lần và ít ngại tăng giá nhẹ (~20%).",
        note_en="Gifting demand raises volume ~1.45x with ~20% softer price sensitivity.",
    ),
}

_GENERIC_STOPWORDS: Set[str] = {
    "san", "pham", "mat", "hang", "mon", "do", "cai", "chiec", "loai", "nhom",
    "shop", "cua", "toi", "minh", "gia", "ban", "tang", "giam", "tet", "ngay",
    "product", "products", "item", "items", "sku", "price", "increase", "decrease",
}


def strip_accents(text: str) -> str:
    """Normalize text to lowercase ASCII with Vietnamese diacritics stripped."""
    s = unicodedata.normalize("NFKD", text.lower().strip())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("đ", "d").replace("Đ", "d")


def normalize_tokens(text: str) -> List[str]:
    """Tokenize cleaned ASCII text into alphanumeric words."""
    cleaned = re.sub(r"[^a-z0-9\s]", " ", strip_accents(text))
    return [tok for tok in cleaned.split() if tok]


def detect_language(question: str) -> Literal["vi", "en"]:
    """Detect whether the manager's question is Vietnamese or English."""
    if re.search(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", question.lower()):
        return "vi"
    q_norm = strip_accents(question)
    vi_markers = (
        "tang", "giam", "ngay", "tuan", "thang", "gia", "loi nhuan", "khuyen mai",
        "san pham", "neu", "moi ngay", "sau do", "bao nhieu", "phan tram", "nagy",
        "co duoc khong", "co nen", "tet",
    )
    hits = sum(1 for kw in vi_markers if re.search(rf"\b{re.escape(kw)}\b", q_norm))
    return "vi" if hits >= 2 else "en"


def detect_question_type(
    question: str,
    is_schedule: bool = False,
) -> Literal["yes_no_feasibility", "what_if_scenario", "schedule_plan", "reverse_goal"]:
    """Classify the manager's underlying analytical intent."""
    q_norm = strip_accents(question)
    if re.search(r"\b(gia nao|gia bao nhieu|de dat|dat muc tieu|muon lai tang|target profit|what price|optimal price)\b", q_norm):
        return "reverse_goal"
    if re.search(
        r"\b(co duoc khong|duoc khong|co nen|nen khong|co on khong|on khong|co lo khong|co lai khong|co kha thi|kha thi khong|co sao khong|bi sao khong|hoan von khong|can i|should i|would it work|is it safe|worth it|feasible)\b",
        q_norm,
    ):
        return "yes_no_feasibility"
    if is_schedule:
        return "schedule_plan"
    return "what_if_scenario"


def detect_decision_goal(question: str) -> Literal["maximize_profit", "clear_inventory"]:
    """Detect whether the question prioritizes clearing inventory & unlocking cash over max short-term profit."""
    q_norm = strip_accents(question)
    if re.search(
        r"\b(xa kho|xa hang|ton kho|ton lau|hang ton|dong von|thu hoi von|hoan von|xoay vong|quay vong|giai phong von|cat lo|clear stock|clearance|slow[- ]moving|dead stock|liquidate|free up cash|working capital|inventory age)\b",
        q_norm,
    ):
        return "clear_inventory"
    return "maximize_profit"


def extract_inventory_age_days(question: str) -> Tuple[Optional[int], str]:
    """Extract warehouse age phrase (e.g. 'nhap kho 90 ngay', 'ton 3 thang') and strip it before horizon parsing."""
    q_norm = strip_accents(question)
    pattern = re.compile(
        r"\b(?:da\s+)?(?:nhap kho|ton kho|nam kho|luu kho|ton|hang cu|in stock|in warehouse|stocked|held|aged?)\s*"
        r"(?:duoc|tu|khoang|hon|gan|tren|for|around)?\s*(\d+)\s*"
        r"(ngay|nagyf|nagy|ngy|day|days|tuan|week|weeks|thang|month|months)(?:\s*(?:roi|qua|nay))?\b"
    )
    m = pattern.search(q_norm)
    if not m:
        return None, question

    num = int(m.group(1))
    unit = m.group(2)
    if unit in ("tuan", "week", "weeks"):
        age_days = num * 7
    elif unit in ("thang", "month", "months"):
        age_days = num * 30
    else:
        age_days = num

    age_days = max(0, min(age_days, 1095))
    # Remove matched age substring from normalized text passed to horizon extractor
    stripped_norm = (q_norm[: m.start()] + " " + q_norm[m.end() :]).strip()
    return age_days, stripped_norm


def detect_event_profile(question: str) -> Optional[EventProfile]:
    """Detect Vietnamese retail calendar event mentioned in the query."""
    q_norm = strip_accents(question)
    if re.search(r"\b(tet|tet nguyen dan|can tet|dip tet|mung)\b", q_norm):
        return EVENT_PROFILES["tet"]
    if re.search(r"(11[./]11|12[./]12|9[./]9|10[./]10|\bngay doi\b|\bsieu sale\b|\bmega sale\b)", q_norm):
        return EVENT_PROFILES["double_sale"]
    if "black friday" in q_norm:
        return EVENT_PROFILES["black_friday"]
    if re.search(r"(8[./]3|20[./]10|20[./]11|\bvalentine\b|\bnoel\b|\bgiang sinh\b|\btrung thu\b)", q_norm):
        return EVENT_PROFILES["gifting"]
    return None


def _mentions_generic_product(q_norm: str) -> bool:
    """Return True if the question refers generically to 'sản phẩm' / 'product' without specifying an unknown code."""
    if re.search(r"\bsku[-_]?\d+\b", q_norm):
        return False
    return bool(re.search(r"\b(san pham|mat hang|mon hang|mon nay|hang nay|product|this item|the product)\b", q_norm))


def match_product_in_catalog(
    question: str,
    catalog: List[CatalogItem],
) -> Tuple[Optional[CatalogItem], float]:
    """Fuzzy-match a product from catalog while rejecting generic retail stopwords."""
    if not catalog:
        return None, 0.0

    q_norm = " ".join(normalize_tokens(question))
    q_tokens_all = normalize_tokens(question)
    q_tokens = {t for t in q_tokens_all if t not in _GENERIC_STOPWORDS}

    best_item: Optional[CatalogItem] = None
    best_score: float = 0.0

    for item in catalog:
        pid_norm = " ".join(normalize_tokens(item.product_id))
        pname_norm = " ".join(normalize_tokens(item.name))
        pname_tokens = [t for t in normalize_tokens(item.name) if t not in _GENERIC_STOPWORDS]
        if not pname_tokens:
            pname_tokens = normalize_tokens(item.name)

        # 1. Exact product_id token match
        if pid_norm and re.search(rf"\b{re.escape(pid_norm)}\b", q_norm):
            return item, 1.0

        # 2. Exact product_name substring match
        if pname_norm and len(pname_norm) >= 4 and pname_norm in q_norm:
            if 0.98 > best_score:
                best_score = 0.98
                best_item = item
            continue

        # 3. Token overlap + fuzzy typo matching ONLY against non-stopword content tokens
        if pname_tokens and q_tokens:
            matched_token_scores: List[float] = []
            exact_hits = 0
            for p_tok in pname_tokens:
                if p_tok in q_tokens:
                    matched_token_scores.append(1.0)
                    exact_hits += 1
                else:
                    best_tok_sim = max(
                        (difflib.SequenceMatcher(None, p_tok, qt).ratio() for qt in q_tokens),
                        default=0.0,
                    )
                    matched_token_scores.append(best_tok_sim if best_tok_sim >= 0.78 else 0.0)

            token_coverage = sum(matched_token_scores) / len(pname_tokens)
            seq_sim = 0.0
            win = len(pname_tokens)
            for idx in range(max(1, len(q_tokens_all) - win + 1)):
                window_str = " ".join(q_tokens_all[idx : idx + win])
                seq_sim = max(seq_sim, difflib.SequenceMatcher(None, pname_norm, window_str).ratio())

            combined = 0.70 * token_coverage + 0.30 * seq_sim
            # Require stronger match when no exact token overlapped
            if exact_hits == 0 and combined < 0.75:
                continue
            if combined > best_score:
                best_score = combined
                best_item = item

    if best_score >= 0.65:
        return best_item, best_score
    return None, best_score


def extract_change_pct_rule(question: str) -> Optional[float]:
    """Extract target price change percentage from Vietnamese or English text."""
    q_norm = strip_accents(question)
    pct_pattern = re.compile(r"([+-]?\s*\d+(?:[.,]\d+)?)\s*(%|(?:phan tram|percent|pct)\b)")
    matches = list(pct_pattern.finditer(q_norm))
    if not matches:
        return None

    m = matches[0]
    raw_num_str = m.group(1).replace(" ", "").replace(",", ".")
    has_explicit_sign = raw_num_str.startswith(("+", "-"))
    val = float(raw_num_str)

    if has_explicit_sign:
        return val

    prefix_window = q_norm[max(0, m.start() - 50) : m.start()]
    cut_keywords = (
        "giam", "ha ", "chiet khau", "khuyen mai", "km ", "cut", "drop",
        "lower", "decrease", "reduce", "discount", "markdown", "off",
    )
    raise_keywords = (
        "tang", "nang", "cong", "len ", "raise", "increase", "hike", "lift",
        "up", "higher", "add",
    )

    last_cut_pos = max((prefix_window.rfind(kw) for kw in cut_keywords), default=-1)
    last_raise_pos = max((prefix_window.rfind(kw) for kw in raise_keywords), default=-1)

    suffix_window = q_norm[m.end() : min(len(q_norm), m.end() + 25)]
    if "off" in suffix_window or "discount" in suffix_window:
        return -abs(val)

    if last_cut_pos > last_raise_pos:
        return -abs(val)
    if last_raise_pos > last_cut_pos:
        return abs(val)

    if any(kw in q_norm for kw in cut_keywords):
        return -abs(val)
    if any(kw in q_norm for kw in raise_keywords):
        return abs(val)

    return None


def _extract_clause_duration_days(clause_norm: str) -> Optional[int]:
    """Extract duration in days (supports days, weeks, and common typos like 'nagyf')."""
    m_day = re.search(r"\b(\d+)\s*(ngay|nagyf|nagy|ngy|day|days)\b", clause_norm)
    if m_day:
        return int(m_day.group(1))
    m_week = re.search(r"\b(\d+)\s*(tuan|week|weeks)\b", clause_norm)
    if m_week:
        return int(m_week.group(1)) * 7
    return None


def _expand_and_validate_schedule(phases: List[SchedulePhase]) -> Tuple[Optional[float], int, Optional[str]]:
    """Expand multi-phase schedule day-by-day matching Go engine and validate bounds."""
    if not phases:
        return None, 0, "Empty schedule phases."

    total_days = sum(p.days for p in phases)
    if total_days < 7 or total_days > 90:
        return None, total_days, f"Total schedule duration {total_days} days is outside permitted range [7, 90] days."

    prev_factor = 1.0
    day_pcts: List[float] = []
    day_idx = 0
    for ph in phases:
        anchor = 1.0 + ph.start_change_pct / 100.0
        if ph.relative_to_prev:
            anchor = prev_factor * (1.0 + ph.start_change_pct / 100.0)
        for k in range(ph.days):
            day_idx += 1
            steps = (k + 1) if ph.step_on_first_day else k
            if ph.compound_daily_step:
                factor = anchor * ((1.0 + ph.daily_step_pct / 100.0) ** steps)
            else:
                factor = anchor + steps * (ph.daily_step_pct / 100.0)
            pct_vs_base = (factor - 1.0) * 100.0
            if pct_vs_base < -50.0 - 1e-6 or pct_vs_base > 100.0 + 1e-6:
                return (
                    None,
                    total_days,
                    f"Schedule drives price change to {pct_vs_base:.1f}% on day {day_idx}, outside allowed bounds [-50%, +100%].",
                )
            day_pcts.append(pct_vs_base)
            prev_factor = factor

    avg_pct = round(sum(day_pcts) / len(day_pcts), 2)
    return avg_pct, total_days, None


def extract_delayed_event_rule(
    question: str,
    change_val: Optional[float],
    event_prof: Optional[EventProfile],
    lang: Literal["vi", "en"],
) -> Tuple[Optional[List[SchedulePhase]], Optional[float], Optional[int], Optional[Dict[str, Any]], Optional[str]]:
    """Parse delayed / event-anchored timelines such as:
    '60 ngày nữa là Tết tôi muốn vào 7 ngày từ 60 ngày nữa tăng giá lên 15%'
    """
    if change_val is None:
        return None, None, None, None, None

    q_norm = strip_accents(question)

    # Detect explicit waiting period / delay ('60 ngay nua', 'sau 60 ngay', 'in 60 days', 'after 30 days')
    delay_days: Optional[int] = None
    m_delay_vi = re.search(r"\b(\d+)\s*(?:ngay|nagyf|nagy|ngy)\s*(?:nua|sau)\b", q_norm)
    m_delay_sau = re.search(r"\b(?:sau|tu)\s*(\d+)\s*(?:ngay|nagyf|nagy|ngy)\b", q_norm)
    m_delay_en = re.search(r"\b(?:in|after)\s+(\d+)\s*(?:day|days)\b", q_norm)
    if m_delay_vi:
        delay_days = int(m_delay_vi.group(1))
    elif m_delay_sau:
        delay_days = int(m_delay_sau.group(1))
    elif m_delay_en:
        delay_days = int(m_delay_en.group(1))

    # Detect active intervention window ('vao 7 ngay', 'trong 7 ngay', 'for 7 days')
    active_days: Optional[int] = None
    m_win = re.search(r"\b(?:vao|trong|keo dai|duy tri|ap dung|for|over)\s+(\d+)\s*(?:ngay|nagyf|nagy|ngy|day|days)\b", q_norm)
    if m_win:
        cand = int(m_win.group(1))
        if delay_days is None or cand != delay_days or len(re.findall(r"\d+\s*(?:ngay|day|days)", q_norm)) >= 2:
            active_days = cand

    # Require either a delay offset OR a seasonal retail event to trigger event-aware phase planning
    if delay_days is None and event_prof is None:
        return None, None, None, None, None

    # Validate single change magnitude strictly before building phases
    if change_val < -50.0 or change_val > 100.0:
        return None, None, None, None, None

    d_mult = event_prof.demand_multiplier if event_prof else 1.0
    e_mult = event_prof.elasticity_multiplier if event_prof else 1.0
    ev_name = (event_prof.label_vi if lang == "vi" else event_prof.label_en) if event_prof else (
        "giai đoạn thay đổi giá" if lang == "vi" else "target window"
    )

    # Case 1: Delay + active window fits cleanly within [7, 90] days
    if delay_days is not None and delay_days >= 1:
        win_days = active_days if active_days is not None else 7
        if win_days < 1:
            win_days = 7
        total = delay_days + win_days
        if total <= 90:
            phases = [
                SchedulePhase(
                    days=delay_days,
                    start_change_pct=0.0,
                    daily_step_pct=0.0,
                    demand_multiplier=1.0,
                    elasticity_multiplier=1.0,
                    label=(f"{delay_days} ngày chờ (giữ nguyên giá cũ)" if lang == "vi" else f"{delay_days} normal days at current price"),
                ),
                SchedulePhase(
                    days=win_days,
                    start_change_pct=float(change_val),
                    daily_step_pct=0.0,
                    demand_multiplier=d_mult,
                    elasticity_multiplier=e_mult,
                    label=(f"{win_days} ngày {ev_name} ({change_val:+.1f}% giá)" if lang == "vi" else f"{win_days} {ev_name} days ({change_val:+.1f}% price)"),
                ),
            ]
            avg_pct, total_d, err = _expand_and_validate_schedule(phases)
            if err:
                return None, None, None, None, err
            ev_ctx = {
                "event_key": event_prof.key if event_prof else "delayed_window",
                "event_label": ev_name,
                "delay_days": delay_days,
                "active_days": win_days,
                "demand_multiplier": d_mult,
                "elasticity_multiplier": e_mult,
                "note": (event_prof.note_vi if lang == "vi" else event_prof.note_en) if event_prof else "",
            }
            summary = (
                f"{delay_days} ngày đầu giữ nguyên giá bán hiện tại (ngày thường 1,0x) → "
                f"{win_days} ngày {ev_name} áp dụng đổi giá {change_val:+.1f}% (sức mua {d_mult:.2f}x, độ nhạy giá {e_mult:.2f}x)."
                if lang == "vi"
                else f"Keep today's price for {delay_days} normal days (1.0x), then apply {change_val:+.1f}% for {win_days} {ev_name} days ({d_mult:.2f}x demand, {e_mult:.2f}x sensitivity)."
            )
            return phases, avg_pct, total_d, ev_ctx, summary

        # If delay + win > 90 days, evaluate the active event window cleanly
        if 7 <= win_days <= 90:
            phases = [
                SchedulePhase(
                    days=win_days,
                    start_change_pct=float(change_val),
                    daily_step_pct=0.0,
                    demand_multiplier=d_mult,
                    elasticity_multiplier=e_mult,
                    label=(f"{win_days} ngày {ev_name}" if lang == "vi" else f"{win_days} {ev_name} days"),
                )
            ]
            avg_pct, total_d, err = _expand_and_validate_schedule(phases)
            if err:
                return None, None, None, None, err
            ev_ctx = {
                "event_key": event_prof.key if event_prof else "event_window",
                "event_label": ev_name,
                "delay_days": delay_days,
                "active_days": win_days,
                "demand_multiplier": d_mult,
                "elasticity_multiplier": e_mult,
                "note": (event_prof.note_vi if lang == "vi" else event_prof.note_en) if event_prof else "",
            }
            summary = (
                f"Đánh giá riêng cho {win_days} ngày {ev_name} (sau {delay_days} ngày nữa) với đổi giá {change_val:+.1f}% (sức mua {d_mult:.2f}x, độ nhạy giá {e_mult:.2f}x)."
                if lang == "vi"
                else f"Evaluating the {win_days}-day {ev_name} window (starting in {delay_days} days) at {change_val:+.1f}% price ({d_mult:.2f}x demand, {e_mult:.2f}x sensitivity)."
            )
            return phases, avg_pct, total_d, ev_ctx, summary

    # Case 2: Event mentioned without delay (e.g. 'tăng giá 15% dịp Tết 14 ngày')
    if event_prof is not None:
        win_days = active_days if (active_days is not None and 7 <= active_days <= 90) else 14
        phases = [
            SchedulePhase(
                days=win_days,
                start_change_pct=float(change_val),
                daily_step_pct=0.0,
                demand_multiplier=d_mult,
                elasticity_multiplier=e_mult,
                label=(f"{win_days} ngày {ev_name}" if lang == "vi" else f"{win_days} {ev_name} days"),
            )
        ]
        avg_pct, total_d, err = _expand_and_validate_schedule(phases)
        if not err:
            ev_ctx = {
                "event_key": event_prof.key,
                "event_label": ev_name,
                "delay_days": 0,
                "active_days": win_days,
                "demand_multiplier": d_mult,
                "elasticity_multiplier": e_mult,
                "note": event_prof.note_vi if lang == "vi" else event_prof.note_en,
            }
            summary = (
                f"Mô phỏng {win_days} ngày trong {ev_name} với đổi giá {change_val:+.1f}% (sức mua {d_mult:.2f}x ngày thường, độ nhạy giá {e_mult:.2f}x)."
                if lang == "vi"
                else f"Simulating {win_days} days during {ev_name} at {change_val:+.1f}% price ({d_mult:.2f}x demand, {e_mult:.2f}x sensitivity)."
            )
            return phases, avg_pct, total_d, ev_ctx, summary

    return None, None, None, None, None


def extract_schedule_rule(
    question: str,
) -> Tuple[Optional[List[SchedulePhase]], Optional[float], Optional[int], Optional[str]]:
    """Parse multi-phase / daily step pricing schedules from Vietnamese or English text."""
    q_norm = strip_accents(question)
    raw_clauses = re.split(r"[,;]|\b(?:and then|followed by|then|sau do|tiep theo|tiep tuc|roi)\b", q_norm)
    clauses = [c.strip() for c in raw_clauses if c and c.strip()]
    if len(clauses) < 2:
        return None, None, None, None

    phases: List[SchedulePhase] = []
    for idx, cl in enumerate(clauses):
        days = _extract_clause_duration_days(cl)
        if days is None:
            continue

        pct = extract_change_pct_rule(cl)
        keep_base = any(
            kw in cl for kw in ("giu nguyen", "giu gia", "gia goc", "keep unchanged", "keep price", "back to base", "quay ve gia")
        )
        if pct is None and keep_base:
            pct = 0.0
        if pct is None:
            continue

        is_daily = bool(
            re.search(r"\b(moi\s*(ngay|nagyf|nagy|ngy)|hang\s*ngay|tung\s*ngay|per\s*day|each\s*day|every\s*day|daily|a\s*day)\b", cl)
            or "/ngay" in cl
            or "/day" in cl
        )

        if is_daily:
            phases.append(
                SchedulePhase(
                    days=days,
                    start_change_pct=0.0,
                    daily_step_pct=float(pct),
                    relative_to_prev=(idx > 0 or len(phases) > 0),
                    compound_daily_step=True,
                    step_on_first_day=True,
                )
            )
        else:
            rel_prev = any(kw in cl for kw in ("so voi giai doan truoc", "tu muc truoc", "from previous", "over previous"))
            phases.append(
                SchedulePhase(
                    days=days,
                    start_change_pct=float(pct),
                    daily_step_pct=0.0,
                    relative_to_prev=rel_prev,
                    compound_daily_step=False,
                    step_on_first_day=False,
                )
            )

    if len(phases) < 2:
        return None, None, None, None

    try:
        avg_pct, total_days, err = _expand_and_validate_schedule(phases)
    except ValidationError as exc:
        return None, None, None, f"Schedule parameter out of allowed bounds: {exc.errors()[0]['msg']}"

    if err is not None:
        return None, None, total_days, err

    return phases, avg_pct, total_days, None


def extract_horizon_days_rule(question: str) -> Tuple[int, Optional[str]]:
    """Extract decision horizon in days from Vietnamese or English text."""
    q_norm = strip_accents(question)

    m_day = re.search(r"\b(\d+)\s*(ngay|nagyf|nagy|ngy|day|days)\b", q_norm)
    if m_day:
        days = int(m_day.group(1))
        if days < 7 or days > 90:
            return days, f"Horizon {days} days is outside permitted range [7, 90] days."
        return days, None

    m_week = re.search(r"\b(\d+)\s*(tuan|week|weeks)\b", q_norm)
    if m_week:
        days = int(m_week.group(1)) * 7
        if days < 7 or days > 90:
            return days, f"Horizon {days} days is outside permitted range [7, 90] days."
        return days, None
    if re.search(r"\b(tuan toi|tuan sau|next week|1 week|a week)\b", q_norm):
        return 7, None

    m_month = re.search(r"\b(\d+)\s*(thang|month|months)\b", q_norm)
    if m_month:
        days = int(m_month.group(1)) * 30
        if days < 7 or days > 90:
            return days, f"Horizon {days} days is outside permitted range [7, 90] days."
        return days, None
    if re.search(r"\b(thang toi|thang sau|next month|a month|1 month)\b", q_norm):
        return 30, None

    if re.search(r"\b(1 quy|quy toi|next quarter|a quarter|quarter)\b", q_norm):
        return 90, None
    if re.search(r"\b(\d+\s*nam|1 year|next year|nam toi|nam sau|half a year|6 thang)\b", q_norm):
        return 365, "Horizon exceeds maximum 90 days."

    return 30, None


def _default_strategy_presets(lang: Literal["vi", "en"]) -> List[SuggestedScenarioPreset]:
    """Return 3 clean, deterministic comparison presets for multi-option retail decisions."""
    if lang == "vi":
        return [
            SuggestedScenarioPreset(
                id="opt_raise_10",
                label="Phương án A: Tăng giá +10% (giữ biên lãi)",
                price_change_pct=10.0,
                unit_cost_change_pct=0.0,
                extra_fixed_cost_vnd=0,
                horizon_days=30,
                note="Phù hợp khi khách ít ngại giá và hàng tồn vừa phải.",
            ),
            SuggestedScenarioPreset(
                id="opt_discount_15",
                label="Phương án B: Giảm giá -15% đẩy hàng tồn",
                price_change_pct=-15.0,
                unit_cost_change_pct=0.0,
                extra_fixed_cost_vnd=0,
                horizon_days=30,
                decision_goal="clear_inventory",
                note="Phù hợp khi hàng tồn nhiều và muốn thu hồi tiền mặt nhanh.",
            ),
            SuggestedScenarioPreset(
                id="opt_hold_mkt",
                label="Phương án C: Giữ giá 0% + Chi thêm 5M ₫ quảng cáo",
                price_change_pct=0.0,
                unit_cost_change_pct=0.0,
                extra_fixed_cost_vnd=5000000,
                horizon_days=30,
                note="Kiểm tra phần chi phí cố định tăng thêm làm thay đổi điểm hòa vốn ra sao.",
            ),
        ]
    return [
        SuggestedScenarioPreset(
            id="opt_raise_10",
            label="Option A: Raise price +10% (protect margin)",
            price_change_pct=10.0,
            unit_cost_change_pct=0.0,
            extra_fixed_cost_vnd=0,
            horizon_days=30,
            note="Best when buyer sensitivity is mild and stock is healthy.",
        ),
        SuggestedScenarioPreset(
            id="opt_discount_15",
            label="Option B: Discount -15% to clear stock",
            price_change_pct=-15.0,
            unit_cost_change_pct=0.0,
            extra_fixed_cost_vnd=0,
            horizon_days=30,
            decision_goal="clear_inventory",
            note="Helps free cash tied up in slow-moving stock if margin permits.",
        ),
        SuggestedScenarioPreset(
            id="opt_hold_mkt",
            label="Option C: Hold price 0% + Add 5M VND ad spend",
            price_change_pct=0.0,
            unit_cost_change_pct=0.0,
            extra_fixed_cost_vnd=5000000,
            horizon_days=30,
            note="Tests how extra marketing overhead shifts net profit and break-even cushion.",
        ),
    ]


def detect_non_price_or_guidance(
    question: str,
    lang: Literal["vi", "en"],
) -> Optional[NLQParseFallback]:
    """Detect out-of-scope non-price % levers, multi-lever capital prompts, or educational shop queries.

    Prevents silent misparsing of 'marketing +20%' or 'revenue +20%' as a unit selling-price % change,
    and turns novice shop questions into constructive coaching responses without inventing SKU numbers.
    """
    q_norm = strip_accents(question)

    # 1. Multi-option capital allocation / strategy comparison (e.g., "100 triệu vốn... nhập hàng, chạy quảng cáo hay giảm giá?")
    is_multi_strategy = bool(
        re.search(
            r"\b(so sanh.*chien luoc|ba chien luoc|3 chien luoc|nhap hang.*quang cao|quang cao.*giam gia|dung.*von|compare.*strategies|three strategies)\b",
            q_norm,
        )
    )
    if is_multi_strategy:
        msg_vi = (
            "Đây là bài toán phân bổ đa biến (giá bán, chi phí quảng cáo, và vốn nhập hàng). "
            "Mô hình lịch sử chỉ đo trực tiếp phản ứng khi ĐỔI GIÁ BÁN, nên không tự gán % quảng cáo hay vận hành thành % đổi giá bán."
        )
        ans_vi = (
            "• Giảm giá hàng tồn: Không tốn thêm tiền mặt ngay, giúp thu hồi vốn nhanh nhưng làm mỏng tiền lời trên mỗi món — hợp nếu hàng tồn cao và còn biên lãi tốt.\n"
            "• Chạy quảng cáo: Cần bỏ tiền mặt ngay từ đầu; tỷ suất đơn mới (ROAS) phụ thuộc kênh chạy và cần theo dõi riêng chi phí cố định trong Bảng Giả Định Đa Biến.\n"
            "• Nhập thêm hàng: Tiền mặt bị khóa ngay vào tồn kho (= Số lượng nhập × Giá vốn/món) cho đến khi bán ra — chỉ nên nhập nếu mã hàng đang bán nhanh và sắp thiếu hàng."
        )
        msg_en = (
            "This asks for a multi-lever strategy comparison (selling price, ad spend, and inventory capital). "
            "Historical price elasticity covers selling-price moves directly and will not misinterpret ad budget % as a price change."
        )
        ans_en = (
            "• Clearance markdown: Requires zero extra upfront cash and frees stock quickly, at the cost of lower per-unit profit margin.\n"
            "• Paid marketing spend: Consumes cash upfront; actual order lift depends on ad conversion outside price history — test fixed ad spend directly in the Multi-Variable Playground.\n"
            "• Restocking: Locks cash into stock (= restock units × unit cost) immediately; prioritize only on fast-moving SKUs with tight stock days cover."
        )
        return NLQParseFallback(
            error=msg_vi if lang == "vi" else msg_en,
            fallback="manual_form",
            guidance_type="multi_option_capital",
            helpful_answer=ans_vi if lang == "vi" else ans_en,
            suggested_scenarios=_default_strategy_presets(lang),
        )

    # 2. Non-price percentage shocks (ad budget +20%, marketing +35%, opex +15%, unit cost +10%, revenue +20%)
    non_price_shock_patterns = (
        r"(?:ngan sach|chi phi)\s*(?:quang cao|marketing|ads|van hanh|ban hang|co dinh|nhap hang).*\d+\s*%",
        r"(?:quang cao|marketing|ads|van hanh|gia nhap|gia von|conversion|chuyen doi).*(?:tang|giam|them|bot|[+-])\s*\d+",
        r"(?:tang|giam)\s*\d+\s*(?:%|phan tram).*(?:ngan sach|quang cao|marketing|chi phi van hanh|gia von|gia nhap)",
        r"(?:doanh thu|revenue)\s*(?:[a-z0-9_]+\s*)?(?:tang|giam|[+-])\s*\d+\s*%",
        r"(?:ad budget|marketing spend|marketing budget|operating cost|opex|unit cost).*\d+",
    )
    mentions_selling_price = bool(re.search(r"\b(gia ban|selling price|unit price)\b", q_norm))
    has_non_price_shock = any(re.search(pat, q_norm) for pat in non_price_shock_patterns)

    if has_non_price_shock and not mentions_selling_price:
        msg_vi = (
            "Câu hỏi của bạn đang nhắc đến thay đổi ngân sách quảng cáo, doanh thu hoặc chi phí vận hành/nhập hàng — KHÔNG phải đổi giá bán niêm yết. "
            "Hệ thống không tự biến các con số % đó thành % tăng/giảm giá bán để tránh tính sai."
        )
        ans_vi = (
            "• Vì file hóa đơn cũ không ghi nhận mức chi quảng cáo từng ngày, máy chưa thể tự đoán tăng 20% tiền quảng cáo sẽ kéo thêm bao nhiêu đơn.\n"
            "• Tuy nhiên, bạn có thể nhập trực tiếp phần chi phí Marketing / Chi phí nhập hàng vào 'Bảng Giả Định Đa Biến (Playground)' ở bên dưới để thấy ngay tiền lãi và tiền mặt bị ảnh hưởng ra sao!"
        )
        msg_en = (
            "Your question refers to marketing budget, operating costs, or revenue shocks rather than a direct selling-price change. "
            "The engine refuses to treat marketing/cost % as a unit selling-price % so numbers stay honest."
        )
        ans_en = (
            "• Past sales CSVs typically lack daily ad-ROAS tracking, so the econometric price model cannot estimate ad-driven order lift alone.\n"
            "• Use the Multi-Variable Playground right below to adjust Unit Cost %, Extra Marketing/Fixed Spend (VND), and Restock Qty deterministically."
        )
        return NLQParseFallback(
            error=msg_vi if lang == "vi" else msg_en,
            fallback="manual_form",
            guidance_type="non_price_scope",
            helpful_answer=ans_vi if lang == "vi" else ans_en,
            suggested_scenarios=_default_strategy_presets(lang),
        )

    # 3. Educational / Glossary queries (e.g. "ROI là gì?")
    if re.search(r"\b(roi|margin|elasticity|break[- ]?even|wape|dong tien|diem hoa von|bien loi nhuan)\b", q_norm) and re.search(
        r"\b(la gi|giai thich|khong hieu|nghia la|hieu sao|what is|explain|mean)\b", q_norm
    ):
        ans_vi = (
            "• ROI (Tỷ suất sinh lời trên vốn bỏ ra): Nói đơn giản là 'bỏ 100 triệu nhập hàng hay chạy quảng cáo thì thu lời ròng lại được bao nhiêu % trên 100 triệu đó'. Ví dụ bỏ 100 triệu, lãi ròng 20 triệu => ROI = 20%.\n"
            "• Biên lợi nhuận gộp: Phần tiền lời giữ lại trên mỗi món bán ra trước khi trừ tiền mặt bằng/quảng cáo (Ví dụ bán 100k, nhập 60k => lời gộp 40k, chiếm 40%).\n"
            "• Lưu ý quan trọng cho chủ shop: Lãi kế toán cao chưa chắc tiền mặt rủng rỉnh nếu bạn dồn hết tiền đi nhập thêm hàng tồn kho!"
        )
        ans_en = (
            "• ROI (Return on Investment): Plainly, how much net profit you earn back per 100 VND spent on stock or ads (e.g. 20M net profit on 100M capital = 20% ROI).\n"
            "• Gross Margin: How many % of the selling price stays after paying item purchase cost (e.g. sell 100k, cost 60k => 40% gross margin).\n"
            "• Cash vs Profit rule: Accounting profit can look positive while cash on hand drops if extra money is locked into unsold inventory."
        )
        return NLQParseFallback(
            error=(
                "Đây là câu hỏi giải thích thuật ngữ kinh doanh (chưa phải lệnh đổi giá)."
                if lang == "vi"
                else "This is a business glossary question rather than a price change command."
            ),
            fallback="manual_form",
            guidance_type="glossary",
            helpful_answer=ans_vi if lang == "vi" else ans_en,
        )

    # 4. Open-ended "Why high sales volume but low profit?" query
    if re.search(r"\b(ban.*nhieu.*loi.*it|ban chay.*khong co lai|tai sao.*loi.*it|revenue up.*profit down|more sales.*less profit)\b", q_norm):
        ans_vi = (
            "Bán nhiều đơn hơn nhưng tiền lời thực nhận ít đi thường đến từ 3 nguyên nhân phổ biến trong shop bán lẻ:\n"
            "• 1. Giảm giá quá sâu vào món vốn đã mỏng lãi (ví dụ biên lãi chỉ 20% mà giảm giá 15% thì mỗi món gần như hòa vốn dù bán chạy).\n"
            "• 2. Chi phí biến đổi ăn mòn lãi: Phí sàn TMĐT, phí ship, chi phí đóng gói, hoặc tiền chạy quảng cáo tăng nhanh hơn tốc độ tăng doanh thu.\n"
            "• 3. Nhầm giữa 'Tiền lời' và 'Tiền mặt còn trong két': Bạn bán được nhiều nhưng dùng hết tiền lãi đi nhập thêm hàng tồn, nên thấy ví tiền mỏng đi. Hãy xem biểu đồ Thác nước Lợi nhuận (Waterfall) bên dưới để kiểm tra từng khoản bị trừ!"
        )
        ans_en = (
            "Selling more units while earning less profit typically stems from 3 retail causes:\n"
            "• 1. Deep discounts on thin-margin items erase profit per unit faster than extra volume makes up for.\n"
            "• 2. Rising platform fees, shipping, or ad spend grow faster than incremental sales.\n"
            "• 3. Cash vs Profit mix-up: Profit was reinvested into buying more inventory. Check the Profit Waterfall breakdown below!"
        )
        return NLQParseFallback(
            error=(
                "Đây là câu hỏi chẩn đoán nguyên nhân hụt lãi (không phải lệnh đổi giá 1 sản phẩm)."
                if lang == "vi"
                else "This is a profit diagnosis question rather than a specific price change command."
            ),
            fallback="manual_form",
            guidance_type="ambiguous_advice",
            helpful_answer=ans_vi if lang == "vi" else ans_en,
            suggested_scenarios=_default_strategy_presets(lang),
        )

    # 5. Holistic store health OR Restock vs Wait guidance without explicit price %
    has_pct = bool(re.search(r"\d+(?:[.,]\d+)?\s*(%|phan tram|percent|pct)", q_norm))
    if not has_pct and re.search(
        r"\b(kinh doanh tot khong|shop.*tot khong|tinh hinh shop|suc khoe cua hang|nen nhap them|nhap them hang|ban het.*ton kho|store health|doing well|restock)\b",
        q_norm,
    ):
        is_restock = bool(re.search(r"\b(nhap them|ton kho|restock|inventory)\b", q_norm))
        ans_vi = (
            "• Trước khi quyết định nhập thêm hàng hay đợi bán hết tồn kho, hãy nhìn ngay 2 chỉ số trên đầu trang: 'Số ngày bán hết hàng trong kho' và 'Tỉ lệ lãi mỗi món'.\n"
            "• NÊN NHẬP THÊM khi hàng trong kho chỉ đủ bán dưới 14–20 ngày và sức mua đang tăng.\n"
            "• NÊN ĐỢI HOẶC XẢ KHO BỚT (giảm thử 10%–15%) khi hàng tồn đủ bán trên 45 ngày để tránh chôn tiền mặt."
            if is_restock
            else "• Bạn có thể xem ngay bảng 'Sức khỏe cửa hàng & 3 việc cần chú ý ngay' ở ngay đầu màn hình để biết mặt hàng nào đang lãi tốt, món nào sắp cạn kho hoặc đang tồn lâu.\n• Chọn nhanh một nút 'Chạy thử phương án' trên các thẻ cảnh báo để xem tác động bằng số thật từ dữ liệu shop."
        )
        ans_en = (
            "• Check 'Stock days cover' and 'Gross margin %' at the top of the workspace: restock early if cover is below ~14–20 days; test a 10%–15% markdown first if stock covers 45+ days."
            if is_restock
            else "• Look at the 'Store Health Snapshot & Top 3 Priority Actions' panel right at the top of the screen to see margins, stock safety, and slow movers across your catalog."
        )
        return NLQParseFallback(
            error=(
                "Chưa có mức % đổi giá cụ thể; hệ thống hiển thị hướng dẫn chẩn đoán theo dữ liệu shop."
                if lang == "vi"
                else "No explicit price change % detected; showing store health guidance."
            ),
            fallback="manual_form",
            guidance_type="store_health" if not is_restock else "ambiguous_advice",
            helpful_answer=ans_vi if lang == "vi" else ans_en,
            suggested_scenarios=_default_strategy_presets(lang),
        )

    return None


def _llm_semantic_plan(
    question: str,
    catalog: List[CatalogItem],
    llm_client: LLMClient,
) -> Optional[Dict[str, Any]]:
    """Use configured LLM as a semantic retail timeline & intent planner (zero math)."""
    catalog_list = [{"product_id": c.product_id, "name": c.name} for c in catalog]
    events_info = {k: {"demand_mult": v.demand_multiplier, "elasticity_mult": v.elasticity_multiplier} for k, v in EVENT_PROFILES.items()}
    sys_prompt = (
        "You are a semantic retail pricing planner extracting structured intent from a shop owner's question.\n"
        "NEVER invent or round out extreme bounds — keep exact numbers stated by the user so validation guardrails can reject out-of-range inputs.\n"
        f"Available catalog: {catalog_list}\n"
        f"Available retail events: {events_info}\n"
        "Return strict JSON with keys:\n"
        '- "product_id": matching product_id from catalog, or null if user wrote generic "sản phẩm"/"product" or unknown item\n'
        '- "question_type": one of "yes_no_feasibility", "what_if_scenario", "schedule_plan", "reverse_goal"\n'
        '- "decision_goal": "clear_inventory" if asking about clearing slow stock, freeing locked capital, capital turnover, or warehouse age; otherwise "maximize_profit"\n'
        '- "inventory_age_days": optional integer >= 0 if user mentions how many days/months stock has sat in warehouse (never confuse this with active campaign days)\n'
        '- "event_key": one of "tet", "double_sale", "black_friday", "gifting", or null\n'
        '- "delay_days": integer >= 0 (e.g. if user says "60 ngày nữa là Tết, vào 7 ngày từ 60 ngày nữa...", delay_days=60, active_days=7)\n'
        '- "active_days": integer (duration of the price intervention window; default 30 if single horizon)\n'
        '- "change_value": signed float price change % (negative for discount, positive for raise; null if unclear)\n'
        '- "target_uplift_pct": optional float if question_type == "reverse_goal"\n'
        '- "schedule": optional explicit array of {days, start_change_pct, daily_step_pct, relative_to_prev, compound_daily_step, step_on_first_day, demand_multiplier, elasticity_multiplier, label}\n'
        '- "assumptions_summary": 1 concise sentence in user language summarizing the parsed timeline & seasonal context'
    )
    res = llm_client.complete_json(sys_prompt, f"Question: {question}")
    return res if isinstance(res, dict) else None


def parse_question(
    question: str,
    catalog: List[CatalogItem],
    client: Optional[LLMClient] = None,
    active_product_id: Optional[str] = None,
) -> Union[DecisionSpec, NLQParseFallback]:
    """Parse a business manager's natural language question into DecisionSpec or fallback.

    Args:
        question: Natural language query string.
        catalog: Product catalog containing product_id and name only.
        client: Optional LLMClient instance (for live LLM-assisted semantic extraction).
        active_product_id: Optional active SKU from UI when user writes generic "sản phẩm".

    Returns:
        DecisionSpec on valid extraction, or NLQParseFallback on error/out-of-range/unknown product.
    """
    if not question or len(question.strip()) < 3:
        return NLQParseFallback(error="Question is empty or too short.", fallback="manual_form")

    q_norm = strip_accents(question)
    lang = detect_language(question)
    decision_goal = detect_decision_goal(question)
    inv_age_days, q_for_horizon = extract_inventory_age_days(question)

    # Check for out-of-scope non-price % levers, multi-option capital questions, or educational prompts
    guidance = detect_non_price_or_guidance(question, lang)
    if guidance is not None:
        return guidance

    matched_item, _ = match_product_in_catalog(question, catalog)

    # Resolve generic 'sản phẩm' ONLY when UI provides active_product_id (never silently guess random SKU)
    if matched_item is None and active_product_id and _mentions_generic_product(q_norm):
        for item in catalog:
            if item.product_id == active_product_id:
                matched_item = item
                break

    event_prof = detect_event_profile(question)
    llm_client = client or LLMClient()

    # 1. Try explicit multi-phase clause grammar first (e.g., "15 ngày đầu -30%, 15 ngày sau +1%/ngày")
    schedule_phases, sched_avg_pct, sched_days, sched_err = extract_schedule_rule(q_for_horizon)
    if sched_err is not None:
        return NLQParseFallback(error=sched_err, fallback="manual_form")
    if schedule_phases is not None and sched_avg_pct is not None:
        if matched_item is None and len(catalog) == 1:
            matched_item = catalog[0]
        if matched_item is None:
            return NLQParseFallback(
                error=(
                    "Chưa rõ bạn đang hỏi cho sản phẩm nào. Hãy ghi kèm tên hoặc mã món (ví dụ P01)."
                    if lang == "vi"
                    else "Could not identify a matching product in your uploaded catalog."
                ),
                fallback="manual_form",
            )
        q_type = detect_question_type(question, is_schedule=True)
        try:
            return DecisionSpec(
                product_id=matched_item.product_id,
                change_type="price_schedule",
                change_value=sched_avg_pct,
                horizon_days=int(sched_days),
                schedule=schedule_phases,
                detected_language=lang,
                question_type=q_type,
                baseline_period_days=30,
                decision_goal=decision_goal,
                inventory_age_days=inv_age_days,
            )
        except ValidationError as val_err:
            return NLQParseFallback(
                error=f"Requested schedule parameters out of allowed bounds: {val_err.errors()[0]['msg']}",
                fallback="manual_form",
            )

    # 2. LLM-First Semantic Agent Planner when configured (true semantic NLU + strict validation)
    llm_plan: Optional[Dict[str, Any]] = None
    if llm_client.is_configured():
        llm_plan = _llm_semantic_plan(question, catalog, llm_client)
        if llm_plan:
            if decision_goal != "clear_inventory" and llm_plan.get("decision_goal") == "clear_inventory":
                decision_goal = "clear_inventory"
            if inv_age_days is None and llm_plan.get("inventory_age_days") is not None:
                try:
                    parsed_age = int(llm_plan["inventory_age_days"])
                    if 0 <= parsed_age <= 1095:
                        inv_age_days = parsed_age
                except (ValueError, TypeError):
                    pass
            if matched_item is None and llm_plan.get("product_id"):
                pid_str = str(llm_plan["product_id"])
                for item in catalog:
                    if item.product_id == pid_str:
                        matched_item = item
                        break
            if matched_item is None and active_product_id and _mentions_generic_product(q_norm):
                for item in catalog:
                    if item.product_id == active_product_id:
                        matched_item = item
                        break

            llm_ev_key = str(llm_plan.get("event_key") or "").strip().lower()
            if llm_ev_key in EVENT_PROFILES:
                event_prof = EVENT_PROFILES[llm_ev_key]

            raw_delay = llm_plan.get("delay_days")
            raw_active = llm_plan.get("active_days")
            raw_change = llm_plan.get("change_value")
            llm_q_type = llm_plan.get("question_type")
            if llm_q_type not in ("yes_no_feasibility", "what_if_scenario", "schedule_plan", "reverse_goal"):
                llm_q_type = detect_question_type(question)

            # Build event-aware delayed schedule from LLM semantic slots if delay_days or event present
            if matched_item is not None and raw_change is not None and (raw_delay or event_prof):
                try:
                    c_val = float(raw_change)
                    d_days = int(raw_delay or 0)
                    a_days = int(raw_active or (7 if d_days > 0 else 14))
                    if -50.0 <= c_val <= 100.0 and d_days >= 0 and a_days >= 1:
                        d_mult = event_prof.demand_multiplier if event_prof else 1.0
                        e_mult = event_prof.elasticity_multiplier if event_prof else 1.0
                        ev_name = (event_prof.label_vi if lang == "vi" else event_prof.label_en) if event_prof else (
                            "giai đoạn đổi giá" if lang == "vi" else "target window"
                        )
                        built_phases: List[SchedulePhase] = []
                        if d_days > 0 and (d_days + a_days) <= 90:
                            built_phases.append(
                                SchedulePhase(
                                    days=d_days,
                                    start_change_pct=0.0,
                                    demand_multiplier=1.0,
                                    elasticity_multiplier=1.0,
                                    label=(f"{d_days} ngày bình thường" if lang == "vi" else f"{d_days} normal days"),
                                )
                            )
                            built_phases.append(
                                SchedulePhase(
                                    days=a_days,
                                    start_change_pct=c_val,
                                    demand_multiplier=d_mult,
                                    elasticity_multiplier=e_mult,
                                    label=(f"{a_days} ngày {ev_name} ({c_val:+.1f}%)" if lang == "vi" else f"{a_days} {ev_name} days ({c_val:+.1f}%)"),
                                )
                            )
                        elif 7 <= a_days <= 90:
                            built_phases.append(
                                SchedulePhase(
                                    days=a_days,
                                    start_change_pct=c_val,
                                    demand_multiplier=d_mult,
                                    elasticity_multiplier=e_mult,
                                    label=(f"{a_days} ngày {ev_name}" if lang == "vi" else f"{a_days} {ev_name} days"),
                                )
                            )
                        if built_phases:
                            avg_pct, total_d, err = _expand_and_validate_schedule(built_phases)
                            if err is None and avg_pct is not None:
                                ev_ctx = {
                                    "event_key": event_prof.key if event_prof else "delayed_window",
                                    "event_label": ev_name,
                                    "delay_days": d_days,
                                    "active_days": a_days,
                                    "demand_multiplier": d_mult,
                                    "elasticity_multiplier": e_mult,
                                    "note": (event_prof.note_vi if lang == "vi" else event_prof.note_en) if event_prof else "",
                                }
                                return DecisionSpec(
                                    product_id=matched_item.product_id,
                                    change_type="price_schedule",
                                    change_value=avg_pct,
                                    horizon_days=total_d,
                                    schedule=built_phases,
                                    detected_language=lang,
                                    question_type=llm_q_type,
                                    baseline_period_days=30,
                                    event_context=ev_ctx,
                                    decision_goal=decision_goal,
                                    inventory_age_days=inv_age_days,
                                    assumptions_summary=llm_plan.get("assumptions_summary"),
                                )
                except (ValueError, TypeError, ValidationError):
                    pass

            # Explicit multi-phase schedule returned by LLM
            if llm_plan.get("schedule") and isinstance(llm_plan["schedule"], list) and len(llm_plan["schedule"]) >= 1 and matched_item is not None:
                try:
                    llm_phases = [SchedulePhase(**ph) for ph in llm_plan["schedule"]]
                    avg_pct, total_d, err = _expand_and_validate_schedule(llm_phases)
                    if err is None and avg_pct is not None:
                        return DecisionSpec(
                            product_id=matched_item.product_id,
                            change_type="price_schedule",
                            change_value=avg_pct,
                            horizon_days=total_d,
                            schedule=llm_phases,
                            detected_language=lang,
                            question_type=llm_q_type,
                            baseline_period_days=30,
                            decision_goal=decision_goal,
                            inventory_age_days=inv_age_days,
                            assumptions_summary=llm_plan.get("assumptions_summary"),
                        )
                except Exception:
                    pass

    # 3. Deterministic Semantic Rule Engine (offline parity & strict guardrails)
    change_val = extract_change_pct_rule(question)
    if change_val is None and llm_plan and llm_plan.get("change_value") is not None:
        try:
            change_val = float(llm_plan["change_value"])
        except (ValueError, TypeError):
            pass

    q_type = detect_question_type(question)

    # Try delayed/event schedule extraction (e.g. "60 ngày nữa là Tết, vào 7 ngày từ 60 ngày nữa tăng 15%")
    ev_phases, ev_avg, ev_days, ev_ctx, ev_summary_or_err = extract_delayed_event_rule(
        q_for_horizon, change_val, event_prof, lang
    )
    if ev_phases is not None and ev_avg is not None and ev_days is not None:
        if matched_item is None and len(catalog) == 1:
            matched_item = catalog[0]
        if matched_item is None:
            return NLQParseFallback(
                error=(
                    "Chưa rõ bạn muốn hỏi cho sản phẩm nào. Hãy chọn sản phẩm hoặc gõ tên/mã (ví dụ P01)."
                    if lang == "vi"
                    else "Could not identify a matching product in your uploaded catalog."
                ),
                fallback="manual_form",
            )
        try:
            return DecisionSpec(
                product_id=matched_item.product_id,
                change_type="price_schedule",
                change_value=ev_avg,
                horizon_days=ev_days,
                schedule=ev_phases,
                detected_language=lang,
                question_type=q_type if q_type != "what_if_scenario" else "schedule_plan",
                baseline_period_days=30,
                event_context=ev_ctx,
                decision_goal=decision_goal,
                inventory_age_days=inv_age_days,
                assumptions_summary=ev_summary_or_err,
            )
        except ValidationError as val_err:
            return NLQParseFallback(
                error=f"Requested schedule parameters out of allowed bounds: {val_err.errors()[0]['msg']}",
                fallback="manual_form",
            )

    # Handle reverse_goal questions (e.g. "muốn lãi tăng 20% thì bán giá nào?")
    if q_type == "reverse_goal" and change_val is None:
        m_goal = re.search(r"([+-]?\s*\d+(?:[.,]\d+)?)\s*(%|phan tram|percent)", q_norm)
        target_uplift = float(m_goal.group(1).replace(" ", "").replace(",", ".")) if m_goal else 10.0
        if matched_item is None and len(catalog) == 1:
            matched_item = catalog[0]
        if matched_item is None:
            return NLQParseFallback(
                error="Could not identify a matching product in your uploaded catalog.",
                fallback="manual_form",
            )
        return DecisionSpec(
            product_id=matched_item.product_id,
            change_type="price_pct",
            change_value=0.0,
            horizon_days=30,
            detected_language=lang,
            question_type="reverse_goal",
            target_uplift_pct=target_uplift,
            decision_goal=decision_goal,
            inventory_age_days=inv_age_days,
            assumptions_summary=(
                f"Tìm mức giá tối ưu để tiền lãi tăng khoảng {target_uplift:.0f}%."
                if lang == "vi"
                else f"Finding best price to grow profit by {target_uplift:.0f}%."
            ),
        )

    horizon_days, horizon_err = extract_horizon_days_rule(q_for_horizon)
    if llm_plan and llm_plan.get("active_days") is not None and horizon_err is None:
        try:
            horizon_days = int(llm_plan["active_days"])
        except (ValueError, TypeError):
            pass

    # 4. Strict Rejection Guardrails
    if horizon_err is not None:
        return NLQParseFallback(error=horizon_err, fallback="manual_form")

    if matched_item is None:
        return NLQParseFallback(
            error=(
                "Chưa nhận ra sản phẩm bạn muốn hỏi trong danh mục. Hãy nêu rõ mã hoặc tên sản phẩm (ví dụ P01, Áo thun basic)."
                if lang == "vi"
                else "Could not identify a matching product in your uploaded catalog."
            ),
            fallback="manual_form",
        )

    if change_val is None:
        if decision_goal == "clear_inventory":
            age_note = (
                (f" (tuổi tồn kho {inv_age_days} ngày)" if lang == "vi" else f" (stock age {inv_age_days} days)")
                if inv_age_days is not None
                else ""
            )
            clearance_presets = [
                SuggestedScenarioPreset(
                    id="clr_10",
                    label=(f"Giảm nhẹ −10% xả kho (14 ngày)" if lang == "vi" else "Mild clearance −10% (14d)"),
                    price_change_pct=-10.0,
                    horizon_days=14,
                    decision_goal="clear_inventory",
                    inventory_age_days=inv_age_days,
                ),
                SuggestedScenarioPreset(
                    id="clr_15",
                    label=(f"Xả kho −15% xoay vòng vốn (14 ngày)" if lang == "vi" else "Clearance −15% cash turn (14d)"),
                    price_change_pct=-15.0,
                    horizon_days=14,
                    decision_goal="clear_inventory",
                    inventory_age_days=inv_age_days,
                ),
                SuggestedScenarioPreset(
                    id="clr_25",
                    label=(f"Xả mạnh −25% thu hồi tiền nhanh (14 ngày)" if lang == "vi" else "Deep clearance −25% (14d)"),
                    price_change_pct=-25.0,
                    horizon_days=14,
                    decision_goal="clear_inventory",
                    inventory_age_days=inv_age_days,
                ),
            ]
            return NLQParseFallback(
                error=(
                    "Bạn chưa ghi rõ mức giảm % dự kiến — chọn nhanh 1 mức xả kho bên dưới để máy tính thử ngay."
                    if lang == "vi"
                    else "No explicit markdown % detected — click a clearance preset below to run right away."
                ),
                fallback="manual_form",
                guidance_type="ambiguous_advice",
                helpful_answer=(
                    f"Để quyết định có nên xả kho{age_note} cho {matched_item.product_id} hay không, hãy chọn thử 1 mức giảm giá bên dưới — máy sẽ kiểm tra giúp bạn: (1) có còn hoàn đủ giá nhập và có lãi không, (2) bán nhanh hơn bao nhiêu món và (3) thu hồi sớm bao nhiêu tiền vốn."
                    if lang == "vi"
                    else f"To decide on clearing {matched_item.product_id}{age_note}, test one of the markdown levels below to inspect cost recovery, extra units cleared, and cash unlocked."
                ),
                suggested_scenarios=clearance_presets,
            )
        return NLQParseFallback(
            error=(
                "Chưa thấy mức tăng/giảm giá cụ thể (ví dụ +10% hoặc giảm 15%)."
                if lang == "vi"
                else "Could not identify a target percentage price change (e.g., +10% or -15%)."
            ),
            fallback="manual_form",
        )

    summary_note: Optional[str] = None
    if decision_goal == "clear_inventory":
        age_txt_vi = f", hàng đã tồn {inv_age_days} ngày" if inv_age_days is not None else ""
        age_txt_en = f", stock age {inv_age_days} days" if inv_age_days is not None else ""
        summary_note = (
            f"Đánh giá theo mục tiêu Xả kho & Xoay vòng vốn ({change_val:+.0f}% trong {int(horizon_days)} ngày{age_txt_vi})."
            if lang == "vi"
            else f"Evaluated for Clearance & Capital Rotation ({change_val:+.0f}% over {int(horizon_days)} days{age_txt_en})."
        )

    # 5. Pydantic Validation (enforces change_value in [-50, 100] and horizon_days in [7, 90])
    try:
        return DecisionSpec(
            product_id=matched_item.product_id,
            change_type="price_pct",
            change_value=round(float(change_val), 2),
            horizon_days=int(horizon_days),
            detected_language=lang,
            question_type=q_type,
            decision_goal=decision_goal,
            inventory_age_days=inv_age_days,
            assumptions_summary=summary_note,
        )
    except ValidationError as val_err:
        return NLQParseFallback(
            error=f"Requested simulation parameters out of allowed bounds: {val_err.errors()[0]['msg']}",
            fallback="manual_form",
        )
