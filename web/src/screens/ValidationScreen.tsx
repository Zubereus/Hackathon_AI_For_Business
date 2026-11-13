import React from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { Notice, PageHeader } from '../components/Page';
import { Lang } from '../i18n';

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

export const ValidationScreen: React.FC<{ lang?: Lang }> = ({ lang = 'en' }) => {
  const isVi = lang === 'vi';

  return (
    <div className="space-y-10">
      <PageHeader
        title={isVi ? 'Kiểm chứng độ chính xác của công cụ' : 'How accurate & honest is this tool?'}
      >
        {isVi
          ? 'Tất cả số liệu bên dưới được lấy nguyên văn từ hồ sơ kiểm thử thực tế (docs/VALIDATION.md) — giải thích bằng ngôn ngữ dễ hiểu để bạn biết công cụ mạnh ở đâu và khi nào cần thận trọng.'
          : 'All numbers below come straight from verified test runs in docs/VALIDATION.md — explained in plain language so you know where the tool shines and where it warns you.'}
      </PageHeader>

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
  );
};

export default ValidationScreen;
