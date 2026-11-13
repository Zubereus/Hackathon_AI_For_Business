import React from 'react';
import {
  ArrowRightIcon,
  ShieldCheckIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from './Icons';
import { formatInt, formatPct, formatVND, Lang } from '../i18n';
import { ScenarioMetrics } from '../types';

/**
 * Custom geometric retail prism + price-tag + upward signal mark.
 * Deliberately vibrant & editorial without gradient-text or generic bot tropes.
 */
export const BrandLogoMark: React.FC<{ className?: string }> = ({ className = 'h-9 w-9' }) => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="36" height="36" rx="10" fill="rgb(var(--cobalt-bg))" />
    <rect
      x="2.5"
      y="2.5"
      width="35"
      height="35"
      rx="9.5"
      stroke="rgb(var(--cobalt) / 0.25)"
      strokeWidth="1"
    />
    {/* Storefront price tag silhouette */}
    <path
      d="M10 13.5C10 11.8431 11.3431 10.5 13 10.5H20.8L29.2 18.9C30.37 20.07 30.37 21.97 29.2 23.14L23.14 29.2C21.97 30.37 20.07 30.37 18.9 29.2L10.5 20.8V13.5H10Z"
      fill="rgb(var(--accent))"
    />
    <circle cx="15" cy="15.5" r="2" fill="#FFF8EE" />
    {/* Rising delta ribbon */}
    <path
      d="M17 24L22.5 18.5L26 21.5L31.5 13.5"
      stroke="#F59E0B"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M27.5 13.2H31.8V17.5"
      stroke="#E55635"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SKU_PALETTES = [
  'border-accent/30 bg-accent-bg text-accent',
  'border-cobalt/30 bg-cobalt-bg text-cobalt',
  'border-coral/30 bg-coral-bg text-coral',
  'border-warn/30 bg-warn-bg text-warn',
  'border-violet/30 bg-violet-bg text-violet',
] as const;

export const SkuAvatarBadge: React.FC<{
  productId: string;
  size?: 'sm' | 'md';
}> = ({ productId, size = 'md' }) => {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) {
    hash = (hash * 31 + productId.charCodeAt(i)) >>> 0;
  }
  const palette = SKU_PALETTES[hash % SKU_PALETTES.length];
  const sizeCls = size === 'sm' ? 'h-7 px-2 text-[11px]' : 'h-9 min-w-[44px] px-2.5 text-[12px]';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border font-bold tracking-tight tabular-nums ${palette} ${sizeCls}`}
    >
      {productId}
    </span>
  );
};

interface PriceDeltaBridgeCardProps {
  base: ScenarioMetrics;
  expected: ScenarioMetrics;
  pessimistic: ScenarioMetrics;
  optimistic: ScenarioMetrics;
  currentPriceVnd: number;
  expectedPriceVnd?: number | null;
  priceChangePct: number;
  isScheduleMode: boolean;
  horizonDays: number;
  probBeatBase: number;
  lang?: Lang;
}

/**
 * High-clarity "Before vs After" comparison strip inspired by clean visual calculators
 * (Simulador Financeiro / Financial Summary). Displays strictly engine-computed numbers.
 */
export const PriceDeltaBridgeCard: React.FC<PriceDeltaBridgeCardProps> = ({
  base,
  expected,
  pessimistic,
  optimistic,
  currentPriceVnd,
  expectedPriceVnd,
  priceChangePct,
  isScheduleMode,
  horizonDays,
  probBeatBase,
  lang = 'vi',
}) => {
  const isVi = lang === 'vi';
  const targetPrice = expectedPriceVnd ?? expected.price_vnd ?? currentPriceVnd;
  const profitDiff = expected.profit - base.profit;
  const unitsDiff = expected.qty - base.qty;
  const probPct = Math.round(probBeatBase * 100);
  const isGain = profitDiff >= 0;

  return (
    <section
      aria-label={isVi ? 'So sánh nhanh trước và sau khi đổi giá' : 'Before vs After price preview'}
      data-testid="price-delta-bridge"
      className="panel overflow-hidden border-rule-strong bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-sunken/70 px-5 py-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cobalt" aria-hidden="true" />
          <span>
            {isVi
              ? `So sánh nhanh trong ${horizonDays} ngày tới`
              : `Side-by-side preview (${horizonDays}-day horizon)`}
          </span>
        </div>
        <span
          className={`tag border font-semibold ${
            probPct >= 60
              ? 'border-good/30 bg-good-bg text-good'
              : probPct >= 40
                ? 'border-warn/30 bg-warn-bg text-warn'
                : 'border-bad/30 bg-bad-bg text-bad'
          }`}
        >
          <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {isVi ? `${probPct}% cơ hội thắng giá cũ` : `${probPct}% beat baseline`}
        </span>
      </div>

      <div className="grid items-stretch gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)]">
        {/* Column 1: Keep Current Price */}
        <div className="flex flex-col justify-between rounded-xl border border-rule bg-sunken/60 p-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              <span className="h-2 w-2 rounded-full bg-muted/60" />
              {isVi ? 'Hiện tại (Giữ giá cũ)' : 'Baseline (Keep price)'}
            </span>
            <p className="mt-2 text-[20px] font-bold tabular-nums text-ink">
              {formatVND(base.profit)}
            </p>
            <span className="hint block text-[12px]">
              {isVi ? 'Tiền lãi dự kiến giữ giá cũ' : 'Expected profit at old price'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-rule pt-3 text-[12px]">
            <div>
              <span className="hint block text-[11px]">{isVi ? 'Giá bán' : 'Price'}</span>
              <strong className="tabular-nums text-ink">{formatVND(currentPriceVnd)}</strong>
            </div>
            <div>
              <span className="hint block text-[11px]">{isVi ? 'Lượng bán' : 'Units'}</span>
              <strong className="tabular-nums text-ink">
                {formatInt(base.qty)} {isVi ? 'món' : 'units'}
              </strong>
            </div>
          </div>
        </div>

        {/* Center Delta Bridge */}
        <div className="flex flex-row items-center justify-center gap-2 py-1 md:flex-col md:px-1">
          <div
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-bold shadow-sm tabular-nums ${
              isScheduleMode
                ? 'border-cobalt/35 bg-cobalt-bg text-cobalt'
                : priceChangePct > 0
                  ? 'border-accent/35 bg-accent-bg text-accent'
                  : priceChangePct < 0
                    ? 'border-coral/35 bg-coral-bg text-coral'
                    : 'border-rule bg-sunken text-muted'
            }`}
          >
            {isScheduleMode
              ? isVi
                ? 'Đa pha'
                : 'Phased'
              : priceChangePct > 0
                ? `+${formatPct(priceChangePct, 0).replace('+', '')}`
                : formatPct(priceChangePct, 0).replace('-', '−')}
          </div>
          <ArrowRightIcon
            className="hidden h-5 w-5 text-cobalt md:block"
            aria-hidden="true"
          />
          <span className="hint text-center text-[11px] font-medium">
            {unitsDiff >= 0
              ? `+${formatInt(unitsDiff)} ${isVi ? 'món' : 'units'}`
              : `−${formatInt(Math.abs(unitsDiff))} ${isVi ? 'món' : 'units'}`}
          </span>
        </div>

        {/* Column 2: Expected Simulated Outcome */}
        <div
          className={`flex flex-col justify-between rounded-xl border p-4 ${
            isGain
              ? 'border-accent/40 bg-accent-bg/45'
              : 'border-coral/40 bg-coral-bg/45'
          }`}
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${
                  isGain ? 'text-good' : 'text-coral'
                }`}
              >
                {isGain ? (
                  <TrendingUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <TrendingDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isVi ? 'Kịch bản đang thử' : 'Simulated Scenario'}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${
                  isGain ? 'bg-good-bg text-good' : 'bg-bad-bg text-bad'
                }`}
              >
                {isGain ? '+' : '−'}
                {formatVND(Math.abs(profitDiff))}
              </span>
            </div>

            <p className="mt-2 text-[22px] font-bold tabular-nums text-ink">
              {formatVND(expected.profit)}
            </p>
            <span className="hint block text-[12px]">
              {isVi
                ? `Biên độ có thể dao động: ${formatVND(pessimistic.profit)} → ${formatVND(optimistic.profit)}`
                : `Outcome range: ${formatVND(pessimistic.profit)} → ${formatVND(optimistic.profit)}`}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-rule/80 pt-3 text-[12px]">
            <div>
              <span className="hint block text-[11px]">
                {isScheduleMode
                  ? isVi
                    ? 'Giá TB kế hoạch'
                    : 'Avg plan price'
                  : isVi
                    ? 'Giá mới thử'
                    : 'New price'}
              </span>
              <strong className="tabular-nums text-ink">{formatVND(targetPrice)}</strong>
            </div>
            <div>
              <span className="hint block text-[11px]">{isVi ? 'Lượng bán dự kiến' : 'Est. units'}</span>
              <strong className="tabular-nums text-ink">
                {formatInt(expected.qty)} {isVi ? 'món' : 'units'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
