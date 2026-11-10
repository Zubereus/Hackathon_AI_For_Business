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
import {
  AlertTriangleIcon,
  CheckIcon,
  InfoIcon,
  ShieldCheckIcon,
  SlidersIcon,
  SparklesIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from '../components/Icons';
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
  icon: React.ReactNode;
}> = ({ title, subtitle, metrics, baseProfit, accentClass, icon }) => {
  const diff = metrics.profit - baseProfit;
  return (
    <div className={`bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all ${accentClass}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">{title}</span>
        </div>
        {title !== 'Base' && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
              diff >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
            }`}
          >
            {diff >= 0 ? '+' : ''}
            {formatCompactVND(diff)}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4 line-clamp-1">{subtitle}</p>
      <dl className="space-y-2 text-xs">
        <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
          <dt>Unit Price</dt>
          <dd className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{formatVND(metrics.price_vnd ?? null)}</dd>
        </div>
        <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
          <dt>Projected Qty</dt>
          <dd className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{formatInt(metrics.qty)} units</dd>
        </div>
        <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
          <dt>Revenue</dt>
          <dd className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{formatVND(metrics.revenue)}</dd>
        </div>
        <div className="flex justify-between items-center pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
          <dt className="font-bold text-slate-900 dark:text-white">Profit</dt>
          <dd className="font-mono font-extrabold text-sm text-slate-950 dark:text-white tabular-nums">{formatVND(metrics.profit)}</dd>
        </div>
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
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Step 4: What-If Scenario Simulator</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Ask a natural-language pricing question or use the manual controls below. Forecasts are bootstrap probability ranges, not promises.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {/* Natural Language Box + Always-Visible Manual Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* NLQ Panel */}
        <div className="lg:col-span-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <SparklesIcon className="w-4 h-4 text-indigo-500" />
              <label htmlFor="nlq-input" className="block text-sm font-bold text-slate-900 dark:text-white tracking-tight">
                Ask a Question (Natural Language)
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              LLM translates your question into validated parameters only — all simulation numbers come from the engine.
            </p>
            <textarea
              id="nlq-input"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Discount Áo sơ mi trắng 15% over 30 days?"
              className="w-full border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm transition-all"
            />
            {/* Quick Suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setQuestion('Increase price by 10% for the next 30 days?')}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700 transition-colors"
              >
                +10% over 30d
              </button>
              <button
                type="button"
                onClick={() => setQuestion('Discount price by 15% over 14 days?')}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700 transition-colors"
              >
                -15% flash sale
              </button>
            </div>
          </div>

          {nlqStatus && (
            <div
              role="status"
              className={`rounded-xl p-3 text-xs border flex items-start gap-2 shadow-sm ${
                nlqStatus.type === 'ok'
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
              }`}
            >
              {nlqStatus.type === 'ok' ? (
                <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{nlqStatus.message}</div>
            </div>
          )}

          <button
            type="button"
            disabled={nlqLoading || !question.trim() || products.length === 0}
            onClick={() => onParseNLQ(question)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4 text-indigo-200" />
            <span>{nlqLoading ? 'Parsing Question...' : 'Parse & Simulate Question'}</span>
          </button>
        </div>

        {/* Manual Decision Form */}
        <div className="lg:col-span-7 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersIcon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Manual Simulation Controls</h3>
            </div>
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200/60 dark:border-slate-700">
              {[-20, -10, 0, 10, 20].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    onChangeParams({ priceChangePct: preset });
                    onRunSimulate({ priceChangePct: preset });
                  }}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all ${
                    priceChangePct === preset
                      ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700'
                  }`}
                >
                  {formatPct(preset, 0)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sim-product" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Product SKU
              </label>
              <select
                id="sim-product"
                value={selectedProduct?.product_id ?? ''}
                onChange={(e) => onChangeParams({ productId: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
              >
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_id} — {p.product_name} ({formatVND(p.current_price_vnd)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="sim-price-pct" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Price Change (%)
                </label>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">[-50% to +100%]</span>
              </div>
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
                  className="w-20 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-mono text-right text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sim-horizon" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-sm"
              />
            </div>

            <div>
              <label htmlFor="sim-seed" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Deterministic Seed
              </label>
              <input
                id="sim-seed"
                type="number"
                value={seed}
                onChange={(e) => onChangeParams({ seed: Math.round(Number(e.target.value) || 42) })}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 shadow-sm"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={loading || products.length === 0}
              onClick={() => onRunSimulate()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              <TargetIcon className="w-4 h-4 text-slate-300 dark:text-indigo-200" />
              <span>{loading ? 'Running 5,000 Monte Carlo Draws...' : 'Run Simulation'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 rounded-xl p-4 text-xs sm:text-sm flex items-start gap-3 shadow-sm">
          <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 shrink-0">
            <AlertTriangleIcon className="w-4 h-4" />
          </div>
          <div>
            <strong className="font-semibold text-rose-950 dark:text-rose-100">Simulation error: </strong>
            <span className="text-rose-800 dark:text-rose-300">{error} (Verify numeric inputs or switch to fixture snapshot.)</span>
          </div>
        </div>
      )}

      {fixtureNote && (
        <div className="bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl px-4 py-2.5 text-xs">
          {fixtureNote}
        </div>
      )}

      {simulationResult && (
        <>
          <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/50 text-amber-950 dark:text-amber-200 rounded-2xl px-4 py-2.5 text-xs font-medium flex items-center gap-2 shadow-sm">
            <InfoIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{STRINGS.disclaimers.rangesNotPromises}</span>
          </div>

          {/* 4 Scenario Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ScenarioCard
              title="Base"
              subtitle="Status quo (0% price change)"
              metrics={simulationResult.scenarios.base}
              baseProfit={baseProfit}
              accentClass="border-slate-200/90 dark:border-slate-800"
              icon={<span className="w-2.5 h-2.5 rounded-sm bg-slate-400 dark:bg-slate-500 inline-block" />}
            />
            <ScenarioCard
              title="Optimistic"
              subtitle="10th pct sensitivity (less price-sensitive)"
              metrics={simulationResult.scenarios.optimistic}
              baseProfit={baseProfit}
              accentClass="border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20"
              icon={<TrendingUpIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            />
            <ScenarioCard
              title="Expected"
              subtitle="Median estimated price elasticity"
              metrics={simulationResult.scenarios.expected}
              baseProfit={baseProfit}
              accentClass="border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20"
              icon={<TargetIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
            />
            <ScenarioCard
              title="Pessimistic"
              subtitle="90th pct sensitivity (highly price-sensitive)"
              metrics={simulationResult.scenarios.pessimistic}
              baseProfit={baseProfit}
              accentClass="border-rose-200 dark:border-rose-800/60 bg-rose-50/30 dark:bg-rose-950/20"
              icon={<TrendingDownIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
            />
          </div>

          {/* Distribution Histogram + Break-Even Elasticity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    Monte Carlo Profit Distribution
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                      P5 Downside: <strong className="text-slate-900 dark:text-white">{formatVND(simulationResult.profit_distribution.p5)}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 font-mono">
                      Median P50: <strong className="text-indigo-950 dark:text-indigo-200">{formatVND(simulationResult.profit_distribution.p50)}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                      P95 Upside: <strong className="text-slate-900 dark:text-white">{formatVND(simulationResult.profit_distribution.p95)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height={250} minWidth={260}>
                  <BarChart data={histData} margin={{ top: 10, right: 16, left: 8, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                    <XAxis
                      dataKey="rangeLabel"
                      tick={{ fontSize: 10, fill: '#94A3B8' }}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis width={48} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-slate-900/95 dark:bg-slate-950/95 text-white rounded-xl p-2.5 text-xs shadow-xl backdrop-blur-md border border-slate-700">
                            <p className="text-slate-400 font-mono text-[10px]">Profit ~ {data.rangeLabel}</p>
                            <p className="font-bold text-sm mt-0.5">{data.count} draws</p>
                            <p className="text-[10px] mt-1 text-slate-300">
                              {data.mid >= baseProfit ? '✓ Above status quo' : '▼ Below status quo'}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" isAnimationActive={false} radius={[4, 4, 0, 0]}>
                      {histData.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={entry.mid >= baseProfit ? '#6366f1' : '#f59e0b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400 mt-2 px-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block shadow-[0_0_6px_rgba(99,102,241,0.5)]" />
                  <span>Beats baseline profit ({formatVND(baseProfit)})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                  <span>Falls below baseline</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              {/* Break-even elasticity card */}
              <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheckIcon className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Break-Even Elasticity Guardrail</h3>
                </div>
                {simulationResult.break_even_elasticity !== null &&
                simulationResult.break_even_elasticity !== undefined ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 my-3">
                      <div className="bg-slate-50/90 dark:bg-slate-950/80 rounded-xl p-3 border border-slate-200/70 dark:border-slate-800">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Break-Even (e*)</div>
                        <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                          {simulationResult.break_even_elasticity.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-indigo-50/90 dark:bg-indigo-950/60 rounded-xl p-3 border border-indigo-200/70 dark:border-indigo-900/60">
                        <div className="text-[11px] text-indigo-700 dark:text-indigo-300">Estimated Median</div>
                        <div className="text-lg font-bold font-mono text-indigo-900 dark:text-indigo-200">
                          {selectedProduct ? selectedProduct.elasticity_median.toFixed(2) : '—'}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      This price move breaks even at elasticity{' '}
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {simulationResult.break_even_elasticity.toFixed(2)}
                      </span>
                      . When customer sensitivity is stronger than e*, profit falls.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Break-even elasticity is undefined when price change is 0% or unit cost exceeds selling price.
                  </p>
                )}
              </div>

              {/* Verified Explanation card */}
              {explanationText && (
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <SparklesIcon className="w-4 h-4 text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Verified Quantitative Summary</h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{explanationText}</p>
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
