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
import { Notice, PageHeader } from '../components/Page';
import { formatCompactVND, formatInt, formatNum, formatPct, formatVND, STRINGS } from '../i18n';
import { ProductElasticity, SimulateResponse } from '../types';

interface WhatIfScreenProps {
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
  onRunSimulate: (override?: {
    productId?: string;
    priceChangePct?: number;
    horizonDays?: number;
    seed?: number;
  }) => void;
  onParseNLQ: (question: string) => void;
}

const SCENARIOS = [
  { key: 'base', name: 'Baseline', note: 'No price change' },
  { key: 'optimistic', name: 'Optimistic', note: 'Customers less price-sensitive (10th percentile)' },
  { key: 'expected', name: 'Expected', note: 'Median estimated sensitivity' },
  { key: 'pessimistic', name: 'Pessimistic', note: 'Customers more price-sensitive (90th percentile)' },
] as const;

const PRESETS = [-20, -10, 0, 10, 20];

export const WhatIfScreen: React.FC<WhatIfScreenProps> = ({
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
      count: b.count,
    })) ?? [];

  const baseProfit = simulationResult?.scenarios.base.profit ?? 0;

  return (
    <div>
      <PageHeader title="What-if simulation">
        Test a price change and see the range of likely outcomes before you make it.
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="ask" className="panel flex flex-col p-5">
          <h2 id="ask" className="h2">
            <label htmlFor="nlq-input">Ask a question</label>
          </h2>
          <p className="hint mt-1">
            The language model only turns your question into fields. All numbers come from the
            engine.
          </p>
          <textarea
            id="nlq-input"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="For example: cut Áo sơ mi trắng by 15% for 30 days"
            className="field mt-3"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setQuestion('Increase price by 10% for the next 30 days?')}
              className="btn btn-quiet rounded border border-rule"
            >
              +10% for 30 days
            </button>
            <button
              type="button"
              onClick={() => setQuestion('Discount price by 15% over 14 days?')}
              className="btn btn-quiet rounded border border-rule"
            >
              −15% for 14 days
            </button>
          </div>

          {nlqStatus && (
            <div className="mt-3">
              <Notice tone={nlqStatus.type === 'ok' ? 'info' : 'warn'} role="status">
                {nlqStatus.message}
              </Notice>
            </div>
          )}

          <div className="mt-auto pt-4">
            <button
              type="button"
              disabled={nlqLoading || !question.trim() || products.length === 0}
              onClick={() => onParseNLQ(question)}
              className="btn btn-primary w-full"
            >
              {nlqLoading ? 'Reading question…' : 'Read question and simulate'}
            </button>
          </div>
        </section>

        <section aria-labelledby="manual" className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="manual" className="h2">
              Set it yourself
            </h2>
            <div role="group" aria-label="Price change presets" className="flex gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={priceChangePct === preset}
                  onClick={() => {
                    onChangeParams({ priceChangePct: preset });
                    onRunSimulate({ priceChangePct: preset });
                  }}
                  className={`rounded border px-2.5 py-1 text-[13px] font-medium transition-colors ${
                    priceChangePct === preset
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-rule-strong text-ink hover:bg-sunken'
                  }`}
                >
                  {formatPct(preset, 0).replace('-', '−')}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sim-product" className="label">
                Product
              </label>
              <select
                id="sim-product"
                value={selectedProduct?.product_id ?? ''}
                onChange={(e) => onChangeParams({ productId: e.target.value })}
                className="field"
              >
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_id}, {p.product_name} ({formatVND(p.current_price_vnd)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sim-price-pct" className="label">
                Price change (%)
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
                  className="field field-num w-20"
                />
              </div>
            </div>

            <div>
              <label htmlFor="sim-horizon" className="label">
                Horizon (days)
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
                className="field"
              />
              <p className="hint mt-1">From 7 to 90 days.</p>
            </div>

            <div>
              <label htmlFor="sim-seed" className="label">
                Random seed
              </label>
              <input
                id="sim-seed"
                type="number"
                value={seed}
                onChange={(e) => onChangeParams({ seed: Math.round(Number(e.target.value) || 42) })}
                className="field"
              />
              <p className="hint mt-1">The same seed gives the same result.</p>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={loading || products.length === 0}
              onClick={() => onRunSimulate()}
              className="btn btn-primary"
            >
              {loading ? 'Simulating…' : 'Run simulation'}
            </button>
          </div>
        </section>
      </div>

      {error && (
        <div className="mt-6">
          <Notice tone="error" title="The simulation did not run.">
            {error} Check the numbers you entered, or turn on offline mode.
          </Notice>
        </div>
      )}

      {fixtureNote && <p className="hint mt-4">{fixtureNote}</p>}

      {simulationResult && (
        <>
          <section aria-labelledby="result" className="mt-12">
            <h2 id="result" className="h2">
              Result
            </h2>
            {explanationText && (
              <p className="mt-3 max-w-[68ch] text-[17px] leading-snug">{explanationText}</p>
            )}
            <p className="hint mt-3">{STRINGS.disclaimers.rangesNotPromises}</p>

            <div className="panel mt-5 overflow-hidden">
              <div className="relative overflow-x-auto">
                <table className="data-table min-w-[720px]">
                  <thead className="bg-sunken">
                    <tr>
                      <th scope="col" className="pl-5">
                        Scenario
                      </th>
                      <th scope="col" className="num">
                        Price
                      </th>
                      <th scope="col" className="num">
                        Units
                      </th>
                      <th scope="col" className="num">
                        Revenue
                      </th>
                      <th scope="col" className="num">
                        Profit
                      </th>
                      <th scope="col" className="num pr-5">
                        Profit vs baseline
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SCENARIOS.map((sc) => {
                      const m = simulationResult.scenarios[sc.key];
                      const diff = m.profit - baseProfit;
                      const isExpected = sc.key === 'expected';
                      return (
                        <tr key={sc.key} className={isExpected ? 'bg-sunken/60' : ''}>
                          <th scope="row" className="pl-5">
                            <div className="font-semibold">{sc.name}</div>
                            <div className="hint font-normal">{sc.note}</div>
                          </th>
                          <td className="num">{formatVND(m.price_vnd ?? null)}</td>
                          <td className="num">{formatInt(m.qty)}</td>
                          <td className="num">{formatVND(m.revenue)}</td>
                          <td className={`num ${isExpected ? 'font-semibold' : ''}`}>
                            {formatVND(m.profit)}
                          </td>
                          <td
                            className={`num pr-5 ${
                              sc.key === 'base' ? 'text-muted' : diff >= 0 ? 'text-good' : 'text-bad'
                            }`}
                          >
                            {sc.key === 'base'
                              ? '—'
                              : `${diff >= 0 ? '+' : '−'}${formatCompactVND(Math.abs(diff))}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-labelledby="distribution">
              <h2 id="distribution" className="h2">
                Profit across simulated outcomes
              </h2>
              <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2">
                <div>
                  <dt className="hint">Downside (5th percentile)</dt>
                  <dd className="text-[16px] font-semibold">
                    {formatVND(simulationResult.profit_distribution.p5)}
                  </dd>
                </div>
                <div>
                  <dt className="hint">Median</dt>
                  <dd className="text-[16px] font-semibold">
                    {formatVND(simulationResult.profit_distribution.p50)}
                  </dd>
                </div>
                <div>
                  <dt className="hint">Upside (95th percentile)</dt>
                  <dd className="text-[16px] font-semibold">
                    {formatVND(simulationResult.profit_distribution.p95)}
                  </dd>
                </div>
              </dl>

              <div
                className="mt-5 h-[260px] w-full"
                role="img"
                aria-label="Histogram of simulated profit. Bars at or above baseline profit are teal, bars below are amber."
              >
                <ResponsiveContainer width="100%" height={260} minWidth={260}>
                  <BarChart data={histData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--rule))" />
                    <XAxis
                      dataKey="rangeLabel"
                      tick={{ fontSize: 12, fill: 'rgb(var(--muted))' }}
                      axisLine={{ stroke: 'rgb(var(--rule-strong))' }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      width={44}
                      tick={{ fontSize: 12, fill: 'rgb(var(--muted))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--sunken))' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded border border-rule-strong bg-surface px-3 py-2 text-[13px] text-ink">
                            <p className="text-muted">Profit around {data.rangeLabel}</p>
                            <p className="font-semibold">{data.count} outcomes</p>
                            <p className="text-muted">
                              {data.mid >= baseProfit ? 'At or above baseline' : 'Below baseline'}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                      {histData.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={
                            entry.mid >= baseProfit
                              ? 'rgb(var(--chart-above))'
                              : 'rgb(var(--chart-below))'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
                <li className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgb(var(--chart-above))]" />
                  At or above baseline profit ({formatVND(baseProfit)})
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[rgb(var(--chart-below))]" />
                  Below baseline
                </li>
              </ul>
            </section>

            <section aria-labelledby="breakeven">
              <h2 id="breakeven" className="h2">
                Break-even sensitivity
              </h2>
              {simulationResult.break_even_elasticity !== null &&
              simulationResult.break_even_elasticity !== undefined ? (
                <>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="hint">Break-even</dt>
                      <dd className="text-[16px] font-semibold">
                        {formatNum(simulationResult.break_even_elasticity)}
                      </dd>
                    </div>
                    <div>
                      <dt className="hint">Estimated (median)</dt>
                      <dd className="text-[16px] font-semibold">
                        {selectedProduct ? formatNum(selectedProduct.elasticity_median) : '—'}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-muted">
                    At this price change, profit stays level if elasticity is{' '}
                    {formatNum(simulationResult.break_even_elasticity)}. If customers are more
                    price-sensitive than that, profit falls.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-muted">
                  There is no break-even point when the price change is 0% or unit cost is at or
                  above the selling price.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
};

export default WhatIfScreen;
