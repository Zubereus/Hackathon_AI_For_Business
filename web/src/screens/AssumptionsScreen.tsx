import React from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { AlertTriangleIcon, ArrowRightIcon, CheckIcon, InfoIcon } from '../components/Icons';
import { formatInt, formatVND, STRINGS } from '../i18n';
import { DataLabel, ProductElasticity } from '../types';

interface AssumptionsScreenProps {
  activeLabel: DataLabel;
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

export const AssumptionsScreen: React.FC<AssumptionsScreenProps> = ({
  activeLabel,
  products,
  onUpdateProduct,
  onProceedToWhatIf,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Step 3: Review Elasticity Estimates & Cost Assumptions
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Inspect bootstrap 90% confidence intervals and reliability flags before simulating price changes. Any edits to unit cost, fixed cost, or stock caps flow directly into scenario forecasts.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {/* Honest Method Disclaimer */}
      <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/50 text-indigo-950 dark:text-indigo-200 rounded-2xl p-4 text-xs sm:text-sm flex items-start gap-3 shadow-sm">
        <div className="p-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">
          <InfoIcon className="w-4 h-4" />
        </div>
        <div>
          <p className="font-bold text-indigo-950 dark:text-indigo-100">Econometric Scope Note</p>
          <p className="text-indigo-900/85 dark:text-indigo-300/85 text-xs mt-0.5 leading-relaxed">{STRINGS.disclaimers.observational}</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-10 text-center text-slate-500 dark:text-slate-400 shadow-sm">
          No fitted products loaded yet. Return to Upload Data to load a CSV or demo dataset.
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((prod) => {
            const p05 = sampleQuantile(prod.elasticity_samples, 0.05);
            const p95 = sampleQuantile(prod.elasticity_samples, 0.95);
            const warnList = prod.warnings ?? [];
            const isCapped = Boolean(prod.enforce_stock_cap && prod.stock_available !== null);

            // Compute visual CI bar positions mapping [-3.5, 0.5] onto [0%, 100%]
            const minScale = -3.5;
            const maxScale = 0.5;
            const span = maxScale - minScale;
            const getPct = (v: number) => Math.min(100, Math.max(0, ((v - minScale) / span) * 100));
            const leftPct = p05 !== null ? getPct(p05) : getPct(prod.elasticity_median - 0.3);
            const rightPct = p95 !== null ? getPct(p95) : getPct(prod.elasticity_median + 0.3);
            const medianPct = getPct(prod.elasticity_median);

            return (
              <div
                key={prod.product_id}
                className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 rounded-2xl p-5 shadow-sm transition-all space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-900 dark:bg-indigo-600 text-white rounded-lg shadow-sm">
                        {prod.product_id}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{prod.product_name}</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Current price: <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatVND(prod.current_price_vnd)}</strong></span>
                      <span className="text-slate-300 dark:text-slate-700">•</span>
                      <span>Baseline demand: <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatInt(prod.baseline_qty_per_period)} units / period</strong></span>
                      {prod.price_variation_sd !== undefined && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span>Price log-SD: <span className="font-mono text-slate-700 dark:text-slate-300">{prod.price_variation_sd.toFixed(3)}</span></span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Elasticity Readout */}
                  <div className="text-right sm:min-w-[200px]">
                    <div className="text-[11px] text-slate-400 dark:text-slate-400 uppercase tracking-wider font-semibold">
                      Price Elasticity (Median)
                    </div>
                    <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tracking-tight mt-0.5">
                      {prod.elasticity_median.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      90% CI: [{p05 !== null ? p05.toFixed(2) : '—'}, {p95 !== null ? p95.toFixed(2) : '—'}] · SE={prod.elasticity_se.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Tactile Visual Confidence Interval Meter */}
                <div className="bg-slate-50/80 dark:bg-slate-950/60 rounded-xl p-3 border border-slate-200/60 dark:border-slate-800/80">
                  <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mb-1">
                    <span>High Sensitivity (-3.5)</span>
                    <span className="text-slate-600 dark:text-slate-300 font-semibold">Estimated 90% Confidence Interval Band</span>
                    <span>Inelastic (0.0)</span>
                  </div>
                  <div className="relative w-full h-3 bg-slate-200/70 dark:bg-slate-800 rounded-full overflow-hidden">
                    {/* Confidence Interval shaded band */}
                    <div
                      className="absolute top-0 bottom-0 bg-indigo-300 dark:bg-indigo-500/50 rounded-full"
                      style={{
                        left: `${Math.min(leftPct, rightPct)}%`,
                        width: `${Math.abs(rightPct - leftPct)}%`,
                      }}
                    />
                    {/* Median marker dot */}
                    <div
                      className="absolute top-0 bottom-0 w-2.5 h-2.5 my-auto bg-indigo-600 dark:bg-indigo-400 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-sm"
                      style={{
                        left: `calc(${medianPct}% - 5px)`,
                      }}
                      title={`Median: ${prod.elasticity_median.toFixed(2)}`}
                    />
                  </div>
                </div>

                {/* Warning / Quality Chips */}
                <div className="flex flex-wrap gap-2">
                  {prod.significant === false && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50">
                      <AlertTriangleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Not statistically significant (p ≥ 0.05)</span>
                    </span>
                  )}
                  {warnList.length === 0 && prod.significant !== false ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                      <CheckIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Healthy price variation signal</span>
                    </span>
                  ) : (
                    warnList.map((w, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50"
                      >
                        <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>{w}</span>
                      </span>
                    ))
                  )}
                </div>

                {/* Editable Cost / Fixed Cost / Stock Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3.5 border-t border-slate-100 dark:border-slate-800/80">
                  <div>
                    <label
                      htmlFor={`cost-${prod.product_id}`}
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Unit Cost (VND)
                    </label>
                    <div className="relative">
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
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/90 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <span className="absolute right-3 top-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono pointer-events-none">₫</span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`fixed-cost-${prod.product_id}`}
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Fixed Cost / Overhead (VND)
                    </label>
                    <div className="relative">
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
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/90 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <span className="absolute right-3 top-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono pointer-events-none">₫</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor={`stock-${prod.product_id}`}
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Stock Ceiling (units)
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isCapped}
                          onChange={(e) =>
                            onUpdateProduct(prod.product_id, {
                              enforce_stock_cap: e.target.checked,
                              stock_available:
                                prod.stock_available ?? prod.baseline_qty_per_period,
                            })
                          }
                          className="rounded text-indigo-600 border-slate-300 dark:border-slate-600 focus:ring-indigo-500"
                        />
                        <span>Enforce cap</span>
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        id={`stock-${prod.product_id}`}
                        type="number"
                        min={0}
                        disabled={!isCapped}
                        value={prod.stock_available ?? ''}
                        placeholder="Unlimited restocking"
                        onChange={(e) =>
                          onUpdateProduct(prod.product_id, {
                            stock_available:
                              e.target.value === ''
                                ? null
                                : Math.max(0, Math.round(Number(e.target.value) || 0)),
                          })
                        }
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/90 shadow-sm disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={products.length === 0}
          onClick={onProceedToWhatIf}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl shadow-md shadow-indigo-600/20 transition-all disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
        >
          <span>Proceed to What-If Simulation</span>
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default AssumptionsScreen;
