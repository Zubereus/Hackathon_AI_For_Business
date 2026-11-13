import React from 'react';
import {
  CoinsIcon,
  DatabaseIcon,
  InfoIcon,
  ShieldCheckIcon,
  SlidersIcon,
} from './Icons';
import {
  formatCompactVND,
  formatInt,
  formatNum,
  formatPct,
  formatVND,
  Lang,
} from '../i18n';
import { ProductElasticity } from '../types';

interface TransparentAssumptionsCardProps {
  product: ProductElasticity;
  priceChangePct: number;
  horizonDays: number;
  plannedRestockUnits?: number | null;
  extraMarketingSpend?: number;
  lang?: Lang;
}

export const TransparentAssumptionsCard: React.FC<TransparentAssumptionsCardProps> = ({
  product,
  priceChangePct,
  horizonDays,
  plannedRestockUnits = 0,
  extraMarketingSpend = 0,
  lang = 'vi',
}) => {
  const isVi = lang === 'vi';

  return (
    <div
      className="panel overflow-hidden border-rule bg-surface p-5 shadow-sm"
      data-testid="transparent-assumptions-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="h-5 w-5 text-accent" aria-hidden="true" />
          <h3 className="h2 text-[16px]">
            {isVi
              ? 'Nguồn gốc số liệu & Giả định tính toán (Minh bạch 100%)'
              : 'Data Lineage & Transparent Assumptions (100% Verified)'}
          </h3>
        </div>
        <span className="tag border border-rule bg-sunken text-[12px] font-semibold text-muted">
          {isVi ? 'Không số liệu ảo' : 'Zero Hallucination'}
        </span>
      </div>

      <p className="hint mt-2">
        {isVi
          ? 'Mọi số tiền và tỷ lệ dự báo đều bắt nguồn từ 4 nguồn rõ ràng dưới đây — không có con số nào bị máy tự bịa ra.'
          : 'Every metric originates from these 4 auditable layers — no numbers are hallucinated or fabricated.'}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Layer 1: Real Store Sales Data */}
        <div className="flex flex-col justify-between rounded-md border border-good/30 bg-good-bg/25 p-3.5 text-[13px]">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-good">
              <DatabaseIcon className="h-4 w-4" aria-hidden="true" />
              <span>{isVi ? '1. Dữ liệu thật từ shop' : '1. Real Store Data'}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-ink">
              <li>
                • {isVi ? 'Giá đang bán: ' : 'Current price: '}
                <strong className="tabular-nums">{formatVND(product.current_price_vnd)}</strong>
              </li>
              <li>
                • {isVi ? 'Giá vốn nhập hàng: ' : 'Unit wholesale cost: '}
                <strong className="tabular-nums">{formatVND(product.unit_cost_vnd)}</strong>
              </li>
              <li>
                • {isVi ? 'Lượng bán bình thường: ' : 'Average baseline sales: '}
                <strong className="tabular-nums">
                  ~{formatInt(product.baseline_qty_per_period)} {isVi ? 'món' : 'units'}
                </strong>
              </li>
              <li>
                • {isVi ? 'Tồn kho ghi nhận: ' : 'Recorded stock: '}
                <strong className="tabular-nums">
                  {product.stock_available !== null
                    ? `${formatInt(product.stock_available)} ${isVi ? 'món' : 'units'}`
                    : isVi
                      ? 'Chưa khai báo'
                      : 'Not capped'}
                </strong>
              </li>
              {product.fixed_cost_vnd !== undefined &&
                product.fixed_cost_vnd !== null &&
                product.fixed_cost_vnd > 0 && (
                  <li>
                    • {isVi ? 'Chi phí ngoài / kỳ: ' : 'Operating cost / period: '}
                    <strong className="tabular-nums">{formatVND(product.fixed_cost_vnd)}</strong>
                    {product.cost_breakdown && (
                      <div className="mt-0.5 pl-2.5 text-[11px] text-muted">
                        {isVi
                          ? `MKT ${formatCompactVND(product.cost_breakdown.marketing_vnd)} · Nhân công ${formatCompactVND(product.cost_breakdown.labor_vnd)} · Vận hành ${formatCompactVND(product.cost_breakdown.operating_vnd)}`
                          : `Ads ${formatCompactVND(product.cost_breakdown.marketing_vnd)} · Labor ${formatCompactVND(product.cost_breakdown.labor_vnd)} · Ops ${formatCompactVND(product.cost_breakdown.operating_vnd)}`}
                      </div>
                    )}
                  </li>
                )}
            </ul>
          </div>
          <div className="mt-3 border-t border-good/20 pt-2 text-[11px] text-muted">
            {isVi ? '✓ Trích xuất từ tệp CSV hóa đơn bán hàng' : '✓ Extracted from sales CSV rows'}
          </div>
        </div>

        {/* Layer 2: User Inputs / Decisions */}
        <div className="flex flex-col justify-between rounded-xl border border-accent/30 bg-accent-bg/35 p-3.5 text-[13px]">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-accent">
              <SlidersIcon className="h-4 w-4" aria-hidden="true" />
              <span>{isVi ? '2. Bạn tự kéo chỉnh' : '2. Your Decision Levers'}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-ink">
              <li>
                • {isVi ? 'Mức đổi giá bán: ' : 'Price move: '}
                <strong className="tabular-nums">{formatPct(priceChangePct, 1)}</strong>
              </li>
              <li>
                • {isVi ? 'Thời gian áp dụng: ' : 'Horizon: '}
                <strong className="tabular-nums">{horizonDays} {isVi ? 'ngày' : 'days'}</strong>
              </li>
              <li>
                • {isVi ? 'Ngân sách quảng cáo thêm: ' : 'Extra ad spend: '}
                <strong className="tabular-nums">{formatVND(extraMarketingSpend)}</strong>
              </li>
              <li>
                • {isVi ? 'Kế hoạch nhập thêm hàng: ' : 'Planned restock: '}
                <strong className="tabular-nums">
                  {plannedRestockUnits && plannedRestockUnits > 0
                    ? `${formatInt(plannedRestockUnits)} ${isVi ? 'món' : 'units'}`
                    : isVi
                      ? '0 món'
                      : '0 units'}
                </strong>
              </li>
            </ul>
          </div>
          <div className="mt-3 border-t border-accent/20 pt-2 text-[11px] text-muted">
            {isVi ? '✓ Người dùng chủ động điều chỉnh' : '✓ Adjusted by user via sliders'}
          </div>
        </div>

        {/* Layer 3: Deterministic Engine Math */}
        <div className="flex flex-col justify-between rounded-xl border border-cobalt/30 bg-cobalt-bg/35 p-3.5 text-[13px]">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-cobalt">
              <CoinsIcon className="h-4 w-4" aria-hidden="true" />
              <span>{isVi ? '3. Máy tính mô phỏng' : '3. Deterministic Engine'}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-ink">
              <li>
                • {isVi ? 'Độ nhạy giá ước lượng: ' : 'Estimated elasticity: '}
                <strong className="tabular-nums">{formatNum(product.elasticity_median)}</strong>
              </li>
              <li>
                • {isVi ? 'Thuật toán mô phỏng: ' : 'Simulation method: '}
                <strong>Monte Carlo (5.000 {isVi ? 'lần' : 'runs'})</strong>
              </li>
              <li>
                • {isVi ? 'Phân bổ ngẫu nhiên: ' : 'Distribution: '}
                <span>Bootstrap SplitMix64</span>
              </li>
              <li>
                • {isVi ? 'Hòa vốn & rủi ro: ' : 'Break-even math: '}
                <span>Kinh tế lượng xác định</span>
              </li>
            </ul>
          </div>
          <div className="mt-3 border-t border-rule pt-2 text-[11px] text-muted">
            {isVi ? '✓ Chạy bằng code Go & SciPy (Zero LLM Math)' : '✓ Go & SciPy code (Zero LLM Math)'}
          </div>
        </div>

        {/* Layer 4: Variables not in CSV */}
        <div className="flex flex-col justify-between rounded-md border border-warn/30 bg-warn-bg/25 p-3.5 text-[13px]">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-warn">
              <InfoIcon className="h-4 w-4" aria-hidden="true" />
              <span>{isVi ? '4. Biến chưa có trong CSV' : '4. Unmodeled Factors'}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-[12px] text-ink">
              <li>
                • {isVi ? 'Tỷ lệ hoàn hủy hàng: ' : 'Return/cancellation rate: '}
                <span className="text-muted">{isVi ? 'Giả định ~0% (chưa có cột)' : '~0% assumed'}</span>
              </li>
              <li>
                • {isVi ? 'Phí sàn, MKT & Nhân công: ' : 'Ads, labor & platform fees: '}
                <span className="text-muted">
                  {product.cost_breakdown
                    ? isVi
                      ? 'Đã tách từ CSV'
                      : 'Imported from CSV'
                    : isVi
                      ? 'Gộp trong chi phí ngoài'
                      : 'Bundled in fixed spend'}
                </span>
              </li>
              <li>
                • {isVi ? 'Phản ứng của đối thủ: ' : 'Competitor reactions: '}
                <span className="text-muted">{isVi ? 'Giữ nguyên thị phần' : 'Unchanged share'}</span>
              </li>
            </ul>
          </div>
          <div className="mt-3 border-t border-warn/20 pt-2 text-[11px] text-muted">
            {isVi ? '✓ Có thể chỉnh sửa ở mục "Giả định"' : '✓ Editable in Assumptions panel'}
          </div>
        </div>
      </div>
    </div>
  );
};

