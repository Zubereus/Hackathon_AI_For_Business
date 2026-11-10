import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { formatCompactVND, formatInt, formatPct, formatVND, STRINGS } from '../i18n';
import { DataLabel, ProductElasticity, ScenarioMetrics, SimulateResponse } from '../types';

interface WhatIfScreenProps {
  activeLabel: DataLabel;
  products: ProductElasticity[];
  selectedProductId: string;
  priceChangePct: number;
  horizonDays: number;
  seed: number;
  simulationResult: SimulateResponse | null;
  explanationText: string | null;
  fixtureNote: string | null;
  nlqStatus: { type: 'ok' | 'fallback'; message: string } | null;
  loading: boolean;
  nlqLoading: boolean;
  error: string | null;
  onChangeParams: (patch: {
    productId?: string;
    priceChangePct?: number;
    horizonDays?: number;
    seed?: number;
  }) => void;
  onRunSimulate: (override?: { productId?: string; priceChangePct?: number; horizonDays?: number; seed?: number }) => void;
  onParseNLQ: (question: string) => void;
}

const ScenarioCard: React.FC<{
  title: string;
  subtitle: string;
  metrics: ScenarioMetrics;
  baseProfit: number;
  accentClass: string;
  symbol: string;
}> = ({ title, subtitle, metrics, baseProfit, accentClass, symbol }) => {
  const diff = metrics.profit - baseProfit;
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${accentClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-slate-900">
          <span aria-hidden="true" className="mr-1.5">{symbol}</span>
          {title}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">{subtitle}</p>
      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-500">Unit Price</dt>
          <dd className="font-mono font-semibold text-slate-800">{formatVND(metrics.price_vnd ?? null)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Projected Qty</dt>
          <dd className="font-mono font-semibold text-slate-800">{formatInt(metrics.qty)} units</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Revenue</dt>
          <dd className="font-mono font-semibold text-slate-800">{formatVND(metrics.revenue)}</dd>
        </div>
        <div className="flex justify-between pt-1.5 border-t border-slate-100">
          <dt className="font-semibold text-slate-700">Profit</dt>
          <dd className="font-mono font-bold text-slate-900">{formatVND(metrics.profit)}</dd>
        </div>
        {title !== 'Base' && (
          <div className="flex justify-between">
            <dt className="text-slate-500">vs Base</dt>
            <dd className={`font-mono font-semibold ${diff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {diff >= 0 ? '+' : ''}
              {formatVND(diff)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
};

export const WhatIfScreen: React.FC<WhatIfScreenProps> = ({
  activeLabel,
  products,
  selectedProductId,
  priceChangePct,
  horizonDays,
  seed,
  simulationResult,
  explanationText,
  fixtureNote,
  nlqStatus,
  loading,
  nlqLoading,
  error,
  onChangeParams,
  onRunSimulate,
  onParseNLQ,
}) => {
  const [question, setQuestion] = useState(
    'If I increase P01 price by 10% for the next 30 days, what happens to profit?'
  );

  const selectedProduct = products.find((p) => p.product_id === selectedProductId) ?? products[0];
  const histData =
    simulationResult?.profit_distribution.histogram.map((b) => ({
      rangeLabel: formatCompactVND((b.bin_start + b.bin_end) / 2),
      mid: (b.bin_start + b.bin_end) / 2,
      binStart: b.bin_start,
      binEnd: b.bin_end,
      count: b.count,
    })) ?? [];

  const baseProfit = simulationResult?.scenarios.base.profit ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Step 4: What-If Scenario Simulator</h2>
          <p className="text-sm text-slate-600 mt-1">
            Ask a natural-language pricing question or use the manual controls below. Forecasts are bootstrap probability ranges, not guarantees.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {/* Natural Language Box + Always-Visible Manual Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* NLQ Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <label htmlFor="nlq-input" className="block text-sm font-bold text-slate-900 mb-1">
              Ask a Question (Natural Language)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              LLM translates your text into validated parameters only — it never computes numbers.
            </p>
            <textarea
              id="nlq-input"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Discount Áo sơ mi trắng 15% over 30 days?"
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {nlqStatus && (
            <div
              role="status"
              className={`rounded-lg p-2.5 text-xs border ${
                nlqStatus.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-300 text-amber-900'
              }`}
            >
              {nlqStatus.message}
            </div>
          )}

          <button
            type="button"
            disabled={nlqLoading || !question.trim() || products.length === 0}
            onClick={() => onParseNLQ(question)}
            className="w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {nlqLoading ? 'Parsing Question...' : 'Parse & Simulate Question'}
          </button>
        </div>

        {/* Manual Decision Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Manual Simulation Controls (Always Available)</h3>
            <div className="flex gap-1.5">
              {[-20, -10, 0, 10, 20].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onChangeParams({ priceChangePct: preset });
                    onRunSimulate({ priceChangePct: preset });
                  }}
                  className={`px-2 py-0.5 text-xs font-mono rounded border ${
                    priceChangePct === preset
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {formatPct(preset, 0)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sim-product" className="block text-xs font-semibold text-slate-700 mb-1">
                Product SKU
              </label>
              <select
                id="sim-product"
                value={selectedProduct?.product_id ?? ''}
                onChange={(e) => onChangeParams({ productId: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_id} — {p.product_name} ({formatVND(p.current_price_vnd)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sim-price-pct" className="block text-xs font-semibold text-slate-700 mb-1">
                Price Change (%) [-50% to +100%]
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="sim-price-slider"
                  aria-label="Price change percentage slider"
                  type="range"
                  min={-50}
                  max={100}
                  step={1}
                  value={priceChangePct}
                  onChange={(e) => onChangeParams({ priceChangePct: Number(e.target.value) })}
                  className="flex-1"
                />
                <input
                  id="sim-price-pct"
                  type="number"
                  min={-50}
                  max={100}
                  step={1}
                  value={priceChangePct}
                  onChange={(e) =>
                    onChangeParams({
                      priceChangePct: Math.min(100, Math.max(-50, Number(e.target.value) || 0)),
                    })
                  }
                  className="w-20 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono text-right"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sim-horizon" className="block text-xs font-semibold text-slate-700 mb-1">
                Horizon (days) [7–90]
              </label>
              <input
                id="sim-horizon"
                type="number"
                min={7}
                max={90}
                value={horizonDays}
                onChange={(e) =>
                  onChangeParams({
                    horizonDays: Math.min(90, Math.max(7, Math.round(Number(e.target.value) || 30))),
                  })
                }
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
              />
            </div>

            <div>
              <label htmlFor="sim-seed" className="block text-xs font-semibold text-slate-700 mb-1">
                Deterministic Seed
              </label>
              <input
                id="sim-seed"
                type="number"
                value={seed}
                onChange={(e) => onChangeParams({ seed: Math.round(Number(e.target.value) || 42) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={loading || products.length === 0}
              onClick={() => onRunSimulate()}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:bg-slate-300"
            >
              {loading ? 'Running 5,000 Monte Carlo Draws...' : 'Run Simulation'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-300 text-red-900 rounded-lg p-4 text-sm">
          <strong>Simulation error: </strong>
          {error} (Verify numeric inputs or switch to fixture snapshot.)
        </div>
      )}

      {fixtureNote && (
        <div className="bg-slate-100 border border-slate-300 text-slate-700 rounded-lg px-4 py-2.5 text-xs">
          {fixtureNote}
        </div>
      )}

      {simulationResult && (
        <>
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-2.5 text-xs font-medium">
            {STRINGS.disclaimers.rangesNotPromises}
          </div>

          {/* 4 Scenario Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ScenarioCard
              title="Base"
              subtitle="Status quo (0% price change)"
              metrics={simulationResult.scenarios.base}
              baseProfit={baseProfit}
              accentClass="border-slate-300"
              symbol="■"
            />
            <ScenarioCard
              title="Optimistic"
              subtitle="10th pct sensitivity (customers less price-sensitive)"
              metrics={simulationResult.scenarios.optimistic}
              baseProfit={baseProfit}
              accentClass="border-emerald-300 bg-emerald-50/30"
              symbol="▲"
            />
            <ScenarioCard
              title="Expected"
              subtitle="Median estimated price elasticity"
              metrics={simulationResult.scenarios.expected}
              baseProfit={baseProfit}
              accentClass="border-blue-400 bg-blue-50/30"
              symbol="●"
            />
            <ScenarioCard
              title="Pessimistic"
              subtitle="90th pct sensitivity (customers highly price-sensitive)"
              metrics={simulationResult.scenarios.pessimistic}
              baseProfit={baseProfit}
              accentClass="border-red-300 bg-red-50/30"
              symbol="▼"
            />
          </div>

          {/* Distribution Histogram + Break-Even Elasticity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Monte Carlo Profit Distribution
                  </h3>
                  <p className="text-xs text-slate-500">
                    P5 Downside: <strong>{formatVND(simulationResult.profit_distribution.p5)}</strong>
                    {' · '}Median P50: <strong>{formatVND(simulationResult.profit_distribution.p50)}</strong>
                    {' · '}P95 Upside: <strong>{formatVND(simulationResult.profit_distribution.p95)}</strong>
                  </p>
                </div>
              </div>

              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height={250} minWidth={260}>
                  <BarChart data={histData} margin={{ top: 10, right: 16, left: 8, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="rangeLabel"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis width={48} tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val: number) => [`${val} draws`, 'Simulations']}
                      labelFormatter={(lbl) => `Profit ~ ${lbl}`}
                    />
                    <Bar dataKey="count" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                      {histData.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={entry.mid >= baseProfit ? '#2563EB' : '#F59E0B'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Blue bars beat baseline profit ({formatVND(baseProfit)}); amber bars fall below baseline.
              </p>
            </div>

            <div className="lg:col-span-4 space-y-4">
              {/* Break-even elasticity card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-2">Break-Even Elasticity Guardrail</h3>
                {simulationResult.break_even_elasticity !== null &&
                simulationResult.break_even_elasticity !== undefined ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 my-3">
                      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                        <div className="text-[11px] text-slate-500">Break-Even (e*)</div>
                        <div className="text-lg font-bold font-mono text-slate-900">
                          {simulationResult.break_even_elasticity.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <div className="text-[11px] text-blue-700">Estimated Median</div>
                        <div className="text-lg font-bold font-mono text-blue-900">
                          {selectedProduct ? selectedProduct.elasticity_median.toFixed(2) : '—'}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">
                      This price move breaks even at elasticity{' '}
                      <span className="font-mono font-semibold">
                        {simulationResult.break_even_elasticity.toFixed(2)}
                      </span>
                      . Notice that your estimated median elasticity vs e* determines whether expected profit beats baseline.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-600">
                    Break-even elasticity is undefined when price change is 0% or unit cost exceeds selling price (safely returned as null, never NaN).
                  </p>
                )}
              </div>

              {/* Verified Explanation card */}
              {explanationText && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Verified Quantitative Summary</h3>
                  <p className="text-xs text-slate-700 leading-relaxed">{explanationText}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WhatIfScreen;
