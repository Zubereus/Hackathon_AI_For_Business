import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiClient } from '../api';
import { Notice, PageHeader } from '../components/Page';
import { formatCompactVND, formatInt, formatNum, formatPct, formatVND, Lang } from '../i18n';
import {
  CashRunwayResponse,
  PortfolioOptimizeResponse,
  ProductElasticity,
  ReplenishResponse,
  VOIResponse,
} from '../types';

type SubTool = 'replenish' | 'runway' | 'portfolio' | 'voi';

interface PlanningScreenProps {
  lang: Lang;
  products: ProductElasticity[];
  selectedProductId: string;
  client: ApiClient;
  useFixtures: boolean;
}

export const PlanningScreen: React.FC<PlanningScreenProps> = ({
  lang,
  products,
  selectedProductId,
  client,
  useFixtures,
}) => {
  const isVi = lang === 'vi';
  const [subTool, setSubTool] = useState<SubTool>('replenish');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Replenishment User Assumptions
  const [leadTimeDays, setLeadTimeDays] = useState<number>(7);
  const [leadTimeStdDays, setLeadTimeStdDays] = useState<number>(2);
  const [serviceLevelPct, setServiceLevelPct] = useState<number>(95);
  const [orderingCostVnd, setOrderingCostVnd] = useState<number>(250000);
  const [holdingPctMonth, setHoldingPctMonth] = useState<number>(1.8);
  const [moqUnits, setMoqUnits] = useState<number>(10);
  const [repBudgetStr, setRepBudgetStr] = useState<string>('40000000');
  const [repWhMaxStr, setRepWhMaxStr] = useState<string>('');
  const [replenishRes, setReplenishRes] = useState<ReplenishResponse | null>(null);

  // Portfolio aggregates derived purely for pre-filling user-editable defaults cleanly
  const portfolioDefaults = useMemo(() => {
    let openInvCost = 0;
    let dailyRev = 0;
    let dailyCogs = 0;
    let fixedOpex = 0;
    for (const p of products) {
      const stk = p.stock_available ?? 0;
      openInvCost += stk * p.unit_cost_vnd;
      const dQty = p.business_context?.daily_mean_qty ?? p.baseline_qty_per_period / 30;
      dailyRev += dQty * p.current_price_vnd;
      dailyCogs += dQty * p.unit_cost_vnd;
      fixedOpex += p.fixed_cost_vnd ?? 0;
    }
    return {
      openInvCost: Math.round(openInvCost),
      dailyRev: Math.round(dailyRev),
      dailyCogs: Math.round(dailyCogs),
      fixedOpex: Math.round(fixedOpex),
    };
  }, [products]);

  // 2. Working Capital & Cash Runway User Assumptions
  const [startingCashVnd, setStartingCashVnd] = useState<number>(60000000);
  const [minCashBufferVnd, setMinCashBufferVnd] = useState<number>(20000000);
  const [dsoDays, setDsoDays] = useState<number>(3);
  const [dpoDays, setDpoDays] = useState<number>(14);
  const [plannedRestockCashVnd, setPlannedRestockCashVnd] = useState<number>(25000000);
  const [runwayHorizonDays, setRunwayHorizonDays] = useState<number>(60);
  const [runwayRes, setRunwayRes] = useState<CashRunwayResponse | null>(null);

  // 3. Portfolio Optimization User Assumptions
  const [portBudgetVnd, setPortBudgetVnd] = useState<number>(80000000);
  const [portWhMaxStr, setPortWhMaxStr] = useState<string>('');
  const [portMaxMovePct, setPortMaxMovePct] = useState<number>(20);
  const [portMinMarginPct, setPortMinMarginPct] = useState<number>(15);
  const [riskLambda, setRiskLambda] = useState<number>(0.25);
  const [portHorizonDays, setPortHorizonDays] = useState<number>(30);
  const [portfolioRes, setPortfolioRes] = useState<PortfolioOptimizeResponse | null>(null);

  // 4. Value of Information (EVPI / EVSI)
  const [voiProductId, setVoiProductId] = useState<string>(
    selectedProductId || products[0]?.product_id || 'P01'
  );
  const [expDays, setExpDays] = useState<number>(14);
  const [expCostVnd, setExpCostVnd] = useState<number>(1500000);
  const [voiMaxMovePct, setVoiMaxMovePct] = useState<number>(25);
  const [voiRes, setVoiRes] = useState<VOIResponse | null>(null);

  const runReplenish = async () => {
    setLoading(true);
    setError(null);
    try {
      const capBudget = repBudgetStr.trim() ? Math.round(Number(repBudgetStr)) : null;
      const whCap = repWhMaxStr.trim() ? Math.round(Number(repWhMaxStr)) : null;
      const resp = await client.optimizeReplenishment({
        items: products.map((p) => ({
          product_id: p.product_id,
          product_name: p.product_name,
          current_price_vnd: p.current_price_vnd,
          unit_cost_vnd: p.unit_cost_vnd,
          baseline_qty_per_period: p.baseline_qty_per_period,
          baseline_period_days: 30,
          daily_mean_qty: p.business_context?.daily_mean_qty ?? null,
          daily_std_qty: p.business_context?.daily_std_qty ?? null,
          stock_available: p.stock_available ?? 0,
          lead_time_days: leadTimeDays,
          lead_time_std_days: leadTimeStdDays,
          service_level_pct: serviceLevelPct,
          ordering_cost_vnd: orderingCostVnd,
          holding_cost_pct_per_month: holdingPctMonth,
          moq_units: moqUnits,
        })),
        capital_budget_vnd: capBudget,
        warehouse_max_units: whCap,
      });
      setReplenishRes(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runCashRunway = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await client.simulateCashRunway({
        starting_cash_vnd: startingCashVnd,
        min_cash_buffer_vnd: minCashBufferVnd,
        opening_inventory_cost_vnd: portfolioDefaults.openInvCost,
        expected_daily_revenue_vnd: portfolioDefaults.dailyRev,
        expected_daily_cogs_vnd: portfolioDefaults.dailyCogs,
        monthly_fixed_opex_vnd: portfolioDefaults.fixedOpex,
        dso_days: dsoDays,
        dpo_days: dpoDays,
        planned_restock_cash_vnd: plannedRestockCashVnd,
        restock_outflow_day: 1,
        horizon_days: runwayHorizonDays,
        n_sims: 2000,
        seed: 42,
      });
      setRunwayRes(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runPortfolio = async () => {
    setLoading(true);
    setError(null);
    try {
      const whCap = portWhMaxStr.trim() ? Math.round(Number(portWhMaxStr)) : null;
      const resp = await client.optimizePortfolio({
        items: products.map((p) => ({
          product_id: p.product_id,
          product_name: p.product_name,
          product: {
            current_price_vnd: p.current_price_vnd,
            unit_cost_vnd: p.unit_cost_vnd,
            baseline_qty_per_period: p.baseline_qty_per_period,
            stock_available: p.stock_available,
            fixed_cost_vnd: p.fixed_cost_vnd ?? 0,
            elasticity_samples: p.elasticity_samples,
          },
          allow_restock_units: 30,
        })),
        total_capital_budget_vnd: portBudgetVnd,
        warehouse_max_units: whCap,
        max_price_change_pct: portMaxMovePct,
        price_step_pct: 5,
        min_margin_pct: portMinMarginPct,
        risk_aversion_lambda: riskLambda,
        horizon_days: portHorizonDays,
        respect_stock: true,
        n_sims: 1000,
        seed: 42,
      });
      setPortfolioRes(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runVOI = async () => {
    const prod = products.find((p) => p.product_id === voiProductId) ?? products[0];
    if (!prod) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await client.analyzeValueOfInformation({
        product: {
          current_price_vnd: prod.current_price_vnd,
          unit_cost_vnd: prod.unit_cost_vnd,
          baseline_qty_per_period: prod.baseline_qty_per_period,
          stock_available: prod.stock_available,
          fixed_cost_vnd: prod.fixed_cost_vnd ?? 0,
          elasticity_samples: prod.elasticity_samples,
        },
        max_price_change_pct: voiMaxMovePct,
        price_step_pct: 5,
        respect_stock: prod.enforce_stock_cap !== false,
        horizon_days: 30,
        experiment_days: expDays,
        experiment_cost_vnd: expCostVnd,
        seed: 42,
      });
      setVoiRes(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const subTabs: Array<{ id: SubTool; labelVi: string; labelEn: string }> = [
    { id: 'replenish', labelVi: '1. Tồn kho an toàn & Nhập hàng (EOQ/ROP)', labelEn: '1. Inventory Replenishment (EOQ/ROP)' },
    { id: 'runway', labelVi: '2. Vốn lưu động & Đường băng Tiền mặt', labelEn: '2. Working Capital & Cash Runway' },
    { id: 'portfolio', labelVi: '3. Phân bổ Vốn Đa SKU', labelEn: '3. Multi-SKU Portfolio Optimizer' },
    { id: 'voi', labelVi: '4. Giá trị Thử nghiệm (EVPI & EVSI)', labelEn: '4. Value of Information (EVPI/EVSI)' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isVi ? 'Quy hoạch Vốn, Kho & Danh mục Quyết định' : 'Capital, Inventory & Portfolio Intelligence'}
      >
        {isVi
          ? 'Tách bạch rạch ròi: dữ liệu bán lịch sử, ước lượng từ mô hình Go/Python, và giả định vận hành do bạn tự điền (lead time, DSO/DPO, tiền mặt ban đầu).'
          : 'Explicit separation between historical sales metrics, Go Monte Carlo / DP optimizations, and user-defined operational assumptions (lead time, DSO/DPO, cash floor).'}
      </PageHeader>

      {useFixtures && (
        <Notice tone="warn" title={isVi ? 'Chế độ xem mẫu đang bật:' : 'Sample snapshot mode active:'}>
          {isVi
            ? 'Vui lòng tắt "Chế độ xem mẫu" ở góc trên để chạy Go Engine (:8080) theo giả định tùy chỉnh của bạn.'
            : 'Turn off Sample snapshot mode in the header to run live Go Engine (:8080) calculations for custom assumptions.'}
        </Notice>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setError(null);
              setSubTool(t.id);
            }}
            className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-all ${
              subTool === t.id
                ? 'border-accent bg-accent text-accent-ink shadow-sm'
                : 'border-rule bg-surface text-muted hover:text-ink'
            }`}
          >
            {isVi ? t.labelVi : t.labelEn}
          </button>
        ))}
      </div>

      {error && (
        <Notice tone="error" title={isVi ? 'Chưa tính được:' : 'Computation error:'}>
          {error}
        </Notice>
      )}

      {/* ---------------- 1. REPLENISHMENT ---------------- */}
      {subTool === 'replenish' && (
        <section className="space-y-5" data-testid="planning-replenish-section">
          <div className="panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">
                {isVi ? 'Giả định vận hành nhà cung cấp & Tồn kho an toàn' : 'Supplier & Safety Stock Assumptions (User-Defined)'}
              </h2>
              <span className="badge border-accent/40 bg-accent-bg text-accent">
                {isVi ? 'Mô phỏng tất định Go · EOQ + ROP' : 'Go Deterministic · EOQ + ROP'}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="label">{isVi ? 'Lead time giao hàng (ngày)' : 'Supplier lead time (days)'}</label>
                <input type="number" min={1} max={90} value={leadTimeDays} onChange={(e) => setLeadTimeDays(Number(e.target.value) || 1)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Độ lệch lead time (± ngày)' : 'Lead-time std dev (days)'}</label>
                <input type="number" min={0} max={30} step={0.5} value={leadTimeStdDays} onChange={(e) => setLeadTimeStdDays(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Mức phục vụ mục tiêu (%)' : 'Target service level (%)'}</label>
                <select value={serviceLevelPct} onChange={(e) => setServiceLevelPct(Number(e.target.value))} className="field">
                  <option value={90}>90% (z = 1.28)</option>
                  <option value={95}>95% (z = 1.64)</option>
                  <option value={97.5}>97.5% (z = 1.96)</option>
                  <option value={99}>99% (z = 2.33)</option>
                </select>
              </div>
              <div>
                <label className="label">{isVi ? 'Chi phí mỗi lần đặt hàng (₫)' : 'Ordering cost / PO (₫)'}</label>
                <input type="number" min={0} step={50000} value={orderingCostVnd} onChange={(e) => setOrderingCostVnd(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Phí lưu kho (%/tháng)' : 'Holding cost (%/month)'}</label>
                <input type="number" min={0} max={20} step={0.2} value={holdingPctMonth} onChange={(e) => setHoldingPctMonth(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Số lượng đặt tối thiểu (MOQ)' : 'Minimum order qty (MOQ)'}</label>
                <input type="number" min={0} value={moqUnits} onChange={(e) => setMoqUnits(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Trần vốn nhập hàng toàn shop (₫)' : 'Capital budget cap (₫, optional)'}</label>
                <input type="number" min={0} step={1000000} value={repBudgetStr} onChange={(e) => setRepBudgetStr(e.target.value)} className="field field-num" placeholder={isVi ? 'Không giới hạn' : 'Unlimited'} />
              </div>
              <div>
                <label className="label">{isVi ? 'Sức chứa kho tối đa (sp nhập thêm)' : 'Warehouse intake cap (units)'}</label>
                <input type="number" min={0} value={repWhMaxStr} onChange={(e) => setRepWhMaxStr(e.target.value)} className="field field-num" placeholder={isVi ? 'Không giới hạn' : 'Unlimited'} />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" disabled={loading || products.length === 0} onClick={runReplenish} className="btn btn-primary">
                {loading ? (isVi ? 'Đang tối ưu nhập hàng…' : 'Calculating PO plan…') : isVi ? 'Tính EOQ & Điểm đặt hàng (ROP)' : 'Calculate EOQ & Reorder Plan'}
              </button>
            </div>
          </div>

          {replenishRes && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'SKU cần nhập gấp (<= ROP)' : 'Order Now SKUs'}</p>
                  <p className="mt-1 text-[22px] font-bold text-warn">{replenishRes.order_now_count} / {replenishRes.items.length}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Tổng vốn phân bổ nhập hàng' : 'Allocated PO Capital'}</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{formatVND(replenishRes.total_allocated_cost_vnd)}</p>
                  <p className="hint text-[11px]">{isVi ? `Nhu cầu không trần: ${formatVND(replenishRes.total_uncapped_cost_vnd)}` : `Uncapped: ${formatVND(replenishRes.total_uncapped_cost_vnd)}`}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Tổng đơn vị đặt nhập' : 'Total Order Units'}</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{formatInt(replenishRes.total_allocated_units)}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Trạng thái trần vốn' : 'Budget Constraint'}</p>
                  <p className={`mt-1 text-[16px] font-bold ${replenishRes.capital_budget_binding ? 'text-warn' : 'text-good'}`}>
                    {replenishRes.capital_budget_binding
                      ? isVi ? `Căng vốn (${replenishRes.deferred_count} SKU bị cắt giảm)` : `Binding (${replenishRes.deferred_count} deferred)`
                      : isVi ? 'Đủ vốn phân bổ' : 'Within budget'}
                  </p>
                </div>
              </div>

              <div className="panel overflow-x-auto">
                <table className="data-table min-w-[920px]">
                  <thead className="bg-sunken">
                    <tr>
                      <th className="pl-4">SKU</th>
                      <th className="num">{isVi ? 'Bán/ngày (±SD)' : 'Daily Rate (±SD)'}</th>
                      <th className="num">{isVi ? 'Tồn hiện tại' : 'Stock'}</th>
                      <th className="num">{isVi ? 'Tồn an toàn (SS)' : 'Safety Stock'}</th>
                      <th className="num">{isVi ? 'Điểm đặt (ROP)' : 'ROP'}</th>
                      <th className="num">EOQ</th>
                      <th className="num">{isVi ? 'Đề xuất nhập' : 'Recommended PO'}</th>
                      <th className="num">{isVi ? 'Vốn cần (₫)' : 'PO Cost (₫)'}</th>
                      <th className="num">{isVi ? 'Rủi ro đứt hàng LT' : 'LT Stockout Risk'}</th>
                      <th className="pr-4">{isVi ? 'Trạng thái' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replenishRes.items.map((it) => (
                      <tr key={it.product_id}>
                        <td className="pl-4">
                          <div className="font-semibold text-ink">{it.product_id}</div>
                          <div className="hint text-[11px]">{it.product_name}</div>
                        </td>
                        <td className="num">{it.daily_mean_qty.toFixed(1)} (±{it.daily_std_qty.toFixed(1)})</td>
                        <td className="num">{formatInt(it.current_stock_units)} ({it.days_of_stock_left.toFixed(1)}d)</td>
                        <td className="num">{formatInt(it.safety_stock_units)}</td>
                        <td className="num font-semibold">{formatInt(it.reorder_point_units)}</td>
                        <td className="num">{formatInt(it.eoq_units)}</td>
                        <td className="num font-bold text-accent">{formatInt(it.recommended_order_units)}</td>
                        <td className="num">{formatVND(it.allocated_order_cost_vnd)}</td>
                        <td className="num">{(it.stockout_prob_in_lead_time * 100).toFixed(1)}%</td>
                        <td className="pr-4">
                          <span className={`badge ${
                            it.order_status === 'order_now' ? 'border-warn/50 bg-warn-bg text-warn' :
                            it.order_status === 'deferred_budget' ? 'border-bad/50 bg-bad-bg text-bad' :
                            it.order_status === 'watch' ? 'border-cobalt/40 bg-cobalt-bg text-cobalt' :
                            'border-good/40 bg-good-bg text-good'
                          }`}>
                            {it.order_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------------- 2. CASH RUNWAY ---------------- */}
      {subTool === 'runway' && (
        <section className="space-y-5" data-testid="planning-runway-section">
          <div className="panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">
                {isVi ? 'Vốn lưu động (DIO/DSO/DPO) & Mô phỏng Đường băng Tiền mặt' : 'Working Capital & Monte Carlo Cash Runway'}
              </h2>
              <span className="badge border-rule bg-sunken text-muted">
                {isVi
                  ? `Lịch sử shop: Tồn vốn ${formatCompactVND(portfolioDefaults.openInvCost)} · Doanh thu/ngày ${formatCompactVND(portfolioDefaults.dailyRev)}`
                  : `History baseline: Inv ${formatCompactVND(portfolioDefaults.openInvCost)} · Daily Rev ${formatCompactVND(portfolioDefaults.dailyRev)}`}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">{isVi ? 'Tiền mặt đầu kỳ (₫) [Giả định]' : 'Starting cash balance (₫) [Assumption]'}</label>
                <input type="number" step={1000000} value={startingCashVnd} onChange={(e) => setStartingCashVnd(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Đệm tiền mặt tối thiểu an toàn (₫)' : 'Minimum cash safety floor (₫)'}</label>
                <input type="number" step={1000000} value={minCashBufferVnd} onChange={(e) => setMinCashBufferVnd(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Chi nhập hàng dự kiến ngày 1 (₫)' : 'Planned PO cash outflow Day 1 (₫)'}</label>
                <input type="number" min={0} step={1000000} value={plannedRestockCashVnd} onChange={(e) => setPlannedRestockCashVnd(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'DSO: Số ngày thu tiền bán hàng (COD/ví)' : 'DSO: Receivables collection days'}</label>
                <input type="number" min={0} max={90} value={dsoDays} onChange={(e) => setDsoDays(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'DPO: Số ngày công nợ nhà cung cấp' : 'DPO: Supplier payable days'}</label>
                <input type="number" min={0} max={120} value={dpoDays} onChange={(e) => setDpoDays(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Chu kỳ theo dõi dòng tiền (ngày)' : 'Cash runway horizon (days)'}</label>
                <input type="number" min={14} max={180} value={runwayHorizonDays} onChange={(e) => setRunwayHorizonDays(Number(e.target.value) || 60)} className="field field-num" />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" disabled={loading || products.length === 0} onClick={runCashRunway} className="btn btn-primary">
                {loading ? (isVi ? 'Đang chạy 2.000 kịch bản tiền mặt…' : 'Running cash Monte Carlo…') : isVi ? 'Tính Chu kỳ Vốn (CCC) & Đường băng Tiền mặt' : 'Simulate CCC & Cash Runway'}
              </button>
            </div>
          </div>

          {runwayRes && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="panel p-4">
                  <p className="hint">CCC = DIO + DSO − DPO</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{runwayRes.ratios.cash_conversion_cycle_days.toFixed(1)} {isVi ? 'ngày' : 'days'}</p>
                  <p className="hint text-[11px]">DIO {runwayRes.ratios.dio_days}d + DSO {runwayRes.ratios.dso_days}d − DPO {runwayRes.ratios.dpo_days}d</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Tiền mặt trung vị cuối kỳ (P50)' : 'Ending P50 Cash'}</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{formatVND(runwayRes.ending_p50_cash_vnd)}</p>
                  <p className="hint text-[11px]">P5: {formatVND(runwayRes.ending_p5_cash_vnd)}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Xác suất chạm đáy < Đệm an toàn' : 'Prob Breach Safety Buffer'}</p>
                  <p className="mt-1 text-[22px] font-bold text-warn">{(runwayRes.prob_breach_min_buffer * 100).toFixed(1)}%</p>
                  <p className="hint text-[11px]">{isVi ? `Cạn tiền (< 0₫): ${(runwayRes.prob_cash_shortage * 100).toFixed(1)}%` : `Cash < 0: ${(runwayRes.prob_cash_shortage * 100).toFixed(1)}%`}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Cảnh báo thanh khoản' : 'Liquidity Verdict'}</p>
                  <p className={`mt-1 text-[20px] font-bold uppercase ${
                    runwayRes.shortage_alert_level === 'critical' ? 'text-bad' :
                    runwayRes.shortage_alert_level === 'caution' ? 'text-warn' : 'text-good'
                  }`}>
                    {runwayRes.shortage_alert_level}
                  </p>
                </div>
              </div>

              <div className="panel p-5">
                <h3 className="h3 mb-3">
                  {isVi ? 'Quỹ đạo Tiền mặt Monte Carlo (P5 / P50 / P95)' : 'Cash Runway Fan Chart (P5 / P50 / P95)'}
                </h3>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height={280} minWidth={260}>
                    <ComposedChart data={runwayRes.trajectory} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="rgb(var(--rule))" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <YAxis width={78} tickFormatter={(v: number) => formatCompactVND(v)} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <Tooltip formatter={(val: number, name: string) => [formatVND(val), name]} />
                      <ReferenceLine y={minCashBufferVnd} stroke="rgb(var(--warn))" strokeDasharray="4 4" label={isVi ? 'Đệm an toàn' : 'Min Buffer'} />
                      <ReferenceLine y={0} stroke="rgb(var(--bad))" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="p95_cash_vnd" name="P95" stroke="none" fill="rgb(var(--good))" fillOpacity={0.14} isAnimationActive={false} />
                      <Line type="monotone" dataKey="p50_cash_vnd" name="P50 (Median)" stroke="rgb(var(--accent))" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="p5_cash_vnd" name="P5 (Downside)" stroke="rgb(var(--bad))" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------------- 3. MULTI-SKU PORTFOLIO ---------------- */}
      {subTool === 'portfolio' && (
        <section className="space-y-5" data-testid="planning-portfolio-section">
          <div className="panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">
                {isVi ? 'Tối ưu Danh mục Đa SKU dưới Ràng buộc Vốn & Kho' : 'Multi-SKU Capital & Warehouse Portfolio Optimizer'}
              </h2>
              <span className="badge border-cobalt/40 bg-cobalt-bg text-cobalt">
                {isVi ? 'Knapsack DP Đa Lựa Chọn · Giả định cầu độc lập giữa các SKU' : 'Multiple-Choice Knapsack DP · Independent Demand Assumption'}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">{isVi ? 'Ngân sách vốn lưu động tối đa (₫)' : 'Total working capital budget (₫)'}</label>
                <input type="number" min={0} step={5000000} value={portBudgetVnd} onChange={(e) => setPortBudgetVnd(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Sức chứa kho tổng (đơn vị, tùy chọn)' : 'Warehouse unit cap (optional)'}</label>
                <input type="number" min={0} value={portWhMaxStr} onChange={(e) => setPortWhMaxStr(e.target.value)} className="field field-num" placeholder={isVi ? 'Không giới hạn' : 'Unlimited'} />
              </div>
              <div>
                <label className="label">{isVi ? 'Hệ số ngại rủi ro λ (phạt Expect − P5)' : 'Risk-aversion λ (downside penalty)'}</label>
                <input type="number" min={0} max={2} step={0.05} value={riskLambda} onChange={(e) => setRiskLambda(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Biên độ đổi giá tối đa (±%)' : 'Max SKU price shift (±%)'}</label>
                <input type="number" min={5} max={45} value={portMaxMovePct} onChange={(e) => setPortMaxMovePct(Number(e.target.value) || 20)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Biên gộp tối thiểu bắt buộc (%)' : 'Min gross margin floor (%)'}</label>
                <input type="number" min={0} max={80} value={portMinMarginPct} onChange={(e) => setPortMinMarginPct(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Kỳ hoạch định (ngày)' : 'Planning horizon (days)'}</label>
                <input type="number" min={7} max={90} value={portHorizonDays} onChange={(e) => setPortHorizonDays(Number(e.target.value) || 30)} className="field field-num" />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" disabled={loading || products.length === 0} onClick={runPortfolio} className="btn btn-primary">
                {loading ? (isVi ? 'Đang giải Knapsack danh mục…' : 'Optimizing portfolio…') : isVi ? 'Chạy Tối ưu Danh mục Đa SKU' : 'Optimize Multi-SKU Portfolio'}
              </button>
            </div>
          </div>

          {portfolioRes && (
            <div className="space-y-4">
              <Notice tone="info" title={isVi ? 'Giả định mô hình:' : 'Model assumption:'}>
                {portfolioRes.independence_assumption}
              </Notice>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Lợi nhuận danh mục tối ưu' : 'Optimized Portfolio Profit'}</p>
                  <p className="mt-1 text-[20px] font-bold text-good">{formatVND(portfolioRes.optimized_expected_profit_vnd)}</p>
                  <p className="hint text-[11px]">{isVi ? `Mốc cũ: ${formatVND(portfolioRes.base_total_profit_vnd)}` : `Base: ${formatVND(portfolioRes.base_total_profit_vnd)}`}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Tăng trưởng lợi nhuận ròng' : 'Expected Uplift'}</p>
                  <p className="mt-1 text-[20px] font-bold text-accent">
                    {portfolioRes.profit_uplift_vnd >= 0 ? '+' : ''}{formatVND(portfolioRes.profit_uplift_vnd)} ({formatPct(portfolioRes.profit_uplift_pct)})
                  </p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Sàn an toàn P5 danh mục' : 'Portfolio P5 Floor'}</p>
                  <p className="mt-1 text-[20px] font-bold text-ink">{formatVND(portfolioRes.optimized_p5_profit_vnd)}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Vốn sử dụng / Ràng buộc' : 'Capital Used'}</p>
                  <p className="mt-1 text-[20px] font-bold text-ink">{formatVND(portfolioRes.total_capital_used_vnd)}</p>
                  <p className="hint text-[11px]">
                    {portfolioRes.capital_budget_binding ? (isVi ? 'Chạm trần vốn' : 'Budget binding') : (isVi ? 'Trong hạn mức vốn' : 'Within budget')}
                  </p>
                </div>
              </div>

              <div className="panel p-5">
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height={240} minWidth={260}>
                    <BarChart data={portfolioRes.allocations} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="rgb(var(--rule))" vertical={false} />
                      <XAxis dataKey="product_id" tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <YAxis width={78} tickFormatter={(v: number) => formatCompactVND(v)} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <Tooltip formatter={(val: number, name: string) => [formatVND(val), name]} />
                      <Bar dataKey="base_profit_vnd" name={isVi ? 'Lãi giá cũ' : 'Baseline Profit'} fill="rgb(var(--muted))" isAnimationActive={false} />
                      <Bar dataKey="expected_profit_vnd" name={isVi ? 'Lãi tối ưu' : 'Optimized Profit'} fill="rgb(var(--good))" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="panel overflow-x-auto">
                <table className="data-table min-w-[840px]">
                  <thead className="bg-sunken">
                    <tr>
                      <th className="pl-4">SKU</th>
                      <th className="num">{isVi ? 'Giá cũ -> Đề xuất' : 'Base -> Target Price'}</th>
                      <th className="num">{isVi ? 'Đổi giá (%)' : 'Price Δ%'}</th>
                      <th className="num">{isVi ? 'Nhập thêm' : 'Restock'}</th>
                      <th className="num">{isVi ? 'Lãi dự kiến' : 'Expected Profit'}</th>
                      <th className="num">{isVi ? 'Chênh lệch lãi' : 'Uplift'}</th>
                      <th className="num pr-4">{isVi ? 'Vốn sử dụng' : 'Capital Req'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioRes.allocations.map((a) => (
                      <tr key={a.product_id}>
                        <td className="pl-4 font-semibold">{a.product_id} — {a.product_name}</td>
                        <td className="num">{formatVND(a.base_price_vnd)} → {formatVND(a.recommended_price_vnd)}</td>
                        <td className="num font-semibold">{a.price_change_pct > 0 ? `+${a.price_change_pct}%` : `${a.price_change_pct}%`}</td>
                        <td className="num">{formatInt(a.recommended_restock_units)}</td>
                        <td className="num font-semibold">{formatVND(a.expected_profit_vnd)}</td>
                        <td className={`num font-semibold ${a.profit_uplift_vnd >= 0 ? 'text-good' : 'text-bad'}`}>
                          {a.profit_uplift_vnd >= 0 ? '+' : ''}{formatVND(a.profit_uplift_vnd)}
                        </td>
                        <td className="num pr-4">{formatVND(a.capital_required_vnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------------- 4. VALUE OF INFORMATION (EVPI & EVSI) ---------------- */}
      {subTool === 'voi' && (
        <section className="space-y-5" data-testid="planning-voi-section">
          <div className="panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="h2">
                {isVi ? 'Giá trị Thông tin & Quyết định Thử nghiệm Giá (EVPI / EVSI)' : 'Value of Information & Price Experiment Worth (EVPI / EVSI)'}
              </h2>
              <span className="badge border-accent/40 bg-accent-bg text-accent">
                {isVi ? 'Tính trực tiếp từ phân phối bootstrap độ co giãn' : 'Derived directly from elasticity posterior samples'}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <label className="label">SKU</label>
                <select value={voiProductId} onChange={(e) => setVoiProductId(e.target.value)} className="field">
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_id} — {p.product_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{isVi ? 'Thời gian chạy thử giá A/B (ngày)' : 'Proposed price pilot (days)'}</label>
                <input type="number" min={3} max={60} value={expDays} onChange={(e) => setExpDays(Number(e.target.value) || 14)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Chi phí chạy thử nghiệm (₫) [Giả định]' : 'Experiment cost (₫) [Assumption]'}</label>
                <input type="number" min={0} step={250000} value={expCostVnd} onChange={(e) => setExpCostVnd(Number(e.target.value) || 0)} className="field field-num" />
              </div>
              <div>
                <label className="label">{isVi ? 'Biên độ phương án giá (±%)' : 'Action space bound (±%)'}</label>
                <input type="number" min={5} max={50} value={voiMaxMovePct} onChange={(e) => setVoiMaxMovePct(Number(e.target.value) || 25)} className="field field-num" />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" disabled={loading || products.length === 0} onClick={runVOI} className="btn btn-primary">
                {loading ? (isVi ? 'Đang tính EVPI & EVSI…' : 'Calculating VoI…') : isVi ? 'Đánh giá Có nên Chạy Thử Nghiệm Không' : 'Evaluate Experiment Worth (EVPI / EVSI)'}
              </button>
            </div>
          </div>

          {voiRes && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="panel p-4">
                  <p className="hint">EVPI ({isVi ? 'Trần giá trị thông tin hoàn hảo' : 'Perfect Info Ceiling'})</p>
                  <p className="mt-1 text-[20px] font-bold text-ink">{formatVND(voiRes.evpi_vnd)}</p>
                  <p className="hint text-[11px]">{formatPct(voiRes.evpi_pct_of_profit)} {isVi ? 'lãi kỳ vọng' : 'of max expected profit'}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">EVSI ({isVi ? `Giá trị phép thử ${expDays} ngày` : `${expDays}d Trial Value`})</p>
                  <p className="mt-1 text-[20px] font-bold text-accent">{formatVND(voiRes.evsi_vnd)}</p>
                  <p className="hint text-[11px]">SE co giãn: {formatNum(voiRes.prior_elasticity_std)} → {formatNum(voiRes.posterior_elasticity_std)}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">ENGS = EVSI − {isVi ? 'Chi phí thử' : 'Cost'}</p>
                  <p className={`mt-1 text-[20px] font-bold ${voiRes.engs_vnd > 0 ? 'text-good' : 'text-warn'}`}>
                    {voiRes.engs_vnd > 0 ? '+' : ''}{formatVND(voiRes.engs_vnd)}
                  </p>
                  <p className="hint text-[11px]">{isVi ? `Ngưỡng phí hòa vốn: ${formatVND(voiRes.break_even_info_cost_vnd)}` : `Break-even cost: ${formatVND(voiRes.break_even_info_cost_vnd)}`}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Khuyến nghị hành động' : 'VoI Verdict'}</p>
                  <p className={`mt-1 text-[17px] font-bold ${
                    voiRes.verdict === 'run_experiment' ? 'text-good' : 'text-cobalt'
                  }`}>
                    {voiRes.verdict === 'run_experiment'
                      ? isVi ? 'NÊN CHẠY THỬ NGHIỆM' : 'RUN EXPERIMENT'
                      : voiRes.verdict === 'low_uncertainty'
                        ? isVi ? 'ĐỦ TIN CẬY — CHỐT NGAY' : 'LOW UNCERTAINTY — DECIDE'
                        : isVi ? 'KHÔNG BÕ CHI PHÍ THỬ — CHỐT GIÁ NGAY' : 'DECIDE NOW (EVSI < COST)'}
                  </p>
                </div>
              </div>

              <div className="panel p-5">
                <h3 className="h3 mb-3">
                  {isVi ? 'Tỉ lệ phương án thắng thế theo phân phối bất định' : 'Action Optimality Share Across Uncertainty Draws'}
                </h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height={220} minWidth={260}>
                    <BarChart data={voiRes.action_landscape} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid stroke="rgb(var(--rule))" vertical={false} />
                      <XAxis dataKey="price_change_pct" tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <YAxis width={76} tickFormatter={(v: number) => formatCompactVND(v)} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <Tooltip formatter={(val: number, name: string) => name.includes('%') ? [`${(val * 100).toFixed(1)}%`, name] : [formatVND(val), name]} />
                      <Bar dataKey="expected_profit_vnd" name={isVi ? 'Lãi kỳ vọng (₫)' : 'Expected Profit (₫)'} fill="rgb(var(--accent))" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default PlanningScreen;

