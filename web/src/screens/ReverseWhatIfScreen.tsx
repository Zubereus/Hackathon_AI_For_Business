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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Step 5: Reverse What-If Price Optimizer
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Specify a business target (e.g. +10% profit uplift) and constraints; Go evaluates the price grid to rank feasible prices by expected profit and target probability.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="opt-product" className="block text-xs font-semibold text-slate-700 mb-1">
            Product SKU
          </label>
          <select
            id="opt-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_id} — {p.product_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="opt-objective" className="block text-xs font-semibold text-slate-700 mb-1">
            Objective
          </label>
          <select
            id="opt-objective"
            value={objective}
            onChange={(e) =>
              setObjective(e.target.value as 'max_expected_profit' | 'hit_target')
            }
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="hit_target">Maximize P(Hit Profit Target)</option>
            <option value="max_expected_profit">Maximize Expected Profit</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-target" className="block text-xs font-semibold text-slate-700 mb-1">
            Target Profit Uplift (%)
          </label>
          <input
            id="opt-target"
            type="number"
            step={1}
            value={targetUpliftPct}
            onChange={(e) => setTargetUpliftPct(Number(e.target.value) || 0)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <label htmlFor="opt-max-change" className="block text-xs font-semibold text-slate-700 mb-1">
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
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <label htmlFor="opt-min-margin" className="block text-xs font-semibold text-slate-700 mb-1">
            Minimum Gross Margin (%)
          </label>
          <input
            id="opt-min-margin"
            type="number"
            min={0}
            max={90}
            value={minMarginPct}
            onChange={(e) => setMinMarginPct(Number(e.target.value) || 0)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <label htmlFor="opt-budget" className="block text-xs font-semibold text-slate-700 mb-1">
            Markdown Subsidy Budget (VND, optional)
          </label>
          <input
            id="opt-budget"
            type="number"
            min={0}
            step={500000}
            placeholder="No cap"
            value={budgetVnd}
            onChange={(e) => setBudgetVnd(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
          />
        </div>

        <div>
          <label htmlFor="opt-seed" className="block text-xs font-semibold text-slate-700 mb-1">
            Deterministic Seed
          </label>
          <input
            id="opt-seed"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Math.round(Number(e.target.value) || 42))}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
          />
        </div>

        <div className="flex flex-col justify-between">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 mt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={respectStock}
              onChange={(e) => setRespectStock(e.target.checked)}
            />
            Respect period stock cap
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
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
          >
            {loading ? 'Optimizing Grid...' : 'Find Optimal Prices'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-300 text-red-900 rounded-lg p-4 text-sm">
          <strong>Optimization error: </strong>
          {error}
        </div>
      )}

      {fixtureNote && (
        <div className="bg-slate-100 border border-slate-300 text-slate-700 rounded-lg px-4 py-2.5 text-xs">
          {fixtureNote}
        </div>
      )}

      {optimizeResult && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-3">
              Expected Profit vs Downside (P5) Across Price Grid
            </h3>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height={240} minWidth={260}>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 12, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="pct" tick={{ fontSize: 10 }} interval={4} />
                  <YAxis width={84} tickFormatter={(v: number) => formatCompactVND(v)} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(val: number) => formatVND(val)} />
                  <Line
                    type="monotone"
                    dataKey="expectedProfit"
                    name="Expected Profit"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p5Profit"
                    name="P5 Downside"
                    stroke="#D97706"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Rank</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Candidate Price</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Change %</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Expected Profit</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Downside (P5)</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">P(Hit Target)</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Feasibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {optimizeResult.ranked.slice(0, 15).map((opt, idx) => (
                  <tr key={`${opt.price_vnd}-${idx}`} className={idx === 0 ? 'bg-blue-50/40' : ''}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">#{idx + 1}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">
                      {formatVND(opt.price_vnd)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">
                      {formatPct(opt.price_change_pct, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {formatVND(opt.expected_profit)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {formatVND(opt.p5_profit)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                      {(opt.prob_hit_target * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5">
                      {opt.feasible ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                          ✓ Feasible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-800 border border-red-300">
                          ✕ {opt.violated.join('; ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default ReverseWhatIfScreen;
