import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PriceDeltaBridgeCard, SkuAvatarBadge } from '../components/BrandVisuals';
import {
  CashFlowVsProfitCard,
  ClearanceRecoveryCard,
  ProfitWaterfallChart,
  ScenarioComparisonTable,
  SensitivityTornadoChart,
} from '../components/DecisionCharts';
import {
  AlertTriangleIcon,
  CheckIcon,
  CoinsIcon,
  InfoIcon,
  ShieldCheckIcon,
  SlidersIcon,
  SparklesIcon,
  TagIcon,
  TrendingUpIcon,
} from '../components/Icons';
import { Notice } from '../components/Page';
import { StepExplainer } from '../components/StepExplainer';
import { StoreHealthPulse } from '../components/StoreHealthPulse';
import { TransparentAssumptionsCard } from '../components/TransparentAssumptionsCard';
import {
  describeWarning,
  formatCompactVND,
  formatInt,
  formatNum,
  formatPct,
  formatVND,
  Lang,
} from '../i18n';
import {
  DecisionGoal,
  NLQExplainResponse,
  NLQParseFallback,
  PinnedScenario,
  ProductElasticity,
  SchedulePhase,
  SimulateResponse,
  SuggestedScenarioPreset,
} from '../types';
import { AssumptionsScreen, sampleQuantile } from './AssumptionsScreen';

interface WhatIfScreenProps {
  lang?: Lang;
  products: ProductElasticity[];
  selectedProductId: string;
  priceChangePct: number;
  unitCostChangePct?: number;
  extraFixedCostVnd?: number;
  plannedRestockUnits?: number;
  horizonDays: number;
  decisionGoal?: DecisionGoal;
  inventoryAgeDays?: number | null;
  holdingCostPctPerMonth?: number;
  schedulePhases: SchedulePhase[];
  seed: number;
  simulationResult: SimulateResponse | null;
  explanationData: NLQExplainResponse | null;
  fixtureNote: string | null;
  nlqStatus: { type: 'ok' | 'fallback'; message: string } | null;
  nlqGuidance?: NLQParseFallback | null;
  loading: boolean;
  nlqLoading: boolean;
  error: string | null;
  onUpdateProduct?: (productId: string, patch: Partial<ProductElasticity>) => void;
  onChangeParams: (patch: {
    productId?: string;
    priceChangePct?: number;
    unitCostChangePct?: number;
    extraFixedCostVnd?: number;
    plannedRestockUnits?: number;
    horizonDays?: number;
    decisionGoal?: DecisionGoal;
    inventoryAgeDays?: number | null;
    holdingCostPctPerMonth?: number;
    schedulePhases?: SchedulePhase[];
    seed?: number;
  }) => void;
  onRunSimulate: (override?: {
    productId?: string;
    priceChangePct?: number;
    unitCostChangePct?: number;
    extraFixedCostVnd?: number;
    plannedRestockUnits?: number | null;
    horizonDays?: number;
    decisionGoal?: DecisionGoal;
    inventoryAgeDays?: number | null;
    holdingCostPctPerMonth?: number;
    schedule?: SchedulePhase[];
    seed?: number;
  }) => void;
  onParseNLQ: (question: string) => void;
}

const DEFAULT_SCHEDULE_PRESET: SchedulePhase[] = [
  {
    days: 15,
    start_change_pct: -30,
    daily_step_pct: 0,
    relative_to_prev: false,
    compound_daily_step: false,
    step_on_first_day: false,
  },
  {
    days: 15,
    start_change_pct: 0,
    daily_step_pct: 1,
    relative_to_prev: true,
    compound_daily_step: true,
    step_on_first_day: true,
  },
];

const SCENARIOS = [
  {
    key: 'base',
    nameEn: 'Keep current price',
    nameVi: 'Giữ nguyên giá cũ',
    noteEn: 'Benchmark if you change nothing',
    noteVi: 'Mốc so sánh nếu bạn không tăng giảm gì',
  },
  {
    key: 'optimistic',
    nameEn: 'Favorable case',
    nameVi: 'Trường hợp thuận lợi',
    noteEn: 'Buyers barely mind the change (top 10% best cases)',
    noteVi: 'Khách vẫn mua đều tay dù đổi giá (10% kịch bản tốt nhất)',
  },
  {
    key: 'expected',
    nameEn: 'Most likely (Expected)',
    nameVi: 'Dự kiến khả năng cao nhất',
    noteEn: 'Middle forecast from past store sales',
    noteVi: 'Mức sát thực tế nhất dựa trên hóa đơn cũ của shop',
  },
  {
    key: 'pessimistic',
    nameEn: 'Cautious case',
    nameVi: 'Trường hợp khách ngại giá',
    noteEn: 'Buyers cut back harder than usual (safety check)',
    noteVi: 'Khách phản ứng mạnh hơn bình thường (để phòng rủi ro)',
  },
] as const;

const PRESETS = [-20, -10, 0, 10, 20];

export const WhatIfScreen: React.FC<WhatIfScreenProps> = ({
  lang = 'en',
  products,
  selectedProductId,
  priceChangePct,
  unitCostChangePct = 0,
  extraFixedCostVnd = 0,
  plannedRestockUnits = 0,
  horizonDays,
  decisionGoal = 'maximize_profit',
  inventoryAgeDays = null,
  holdingCostPctPerMonth = 0,
  schedulePhases,
  seed,
  simulationResult,
  explanationData,
  fixtureNote,
  nlqStatus,
  nlqGuidance,
  loading,
  nlqLoading,
  error,
  onUpdateProduct,
  onChangeParams,
  onRunSimulate,
  onParseNLQ,
}) => {
  const isVi = lang === 'vi';

  const [question, setQuestion] = useState(
    'Tôi có 100 triệu vốn, 500 sản phẩm tồn kho, doanh thu đang giảm. Tôi nên nhập hàng, chạy quảng cáo hay giảm giá?'
  );
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showStepGuide, setShowStepGuide] = useState(false);
  const [showAdvancedLevers, setShowAdvancedLevers] = useState(false);
  const [pinnedScenarios, setPinnedScenarios] = useState<PinnedScenario[]>([]);

  const isScheduleMode = schedulePhases.length > 0;
  const selectedProduct = products.find((p) => p.product_id === selectedProductId) ?? products[0];

  const histData =
    simulationResult?.profit_distribution.histogram.map((b) => ({
      rangeLabel: formatCompactVND((b.bin_start + b.bin_end) / 2),
      mid: (b.bin_start + b.bin_end) / 2,
      count: b.count,
    })) ?? [];

  const traceData =
    simulationResult?.schedule_trace?.map((pt) => ({
      day: isVi ? `Ngày ${pt.day}` : `D${pt.day}`,
      pricePct: Number(pt.price_change_pct.toFixed(1)),
      priceVnd: pt.price_vnd,
      profit: pt.expected_profit,
    })) ?? [];

  const baseProfit = simulationResult?.scenarios.base.profit ?? 0;
  const adv = simulationResult?.advisory;
  const probBeatPct = adv ? Math.round(adv.prob_beat_base * 100) : null;
  const verdictLevel = explanationData?.verdict_level;
  const verdictBadgeClass =
    verdictLevel === 'go'
      ? 'bg-good-bg text-good border-good/30'
      : verdictLevel === 'stop'
        ? 'bg-bad-bg text-bad border-bad/30'
        : 'bg-warn-bg text-warn border-warn/30';

  const updatePhase = (idx: number, patch: Partial<SchedulePhase>) => {
    const next = schedulePhases.map((ph, i) => (i === idx ? { ...ph, ...patch } : ph));
    onChangeParams({ schedulePhases: next });
  };

  const handleApplyPreset = (productId: string, preset: SuggestedScenarioPreset) => {
    const nextGoal: DecisionGoal =
      preset.decision_goal === 'clear_inventory' ? 'clear_inventory' : 'maximize_profit';
    const nextAge =
      preset.inventory_age_days !== undefined ? preset.inventory_age_days : inventoryAgeDays;
    onChangeParams({
      productId,
      priceChangePct: preset.price_change_pct,
      unitCostChangePct: preset.unit_cost_change_pct ?? 0,
      extraFixedCostVnd: preset.extra_fixed_cost_vnd ?? 0,
      plannedRestockUnits: preset.restock_units ?? 0,
      horizonDays: preset.horizon_days ?? 30,
      decisionGoal: nextGoal,
      inventoryAgeDays: nextAge,
      schedulePhases: [],
    });
    onRunSimulate({
      productId,
      priceChangePct: preset.price_change_pct,
      unitCostChangePct: preset.unit_cost_change_pct ?? 0,
      extraFixedCostVnd: preset.extra_fixed_cost_vnd ?? 0,
      plannedRestockUnits: preset.restock_units ?? 0,
      horizonDays: preset.horizon_days ?? 30,
      decisionGoal: nextGoal,
      inventoryAgeDays: nextAge,
      schedule: [],
    });
  };

  const handlePinCurrentScenario = () => {
    if (!simulationResult || !selectedProduct) return;
    const letter = String.fromCharCode(65 + pinnedScenarios.length);
    const pinName = isVi
      ? `Phương án ${letter}: ${formatPct(priceChangePct, 1)} (${horizonDays} ngày)`
      : `Scenario ${letter}: ${formatPct(priceChangePct, 1)} (${horizonDays}d)`;

    const newPin: PinnedScenario = {
      id: `pin-${Date.now()}`,
      name: pinName,
      productId: selectedProduct.product_id,
      productName: selectedProduct.product_name,
      priceChangePct,
      unitCostChangePct,
      extraFixedCostVnd,
      restockUnits: plannedRestockUnits,
      horizonDays,
      decisionGoal,
      isSchedule: isScheduleMode,
      response: simulationResult,
      createdAt: new Date().toISOString(),
    };

    setPinnedScenarios((prev) => [...prev.slice(-4), newPin]);
  };

  const handleSelectPinned = (sc: PinnedScenario) => {
    onChangeParams({
      productId: sc.productId,
      priceChangePct: sc.priceChangePct,
      unitCostChangePct: sc.unitCostChangePct,
      extraFixedCostVnd: sc.extraFixedCostVnd,
      plannedRestockUnits: sc.restockUnits ?? 0,
      horizonDays: sc.horizonDays,
      decisionGoal: sc.decisionGoal ?? 'maximize_profit',
      schedulePhases: [],
    });
    onRunSimulate({
      productId: sc.productId,
      priceChangePct: sc.priceChangePct,
      decisionGoal: sc.decisionGoal ?? 'maximize_profit',
      unitCostChangePct: sc.unitCostChangePct,
      extraFixedCostVnd: sc.extraFixedCostVnd,
      plannedRestockUnits: sc.restockUnits ?? 0,
      horizonDays: sc.horizonDays,
      schedule: [],
    });
  };

  const skuLow = selectedProduct ? sampleQuantile(selectedProduct.elasticity_samples, 0.05) : null;
  const skuHigh = selectedProduct ? sampleQuantile(selectedProduct.elasticity_samples, 0.95) : null;
  const skuChecks = selectedProduct
    ? [
        ...(selectedProduct.significant === false ? ['not_significant'] : []),
        ...(selectedProduct.warnings ?? []).filter(
          (w) => !(w === 'not_significant' && selectedProduct.significant === false)
        ),
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Visual Hero Banner tailored for SMB & non-tech shop owners */}
      <section className="panel overflow-hidden border-accent/25 bg-gradient-to-br from-surface via-surface to-accent-bg/45 shadow-sm">
        <div className="grid items-center gap-6 p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
              {isVi
                ? 'Tính thử lời lãi trước khi tăng hoặc giảm giá bán'
                : 'Preview profit & risk before you change prices'}
            </h1>
            <p className="mt-2.5 max-w-[60ch] text-[15px] leading-relaxed text-muted">
              {isVi
                ? 'Không chỉ dự báo giá: Bạn có thể thử nghiệm song song nhiều phương án (tăng/giảm giá, ngân sách quảng cáo, nhập hàng tồn kho) và kiểm tra rủi ro dòng tiền trước khi thực hiện.'
                : 'Not just a pricing calculator: stress-test parallel scenarios (pricing, marketing budget, restocking capital) and check cash flow risks before taking action in real life.'}
            </p>
            <div className="mt-5 grid gap-2.5 text-[13px] font-medium text-ink sm:grid-cols-3">
              <div className="flex items-center gap-2 rounded-xl border border-accent/25 bg-accent-bg/60 px-3.5 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-ink">
                  1
                </span>
                <span>{isVi ? 'Hỏi AI hoặc kéo thanh giá' : 'Ask AI or move sliders'}</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-cobalt/25 bg-cobalt-bg/60 px-3.5 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cobalt text-[12px] font-bold text-white">
                  2
                </span>
                <span>{isVi ? 'Soi tiền lời & dòng tiền' : 'Audit profit & cash flow'}</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-coral/25 bg-coral-bg/60 px-3.5 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral text-[12px] font-bold text-white">
                  3
                </span>
                <span>{isVi ? 'Lưu & so sánh A/B' : 'Save & compare A/B'}</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-rule bg-[#FFF8EE] shadow-md dark:brightness-95">
            <img
              src="/images/hero-retail.jpg"
              alt={
                isVi
                  ? 'Minh họa chủ cửa hàng thời trang xem biểu đồ lợi nhuận tăng trưởng trên máy tính bảng'
                  : 'Illustration of a boutique retail shop owner reviewing upward profit charts on a tablet'
              }
              className="h-[200px] w-full object-cover sm:h-[225px]"
            />
          </div>
        </div>
      </section>

      {/* Top Store Health Pulse Snapshot */}
      <StoreHealthPulse
        products={products}
        selectedProductId={selectedProductId}
        lang={lang}
        onSelectProduct={(pid) => onChangeParams({ productId: pid })}
        onApplyPreset={handleApplyPreset}
      />

      {/* Active SKU Quick Facts in plain everyday language */}
      {selectedProduct && (
        <section
          aria-label={isVi ? 'Thông tin món hàng đang tính' : 'Selected product quick facts'}
          className="panel border-cobalt/25 bg-surface px-5 py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid flex-1 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-2.5">
                <SkuAvatarBadge productId={selectedProduct.product_id} />
                <div>
                  <span className="hint block text-[11.5px] font-medium">
                    {isVi ? 'Món hàng đang xem' : 'Product selected'}
                  </span>
                  <span className="font-bold text-ink">{selectedProduct.product_name}</span>
                  <span className="hint block text-[12px]">
                    {isVi
                      ? `Bán TB ~${formatInt(selectedProduct.baseline_qty_per_period)} món/kỳ`
                      : `~${formatInt(selectedProduct.baseline_qty_per_period)} units/period`}
                  </span>
                </div>
              </div>

              <div>
                <span className="hint block text-[12px]">
                  {isVi ? 'Giá đang bán · Giá nhập vốn' : 'Selling price · Unit cost'}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatVND(selectedProduct.current_price_vnd)}
                </span>{' '}
                <span className="text-muted tabular-nums">
                  · {formatVND(selectedProduct.unit_cost_vnd)}
                </span>
                {selectedProduct.business_context?.base_margin_pct !== null &&
                  selectedProduct.business_context?.base_margin_pct !== undefined && (
                    <span className="hint block text-[12px]">
                      {isVi
                        ? `Tiền lãi gộp hiện tại: ${selectedProduct.business_context.base_margin_pct.toFixed(1)}% giá bán`
                        : `Current gross margin: ${selectedProduct.business_context.base_margin_pct.toFixed(1)}%`}
                    </span>
                  )}
              </div>

              <div>
                <span className="hint block text-[12px]">
                  {isVi ? 'Phản ứng khách khi tăng 1% giá' : 'Buyer reaction per +1% price'}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatNum(selectedProduct.elasticity_median)}%{' '}
                  <span className="font-normal text-muted">
                    {isVi ? 'sản lượng' : 'units sold'}
                  </span>
                </span>
                {skuLow !== null && skuHigh !== null && (
                  <span className="hint block text-[12px] tabular-nums">
                    {isVi
                      ? `Khoảng dao động: ${formatNum(skuLow)}% đến ${formatNum(skuHigh)}%`
                      : `Likely range: ${formatNum(skuLow)}% to ${formatNum(skuHigh)}%`}
                  </span>
                )}
              </div>

              <div>
                <span className="hint block text-[12px]">
                  {isVi ? 'Tồn kho & sức chứa' : 'Stock & inventory limit'}
                </span>
                <span className="font-semibold tabular-nums">
                  {selectedProduct.enforce_stock_cap && selectedProduct.stock_available !== null
                    ? `${formatInt(selectedProduct.stock_available)} ${isVi ? 'món' : 'units'}`
                    : isVi
                      ? 'Chưa giới hạn kho'
                      : 'No stock cap'}
                </span>
                {selectedProduct.business_context?.stock_days_cover !== null &&
                  selectedProduct.business_context?.stock_days_cover !== undefined && (
                    <span className="hint block text-[12px]">
                      {isVi
                        ? `Đủ bán thêm ~${selectedProduct.business_context.stock_days_cover.toFixed(0)} ngày`
                        : `Covers ~${selectedProduct.business_context.stock_days_cover.toFixed(0)} days of sales`}
                    </span>
                  )}
              </div>
            </div>

            {onUpdateProduct && (
              <button
                type="button"
                data-testid="toggle-assumptions-btn"
                aria-expanded={showAssumptions}
                onClick={() => setShowAssumptions((prev) => !prev)}
                className="btn btn-secondary gap-2 text-[13px]"
              >
                <SlidersIcon className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>
                  {showAssumptions
                    ? isVi
                      ? 'Thu gọn bảng chỉnh số liệu'
                      : 'Hide assumptions'
                    : isVi
                      ? 'Sửa giá nhập, chi phí & tồn kho'
                      : 'Edit cost, expenses & stock'}
                </span>
              </button>
            )}
          </div>

          {skuChecks.length > 0 && (
            <div className="mt-3 flex items-start gap-2 border-t border-rule pt-2.5 text-[13px] text-warn">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{skuChecks.map((w) => describeWarning(w, lang)).join(' ')}</span>
            </div>
          )}

          {showAssumptions && onUpdateProduct && (
            <div className="mt-4 border-t border-rule pt-4" data-testid="inline-assumptions-panel">
              <AssumptionsScreen
                lang={lang}
                compact
                products={products}
                onUpdateProduct={onUpdateProduct}
                onProceedToWhatIf={() => {
                  setShowAssumptions(false);
                  onRunSimulate();
                }}
              />
            </div>
          )}
        </section>
      )}

      {/* Split Decision Cockpit: Left Controls + Right Live Verdict & Delta Bridge */}
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-5">
          {/* Natural Language Question */}
          <section
            aria-labelledby="ask"
            className="panel flex flex-col border-t-[3px] border-t-cobalt p-5"
          >
            <div className="flex items-center gap-3">
              <img
                src="/images/copilot-advisor.jpg"
                alt=""
                aria-hidden="true"
                className="h-11 w-11 shrink-0 rounded-xl border border-accent/25 object-cover shadow-sm"
              />
              <div>
                <h2 id="ask" className="h2">
                  <label htmlFor="nlq-input">
                    {isVi ? 'Hỏi tự nhiên như đang trao đổi với trợ lý' : 'Ask in your own words'}
                  </label>
                </h2>
                <p className="hint mt-0.5 text-[12.5px]">
                  {isVi
                    ? 'Hỏi về giá bán, quảng cáo, nhập hàng hay phân bổ vốn.'
                    : 'Ask about pricing, ads, restocking, or capital tradeoffs.'}
                </p>
              </div>
            </div>
          <textarea
            id="nlq-input"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              isVi
                ? 'Ví dụ: Tôi có 100 triệu vốn, nên nhập hàng, chạy ads hay giảm giá?'
                : 'For example: I have 100M VND capital, should I restock or run ads?'
            }
            className="field mt-3"
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  isVi
                    ? `Nếu tăng giá ${selectedProduct?.product_id ?? 'P01'} thêm 10% trong 30 ngày tới thì sao?`
                    : `Increase ${selectedProduct?.product_id ?? 'P01'} price by 10% for the next 30 days?`
                )
              }
              className="btn-quiet rounded-md border border-rule"
            >
              {isVi ? 'Tăng +10% trong 30 ngày' : '+10% for 30 days'}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  isVi
                    ? `Giảm giá ${selectedProduct?.product_id ?? 'P01'} 15% trong 14 ngày thì lãi lỗ ra sao?`
                    : `Discount ${selectedProduct?.product_id ?? 'P01'} price by 15% over 14 days?`
                )
              }
              className="btn-quiet rounded-md border border-rule"
            >
              {isVi ? 'Sale −15% trong 14 ngày' : '−15% for 14 days'}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  `Với ${selectedProduct?.product_id ?? 'P01'}, 15 ngày đầu giảm 30%, 15 ngày sau mỗi ngày tăng 1% thì sao?`
                )
              }
              className="btn-quiet rounded-md border border-rule"
            >
              {isVi ? '15 ngày −30%, sau đó +1%/ngày' : '15d −30%, then 15d +1%/day'}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  isVi
                    ? `60 ngày nữa là Tết, tôi muốn vào 7 ngày từ 60 ngày nữa tăng giá sản phẩm lên 15% thì có được không?`
                    : `Tết is in 60 days — can I raise product price by 15% for 7 days starting in 60 days?`
                )
              }
              className="btn-quiet rounded-md border border-rule"
            >
              {isVi ? 'Dịp Tết (60 ngày nữa) tăng +15%?' : 'Tết in 60d (+15% for 7d)?'}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  isVi
                    ? `Tôi có 100 triệu vốn, 500 tồn kho, doanh thu đang giảm. Nên nhập hàng, chạy quảng cáo hay giảm giá?`
                    : `I have 100M capital, 500 in stock, revenue dropping. Should I restock, run ads, or discount?`
                )
              }
              className="btn-quiet inline-flex items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-bg/50 font-semibold text-accent hover:bg-accent hover:text-accent-ink"
            >
              <CoinsIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isVi ? 'Bài toán phân bổ 100 triệu vốn' : '100M capital tradeoff'}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  isVi
                    ? `Nếu tăng ngân sách marketing 20% thì doanh thu và tiền lãi sẽ thế nào?`
                    : `What happens if marketing spend increases by 20%?`
                )
              }
              className="btn-quiet rounded-md border border-rule"
            >
              {isVi ? 'Tăng ngân sách marketing 20%' : 'Marketing +20%'}
            </button>
            <button
              type="button"
              onClick={() =>
                setQuestion(
                  isVi
                    ? `Tại sao tháng này tôi bán được nhiều hàng hơn nhưng tiền lời lại ít hơn?`
                    : `Why did I sell more units this month but net less profit?`
                )
              }
              className="btn-quiet rounded-md border border-rule"
            >
              {isVi ? 'Bán nhiều mà lời ít?' : 'High sales, low profit?'}
            </button>
          </div>

          {nlqStatus && (
            <div className="mt-3">
              <Notice tone={nlqStatus.type === 'ok' ? 'info' : 'warn'} role="status">
                {nlqStatus.message}
              </Notice>
            </div>
          )}

          {/* Fallback / Guidance with Clickable Presets */}
          {nlqGuidance && nlqGuidance.helpful_answer && (
            <div
              className="mt-3 rounded-md border border-accent/30 bg-accent/10 p-3.5 text-[13px] text-ink"
              data-testid="nlq-guidance-card"
            >
              <div className="flex items-center gap-1.5 font-semibold text-accent">
                <SparklesIcon className="h-4 w-4" aria-hidden="true" />
                <span>{isVi ? 'Tư vấn dành cho chủ shop:' : 'Business Advisor Guidance:'}</span>
              </div>
              <p className="mt-1.5 leading-relaxed text-ink">{nlqGuidance.helpful_answer}</p>
              {nlqGuidance.suggested_scenarios && nlqGuidance.suggested_scenarios.length > 0 && (
                <div className="mt-3 border-t border-accent/20 pt-2.5">
                  <span className="hint block text-[11px] font-semibold text-accent">
                    {isVi ? 'Chọn nhanh phương án để chạy thử mô phỏng ngay:' : 'Click a scenario preset to simulate:'}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {nlqGuidance.suggested_scenarios.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(selectedProduct?.product_id ?? 'P01', preset)}
                        className="btn btn-secondary py-1 text-[12px] font-semibold text-ink hover:border-accent"
                      >
                        <TrendingUpIcon className="mr-1 h-3.5 w-3.5 text-accent" />
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto pt-4">
            <button
              type="button"
              disabled={nlqLoading || !question.trim() || products.length === 0}
              onClick={() => onParseNLQ(question)}
              className="btn btn-primary w-full gap-2"
            >
              <SparklesIcon className="h-4 w-4" aria-hidden="true" />
              <span>
                {nlqLoading
                  ? isVi
                    ? 'Đang đọc câu hỏi & phân tích…'
                    : 'Reading question & analyzing…'
                  : isVi
                    ? 'Phân tích câu hỏi & tính thử'
                    : 'Read question and simulate'}
              </span>
            </button>
          </div>
        </section>

        {/* Interactive Multi-Variable Playground */}
        <section aria-labelledby="manual" className="panel border-t-[3px] border-t-accent p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-bg text-accent">
                <SlidersIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 id="manual" className="h2">
                {isVi ? 'Bàn thử nghiệm quyết định' : 'Interactive Decision Playground'}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label={isVi ? 'Cách chỉnh giá' : 'Pricing plan type'}
                className="flex overflow-hidden rounded-md border border-rule-strong"
              >
                <button
                  type="button"
                  onClick={() => onChangeParams({ schedulePhases: [] })}
                  className={`px-3 py-1 text-[12px] font-semibold transition-colors ${
                    !isScheduleMode
                      ? 'bg-accent text-accent-ink'
                      : 'bg-surface text-muted hover:text-ink'
                  }`}
                >
                  {isVi ? 'Đổi 1 mức cố định' : 'Single move'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeParams({
                      schedulePhases:
                        schedulePhases.length > 0 ? schedulePhases : DEFAULT_SCHEDULE_PRESET,
                    })
                  }
                  className={`px-3 py-1 text-[12px] font-semibold transition-colors ${
                    isScheduleMode
                      ? 'bg-accent text-accent-ink'
                      : 'bg-surface text-muted hover:text-ink'
                  }`}
                >
                  {isVi ? 'Lộ trình nhiều chặng' : 'Multi-phase schedule'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {/* Decision Goal & Clearance Warehouse Context */}
            <div className="sm:col-span-2 rounded-md border border-rule bg-sunken/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="label mb-0">
                    {isVi ? 'Mục tiêu ưu tiên của bạn lúc này' : 'Decision goal priority'}
                  </span>
                  <p className="hint text-[12px]">
                    {decisionGoal === 'clear_inventory'
                      ? isVi
                        ? 'Ưu tiên đẩy nhanh hàng tồn, xem khả năng hoàn vốn nhập & giải phóng tiền mặt thay vì chỉ tối đa tiền lãi.'
                        : 'Prioritizes moving stock, recovering purchase cost, and freeing working capital over max short-term profit.'
                      : isVi
                        ? 'Ưu tiên mức giá kiếm được nhiều tổng tiền lãi ròng nhất.'
                        : 'Prioritizes maximizing total net profit over the selected horizon.'}
                  </p>
                </div>
                <div
                  role="group"
                  aria-label={isVi ? 'Mục tiêu quyết định' : 'Decision goal'}
                  className="flex overflow-hidden rounded-md border border-rule-strong"
                >
                  <button
                    type="button"
                    data-testid="goal-maximize-profit"
                    aria-pressed={decisionGoal === 'maximize_profit'}
                    onClick={() => {
                      onChangeParams({ decisionGoal: 'maximize_profit' });
                      onRunSimulate({ decisionGoal: 'maximize_profit' });
                    }}
                    className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      decisionGoal === 'maximize_profit'
                        ? 'bg-accent text-accent-ink'
                        : 'bg-surface text-muted hover:text-ink'
                    }`}
                  >
                    {isVi ? 'Tối ưu lợi nhuận' : 'Maximize Profit'}
                  </button>
                  <button
                    type="button"
                    data-testid="goal-clear-inventory"
                    aria-pressed={decisionGoal === 'clear_inventory'}
                    onClick={() => {
                      onChangeParams({ decisionGoal: 'clear_inventory' });
                      onRunSimulate({ decisionGoal: 'clear_inventory' });
                    }}
                    className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      decisionGoal === 'clear_inventory'
                        ? 'bg-accent text-accent-ink'
                        : 'bg-surface text-muted hover:text-ink'
                    }`}
                  >
                    {isVi ? 'Xả kho & Xoay vòng vốn' : 'Clear Inventory & Cash Flow'}
                  </button>
                </div>
              </div>

              {(decisionGoal === 'clear_inventory' || priceChangePct < 0) && (
                <div className="mt-3 grid gap-3 border-t border-rule/60 pt-3 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="sim-inv-age" className="label mb-0 text-[12px]">
                        {isVi ? 'Hàng đã nhập kho bao lâu? (ngày)' : 'Warehouse stock age (days)'}
                      </label>
                      <div className="flex gap-1">
                        {[30, 60, 90].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => onChangeParams({ inventoryAgeDays: d })}
                            className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                              inventoryAgeDays === d
                                ? 'border-accent bg-accent/15 text-accent'
                                : 'border-rule bg-surface text-muted hover:text-ink'
                            }`}
                          >
                            {d}d
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      id="sim-inv-age"
                      type="number"
                      min={0}
                      max={365}
                      placeholder={isVi ? 'VD: 90 ngày (không bắt buộc)' : 'e.g. 90 days (optional)'}
                      value={inventoryAgeDays ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        onChangeParams({
                          inventoryAgeDays:
                            raw === '' ? null : Math.min(365, Math.max(0, Math.round(Number(raw)))),
                        });
                      }}
                      className="field field-num mt-1"
                    />
                  </div>
                  <div>
                    <label htmlFor="sim-holding-cost" className="label mb-0 text-[12px]">
                      {isVi
                        ? 'Phí giữ kho / rớt giá ước tính (%/tháng)'
                        : 'Est. carry / obsolescence cost (%/mo)'}
                    </label>
                    <input
                      id="sim-holding-cost"
                      type="number"
                      min={0}
                      max={20}
                      step={0.5}
                      value={holdingCostPctPerMonth}
                      onChange={(e) =>
                        onChangeParams({
                          holdingCostPctPerMonth: Math.min(
                            20,
                            Math.max(0, Number(e.target.value) || 0)
                          ),
                        })
                      }
                      className="field field-num mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="sim-product" className="label">
                {isVi ? 'Chọn sản phẩm muốn thử' : 'Choose product'}
              </label>
              <select
                id="sim-product"
                value={selectedProduct?.product_id ?? ''}
                onChange={(e) => onChangeParams({ productId: e.target.value })}
                className="field"
              >
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_id} — {p.product_name} ({formatVND(p.current_price_vnd)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sim-horizon" className="label">
                {isVi ? 'Thời gian mô phỏng (ngày)' : 'Horizon (days)'}
              </label>
              <input
                id="sim-horizon"
                type="number"
                min={7}
                max={90}
                value={horizonDays}
                onChange={(e) =>
                  onChangeParams({
                    horizonDays: Math.min(
                      90,
                      Math.max(7, Math.round(Number(e.target.value) || 30))
                    ),
                  })
                }
                className="field field-num"
              />
              <p className="hint mt-1">
                {isVi ? 'Từ 7 đến 90 ngày (ví dụ 30 ngày = 1 tháng).' : 'Between 7 and 90 days.'}
              </p>
            </div>

            {!isScheduleMode ? (
              <div className="rounded-xl border border-cobalt/25 bg-cobalt-bg/25 p-4 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="sim-price-pct" className="label mb-0 flex items-center gap-1.5 text-cobalt">
                    <TagIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {isVi ? 'Biến 1: Mức tăng / giảm giá bán (%)' : 'Lever 1: Price adjustment (%)'}
                    </span>
                  </label>
                  <div
                    role="group"
                    aria-label={isVi ? 'Chọn nhanh mức đổi giá' : 'Price change presets'}
                    className="flex flex-wrap gap-1"
                  >
                    {PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={priceChangePct === preset}
                        onClick={() => {
                          onChangeParams({ priceChangePct: preset, schedulePhases: [] });
                          onRunSimulate({ priceChangePct: preset, schedule: [] });
                        }}
                        className={`rounded-md border px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${
                          priceChangePct === preset
                            ? 'border-accent bg-accent text-accent-ink'
                            : 'border-rule-strong text-ink hover:bg-sunken'
                        }`}
                      >
                        {formatPct(preset, 0).replace('-', '−')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="sim-price-slider"
                    aria-label={
                      isVi ? 'Thanh trượt mức đổi giá' : 'Price change percentage slider'
                    }
                    type="range"
                    min={-50}
                    max={100}
                    step={1}
                    value={priceChangePct}
                    onChange={(e) => onChangeParams({ priceChangePct: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <input
                    id="sim-price-pct"
                    type="number"
                    min={-50}
                    max={100}
                    step={1}
                    value={priceChangePct}
                    onChange={(e) =>
                      onChangeParams({
                        priceChangePct: Math.min(
                          100,
                          Math.max(-50, Number(e.target.value) || 0)
                        ),
                      })
                    }
                    className="field field-num w-20"
                  />
                </div>
                {selectedProduct && (
                  <p className="hint mt-1.5 tabular-nums">
                    {isVi ? 'Giá mới dự kiến: ' : 'New selling price: '}
                    <strong className="text-ink">
                      {formatVND(
                        selectedProduct.current_price_vnd * (1 + priceChangePct / 100)
                      )}
                    </strong>{' '}
                    ({isVi ? 'hiện tại ' : 'currently '}
                    {formatVND(selectedProduct.current_price_vnd)})
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="label mb-0">
                    {isVi
                      ? 'Chia từng chặng tăng/giảm theo ngày (tổng 7–90 ngày)'
                      : 'Day-by-day pricing phases (total 7–90 days)'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeParams({
                        schedulePhases: [
                          ...schedulePhases,
                          {
                            days: 7,
                            start_change_pct: 0,
                            daily_step_pct: 0,
                            relative_to_prev: true,
                          },
                        ],
                      })
                    }
                    className="btn-quiet rounded border border-rule text-[12px]"
                  >
                    {isVi ? '+ Thêm chặng mới' : '+ Add phase'}
                  </button>
                </div>
                <div className="space-y-2">
                  {schedulePhases.map((ph, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 items-center gap-2 rounded-md border border-rule bg-sunken/50 p-2.5 text-[13px]"
                    >
                      <div className="col-span-2">
                        <span className="hint block text-[11px]">{isVi ? 'Số ngày' : 'Days'}</span>
                        <input
                          type="number"
                          aria-label={`Phase ${idx + 1} days`}
                          min={1}
                          max={90}
                          value={ph.days}
                          onChange={(e) =>
                            updatePhase(idx, {
                              days: Math.max(
                                1,
                                Math.min(90, Math.round(Number(e.target.value) || 1))
                              ),
                            })
                          }
                          className="field field-num py-1 text-[13px]"
                        />
                      </div>
                      <div className="col-span-3">
                        <span className="hint block text-[11px]">
                          {isVi ? 'Mức đầu (%)' : 'Start Δ%'}
                        </span>
                        <input
                          type="number"
                          aria-label={`Phase ${idx + 1} start change pct`}
                          min={-50}
                          max={100}
                          value={ph.start_change_pct}
                          onChange={(e) =>
                            updatePhase(idx, { start_change_pct: Number(e.target.value) || 0 })
                          }
                          className="field field-num py-1 text-[13px]"
                        />
                      </div>
                      <div className="col-span-3">
                        <span className="hint block text-[11px]">
                          {isVi ? 'Tăng/giảm mỗi ngày' : 'Step %/day'}
                        </span>
                        <input
                          type="number"
                          aria-label={`Phase ${idx + 1} daily step pct`}
                          min={-20}
                          max={20}
                          step={0.5}
                          value={ph.daily_step_pct}
                          onChange={(e) =>
                            updatePhase(idx, { daily_step_pct: Number(e.target.value) || 0 })
                          }
                          className="field field-num py-1 text-[13px]"
                        />
                      </div>
                      <div className="col-span-3 flex flex-col gap-0.5 text-[11px]">
                        <label className="inline-flex cursor-pointer items-center gap-1">
                          <input
                            type="checkbox"
                            checked={Boolean(ph.relative_to_prev)}
                            onChange={(e) =>
                              updatePhase(idx, {
                                relative_to_prev: e.target.checked,
                                compound_daily_step: e.target.checked,
                                step_on_first_day: e.target.checked,
                              })
                            }
                          />
                          {isVi ? 'Nối tiếp giá cũ' : 'From prev'}
                        </label>
                      </div>
                      <div className="col-span-1 text-right">
                        {schedulePhases.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              onChangeParams({
                                schedulePhases: schedulePhases.filter((_, i) => i !== idx),
                              })
                            }
                            aria-label={`Remove phase ${idx + 1}`}
                            className="px-1 text-sm text-muted hover:text-bad"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Levers 2 & 3 & 4: Cost, Marketing & Inventory */}
            <div className="sm:col-span-2 border-t border-rule pt-3">
              <button
                type="button"
                onClick={() => setShowAdvancedLevers((prev) => !prev)}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
              >
                <CoinsIcon className="h-4 w-4" />
                <span>
                  {showAdvancedLevers
                    ? isVi
                      ? '− Ẩn biến chi phí quảng cáo & vốn nhập hàng'
                      : '− Hide marketing & inventory levers'
                    : isVi
                      ? '+ Thêm biến: Ngân sách quảng cáo & Vốn nhập thêm hàng'
                      : '+ Add levers: Ad spend & Restocking plan'}
                </span>
              </button>

              {showAdvancedLevers && (
                <div className="mt-3 grid gap-3 rounded-md bg-sunken/40 p-3.5 sm:grid-cols-3 text-[13px]">
                  <div>
                    <label htmlFor="sim-cost-pct" className="label text-[12px]">
                      {isVi ? 'Biến 2: Giá nhập vốn đổi (%)' : 'Lever 2: Cost change (%)'}
                    </label>
                    <input
                      id="sim-cost-pct"
                      type="number"
                      step={1}
                      min={-50}
                      max={100}
                      value={unitCostChangePct}
                      onChange={(e) =>
                        onChangeParams({ unitCostChangePct: Number(e.target.value) || 0 })
                      }
                      className="field field-num py-1.5 text-[13px]"
                      placeholder="0"
                    />
                    <span className="hint block text-[11px] mt-1">
                      {isVi ? 'Ví dụ: +10% giá vải tăng, -5% đàm phán sỉ' : 'e.g. +10% supplier price hike'}
                    </span>
                  </div>

                  <div>
                    <label htmlFor="sim-extra-mkt" className="label text-[12px]">
                      {isVi ? 'Biến 3: Chi phí quảng cáo/cố định thêm (₫)' : 'Lever 3: Extra Ads / Fixed (₫)'}
                    </label>
                    <input
                      id="sim-extra-mkt"
                      type="number"
                      step={500000}
                      min={0}
                      value={extraFixedCostVnd}
                      onChange={(e) =>
                        onChangeParams({ extraFixedCostVnd: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className="field field-num py-1.5 text-[13px]"
                      placeholder="0"
                    />
                    <span className="hint block text-[11px] mt-1">
                      {isVi ? 'Ví dụ: 5.000.000 ₫ chạy ads' : 'e.g. 5,000,000 ₫ ad budget'}
                    </span>
                  </div>

                  <div>
                    <label htmlFor="sim-restock" className="label text-[12px]">
                      {isVi ? 'Biến 4: Kế hoạch nhập thêm (món)' : 'Lever 4: Planned Restock (units)'}
                    </label>
                    <input
                      id="sim-restock"
                      type="number"
                      step={50}
                      min={0}
                      value={plannedRestockUnits}
                      onChange={(e) =>
                        onChangeParams({
                          plannedRestockUnits: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                      className="field field-num py-1.5 text-[13px]"
                      placeholder="0"
                    />
                    <span className="hint block text-[11px] mt-1">
                      {isVi ? 'Tính dòng tiền mặt bị khóa vào kho' : 'Tracks upfront cash outlay'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <details className="mt-4 text-[13px] text-muted">
            <summary className="cursor-pointer select-none hover:text-ink">
              {isVi
                ? 'Tùy chọn kỹ thuật (Mã lặp lại kết quả giống hệt)'
                : 'Technical option (Reproducibility seed)'}
            </summary>
            <div className="mt-2 max-w-[220px]">
              <label htmlFor="sim-seed" className="label">
                {isVi ? 'Mã số ngẫu nhiên (Seed)' : 'Random seed'}
              </label>
              <input
                id="sim-seed"
                type="number"
                value={seed}
                onChange={(e) => onChangeParams({ seed: Math.round(Number(e.target.value) || 42) })}
                className="field field-num py-1.5"
              />
            </div>
          </details>

          <div className="mt-5">
            <button
              type="button"
              disabled={loading || products.length === 0}
              onClick={() =>
                onRunSimulate({
                  schedule: isScheduleMode ? schedulePhases : [],
                  unitCostChangePct,
                  extraFixedCostVnd,
                  plannedRestockUnits,
                })
              }
              className="btn btn-primary w-full gap-2 py-2.5"
            >
              <TrendingUpIcon className="h-4 w-4" aria-hidden="true" />
              <span>
                {loading
                  ? isVi
                    ? 'Đang tính toán kịch bản…'
                    : 'Calculating…'
                  : isScheduleMode
                    ? isVi
                      ? 'Tính thử lộ trình nhiều chặng'
                      : 'Run schedule simulation'
                    : isVi
                      ? 'Tính thử kịch bản quyết định'
                      : 'Run decision simulation'}
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Right Column: Live Verdict & Instant Before/After Delta Stage */}
      <div className="space-y-5 lg:col-span-7 lg:sticky lg:top-24">
        {error && (
          <div>
            <Notice
              tone="error"
              title={isVi ? 'Chưa thể chạy tính thử.' : 'The simulation did not run.'}
            >
              {error}{' '}
              {isVi
                ? 'Hãy kiểm tra lại con số bạn nhập hoặc bật "Chế độ xem mẫu" ở góc trên.'
                : 'Check the numbers you entered, or turn on Sample snapshot mode above.'}
            </Notice>
          </div>
        )}

        {fixtureNote && <p className="hint">{fixtureNote}</p>}

        {simulationResult ? (
          <>
            {/* Executive Verdict & Actionable Advice */}
            <section aria-labelledby="result" className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="result" className="h2 text-[20px]">
                  {isVi ? 'Kết quả tính thử & Lời khuyên hành động' : 'Result & Actionable Advice'}
                </h2>
                {selectedProduct && (
                  <button
                    type="button"
                    data-testid="toggle-step-guide-btn"
                    aria-expanded={showStepGuide}
                    onClick={() => setShowStepGuide((prev) => !prev)}
                    className="btn btn-secondary gap-1.5 text-[13px]"
                  >
                    <InfoIcon className="h-4 w-4 text-accent" aria-hidden="true" />
                    <span>
                      {showStepGuide
                        ? isVi
                          ? 'Ẩn giải thích 4 bước'
                          : 'Hide 4-step breakdown'
                        : isVi
                          ? 'Xem cách máy tính (4 bước dễ hiểu)'
                          : 'See how this is calculated (4 steps)'}
                    </span>
                  </button>
                )}
              </div>

              {explanationData && (
                <div
                  className={`panel space-y-4 border-l-4 p-5 ${
                    verdictLevel === 'go'
                      ? 'border-l-good bg-gradient-to-br from-good-bg/25 via-surface to-surface'
                      : verdictLevel === 'stop'
                        ? 'border-l-bad bg-gradient-to-br from-bad-bg/25 via-surface to-surface'
                        : 'border-l-warn bg-gradient-to-br from-warn-bg/25 via-surface to-surface'
                  }`}
                  data-testid="advisory-panel"
                >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {explanationData.action_verdict && (
                    <span
                      className={`tag border px-3 py-1 text-[13px] font-semibold ${verdictBadgeClass}`}
                    >
                      {verdictLevel === 'go' ? (
                        <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <AlertTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {explanationData.action_verdict}
                    </span>
                  )}

                  {adv && probBeatPct !== null && (
                    <div className="flex items-center gap-3 text-[13px]">
                      <span className="text-muted">
                        {isVi ? 'Cơ hội lãi hơn giá cũ:' : 'Odds of beating old price:'}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-sunken">
                          <div
                            className={`h-full rounded-full ${
                              probBeatPct >= 60
                                ? 'bg-good'
                                : probBeatPct >= 40
                                  ? 'bg-warn'
                                  : 'bg-bad'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, probBeatPct))}%` }}
                          />
                        </div>
                        <strong className="tabular-nums text-ink">{probBeatPct}%</strong>
                      </div>
                    </div>
                  )}
                </div>

                {adv && (
                  <div className="grid gap-3 rounded-md bg-sunken/70 p-3 text-[13px] sm:grid-cols-3">
                    <div>
                      <span className="hint block text-[12px]">
                        {isVi ? 'Tiền lời trên giá bán (hiện tại)' : 'Current profit % of price'}
                      </span>
                      <strong className="tabular-nums">{adv.base_margin_pct.toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span className="hint block text-[12px]">
                        {isVi ? 'Tiền lời thấp nhất trong đợt' : 'Lowest profit % in plan'}
                      </span>
                      <strong className="tabular-nums">
                        {adv.min_margin_pct_in_plan.toFixed(1)}%
                      </strong>
                    </div>
                    <div>
                      <span className="hint block text-[12px]">
                        {isVi ? 'Tình trạng kho hàng' : 'Stock status'}
                      </span>
                      <strong className={adv.stockout_risk ? 'text-warn' : 'text-good'}>
                        {adv.stockout_risk
                          ? isVi
                            ? 'Dễ hết hàng nếu bán chạy'
                            : 'May run out of stock'
                          : isVi
                            ? 'Đủ hàng đáp ứng'
                            : 'Stock looks safe'}
                      </strong>
                    </div>
                  </div>
                )}

                {explanationData.direct_answer && (
                  <div
                    data-testid="direct-answer-box"
                    className="rounded-xl border border-cobalt/30 border-l-4 border-l-cobalt bg-cobalt-bg/35 p-4 text-[15px] font-medium leading-relaxed text-ink"
                  >
                    {explanationData.direct_answer}
                  </div>
                )}

                {explanationData.situation_summary && (
                  <p className="text-[14px] text-muted">
                    <strong className="text-ink">
                      {isVi ? 'Tình hình hiện tại của sản phẩm: ' : 'Store context: '}
                    </strong>
                    {explanationData.situation_summary}
                  </p>
                )}

                <ul className="max-w-[75ch] space-y-1.5 text-[15px] leading-relaxed text-ink">
                  {explanationData.text
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                </ul>

                {explanationData.recommendations && explanationData.recommendations.length > 0 && (
                  <div className="border-t border-rule pt-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                      <ShieldCheckIcon className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span>
                        {isVi ? 'Gợi ý việc nên làm tiếp theo:' : 'Suggested next steps:'}
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-[14px]">
                      {explanationData.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="font-semibold text-accent" aria-hidden="true">
                            →
                          </span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                    {decisionGoal === 'maximize_profit' &&
                      priceChangePct < 0 &&
                      simulationResult?.clearance &&
                      simulationResult.clearance.extra_units_cleared > 0 && (
                        <div className="mt-3">
                          <button
                            type="button"
                            data-testid="switch-to-clearance-goal-btn"
                            onClick={() => {
                              onChangeParams({ decisionGoal: 'clear_inventory' });
                              onRunSimulate({ decisionGoal: 'clear_inventory' });
                            }}
                            className="btn btn-secondary gap-1.5 text-[12px]"
                          >
                            <CoinsIcon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                            <span>
                              {isVi
                                ? 'Đang thử giảm giá? Bấm để đánh giá theo mục tiêu Xả kho & Thu hồi vốn'
                                : 'Testing a discount? Re-evaluate as Inventory Clearance & Cash Flow'}
                            </span>
                          </button>
                        </div>
                      )}
                  </div>
                )}
                </div>
              )}
            </section>

            {/* Instant Visual Before vs After Price/Qty/Profit Delta Strip */}
            <PriceDeltaBridgeCard
              base={simulationResult.scenarios.base}
              expected={simulationResult.scenarios.expected}
              pessimistic={simulationResult.scenarios.pessimistic}
              optimistic={simulationResult.scenarios.optimistic}
              currentPriceVnd={
                selectedProduct?.current_price_vnd ?? simulationResult.scenarios.base.price_vnd ?? 0
              }
              expectedPriceVnd={simulationResult.scenarios.expected.price_vnd}
              priceChangePct={priceChangePct}
              isScheduleMode={isScheduleMode}
              horizonDays={horizonDays}
              probBeatBase={simulationResult.advisory?.prob_beat_base ?? 0.5}
              lang={lang}
            />

            {/* Optional Step-by-step plain explanation */}
            {showStepGuide && selectedProduct && (
              <StepExplainer
                lang={lang}
                product={selectedProduct}
                simulation={simulationResult}
                priceChangePct={priceChangePct}
                isScheduleMode={isScheduleMode}
              />
            )}
          </>
        ) : (
          <div className="panel flex flex-col items-center justify-center gap-4 border-dashed border-rule-strong p-8 text-center">
            <img
              src="/images/copilot-advisor.jpg"
              alt=""
              aria-hidden="true"
              className="h-24 w-24 rounded-2xl border border-accent/20 object-cover shadow-sm"
            />
            <div>
              <h2 className="h2">
                {isVi
                  ? 'Sẵn sàng mô phỏng phương án kinh doanh'
                  : 'Ready to simulate your pricing move'}
              </h2>
              <p className="hint mt-1 max-w-[44ch]">
                {isVi
                  ? 'Đặt câu hỏi bên trái hoặc kéo thanh điều chỉnh giá để xem ngay dự báo lợi nhuận & rủi ro tại đây.'
                  : 'Ask a question on the left or adjust a price lever to see profit and risk results here.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Full-Width Analytical Deep Dive Below Split Cockpit */}
      {simulationResult && (
        <div className="space-y-6">
          {/* Side-by-Side Multi-Scenario Comparison Matrix */}
          <ScenarioComparisonTable
            baseMetrics={simulationResult.scenarios.base}
            expectedMetrics={simulationResult.scenarios.expected}
            pinnedScenarios={pinnedScenarios}
            activeProductId={selectedProduct?.product_id ?? 'P01'}
            onRemovePinned={(id) => setPinnedScenarios((prev) => prev.filter((p) => p.id !== id))}
            onSelectPinned={handleSelectPinned}
            onPinCurrent={handlePinCurrentScenario}
            canPinCurrent={Boolean(simulationResult)}
            lang={lang}
          />

          {/* Detailed 4-case market breakdown */}
          <div className="panel overflow-hidden">
            <div className="border-b border-rule bg-sunken/40 px-5 py-3">
              <h3 className="h2 text-[15px]">
                {isVi
                  ? 'Chi tiết 4 kịch bản thị trường (Khả quan · Kỳ vọng · Khách ngại giá)'
                  : 'Market Conditions Breakdown (Optimistic · Expected · Cautious)'}
              </h3>
            </div>
            <div className="relative overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead className="bg-sunken">
                  <tr>
                    <th scope="col" className="pl-5">
                      {isVi ? 'Tình huống thị trường' : 'Market case'}
                    </th>
                    <th scope="col" className="num">
                      {isVi ? 'Giá bán áp dụng' : 'Selling price'}
                    </th>
                    <th scope="col" className="num">
                      {isVi ? 'Số lượng bán dự kiến' : 'Units sold'}
                    </th>
                    <th scope="col" className="num">
                      {isVi ? 'Tổng tiền thu về' : 'Revenue'}
                    </th>
                    <th scope="col" className="num">
                      {isVi ? 'Tiền lãi thực tế' : 'Profit'}
                    </th>
                    <th scope="col" className="num pr-5">
                      {isVi ? 'Lãi thêm/hụt so với giá cũ' : 'Profit vs old price'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SCENARIOS.map((sc) => {
                    const m = simulationResult.scenarios[sc.key];
                    const diff = m.profit - baseProfit;
                    const isExpected = sc.key === 'expected';
                    return (
                      <tr key={sc.key} className={isExpected ? 'bg-sunken/60' : ''}>
                        <th scope="row" className="pl-5">
                          <div className="font-semibold">{isVi ? sc.nameVi : sc.nameEn}</div>
                          <div className="hint font-normal">
                            {isVi ? sc.noteVi : sc.noteEn}
                          </div>
                        </th>
                        <td className="num">{formatVND(m.price_vnd ?? null)}</td>
                        <td className="num">{formatInt(m.qty)}</td>
                        <td className="num">{formatVND(m.revenue)}</td>
                        <td className={`num ${isExpected ? 'font-semibold' : ''}`}>
                          {formatVND(m.profit)}
                        </td>
                        <td
                          className={`num pr-5 font-semibold ${
                            sc.key === 'base'
                              ? 'text-muted font-normal'
                              : diff >= 0
                                ? 'text-good'
                                : 'text-bad'
                          }`}
                        >
                          {sc.key === 'base'
                            ? '—'
                            : `${diff >= 0 ? '+' : '−'}${formatCompactVND(Math.abs(diff))}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cost Recovery & Clearance Velocity (shown when discounting or in clearance mode) */}
          {simulationResult.clearance &&
            (decisionGoal === 'clear_inventory' ||
              priceChangePct < 0 ||
              simulationResult.clearance.extra_units_cleared > 0) && (
              <ClearanceRecoveryCard
                clearance={simulationResult.clearance}
                unitCostVnd={selectedProduct?.unit_cost_vnd ?? 60000}
                basePriceVnd={
                  simulationResult.scenarios.base.price_vnd ??
                  selectedProduct?.current_price_vnd ??
                  100000
                }
                newPriceVnd={
                  simulationResult.scenarios.expected.price_vnd ??
                  selectedProduct?.current_price_vnd ??
                  100000
                }
                baseProfitVnd={baseProfit}
                newProfitVnd={simulationResult.scenarios.expected.profit}
                lang={lang}
              />
            )}

          {/* Financial Breakdown: Profit Waterfall + Cash Flow vs Net Profit */}
          <div className="grid gap-6 lg:grid-cols-2">
            {simulationResult.waterfall && simulationResult.waterfall.length > 0 && (
              <ProfitWaterfallChart waterfall={simulationResult.waterfall} lang={lang} />
            )}

            {simulationResult.cash_flow && (
              <CashFlowVsProfitCard
                cashFlow={simulationResult.cash_flow}
                unitCostVnd={selectedProduct?.unit_cost_vnd ?? 60000}
                lang={lang}
              />
            )}
          </div>

          {/* Risk & Sensitivity Analysis: Tornado Chart + Monte Carlo Range */}
          <div className="grid gap-6 lg:grid-cols-2">
            {simulationResult.sensitivity_tornado && simulationResult.sensitivity_tornado.length > 0 && (
              <SensitivityTornadoChart
                tornado={simulationResult.sensitivity_tornado}
                baseProfit={baseProfit}
                lang={lang}
              />
            )}

            {/* Monte Carlo Distribution */}
            <section aria-labelledby="distribution" className="panel p-5">
              <h2 id="distribution" className="h2">
                {isVi
                  ? 'Thử 5.000 tình huống sức mua: Lời lỗ tập trung ở đâu?'
                  : 'Across 5,000 simulated market outcomes'}
              </h2>
              <p className="hint mt-1">
                {isVi
                  ? 'Cột màu xanh là những lần bạn kiếm nhiều tiền hơn giữ nguyên giá cũ.'
                  : 'Teal bars beat keeping today’s price; amber bars earn less.'}
              </p>

              <dl className="mt-4 grid gap-3 rounded-md bg-sunken/60 p-3 sm:grid-cols-3 text-[13px]">
                <div>
                  <dt className="hint text-[11px]">
                    {isVi ? 'Mức an toàn (p5)' : 'Safe floor (p5)'}
                  </dt>
                  <dd className="text-[15px] font-semibold tabular-nums">
                    {formatVND(simulationResult.profit_distribution.p5)}
                  </dd>
                </div>
                <div>
                  <dt className="hint text-[11px]">
                    {isVi ? 'Khả năng cao nhất (p50)' : 'Expected (p50)'}
                  </dt>
                  <dd className="text-[15px] font-semibold tabular-nums text-accent">
                    {formatVND(simulationResult.profit_distribution.p50)}
                  </dd>
                </div>
                <div>
                  <dt className="hint text-[11px]">
                    {isVi ? 'Trường hợp thuận lợi (p95)' : 'Optimistic (p95)'}
                  </dt>
                  <dd className="text-[15px] font-semibold tabular-nums">
                    {formatVND(simulationResult.profit_distribution.p95)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220} minWidth={260}>
                  <BarChart data={histData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--rule))" />
                    <XAxis
                      dataKey="rangeLabel"
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                      axisLine={{ stroke: 'rgb(var(--rule-strong))' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={44}
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--sunken))' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded border border-rule-strong bg-surface px-3 py-2 text-[13px] text-ink shadow-sm">
                            <p className="text-muted">{data.rangeLabel}</p>
                            <p className="font-semibold">
                              {data.count} {isVi ? 'tình huống' : 'outcomes'}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                      {histData.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={
                            entry.mid >= baseProfit
                              ? 'rgb(var(--chart-above))'
                              : 'rgb(var(--chart-below))'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Break-even safety cushion */}
            <section aria-labelledby="breakeven" className="panel flex flex-col p-5">
              <h2 id="breakeven" className="h2">
                {isVi ? 'Giới hạn chịu đựng của khách' : 'Break-even safety cushion'}
              </h2>
              <p className="hint mt-1">
                {isVi
                  ? 'Giúp bạn biết khách có thể phản ứng tối đa đến mức nào mà bạn vẫn không bị hụt lãi.'
                  : 'Shows how strongly buyers can react before this price change earns less than today.'}
              </p>

              {simulationResult.break_even_elasticity !== null &&
              simulationResult.break_even_elasticity !== undefined ? (
                <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                  <dl className="space-y-3 rounded-md bg-sunken/70 p-3.5">
                    <div>
                      <dt className="hint text-[12px]">
                        {isVi ? 'Mức hòa vốn cho phép (giới hạn)' : 'Break-even customer reaction'}
                      </dt>
                      <dd className="text-[18px] font-semibold tabular-nums text-ink">
                        {formatNum(simulationResult.break_even_elasticity)}
                      </dd>
                    </div>
                    <div className="border-t border-rule pt-2.5">
                      <dt className="hint text-[12px]">
                        {isVi ? 'Mức phản ứng thực tế của khách shop bạn' : 'Your buyers today'}
                      </dt>
                      <dd className="text-[18px] font-semibold tabular-nums text-accent">
                        {selectedProduct ? formatNum(selectedProduct.elasticity_median) : '—'}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[14px] leading-relaxed text-muted">
                    {isVi
                      ? `Với phương án này, chỉ cần mỗi lần tăng giá 1% mà lượng mua không thay đổi vượt quá ngưỡng ${formatNum(
                          simulationResult.break_even_elasticity
                        )}% thì bạn vẫn lời hơn giá cũ.`
                      : `At this price plan, profit stays ahead as long as buyer sensitivity does not exceed ${formatNum(
                          simulationResult.break_even_elasticity
                        )}.`}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-[14px] text-muted">
                  {isVi
                    ? 'Khi bạn giữ giá đổi 0% hoặc giá bán chưa cao hơn giá nhập thì không tính điểm hòa vốn.'
                    : 'Break-even applies when price changes and selling price exceeds unit cost.'}
                </p>
              )}
            </section>
          </div>

          {/* Daily Schedule Trajectory if multi-phase schedule */}
          {traceData.length >= 2 && (
            <section aria-labelledby="schedule-trajectory" className="panel p-5">
              <h2 id="schedule-trajectory" className="h2">
                {isVi
                  ? 'Lộ trình đổi giá & Tiền lãi ước tính từng ngày'
                  : 'Day-by-day price path & expected daily profit'}
              </h2>
              <div className="mt-4 h-[220px] w-full">
                <ResponsiveContainer width="100%" height={220} minWidth={260}>
                  <LineChart data={traceData} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke="rgb(var(--rule))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="left"
                      width={76}
                      tickFormatter={(v: number) => formatCompactVND(v)}
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      width={48}
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }}
                    />
                    <Tooltip
                      formatter={(val: number, name: string) =>
                        name.includes('%') ? [`${val.toFixed(1)}%`, name] : [formatVND(val), name]
                      }
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="profit"
                      name={isVi ? 'Tiền lãi dự kiến / ngày' : 'Expected Daily Profit'}
                      stroke="rgb(var(--chart-above))"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="pricePct"
                      name={isVi ? 'Mức đổi giá (%)' : 'Price Δ%'}
                      stroke="rgb(var(--chart-below))"
                      strokeWidth={1.75}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Transparent Assumptions & Data Lineage Card */}
          {selectedProduct && (
            <TransparentAssumptionsCard
              product={selectedProduct}
              priceChangePct={priceChangePct}
              horizonDays={horizonDays}
              plannedRestockUnits={plannedRestockUnits}
              extraMarketingSpend={extraFixedCostVnd}
              lang={lang}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default WhatIfScreen;
