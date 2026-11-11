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
import { Notice, PageHeader } from '../components/Page';
import { describeViolation, formatCompactVND, formatPct, formatVND } from '../i18n';
import { OptimizeResponse, ProductElasticity } from '../types';

interface ReverseWhatIfScreenProps {
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

  const chartData = optimizeResult?.ranked
    ? [...optimizeResult.ranked]
        .sort((a, b) => a.price_change_pct - b.price_change_pct)
        .map((r) => ({
          pct: `${r.price_change_pct}%`,
          expectedProfit: r.expected_profit,
          p5Profit: r.p5_profit,
        }))
    : [];

  return (
    <div>
      <PageHeader title="Reverse what-if">
        Set a profit target and your limits. The engine tests candidate prices and ranks them by
        the chance of reaching the target.
      </PageHeader>

      <section aria-labelledby="targets" className="panel p-5">
        <h2 id="targets" className="sr-only">
          Target and limits
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="opt-product" className="label">
              Product
            </label>
            <select
              id="opt-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="field"
            >
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_id}, {p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="opt-objective" className="label">
              Goal
            </label>
            <select
              id="opt-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value as 'max_expected_profit' | 'hit_target')}
              className="field"
            >
              <option value="hit_target">Best chance of hitting the target</option>
              <option value="max_expected_profit">Highest expected profit</option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-target" className="label">
              Target profit increase (%)
            </label>
            <input
              id="opt-target"
              type="number"
              step={1}
              value={targetUpliftPct}
              onChange={(e) => setTargetUpliftPct(Number(e.target.value) || 0)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="opt-max-change" className="label">
              Largest price change (±%)
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
              className="field"
            />
          </div>

          <div>
            <label htmlFor="opt-min-margin" className="label">
              Lowest gross margin (%)
            </label>
            <input
              id="opt-min-margin"
              type="number"
              min={0}
              max={90}
              value={minMarginPct}
              onChange={(e) => setMinMarginPct(Number(e.target.value) || 0)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="opt-budget" className="label">
              Markdown budget (₫, optional)
            </label>
            <input
              id="opt-budget"
              type="number"
              min={0}
              step={500000}
              placeholder="No limit"
              value={budgetVnd}
              onChange={(e) => setBudgetVnd(e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label htmlFor="opt-seed" className="label">
              Random seed
            </label>
            <input
              id="opt-seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Math.round(Number(e.target.value) || 42))}
              className="field"
            />
          </div>

          <div className="flex flex-col justify-end gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={respectStock}
                onChange={(e) => setRespectStock(e.target.checked)}
                className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
              />
              <span>Stay within the stock limit</span>
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
              className="btn btn-primary"
            >
              {loading ? 'Searching prices…' : 'Find best prices'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-6">
          <Notice tone="error" title="The optimization did not run.">
            {error}
          </Notice>
        </div>
      )}

      {fixtureNote && <p className="hint mt-4">{fixtureNote}</p>}

      {optimizeResult && (
        <>
          <section aria-labelledby="curve" className="mt-12">
            <h2 id="curve" className="h2">
              Profit across candidate prices
            </h2>
            <p className="hint mt-1">
              Expected profit, and the downside that only 1 in 20 outcomes falls below.
            </p>
            <div className="mt-4 h-[260px] w-full" role="img" aria-label="Line chart of expected profit and downside profit for each candidate price change.">
              <ResponsiveContainer width="100%" height={260} minWidth={260}>
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--rule))" />
                  <XAxis
                    dataKey="pct"
                    tick={{ fontSize: 12, fill: 'rgb(var(--muted))' }}
                    interval={4}
                    tickLine={false}
                    axisLine={{ stroke: 'rgb(var(--rule-strong))' }}
                  />
                  <YAxis
                    width={84}
                    tickFormatter={(v: number) => formatCompactVND(v)}
                    tick={{ fontSize: 12, fill: 'rgb(var(--muted))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      return (
                        <div className="rounded border border-rule-strong bg-surface px-3 py-2 text-[13px] text-ink">
                          <p className="text-muted">Price change {payload[0]?.payload?.pct}</p>
                          <p className="font-semibold">
                            Expected {formatVND(payload[0]?.value as number)}
                          </p>
                          <p>Downside {formatVND(payload[1]?.value as number)}</p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedProfit"
                    name="Expected profit"
                    stroke="rgb(var(--chart-above))"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p5Profit"
                    name="Downside"
                    stroke="rgb(var(--chart-below))"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
              <li className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-5 bg-[rgb(var(--chart-above))]" />
                Expected profit
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-[rgb(var(--chart-below))]" />
                Downside (5th percentile)
              </li>
            </ul>
          </section>

          <section aria-labelledby="ranked" className="mt-12">
            <h2 id="ranked" className="h2 mb-3">
              Best candidates
            </h2>
            <div className="panel overflow-hidden">
              <div className="relative overflow-x-auto">
                <table className="data-table min-w-[820px]">
                  <thead className="bg-sunken">
                    <tr>
                      <th scope="col" className="pl-5">
                        Rank
                      </th>
                      <th scope="col" className="num">
                        Price
                      </th>
                      <th scope="col" className="num">
                        Change
                      </th>
                      <th scope="col" className="num">
                        Expected profit
                      </th>
                      <th scope="col" className="num">
                        Downside (5th percentile)
                      </th>
                      <th scope="col" className="num">
                        Chance of hitting target
                      </th>
                      <th scope="col" className="pr-5">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimizeResult.ranked.slice(0, 15).map((opt, idx) => (
                      <tr
                        key={`${opt.price_vnd}-${idx}`}
                        className={idx === 0 ? 'bg-sunken/60 font-semibold' : ''}
                      >
                        <td className="pl-5">{idx + 1}</td>
                        <td className="num">{formatVND(opt.price_vnd)}</td>
                        <td className="num">{formatPct(opt.price_change_pct, 1).replace('-', '−')}</td>
                        <td className="num">{formatVND(opt.expected_profit)}</td>
                        <td className="num font-normal">{formatVND(opt.p5_profit)}</td>
                        <td className="num">{(opt.prob_hit_target * 100).toFixed(1)}%</td>
                        <td className="pr-5 font-normal">
                          {opt.feasible ? (
                            <span className="text-good">Within limits</span>
                          ) : (
                            <span className="text-bad">
                              {opt.violated.map(describeViolation).join('; ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ReverseWhatIfScreen;
