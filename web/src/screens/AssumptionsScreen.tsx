import React from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Step 3: Review Elasticity Estimates & Cost Assumptions
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Inspect bootstrap 90% confidence intervals and reliability flags before simulating price changes. Any edits to unit cost, fixed cost, or stock flow directly into simulations.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {/* Honest Method Disclaimer */}
      <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-4 text-sm flex items-start gap-3">
        <span className="font-bold" aria-hidden="true">ℹ</span>
        <div>
          <p className="font-semibold">Econometric Scope Note</p>
          <p>{STRINGS.disclaimers.observational}</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-600">
          No fitted products loaded yet. Return to Upload Data to load a CSV or demo dataset.
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((prod) => {
            const p05 = sampleQuantile(prod.elasticity_samples, 0.05);
            const p95 = sampleQuantile(prod.elasticity_samples, 0.95);
            const warnList = prod.warnings ?? [];
            const isCapped = Boolean(prod.enforce_stock_cap && prod.stock_available !== null);

            return (
              <div
                key={prod.product_id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-slate-100 text-slate-800 rounded">
                        {prod.product_id}
                      </span>
                      <h3 className="text-base font-bold text-slate-900">{prod.product_name}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Current price: <strong className="text-slate-800">{formatVND(prod.current_price_vnd)}</strong>
                      {' · '}Baseline 30d demand: <strong className="text-slate-800">{formatInt(prod.baseline_qty_per_period)} units</strong>
                      {prod.price_variation_sd !== undefined && (
                        <>
                          {' · '}Price log-SD: <span className="font-mono">{prod.price_variation_sd.toFixed(3)}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Elasticity & 90% CI Readout */}
                  <div className="text-right">
                    <div className="text-xs text-slate-500 uppercase font-semibold">
                      Estimated Price Elasticity
                    </div>
                    <div className="text-lg font-bold font-mono text-slate-900">
                      {prod.elasticity_median.toFixed(2)}
                      <span className="text-xs font-normal text-slate-500 ml-2">
                        90% CI [{p05 !== null ? p05.toFixed(2) : '—'}, {p95 !== null ? p95.toFixed(2) : '—'}]
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">SE = {prod.elasticity_se.toFixed(3)}</div>
                  </div>
                </div>

                {/* Warning Chips */}
                <div className="flex flex-wrap gap-2">
                  {prod.significant === false && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-800 border border-red-300">
                      <span aria-hidden="true">⚠</span> Not statistically significant (p ≥ 0.05)
                    </span>
                  )}
                  {warnList.length === 0 && prod.significant !== false ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                      <span aria-hidden="true">✓</span> Healthy price signal
                    </span>
                  ) : (
                    warnList.map((w, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300"
                      >
                        <span aria-hidden="true">▲</span> {w}
                      </span>
                    ))
                  )}
                </div>

                {/* Editable Cost / Fixed Cost / Stock Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
                  <div>
                    <label
                      htmlFor={`cost-${prod.product_id}`}
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Unit Cost (VND)
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
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`fixed-cost-${prod.product_id}`}
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Fixed Cost / Promo Overhead (VND)
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
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor={`stock-${prod.product_id}`}
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Period Stock Ceiling (units)
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
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
                        />
                        Enforce cap
                      </label>
                    </div>
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
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={products.length === 0}
          onClick={onProceedToWhatIf}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
        >
          Proceed to What-If Simulation →
        </button>
      </div>
    </div>
  );
};

export default AssumptionsScreen;

