"""
Synthetic Vietnamese retail data, v2 (calendar-aware).  ALL DATA PRODUCED HERE IS SIMULATED.

Daily expected demand for product i on day t:
    base_qty_i * trend(t) * season_g(t) * weekday_g(t) * payday(t) * event_multiplier_g(t)
              * (price_t / base_price_i) ** TRUE_ELASTICITY_i * promo_lift
then lognormal noise -> Poisson draw -> rare outlier spikes -> censored by stock (stockouts).

What is new vs v1:
  * 17 Vietnamese events with pre-ramp / peak / post-slump (Tet, 11.11, 12.12, 9.9, Black Friday, 8/3, 20/10 ...)
  * event effects differ by category group (e.g. Tet: grocery x2.3, electronics x1.5; 11.11: electronics x2.7)
  * retailer price behaviour is CORRELATED with events (markdowns on 11.11, price hikes before Tet)
    -> naive price-only regressions are biased; a model must control for calendar effects.
  * stock replenishment with lead time -> occasional stockouts around peaks (censored demand)
  * slow trend, payday window, weekday patterns, rare outlier spikes
  * ground_truth_daily.csv keeps the uncensored demand so you can audit the generator
  * messy_variants/: same data with renamed columns / Vietnamese number formats / receipts, for the column-mapper

Run:  python make_synthetic_data_v2.py            (writes ./out/<dataset>/...)
"""
import json
import os
import numpy as np
import pandas as pd
from vn_calendar import build_calendar, price_event_factor, GROUP_OF, GROUPS

DEFAULTS = dict(
    seed=42, start_date="2024-01-01", end_date="2026-10-31",
    noise_sigma=0.10, outlier_prob=0.004, outlier_boost=2.5,
    price_steps=[0.92, 0.96, 1.00, 1.04, 1.08], price_hold_days=(7, 21),    # exogenous price tests
    event_pricing=True,               # retailers mark down / hike around events (confounding)
    annual_list_price_growth=0.03,    # list price steps up once a year
    promo_start_prob=0.025, promo_length_days=(3, 7), promo_event_boost_prob=0.35,
    promo_lift=1.15,                  # non-price marketing push (banner/ads) lift
    trend_per_year=0.08,
    lead_time_days=3, cover_days=5, planner_awareness=0.2, start_stock_days=8,
)
WEEKEND_GAIN = dict(fashion=1.20, beauty=1.10, electronics=1.05, home=1.10, grocery=1.12, sweets=1.10)
SEASON_AMP = dict(fashion=0.06, beauty=0.04, electronics=0.05, home=0.10, grocery=0.04, sweets=0.06)
SEASON_PHASE_DOY = dict(fashion=60, beauty=60, electronics=60, home=80, grocery=0, sweets=0)  # sin peak ~ phase+91
PAYDAY_LIFT = 1.06

# (name, category, base_price VND, cost_ratio, base_qty/day, TRUE elasticity)
STARTER = [("Áo thun basic", "Thời trang", 100_000, 0.60, 60, -1.2), ("Sữa tắm 500ml", "Mỹ phẩm", 120_000, 0.58, 45, -0.6),
           ("Tai nghe Bluetooth", "Điện tử", 250_000, 0.60, 30, -2.0), ("Bình giữ nhiệt", "Gia dụng", 180_000, 0.56, 40, -1.0)]
FASHION = [("Áo thun basic", "Thời trang", 100_000, 0.60, 60, -1.2), ("Áo sơ mi trắng", "Thời trang", 220_000, 0.55, 25, -1.5),
           ("Quần jeans nam", "Thời trang", 350_000, 0.55, 18, -1.8), ("Váy midi", "Thời trang", 280_000, 0.52, 20, -1.6),
           ("Áo khoác gió", "Thời trang", 320_000, 0.58, 15, -1.4), ("Quần short", "Thời trang", 150_000, 0.55, 35, -1.3),
           ("Đầm công sở", "Thời trang", 400_000, 0.50, 12, -1.7), ("Áo len cổ tròn", "Thời trang", 260_000, 0.55, 14, -1.5),
           ("Giày sneaker", "Giày dép", 480_000, 0.60, 10, -1.9), ("Túi tote vải", "Phụ kiện", 90_000, 0.45, 40, -1.1),
           ("Nón lưỡi trai", "Phụ kiện", 80_000, 0.45, 35, -0.9), ("Tất cổ ngắn (set 3)", "Phụ kiện", 45_000, 0.50, 70, -0.7)]
GROCERY = [("Gạo ST25 5kg", "Thực phẩm", 140_000, 0.85, 40, -0.5), ("Dầu ăn 1L", "Thực phẩm", 55_000, 0.86, 80, -0.4),
           ("Nước mắm 500ml", "Thực phẩm", 38_000, 0.80, 90, -0.5), ("Mì gói thùng 30 gói", "Thực phẩm", 115_000, 0.84, 50, -0.8),
           ("Sữa tươi 1L", "Đồ uống", 36_000, 0.82, 120, -0.7), ("Cà phê hòa tan 20 gói", "Đồ uống", 65_000, 0.75, 60, -0.9),
           ("Trà túi lọc 50 túi", "Đồ uống", 48_000, 0.75, 50, -0.8), ("Bột giặt 3kg", "Gia dụng", 135_000, 0.80, 40, -0.9),
           ("Nước rửa chén 750ml", "Gia dụng", 32_000, 0.78, 70, -0.6), ("Giấy vệ sinh 10 cuộn", "Gia dụng", 85_000, 0.80, 55, -0.8),
           ("Bánh quy hộp", "Bánh kẹo", 70_000, 0.72, 45, -1.1), ("Nước ngọt lốc 6 lon", "Đồ uống", 72_000, 0.80, 60, -1.2),
           ("Snack khoai tây", "Bánh kẹo", 28_000, 0.70, 100, -1.3), ("Kem đánh răng", "Chăm sóc cá nhân", 35_000, 0.70, 80, -0.5),
           ("Dầu gội 650ml", "Chăm sóc cá nhân", 125_000, 0.65, 35, -0.9)]
ELECTRONICS = [("Tai nghe Bluetooth", "Điện tử", 250_000, 0.60, 30, -2.0), ("Sạc dự phòng 10000mAh", "Điện tử", 300_000, 0.62, 25, -1.8),
               ("Cáp sạc Type-C", "Điện tử", 60_000, 0.45, 60, -1.2), ("Loa Bluetooth mini", "Điện tử", 450_000, 0.62, 12, -2.1),
               ("Chuột không dây", "Điện tử", 180_000, 0.58, 28, -1.6), ("Bàn phím cơ", "Điện tử", 650_000, 0.65, 12, -1.9),
               ("Nồi chiên không dầu", "Gia dụng", 1_200_000, 0.70, 10, -1.7), ("Quạt mini để bàn", "Gia dụng", 150_000, 0.58, 30, -1.4),
               ("Bình giữ nhiệt", "Gia dụng", 180_000, 0.56, 40, -1.0), ("Ổ cắm điện đa năng", "Gia dụng", 120_000, 0.60, 35, -0.8)]
LARGE_CATEGORIES = [("Thời trang", -2.0, -1.0, 80_000, 450_000), ("Mỹ phẩm", -1.2, -0.5, 90_000, 400_000),
                    ("Gia dụng", -1.5, -0.6, 60_000, 800_000), ("Điện tử", -2.4, -1.4, 100_000, 900_000),
                    ("Thực phẩm", -1.0, -0.3, 30_000, 200_000)]


def random_products(rng, per_category):
    rows = []
    for category, e_min, e_max, p_min, p_max in LARGE_CATEGORIES:
        for i in range(1, per_category + 1):
            price = round(rng.uniform(p_min, p_max) / 5000) * 5000
            rows.append((f"{category} mẫu {i:02d}", category, int(price), round(rng.uniform(0.45, 0.80), 2),
                         int(rng.integers(12, 90)), round(rng.uniform(e_min, e_max), 2)))
    return rows


def round_price(p):
    step = 1000 if p >= 500_000 else 500
    return np.round(p / step) * step


def exogenous_price_multiplier(rng, n, steps, hold):
    out = []
    while len(out) < n:
        out.extend([rng.choice(steps)] * int(rng.integers(hold[0], hold[1] + 1)))
    return np.array(out[:n])


def list_price_path(rng, cal, base_price, growth):
    """List price steps up once a year on a random date."""
    n = len(cal)
    path = np.full(n, float(base_price))
    for year in sorted(cal["date"].dt.year.unique())[1:]:
        day = pd.Timestamp(year, int(rng.integers(1, 13)), int(rng.integers(1, 28)))
        path[(cal["date"] >= day).to_numpy()] *= 1 + growth * rng.uniform(0.7, 1.3)
    return path


def promo_path(rng, cal, cfg):
    n = len(cal)
    flags = np.zeros(n, dtype=int)
    day = 0
    while day < n:
        near_event = cal["holiday_flag"].iloc[day] == 1 and cal["event_offset"].iloc[day] <= 0
        p = cfg["promo_event_boost_prob"] if near_event else cfg["promo_start_prob"]
        if rng.random() < p:
            length = int(rng.integers(cfg["promo_length_days"][0], cfg["promo_length_days"][1] + 1))
            flags[day:day + length] = 1
            day += length
        else:
            day += 1
    return flags


def simulate_product(rng, product, cal, cfg):
    n, g = len(cal), product["group"]
    t_years = (cal["date"] - cal["date"].iloc[0]).dt.days.to_numpy() / 365.25
    trend = (1 + cfg["trend_per_year"]) ** t_years
    season = 1 + SEASON_AMP[g] * np.sin(2 * np.pi * (cal["doy"].to_numpy() - SEASON_PHASE_DOY[g]) / 365.25)
    weekday = np.where(cal["is_weekend"] == 1, WEEKEND_GAIN[g], 1.0)
    payday = np.where(cal["is_payday_window"] == 1, PAYDAY_LIFT, 1.0)
    event_m = cal[f"m_{g}"].to_numpy()

    list_price = list_price_path(rng, cal, product["base_price"], cfg["annual_list_price_growth"])
    test_mult = exogenous_price_multiplier(rng, n, cfg["price_steps"], cfg["price_hold_days"])
    ev_factor = price_event_factor(rng, cal, g) if cfg["event_pricing"] else np.ones(n)
    price = np.array([round_price(p) for p in list_price * test_mult * ev_factor])
    promo = promo_path(rng, cal, cfg)

    price_effect = (price / product["base_price"]) ** product["true_elasticity"]
    expected = (product["base_qty"] * trend * season * weekday * payday * event_m * price_effect
                * np.where(promo == 1, cfg["promo_lift"], 1.0))
    noisy = expected * rng.lognormal(0.0, cfg["noise_sigma"], n)
    demand = rng.poisson(noisy)
    spike = rng.random(n) < cfg["outlier_prob"]
    demand = np.where(spike, np.round(demand * cfg["outlier_boost"]), demand).astype(int)

    # ---- inventory with lead time; planner anticipates events only partially ----
    L, cover = cfg["lead_time_days"], cfg["cover_days"]
    stock = cfg["start_stock_days"] * product["base_qty"]
    pipeline = {}
    sold = np.zeros(n, dtype=int); stock_end = np.zeros(n, dtype=int); stockout = np.zeros(n, dtype=int)
    for t in range(n):
        stock += pipeline.pop(t, 0)
        sold[t] = min(demand[t], stock)
        stockout[t] = int(demand[t] > stock)
        stock -= sold[t]
        hz = slice(t + 1, min(t + 1 + L + cover, n))
        horizon_ev = event_m[hz].mean() if hz.stop > hz.start else 1.0
        planned = product["base_qty"] * trend[t] * (1 + cfg["planner_awareness"] * (horizon_ev - 1))
        in_transit = sum(pipeline.values())
        if stock + in_transit < planned * (L + 1):
            qty = int(max(planned * cover - stock - in_transit, 0))
            if qty > 0 and t + L < n:
                pipeline[t + L] = pipeline.get(t + L, 0) + qty
        stock_end[t] = stock

    sales = pd.DataFrame({
        "date": cal["date"].dt.strftime("%Y-%m-%d"), "product_id": product["product_id"],
        "product_name": product["product_name"], "category": product["category"],
        "price_vnd": price.astype(int), "unit_cost_vnd": product["unit_cost"],
        "quantity_sold": sold, "promo_flag": promo, "holiday_flag": cal["holiday_flag"].to_numpy(),
        "stock_on_hand": stock_end})
    daily_truth = pd.DataFrame({
        "date": sales["date"], "product_id": product["product_id"], "event_name": cal["event_name"].to_numpy(),
        "event_multiplier": np.round(event_m, 4), "expected_demand": np.round(expected, 3),
        "true_demand": demand, "quantity_sold": sold, "stockout": stockout})
    return sales, daily_truth


def build_dataset(rows, overrides):
    cfg = {**DEFAULTS, **overrides}
    rng = np.random.default_rng(cfg["seed"])
    cal = build_calendar(cfg["start_date"], cfg["end_date"])
    products = [dict(product_id=f"P{i:02d}", product_name=nm, category=cat, group=GROUP_OF[cat], base_price=price,
                     unit_cost=int(round(price * cr / 500) * 500), base_qty=bq, true_elasticity=e)
                for i, (nm, cat, price, cr, bq, e) in enumerate(rows, start=1)]
    sims = [simulate_product(rng, p, cal, cfg) for p in products]
    sales = pd.concat([s for s, _ in sims], ignore_index=True)
    daily = pd.concat([d for _, d in sims], ignore_index=True)
    truth = pd.DataFrame([{"product_id": p["product_id"], "product_name": p["product_name"], "category": p["category"],
                           "true_elasticity": p["true_elasticity"]} for p in products])
    return sales, truth, daily, cfg


# ---------------- messy variants for the NLP column mapper ----------------
def vn_number(x):            # 139500 -> "139.500"
    return f"{int(x):,}".replace(",", ".")


def make_messy_variants(sales, out_root):
    os.makedirs(out_root, exist_ok=True)
    rng = np.random.default_rng(7)
    sub = sales[sales["product_id"].isin(sorted(sales["product_id"].unique())[:6])].copy()
    sub["_d"] = pd.to_datetime(sub["date"])
    variants = {}

    v = pd.DataFrame({"Ngày bán": sub["_d"].dt.strftime("%d/%m/%Y"), "Mã SP": sub["product_id"], "Tên sản phẩm": sub["product_name"],
                      "Ngành hàng": sub["category"], "Giá bán (VNĐ)": sub["price_vnd"].map(vn_number),
                      "Giá vốn": sub["unit_cost_vnd"].map(vn_number), "SL bán": sub["quantity_sold"], "Tồn kho": sub["stock_on_hand"],
                      "KM": sub["promo_flag"].map({0: "", 1: "x"})})
    variants["vn_headers_vn_numbers"] = (v, {"date": "Ngày bán", "product_id": "Mã SP", "product_name": "Tên sản phẩm", "category": "Ngành hàng",
        "price": "Giá bán (VNĐ)", "unit_cost": "Giá vốn", "quantity": "SL bán", "stock": "Tồn kho", "promo": "KM"},
        {"date_format": "%d/%m/%Y", "number_locale": "vi", "price_unit": 1})

    v = pd.DataFrame({"TXN_DT": sub["date"].str.replace("-", ""), "SKU_CD": sub["product_id"], "SKU_DESC": sub["product_name"],
                      "CAT_L1": sub["category"], "UNIT_PRC": sub["price_vnd"], "UNIT_CST": sub["unit_cost_vnd"],
                      "QTY": sub["quantity_sold"], "OH_QTY": sub["stock_on_hand"]})
    variants["erp_abbrev"] = (v, {"date": "TXN_DT", "product_id": "SKU_CD", "product_name": "SKU_DESC", "category": "CAT_L1",
        "price": "UNIT_PRC", "unit_cost": "UNIT_CST", "quantity": "QTY", "stock": "OH_QTY"}, {"date_format": "%Y%m%d", "price_unit": 1})

    v = pd.DataFrame({"store": "HCM-01", "cashier": rng.choice(["A", "B", "C"], len(sub)), "date": sub["date"],
                      "sku": sub["product_id"], "item": sub["product_name"], "group": sub["category"],
                      "sell_price": sub["price_vnd"], "units": sub["quantity_sold"], "note": ""})
    variants["english_extra_columns_no_cost_no_stock"] = (v, {"date": "date", "product_id": "sku", "product_name": "item", "category": "group",
        "price": "sell_price", "quantity": "units"}, {"date_format": "%Y-%m-%d", "price_unit": 1, "missing": ["unit_cost", "stock"]})

    v = pd.DataFrame({"Ngày": sub["_d"].dt.strftime("%d-%m-%y"), "Sản phẩm": sub["product_name"], "Đơn giá (nghìn đồng)": (sub["price_vnd"] / 1000).round(1),
                      "Số lượng": sub["quantity_sold"], "Chi phí/đv (nghìn đồng)": (sub["unit_cost_vnd"] / 1000).round(1)})
    variants["price_in_thousands_name_only"] = (v, {"date": "Ngày", "product_name": "Sản phẩm", "price": "Đơn giá (nghìn đồng)",
        "quantity": "Số lượng", "unit_cost": "Chi phí/đv (nghìn đồng)"}, {"date_format": "%d-%m-%y", "price_unit": 1000, "missing": ["product_id", "category", "stock"]})

    # receipt-level: one row per order line, needs aggregation (qty summed per day+product, price = mean)
    rows = []
    order = 100000
    for _, r in sub.sample(frac=0.15, random_state=1).iterrows():
        q = int(r["quantity_sold"])
        for chunk in np.array_split(np.arange(q), max(1, min(q, 3))):
            if len(chunk) == 0: continue
            order += 1
            rows.append({"order_id": order, "timestamp": f"{r['date']} {int(rng.integers(8, 22)):02d}:{int(rng.integers(0, 60)):02d}:00",
                         "sku": r["product_id"], "item_name": r["product_name"], "qty": len(chunk), "unit_price": r["price_vnd"]})
    variants["receipt_level_transactions"] = (pd.DataFrame(rows), {"date": "timestamp", "product_id": "sku", "product_name": "item_name",
        "price": "unit_price", "quantity": "qty"}, {"grain": "transaction", "aggregate": "sum(qty) per date+sku, price=qty-weighted mean",
        "missing": ["category", "unit_cost", "stock"]})

    for name, (df, mapping, meta) in variants.items():
        folder = os.path.join(out_root, name)
        os.makedirs(folder, exist_ok=True)
        df.to_csv(os.path.join(folder, "input.csv"), index=False, encoding="utf-8-sig")
        with open(os.path.join(folder, "mapping_truth.json"), "w", encoding="utf-8") as f:
            json.dump({"canonical_to_source": mapping, "meta": meta}, f, ensure_ascii=False, indent=2)
    print(f"messy variants: {list(variants)}")


def main(out="out"):
    large = random_products(np.random.default_rng(2024), per_category=8)
    datasets = [
        ("starter_4_products", STARTER, dict(seed=42)),
        ("fashion_shop_12", FASHION, dict(seed=101)),
        ("grocery_fmcg_15", GROCERY, dict(seed=202, price_steps=[0.94, 0.97, 1.00, 1.03, 1.06])),
        ("electronics_home_10", ELECTRONICS, dict(seed=303, noise_sigma=0.14)),
        ("marketplace_large_40", large, dict(seed=404)),
        ("hard_low_price_variation_8", FASHION[:8], dict(seed=505, price_steps=[0.99, 1.00, 1.01], price_hold_days=(21, 45), event_pricing=False)),
        ("hard_event_confounded_12", FASHION, dict(seed=606, price_steps=[0.97, 1.00, 1.03], event_pricing=True)),
    ]
    for name, rows, ov in datasets:
        sales, truth, daily, cfg = build_dataset(rows, ov)
        folder = os.path.join(out, name)
        os.makedirs(folder, exist_ok=True)
        sales.to_csv(os.path.join(folder, "sales_synthetic_vn.csv"), index=False, encoding="utf-8-sig")
        truth.to_csv(os.path.join(folder, "ground_truth.csv"), index=False, encoding="utf-8-sig")
        daily.to_csv(os.path.join(folder, "ground_truth_daily.csv"), index=False, encoding="utf-8-sig")
        with open(os.path.join(folder, "config.json"), "w") as f:
            json.dump(cfg, f, indent=2, default=str)
        print(f"{name}: {len(truth)} products, {len(sales)} rows, stockout days {daily['stockout'].mean():.1%}")
    sales, *_ = build_dataset(FASHION, dict(seed=101))
    make_messy_variants(sales, os.path.join(out, "messy_variants"))


if __name__ == "__main__":
    main()
