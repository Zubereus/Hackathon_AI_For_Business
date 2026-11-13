import React, { useState } from 'react';
import { formatInt, formatNum, formatVND, Lang } from '../i18n';
import { ProductElasticity, SimulateResponse } from '../types';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  InfoIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TargetIcon,
  TrendingUpIcon,
} from './Icons';

interface StepExplainerProps {
  lang: Lang;
  product: ProductElasticity;
  simulation: SimulateResponse;
  priceChangePct: number;
  isScheduleMode: boolean;
}

export const StepExplainer: React.FC<StepExplainerProps> = ({
  lang,
  product,
  simulation,
  priceChangePct,
  isScheduleMode,
}) => {
  const isVi = lang === 'vi';
  const [activeStep, setActiveStep] = useState<number>(0);

  const absElast = Math.abs(product.elasticity_median);
  const sensitivityMood =
    absElast < 0.8
      ? isVi
        ? 'Khách ít ngại tăng giá (hàng thiết yếu / ít hàng thay thế)'
        : 'Customers barely flinch at price hikes'
      : absElast <= 1.6
        ? isVi
          ? 'Mức độ phản ứng vừa phải (tăng giá nhẹ vẫn giữ được phần lớn khách)'
          : 'Moderate sensitivity (small adjustments keep most buyers)'
        : isVi
          ? 'Khách khá nhạy với giá (tăng mạnh dễ hụt đơn, giảm giá kích cầu tốt)'
          : 'Price-sensitive buyers (discounts lift volume fast, hikes cut demand)';

  const baseProfit = simulation.scenarios.base.profit;
  const expProfit = simulation.scenarios.expected.profit;
  const diff = expProfit - baseProfit;
  const p5 = simulation.profit_distribution.p5;
  const adv = simulation.advisory;
  const probBeatPct = adv ? (adv.prob_beat_base * 100).toFixed(0) : null;

  const steps = [
    {
      id: 1,
      icon: SparklesIcon,
      shortTitle: isVi ? '1. Khách phản ứng ra sao?' : '1. How buyers react',
      title: isVi
        ? `Bước 1: Đọc thói quen mua "${product.product_name}" từ hóa đơn cũ`
        : `Step 1: Reading buyer habits for "${product.product_name}"`,
      summary: isVi
        ? `Với giá hiện tại ${formatVND(product.current_price_vnd)}, shop bán trung bình ${formatInt(
            product.baseline_qty_per_period
          )} món/kỳ. Từ dữ liệu lịch sử (đã trừ yếu tố mùa Tết & ngày sale đôi), khi giá tăng 1% thì lượng mua thay đổi khoảng ${formatNum(
            product.elasticity_median
          )}%.`
        : `At today's price of ${formatVND(product.current_price_vnd)}, you sell about ${formatInt(
            product.baseline_qty_per_period
          )} units per period. Historically, a 1% price increase shifts units sold by roughly ${formatNum(
            product.elasticity_median
          )}%.`,
      takeawayLabel: isVi ? 'Đánh giá nhanh' : 'Quick read',
      takeawayValue: sensitivityMood,
    },
    {
      id: 2,
      icon: TrendingUpIcon,
      shortTitle: isVi ? '2. Thử 5.000 kịch bản' : '2. 5,000 market runs',
      title: isVi
        ? 'Bước 2: Chạy thử 5.000 tình huống sức mua khác nhau'
        : 'Step 2: Testing 5,000 realistic market days',
      summary: isVi
        ? isScheduleMode
          ? 'Vì sức mua mỗi ngày lúc lên lúc xuống, máy không đoán mò một con số duy nhất mà ghép lộ trình đổi giá nhiều pha của bạn với 5.000 tình huống ngẫu nhiên.'
          : `Với mức ${
              priceChangePct >= 0
                ? `tăng ${priceChangePct}%`
                : `giảm ${Math.abs(priceChangePct)}%`
            }, máy thử 5.000 kịch bản sức mua khác nhau để cho bạn thấy cả mức tốt nhất lẫn mức xấu nhất có thể gặp.`
        : `Because demand fluctuates daily, the engine simulates 5,000 realistic scenarios for your ${
            isScheduleMode ? 'multi-phase schedule' : `${priceChangePct}% price change`
          } so you see both the upside and the downside.`,
      takeawayLabel: isVi ? 'Mức lãi an toàn (95% không thấp hơn)' : 'Safe floor (95% stay above)',
      takeawayValue: formatVND(p5),
    },
    {
      id: 3,
      icon: TargetIcon,
      shortTitle: isVi ? '3. So sánh với giá cũ' : '3. Compare vs old price',
      title: isVi
        ? 'Bước 3: Đem so với việc "không đổi giá gì cả"'
        : 'Step 3: Comparing against keeping today’s price',
      summary: isVi
        ? `Nếu giữ nguyên giá cũ, lãi ước tính là ${formatVND(
            baseProfit
          )}. Với phương án mới, lãi dự kiến là ${formatVND(expProfit)} (${
            diff >= 0 ? 'lãi thêm ' : 'hụt đi '
          }${formatVND(Math.abs(diff))}).`
        : `Keeping today's price earns roughly ${formatVND(
            baseProfit
          )}. Your plan is projected at ${formatVND(expProfit)} (${
            diff >= 0 ? '+' : '−'
          }${formatVND(Math.abs(diff))}).`,
      takeawayLabel: isVi ? 'Cơ hội thắng mức giá cũ' : 'Odds of beating today’s price',
      takeawayValue:
        probBeatPct !== null
          ? isVi
            ? `${probBeatPct}/100 kịch bản cho lãi cao hơn`
            : `${probBeatPct} out of 100 scenarios come out ahead`
          : '—',
    },
    {
      id: 4,
      icon: ShieldCheckIcon,
      shortTitle: isVi ? '4. Kiểm tra rào an toàn' : '4. Safety checks',
      title: isVi
        ? 'Bước 4: Kiểm tra biên lợi nhuận, tồn kho & ngưỡng hòa vốn'
        : 'Step 4: Checking margin, stock, and break-even cushion',
      summary:
        simulation.break_even_elasticity !== null && simulation.break_even_elasticity !== undefined
          ? isVi
            ? `Giới hạn chịu đựng của phương án là ${formatNum(
                simulation.break_even_elasticity
              )}. Hiện khách của shop ở mức ${formatNum(
                product.elasticity_median
              )} — bạn xem bên dưới để chắc chắn biên lãi không bị mỏng quá mức.`
            : `Your break-even customer sensitivity is ${formatNum(
                simulation.break_even_elasticity
              )} compared to today's estimate of ${formatNum(product.elasticity_median)}.`
          : isVi
            ? 'Khi giữ giá 0% hoặc giá bán thấp hơn giá vốn thì không có điểm hòa vốn — hãy kiểm tra lại giá vốn từng món.'
            : 'Break-even cushion appears whenever price changes and selling price exceeds unit cost.',
      takeawayLabel: isVi ? 'Biên lãi thấp nhất trong đợt' : 'Lowest gross margin in plan',
      takeawayValue: adv
        ? `${adv.min_margin_pct_in_plan.toFixed(1)}%${
            adv.stockout_risk
              ? isVi
                ? ' · Cảnh báo: Có nguy cơ hết hàng!'
                : ' · Warning: Risk of running out of stock!'
              : isVi
                ? ' · Đủ hàng bán'
                : ' · Stock looks sufficient'
          }`
        : '—',
    },
  ];

  const current = steps[activeStep];
  const Icon = current.icon;

  return (
    <section
      aria-label={isVi ? 'Giải thích từng bước dễ hiểu' : 'Step-by-step plain guide'}
      data-testid="step-explainer"
      className="panel overflow-hidden border-rule-strong bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-sunken/70 px-5 py-3">
        <div className="flex items-center gap-2">
          <InfoIcon className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2 className="text-[15px] font-semibold text-ink">
            {isVi
              ? 'Hiểu nhanh kết quả qua 4 bước (không cần biết tài chính)'
              : 'Understand your numbers in 4 plain steps'}
          </h2>
        </div>
        <span className="text-[12px] text-muted">
          {isVi ? 'Bấm từng bước để xem máy tính thế nào' : 'Click each step to walk through'}
        </span>
      </div>

      {/* Step selector pills */}
      <div className="grid grid-cols-2 border-b border-rule sm:grid-cols-4">
        {steps.map((step, idx) => {
          const isCurrent = idx === activeStep;
          const isDone = idx < activeStep;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(idx)}
              className={`flex items-center justify-between gap-2 border-b-2 px-4 py-3 text-left text-[13px] font-medium transition-colors ${
                isCurrent
                  ? 'border-accent bg-accent/5 text-ink font-semibold'
                  : 'border-transparent text-muted hover:bg-sunken/50 hover:text-ink'
              }`}
            >
              <span className="truncate">{step.shortTitle}</span>
              {isDone && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-good" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Active step detail */}
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-center">
        <div>
          <div className="flex items-center gap-2 text-accent">
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <h3 className="text-[16px] font-semibold text-ink">{current.title}</h3>
          </div>
          <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-muted">
            {current.summary}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {activeStep > 0 && (
              <button
                type="button"
                onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                className="btn btn-secondary py-1.5 text-[13px]"
              >
                {isVi ? '← Bước trước' : '← Previous'}
              </button>
            )}
            {activeStep < steps.length - 1 && (
              <button
                type="button"
                onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}
                className="btn btn-primary gap-1.5 py-1.5 text-[13px]"
              >
                <span>{isVi ? 'Xem bước tiếp theo' : 'Next step'}</span>
                <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <div className="rounded-md border border-rule bg-sunken/70 p-4">
          <div className="text-[12px] font-medium text-muted">{current.takeawayLabel}</div>
          <div className="mt-1 text-[15px] font-semibold leading-snug text-ink tabular-nums">
            {current.takeawayValue}
          </div>
          {activeStep === 3 && adv?.stockout_risk && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-warn">
              <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {isVi
                  ? 'Nên nhập thêm hàng trước khi giảm giá sâu.'
                  : 'Restock before running deep markdowns.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

