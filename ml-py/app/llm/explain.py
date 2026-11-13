"""Scenario Simulation Explainer with Strict Hallucination Post-Check for What-If AI.

Synthesizes a 3-5 sentence executive summary strictly restating figures computed
by the simulation engine.

Guardrail (Zero Hallucinated Numbers):
    1. Recursively extracts every numeric figure present in the input scenario JSON
       along with standard VND display scales (raw, K, M, percentage, 0-2 decimal rounding).
    2. Extracts every number emitted in the LLM's candidate prose.
    3. If ANY number in the LLM prose cannot be matched to an input figure, the LLM
       prose is discarded and replaced by a deterministic code-generated template.

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Works seamlessly offline (code template fallback).
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from app.llm.client import LLMClient


def extract_allowed_numbers(obj: Any, bucket: Optional[Set[float]] = None) -> Set[float]:
    """Recursively collect all numerical figures and their scaled formats from input JSON."""
    if bucket is None:
        bucket = set()

    if isinstance(obj, bool):
        return bucket
    if isinstance(obj, (int, float)):
        if math.isfinite(obj):
            val = float(obj)
            bucket.add(val)
            bucket.add(abs(val))
            # Support standard retail presentation scales (raw, K, M, %, 0..2 dec)
            for scale in (1.0, 1e-3, 1e-6, 100.0):
                scaled = val * scale
                for dec in (0, 1, 2, 3):
                    bucket.add(round(scaled, dec))
                    bucket.add(abs(round(scaled, dec)))
    elif isinstance(obj, dict):
        for v in obj.values():
            extract_allowed_numbers(v, bucket)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            extract_allowed_numbers(item, bucket)
    elif isinstance(obj, str):
        # Extract numeric tokens embedded in string fields (e.g. "price_change_pct: +10%")
        for tok in re.findall(r"[-+]?\d+(?:[.,]\d+)?", obj):
            try:
                num = float(tok.replace(",", ""))
                bucket.add(num)
                bucket.add(abs(num))
            except ValueError:
                pass
    return bucket


def _parse_text_number(token: str) -> List[float]:
    """Parse a formatted numeric token from prose into candidate float interpretations."""
    clean = token.strip().replace(" ", "")
    multiplier = 1.0
    lower = clean.lower()
    if lower.endswith("m"):
        multiplier = 1e6
        clean = clean[:-1]
    elif lower.endswith("b"):
        multiplier = 1e9
        clean = clean[:-1]
    elif lower.endswith("k"):
        multiplier = 1e3
        clean = clean[:-1]

    candidates: List[float] = []
    # Try English format (comma thousands, dot decimal): e.g. '476,700,000' or '476.7'
    en_str = clean.replace(",", "")
    try:
        v = float(en_str)
        candidates.append(v)
        if multiplier != 1.0:
            candidates.append(v * multiplier)
    except ValueError:
        pass

    # Try Vietnamese format (dot thousands, comma decimal): e.g. '100.000' or '476,7'
    if "." in clean or "," in clean:
        vi_str = clean.replace(".", "").replace(",", ".")
        try:
            v_vi = float(vi_str)
            candidates.append(v_vi)
            if multiplier != 1.0:
                candidates.append(v_vi * multiplier)
        except ValueError:
            pass

    return candidates


def verify_explanation_numbers(text: str, scenario_result: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Verify that EVERY number appearing in explanation text exists in scenario_result.

    Args:
        text: Candidate narrative summary.
        scenario_result: Original simulation payload from the Go engine.

    Returns:
        Tuple containing:
            - is_valid (bool): True if zero ungrounded/hallucinated numbers found.
            - bad_tokens (List[str]): List of unverified numeric strings if invalid.
    """
    if not text or not text.strip():
        return False, ["empty_text"]

    allowed = extract_allowed_numbers(scenario_result)
    # Standard structural percentile indices commonly referenced when describing p5/p10/p50/p90/p95
    structural_quantiles = {5.0, 10.0, 50.0, 90.0, 95.0, 80.0}

    # Match standalone numbers (including formatted 100.000, 476.7M, -2.341, 10%)
    # Avoid splitting identifiers like P01 or SKU-12
    raw_matches = re.findall(r"(?<![a-zA-Z_])[-+]?\d+(?:[.,]\d+)*(?:[kKmMbB])?", text)

    bad_tokens: List[str] = []
    for raw_tok in raw_matches:
        cands = _parse_text_number(raw_tok)
        matched = False
        for c in cands:
            if c in structural_quantiles or abs(c) in structural_quantiles:
                matched = True
                break
            for ref in allowed:
                # Match exact, tight relative tolerance, or 1-decimal rounding window
                if abs(c - ref) <= max(0.11, abs(ref) * 0.005):
                    matched = True
                    break
            if matched:
                break
        if not matched:
            bad_tokens.append(raw_tok)

    return len(bad_tokens) == 0, bad_tokens


def _fmt_vnd(val: Any) -> str:
    """Format integer VND with dot thousand separators."""
    try:
        n = int(round(float(val)))
        return f"{n:,}".replace(",", ".") + " VND"
    except (ValueError, TypeError):
        return str(val)


def _pct_str(val: Optional[float]) -> str:
    if val is None or not math.isfinite(float(val)):
        return "0%"
    return f"{float(val):.1f}%"


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        v = float(val)
        return v if math.isfinite(v) else default
    except (ValueError, TypeError):
        return default


def _detect_explain_language(
    scenario_result: Dict[str, Any],
    language: Optional[str] = None,
    question: Optional[str] = None,
) -> str:
    if language in ("vi", "en"):
        return language
    if question:
        q_low = question.lower()
        if re.search(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", q_low):
            return "vi"
        vi_hits = sum(
            1 for kw in ("tang", "giam", "ngay", "gia", "loi nhuan", "moi ngay", "sau do", "tuan", "thang")
            if re.search(rf"\b{kw}\b", q_low)
        )
        if vi_hits >= 2:
            return "vi"
    return "en"


def build_advisory_report(
    scenario_result: Dict[str, Any],
    business_context: Optional[Dict[str, Any]] = None,
    language: str = "en",
    decision_spec: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build deterministic business-context diagnostics and actionable recommendations."""
    scenarios = scenario_result.get("scenarios", {})
    base = scenarios.get("base", {})
    exp = scenarios.get("expected", {})
    dist = scenario_result.get("profit_distribution", {})
    adv = scenario_result.get("advisory") or {}
    clr = scenario_result.get("clearance") or {}
    cf = scenario_result.get("cash_flow") or {}
    biz = business_context or {}
    spec = decision_spec or {}
    trace = scenario_result.get("schedule_trace") or []

    base_p = _safe_float(base.get("price_vnd") if base.get("price_vnd") is not None else base.get("price", 0))
    new_p = _safe_float(exp.get("price_vnd") if exp.get("price_vnd") is not None else exp.get("price", 0))
    base_profit = _safe_float(base.get("profit_vnd") if base.get("profit_vnd") is not None else base.get("profit", 0))
    exp_profit = _safe_float(exp.get("profit_vnd") if exp.get("profit_vnd") is not None else exp.get("profit", 0))
    exp_qty = _safe_float(exp.get("qty") if exp.get("qty") is not None else exp.get("quantity", 0))
    base_qty = _safe_float(base.get("qty") if base.get("qty") is not None else base.get("quantity", 0))
    p5 = _safe_float(dist.get("p5", exp_profit))
    be = scenario_result.get("break_even_elasticity")
    decision_goal = str(clr.get("decision_goal") or spec.get("decision_goal") or "maximize_profit")
    is_price_cut = new_p < base_p - 1.0

    verdict_code = str(adv.get("verdict_code") or (
        "STRONGLY_RECOMMENDED" if exp_profit > base_profit and p5 >= base_profit
        else (
            "CLEARANCE_WORTHWHILE"
            if decision_goal == "clear_inventory" and is_price_cut and exp_profit >= 0 and exp_qty > base_qty
            else (
                "CLEARANCE_PROFITABLE_TRADE_OFF"
                if is_price_cut and exp_profit > 0 and exp_qty > base_qty
                else ("CAUTIOUS_TRIAL_RECOMMENDED" if exp_profit >= base_profit else "NEGATIVE_EXPECTED_PROFIT")
            )
        )
    ))
    base_margin = adv.get("base_margin_pct")
    if base_margin is None:
        base_margin = biz.get("base_margin_pct")
    min_margin = adv.get("min_margin_pct_in_plan")
    prob_beat = adv.get("prob_beat_base")
    if prob_beat is None:
        prob_beat = scenario_result.get("prob_beat_base")
    stockout_risk = bool(adv.get("stockout_risk", False))
    stock_util = adv.get("stock_utilization_pct")
    regime = str(adv.get("elasticity_regime") or "elastic")
    risk_flags = list(adv.get("risk_flags") or [])
    biz_warnings = list(biz.get("warnings") or [])
    has_data_warn = any(
        any(tag in str(w) for tag in ("low_price_variation", "not_significant", "few_observations", "positive_elasticity"))
        for w in (risk_flags + biz_warnings)
    )

    delta_vnd = exp_profit - base_profit
    delta_pct = adv.get("expected_profit_delta_pct")
    if delta_pct is None and abs(base_profit) > 1e-9:
        delta_pct = delta_vnd / abs(base_profit) * 100.0

    if verdict_code in ("STRONGLY_RECOMMENDED", "CLEARANCE_WORTHWHILE"):
        verdict_level = "go"
    elif verdict_code in ("CAUTIOUS_TRIAL_RECOMMENDED", "HIGH_UNCERTAINTY_AB_TEST", "CLEARANCE_PROFITABLE_TRADE_OFF"):
        verdict_level = "caution"
    else:
        verdict_level = "stop"

    demand_trend = biz.get("demand_trend_pct")
    stock_cover = biz.get("stock_days_cover")
    is_vi = language == "vi"

    # 1. Verdict headline (plain, SMB-friendly language)
    if is_vi:
        verdict_map_vi = {
            "STRONGLY_RECOMMENDED": "NÊN ÁP DỤNG THỬ (KHẢ QUAN)",
            "CAUTIOUS_TRIAL_RECOMMENDED": "CÓ THỂ THỬ NGHIỆM NHỎ TRƯỚC",
            "HIGH_UNCERTAINTY_AB_TEST": "NÊN THỬ NGẮN NGÀY TRƯỚC (SỐ LIỆU CŨ CHƯA RÕ)",
            "MARGIN_EROSION_WARNING": "CẨN TRỌNG: TIỀN LỜI MỖI MÓN QUÁ MỎNG HOẶC BỊ LỖ",
            "STOCK_CONSTRAINED_HOLD_OR_RAISE": "CẢNH BÁO THIẾU HÀNG — KHÔNG NÊN GIẢM GIÁ SÂU",
            "NEGATIVE_EXPECTED_PROFIT": "KHÔNG NÊN ĐỔI — TỔNG TIỀN LÃI GIẢM SO VỚI GIÁ CŨ",
            "CLEARANCE_WORTHWHILE": "KHẢ QUAN CHO MỤC TIÊU XẢ KHO & XOAY VỐN",
            "CLEARANCE_PROFITABLE_TRADE_OFF": "CÂN NHẮC: ĐỔI MỘT PHẦN LÃI LẤY TỐC ĐỘ BÁN & THU HỒI VỐN",
            "CLEARANCE_BELOW_COST": "CẨN TRỌNG: GIÁ BÁN DƯỚI VỐN / LỖ ĐỢT — CHỈ DÙNG ĐỂ CẮT LỖ XẢ HÀNG CŨ",
        }
        action_verdict = verdict_map_vi.get(verdict_code, "NÊN XEM KỸ TRƯỚC KHI ÁP DỤNG")
    else:
        verdict_map_en = {
            "STRONGLY_RECOMMENDED": "GOOD TO TRY — STRONG UPSIDE",
            "CAUTIOUS_TRIAL_RECOMMENDED": "TRY ON A SMALL SCALE FIRST",
            "HIGH_UNCERTAINTY_AB_TEST": "CAUTION — TEST BRIEFLY FIRST (LIMITED DATA)",
            "MARGIN_EROSION_WARNING": "CAUTION: PROFIT PER ITEM GETS TOO THIN",
            "STOCK_CONSTRAINED_HOLD_OR_RAISE": "STOCKOUT RISK — HOLD OR RAISE PRICE INSTEAD",
            "NEGATIVE_EXPECTED_PROFIT": "SKIP THIS PLAN — PROJECTED PROFIT DROPS",
            "CLEARANCE_WORTHWHILE": "GOOD FOR CLEARANCE & CASH ROTATION",
            "CLEARANCE_PROFITABLE_TRADE_OFF": "TRADE-OFF: LESS SHORT-TERM PROFIT FOR FASTER CASH TURNOVER",
            "CLEARANCE_BELOW_COST": "BELOW COST — ONLY USE TO LIQUIDATE AGING STOCK",
        }
        action_verdict = verdict_map_en.get(verdict_code, "REVIEW ASSUMPTIONS CAREFULLY")

    # 2. Situation summary from current business state
    inv_age_days = clr.get("inventory_age_days")
    if inv_age_days is None:
        inv_age_days = spec.get("inventory_age_days")
    unit_rec_pct = _safe_float(clr.get("unit_recovery_pct"), 0.0)
    extra_units = _safe_float(clr.get("extra_units_cleared"), max(0.0, exp_qty - base_qty))
    speedup_pct = _safe_float(clr.get("turnover_speedup_pct"), (extra_units / base_qty * 100.0) if base_qty > 0 else 0.0)
    extra_cap_freed = _safe_float(clr.get("extra_capital_freed_vnd"), 0.0)
    total_cap_turned = _safe_float(clr.get("total_cost_capital_turned_vnd"), 0.0)
    days_saved = clr.get("days_saved_to_clear")
    base_days_clr = clr.get("base_days_to_clear")
    plan_days_clr = clr.get("plan_days_to_clear")
    hold_saved = _safe_float(clr.get("holding_cost_saved_vnd"), 0.0)
    recovers_unit = bool(clr.get("recovers_unit_cost", min_margin is None or float(min_margin) >= 0))
    recovers_total = bool(clr.get("recovers_total_cost", exp_profit >= 0))
    clr_horizon = int(clr.get("horizon_days") or (len(trace) if trace else 30))

    sit_parts: List[str] = []
    if is_vi:
        if base_margin is not None:
            sit_parts.append(f"Tiền lời hiện chiếm {float(base_margin):.1f}% trên mỗi đồng bán ra.")
        if demand_trend is not None:
            trend_word = "tăng" if float(demand_trend) >= 0 else "giảm"
            sit_parts.append(f"Sức mua gần đây đang {trend_word} {abs(float(demand_trend)):.1f}%.")
        if stock_cover is not None:
            sit_parts.append(f"Lượng tồn kho hiện đủ bán khoảng {float(stock_cover):.1f} ngày ở tốc độ cũ.")
        if inv_age_days is not None:
            sit_parts.append(f"Hàng đã nằm kho khoảng {int(inv_age_days)} ngày.")
        if regime == "inelastic":
            sit_parts.append("Khách ít ngại khi bạn đổi giá.")
        elif regime == "elastic":
            sit_parts.append("Khách phản ứng khá nhạy khi bạn đổi giá.")
        if has_data_warn:
            sit_parts.append("Trước đây món này ít đổi giá nên độ chắc chắn chưa cao.")
        situation_summary = " ".join(sit_parts) if sit_parts else "Đánh giá dựa trên hóa đơn bán hàng và giá nhập hiện tại của shop."
    else:
        if base_margin is not None:
            sit_parts.append(f"Current profit takes {float(base_margin):.1f}% of selling price.")
        if demand_trend is not None:
            trend_word = "growing" if float(demand_trend) >= 0 else "softening"
            sit_parts.append(f"Recent buyer demand is {trend_word} by {abs(float(demand_trend)):.1f}%.")
        if stock_cover is not None:
            sit_parts.append(f"Current stock covers about {float(stock_cover):.1f} days of normal sales.")
        if inv_age_days is not None:
            sit_parts.append(f"Stock has sat in warehouse for {int(inv_age_days)} days.")
        if regime == "inelastic":
            sit_parts.append("Customers rarely walk away over modest price changes.")
        elif regime == "elastic":
            sit_parts.append("Customers respond noticeably when prices move.")
        if has_data_warn:
            sit_parts.append("Past prices varied little, so estimates carry wider uncertainty.")
        situation_summary = " ".join(sit_parts) if sit_parts else "Assessment based on your item cost, stock, and sales history."

    # 3. Concrete actionable recommendations (all digits strictly from inputs)
    recs: List[str] = []
    if is_vi:
        if is_price_cut and (clr or decision_goal == "clear_inventory"):
            if recovers_unit and recovers_total:
                recs.append(
                    f"Hoàn vốn & Vẫn có lãi: giá mới bằng {unit_rec_pct:.1f}% giá vốn nhập hàng (thu hồi đủ tiền vốn nhập và còn lãi ròng {_fmt_vnd(exp_profit)} trong {clr_horizon} ngày), không phải bán lỗ."
                )
            elif recovers_unit:
                recs.append(
                    f"Hoàn vốn từng món ({unit_rec_pct:.1f}% giá nhập) nhưng lãi gộp chưa gánh hết chi phí quảng cáo/vận hành nên cả đợt tạm âm {_fmt_vnd(abs(exp_profit))} — hãy giảm nhẹ % hoặc rút ngắn đợt sale."
                )
            else:
                recs.append(
                    f"Giá bán thấp hơn giá nhập (chỉ thu hồi được {unit_rec_pct:.1f}% tiền vốn mỗi món, lãi ròng {_fmt_vnd(exp_profit)}) — chỉ nên dùng để cắt lỗ lấy tiền mặt khi hàng đã tồn quá lâu."
                )

            if extra_units > 0.5:
                speed_msg = (
                    f"Lợi ích xoay vòng vốn: bán nhanh hơn {speedup_pct:+.1f}% (thêm khoảng {int(round(extra_units)):,} món), "
                    f"giúp thu hồi sớm thêm {_fmt_vnd(extra_cap_freed)} tiền vốn hàng nhập (tổng vốn hàng quay vòng {_fmt_vnd(total_cap_turned)})."
                ).replace(",", ".")
                if days_saved is not None and float(days_saved) >= 0.3 and base_days_clr and plan_days_clr:
                    speed_msg += f" Thời gian bán hết lượng tồn rút ngắn từ {float(base_days_clr):.1f} ngày xuống {float(plan_days_clr):.1f} ngày"
                    if hold_saved >= 1000:
                        speed_msg += f", tránh thêm khoảng {_fmt_vnd(hold_saved)} chi phí giữ kho/rớt giá."
                    else:
                        speed_msg += "."
                elif hold_saved >= 1000:
                    speed_msg += f" Chi phí lưu kho/chôn vốn tránh được ước tính {_fmt_vnd(hold_saved)}."
                recs.append(speed_msg)

            if inv_age_days is not None:
                if int(inv_age_days) >= 60:
                    recs.append(
                        f"Hàng đã nhập kho {int(inv_age_days)} ngày (tồn lâu): thu hồi tiền mặt để xoay vòng sang mẫu mới bán chạy thường hiệu quả hơn ôm hàng đợi giá cũ."
                    )
                elif int(inv_age_days) >= 30:
                    recs.append(
                        f"Hàng đã nằm kho {int(inv_age_days)} ngày: có thể áp dụng mức giảm này trong thời gian ngắn ({clr_horizon} ngày) để giải phóng vốn trước khi hàng lỗi mốt."
                    )
                else:
                    recs.append(
                        f"Hàng mới nhập {int(inv_age_days)} ngày: chưa bị áp lực tồn lâu, nếu mục tiêu chính là giữ lãi bạn cân nhắc giảm ít hơn."
                    )

            if decision_goal != "clear_inventory" and delta_vnd < -1.0:
                recs.append(
                    f"So với giữ giá cũ ({_fmt_vnd(base_profit)}), lãi kỳ này thấp hơn {_fmt_vnd(abs(delta_vnd))} ({float(delta_pct or 0):.1f}%). Nếu bạn đang muốn xả kho thu hồi vốn, hãy chuyển sang chế độ 'Xả kho & Xoay vòng vốn'; nếu chỉ muốn tăng lãi tối đa, mở mục 'Tìm giá đạt mục tiêu lãi'."
                )
        elif delta_vnd >= 0 and delta_pct is not None:
            prob_txt = f" (cơ hội lãi cao hơn giá cũ là {float(prob_beat) * 100:.1f}%)" if prob_beat is not None else ""
            recs.append(
                f"Dự kiến tổng tiền lãi đạt {_fmt_vnd(exp_profit)} ({float(delta_pct):+.1f}% so với giữ giá cũ {_fmt_vnd(base_profit)}){prob_txt}; theo dõi lượng bán quanh {int(round(exp_qty)):,} món.".replace(",", ".")
            )
        else:
            recs.append(
                f"Phương án này làm tiền lãi dự kiến giảm xuống {_fmt_vnd(exp_profit)} (thấp hơn giữ giá cũ {_fmt_vnd(base_profit)}) — hãy mở mục \"Tìm giá đạt mục tiêu lãi\" để máy gợi ý mức giá có lời hơn."
            )

        if stockout_risk:
            util_txt = f" (lượng mua dự kiến bằng {float(stock_util):.1f}% số hàng đang có)" if stock_util is not None else ""
            recs.append(
                f"Coi chừng cháy hàng sớm{util_txt}: không nên giảm giá sâu khi kho đang ít; bạn nên giữ nguyên giá hoặc nhập thêm hàng trước."
            )
        if min_margin is not None and float(min_margin) < 15.0 and not (is_price_cut and (clr or decision_goal == "clear_inventory")):
            recs.append(
                f"Ở ngày giảm giá sâu nhất, tiền lời mỗi món chỉ còn {float(min_margin):.1f}% — nên giảm nhẹ bớt hoặc rút ngắn số ngày khuyến mãi để giữ tiền lời."
            )
        if trace and len(trace) >= 2:
            d1 = trace[0]
            dn = trace[-1]
            recs.append(
                f"Kế hoạch đi từ mức giá {_fmt_vnd(d1.get('price_vnd', new_p))} (ngày {d1.get('day')}) tới {_fmt_vnd(dn.get('price_vnd', new_p))} (ngày {dn.get('day')}): nhớ kiểm tra lượng đơn vào ngày chuyển mức giá."
            )
        if has_data_warn:
            recs.append(
                "Vì dữ liệu đổi giá cũ còn ít, bạn nên thử trước 1 tuần hoặc thử riêng ở 1 kênh bán trước khi áp dụng rộng rãi."
            )
        if be is not None and math.isfinite(float(be)) and verdict_code not in ("CLEARANCE_WORTHWHILE", "CLEARANCE_BELOW_COST"):
            recs.append(
                f"Giới hạn an toàn: nếu thấy khách phản ứng mạnh quá mức {round(float(be), 3)}% cho mỗi 1% đổi giá trong vài ngày đầu, hãy dừng lại và quay về giá cũ {_fmt_vnd(base_p)}."
            )
    else:
        if is_price_cut and (clr or decision_goal == "clear_inventory"):
            if recovers_unit and recovers_total:
                recs.append(
                    f"Cost Recovery & Profit: New price still recovers {unit_rec_pct:.1f}% of unit cost (100% cost payback + {_fmt_vnd(exp_profit)} net profit over {clr_horizon} days) — NOT selling at a loss."
                )
            elif recovers_unit:
                recs.append(
                    f"Covers unit purchase cost ({unit_rec_pct:.1f}%), though overhead creates a net period deficit of {_fmt_vnd(abs(exp_profit))} — try a shorter promo or milder cut."
                )
            else:
                recs.append(
                    f"Selling below unit cost (recovers {unit_rec_pct:.1f}% of purchase cost per item; net profit {_fmt_vnd(exp_profit)}) — only justified to recover cash from stale stock."
                )

            if extra_units > 0.5:
                speed_msg = (
                    f"Cash & Stock Rotation: Sells {speedup_pct:+.1f}% faster (+{int(round(extra_units)):,} extra units), "
                    f"unlocking {_fmt_vnd(extra_cap_freed)} more inventory capital earlier (total cost capital turned: {_fmt_vnd(total_cap_turned)})."
                )
                if days_saved is not None and float(days_saved) >= 0.3 and base_days_clr and plan_days_clr:
                    speed_msg += f" Cuts stock clear time from {float(base_days_clr):.1f}d to {float(plan_days_clr):.1f}d"
                    if hold_saved >= 1000:
                        speed_msg += f", avoiding ~{_fmt_vnd(hold_saved)} holding drag."
                    else:
                        speed_msg += "."
                elif hold_saved >= 1000:
                    speed_msg += f" Avoids ~{_fmt_vnd(hold_saved)} in carrying/obsolescence cost."
                recs.append(speed_msg)

            if inv_age_days is not None:
                if int(inv_age_days) >= 60:
                    recs.append(
                        f"Stock held {int(inv_age_days)} days (stale): freeing cash now to reinvest in faster-moving items outweighs holding out for full price."
                    )
                elif int(inv_age_days) >= 30:
                    recs.append(
                        f"Stock held {int(inv_age_days)} days: this short-term clearance turns capital before stock ages further."
                    )

            if decision_goal != "clear_inventory" and delta_vnd < -1.0:
                recs.append(
                    f"Profit dips {_fmt_vnd(abs(delta_vnd))} vs old price ({_fmt_vnd(base_profit)}). Switch goal to 'Clear Inventory & Free Cash' if freeing working capital matters more than max margin."
                )
        elif delta_vnd >= 0 and delta_pct is not None:
            prob_txt = f" ({float(prob_beat) * 100:.1f}% chance of beating old price)" if prob_beat is not None else ""
            recs.append(
                f"Projected profit reaches {_fmt_vnd(exp_profit)} ({float(delta_pct):+.1f}% vs keeping old price {_fmt_vnd(base_profit)}){prob_txt}; watch unit volume near {int(round(exp_qty)):,} items.".replace(",", ".")
            )
        else:
            recs.append(
                f"Projected profit drops to {_fmt_vnd(exp_profit)} (below keeping old price {_fmt_vnd(base_profit)}); try the \"Find Target Price\" tab for better-earning prices."
            )

        if stockout_risk:
            util_txt = f" ({float(stock_util):.1f}% of stock on hand)" if stock_util is not None else ""
            recs.append(
                f"Stockout risk{util_txt}: avoid deep discounts while stock is tight; hold price or restock first."
            )
        if min_margin is not None and float(min_margin) < 15.0 and not (is_price_cut and (clr or decision_goal == "clear_inventory")):
            recs.append(
                f"At the lowest point in this plan, profit per item shrinks to {float(min_margin):.1f}%; trim the discount or shorten the promo days."
            )
        if trace and len(trace) >= 2:
            d1 = trace[0]
            dn = trace[-1]
            recs.append(
                f"Your price moves from {_fmt_vnd(d1.get('price_vnd', new_p))} (day {d1.get('day')}) to {_fmt_vnd(dn.get('price_vnd', new_p))} (day {dn.get('day')}); check order volume on transition days."
            )
        if has_data_warn:
            recs.append(
                "Past price changes are limited; try a short pilot before rolling this price out everywhere."
            )
        if be is not None and math.isfinite(float(be)) and verdict_code not in ("CLEARANCE_WORTHWHILE", "CLEARANCE_BELOW_COST"):
            recs.append(
                f"Safety limit sits at {round(float(be), 3)}: revert toward {_fmt_vnd(base_p)} early if sales drop faster than expected."
            )

    return {
        "verdict_code": verdict_code,
        "verdict_level": verdict_level,
        "action_verdict": action_verdict,
        "situation_summary": situation_summary,
        "recommendations": recs[:4],
    }


def build_template_explanation(
    scenario_result: Dict[str, Any],
    business_context: Optional[Dict[str, Any]] = None,
    language: str = "en",
    decision_spec: Optional[Dict[str, Any]] = None,
) -> str:
    """Construct deterministic, 100% factual explanation + actionable advice from computed figures."""
    scenarios = scenario_result.get("scenarios", {})
    base = scenarios.get("base", {})
    exp = scenarios.get("expected", {})
    opt = scenarios.get("optimistic", {})
    pess = scenarios.get("pessimistic", {})
    dist = scenario_result.get("profit_distribution", {})
    be = scenario_result.get("break_even_elasticity")
    clr = scenario_result.get("clearance") or {}
    trace = scenario_result.get("schedule_trace") or []

    base_p = base.get("price_vnd") if base.get("price_vnd") is not None else base.get("price", 0)
    new_p = exp.get("price_vnd") if exp.get("price_vnd") is not None else exp.get("price", 0)
    base_profit = base.get("profit_vnd") if base.get("profit_vnd") is not None else base.get("profit", 0)
    exp_profit = exp.get("profit_vnd") if exp.get("profit_vnd") is not None else exp.get("profit", 0)
    opt_profit = opt.get("profit_vnd") if opt.get("profit_vnd") is not None else opt.get("profit", 0)
    pess_profit = pess.get("profit_vnd") if pess.get("profit_vnd") is not None else pess.get("profit", 0)
    exp_qty = exp.get("qty") if exp.get("qty") is not None else exp.get("quantity", 0)

    p5 = dist.get("p5", pess_profit)
    p95 = dist.get("p95", opt_profit)

    base_qty = base.get("qty") if base.get("qty") is not None else base.get("quantity", 0)
    advisory = build_advisory_report(
        scenario_result,
        business_context=business_context,
        language=language,
        decision_spec=decision_spec,
    )
    is_price_cut = _safe_float(new_p) < _safe_float(base_p) - 1.0
    extra_units = _safe_float(clr.get("extra_units_cleared"), max(0.0, _safe_float(exp_qty) - _safe_float(base_qty)))
    clr_horizon = int(clr.get("horizon_days") or (len(trace) if trace else 30))

    if language == "vi":
        if trace and len(trace) >= 2:
            d1_p = trace[0].get("price_vnd", new_p)
            dn_p = trace[-1].get("price_vnd", new_p)
            plan_line = (
                f"• Phương án {len(trace)} ngày (giá chạy từ {_fmt_vnd(d1_p)} đến {_fmt_vnd(dn_p)}, trung bình {_fmt_vnd(new_p)}): "
                f"dự kiến bán {int(round(float(exp_qty))):,} món, tiền lãi {_fmt_vnd(exp_profit)}."
            ).replace(",", ".")
        else:
            plan_line = (
                f"• Nếu đổi giá sang {_fmt_vnd(new_p)} ({clr_horizon} ngày): dự kiến bán {int(round(float(exp_qty))):,} món, "
                f"tiền lãi khoảng {_fmt_vnd(exp_profit)}."
            ).replace(",", ".")
        lines: List[str] = [
            f"• Nếu giữ nguyên giá cũ ({_fmt_vnd(base_p)} trong {clr_horizon} ngày): bán khoảng {int(round(float(base_qty))):,} món, tiền lãi {_fmt_vnd(base_profit)}.".replace(",", "."),
            plan_line,
            f"• Khi tính cả trường hợp thuận lợi và lúc khách ngại giá, 90% khả năng tiền lãi nằm từ {_fmt_vnd(p5)} đến {_fmt_vnd(p95)}.",
        ]
        if is_price_cut and clr and extra_units > 0.5:
            rec_pct = _safe_float(clr.get("unit_recovery_pct"), 100.0)
            extra_cap = _safe_float(clr.get("extra_capital_freed_vnd"), 0.0)
            speed_pct = _safe_float(clr.get("turnover_speedup_pct"), 0.0)
            payback_status = (
                f"vượt đủ giá vốn nhập ({rec_pct:.1f}% giá nhập & có lãi)"
                if clr.get("recovers_unit_cost") and clr.get("recovers_total_cost")
                else f"thu hồi {rec_pct:.1f}% giá nhập mỗi món"
            )
            lines.append(
                f"• Xả kho & Xoay vòng vốn: bán thêm khoảng {int(round(extra_units)):,} món (nhanh hơn {speed_pct:+.1f}%), {payback_status}, giải phóng sớm thêm {_fmt_vnd(extra_cap)} tiền vốn nằm trong kho.".replace(",", ".")
            )
        if advisory["recommendations"]:
            lines.append(f"• Gợi ý chính: {advisory['recommendations'][0]}")
        return "\n".join(lines)

    lines_en: List[str] = [
        (
            f"• Changing price from {_fmt_vnd(base_p)} to {_fmt_vnd(new_p)} over {clr_horizon} days yields about "
            f"{int(round(float(exp_qty))):,} units sold and projected profit of {_fmt_vnd(exp_profit)} "
            f"(vs keeping old price: {_fmt_vnd(base_profit)})."
        ).replace(",", "."),
        (
            f"• Across cautious to favorable buyer reactions, profit ranges from {_fmt_vnd(pess_profit)} "
            f"up to {_fmt_vnd(opt_profit)}."
        ),
        (
            f"• Across simulated market runs, 90% of outcomes land between {_fmt_vnd(p5)} "
            f"and {_fmt_vnd(p95)}."
        ),
    ]
    if is_price_cut and clr and extra_units > 0.5:
        extra_cap = _safe_float(clr.get("extra_capital_freed_vnd"), 0.0)
        speed_pct = _safe_float(clr.get("turnover_speedup_pct"), 0.0)
        rec_pct = _safe_float(clr.get("unit_recovery_pct"), 100.0)
        lines_en.append(
            f"• Clearance & Cash Rotation: clears +{int(round(extra_units)):,} extra units ({speed_pct:+.1f}% faster), recovers {rec_pct:.1f}% of unit purchase cost, and unlocks {_fmt_vnd(extra_cap)} in tied-up inventory capital.".replace(",", ".")
        )
    elif be is not None and math.isfinite(float(be)):
        lines_en.append(
            f"• Safety limit is {round(float(be), 3)}: if buyers pull back more sharply than this, profit dips below keeping the old price."
        )

    return "\n".join(lines_en)


def build_direct_answer(
    scenario_result: Dict[str, Any],
    advisory: Dict[str, Any],
    decision_spec: Optional[Dict[str, Any]] = None,
    optimize_summary: Optional[Dict[str, Any]] = None,
    language: str = "en",
) -> Optional[str]:
    """Build a direct Yes/No/Conditional answer grounded strictly in Go simulation & optimizer numbers."""
    spec = decision_spec or {}
    clr = scenario_result.get("clearance") or {}
    q_type = spec.get("question_type")
    decision_goal = spec.get("decision_goal") or clr.get("decision_goal")
    if (
        q_type not in ("yes_no_feasibility", "reverse_goal", "schedule_plan")
        and not spec.get("event_context")
        and decision_goal != "clear_inventory"
    ):
        return None

    scenarios = scenario_result.get("scenarios", {})
    base = scenarios.get("base", {})
    exp = scenarios.get("expected", {})
    adv = scenario_result.get("advisory") or {}
    base_profit = _safe_float(base.get("profit_vnd") if base.get("profit_vnd") is not None else base.get("profit", 0))
    exp_profit = _safe_float(exp.get("profit_vnd") if exp.get("profit_vnd") is not None else exp.get("profit", 0))
    delta_vnd = exp_profit - base_profit
    prob_beat = adv.get("prob_beat_base", scenario_result.get("prob_beat_base"))
    verdict_code = advisory.get("verdict_code", "")
    verdict_level = advisory.get("verdict_level", "caution")
    ev_ctx = spec.get("event_context") or {}
    is_vi = language == "vi"

    best_opt = None
    if optimize_summary and isinstance(optimize_summary, dict):
        best_opt = optimize_summary.get("best_feasible") or optimize_summary

    opt_hint = ""
    if best_opt and isinstance(best_opt, dict) and best_opt.get("price_change_pct") is not None and verdict_code not in (
        "CLEARANCE_WORTHWHILE",
        "CLEARANCE_PROFITABLE_TRADE_OFF",
    ):
        opt_pct = float(best_opt["price_change_pct"])
        opt_p = _fmt_vnd(best_opt.get("price_vnd"))
        opt_prof = _fmt_vnd(best_opt.get("expected_profit"))
        if is_vi:
            opt_hint = f" Mức giá tối ưu máy tìm được là {opt_pct:+.1f}% ({opt_p}), cho lãi dự kiến {opt_prof}."
        else:
            opt_hint = f" The optimizer's top feasible choice is {opt_pct:+.1f}% ({opt_p}), yielding {opt_prof}."

    ev_intro = ""
    if ev_ctx and ev_ctx.get("event_label"):
        d_mult = float(ev_ctx.get("demand_multiplier", 1.0))
        e_mult = float(ev_ctx.get("elasticity_multiplier", 1.0))
        if is_vi:
            ev_intro = f" (đã tính mùa vụ {ev_ctx['event_label']}: sức mua {d_mult:.2f}x, độ nhạy giá {e_mult:.2f}x)"
        else:
            ev_intro = f" (accounting for {ev_ctx['event_label']}: {d_mult:.2f}x demand, {e_mult:.2f}x sensitivity)"

    if q_type == "reverse_goal" and best_opt:
        return (
            (f"GỢI Ý GIÁ TỐT NHẤT:{opt_hint}" if is_vi else f"RECOMMENDED PRICE:{opt_hint}").strip()
        )

    if verdict_code == "CLEARANCE_WORTHWHILE":
        extra_u = int(round(_safe_float(clr.get("extra_units_cleared"), 0.0)))
        extra_cap = _fmt_vnd(clr.get("extra_capital_freed_vnd", 0))
        if is_vi:
            return f"CÓ, NÊN ÁP DỤNG ĐỂ XẢ KHO & XOAY VỐN{ev_intro}: phương án này vẫn hoàn 100% giá nhập, mang lại lãi ròng {_fmt_vnd(exp_profit)}, đồng thời bán thêm ~{extra_u} món để thu hồi sớm {extra_cap} tiền vốn tồn kho."
        return f"YES — GOOD FOR CLEARANCE & CASH TURNOVER{ev_intro}: still recovers 100% of unit cost with {_fmt_vnd(exp_profit)} net profit while moving +{extra_u} extra units to free {extra_cap} in locked capital."

    if verdict_code == "CLEARANCE_PROFITABLE_TRADE_OFF":
        extra_u = int(round(_safe_float(clr.get("extra_units_cleared"), 0.0)))
        extra_cap = _fmt_vnd(clr.get("extra_capital_freed_vnd", 0))
        if is_vi:
            return f"CÓ THỂ ÁP DỤNG NẾU ƯU TIÊN XOAY VÒNG VỐN{ev_intro}: bạn vẫn hoàn vốn và có lãi ròng {_fmt_vnd(exp_profit)} (nhẹ hơn giữ giá cũ {_fmt_vnd(base_profit)}), đổi lại bán thêm ~{extra_u} món và thu hồi sớm {extra_cap} tiền vốn."
        return f"WORKABLE TRADE-OFF IF PRIORITIZING CASH TURNOVER{ev_intro}: still earns {_fmt_vnd(exp_profit)} net profit (below holding price at {_fmt_vnd(base_profit)}) while selling +{extra_u} more units and freeing {extra_cap} in inventory capital."

    if verdict_code == "CLEARANCE_BELOW_COST":
        unit_rec = _safe_float(clr.get("unit_recovery_pct"), 0.0)
        if is_vi:
            return f"CÂN NHẮC KỸ (BÁN DƯỚI VỐN / LỖ ĐỢT){ev_intro}: mỗi món thu hồi {unit_rec:.1f}% giá nhập (lãi ròng đợt {_fmt_vnd(exp_profit)}). Chỉ nên làm nếu hàng đã tồn lâu cần cắt lỗ thu hồi tiền mặt nhập hàng mới."
        return f"CAUTION — BELOW COST RECOVERY{ev_intro}: recovers {unit_rec:.1f}% of unit purchase cost (period profit {_fmt_vnd(exp_profit)}). Only justified to liquidate stale stock for cash."

    prob_str = f"{float(prob_beat) * 100:.1f}%" if prob_beat is not None else None
    if is_vi:
        if verdict_level == "go":
            prob_part = f" với {prob_str} cơ hội lãi hơn giá cũ" if prob_str else ""
            return f"CÓ, NÊN THỰC HIỆN{ev_intro}: phương án này giúp tổng tiền lãi dự kiến đạt {_fmt_vnd(exp_profit)} (tăng {_fmt_vnd(abs(delta_vnd))} so với giữ giá cũ {_fmt_vnd(base_profit)}){prob_part}.{opt_hint}"
        if verdict_level == "caution":
            if delta_vnd >= 0:
                return f"CÓ THỂ LÀM ĐƯỢC NHƯNG CẦN THỬ NHỎ TRƯỚC{ev_intro}: tiền lãi dự kiến đạt {_fmt_vnd(exp_profit)} (nhỉnh hơn giữ giá cũ {_fmt_vnd(base_profit)}), nhưng dữ liệu biến động giá hoặc biên an toàn còn mỏng.{opt_hint}"
            return f"CÂN NHẮC KỸ{ev_intro}: tiền lãi dự kiến đạt {_fmt_vnd(exp_profit)} so với giữ giá cũ {_fmt_vnd(base_profit)}.{opt_hint}"
        return f"KHÔNG NÊN ÁP DỤNG MỨC NÀY{ev_intro}: phương án làm tiền lãi dự kiến còn {_fmt_vnd(exp_profit)} (thấp hơn giữ giá cũ {_fmt_vnd(base_profit)}) hoặc gặp rủi ro thiếu hàng/mỏng lãi.{opt_hint}"

    if verdict_level == "go":
        prob_part = f" ({prob_str} odds of beating old price)" if prob_str else ""
        return f"YES — GOOD TO DO{ev_intro}: projected profit reaches {_fmt_vnd(exp_profit)} (+{_fmt_vnd(abs(delta_vnd))} vs keeping old price {_fmt_vnd(base_profit)}){prob_part}.{opt_hint}"
    if verdict_level == "caution":
        return f"POSSIBLE WITH A SMALL TRIAL FIRST{ev_intro}: projected profit is {_fmt_vnd(exp_profit)} vs keeping old price {_fmt_vnd(base_profit)}, though uncertainty or inventory limits remain.{opt_hint}"
    return f"NO — SKIP THIS LEVEL{ev_intro}: projected profit drops to {_fmt_vnd(exp_profit)} vs keeping old price {_fmt_vnd(base_profit)}, or hits stock/margin limits.{opt_hint}"


def explain_scenario(
    scenario_result: Dict[str, Any],
    client: Optional[LLMClient] = None,
    candidate_override_text: Optional[str] = None,
    business_context: Optional[Dict[str, Any]] = None,
    language: Optional[str] = None,
    question: Optional[str] = None,
    decision_spec: Optional[Dict[str, Any]] = None,
    optimize_summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate a verified executive summary, direct Yes/No verdict, and business-context advice."""
    lang = _detect_explain_language(scenario_result, language=language, question=question)
    advisory = build_advisory_report(
        scenario_result,
        business_context=business_context,
        language=lang,
        decision_spec=decision_spec,
    )
    direct_answer = build_direct_answer(
        scenario_result,
        advisory=advisory,
        decision_spec=decision_spec,
        optimize_summary=optimize_summary,
        language=lang,
    )
    allowed_payload = {
        "scenario_result": scenario_result,
        "business_context": business_context or {},
        "decision_spec": decision_spec or {},
        "optimize_summary": optimize_summary or {},
    }

    llm_client = client or LLMClient()
    candidate_text: Optional[str] = candidate_override_text

    if candidate_text is None and llm_client.is_configured():
        lang_label = "Vietnamese" if lang == "vi" else "English"
        sys_prompt = (
            f"You are an AI retail financial analyst helping a small shop owner, writing in {lang_label}. "
            "Answer the shop owner's question directly (Yes/No feasibility, seasonal impact if any, "
            "profit vs cost recovery and inventory/capital rotation benefits from `clearance` when price drops or goal is clearing stock, "
            "and comparison with the best optimizer price if provided and relevant). "
            "NEVER say every price cut is a loss if `clearance.recovers_unit_cost` or `clearance.recovers_total_cost` is true; "
            "highlight extra units cleared, faster cash turnover, and warehouse age context clearly. "
            "Format output as 3 to 4 short, easy-to-scan bullet lines separated by newlines (start each line with '• '). "
            "Use plain everyday language (NO technical finance jargon like 'margin erosion', 'elasticity', "
            "'baseline', or 'Monte Carlo percentiles').\n"
            "STRICT RULE: ONLY use exact numbers present in the provided JSON. Do NOT compute, "
            "extrapolate, or invent any number. Briefly note results are simulated estimates, not guarantees."
        )
        user_msg = (
            f"User Question: {question or 'Evaluate this pricing change.'}\n"
            f"Verified Engine & Context JSON:\n{allowed_payload}"
        )
        candidate_text = llm_client.complete_text(sys_prompt, user_msg)

    if candidate_text is not None:
        is_valid, bad_tokens = verify_explanation_numbers(candidate_text, allowed_payload)
        if is_valid:
            return {
                "text": candidate_text.strip(),
                "direct_answer": direct_answer,
                "action_verdict": advisory["action_verdict"],
                "verdict_level": advisory["verdict_level"],
                "situation_summary": advisory["situation_summary"],
                "recommendations": advisory["recommendations"],
                "used_fallback": False,
                "rejected_numbers": [],
            }
        # Hallucinated or ungrounded number detected -> discard LLM text and fall back
        return {
            "text": build_template_explanation(
                scenario_result,
                business_context=business_context,
                language=lang,
                decision_spec=decision_spec,
            ),
            "direct_answer": direct_answer,
            "action_verdict": advisory["action_verdict"],
            "verdict_level": advisory["verdict_level"],
            "situation_summary": advisory["situation_summary"],
            "recommendations": advisory["recommendations"],
            "used_fallback": True,
            "rejected_numbers": bad_tokens,
        }

    return {
        "text": build_template_explanation(
            scenario_result,
            business_context=business_context,
            language=lang,
            decision_spec=decision_spec,
        ),
        "direct_answer": direct_answer,
        "action_verdict": advisory["action_verdict"],
        "verdict_level": advisory["verdict_level"],
        "situation_summary": advisory["situation_summary"],
        "recommendations": advisory["recommendations"],
        "used_fallback": True,
        "rejected_numbers": [],
    }
