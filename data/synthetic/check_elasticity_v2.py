"""
Reference check: can a Poisson log-link regression recover the TRUE price elasticity from the synthetic data?
Three specifications show WHY calendar controls matter:

  A  naive      : ln(price) only
  B  v1-style   : + weekend, promo, holiday_flag, yearly sin/cos
  C  full       : + Vietnamese event windows (pre/day/post per event family), payday window, linear trend,
                    and stockout days dropped (stock_on_hand == 0 means demand was censored)

Elasticity = coefficient on ln(price) in  E[Q] = exp(Xb)   (Poisson / quasi-Poisson, robust SE).
Run:  python check_elasticity_v2.py out            (all datasets)
      python check_elasticity_v2.py out/fashion_shop_12   (one dataset, per-product table)
"""
import os, sys
import numpy as np
import pandas as pd
from vn_calendar import build_calendar

FAMILY = {"tet": "tet", "mid_autumn": "mid_autumn", "sale_11_11": "sale_big", "sale_12_12": "sale_big", "sale_9_9": "sale_big",
          "sale_10_10": "sale_big", "sale_minor": "sale_minor", "black_friday": "black_friday",
          "women_8_3": "gift", "women_20_10": "gift", "valentine": "gift", "christmas": "gift", "teachers_20_11": "gift",
          "holiday_30_4": "holiday", "national_2_9": "holiday", "hung_kings": "holiday", "back_to_school": "school"}
WINDOWS = {"pre_far": range(-14, -3), "pre_near": range(-3, 0), "day": range(0, 1), "post": range(1, 8)}


def poisson_irls(X, y, ridge=1e-6, iters=60):
    beta = np.zeros(X.shape[1]); beta[0] = np.log(max(y.mean(), 1e-3))
    for _ in range(iters):
        eta = np.clip(X @ beta, -20, 20); mu = np.exp(eta)
        W = mu; z = eta + (y - mu) / mu
        A = X.T @ (X * W[:, None]) + ridge * np.eye(X.shape[1])
        new = np.linalg.solve(A, X.T @ (W * z))
        if np.max(np.abs(new - beta)) < 1e-8: beta = new; break
        beta = new
    mu = np.exp(np.clip(X @ beta, -20, 20))
    bread = np.linalg.inv(X.T @ (X * mu[:, None]) + ridge * np.eye(X.shape[1]))
    meat = X.T @ (X * ((y - mu) ** 2)[:, None])
    cov = bread @ meat @ bread * len(y) / max(len(y) - X.shape[1], 1)   # HC1 sandwich
    return beta, cov


def event_dummies(dates):
    cal = build_calendar(dates.min(), dates.max()).set_index("date").loc[dates]
    cols = {}
    for fam in sorted(set(FAMILY.values())):
        for wname, rng_ in WINDOWS.items():
            in_fam = cal["event_name"].map(FAMILY).eq(fam) & cal["event_offset"].isin(list(rng_))
            if in_fam.sum() >= 2:
                cols[f"{fam}_{wname}"] = in_fam.astype(int).to_numpy()
    return pd.DataFrame(cols, index=dates)


def design(df, spec):
    d = pd.to_datetime(df["date"]); doy = d.dt.dayofyear.to_numpy()
    cols = [np.ones(len(df)), np.log(df["price_vnd"].to_numpy())]
    if spec in ("B", "C"):
        cols += [(d.dt.dayofweek >= 5).astype(int).to_numpy(), df["promo_flag"].to_numpy(), df["holiday_flag"].to_numpy(),
                 np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)]
    if spec == "C":
        cols += [d.dt.day.between(5, 10).astype(int).to_numpy(), ((d - d.min()).dt.days / 365.25).to_numpy()]
        ev = event_dummies(pd.DatetimeIndex(d))
        cols += [ev[c].to_numpy() for c in ev.columns]
    return np.column_stack(cols)


def fit(df, spec):
    if spec == "C":
        df = df[df["stock_on_hand"] > 0]
    X, y = design(df, spec), df["quantity_sold"].to_numpy().astype(float)
    beta, cov = poisson_irls(X, y)
    se = float(np.sqrt(cov[1, 1]))
    return beta[1], se, float(np.log(df["price_vnd"]).std())


def check_folder(folder):
    sales = pd.read_csv(os.path.join(folder, "sales_synthetic_vn.csv"))
    truth = pd.read_csv(os.path.join(folder, "ground_truth.csv")).set_index("product_id")["true_elasticity"]
    rows = []
    for pid, g in sales.groupby("product_id"):
        for spec in "ABC":
            e, se, psd = fit(g, spec)
            rows.append(dict(product_id=pid, spec=spec, true=truth[pid], est=e, lo=e - 1.645 * se, hi=e + 1.645 * se, price_sd=psd))
    r = pd.DataFrame(rows)
    r["err"] = r["est"] - r["true"]; r["covered"] = (r["lo"] <= r["true"]) & (r["true"] <= r["hi"])
    return r


def summarise(name, r):
    out = []
    for spec, g in r.groupby("spec"):
        out.append(dict(dataset=name, spec=spec, n=len(g), mean_abs_err=round(g.err.abs().mean(), 3), bias=round(g.err.mean(), 3),
                        max_abs_err=round(g.err.abs().max(), 3), ci90_cover=f"{g.covered.mean():.0%}",
                        rank_corr=round(g.true.rank().corr(g.est.rank()), 3), min_price_sd=round(g.price_sd.min(), 3)))
    return out


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "out"
    folders = [arg] if os.path.exists(os.path.join(arg, "sales_synthetic_vn.csv")) else \
        sorted(os.path.join(arg, d) for d in os.listdir(arg) if os.path.exists(os.path.join(arg, d, "sales_synthetic_vn.csv")))
    summ = []
    for f in folders:
        r = check_folder(f); r.round(3).to_csv(os.path.join(f, "elasticity_check_v2.csv"), index=False)
        summ += summarise(os.path.basename(f), r)
        if len(folders) == 1:
            print(r[r.spec == "C"].round(3).to_string(index=False))
    print(pd.DataFrame(summ).to_string(index=False))
