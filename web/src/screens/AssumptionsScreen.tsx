import React from 'react';
import { Notice, PageHeader } from '../components/Page';
import {
  describeWarning,
  formatCompactVND,
  formatInt,
  formatNum,
  formatVND,
  getStrings,
  Lang,
} from '../i18n';
import { ProductElasticity } from '../types';

interface AssumptionsScreenProps {
  lang?: Lang;
  compact?: boolean;
  products: ProductElasticity[];
  onUpdateProduct: (productId: string, patch: Partial<ProductElasticity>) => void;
  onProceedToWhatIf?: () => void;
}

export function sampleQuantile(samples: number[], q: number): number | null {
  if (!samples || samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

// The range plot covers sensitivities from -3.5 (very sensitive) to +0.5 (not sensitive).
const SCALE_MIN = -3.5;
const SCALE_MAX = 0.5;
const SCALE_TICKS = [-3, -2, -1, 0];

/** Position on the plot, 0-100. Layout only; no business numbers are computed here. */
function scalePct(v: number): number {
  return Math.min(100, Math.max(0, ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));
}

export const RangePlot: React.FC<{
  low: number;
  high: number;
  median: number;
  label: string;
}> = ({ low, high, median, label }) => {
  const left = scalePct(Math.min(low, high));
  const right = scalePct(Math.max(low, high));
  return (
    <div
      role="img"
      aria-label={label}
      className="relative mt-2 h-4 w-full min-w-[150px]"
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-sm bg-accent/35"
        style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
      />
      <div
        className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-accent"
        style={{ left: `${scalePct(median)}%` }}
      />
    </div>
  );
};

export const AssumptionsScreen: React.FC<AssumptionsScreenProps> = ({
  lang = 'en',
  compact = false,
  products,
  onUpdateProduct,
  onProceedToWhatIf,
}) => {
  const isVi = lang === 'vi';
  const strings = getStrings(lang);

  return (
    <div>
      {!compact && (
        <PageHeader
          title={isVi ? 'Chỉnh giá nhập, chi phí & tồn kho từng món' : 'Product costs & inventory'}
        >
          {isVi
            ? 'Kiểm tra lại xem giá nhập vốn và số hàng tồn trong kho đã đúng thực tế shop chưa. Mọi chỉnh sửa sẽ áp dụng thẳng vào kết quả tính thử.'
            : 'Check unit costs and stock caps for each item. Any edits carry straight into your simulation.'}
        </PageHeader>
      )}

      <Notice>
        {strings.disclaimers.observational}{' '}
        {isVi
          ? 'Mẹo đọc cột "Phản ứng khách": −1,2 nghĩa là khi tăng giá 1%, lượng khách mua sẽ giảm khoảng 1,2%.'
          : 'How to read "Buyer reaction": −1.2 means a 1% price hike lowers units sold by about 1.2%.'}
      </Notice>

      {products.length === 0 ? (
        <p className="mt-6 text-muted">
          {isVi
            ? 'Chưa có sản phẩm nào. Hãy bấm "Nạp file bán hàng (CSV)" ở thanh trên.'
            : 'No products yet. Open Load Sales Data (CSV) above to start.'}
        </p>
      ) : (
        <div className="panel mt-5 overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead className="bg-sunken">
                <tr>
                  <th scope="col" className="pl-5">
                    {isVi ? 'Món hàng & Giá bán' : 'Product'}
                  </th>
                  <th scope="col" className="w-[260px]">
                    <div>
                      {isVi
                        ? 'Phản ứng khách khi tăng 1% giá (khoảng 90%)'
                        : 'Buyer reaction per +1% price (90% range)'}
                    </div>
                    <div className="relative mt-1 h-4 font-normal">
                      {SCALE_TICKS.map((t) => (
                        <span
                          key={t}
                          className="absolute -translate-x-1/2 text-[12px]"
                          style={{ left: `${scalePct(t)}%` }}
                        >
                          {formatNum(t, 0)}%
                        </span>
                      ))}
                    </div>
                  </th>
                  <th scope="col">{isVi ? 'Độ tin cậy số liệu' : 'Data reliability'}</th>
                  <th scope="col" className="w-[140px]">
                    {isVi ? 'Giá nhập 1 món (₫)' : 'Unit cost (₫)'}
                  </th>
                  <th scope="col" className="w-[175px]">
                    {isVi ? 'Chi phí ngoài / kỳ (₫)' : 'Operating overhead (₫)'}
                  </th>
                  <th scope="col" className="w-[155px] pr-5">
                    {isVi ? 'Giới hạn tồn kho' : 'Stock cap (units)'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => {
                  const low = sampleQuantile(prod.elasticity_samples, 0.05);
                  const high = sampleQuantile(prod.elasticity_samples, 0.95);
                  const isCapped = Boolean(prod.enforce_stock_cap && prod.stock_available !== null);
                  const checks = [
                    ...(prod.significant === false ? ['not_significant'] : []),
                    ...(prod.warnings ?? []).filter(
                      (w) => !(w === 'not_significant' && prod.significant === false)
                    ),
                  ];
                  const rangeText =
                    low !== null && high !== null
                      ? isVi
                        ? `${formatNum(low)}% đến ${formatNum(high)}%`
                        : `${formatNum(low)}% to ${formatNum(high)}%`
                      : isVi
                        ? 'chưa có dải dao động'
                        : 'range unavailable';

                  return (
                    <tr key={prod.product_id}>
                      <td className="pl-5">
                        <div className="font-semibold">{prod.product_name}</div>
                        <div className="hint">
                          {prod.product_id} · {formatVND(prod.current_price_vnd)} ·{' '}
                          {formatInt(prod.baseline_qty_per_period)}{' '}
                          {isVi ? 'món / kỳ' : 'units / period'}
                        </div>
                        {prod.price_variation_sd !== undefined && (
                          <div className="hint">
                            {prod.business_context?.base_margin_pct !== undefined &&
                              prod.business_context?.base_margin_pct !== null && (
                                <>
                                  {isVi ? 'Lãi gộp' : 'Margin'}{' '}
                                  {prod.business_context.base_margin_pct.toFixed(1)}%
                                </>
                              )}
                            {prod.business_context?.stock_days_cover !== undefined &&
                              prod.business_context?.stock_days_cover !== null && (
                                <>
                                  {' · '}
                                  {isVi ? 'Kho đủ bán' : 'Stock covers'}{' '}
                                  {prod.business_context.stock_days_cover.toFixed(0)}{' '}
                                  {isVi ? 'ngày' : 'd'}
                                </>
                              )}
                          </div>
                        )}
                      </td>

                      <td>
                        <div>
                          <span className="font-semibold tabular-nums">
                            {formatNum(prod.elasticity_median)}%
                          </span>{' '}
                          <span className="text-muted">({rangeText})</span>
                        </div>
                        <RangePlot
                          low={low ?? prod.elasticity_median - 0.3}
                          high={high ?? prod.elasticity_median + 0.3}
                          median={prod.elasticity_median}
                          label={`${prod.product_name}: median ${formatNum(prod.elasticity_median)}, 90% range ${rangeText}`}
                        />
                      </td>

                      <td className="min-w-[180px]">
                        {checks.length === 0 ? (
                          <span className="text-good">
                            {isVi ? 'Số liệu rõ ràng, đáng tin cậy' : 'Clean & reliable'}
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {checks.map((w) => (
                              <li key={w} className="text-[13px] text-warn">
                                {describeWarning(w, lang)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>

                      <td>
                        <label htmlFor={`cost-${prod.product_id}`} className="sr-only">
                          Unit cost for {prod.product_name}
                        </label>
                        <input
                          id={`cost-${prod.product_id}`}
                          type="number"
                          min={0}
                          step={500}
                          value={prod.unit_cost_vnd}
                          onChange={(e) =>
                            onUpdateProduct(prod.product_id, {
                              unit_cost_vnd: Math.max(0, Math.round(Number(e.target.value) || 0)),
                            })
                          }
                          className="field field-num"
                        />
                      </td>

                      <td>
                        <label htmlFor={`fixed-cost-${prod.product_id}`} className="sr-only">
                          Fixed cost for {prod.product_name}
                        </label>
                        <input
                          id={`fixed-cost-${prod.product_id}`}
                          type="number"
                          min={0}
                          step={100000}
                          value={prod.fixed_cost_vnd ?? 0}
                          onChange={(e) =>
                            onUpdateProduct(prod.product_id, {
                              fixed_cost_vnd: Math.max(0, Math.round(Number(e.target.value) || 0)),
                            })
                          }
                          className="field field-num"
                        />
                        {prod.cost_breakdown && (
                          <div className="hint mt-1 text-[11px] leading-tight">
                            {isVi
                              ? `MKT ${formatCompactVND(prod.cost_breakdown.marketing_vnd)} · Nhân công ${formatCompactVND(prod.cost_breakdown.labor_vnd)} · Vận hành ${formatCompactVND(prod.cost_breakdown.operating_vnd)}`
                              : `Ads ${formatCompactVND(prod.cost_breakdown.marketing_vnd)} · Labor ${formatCompactVND(prod.cost_breakdown.labor_vnd)} · Ops ${formatCompactVND(prod.cost_breakdown.operating_vnd)}`}
                          </div>
                        )}
                      </td>

                      <td className="pr-5">
                        <label className="mb-1.5 flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted">
                          <input
                            type="checkbox"
                            checked={isCapped}
                            onChange={(e) =>
                              onUpdateProduct(prod.product_id, {
                                enforce_stock_cap: e.target.checked,
                                stock_available: prod.stock_available ?? prod.baseline_qty_per_period,
                              })
                            }
                            className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
                          />
                          <span>{isVi ? 'Bán tối đa theo kho' : 'Cap by stock'}</span>
                        </label>
                        <label htmlFor={`stock-${prod.product_id}`} className="sr-only">
                          Stock limit for {prod.product_name}
                        </label>
                        <input
                          id={`stock-${prod.product_id}`}
                          type="number"
                          min={0}
                          disabled={!isCapped}
                          value={prod.stock_available ?? ''}
                          placeholder={isVi ? 'Không giới hạn' : 'No limit'}
                          onChange={(e) =>
                            onUpdateProduct(prod.product_id, {
                              stock_available:
                                e.target.value === ''
                                  ? null
                                  : Math.max(0, Math.round(Number(e.target.value) || 0)),
                            })
                          }
                          className="field field-num"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onProceedToWhatIf && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={products.length === 0}
            onClick={onProceedToWhatIf}
            className="btn btn-primary"
          >
            {compact
              ? isVi
                ? 'Áp dụng & tính lại ngay'
                : 'Done & re-simulate'
              : isVi
                ? 'Tiếp tục tính thử'
                : 'Continue to simulation'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AssumptionsScreen;
