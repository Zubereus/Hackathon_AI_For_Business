import React, { useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiClient } from '../api';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { Notice, PageHeader } from '../components/Page';
import { formatNum, formatVND, Lang } from '../i18n';
import {
  CausalAnalyzeResponse,
  MonitoringEvaluateResponse,
  ProductElasticity,
} from '../types';

const SYNTHETIC_RECOVERY_ROWS = [
  {
    scenario: 'fashion_shop_12',
    skus: '12',
    mae: '0.075',
    ci90: '91.7%',
    corr: '0.960',
    notesEn: 'Passes target: 9 out of 10 estimates hit the true sensitivity range.',
    notesVi: 'Đạt chuẩn: 9/10 sản phẩm đoán trúng khoảng phản ứng khách hàng thật.',
  },
  {
    scenario: 'grocery_fmcg_15',
    skus: '15',
    mae: '0.109',
    ci90: '80.0%',
    corr: '0.791',
    notesEn: 'Passed across fast-moving everyday grocery goods.',
    notesVi: 'Đạt trên nhóm hàng tiêu dùng nhanh hằng ngày.',
  },
  {
    scenario: 'electronics_home_10',
    skus: '10',
    mae: '0.118',
    ci90: '90.0%',
    corr: '0.952',
    notesEn: 'High-priced, slower-moving electronics items recovered accurately.',
    notesVi: 'Hàng giá trị cao, bán chậm hơn vẫn dự đoán sát thực tế.',
  },
  {
    scenario: 'marketplace_large_40',
    skus: '40',
    mae: '0.098',
    ci90: '88.0%',
    corr: '0.940',
    notesEn: 'Stays stable across 40 different items and categories.',
    notesVi: 'Giữ phong độ ổn định khi cửa hàng có tới 40 mặt hàng khác nhau.',
  },
  {
    scenario: 'starter_4_products',
    skus: '4',
    mae: '0.048',
    ci90: '100.0%',
    corr: '1.000',
    notesEn: 'Ranked every product sensitivity in exact order.',
    notesVi: 'Xếp hạng đúng 100% món nào nhạy giá nhiều, món nào ít.',
  },
  {
    scenario: 'hard_low_price_variation_8',
    skus: '8',
    mae: '0.580',
    ci90: '87.5%',
    corr: '0.335',
    notesEn: 'Stress test with flat past prices: engine honestly warned "low price variation" on all 8 items.',
    notesVi: 'Bài thử khó chủ đích (giá cũ ít thay đổi): máy trung thực bật cảnh báo thiếu biến động cho cả 8 món.',
  },
];

const BACKTEST_EVENTS = [
  { scenario: 'starter_4_products', events: '4 / 4', meanWape: '15.6%', coverage80: '92.9%' },
  { scenario: 'fashion_shop_12', events: '5 / 5', meanWape: '17.5%', coverage80: '88.6%' },
  { scenario: 'grocery_fmcg_15', events: '4 / 5', meanWape: '16.1%', coverage80: '98.6%' },
  { scenario: 'electronics_home_10', events: '5 / 5', meanWape: '25.5%', coverage80: '81.4%' },
];

type ValidationTab = 'track_record' | 'monitoring' | 'causal';

interface ValidationScreenProps {
  lang?: Lang;
  client?: ApiClient;
  activeDatasetId?: string;
  products?: ProductElasticity[];
  selectedProductId?: string;
  useFixtures?: boolean;
}

export const ValidationScreen: React.FC<ValidationScreenProps> = ({
  lang = 'en',
  client,
  activeDatasetId = 'fashion_shop_12',
  products = [],
  selectedProductId = 'P01',
  useFixtures = false,
}) => {
  const isVi = lang === 'vi';
  const [tab, setTab] = useState<ValidationTab>('track_record');
  const [targetProductId, setTargetProductId] = useState<string>(
    selectedProductId || products[0]?.product_id || 'P01'
  );
  const [controlProductId, setControlProductId] = useState<string>('');
  const [interventionDate, setInterventionDate] = useState<string>('');
  const [causalPostDays, setCausalPostDays] = useState<number>(21);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monitoringRes, setMonitoringRes] = useState<MonitoringEvaluateResponse | null>(null);
  const [causalRes, setCausalRes] = useState<CausalAnalyzeResponse | null>(null);

  const runMonitoring = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.evaluateMonitoring(activeDatasetId, targetProductId, 3);
      setMonitoringRes(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runCausal = async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const res = await client.analyzeCausalImpact({
        dataset_id: activeDatasetId,
        product_id: targetProductId,
        control_product_id: controlProductId || null,
        intervention_date: interventionDate.trim() ? interventionDate.trim() : null,
        post_days: causalPostDays,
        method: controlProductId ? 'did' : 'its',
      });
      setCausalRes(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={isVi ? 'Kiểm chứng độ chính xác của công cụ' : 'How accurate & honest is this tool?'}
      >
        {isVi
          ? 'Bao gồm hồ sơ kiểm thử tổng hợp (docs/VALIDATION.md), chẩn đoán hiệu chỉnh xác suất & trôi mô hình (Calibration / Regimes / Drift), và phân tích tác động nhân quả DiD / ITS.'
          : 'Includes verified validation benchmarks (docs/VALIDATION.md), live probabilistic calibration & regime/drift diagnostics, and honest DiD / ITS causal impact testing.'}
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setError(null); setTab('track_record'); }}
          className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
            tab === 'track_record'
              ? 'border-accent bg-accent text-accent-ink shadow-sm'
              : 'border-rule bg-surface text-muted hover:text-ink'
          }`}
        >
          {isVi ? '1. Hồ sơ Backtest chuẩn (19 sự kiện)' : '1. Verified Track Record (19 Events)'}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setTab('monitoring'); }}
          className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
            tab === 'monitoring'
              ? 'border-accent bg-accent text-accent-ink shadow-sm'
              : 'border-rule bg-surface text-muted hover:text-ink'
          }`}
        >
          {isVi ? '2. Calibration, Regime & Drift Monitor' : '2. Calibration, Regimes & Drift Monitor'}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setTab('causal'); }}
          className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold ${
            tab === 'causal'
              ? 'border-accent bg-accent text-accent-ink shadow-sm'
              : 'border-rule bg-surface text-muted hover:text-ink'
          }`}
        >
          {isVi ? '3. Tác động Nhân quả (DiD & ITS)' : '3. Causal Impact (DiD & ITS)'}
        </button>
      </div>

      {tab === 'track_record' && (
        <div className="space-y-10">

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel border-cobalt/30 bg-cobalt-bg/40 p-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-cobalt">
            {isVi ? 'ĐỘ ĐÚNG KHOẢNG TIN CẬY 90%' : '90% INTERVAL ACCURACY'}
          </span>
          <p className="mt-1.5 text-[24px] font-bold tabular-nums text-ink">91.7%</p>
          <span className="hint mt-0.5 block text-[12px]">
            {isVi
              ? 'Đoán trúng phản ứng giá thật trên bộ Thời trang (12 món)'
              : 'Hit rate recovering true elasticity on fashion_shop_12'}
          </span>
        </div>

        <div className="panel border-good/30 bg-good-bg/45 p-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-good">
            {isVi ? 'THẮNG CÁCH TÍNH NHẨM CŨ' : 'BACKTEST WIN RATE'}
          </span>
          <p className="mt-1.5 text-[24px] font-bold tabular-nums text-ink">18 / 19 (94.7%)</p>
          <span className="hint mt-0.5 block text-[12px]">
            {isVi
              ? 'Lần đổi giá lịch sử vượt trội cách lấy trung bình 14 ngày'
              : 'Historical pricing events outperforming 14-day naive baseline'}
          </span>
        </div>

        <div className="panel border-coral/30 bg-coral-bg/40 p-4">
          <span className="text-[11px] font-bold uppercase tracking-wide text-coral">
            {isVi ? 'TRUNG THỰC KHI THIẾU DỮ LIỆU' : 'HONEST UNCERTAINTY'}
          </span>
          <p className="mt-1.5 text-[24px] font-bold tabular-nums text-ink">8 / 8</p>
          <span className="hint mt-0.5 block text-[12px]">
            {isVi
              ? 'Ca giá cố định đều bật cảnh báo thay vì đoán bừa'
              : 'Low-variation items flagged honestly instead of fabricating certainty'}
          </span>
        </div>
      </div>

      <section aria-labelledby="recovery" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recovery" className="h2">
            {isVi
              ? 'Bài test 1: Đoán đúng mức độ khách ngại tăng/giảm giá'
              : 'Test 1: Does it accurately read how buyers react to price?'}
          </h2>
          <DataSourceBadge label="SYNTHETIC" lang={lang} />
        </div>
        <p className="max-w-[74ch] text-muted">
          {isVi
            ? 'Khi cho máy xem dữ liệu giả lập (đã cài sẵn thói quen mua thật của khách và yếu tố Tết, 11.11, kỳ lương), máy tự tìm lại được rất sát hành vi thật.'
            : 'We gave the engine simulated stores where true buyer behavior was already known (including Tết peaks, double-day sales, and paydays) and measured how closely it recovered the truth.'}
        </p>

        <Notice>
          {isVi
            ? 'Cách đọc nhanh bảng này: Cột "Độ lệch trung bình" càng nhỏ càng tốt (dưới 0,15 là rất sát). Cột "Đoán trúng khoảng thực tế" trên 85% nghĩa là máy rất hiếm khi đoán trật.'
            : 'How to read this table: Smaller error is better (below 0.15 is tight). "Interval hits truth" above 85% means the real reaction almost always falls inside the engine’s safety range.'}
        </Notice>

        <div className="panel overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[860px]">
              <thead className="bg-sunken">
                <tr>
                  <th scope="col" className="pl-5">
                    {isVi ? 'Bộ dữ liệu thử nghiệm' : 'Test store'}
                  </th>
                  <th scope="col" className="num">
                    {isVi ? 'Số món hàng' : 'Items'}
                  </th>
                  <th scope="col" className="num">
                    {isVi ? 'Độ lệch trung bình' : 'Avg error (MAE)'}
                  </th>
                  <th scope="col" className="num">
                    {isVi ? 'Đoán trúng khoảng thực tế' : '90% interval hits truth'}
                  </th>
                  <th scope="col" className="num">
                    {isVi ? 'Xếp đúng thứ tự món nhạy giá' : 'Order accuracy'}
                  </th>
                  <th scope="col" className="pr-5">
                    {isVi ? 'Nhận xét dễ hiểu' : 'Plain summary'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SYNTHETIC_RECOVERY_ROWS.map((row) => (
                  <tr key={row.scenario}>
                    <th scope="row" className="pl-5 font-semibold">
                      {row.scenario}
                    </th>
                    <td className="num">{row.skus}</td>
                    <td className="num">{row.mae}</td>
                    <td className="num">{row.ci90}</td>
                    <td className="num">{row.corr}</td>
                    <td className="max-w-[320px] pr-5 text-muted">
                      {isVi ? row.notesVi : row.notesEn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="backtest" className="space-y-4">
        <h2 id="backtest" className="h2">
          {isVi
            ? 'Bài test 2: Thử dự đoán lại 19 lần đổi giá trong quá khứ'
            : 'Test 2: Backtesting 19 real past price changes'}
        </h2>
        <p className="max-w-[74ch] text-muted">
          {isVi
            ? 'Ở mỗi lần đổi giá trước đây, chúng tôi giấu đi 14 ngày bán sau khi đổi giá, cho máy dự đoán trước rồi so xem có đoán chuẩn hơn cách ước lượng đơn giản (lấy trung bình 14 ngày trước đó) hay không.'
            : 'For 19 historical price changes, the model saw only data before the change date, predicted the next 14 days, and competed against a simple 14-day trailing average.'}
        </p>
        <p className="text-[16px] font-semibold text-good">
          {isVi
            ? '18 / 19 lần đổi giá (94,7%) máy dự đoán chính xác hơn cách tính nhẩm thông thường'
            : '18 / 19 events (94.7%) beat the naive baseline'}
        </p>

        <div className="panel overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[620px]">
              <thead className="bg-sunken">
                <tr>
                  <th scope="col" className="pl-5">
                    {isVi ? 'Bộ dữ liệu' : 'Test store'}
                  </th>
                  <th scope="col" className="num">
                    {isVi ? 'Số lần đoán thắng cách nhẩm cũ' : 'Times model won'}
                  </th>
                  <th scope="col" className="num">
                    {isVi ? 'Sai số doanh số TB (WAPE)' : 'Avg demand error'}
                  </th>
                  <th scope="col" className="num pr-5">
                    {isVi ? 'Số ngày thực tế nằm trong dải dự báo' : '80% range coverage'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {BACKTEST_EVENTS.map((row) => (
                  <tr key={row.scenario}>
                    <th scope="row" className="pl-5 font-semibold">
                      {row.scenario}
                    </th>
                    <td className="num">{row.events}</td>
                    <td className="num">{row.meanWape}</td>
                    <td className="num pr-5">{row.coverage80}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="max-w-[74ch] text-[14px] text-muted">
          <span className="font-semibold text-ink">
            {isVi ? 'Minh bạch 1 ca dự đoán kém hơn:' : 'The 1 event where the simple average beat the model:'}
          </span>{' '}
          {isVi
            ? 'Sản phẩm P04 (grocery_fmcg_15) đúng ngày 11.11 (sai số 20,6% so với 17,5%) do khuyến mãi trùng đúng đỉnh ngày đôi khiến lượng mua dao động mạnh. Tuy nhiên dải dự báo an toàn 80% vẫn bao trọn 100% thực tế.'
            : 'grocery_fmcg_15, product P04 on 2025-11-11 (20.6% error vs 17.5%) when a promo stacked directly on the 11.11 shopping peak. Even then, the 80% range still covered 100.0% of actual sales.'}
        </p>
      </section>

      <section aria-labelledby="guardrails" className="grid gap-6 md:grid-cols-2">
        <div className="panel p-5">
          <h2 id="guardrails" className="h2">
            {isVi ? 'Đọc file Excel/CSV lộn xộn vẫn khớp 100%' : 'Handles messy store spreadsheets'}
          </h2>
          <p className="mt-2 font-semibold text-good">
            {isVi ? '33 / 33 (100%) tên cột nhận diện chính xác.' : '33 / 33 (100%) columns matched accurately.'}
          </p>
          <p className="mt-1 text-[14px] text-muted">
            {isVi
              ? 'Đã thử trên 5 kiểu file khó: tiêu đề tiếng Việt có/không dấu, đảo lộn thứ tự cột, hóa đơn lẻ từng đơn, thiếu giá nhập hoặc tồn kho.'
              : 'Verified across five messy formats: Vietnamese headers, shuffled columns, receipt-level rows, and files missing cost or inventory.'}
          </p>
        </div>
        <div className="panel p-5">
          <h2 className="h2">
            {isVi ? 'An toàn chống AI đoán bừa & tốc độ cao' : 'Zero-hallucination guardrails & speed'}
          </h2>
          <p className="mt-2 font-semibold text-good">
            {isVi
              ? '30 / 30 câu hỏi hợp lệ đọc chuẩn · 15 / 15 câu sai phạm vi được chặn an toàn.'
              : '30 / 30 valid questions parsed · 15 / 15 out-of-bounds questions blocked safely.'}
          </p>
            <p className="mt-1 text-[14px] text-muted">
              {isVi
                ? 'AI không tự làm toán; máy quét 101 mức giá × 5.000 kịch bản (505.000 phép tính) chỉ trong ~38,8 ms và không bao giờ bịa số liệu.'
                : 'AI never does math. The Go engine evaluates 101 prices × 5,000 market runs (505k draws) in ~38.8 ms with strict number verification.'}
            </p>
          </div>
        </section>
        </div>
      )}

      {/* ---------------- 2. PROBABILISTIC CALIBRATION, REGIMES & DRIFT ---------------- */}
      {tab === 'monitoring' && (
        <section className="space-y-5" data-testid="validation-monitoring-section">
          {useFixtures && (
            <Notice tone="warn">
              {isVi
                ? 'Tắt Chế độ xem mẫu ở góc trên để chạy kiểm định cuộn thời gian thực trên backend Python.'
                : 'Turn off Sample snapshot mode in the header to run live Python rolling calibration & drift checks.'}
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}

          <div className="panel p-5 flex flex-wrap items-end gap-4">
            <div className="min-w-[220px] flex-1">
              <label className="label">{isVi ? 'Chọn SKU kiểm tra' : 'Select SKU to audit'}</label>
              <select
                value={targetProductId}
                onChange={(e) => setTargetProductId(e.target.value)}
                className="field"
              >
                {(products.length > 0 ? products : [{ product_id: 'P01', product_name: 'P01' }]).map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.product_id} — {p.product_name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={loading || !client}
              onClick={runMonitoring}
              className="btn btn-primary"
            >
              {loading
                ? isVi ? 'Đang chạy Calibration & Drift…' : 'Evaluating Calibration & Drift…'
                : isVi ? 'Chạy Kiểm định Xác suất, Regime & Drift' : 'Run Calibration, Regime & Drift Audit'}
            </button>
          </div>

          {monitoringRes && (
            <div className="space-y-5">
              {/* Calibration Strip */}
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="panel p-4">
                  <p className="hint">PICP @ 80%</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{monitoringRes.calibration.picp_80}%</p>
                  <p className="hint text-[11px]">50%: {monitoringRes.calibration.picp_50}% · 90%: {monitoringRes.calibration.picp_90}%</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">MPIW @ 80%</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{monitoringRes.calibration.mpiw_80} {isVi ? 'sp' : 'u'}</p>
                  <p className="hint text-[11px]">{monitoringRes.calibration.relative_mpiw_80_pct}% {isVi ? 'TB thực tế' : 'of mean'}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">WIS ({isVi ? 'Thấp = Tốt' : 'Lower Better'})</p>
                  <p className="mt-1 text-[22px] font-bold text-ink">{monitoringRes.calibration.wis}</p>
                  <p className="hint text-[11px]">Pinball q10/q50/q90: {monitoringRes.calibration.pinball_q10} / {monitoringRes.calibration.pinball_q50} / {monitoringRes.calibration.pinball_q90}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Trạng thái Hiệu chỉnh' : 'Calibration Status'}</p>
                  <p className={`mt-1 text-[17px] font-bold uppercase ${
                    monitoringRes.calibration.calibration_status === 'well_calibrated' ? 'text-good' : 'text-warn'
                  }`}>
                    {monitoringRes.calibration.calibration_status}
                  </p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Sức khỏe Drift Mô hình' : 'Model Drift Status'}</p>
                  <p className={`mt-1 text-[17px] font-bold uppercase ${
                    monitoringRes.drift.drift_status === 'healthy' ? 'text-good' :
                    monitoringRes.drift.drift_status === 'watch' ? 'text-warn' : 'text-bad'
                  }`}>
                    {monitoringRes.drift.drift_status}
                  </p>
                  <p className="hint text-[11px]">DW={monitoringRes.drift.durbin_watson} · Price PSI={monitoringRes.drift.price_psi}</p>
                </div>
              </div>

              {/* Charts: Reliability Diagram & Demand Regimes */}
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="panel p-5">
                  <h3 className="h3 mb-2">{isVi ? 'Đồ thị Độ tin cậy Xác suất (Reliability Curve)' : 'Quantile Reliability Diagram'}</h3>
                  <p className="hint mb-3">
                    {isVi ? 'Càng bám sát đường chéo lý tưởng thì các phân vị q10–q90 càng chuẩn xác.' : 'Closer to nominal quantile diagonal indicates sharper empirical quantile calibration.'}
                  </p>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height={220} minWidth={240}>
                      <LineChart data={monitoringRes.calibration.reliability_curve} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid stroke="rgb(var(--rule))" strokeDasharray="3 3" />
                        <XAxis dataKey="nominal_quantile" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                        <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                        <Tooltip formatter={(val: number, name: string) => [`${val}%`, name]} />
                        <Line type="monotone" dataKey="nominal_quantile" name={isVi ? 'Kỳ vọng lý tưởng' : 'Ideal'} stroke="rgb(var(--muted))" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="empirical_coverage" name={isVi ? 'Thực tế quan sát' : 'Observed'} stroke="rgb(var(--accent))" strokeWidth={2.5} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="panel p-5">
                  <h3 className="h3 mb-2">{isVi ? 'Phát hiện Chế độ Cầu & Điểm gãy Cấu trúc (BIC)' : 'Demand Regimes & Structural Breakpoints'}</h3>
                  <p className="hint mb-3">
                    {isVi
                      ? `Số điểm gãy: ${monitoringRes.regimes.change_points.length} · Ổn định co giãn sớm/gần đây: ${monitoringRes.regimes.elasticity_stable ? 'Ổn định' : 'Có dịch chuyển'} (p=${monitoringRes.regimes.elasticity_shift_p_value ?? '—'})`
                      : `Breakpoints: ${monitoringRes.regimes.change_points.length} · Elasticity stability: ${monitoringRes.regimes.elasticity_stable ? 'Stable' : 'Shifted'} (p=${monitoringRes.regimes.elasticity_shift_p_value ?? '—'})`}
                  </p>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height={220} minWidth={240}>
                      <ComposedChart data={monitoringRes.regimes.series_preview} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid stroke="rgb(var(--rule))" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgb(var(--muted))' }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="rolling_mean_qty" name={isVi ? 'TB trượt 7 ngày' : '7d Rolling Mean'} stroke="rgb(var(--cobalt))" strokeWidth={1.75} dot={false} isAnimationActive={false} />
                        <Line type="stepAfter" dataKey="regime_mean_qty" name={isVi ? 'Mức nền Regime' : 'Regime Mean'} stroke="rgb(var(--warn))" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Drift Details Table */}
              <div className="panel p-5 space-y-2 text-[13px]">
                <h3 className="h3">{isVi ? 'Chi tiết Chẩn đoán Drift & Phần dư' : 'Drift & Residual Diagnostic Breakdown'}</h3>
                <div className="grid gap-3 sm:grid-cols-3 pt-1">
                  <div>Price PSI / KS p: <strong>{monitoringRes.drift.price_psi}</strong> / p={monitoringRes.drift.price_ks_p_value}</div>
                  <div>Demand PSI / KS p: <strong>{monitoringRes.drift.qty_psi}</strong> / p={monitoringRes.drift.qty_ks_p_value}</div>
                  <div>WAPE Baseline → Recent: <strong>{monitoringRes.drift.baseline_wape_pct}% → {monitoringRes.drift.recent_wape_pct}%</strong> (ratio {monitoringRes.drift.error_drift_ratio}x)</div>
                  <div>Residual Bias: <strong>{monitoringRes.drift.residual_mean_bias_pct}%</strong></div>
                  <div>Durbin-Watson: <strong>{monitoringRes.drift.durbin_watson}</strong></div>
                  <div>Flags: <strong>{monitoringRes.drift.drift_flags.length > 0 ? monitoringRes.drift.drift_flags.join(', ') : 'None'}</strong></div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------------- 3. CAUSAL IMPACT (DiD & ITS) ---------------- */}
      {tab === 'causal' && (
        <section className="space-y-5" data-testid="validation-causal-section">
          {useFixtures && (
            <Notice tone="warn">
              {isVi
                ? 'Tắt Chế độ xem mẫu ở góc trên để chạy kiểm định DiD / ITS trực tiếp trên dữ liệu bán hàng.'
                : 'Turn off Sample snapshot mode in the header to run live Python DiD / ITS causal diagnostics.'}
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}

          <div className="panel p-5 grid gap-4 sm:grid-cols-4 items-end">
            <div>
              <label className="label">{isVi ? 'SKU can thiệp (Treated)' : 'Treated SKU'}</label>
              <select value={targetProductId} onChange={(e) => setTargetProductId(e.target.value)} className="field">
                {(products.length > 0 ? products : [{ product_id: 'P01', product_name: 'P01' }]).map((p) => (
                  <option key={p.product_id} value={p.product_id}>{p.product_id} — {p.product_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{isVi ? 'SKU đối chứng (Control -> DiD, bỏ trống -> ITS)' : 'Control SKU (DiD if chosen, else ITS)'}</label>
              <select value={controlProductId} onChange={(e) => setControlProductId(e.target.value)} className="field">
                <option value="">{isVi ? '— Không chọn (chạy ITS đơn SKU) —' : '— None (Single-SKU ITS) —'}</option>
                {products.filter((p) => p.product_id !== targetProductId).map((p) => (
                  <option key={p.product_id} value={p.product_id}>{p.product_id} — {p.product_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{isVi ? 'Ngày can thiệp (trống = tự dò)' : 'Intervention date (blank = auto)'}</label>
              <input type="text" placeholder="YYYY-MM-DD" value={interventionDate} onChange={(e) => setInterventionDate(e.target.value)} className="field" />
            </div>
            <div className="flex gap-2 items-end">
              <div className="w-24">
                <label className="label">{isVi ? 'Hậu kỳ (d)' : 'Post days'}</label>
                <input type="number" min={7} max={60} value={causalPostDays} onChange={(e) => setCausalPostDays(Number(e.target.value) || 21)} className="field field-num" />
              </div>
              <button type="button" disabled={loading || !client} onClick={runCausal} className="btn btn-primary flex-1">
                {loading ? (isVi ? 'Đang ước lượng…' : 'Analyzing…') : isVi ? 'Ước lượng DiD / ITS' : 'Run Causal Audit'}
              </button>
            </div>
          </div>

          {causalRes && (
            <div className="space-y-4">
              {causalRes.warnings.map((w, i) => (
                <Notice key={i} tone="warn">{w}</Notice>
              ))}

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Phương pháp & Ngày' : 'Method & Date'}</p>
                  <p className="mt-1 text-[18px] font-bold uppercase text-ink">{causalRes.method_used} · {causalRes.intervention_date}</p>
                  <p className="hint text-[11px]">{causalRes.pre_days}d pre / {causalRes.post_days}d post</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Tăng thêm / ngày [95% CI]' : 'Incremental Daily Qty [95% CI]'}</p>
                  <p className="mt-1 text-[20px] font-bold text-ink">{causalRes.incremental_daily_qty > 0 ? '+' : ''}{formatNum(causalRes.incremental_daily_qty)}</p>
                  <p className="hint text-[11px]">[{formatNum(causalRes.incremental_qty_ci95_low)}, {formatNum(causalRes.incremental_qty_ci95_high)}] (p={causalRes.p_value})</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Doanh thu / Lãi tăng thêm' : 'Incremental Revenue / Profit'}</p>
                  <p className="mt-1 text-[16px] font-bold text-good">{formatVND(causalRes.incremental_total_profit_vnd)}</p>
                  <p className="hint text-[11px]">Rev: {formatVND(causalRes.incremental_total_revenue_vnd)}</p>
                </div>
                <div className="panel p-4">
                  <p className="hint">{isVi ? 'Kiểm định Xu hướng Song song' : 'Parallel Trends & Confidence'}</p>
                  <p className={`mt-1 text-[15px] font-bold ${
                    causalRes.parallel_trends_passed === true ? 'text-good' : 'text-warn'
                  }`}>
                    {causalRes.parallel_trends_p_value !== null && causalRes.parallel_trends_p_value !== undefined
                      ? `p=${causalRes.parallel_trends_p_value} (${causalRes.parallel_trends_passed ? 'PASS' : 'FAIL'})`
                      : causalRes.causal_confidence}
                  </p>
                </div>
              </div>

              <div className="panel p-5">
                <h3 className="h3 mb-3">{isVi ? 'Thực tế vs Đối chứng (Counterfactual) qua Ngày can thiệp' : 'Actual vs Counterfactual Path Across Intervention'}</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height={250} minWidth={240}>
                    <LineChart data={causalRes.series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="rgb(var(--rule))" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgb(var(--muted))' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} />
                      <Tooltip />
                      <ReferenceLine x={causalRes.intervention_date} stroke="rgb(var(--warn))" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="actual_qty" name={isVi ? 'Thực tế (Treated)' : 'Actual'} stroke="rgb(var(--accent))" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="counterfactual_qty" name={isVi ? 'Đối chứng giả định' : 'Counterfactual'} stroke="rgb(var(--muted))" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 border-t border-rule pt-3 text-[12px] text-muted space-y-1">
                  <p className="font-semibold text-ink">{isVi ? 'Giả định nhận diện nhân quả bắt buộc:' : 'Required Identification Assumptions:'}</p>
                  {causalRes.identification_assumptions.map((a, idx) => (
                    <p key={idx}>• {a}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default ValidationScreen;
