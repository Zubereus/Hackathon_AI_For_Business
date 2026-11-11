import React from 'react';
import { Notice, PageHeader } from '../components/Page';
import { describeWarning, formatInt, formatNum, formatVND, STRINGS } from '../i18n';
import { ProductElasticity } from '../types';

interface AssumptionsScreenProps {
  products: ProductElasticity[];
  onUpdateProduct: (productId: string, patch: Partial<ProductElasticity>) => void;
  onProceedToWhatIf: () => void;
}

function sampleQuantile(samples: number[], q: number): number | null {
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

const RangePlot: React.FC<{ low: number; high: number; median: number; label: string }> = ({
  low,
  high,
  median,
  label,
}) => {
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
  products,
  onUpdateProduct,
  onProceedToWhatIf,
}) => {
  return (
    <div>
      <PageHeader title="Assumptions">
        Check how sensitive each product is to price, and correct costs and stock where the data
        is wrong. Your edits carry into the simulation.
      </PageHeader>

      <Notice>
        {STRINGS.disclaimers.observational} Sensitivity (elasticity) of −1.2 means a 1% price rise
        lowers units sold by about 1.2%.
      </Notice>

      {products.length === 0 ? (
        <p className="mt-8 text-muted">
          No products yet. Go back to Upload data and load a file or a sample dataset.
        </p>
      ) : (
        <div className="panel mt-8 overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead className="bg-sunken">
                <tr>
                  <th scope="col" className="pl-5">
                    Product
                  </th>
                  <th scope="col" className="w-[260px]">
                    <div>Price sensitivity, median and 90% range</div>
                    <div className="relative mt-1 h-4 font-normal">
                      {SCALE_TICKS.map((t) => (
                        <span
                          key={t}
                          className="absolute -translate-x-1/2 text-[12px]"
                          style={{ left: `${scalePct(t)}%` }}
                        >
                          {formatNum(t, 0)}
                        </span>
                      ))}
                    </div>
                  </th>
                  <th scope="col">Data checks</th>
                  <th scope="col" className="w-[130px]">
                    Unit cost (₫)
                  </th>
                  <th scope="col" className="w-[130px]">
                    Fixed cost (₫)
                  </th>
                  <th scope="col" className="w-[150px] pr-5">
                    Stock limit (units)
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
                      ? `${formatNum(low)} to ${formatNum(high)}`
                      : 'range unavailable';

                  return (
                    <tr key={prod.product_id}>
                      <td className="pl-5">
                        <div className="font-semibold">{prod.product_name}</div>
                        <div className="hint">
                          {prod.product_id} · {formatVND(prod.current_price_vnd)} ·{' '}
                          {formatInt(prod.baseline_qty_per_period)} units per period
                        </div>
                        {prod.price_variation_sd !== undefined && (
                          <div className="hint">
                            Price variation {prod.price_variation_sd.toFixed(3)}
                          </div>
                        )}
                      </td>

                      <td>
                        <div>
                          <span className="font-semibold">{formatNum(prod.elasticity_median)}</span>{' '}
                          <span className="text-muted">({rangeText})</span>
                        </div>
                        <RangePlot
                          low={low ?? prod.elasticity_median - 0.3}
                          high={high ?? prod.elasticity_median + 0.3}
                          median={prod.elasticity_median}
                          label={`${prod.product_name}: median ${formatNum(prod.elasticity_median)}, 90% range ${rangeText}`}
                        />
                      </td>

                      <td className="min-w-[170px]">
                        {checks.length === 0 ? (
                          <span className="text-muted">No issues</span>
                        ) : (
                          <ul className="space-y-1">
                            {checks.map((w) => (
                              <li key={w} className="text-warn">
                                {describeWarning(w)}
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
                          <span>Limit sales</span>
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
                          placeholder="No limit"
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

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          disabled={products.length === 0}
          onClick={onProceedToWhatIf}
          className="btn btn-primary"
        >
          Continue to simulation
        </button>
      </div>
    </div>
  );
};

export default AssumptionsScreen;
