import React from 'react';
import { Notice, PageHeader } from '../components/Page';
import { Lang } from '../i18n';
import { ColumnMappingItem, ColumnProfile, IngestCommitOptions } from '../types';

type FieldGroup = 'needed' | 'product' | 'optional';

export const CANONICAL_FIELDS: Array<{
  value: string;
  label: string;
  labelVi: string;
  group: FieldGroup;
}> = [
  { value: 'date', label: 'Date', labelVi: 'Ngày bán', group: 'needed' },
  { value: 'quantity', label: 'Quantity sold', labelVi: 'Số lượng bán', group: 'needed' },
  { value: 'price', label: 'Price', labelVi: 'Giá bán 1 món', group: 'needed' },
  { value: 'product_id', label: 'Product ID', labelVi: 'Mã sản phẩm', group: 'product' },
  { value: 'product_name', label: 'Product name', labelVi: 'Tên sản phẩm', group: 'product' },
  { value: 'unit_cost', label: 'Unit cost', labelVi: 'Giá nhập vốn / món', group: 'optional' },
  { value: 'category', label: 'Category', labelVi: 'Nhóm hàng', group: 'optional' },
  { value: 'stock', label: 'Stock on hand', labelVi: 'Số lượng còn trong kho', group: 'optional' },
  { value: 'promo', label: 'Promotion flag', labelVi: 'Có khuyến mãi không?', group: 'optional' },
  { value: 'marketing_cost', label: 'Marketing / Ads cost', labelVi: 'Chi phí Marketing / Quảng cáo', group: 'optional' },
  { value: 'labor_cost', label: 'Labor / Staff cost', labelVi: 'Chi phí Nhân công / Lương', group: 'optional' },
  { value: 'operating_cost', label: 'Operating / Platform overhead', labelVi: 'Chi phí Vận hành / Mặt bằng / Phí sàn', group: 'optional' },
  { value: 'fixed_cost', label: 'Other fixed cost', labelVi: 'Chi phí cố định khác', group: 'optional' },
];

const GROUP_LABELS: Record<FieldGroup, { en: string; vi: string }> = {
  needed: { en: 'Required', vi: 'Bắt buộc phải có' },
  product: { en: 'Product (pick at least one)', vi: 'Tên hoặc Mã món (ít nhất 1)' },
  optional: { en: 'Optional (helpful extras)', vi: 'Tùy chọn (có càng chính xác)' },
};

interface MappingScreenProps {
  lang?: Lang;
  fileName: string | null;
  nRows: number;
  columns: ColumnProfile[];
  mappingItems: ColumnMappingItem[];
  sourceToCanonical: Record<string, string>;
  options: IngestCommitOptions;
  warnings: string[];
  loading: boolean;
  error: string | null;
  onChangeColumnMapping: (sourceCol: string, canonicalField: string) => void;
  onChangeOptions: (opts: IngestCommitOptions) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function computeMissingRequired(sourceToCanonical: Record<string, string>): string[] {
  const assigned = new Set(Object.values(sourceToCanonical).filter((v) => v && v.trim() !== ''));
  const missing: string[] = [];
  if (!assigned.has('date')) missing.push('date');
  if (!assigned.has('quantity')) missing.push('quantity');
  if (!assigned.has('price')) missing.push('price');
  if (!assigned.has('product_id') && !assigned.has('product_name')) {
    missing.push('product_id or product_name');
  }
  return missing;
}

const GROUPS: FieldGroup[] = ['needed', 'product', 'optional'];

export const MappingScreen: React.FC<MappingScreenProps> = ({
  lang = 'en',
  fileName,
  nRows,
  columns,
  mappingItems,
  sourceToCanonical,
  options,
  warnings,
  loading,
  error,
  onChangeColumnMapping,
  onChangeOptions,
  onConfirm,
  onBack,
}) => {
  const isVi = lang === 'vi';
  const missingRequired = computeMissingRequired(sourceToCanonical);
  const assignedFields = new Set(Object.values(sourceToCanonical).filter(Boolean));
  const hasUnitCost = assignedFields.has('unit_cost');

  const metaBySource = new Map<string, ColumnMappingItem>();
  for (const item of mappingItems) {
    if (item.source) {
      metaBySource.set(item.source, item);
    }
  }

  return (
    <div>
      <PageHeader title={isVi ? 'Kiểm tra lại tên cột trong file của bạn' : 'Confirm your columns'}>
        {isVi
          ? `${fileName || 'File dữ liệu'}, ${nRows.toLocaleString()} dòng. Máy đã tự ghép thử từng cột trong file với thông tin cần thiết. Chỉ cần chắc chắn đủ 4 mục: Ngày bán, Số lượng, Giá bán và Mã hoặc Tên món.`
          : `${fileName || 'Sample dataset'}, ${nRows.toLocaleString()} rows. Check which field each column feeds. Date, quantity, price, and a product ID or name are required.`}
      </PageHeader>

      <div className="space-y-3">
        {error && (
          <Notice
            tone="error"
            title={isVi ? 'Không áp dụng được cấu hình cột.' : 'Could not apply the mapping.'}
          >
            {error}
          </Notice>
        )}

        {missingRequired.length > 0 && (
          <Notice
            tone="error"
            testId="missing-required-banner"
            title={isVi ? 'Thiếu cột bắt buộc nên chưa bấm tiếp được.' : 'Confirm is blocked.'}
          >
            {isVi
              ? `Vui lòng chọn thêm cột cho: ${missingRequired.join(', ')}`
              : `Still needed: ${missingRequired.join(', ')}`}
          </Notice>
        )}

        {warnings.length > 0 && (
          <Notice
            tone="warn"
            title={isVi ? 'Lưu ý kiểm tra nhanh:' : 'Check these first.'}
          >
            {warnings.join(' ')}
          </Notice>
        )}
      </div>

      <div className="panel mt-6 overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="data-table">
            <thead className="bg-sunken">
              <tr>
                <th scope="col" className="pl-5">
                  {isVi ? 'Tên cột trong file của bạn' : 'Your column'}
                </th>
                <th scope="col">{isVi ? 'Tương ứng với thông tin gì?' : 'Matches field'}</th>
                <th scope="col">{isVi ? 'Độ chắc chắn' : 'Match confidence'}</th>
                <th scope="col">{isVi ? 'Vài dòng ví dụ' : 'Sample values'}</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const selectedCanon = sourceToCanonical[col.name] ?? '';
                const meta = metaBySource.get(col.name);
                const confPct = meta ? Math.round(meta.confidence * 100) : selectedCanon ? 100 : 0;
                const isManual = meta ? meta.canonical !== selectedCanon : selectedCanon !== '';
                const matchNote = isManual
                  ? isVi
                    ? 'bạn vừa chọn'
                    : 'set by you'
                  : meta?.method.replace(/_/g, ' ') || (isVi ? 'chưa ghép' : 'not matched');

                return (
                  <tr key={col.name}>
                    <td className="pl-5">
                      <div className="font-semibold">{col.name}</div>
                      <div className="hint">
                        {col.dtype_guess}, {col.n_unique}{' '}
                        {isVi ? 'giá trị khác nhau' : 'distinct values'}
                      </div>
                    </td>
                    <td className="min-w-[210px]">
                      <label htmlFor={`map-select-${col.name}`} className="sr-only">
                        Field for {col.name}
                      </label>
                      <select
                        id={`map-select-${col.name}`}
                        value={selectedCanon}
                        onChange={(e) => onChangeColumnMapping(col.name, e.target.value)}
                        className="field max-w-[270px]"
                      >
                        <option value="">
                          {isVi ? 'Bỏ qua (không dùng cột này)' : 'Ignore this column'}
                        </option>
                        {GROUPS.map((group) => (
                          <optgroup key={group} label={GROUP_LABELS[group][lang]}>
                            {CANONICAL_FIELDS.filter((f) => f.group === group).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {isVi ? opt.labelVi : opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <option value={`extra_${col.name}`}>
                          {isVi ? 'Giữ làm thông tin phụ' : 'Keep as extra variable'}
                        </option>
                      </select>
                    </td>
                    <td className="min-w-[130px]">
                      <div className={confPct < 60 && selectedCanon ? 'font-semibold text-warn' : ''}>
                        {selectedCanon ? `${confPct}%` : '—'}
                      </div>
                      <div className="hint">{matchNote}</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {col.samples.slice(0, 3).map((s, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-sunken px-2 py-0.5 text-[13px] text-ink"
                          >
                            {String(s)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section aria-labelledby="read-options" className="mt-8">
        <h2 id="read-options" className="h2 mb-3">
          {isVi ? 'Cách đọc định dạng tiền & ngày trong file' : 'How to read numbers & dates'}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="opt-price-unit" className="label">
              {isVi ? 'Đơn vị tiền đang ghi' : 'Price unit'}
            </label>
            <select
              id="opt-price-unit"
              value={options.price_unit}
              onChange={(e) => onChangeOptions({ ...options, price_unit: e.target.value })}
              className="field"
            >
              <option value="VND">
                {isVi ? 'Đồng nguyên (vd: 95000)' : 'Exact VND (95000)'}
              </option>
              <option value="K_VND">
                {isVi ? 'Nghìn đồng (vd: 95 = 95.000 ₫)' : 'Thousand VND (95 means 95.000 ₫)'}
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-date-format" className="label">
              {isVi ? 'Kiểu ghi ngày tháng' : 'Date format'}
            </label>
            <select
              id="opt-date-format"
              value={options.date_format ?? ''}
              onChange={(e) => onChangeOptions({ ...options, date_format: e.target.value || null })}
              className="field"
            >
              <option value="">{isVi ? 'Để máy tự nhận diện' : 'Detect automatically'}</option>
              <option value="%d/%m/%Y">Ngày/Tháng/Năm (DD/MM/YYYY)</option>
              <option value="%Y-%m-%d">Năm-Tháng-Ngày (YYYY-MM-DD)</option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-number-locale" className="label">
              {isVi ? 'Dấu chấm / phẩy phân cách số' : 'Number format'}
            </label>
            <select
              id="opt-number-locale"
              value={options.number_locale ?? ''}
              onChange={(e) =>
                onChangeOptions({ ...options, number_locale: e.target.value || null })
              }
              className="field"
            >
              <option value="">{isVi ? 'Để máy tự nhận diện' : 'Detect automatically'}</option>
              <option value="vi_VN">
                {isVi ? 'Kiểu Việt Nam (100.000,5)' : 'Vietnamese (100.000,5)'}
              </option>
              <option value="en_US">{isVi ? 'Kiểu Quốc tế (100,000.5)' : 'English (100,000.5)'}</option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-margin-pct" className="label">
              {isVi
                ? 'Tỉ lệ lãi gộp ước tính khi thiếu giá vốn (%)'
                : 'Estimated margin if cost missing (%)'}
            </label>
            <input
              id="opt-margin-pct"
              type="number"
              min={1}
              max={95}
              step={1}
              value={options.margin_pct ?? 35}
              disabled={hasUnitCost}
              onChange={(e) =>
                onChangeOptions({ ...options, margin_pct: Number(e.target.value) || 35 })
              }
              className="field field-num"
            />
            {!hasUnitCost && (
              <p className="hint mt-1.5">
                {isVi
                  ? 'Vì file chưa có cột giá nhập vốn, máy sẽ tạm tính giá nhập dựa trên mức % lãi này (sau đó bạn vẫn sửa lại từng món được).'
                  : 'No unit cost column is mapped, so cost is estimated from this margin (you can edit per item later).'}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-8 flex items-center justify-between">
        <button type="button" onClick={onBack} className="btn btn-secondary">
          {isVi ? '← Chọn lại file khác' : 'Back'}
        </button>
        <button
          type="button"
          data-testid="confirm-mapping-btn"
          disabled={missingRequired.length > 0 || loading}
          onClick={onConfirm}
          className="btn btn-primary"
        >
          {loading
            ? isVi
              ? 'Đang học thói quen khách hàng…'
              : 'Estimating…'
            : isVi
              ? 'Xác nhận & tính thử ngay'
              : 'Confirm and simulate'}
        </button>
      </div>
    </div>
  );
};

export default MappingScreen;
