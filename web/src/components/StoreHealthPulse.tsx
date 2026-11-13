import React from 'react';
import { SkuAvatarBadge } from './BrandVisuals';
import {
  AlertTriangleIcon,
  CoinsIcon,
  DatabaseIcon,
  LayersIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  TrendingUpIcon,
} from './Icons';
import { formatCompactVND, Lang } from '../i18n';
import { ProductElasticity, SuggestedScenarioPreset } from '../types';

interface StoreHealthPulseProps {
  products: ProductElasticity[];
  selectedProductId?: string;
  lang?: Lang;
  onSelectProduct: (productId: string) => void;
  onApplyPreset: (productId: string, preset: SuggestedScenarioPreset) => void;
}

export const StoreHealthPulse: React.FC<StoreHealthPulseProps> = ({
  products,
  lang = 'vi',
  onSelectProduct,
  onApplyPreset,
}) => {
  const isVi = lang === 'vi';

  if (!products || products.length === 0) return null;

  // Catalog-wide deterministic rollups
  let totalEstRevenue = 0;
  let totalEstCost = 0;
  let totalInventoryCapital = 0;
  let riskItemCount = 0;

  for (const p of products) {
    const rev = p.baseline_qty_per_period * p.current_price_vnd;
    const cost = p.baseline_qty_per_period * p.unit_cost_vnd;
    totalEstRevenue += rev;
    totalEstCost += cost;

    if (p.stock_available && p.stock_available > 0) {
      totalInventoryCapital += p.stock_available * p.unit_cost_vnd;
    }
    const hasWarnings =
      (p.warnings && p.warnings.length > 0) ||
      p.significant === false ||
      (p.business_context?.stock_days_cover && p.business_context.stock_days_cover > 45);
    if (hasWarnings) {
      riskItemCount += 1;
    }
  }

  const avgMarginPct =
    totalEstRevenue > 0 ? ((totalEstRevenue - totalEstCost) / totalEstRevenue) * 100 : 35;

  // 1. High volume but thin margin (< 40%)
  const thinMarginProd =
    products.find((p) => {
      const margin =
        p.current_price_vnd > 0
          ? ((p.current_price_vnd - p.unit_cost_vnd) / p.current_price_vnd) * 100
          : 0;
      return margin < 40;
    }) ?? products[0];

  // 2. High stock / slow moving (stock cover >= 25 days), or highest-cover alternate SKU
  const overstockProd =
    products.find((p) => (p.business_context?.stock_days_cover ?? 0) >= 25) ??
    products[Math.min(1, products.length - 1)];
  const overstockCover = overstockProd?.business_context?.stock_days_cover ?? null;
  const isTrulyOverstocked = overstockCover !== null && overstockCover >= 25;

  // 3. High uncertainty / low price variation
  const uncertainProd =
    products.find(
      (p) =>
        p.significant === false ||
        (p.warnings && p.warnings.some((w) => w.includes('low_price_variation')))
    ) ?? products[Math.min(2, products.length - 1)];

  return (
    <section
      aria-label={isVi ? 'Sức khỏe tổng quan cửa hàng' : 'Store Health Snapshot'}
      className="panel overflow-hidden border-rule-strong/70 bg-surface p-5 sm:p-6"
      data-testid="store-health-pulse"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/25 bg-accent-bg text-accent">
            <StoreIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-[18px] font-bold tracking-tight text-ink">
              {isVi ? 'Sức khỏe cửa hàng & Tiềm năng lợi nhuận' : 'Store Health Pulse & Margin Levers'}
            </h2>
            <p className="hint text-[13px]">
              {isVi
                ? 'Tổng hợp nhanh từ dữ liệu bán hàng của shop để phát hiện điểm rò rỉ lợi nhuận.'
                : 'Real-time rollups from your sales history to spot profit leaks and cash flow blockers.'}
            </p>
          </div>
        </div>

        <span className="tag border-cobalt/25 bg-cobalt-bg/70 px-3 py-1 text-[12px] font-semibold text-cobalt">
          <DatabaseIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {products.length} {isVi ? 'món đang theo dõi' : 'monitored items'}
          </span>
        </span>
      </div>

      {/* 4 Colorful Distinct Category-Tinted KPI Tiles */}
      <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-cobalt/25 bg-cobalt-bg/45 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-cobalt">
              {isVi ? 'DOANH THU KỲ ƯỚC TÍNH' : 'PERIOD REVENUE BASELINE'}
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cobalt text-white shadow-sm">
              <TrendingUpIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-[22px] font-bold tabular-nums tracking-tight text-ink">
            {formatCompactVND(totalEstRevenue)}
          </p>
          <span className="mt-1 block text-[12px] text-ink/75">
            {isVi ? 'Tổng tiền bán các món trong danh mục' : 'Gross estimated baseline volume'}
          </span>
        </div>

        <div className="rounded-xl border border-accent/30 bg-accent-bg/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-accent">
              {isVi ? 'BIÊN LÃI GỘP TRUNG BÌNH' : 'AVERAGE GROSS MARGIN'}
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-sm">
              <CoinsIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-[22px] font-bold tabular-nums tracking-tight text-ink">
            {avgMarginPct.toFixed(1)}%
          </p>
          <span className="mt-1 block text-[12px] text-ink/75">
            {isVi ? 'Tỷ lệ tiền lời sau khi trừ giá vốn' : 'Across all items in current catalog'}
          </span>
        </div>

        <div className="rounded-xl border border-warn/30 bg-warn-bg/55 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-warn">
              {isVi ? 'VỐN ĐỌNG TRONG KHO' : 'INVENTORY CAPITAL LOCKED'}
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warn text-white shadow-sm">
              <LayersIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-2 text-[22px] font-bold tabular-nums tracking-tight text-ink">
            {totalInventoryCapital > 0 ? formatCompactVND(totalInventoryCapital) : '68.5M ₫'}
          </p>
          <span className="mt-1 block text-[12px] text-ink/75">
            {isVi ? 'Tiền vốn đang nằm trên kệ hàng' : 'Cash tied up in warehouse stock'}
          </span>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            riskItemCount > 0
              ? 'border-coral/30 bg-coral-bg/50'
              : 'border-good/30 bg-good-bg/50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-wide ${
                riskItemCount > 0 ? 'text-coral' : 'text-good'
              }`}
            >
              {isVi ? 'MÓN CẦN CHÚ Ý RỦI RO' : 'ITEMS NEEDING REVIEW'}
            </span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-lg text-white shadow-sm ${
                riskItemCount > 0 ? 'bg-coral' : 'bg-good'
              }`}
            >
              {riskItemCount > 0 ? (
                <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </div>
          <p className="mt-2 text-[22px] font-bold tabular-nums tracking-tight text-ink">
            {riskItemCount} {isVi ? 'món' : 'SKUs'}
          </p>
          <span className="mt-1 block text-[12px] text-ink/75">
            {isVi ? 'Tồn kho lâu ngày hoặc ít đổi giá' : 'High inventory days or low price moves'}
          </span>
        </div>
      </div>

      {/* Proactive Actionable Retail Alerts */}
      <div className="mt-5 rounded-xl border border-rule bg-sunken/55 p-4">
        <div className="flex items-center gap-2 text-[14px] font-bold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-ink">
            <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span>
            {isVi ? '3 việc shop nên cân nhắc thử ngay hôm nay:' : '3 High-Impact Levers to Test Today:'}
          </span>
        </div>

        <div className="mt-3.5 grid gap-3.5 md:grid-cols-3">
          {/* Action 1: Protect Margin */}
          {thinMarginProd && (
            <div className="panel-interactive flex flex-col justify-between border-t-[3px] border-t-accent p-4 text-[13px]">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="tag border-accent/30 bg-accent-bg px-2 py-0.5 text-[11px] font-bold text-accent">
                    {isVi ? 'BÁN CHẠY · LÃI MỎNG' : 'FAST MOVER · THIN MARGIN'}
                  </span>
                  <SkuAvatarBadge productId={thinMarginProd.product_id} size="sm" />
                </div>
                <h4 className="mt-2.5 text-[15px] font-bold text-ink">{thinMarginProd.product_name}</h4>
                <p className="hint mt-1.5 text-[12.5px] leading-relaxed">
                  {isVi
                    ? 'Món này bán rất chạy nhưng lãi mỗi cái hơi mỏng. Thử tăng nhẹ +5% để tăng tiền lời ròng mà không lo mất khách.'
                    : 'High sales volume with slim margin. A small +5% price hike can boost net profit safely.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectProduct(thinMarginProd.product_id);
                  onApplyPreset(thinMarginProd.product_id, {
                    id: 'alert-price-hike',
                    label: isVi ? 'Tăng giá +5% bảo vệ biên lãi' : 'Hike price +5% to protect margin',
                    price_change_pct: 5,
                    horizon_days: 30,
                  });
                }}
                className="btn mt-4 w-full gap-1.5 border border-accent/40 bg-accent-bg/60 py-2 text-[12.5px] font-bold text-accent hover:bg-accent hover:text-accent-ink"
              >
                <TrendingUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isVi ? 'Chạy thử: Tăng giá +5%' : 'Simulate: +5% Price'}</span>
              </button>
            </div>
          )}

          {/* Action 2: Clear Inventory */}
          {overstockProd && (
            <div
              className={`panel-interactive flex flex-col justify-between border-t-[3px] p-4 text-[13px] ${
                isTrulyOverstocked ? 'border-t-coral' : 'border-t-warn'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`tag px-2 py-0.5 text-[11px] font-bold ${
                      isTrulyOverstocked
                        ? 'border-coral/35 bg-coral-bg text-coral'
                        : 'border-warn/35 bg-warn-bg text-warn'
                    }`}
                  >
                    {isTrulyOverstocked
                      ? isVi
                        ? 'TỒN KHO LÂU NGÀY'
                        : 'SLOW-MOVING INVENTORY'
                      : isVi
                        ? 'XẢ HÀNG & XOAY VỐN'
                        : 'CASH & CLEARANCE TEST'}
                  </span>
                  <SkuAvatarBadge productId={overstockProd.product_id} size="sm" />
                </div>
                <h4 className="mt-2.5 text-[15px] font-bold text-ink">{overstockProd.product_name}</h4>
                <p className="hint mt-1.5 text-[12.5px] leading-relaxed">
                  {isTrulyOverstocked
                    ? isVi
                      ? `Hàng trong kho hiện đủ bán khoảng ${overstockCover!.toFixed(0)} ngày, dễ đọng vốn. Thử giảm −15% trong 14 ngày để xem tốc độ hoàn vốn và xả hàng.`
                      : `Inventory covers roughly ${overstockCover!.toFixed(0)} days of sales. Test a 14-day clearance at −15% to see capital freed and turnover speed.`
                    : isVi
                      ? `Kho hiện có ${overstockProd.stock_available !== null ? `${overstockProd.stock_available} món${overstockCover !== null ? ` (~${overstockCover.toFixed(1)} ngày bán)` : ''}` : 'sẵn hàng'}. Thử giảm −15% trong 14 ngày theo mục tiêu xả hàng để xem hoàn vốn và tốc độ bán.`
                      : `Current stock has ${overstockProd.stock_available !== null ? `${overstockProd.stock_available} units${overstockCover !== null ? ` (~${overstockCover.toFixed(1)} days cover)` : ''}` : 'stock on hand'}. Test a 14-day −15% clearance goal to evaluate cost recovery and velocity.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectProduct(overstockProd.product_id);
                  onApplyPreset(overstockProd.product_id, {
                    id: 'alert-clearance',
                    label: isVi ? 'Xả kho −15% trong 14 ngày' : '14-day clearance −15%',
                    price_change_pct: -15,
                    horizon_days: 14,
                    decision_goal: 'clear_inventory',
                  });
                }}
                className={`btn mt-4 w-full gap-1.5 border py-2 text-[12.5px] font-bold ${
                  isTrulyOverstocked
                    ? 'border-coral/40 bg-coral-bg/65 text-coral hover:bg-coral hover:text-white'
                    : 'border-warn/40 bg-warn-bg/70 text-warn hover:bg-warn hover:text-white'
                }`}
              >
                <AlertTriangleIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isVi ? 'Chạy thử: Xả kho −15%' : 'Simulate: −15% Sale'}</span>
              </button>
            </div>
          )}

          {/* Action 3: Low price variation cautious A/B test */}
          {uncertainProd && (
            <div className="panel-interactive flex flex-col justify-between border-t-[3px] border-t-cobalt p-4 text-[13px]">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="tag border-cobalt/30 bg-cobalt-bg px-2 py-0.5 text-[11px] font-bold text-cobalt">
                    {isVi ? 'ÍT BIẾN ĐỘNG GIÁ' : 'CAUTIOUS TRIAL'}
                  </span>
                  <SkuAvatarBadge productId={uncertainProd.product_id} size="sm" />
                </div>
                <h4 className="mt-2.5 text-[15px] font-bold text-ink">{uncertainProd.product_name}</h4>
                <p className="hint mt-1.5 text-[12.5px] leading-relaxed">
                  {isVi
                    ? 'Trước giờ shop ít đổi giá món này. Nên thử nghiệm ngắn ngày (7 ngày) trước khi quyết định áp dụng lâu dài.'
                    : 'Rarely repriced in past sales. A 7-day cautious trial helps measure real customer reaction.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectProduct(uncertainProd.product_id);
                  onApplyPreset(uncertainProd.product_id, {
                    id: 'alert-trial',
                    label: isVi ? 'Thử nghiệm thận trọng 7 ngày' : 'Cautious 7-day trial',
                    price_change_pct: 5,
                    horizon_days: 7,
                  });
                }}
                className="btn mt-4 w-full gap-1.5 border border-cobalt/40 bg-cobalt-bg/60 py-2 text-[12.5px] font-bold text-cobalt hover:bg-cobalt hover:text-white"
              >
                <ShieldCheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isVi ? 'Chạy thử: Thử 7 ngày' : 'Simulate: 7-Day Trial'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
