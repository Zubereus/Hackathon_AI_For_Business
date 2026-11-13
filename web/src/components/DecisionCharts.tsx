import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangleIcon,
  CheckIcon,
  CoinsIcon,
  SlidersIcon,
  TrendingUpIcon,
  XIcon,
} from './Icons';
import {
  formatCompactVND,
  formatInt,
  formatNum,
  formatPct,
  formatVND,
  Lang,
} from '../i18n';
import {
  CashFlowSummary,
  ClearanceMetrics,
  PinnedScenario,
  ScenarioMetrics,
  TornadoFactor,
  WaterfallStep,
} from '../types';

interface WaterfallProps {
  waterfall: WaterfallStep[];
  lang?: Lang;
}

const STEP_LABELS: Record<string, { vi: string; en: string; descVi: string; descEn: string }> = {
  revenue: {
    vi: '1. Doanh thu',
    en: '1. Revenue',
    descVi: 'Tổng số tiền thu từ bán sản phẩm',
    descEn: 'Total gross cash collected from sales',
  },
  cogs: {
    vi: '2. Giá vốn',
    en: '2. COGS',
    descVi: 'Tiền vốn gốc để có lượng hàng đã bán',
    descEn: 'Unit inventory cost for products sold',
  },
  gross_profit: {
    vi: '3. Lãi gộp',
    en: '3. Gross Profit',
    descVi: 'Tiền lời sau khi trừ giá vốn sản phẩm',
    descEn: 'Earnings after covering wholesale costs',
  },
  fixed_marketing: {
    vi: '4. Chi phí ngoài',
    en: '4. Operating Cost',
    descVi: 'Tiền quảng cáo, nhân công, đóng gói, mặt bằng',
    descEn: 'Ads, labor, packaging, rent & fixed cost',
  },
  net_profit: {
    vi: '5. Lợi nhuận',
    en: '5. Net Profit',
    descVi: 'Tiền lãi thực sự shop nhận về',
    descEn: 'Bottom line profit you actually keep',
  },
};

export const ProfitWaterfallChart: React.FC<WaterfallProps> = ({ waterfall, lang = 'vi' }) => {
  const isVi = lang === 'vi';

  const chartData = waterfall.map((step) => {
    const meta = STEP_LABELS[step.key] || {
      vi: step.key,
      en: step.key,
      descVi: '',
      descEn: '',
    };
    const isNegative = step.amount_vnd < 0;
    const rawLow = step.is_total ? Math.min(0, step.amount_vnd) : Math.min(step.start_vnd, step.end_vnd);
    const rawHigh = step.is_total ? Math.max(0, step.amount_vnd) : Math.max(step.start_vnd, step.end_vnd);

    return {
      key: step.key,
      name: isVi ? meta.vi : meta.en,
      description: isVi ? meta.descVi : meta.descEn,
      amount: step.amount_vnd,
      range: [rawLow, rawHigh] as [number, number],
      start: step.start_vnd,
      end: step.end_vnd,
      isTotal: step.is_total,
      isNegative,
    };
  });

  const getBarColor = (entry: (typeof chartData)[0]) => {
    if (entry.key === 'revenue') return 'rgb(var(--cobalt))';
    if (entry.key === 'cogs') return 'rgb(var(--coral))';
    if (entry.key === 'gross_profit') return entry.isNegative ? 'rgb(var(--bad))' : 'rgb(var(--indigo))';
    if (entry.key === 'fixed_marketing') return 'rgb(var(--warn))';
    if (entry.key === 'net_profit') return entry.isNegative ? 'rgb(var(--bad))' : 'rgb(var(--good))';
    return entry.isNegative ? 'rgb(var(--bad))' : 'rgb(var(--accent))';
  };

  return (
    <div className="panel p-5" data-testid="profit-waterfall-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="h2 flex items-center gap-2">
            <TrendingUpIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>
              {isVi
                ? 'Bóc tách dòng tiền: Từ Doanh thu đến Lợi nhuận ròng'
                : 'Profit Waterfall: From Revenue to Net Profit'}
            </span>
          </h3>
          <p className="hint mt-0.5">
            {isVi
              ? 'Từng bước trừ giá vốn và chi phí để biết chính xác đồng tiền chảy về đâu.'
              : 'Step-by-step breakdown subtracting COGS and overhead to reveal your true take-home.'}
          </p>
        </div>
      </div>

      <div className="mt-4 h-[280px] w-full">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 12, right: 16, left: 16, bottom: 16 }}>
            <CartesianGrid stroke="rgb(var(--rule))" strokeDasharray="3 3" vertical={false} />
            <ReferenceLine y={0} stroke="rgb(var(--rule-strong))" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: 'rgb(var(--ink))' }}
              interval={0}
              tickMargin={6}
              tickLine={false}
              axisLine={{ stroke: 'rgb(var(--rule-strong))' }}
            />
            <YAxis
              width={70}
              tickFormatter={(v: number) => formatCompactVND(v)}
              tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload as (typeof chartData)[0];
                return (
                  <div className="rounded border border-rule-strong bg-surface p-3 text-[13px] shadow-md">
                    <p className="font-semibold text-ink">{d.name}</p>
                    <p className="hint text-[11px]">{d.description}</p>
                    <div className="mt-2 border-t border-rule pt-1.5">
                      <span className="text-muted">{isVi ? 'Số tiền:' : 'Amount:'} </span>
                      <strong
                        className={`tabular-nums ${
                          d.isNegative
                            ? 'text-bad'
                            : d.key === 'net_profit' || d.key === 'gross_profit'
                              ? 'text-good'
                              : 'text-ink'
                        }`}
                      >
                        {d.amount > 0 ? '+' : ''}
                        {formatVND(d.amount)}
                      </strong>
                    </div>
                  </div>
                );
              }}
            />
            {/* Floating range waterfall bar ([low, high] handles positive, negative, and zero-crossing steps cleanly) */}
            <Bar
              dataKey="range"
              isAnimationActive={false}
              radius={[4, 4, 4, 4]}
            >
              {chartData.map((entry, idx) => (
                <Cell key={`bar-${idx}`} fill={getBarColor(entry)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 grid gap-2 border-t border-rule pt-3 text-[12px] sm:grid-cols-5">
        {chartData.map((item) => (
          <div
            key={item.key}
            className={`rounded-lg border p-2.5 ${
              item.key === 'revenue'
                ? 'border-cobalt/25 bg-cobalt-bg/40'
                : item.key === 'cogs'
                  ? 'border-coral/25 bg-coral-bg/40'
                  : item.key === 'fixed_marketing'
                    ? 'border-warn/25 bg-warn-bg/40'
                    : item.key === 'net_profit'
                      ? 'border-good/25 bg-good-bg/45'
                      : 'border-rule bg-sunken/60'
            }`}
          >
            <span className="hint block truncate text-[11.5px] font-medium">{item.name}</span>
            <strong
              className={`tabular-nums text-[13px] ${
                item.isNegative
                  ? 'text-bad'
                  : item.key === 'net_profit'
                    ? 'text-good'
                    : 'text-ink'
              }`}
            >
              {item.amount > 0 ? '+' : ''}
              {formatCompactVND(item.amount)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
};

interface TornadoProps {
  tornado: TornadoFactor[];
  baseProfit: number;
  lang?: Lang;
}

const TORNADO_TITLES: Record<string, { vi: string; en: string }> = {
  selling_price: {
    vi: 'Giá bán sản phẩm (±10%)',
    en: 'Selling Price (±10%)',
  },
  buyer_reaction: {
    vi: 'Phản ứng sức mua khách (p90 vs p10)',
    en: 'Buyer Demand Elasticity (p90 vs p10)',
  },
  unit_cost: {
    vi: 'Giá vốn nhập hàng (±10%)',
    en: 'Unit Wholesale Cost (±10%)',
  },
  fixed_marketing: {
    vi: 'Chi phí marketing & cố định',
    en: 'Marketing & Fixed Spend',
  },
};

export const SensitivityTornadoChart: React.FC<TornadoProps> = ({
  tornado,
  baseProfit,
  lang = 'vi',
}) => {
  const isVi = lang === 'vi';
  const sorted = [...tornado].sort((a, b) => b.spread_vnd - a.spread_vnd);

  return (
    <div className="panel p-5" data-testid="sensitivity-tornado-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="h2 flex items-center gap-2">
            <SlidersIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>
              {isVi
                ? 'Độ nhạy lợi nhuận: Yếu tố nào tác động mạnh nhất?'
                : 'Profit Sensitivity: What Drives Profit Most?'}
            </span>
          </h3>
          <p className="hint mt-0.5">
            {isVi
              ? 'Xếp hạng từ yếu tố làm lãi chao đảo nhiều nhất đến ít nhất, giúp bạn biết nên cẩn trọng điều gì.'
              : 'Ranked from biggest profit driver to smallest spread, showing what risks matter most.'}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        {sorted.map((factor, idx) => {
          const title = TORNADO_TITLES[factor.key] || { vi: factor.key, en: factor.key };
          const minProfit = Math.min(...sorted.map((f) => f.low_profit), baseProfit * 0.7);
          const maxProfit = Math.max(...sorted.map((f) => f.high_profit), baseProfit * 1.3);
          const totalRange = maxProfit - minProfit || 1;

          const leftPct = Math.max(
            0,
            Math.min(100, ((factor.low_profit - minProfit) / totalRange) * 100)
          );
          const rightPct = Math.max(
            0,
            Math.min(100, ((factor.high_profit - minProfit) / totalRange) * 100)
          );
          const basePct = Math.max(
            0,
            Math.min(100, ((baseProfit - minProfit) / totalRange) * 100)
          );

          return (
            <div key={factor.key} className="rounded-xl border border-rule bg-sunken/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cobalt text-[11px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-ink">
                    {isVi ? title.vi : title.en}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hint text-[12px]">
                    {isVi ? 'Biên dao động lãi:' : 'Profit spread:'}
                  </span>
                  <span className="tag border-cobalt/30 bg-cobalt-bg/65 font-semibold tabular-nums text-cobalt">
                    ±{formatCompactVND(factor.spread_vnd / 2)} (chênh {formatCompactVND(factor.spread_vnd)})
                  </span>
                </div>
              </div>

              {/* Visual Range bar */}
              <div className="relative mt-2.5 h-3.5 w-full rounded-full bg-sunken">
                {/* Highlighted span */}
                <div
                  className="absolute top-0 bottom-0 rounded-full bg-gradient-to-r from-coral via-cobalt to-good opacity-90"
                  style={{
                    left: `${Math.min(leftPct, rightPct)}%`,
                    width: `${Math.max(2, Math.abs(rightPct - leftPct))}%`,
                  }}
                />
                {/* Base profit anchor mark */}
                <div
                  className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-ink shadow"
                  style={{ left: `${basePct}%` }}
                  title={`${isVi ? 'Mốc hiện tại' : 'Base'}: ${formatVND(baseProfit)}`}
                />
              </div>

              <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular-nums">
                <span>
                  {isVi ? 'Bất lợi (' : 'Low ('}
                  {factor.low_label}):{' '}
                  <strong className="text-bad">{formatVND(factor.low_profit)}</strong>
                </span>
                <span>
                  {isVi ? 'Thuận lợi (' : 'High ('}
                  {factor.high_label}):{' '}
                  <strong className="text-good">{formatVND(factor.high_profit)}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface CashFlowProps {
  cashFlow: CashFlowSummary;
  unitCostVnd: number;
  lang?: Lang;
}

export const CashFlowVsProfitCard: React.FC<CashFlowProps> = ({
  cashFlow,
  unitCostVnd,
  lang = 'vi',
}) => {
  const isVi = lang === 'vi';
  const hasRestock = cashFlow.restock_units > 0;
  const isCashNegative = cashFlow.net_cash_flow_vnd < 0;

  return (
    <div className="panel p-5" data-testid="cashflow-vs-profit-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="h2 flex items-center gap-2">
          <CoinsIcon className="h-4 w-4 text-accent" aria-hidden="true" />
          <span>
            {isVi
              ? 'Lợi nhuận sổ sách vs Tiền mặt thực thu về két'
              : 'Accounting Profit vs Actual Cash Flow'}
          </span>
        </h3>
        <span
          className={`tag border ${
            isCashNegative
              ? 'border-bad/30 bg-bad-bg text-bad'
              : 'border-good/30 bg-good-bg text-good'
          } font-semibold`}
        >
          {isCashNegative
            ? isVi
              ? 'CẢNH BÁO DÒNG TIỀN ÂM'
              : 'CASH FLOW DEFICIT'
            : isVi
              ? 'DÒNG TIỀN THỰC DƯƠNG'
              : 'POSITIVE CASH FLOW'}
        </span>
      </div>

      <p className="hint mt-1">
        {isVi
          ? 'Tiền lãi trên giấy tờ không phải lúc nào cũng là tiền mặt trong túi. Nếu bạn nhập thêm hàng, tiền mặt sẽ bị khóa vào kho ngay lập tức.'
          : 'Accounting profit is not cash in bank. Restocking locks cash into inventory until stock sells out.'}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-cobalt/25 bg-cobalt-bg/45 p-3.5">
          <span className="text-[11.5px] font-semibold text-cobalt">
            {isVi ? 'Lợi nhuận ròng (Sổ sách)' : 'Net Profit (Accounting)'}
          </span>
          <p className="mt-1 text-[18px] font-bold tabular-nums text-ink">
            {formatVND(cashFlow.net_profit_vnd)}
          </p>
          <span className="hint block text-[11px]">
            {isVi ? 'Doanh thu − Giá vốn món bán − Chi phí' : 'Revenue − COGS sold − Overhead'}
          </span>
        </div>

        <div className="rounded-xl border border-warn/25 bg-warn-bg/50 p-3.5">
          <span className="text-[11.5px] font-semibold text-warn">
            {isVi ? 'Vốn nhập hàng cần chi ngay' : 'Upfront Restock Cash Needed'}
          </span>
          <p className="mt-1 text-[18px] font-bold tabular-nums text-ink">
            {hasRestock ? formatVND(cashFlow.restock_cash_needed_vnd) : '0 ₫'}
          </p>
          <span className="hint block text-[11px]">
            {hasRestock
              ? `${formatInt(cashFlow.restock_units)} ${isVi ? 'món' : 'units'} × ${formatVND(unitCostVnd)}`
              : isVi
                ? 'Không dự kiến nhập thêm'
                : 'No restock planned'}
          </span>
        </div>

        <div
          className={`rounded-xl border p-3.5 ${
            isCashNegative ? 'border-bad/30 bg-bad-bg/50' : 'border-accent/30 bg-accent-bg/50'
          }`}
        >
          <span
            className={`text-[11.5px] font-semibold ${isCashNegative ? 'text-bad' : 'text-accent'}`}
          >
            {isVi ? 'Dòng tiền thực thu về két' : 'Net Cash Flow'}
          </span>
          <p
            className={`mt-1 text-[18px] font-bold tabular-nums ${
              isCashNegative ? 'text-bad' : 'text-accent'
            }`}
          >
            {formatVND(cashFlow.net_cash_flow_vnd)}
          </p>
          <span className="hint block text-[11px]">
            {isVi ? 'Tiền mặt còn lại sau khi nhập hàng' : 'Cash remaining after paying restocking'}
          </span>
        </div>
      </div>

      {hasRestock && isCashNegative && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-bad/30 bg-bad-bg/60 p-3 text-[13px] text-bad">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {isVi
              ? `Lưu ý rủi ro dòng tiền: Dự kiến nhập ${formatInt(cashFlow.restock_units)} món sẽ cần ${formatVND(cashFlow.restock_cash_needed_vnd)} tiền mặt. Vì số tiền nhập hàng lớn hơn tiền lời kỳ này, két của shop sẽ hụt ${formatVND(Math.abs(cashFlow.net_cash_flow_vnd))} tiền mặt tạm thời!`
              : `Cash deficit warning: Ordering ${formatInt(cashFlow.restock_units)} units requires ${formatVND(cashFlow.restock_cash_needed_vnd)} cash upfront, causing a temporary cash deficit of ${formatVND(Math.abs(cashFlow.net_cash_flow_vnd))}.`}
          </span>
        </div>
      )}
    </div>
  );
};

interface ScenarioComparisonProps {
  baseMetrics: ScenarioMetrics;
  expectedMetrics: ScenarioMetrics;
  pinnedScenarios: PinnedScenario[];
  activeProductId: string;
  onRemovePinned: (id: string) => void;
  onSelectPinned: (sc: PinnedScenario) => void;
  onPinCurrent: () => void;
  canPinCurrent: boolean;
  lang?: Lang;
}

export const ScenarioComparisonTable: React.FC<ScenarioComparisonProps> = ({
  baseMetrics,
  expectedMetrics,
  pinnedScenarios,
  activeProductId,
  onRemovePinned,
  onSelectPinned,
  onPinCurrent,
  canPinCurrent,
  lang = 'vi',
}) => {
  const isVi = lang === 'vi';
  const relevantPinned = pinnedScenarios.filter((sc) => sc.productId === activeProductId);

  return (
    <div className="panel overflow-hidden" data-testid="scenario-comparison-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-sunken/40 px-5 py-3.5">
        <div>
          <h3 className="h2 text-[16px]">
            {isVi ? 'So sánh các phương án đã thử' : 'Multi-Scenario Comparison'}
          </h3>
          <p className="hint">
            {isVi
              ? 'Đặt các phương án cạnh nhau để so sánh doanh thu, tiền lời và vốn cần chuẩn bị.'
              : 'Compare parallel pricing and inventory strategies side-by-side.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!canPinCurrent}
          onClick={onPinCurrent}
          className="btn btn-secondary gap-1.5 text-[13px]"
        >
          <CheckIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>
            {isVi ? 'Lưu phương án đang thử (Ghim)' : 'Save / Pin Current Strategy'}
          </span>
        </button>
      </div>

      <div className="relative overflow-x-auto">
        <table className="data-table min-w-[700px]">
          <thead className="bg-sunken">
            <tr>
              <th scope="col" className="pl-5">
                {isVi ? 'Phương án' : 'Scenario'}
              </th>
              <th scope="col" className="num">
                {isVi ? 'Giá bán' : 'Price'}
              </th>
              <th scope="col" className="num">
                {isVi ? 'Lượng bán dự kiến' : 'Units Sold'}
              </th>
              <th scope="col" className="num">
                {isVi ? 'Doanh thu' : 'Revenue'}
              </th>
              <th scope="col" className="num">
                {isVi ? 'Lợi nhuận ròng' : 'Net Profit'}
              </th>
              <th scope="col" className="num">
                {isVi ? 'Chênh lệch so với giá cũ' : 'Profit Uplift'}
              </th>
              <th scope="col" className="num pr-5">
                {isVi ? 'Thao tác' : 'Action'}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Baseline */}
            <tr>
              <th scope="row" className="pl-5">
                <div className="font-semibold">{isVi ? 'Giữ nguyên giá cũ' : 'Keep Old Price (Base)'}</div>
                <div className="hint text-[11px]">{isVi ? 'Mốc chuẩn ban đầu' : 'Baseline benchmark'}</div>
              </th>
              <td className="num">{formatVND(baseMetrics.price_vnd ?? null)}</td>
              <td className="num">{formatInt(baseMetrics.qty)}</td>
              <td className="num">{formatVND(baseMetrics.revenue)}</td>
              <td className="num font-semibold">{formatVND(baseMetrics.profit)}</td>
              <td className="num text-muted">—</td>
              <td className="num pr-5 text-muted">—</td>
            </tr>

            {/* Current Active Experiment */}
            <tr className="bg-accent-bg/35">
              <th scope="row" className="pl-5">
                <div className="font-semibold text-accent">
                  {isVi ? 'Phương án đang thử nghiệm' : 'Current Active Simulation'}
                </div>
                <div className="hint text-[11px]">
                  {isVi ? 'Đang điều chỉnh trên màn hình' : 'Currently active on screen'}
                </div>
              </th>
              <td className="num font-semibold">{formatVND(expectedMetrics.price_vnd ?? null)}</td>
              <td className="num">{formatInt(expectedMetrics.qty)}</td>
              <td className="num">{formatVND(expectedMetrics.revenue)}</td>
              <td className="num font-semibold text-good">{formatVND(expectedMetrics.profit)}</td>
              <td className="num font-semibold">
                {expectedMetrics.profit >= baseMetrics.profit ? (
                  <span className="text-good">
                    +{formatCompactVND(expectedMetrics.profit - baseMetrics.profit)}
                  </span>
                ) : (
                  <span className="text-bad">
                    −{formatCompactVND(baseMetrics.profit - expectedMetrics.profit)}
                  </span>
                )}
              </td>
              <td className="num pr-5 text-[12px] text-muted">
                <span className="tag border border-accent/40 bg-accent/10 text-accent">
                  {isVi ? 'Đang chọn' : 'Active'}
                </span>
              </td>
            </tr>

            {/* Pinned Scenarios */}
            {relevantPinned.map((sc) => {
              const exp = sc.response.scenarios.expected;
              const diff = exp.profit - baseMetrics.profit;
              return (
                <tr key={sc.id}>
                  <th scope="row" className="pl-5">
                    <div className="font-semibold">{sc.name}</div>
                    <div className="hint text-[11px]">
                      {isVi ? 'Đổi giá: ' : 'Price move: '}
                      {formatPct(sc.priceChangePct, 1)}
                      {sc.restockUnits ? ` · Nhập ${formatInt(sc.restockUnits)} cái` : ''}
                    </div>
                  </th>
                  <td className="num">{formatVND(exp.price_vnd ?? null)}</td>
                  <td className="num">{formatInt(exp.qty)}</td>
                  <td className="num">{formatVND(exp.revenue)}</td>
                  <td className="num font-semibold">{formatVND(exp.profit)}</td>
                  <td className="num font-semibold">
                    {diff >= 0 ? (
                      <span className="text-good">+{formatCompactVND(diff)}</span>
                    ) : (
                      <span className="text-bad">−{formatCompactVND(Math.abs(diff))}</span>
                    )}
                  </td>
                  <td className="num pr-5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectPinned(sc)}
                        className="btn-quiet rounded border border-rule px-2 py-0.5 text-[12px] text-accent hover:border-accent"
                      >
                        {isVi ? 'Mở lại' : 'Load'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemovePinned(sc.id)}
                        aria-label={`Remove ${sc.name}`}
                        className="p-1 text-muted hover:text-bad"
                      >
                        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {relevantPinned.length === 0 && (
        <div className="border-t border-rule bg-sunken/20 px-5 py-3 text-center text-[13px] text-muted">
          {isVi
            ? 'Bạn chưa ghim phương án nào. Hãy bấm "Lưu phương án đang thử" ở góc trên để lưu lại và so sánh nhiều kịch bản song song!'
            : 'No pinned scenarios yet. Click "Save / Pin Current Strategy" to compare parallel options!'}
        </div>
      )}
    </div>
  );
};

interface ClearanceRecoveryProps {
  clearance: ClearanceMetrics;
  unitCostVnd: number;
  basePriceVnd: number;
  newPriceVnd: number;
  baseProfitVnd: number;
  newProfitVnd: number;
  lang?: Lang;
}

export const ClearanceRecoveryCard: React.FC<ClearanceRecoveryProps> = ({
  clearance,
  unitCostVnd,
  basePriceVnd,
  newPriceVnd,
  baseProfitVnd,
  newProfitVnd,
  lang = 'vi',
}) => {
  const isVi = lang === 'vi';
  const profitDelta = newProfitVnd - baseProfitVnd;
  const ageTierLabel =
    clearance.age_tier === 'stale'
      ? isVi
        ? 'Tồn lâu (≥60 ngày) — ưu tiên thu hồi vốn'
        : 'Stale batch (≥60d) — cash recovery priority'
      : clearance.age_tier === 'aging'
        ? isVi
          ? 'Bắt đầu chậm (30–59 ngày) — nên đẩy nhanh ngắn hạn'
          : 'Aging stock (30–59d) — short clearance fits'
        : clearance.inventory_age_days
          ? isVi
            ? 'Hàng mới (<30 ngày) — cân nhắc giữ biên lãi'
            : 'Fresh stock (<30d) — watch margin trade-off'
          : null;

  const paybackBadgeClass = !clearance.recovers_unit_cost
    ? 'border-bad/30 bg-bad-bg text-bad'
    : clearance.recovers_total_cost
      ? 'border-good/30 bg-good-bg text-good'
      : 'border-warn/30 bg-warn-bg text-warn';

  const paybackBadgeLabel = !clearance.recovers_unit_cost
    ? isVi
      ? 'BÁN DƯỚI GIÁ VỐN'
      : 'BELOW UNIT COST'
    : clearance.recovers_total_cost
      ? isVi
        ? 'HOÀN ĐỦ VỐN & VẪN CÓ LÃI'
        : 'FULL COST PAYBACK + PROFIT'
      : isVi
        ? 'HOÀN VỐN MỖI MÓN (ÂM CHI PHÍ NGOÀI)'
        : 'UNIT COST COVERED (NET LOSS AFTER OVERHEAD)';

  return (
    <div className="panel p-5" data-testid="clearance-recovery-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <CoinsIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="h2 text-[16px]">
              {isVi
                ? `Kiểm tra Hoàn vốn & Xoay vòng tồn kho (${clearance.horizon_days} ngày)`
                : `Cost Recovery & Inventory Velocity (${clearance.horizon_days}d)`}
            </h3>
          </div>
          <p className="hint mt-0.5">
            {isVi
              ? 'Đánh giá mặt tích cực của giảm giá: bán nhanh hơn, thu hồi vốn nhập hàng và giảm áp lực tồn kho thay vì chỉ nhìn chênh lệch lãi ròng.'
              : 'Evaluates cash-recovery and turnover upside from discounting, beyond net profit difference alone.'}
          </p>
        </div>
        <span className={`tag border ${paybackBadgeClass}`}>{paybackBadgeLabel}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-rule bg-sunken/40 p-3">
          <div className="label text-[11px]">
            {isVi ? 'Hoàn vốn nhập mỗi món' : 'Unit Cost Recovery'}
          </div>
          <div
            className={`mt-1 text-lg font-bold num ${
              !clearance.recovers_unit_cost
                ? 'text-bad'
                : clearance.recovers_total_cost
                  ? 'text-good'
                  : 'text-warn'
            }`}
          >
            {formatNum(clearance.unit_recovery_pct, 1)}%
          </div>
          <p className="hint mt-0.5 text-[11px]">
            {isVi
              ? `Bán ${formatVND(newPriceVnd)} so với vốn ${formatVND(unitCostVnd)}`
              : `Price ${formatVND(newPriceVnd)} vs ${formatVND(unitCostVnd)} cost`}
          </p>
        </div>

        <div className="rounded border border-rule bg-sunken/40 p-3">
          <div className="label text-[11px]">
            {isVi ? 'Bán thoát thêm' : 'Extra Units Cleared'}
          </div>
          <div
            className={`mt-1 text-lg font-bold num ${
              clearance.extra_units_cleared > 0 ? 'text-good' : 'text-ink'
            }`}
          >
            {clearance.extra_units_cleared >= 0 ? '+' : ''}
            {formatInt(clearance.extra_units_cleared)} {isVi ? 'món' : 'units'}
          </div>
          <p className="hint mt-0.5 text-[11px]">
            {isVi ? 'Tốc độ bán ' : 'Velocity '}
            {clearance.turnover_speedup_pct >= 0 ? '+' : ''}
            {formatNum(clearance.turnover_speedup_pct, 1)}%
            {clearance.stock_cleared_pct !== null && clearance.stock_cleared_pct !== undefined
              ? ` · ${isVi ? 'xả' : 'clears'} ${formatNum(clearance.stock_cleared_pct, 0)}% ${isVi ? 'kho' : 'stock'}`
              : ''}
          </p>
        </div>

        <div className="rounded border border-rule bg-sunken/40 p-3">
          <div className="label text-[11px]">
            {isVi ? 'Vốn nhập giải phóng thêm' : 'Extra Capital Freed'}
          </div>
          <div
            className={`mt-1 text-lg font-bold num ${
              clearance.extra_capital_freed_vnd > 0 ? 'text-accent' : 'text-ink'
            }`}
          >
            {clearance.extra_capital_freed_vnd >= 0 ? '+' : ''}
            {formatCompactVND(clearance.extra_capital_freed_vnd)}
          </div>
          <p className="hint mt-0.5 text-[11px]">
            {isVi ? 'Tổng vốn quay vòng: ' : 'Total capital turned: '}
            {formatCompactVND(clearance.total_cost_capital_turned_vnd)}
          </p>
        </div>

        <div className="rounded border border-rule bg-sunken/40 p-3">
          <div className="label text-[11px]">
            {clearance.days_saved_to_clear !== null && clearance.days_saved_to_clear !== undefined
              ? isVi
                ? 'Rút ngắn ngày đọng vốn'
                : 'Days-to-Clear Saved'
              : isVi
                ? 'Tuổi hàng / Giữ kho'
                : 'Stock Age / Carry'}
          </div>
          <div className="mt-1 text-lg font-bold num text-ink">
            {clearance.days_saved_to_clear !== null && clearance.days_saved_to_clear !== undefined
              ? `${clearance.days_saved_to_clear > 0 ? '−' : ''}${formatNum(Math.abs(clearance.days_saved_to_clear), 1)} ${isVi ? 'ngày' : 'days'}`
              : clearance.inventory_age_days
                ? `${clearance.inventory_age_days} ${isVi ? 'ngày' : 'days'}`
                : '—'}
          </div>
          <p className="hint mt-0.5 text-[11px]">
            {clearance.base_days_to_clear && clearance.plan_days_to_clear
              ? `${formatNum(clearance.base_days_to_clear, 1)} → ${formatNum(clearance.plan_days_to_clear, 1)} ${isVi ? 'ngày bán hết' : 'd to clear'}`
              : isVi
                ? `Giá cũ ${formatVND(basePriceVnd)}`
                : `Base price ${formatVND(basePriceVnd)}`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-rule bg-surface px-3.5 py-2.5 text-[12px]">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {isVi ? 'Đánh đổi tiền lãi ròng: ' : 'Net profit trade-off: '}
            <strong className={profitDelta >= 0 ? 'text-good' : 'text-ink'}>
              {profitDelta >= 0 ? '+' : ''}
              {formatVND(profitDelta)}
            </strong>
          </span>
          {clearance.holding_cost_saved_vnd > 0 && (
            <span className="text-good">
              {isVi ? '· Tránh phí lưu kho/rớt giá: ' : '· Holding cost avoided: '}
              <strong>+{formatVND(clearance.holding_cost_saved_vnd)}</strong>
            </span>
          )}
        </div>
        {ageTierLabel && <span className="font-medium text-muted">{ageTierLabel}</span>}
      </div>
    </div>
  );
};
