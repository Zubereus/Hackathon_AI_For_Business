import React, { useRef, useState } from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { UploadIcon } from '../components/Icons';
import { Notice, PageHeader } from '../components/Page';
import { FX_CONFIG, Lang } from '../i18n';
import { SAMPLE_CSV_DATASETS } from '../sampleDatasets';

interface UploadScreenProps {
  lang?: Lang;
  loading: boolean;
  error: string | null;
  liveApi: boolean;
  onSelectDemo: (label: 'SYNTHETIC' | 'PUBLIC_M5') => void;
  onLoadSample: (sampleId: string) => void;
  onUploadFile: (file: File) => void;
}

const SAMPLE_VI: Record<string, { title: string; description: string }> = {
  starter_4_products: {
    title: 'Cửa hàng nhỏ khởi đầu (4 món)',
    description: '4 sản phẩm tiêu biểu kèm chi phí MKT, nhân công & vận hành để làm quen nhanh.',
  },
  fashion_shop_12: {
    title: 'Shop thời trang (12 món hàng)',
    description: 'Thời trang có mùa Tết, các đợt giảm giá và chi phí marketing, nhân công, mặt bằng.',
  },
  smb_retail_full_ops_10: {
    title: 'Shop đa kênh đủ chi phí ngoài (10 món: Nhân công, MKT, Mặt bằng & Phí sàn)',
    description: 'Dữ liệu bán lẻ có cột riêng cho tiền quảng cáo, lương nhân viên đóng gói, thuê mặt bằng & phí sàn.',
  },
  grocery_fmcg_15: {
    title: 'Tạp hóa & Tiêu dùng nhanh (15 món)',
    description: 'Nhu yếu phẩm ít nhạy cảm về giá hơn nhưng tăng vọt vào dịp Tết.',
  },
  electronics_home_10: {
    title: 'Điện tử & Gia dụng (10 món)',
    description: 'Mặt hàng giá trị cao, khách so sánh giá kỹ vào các ngày sale lớn 11.11 / Black Friday.',
  },
  marketplace_large_40: {
    title: 'Sàn đa ngành quy mô lớn (40 món)',
    description: '40 sản phẩm trải nhiều ngành hàng để thử tốc độ tính toán quy mô vừa.',
  },
  hard_low_price_variation_8: {
    title: 'Mẫu giá ít thay đổi (8 món — kiểm thử cảnh báo)',
    description: 'Sản phẩm gần như bán cố định 1 mức giá để thấy cách hệ thống cảnh báo thiếu dữ liệu.',
  },
  hard_event_confounded_12: {
    title: 'Mẫu giảm giá trùng ngày lễ (12 món — ca khó)',
    description: 'Tình huống ngày lễ và ngày giảm giá trùng nhau, giúp kiểm tra độ thận trọng của máy.',
  },
  english_extra_columns_no_cost_no_stock: {
    title: 'File tiếng Anh thiếu giá vốn & tồn kho',
    description: 'Tên cột tiếng Anh kèm cột thừa, minh họa cách máy tự bù lãi gộp ước tính.',
  },
  erp_abbrev: {
    title: 'File xuất từ hệ thống ERP / Phần mềm POS (viết tắt)',
    description: 'Tên cột viết tắt như SKU_CD, QTY, UNIT_PRC… giống sổ kế toán doanh nghiệp.',
  },
  price_in_thousands_name_only: {
    title: 'File ghi giá theo "nghìn đồng" & chỉ có tên món',
    description: 'Ví dụ ghi 95 thay vì 95.000 ₫ và không có mã SKU — hệ thống tự nhân đúng đơn vị.',
  },
  receipt_level_transactions: {
    title: 'File từng hóa đơn lẻ trong ngày',
    description: 'Nhiều hóa đơn mỗi ngày được tự động gộp lại theo từng ngày bán.',
  },
  vn_headers_vn_numbers: {
    title: 'File tiếng Việt dùng dấu chấm hàng nghìn (104.000)',
    description: 'Sổ bán hàng tiếng Việt chuẩn Excel Việt Nam với cột khuyến mãi và tồn kho.',
  },
};

export const UploadScreen: React.FC<UploadScreenProps> = ({
  lang = 'en',
  loading,
  error,
  liveApi,
  onSelectDemo,
  onLoadSample,
  onUploadFile,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isVi = lang === 'vi';

  const handleFile = (file: File | undefined | null) => {
    setLocalError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setLocalError(isVi ? 'Vui lòng chọn file đuôi .csv (xuất từ Excel/POS).' : 'Choose a .csv file.');
      return;
    }
    if (file.size === 0) {
      setLocalError(isVi ? 'File CSV này đang bị trống.' : 'That file is empty.');
      return;
    }
    onUploadFile(file);
  };

  const message = error || localError;

  return (
    <div>
      <PageHeader
        title={isVi ? 'Nạp sổ bán hàng của shop hoặc dùng dữ liệu mẫu' : 'Load sales data or pick a sample'}
      >
        {isVi
          ? 'Chỉ cần file Excel lưu dạng .csv có 4 thông tin cơ bản: Ngày bán, Tên/Mã món, Số lượng, Giá bán. Máy tự đọc được cả tiếng Việt và tiếng Anh.'
          : 'Upload a .csv file with Date, Product, Quantity, and Price (Vietnamese or English headers both work), or try a sample shop below.'}
      </PageHeader>

      {message && (
        <div className="mb-6">
          <Notice
            tone="error"
            title={isVi ? 'Không đọc được file này.' : 'Could not use this file.'}
          >
            {message}
          </Notice>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section aria-labelledby="own-file" className="space-y-4">
          <h2 id="own-file" className="h2">
            {isVi ? 'Cách 1: Tải file bán hàng (.csv) từ máy bạn' : 'Option 1: Upload your own CSV'}
          </h2>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className={`grid items-center gap-5 rounded-lg border border-dashed p-6 transition-colors sm:grid-cols-[130px_minmax(0,1fr)] ${
              dragActive ? 'border-accent bg-sunken' : 'border-rule-strong bg-surface'
            }`}
          >
            <input
              ref={inputRef}
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label={
                isVi ? 'Tải lên file CSV lịch sử bán hàng' : 'Upload retail sales CSV file'
              }
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="mx-auto w-[140px] overflow-hidden rounded-xl border border-rule bg-[#FFF8EE] shadow-sm sm:w-full dark:brightness-95">
              <img
                src="/images/csv-data-guide.jpg"
                alt={
                  isVi
                    ? 'Minh họa chuyển sổ bán hàng Excel sang thẻ giá và lợi nhuận'
                    : 'Illustration of a sales spreadsheet turning into price tags and profit coins'
                }
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[17px] font-semibold text-ink">
                {isVi ? 'Kéo thả file CSV vào đây' : 'Drop a CSV file here'}
              </p>
              <p className="mt-1.5 text-[14px] text-muted">
                {isVi
                  ? 'Tên cột không cần chuẩn sẵn (ví dụ "don_gia", "so_luong", "ngay_ban"). Hệ thống hỗ trợ giá dùng dấu chấm hàng nghìn.'
                  : 'Column names in Vietnamese or English both work. Prices can use thousand separators.'}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => inputRef.current?.click()}
                  className="btn btn-primary gap-2"
                >
                  <UploadIcon className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {loading
                      ? isVi
                        ? 'Đang đọc file…'
                        : 'Reading file…'
                      : isVi
                        ? 'Chọn file từ máy'
                        : 'Choose file'}
                  </span>
                </button>
              </div>
              <p className="hint mt-3">
                {isVi
                  ? 'An toàn bảo mật: số liệu bán hàng không bị lưu lại trong trình duyệt của bạn.'
                  : "Privacy safe: nothing is saved in your browser's local storage."}
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="samples">
          <h2 id="samples" className="h2 mb-3">
            {isVi ? 'Cách 2: Bấm thử ngay với dữ liệu mẫu' : 'Option 2: Try a ready-made shop'}
          </h2>
          <div className="space-y-3">
            <div className="panel border-l-4 border-l-accent bg-accent-bg/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[16px] font-bold text-ink">
                  {isVi ? 'Cửa hàng thời trang Việt Nam' : 'Vietnam fashion shop'}
                </h3>
                <DataSourceBadge label="SYNTHETIC" lang={lang} />
              </div>
              <p className="mt-1.5 text-[14px] text-muted">
                {isVi
                  ? 'Dữ liệu bán quần áo theo mùa Tết và các đợt giảm giá, phù hợp để trải nghiệm đầy đủ tính năng ngay.'
                  : 'Apparel sales with Tết seasonality and promotions — great for testing all features right away.'}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelectDemo('SYNTHETIC')}
                className="btn btn-primary mt-3 text-[13px]"
              >
                {loading
                  ? isVi
                    ? 'Đang mở…'
                    : 'Loading…'
                  : isVi
                    ? 'Dùng bộ dữ liệu Thời trang'
                    : 'Load fashion shop sample'}
              </button>
            </div>

            <div className="panel border-l-4 border-l-cobalt bg-cobalt-bg/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[16px] font-bold text-ink">
                  {isVi ? 'Siêu thị bán lẻ công khai (M5 Walmart)' : 'M5 Walmart retail'}
                </h3>
                <DataSourceBadge label="PUBLIC_M5" lang={lang} />
              </div>
              <p className="mt-1.5 text-[14px] text-muted">
                {isVi
                  ? `Dữ liệu thực tế ngành sữa và đồ thủ công (${FX_CONFIG.disclaimer[lang]}). Có 1 sản phẩm ít đổi giá giúp bạn thấy cách máy cảnh báo khi thiếu dữ liệu.`
                  : `Dairy and hobby products from the public M5 data, shown in VND (${FX_CONFIG.disclaimer[lang]}). Includes 1 steady-price item to show low-variation warnings.`}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelectDemo('PUBLIC_M5')}
                className="btn btn-secondary mt-3 border-cobalt/35 text-[13px] text-cobalt hover:bg-cobalt hover:text-white"
              >
                {loading
                  ? isVi
                    ? 'Đang mở…'
                    : 'Loading…'
                  : isVi
                    ? 'Dùng bộ dữ liệu M5'
                    : 'Load M5 sample'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="more-samples" className="mt-8 border-t border-rule pt-6">
        <h2 id="more-samples" className="h2">
          {isVi
            ? `${SAMPLE_CSV_DATASETS.length} mẫu file CSV đa dạng (yêu cầu đang bật máy chủ xử lý)`
            : `${SAMPLE_CSV_DATASETS.length} Additional CSV Samples (Live backend)`}
        </h2>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {(['sales', 'mapping'] as const).map((group) => {
            const datasets = SAMPLE_CSV_DATASETS.filter((dataset) => dataset.group === group);
            const heading =
              group === 'sales'
                ? isVi
                  ? 'Mẫu sổ bán hàng nhiều ngành'
                  : 'Retail Sales Data'
                : isVi
                  ? 'Mẫu kiểm thử ghép cột & làm sạch file'
                  : 'Data Import & Mapping Samples';

            return (
              <section key={group} aria-labelledby={`sample-group-${group}`}>
                <h3 id={`sample-group-${group}`} className="mb-2 text-[15px] font-semibold">
                  {heading}
                </h3>
                <ul className="divide-y divide-rule border-y border-rule">
                  {datasets.map((dataset) => {
                    const viMeta = SAMPLE_VI[dataset.id];
                    const title = isVi && viMeta ? viMeta.title : dataset.title;
                    const description =
                      isVi && viMeta ? viMeta.description : dataset.description;
                    return (
                      <li
                        key={dataset.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{title}</p>
                          <p className="hint mt-0.5">{description}</p>
                        </div>
                        <button
                          type="button"
                          disabled={loading || !liveApi}
                          onClick={() => onLoadSample(dataset.id)}
                          className="btn btn-secondary shrink-0 text-[13px]"
                          title={
                            liveApi
                              ? isVi
                                ? `Nạp ${title} để ghép cột và tính thử`
                                : `Load ${dataset.title} into the ingestion flow`
                              : isVi
                                ? 'Bỏ chọn "Chế độ xem mẫu" ở góc trên để kết nối máy chủ'
                                : 'Turn off Sample snapshot mode to connect to the live backend'
                          }
                        >
                          {liveApi
                            ? isVi
                              ? 'Dùng mẫu này'
                              : 'Use sample'
                            : isVi
                              ? 'Cần Live API'
                              : 'Live API required'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default UploadScreen;
