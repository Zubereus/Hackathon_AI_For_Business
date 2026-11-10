import React, { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataSourceBadge } from '../components/DataSourceBadge';
import {
  AlertTriangleIcon,
  CheckIcon,
  TargetIcon,
  XIcon,
} from '../components/Icons';
import { formatCompactVND, formatPct, formatVND } from '../i18n';
import { DataLabel, OptimizeResponse, ProductElasticity } from '../types';

interface ReverseWhatIfScreenProps {
  activeLabel: DataLabel;
  products: ProductElasticity[];
  selectedProductId: string;
  optimizeResult: OptimizeResponse | null;
  fixtureNote: string | null;
  loading: boolean;
  error: string | null;
  onRunOptimize: (params: {
    productId: string;
    objective: 'max_expected_profit' | 'hit_target';
    targetProfitUpliftPct: number;
    maxPriceChangePct: number;
    minMarginPct: number | null;
    budgetVnd: number | null;
    respectStock: boolean;
    seed: number;
  }) => void;
}

export const ReverseWhatIfScreen: React.FC<ReverseWhatIfScreenProps> = ({
  activeLabel,
  products,
  selectedProductId,
  optimizeResult,
  fixtureNote,
  loading,
  error,
  onRunOptimize,
}) => {
  const [productId, setProductId] = useState(selectedProductId || products[0]?.product_id || 'P01');
  const [objective, setObjective] = useState<'max_expected_profit' | 'hit_target'>('hit_target');
  const [targetUpliftPct, setTargetUpliftPct] = useState(10);
  const [maxPriceChangePct, setMaxPriceChangePct] = useState(30);
  const [minMarginPct, setMinMarginPct] = useState(25);
  const [budgetVnd, setBudgetVnd] = useState<string>('');
  const [respectStock, setRespectStock] = useState(false);
  const [seed, setSeed] = useState(42);

  const chartData =
    optimizeResult?.ranked
      ? [...optimizeResult.ranked]
          .sort((a, b) => a.price_change_pct - b.price_change_pct)
          .map((r) => ({
            pct: `${r.price_change_pct}%`,
            expectedProfit: r.expected_profit,
            p5Profit: r.p5_profit,
            feasible: r.feasible,
          }))
      : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Step 5: Reverse What-If Price Optimizer
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Specify a target profit uplift and business constraints. The engine evaluates candidate prices across the grid to rank solutions by probability of hitting your target.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {/* Controls */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="opt-product" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Product SKU
          </label>
          <select
            id="opt-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
          >
            {products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_id} — {p.product_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="opt-objective" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Objective
          </label>
          <select
            id="opt-objective"
            value={objective}
            onChange={(e) =>
              setObjective(e.target.value as 'max_expected_profit' | 'hit_target')
            }
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="hit_target">Maximize P(Hit Profit Target)</option>
            <option value="max_expected_profit">Maximize Expected Profit</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-target" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Target Profit Uplift (%)
          </label>
          <input
            id="opt-target"
            type="number"
            step={1}
            value={targetUpliftPct}
            onChange={(e) => setTargetUpliftPct(Number(e.target.value) || 0)}
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="opt-max-change" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Max Price Change (±%)
          </label>
          <input
            id="opt-max-change"
            type="number"
            min={5}
            max={50}
            value={maxPriceChangePct}
            onChange={(e) =>
              setMaxPriceChangePct(Math.min(50, Math.max(5, Number(e.target.value) || 30)))
            }
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="opt-min-margin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Minimum Gross Margin (%)
          </label>
          <input
            id="opt-min-margin"
            type="number"
            min={0}
            max={90}
            value={minMarginPct}
            onChange={(e) => setMinMarginPct(Number(e.target.value) || 0)}
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="opt-budget" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Markdown Budget (VND, opt)
          </label>
          <input
            id="opt-budget"
            type="number"
            min={0}
            step={500000}
            placeholder="No cap"
            value={budgetVnd}
            onChange={(e) => setBudgetVnd(e.target.value)}
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="opt-seed" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Deterministic Seed
          </label>
          <input
            id="opt-seed"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Math.round(Number(e.target.value) || 42))}
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm"
          />
        </div>

        <div className="flex flex-col justify-between pt-1">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={respectStock}
              onChange={(e) => setRespectStock(e.target.checked)}
              className="rounded text-indigo-600 border-slate-300 dark:border-slate-600 focus:ring-indigo-500"
            />
            <span>Respect period stock cap</span>
          </label>
          <button
            type="button"
            disabled={loading || products.length === 0}
            onClick={() =>
              onRunOptimize({
                productId,
                objective,
                targetProfitUpliftPct: targetUpliftPct,
                maxPriceChangePct,
                minMarginPct: minMarginPct > 0 ? minMarginPct : null,
                budgetVnd: budgetVnd.trim() ? Math.round(Number(budgetVnd)) : null,
                respectStock,
                seed,
              })
            }
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            <TargetIcon className="w-3.5 h-3.5" />
            <span>{loading ? 'Optimizing Grid...' : 'Find Optimal Prices'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 rounded-xl p-4 text-xs sm:text-sm flex items-start gap-3 shadow-sm">
          <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 shrink-0">
            <AlertTriangleIcon className="w-4 h-4" />
          </div>
          <div>
            <strong className="font-semibold text-rose-950 dark:text-rose-100">Optimization error: </strong>
            <span className="text-rose-800 dark:text-rose-300">{error}</span>
          </div>
        </div>
      )}

      {fixtureNote && (
        <div className="bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 text-xs">
          {fixtureNote}
        </div>
      )}

      {optimizeResult && (
        <>
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Expected Profit vs Downside (P5) Across Price Grid
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Visual curve of expected return and risk across simulated price candidates.
                </p>
              </div>
            </div>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height={240} minWidth={260}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 12, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="pct" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={4} axisLine={{ stroke: '#475569' }} />
                  <YAxis width={84} tickFormatter={(v: number) => formatCompactVND(v)} tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      return (
                        <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white rounded-xl p-2.5 text-xs shadow-xl backdrop-blur-md border border-slate-700">
                          <p className="font-mono text-[10px] text-slate-400">Price Move: {payload[0]?.payload?.pct}</p>
                          <p className="font-bold text-sm text-indigo-300 mt-0.5">
                            Expected: {formatVND(payload[0]?.value as number)}
                          </p>
                          <p className="text-amber-300 text-xs">
                            P5 Downside: {formatVND(payload[1]?.value as number)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedProfit"
                    name="Expected Profit"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p5Profit"
                    name="P5 Downside"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800 text-sm">
                <thead className="bg-slate-50/75 dark:bg-slate-950/70">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Rank</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Candidate Price</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Change %</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Expected Profit</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Downside (P5)</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">P(Hit Target)</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Feasibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {optimizeResult.ranked.slice(0, 15).map((opt, idx) => (
                    <tr key={`${opt.price_vnd}-${idx}`} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${idx === 0 ? 'bg-indigo-50/30 dark:bg-indigo-950/30 font-medium' : ''}`}>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400 dark:text-slate-500">
                        {idx === 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px]">#1</span>
                        ) : (
                          `#${idx + 1}`
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatVND(opt.price_vnd)}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatPct(opt.price_change_pct, 1)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatVND(opt.expected_profit)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        {formatVND(opt.p5_profit)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-indigo-900 dark:text-indigo-400 tabular-nums">
                        {(opt.prob_hit_target * 100).toFixed(1)}%
                      </td>
                      <td className="px-5 py-3">
                        {opt.feasible ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                            <CheckIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Feasible</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50">
                            <XIcon className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                            <span>{opt.violated.join('; ')}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReverseWhatIfScreen;
