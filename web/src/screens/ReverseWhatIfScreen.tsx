import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TargetIcon } from '../components/Icons';
import { Notice, PageHeader } from '../components/Page';
import { describeViolation, formatCompactVND, formatPct, formatVND, Lang } from '../i18n';
import { OptimizeResponse, ProductElasticity, RankedOption } from '../types';

interface ReverseWhatIfScreenProps {
  lang?: Lang;
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
  onSaveToJournal?: (bestOption: RankedOption, productId: string) => Promise<void> | void;
  journalStatus?: string | null;
}

export const ReverseWhatIfScreen: React.FC<ReverseWhatIfScreenProps> = ({
  lang = 'en',
  products,
  selectedProductId,
  optimizeResult,
  fixtureNote,
  loading,
  error,
  onRunOptimize,
  onSaveToJournal,
  journalStatus,
}) => {
  const isVi = lang === 'vi';
  const [productId, setProductId] = useState(selectedProductId || products[0]?.product_id || 'P01');
  const [objective, setObjective] = useState<'max_expected_profit' | 'hit_target'>('hit_target');
  const [targetUpliftPct, setTargetUpliftPct] = useState(10);
  const [maxPriceChangePct, setMaxPriceChangePct] = useState(30);
  const [minMarginPct, setMinMarginPct] = useState(25);
  const [budgetVnd, setBudgetVnd] = useState<string>('');
  const [respectStock, setRespectStock] = useState(false);
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    if (selectedProductId) {
      setProductId(selectedProductId);
    }
  }, [selectedProductId]);

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
    <div className="space-y-6">
      <section className="panel overflow-hidden border-cobalt/25 bg-gradient-to-br from-surface via-surface to-cobalt-bg/40 p-6 shadow-sm">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.85fr)]">
          <div>
            <PageHeader
              title={isVi ? 'Tìm giá bán đạt mục tiêu lợi nhuận' : 'Find the best price for your profit goal'}
            >
              {isVi
                ? 'Thay vì tự mò từng mức giá, bạn chỉ cần nhập mục tiêu lãi muốn tăng và ranh giới an toàn — máy sẽ quét hàng chục mức giá để chọn ra gợi ý tốt nhất.'
                : 'Tell the tool your profit goal and safety rules. It tests dozens of candidate prices and ranks the safest, strongest options.'}
            </PageHeader>
          </div>
          <div className="overflow-hidden rounded-2xl border border-rule bg-[#FFF8EE] shadow-md dark:brightness-95">
            <img
              src="/images/target-price-hero.jpg"
              alt={
                isVi
                  ? 'Minh họa tối ưu mức giá bán đạt mục tiêu lợi nhuận an toàn'
                  : 'Illustration of target price optimization and safe margin balancing'
              }
              className="h-[175px] w-full object-cover sm:h-[195px]"
            />
          </div>
        </div>
      </section>

      {/* Plain 3-step guide */}
      <div className="grid gap-3 text-[13px] sm:grid-cols-3">
        <div className="panel border-l-4 border-l-accent bg-accent-bg/30 p-4">
          <div className="font-bold text-ink">
            {isVi ? 'Bước 1: Đặt mục tiêu' : 'Step 1: Set your goal'}
          </div>
          <p className="hint mt-1">
            {isVi
              ? 'Chọn món hàng và mức % tiền lãi bạn muốn tăng thêm so với hiện tại.'
              : 'Pick a product and how much more profit (%) you want to aim for.'}
          </p>
        </div>
        <div className="panel border-l-4 border-l-cobalt bg-cobalt-bg/30 p-4">
          <div className="font-bold text-ink">
            {isVi ? 'Bước 2: Chặn rủi ro' : 'Step 2: Add guardrails'}
          </div>
          <p className="hint mt-1">
            {isVi
              ? 'Giữ tỉ lệ lãi tối thiểu để không bán lỗ vốn, và không vượt số hàng còn trong kho.'
              : 'Keep a minimum profit margin and optionally stay inside current inventory.'}
          </p>
        </div>
        <div className="panel border-l-4 border-l-coral bg-coral-bg/30 p-4">
          <div className="font-bold text-ink">
            {isVi ? 'Bước 3: Chọn dòng đầu bảng' : 'Step 3: Pick top-ranked price'}
          </div>
          <p className="hint mt-1">
            {isVi
              ? 'Mức giá đứng hạng 1 màu xanh có cơ hội đạt mục tiêu cao nhất mà vẫn an toàn.'
              : 'Row #1 (feasible) offers the highest odds of reaching your goal safely.'}
          </p>
        </div>
      </div>

      <section aria-labelledby="targets" className="panel p-5">
        <h2 id="targets" className="sr-only">
          {isVi ? 'Mục tiêu và giới hạn an toàn' : 'Target and limits'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="opt-product" className="label">
              {isVi ? 'Chọn sản phẩm (SKU)' : 'Product'}
            </label>
            <select
              id="opt-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="field"
            >
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_id} — {p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="opt-objective" className="label">
              {isVi ? 'Ưu tiên tìm kiếm theo' : 'Priority goal'}
            </label>
            <select
              id="opt-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value as 'max_expected_profit' | 'hit_target')}
              className="field"
            >
              <option value="hit_target">
                {isVi ? 'Chắc chắn đạt mục tiêu lãi nhất' : 'Highest chance to hit profit goal'}
              </option>
              <option value="max_expected_profit">
                {isVi ? 'Lãi trung bình cao nhất' : 'Highest average expected profit'}
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-target" className="label">
              {isVi ? 'Muốn lãi tăng thêm bao nhiêu %?' : 'Target profit increase (%)'}
            </label>
            <input
              id="opt-target"
              type="number"
              step={1}
              value={targetUpliftPct}
              onChange={(e) => setTargetUpliftPct(Number(e.target.value) || 0)}
              className="field field-num"
            />
          </div>

          <div>
            <label htmlFor="opt-max-change" className="label">
              {isVi ? 'Chỉ tăng/giảm giá tối đa (±%)' : 'Max price move allowed (±%)'}
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
              className="field field-num"
            />
          </div>

          <div>
            <label htmlFor="opt-min-margin" className="label">
              {isVi ? 'Tỉ lệ lãi tối thiểu phải giữ (%)' : 'Minimum profit margin (%)'}
            </label>
            <input
              id="opt-min-margin"
              type="number"
              min={0}
              max={90}
              value={minMarginPct}
              onChange={(e) => setMinMarginPct(Number(e.target.value) || 0)}
              className="field field-num"
            />
          </div>

          <div>
            <label htmlFor="opt-budget" className="label">
              {isVi ? 'Ngân sách khuyến mãi tối đa (₫)' : 'Markdown budget cap (₫, optional)'}
            </label>
            <input
              id="opt-budget"
              type="number"
              min={0}
              step={500000}
              placeholder={isVi ? 'Không giới hạn' : 'No limit'}
              value={budgetVnd}
              onChange={(e) => setBudgetVnd(e.target.value)}
              className="field field-num"
            />
          </div>

          <div className="flex flex-col justify-end sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label className="flex cursor-pointer select-none items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={respectStock}
                  onChange={(e) => setRespectStock(e.target.checked)}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span>
                  {isVi ? 'Không bán vượt quá số hàng trong kho' : 'Stay within available stock'}
                </span>
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
                className="btn btn-primary gap-2"
              >
                <TargetIcon className="h-4 w-4" aria-hidden="true" />
                <span>
                  {loading
                    ? isVi
                      ? 'Đang dò tìm giá tốt nhất…'
                      : 'Searching prices…'
                    : isVi
                      ? 'Tìm mức giá tốt nhất'
                      : 'Find best prices'}
                </span>
              </button>
            </div>
          </div>
        </div>

        <details className="mt-4 text-[13px] text-muted">
          <summary className="cursor-pointer select-none hover:text-ink">
            {isVi
              ? 'Tùy chọn kỹ thuật (Mã lặp lại kết quả)'
              : 'Technical option (Reproducibility seed)'}
          </summary>
          <div className="mt-2 max-w-[200px]">
            <label htmlFor="opt-seed" className="label">
              {isVi ? 'Mã ngẫu nhiên (Seed)' : 'Random seed'}
            </label>
            <input
              id="opt-seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(Math.round(Number(e.target.value) || 42))}
              className="field field-num py-1.5"
            />
          </div>
        </details>
      </section>

      {error && (
        <div>
          <Notice
            tone="error"
            title={isVi ? 'Chưa tìm được giá.' : 'The optimization did not run.'}
          >
            {error}
          </Notice>
        </div>
      )}

      {fixtureNote && <p className="hint">{fixtureNote}</p>}

      {optimizeResult && (
        <>
          <section aria-labelledby="curve" className="panel p-5">
            <h2 id="curve" className="h2">
              {isVi
                ? 'Biểu đồ lời lỗ qua từng mức đổi giá'
                : 'Profit across candidate prices'}
            </h2>
            <p className="hint mt-1">
              {isVi
                ? 'Đường màu xanh cho biết tiền lãi dự kiến; đường vàng nét đứt là mức an toàn (chỉ 5% trường hợp xấu hơn mức này). Đỉnh càng cao càng có lợi.'
                : 'Solid teal line: expected profit. Dashed amber line: safe floor (only 1 in 20 market runs fall below). Higher is better.'}
            </p>
            <div
              className="mt-4 h-[260px] w-full"
              role="img"
              aria-label={
                isVi
                  ? 'Biểu đồ đường tiền lãi dự kiến và mức an toàn theo từng mức đổi giá.'
                  : 'Line chart of expected profit and downside profit for each candidate price change.'
              }
            >
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
                        <div className="rounded border border-rule-strong bg-surface px-3 py-2 text-[13px] text-ink shadow-sm">
                          <p className="text-muted">
                            {isVi ? 'Thay đổi giá ' : 'Price change '}
                            {payload[0]?.payload?.pct}
                          </p>
                          <p className="font-semibold">
                            {isVi ? 'Lãi dự kiến ' : 'Expected '}
                            {formatVND(payload[0]?.value as number)}
                          </p>
                          <p>
                            {isVi ? 'Mức an toàn (95% giữ được) ' : 'Safe floor '}
                            {formatVND(payload[1]?.value as number)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedProfit"
                    name={isVi ? 'Lãi dự kiến' : 'Expected profit'}
                    stroke="rgb(var(--chart-above))"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p5Profit"
                    name={isVi ? 'Mức an toàn' : 'Safe floor'}
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
                {isVi ? 'Tiền lãi dự kiến' : 'Expected profit'}
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-[rgb(var(--chart-below))]" />
                {isVi ? 'Mức an toàn (95% không thấp hơn)' : 'Safe floor (95% stay above)'}
              </li>
            </ul>
          </section>

          <section aria-labelledby="ranked" className="pt-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="ranked" className="h2">
                {isVi ? 'Top mức giá gợi ý (xếp từ tốt nhất)' : 'Top recommended prices'}
              </h2>
              {onSaveToJournal && optimizeResult.ranked[0] && (
                <button
                  type="button"
                  data-testid="save-optimize-journal-btn"
                  onClick={() => onSaveToJournal(optimizeResult.ranked[0], productId)}
                  className="btn btn-secondary text-[13px]"
                >
                  {isVi ? 'Lưu mức giá tốt nhất vào Nhật ký' : 'Save Best Price to Journal'}
                </button>
              )}
            </div>
            {journalStatus && (
              <div className="mb-3">
                <Notice tone="info" role="status">{journalStatus}</Notice>
              </div>
            )}
            <div className="panel overflow-hidden">
              <div className="relative overflow-x-auto">
                <table className="data-table min-w-[820px]">
                  <thead className="bg-sunken">
                    <tr>
                      <th scope="col" className="pl-5">
                        {isVi ? 'Hạng' : 'Rank'}
                      </th>
                      <th scope="col" className="num">
                        {isVi ? 'Giá bán gợi ý' : 'Suggested price'}
                      </th>
                      <th scope="col" className="num">
                        {isVi ? 'Tăng / giảm' : 'Change'}
                      </th>
                      <th scope="col" className="num">
                        {isVi ? 'Tiền lãi dự kiến' : 'Expected profit'}
                      </th>
                      <th scope="col" className="num">
                        {isVi ? 'Mức an toàn (95%)' : 'Safe floor'}
                      </th>
                      <th scope="col" className="num">
                        {isVi ? 'Cơ hội đạt mục tiêu' : 'Odds to hit goal'}
                      </th>
                      <th scope="col" className="pr-5">
                        {isVi ? 'Kiểm tra an toàn' : 'Guardrail check'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimizeResult.ranked.slice(0, 15).map((opt, idx) => (
                      <tr
                        key={`${opt.price_vnd}-${idx}`}
                        className={idx === 0 ? 'bg-accent-bg/45 font-semibold' : ''}
                      >
                        <td className="pl-5">{idx + 1}</td>
                        <td className="num">{formatVND(opt.price_vnd)}</td>
                        <td className="num">{formatPct(opt.price_change_pct, 1).replace('-', '−')}</td>
                        <td className="num">{formatVND(opt.expected_profit)}</td>
                        <td className="num font-normal">{formatVND(opt.p5_profit)}</td>
                        <td className="num">{(opt.prob_hit_target * 100).toFixed(1)}%</td>
                        <td className="pr-5 font-normal">
                          {opt.feasible ? (
                            <span className="text-good">
                              {isVi ? 'Đạt chuẩn an toàn' : 'Safe & within limits'}
                            </span>
                          ) : (
                            <span className="text-bad">
                              {opt.violated.map((v) => describeViolation(v, lang)).join('; ')}
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
