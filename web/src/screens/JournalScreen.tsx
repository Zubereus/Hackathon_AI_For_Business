import React, { useEffect, useState } from 'react';
import { ApiClient } from '../api';
import { Notice, PageHeader } from '../components/Page';
import { formatInt, formatPct, formatVND, Lang } from '../i18n';
import { DecisionRecord, JournalListResponse } from '../types';

interface JournalScreenProps {
  lang: Lang;
  client: ApiClient;
  activeDatasetId: string;
  useFixtures: boolean;
}

export const JournalScreen: React.FC<JournalScreenProps> = ({
  lang,
  client,
  activeDatasetId,
  useFixtures,
}) => {
  const isVi = lang === 'vi';
  const [data, setData] = useState<JournalListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row quick outcome/status editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actualQtyInput, setActualQtyInput] = useState<string>('');
  const [actualRevInput, setActualRevInput] = useState<string>('');
  const [actualProfInput, setActualProfInput] = useState<string>('');
  const [evalDateInput, setEvalDateInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.listJournal();
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [client]);

  const openEditor = (item: DecisionRecord) => {
    setEditingId(item.id);
    setActualQtyInput(item.actual_qty !== null && item.actual_qty !== undefined ? String(item.actual_qty) : '');
    setActualRevInput(item.actual_revenue_vnd !== null && item.actual_revenue_vnd !== undefined ? String(item.actual_revenue_vnd) : '');
    setActualProfInput(item.actual_profit_vnd !== null && item.actual_profit_vnd !== undefined ? String(item.actual_profit_vnd) : '');
    setEvalDateInput(item.implemented_at ?? '');
    setNotesInput(item.notes ?? '');
  };

  const handleMarkImplemented = async (item: DecisionRecord) => {
    setLoading(true);
    setError(null);
    try {
      await client.updateJournalEntry(item.id, { status: 'implemented' });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveManualActuals = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await client.updateJournalEntry(id, {
        status: actualProfInput.trim() ? 'evaluated' : undefined,
        actual_qty: actualQtyInput.trim() ? Number(actualQtyInput) : null,
        actual_revenue_vnd: actualRevInput.trim() ? Number(actualRevInput) : null,
        actual_profit_vnd: actualProfInput.trim() ? Number(actualProfInput) : null,
        notes: notesInput,
      });
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAutoEvaluateFromCsv = async (item: DecisionRecord) => {
    if (!evalDateInput.trim()) {
      setError(isVi ? 'Hãy nhập ngày bắt đầu áp dụng (YYYY-MM-DD).' : 'Enter implementation start date (YYYY-MM-DD).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await client.evaluateJournalFromDataset(
        item.id,
        activeDatasetId || item.dataset_id,
        evalDateInput.trim(),
        item.horizon_days
      );
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await client.deleteJournalEntry(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="journal-screen">
      <PageHeader title={isVi ? 'Nhật ký Quyết định Kinh doanh (Simulated vs Actual)' : 'Business Decision Journal (Simulated vs Actual)'}>
        {isVi
          ? 'Lưu trữ kịch bản đã mô phỏng vào SQLite backend, theo dõi quá trình áp dụng và đối soát sai số lợi nhuận thực tế so với dải tin cậy P5–P95.'
          : 'Persists simulated pricing decisions into SQLite backend storage, tracks implementation dates, and audits real outcomes against Monte Carlo P5–P95 bands.'}
      </PageHeader>

      {useFixtures && (
        <Notice tone="warn" title={isVi ? 'Chế độ xem mẫu:' : 'Sample snapshot mode:'}>
          {isVi
            ? 'Nhật ký quyết định lưu bền vững trong SQLite khi kết nối máy chủ thực (tắt Chế độ xem mẫu).'
            : 'Persistent SQLite journal requires live backend mode (turn off Sample snapshot mode).'}
        </Notice>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="panel p-4">
          <p className="hint">{isVi ? 'Tổng quyết định đã lưu' : 'Total Logged Decisions'}</p>
          <p className="mt-1 text-[22px] font-bold text-ink">{data?.total_count ?? 0}</p>
        </div>
        <div className="panel p-4">
          <p className="hint">{isVi ? 'Đã đối soát thực tế' : 'Evaluated Outcomes'}</p>
          <p className="mt-1 text-[22px] font-bold text-ink">{data?.evaluated_count ?? 0}</p>
        </div>
        <div className="panel p-4">
          <p className="hint">{isVi ? 'Tỉ lệ rơi trong dải P5–P95' : 'Within P5–P95 Band'}</p>
          <p className="mt-1 text-[22px] font-bold text-good">
            {data?.within_band_rate_pct !== null && data?.within_band_rate_pct !== undefined
              ? `${data.within_band_rate_pct.toFixed(1)}%`
              : '—'}
          </p>
        </div>
        <div className="panel p-4">
          <p className="hint">{isVi ? 'Tổng lãi Thực tế / Dự báo' : 'Actual vs Simulated Profit'}</p>
          <p className="mt-1 text-[16px] font-bold text-ink">
            {formatVND(data?.cumulative_actual_profit_vnd ?? 0)}
            <span className="ml-1 text-[12px] font-normal text-muted">
              / {formatVND(data?.cumulative_simulated_profit_vnd ?? 0)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="hint">
          {isVi
            ? 'Mẹo: Bấm "Lưu vào Nhật ký" trong tab Thử kịch bản giá hoặc Tìm giá đạt mục tiêu lãi để thêm phương án mới.'
            : 'Tip: Click "Save to Journal" inside Simulate Price Plan or Find Target Price to log a new decision.'}
        </p>
        <button type="button" onClick={refresh} disabled={loading} className="btn btn-secondary text-[13px]">
          {isVi ? 'Làm mới' : 'Refresh'}
        </button>
      </div>

      {(!data || data.items.length === 0) ? (
        <div className="panel p-8 text-center text-muted">
          {isVi
            ? 'Chưa có quyết định nào được lưu trong Nhật ký SQLite. Hãy chạy một kịch bản giá và bấm "Lưu vào Nhật ký" để bắt đầu theo dõi!'
            : 'No decisions persisted in SQLite journal yet. Run a pricing simulation and click "Save to Decision Journal" to start tracking.'}
        </div>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <article key={item.id} className="panel p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${
                      item.status === 'evaluated'
                        ? 'border-good/50 bg-good-bg text-good'
                        : item.status === 'implemented'
                          ? 'border-cobalt/50 bg-cobalt-bg text-cobalt'
                          : 'border-rule bg-sunken text-muted'
                    }`}>
                      {item.status}
                    </span>
                    <span className="font-bold text-ink">{item.title}</span>
                    <span className="hint text-[12px]">({item.product_id} · {item.horizon_days}d · {item.data_label})</span>
                  </div>
                  <p className="hint mt-1 text-[12px]">
                    {isVi ? 'Giá kế hoạch:' : 'Planned price:'}{' '}
                    <strong className="text-ink">{formatVND(item.planned_price_vnd)}</strong> (
                    {item.planned_price_change_pct > 0 ? `+${item.planned_price_change_pct}%` : `${item.planned_price_change_pct}%`}
                    ) · {isVi ? 'Tạo lúc' : 'Logged'}: {item.created_at.slice(0, 10)}
                    {item.implemented_at ? ` · ${isVi ? 'Áp dụng từ' : 'Implemented'}: ${item.implemented_at}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.status === 'planned' && (
                    <button type="button" onClick={() => handleMarkImplemented(item)} className="btn btn-secondary py-1 text-[12px]">
                      {isVi ? 'Đánh dấu Đã áp dụng' : 'Mark Implemented'}
                    </button>
                  )}
                  <button type="button" onClick={() => editingId === item.id ? setEditingId(null) : openEditor(item)} className="btn btn-secondary py-1 text-[12px]">
                    {editingId === item.id ? (isVi ? 'Đóng' : 'Close') : isVi ? 'Đối soát / Ghi chú' : 'Evaluate / Notes'}
                  </button>
                  <button type="button" onClick={() => handleDelete(item.id)} className="btn btn-quiet py-1 text-[12px] text-bad">
                    {isVi ? 'Xóa' : 'Delete'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 border-t border-rule pt-3 text-[13px] sm:grid-cols-4">
                <div>
                  <span className="hint block text-[11px]">{isVi ? 'Lãi dự báo (P50 / Kỳ vọng)' : 'Simulated Profit'}</span>
                  <strong className="text-ink">{formatVND(item.expected_profit_vnd)}</strong>
                  <span className="hint block text-[11px]">({formatInt(item.expected_qty)} sp)</span>
                </div>
                <div>
                  <span className="hint block text-[11px]">{isVi ? 'Dải tin cậy P5–P95' : 'Monte Carlo P5–P95'}</span>
                  <span className="text-ink">{formatVND(item.p5_profit_vnd)} → {formatVND(item.p95_profit_vnd)}</span>
                </div>
                <div>
                  <span className="hint block text-[11px]">{isVi ? 'Kết quả thực tế' : 'Actual Outcome'}</span>
                  <strong className="text-ink">
                    {item.actual_profit_vnd !== null && item.actual_profit_vnd !== undefined
                      ? formatVND(item.actual_profit_vnd)
                      : isVi ? 'Chưa cập nhật' : 'Pending'}
                  </strong>
                  {item.actual_qty !== null && item.actual_qty !== undefined && (
                    <span className="hint block text-[11px]">({formatInt(item.actual_qty)} sp)</span>
                  )}
                </div>
                <div>
                  <span className="hint block text-[11px]">{isVi ? 'Chênh lệch & Kiểm chuẩn' : 'Variance & Band Check'}</span>
                  {item.profit_variance_vnd !== null && item.profit_variance_vnd !== undefined ? (
                    <div className="flex items-center gap-1.5">
                      <span className={item.profit_variance_vnd >= 0 ? 'font-semibold text-good' : 'font-semibold text-bad'}>
                        {item.profit_variance_vnd >= 0 ? '+' : ''}{formatVND(item.profit_variance_vnd)}
                        {item.profit_variance_pct !== null && item.profit_variance_pct !== undefined
                          ? ` (${formatPct(item.profit_variance_pct)})`
                          : ''}
                      </span>
                      <span className={`badge ${item.within_p5_p95_band ? 'border-good/40 bg-good-bg text-good' : 'border-bad/40 bg-bad-bg text-bad'}`}>
                        {item.within_p5_p95_band ? (isVi ? 'Trong P5–P95' : 'Inside Band') : (isVi ? 'Ngoài dải' : 'Outside Band')}
                      </span>
                    </div>
                  ) : (
                    <span className="hint">—</span>
                  )}
                </div>
              </div>

              {item.notes && <p className="text-[13px] text-muted">{isVi ? 'Ghi chú:' : 'Notes:'} {item.notes}</p>}

              {editingId === item.id && (
                <div className="rounded-xl border border-rule bg-sunken/70 p-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <label className="label">{isVi ? 'Số lượng thực bán' : 'Actual Qty Sold'}</label>
                      <input type="number" value={actualQtyInput} onChange={(e) => setActualQtyInput(e.target.value)} className="field field-num" />
                    </div>
                    <div>
                      <label className="label">{isVi ? 'Doanh thu thực (₫)' : 'Actual Revenue (₫)'}</label>
                      <input type="number" value={actualRevInput} onChange={(e) => setActualRevInput(e.target.value)} className="field field-num" />
                    </div>
                    <div>
                      <label className="label">{isVi ? 'Lãi thực tế (₫)' : 'Actual Net Profit (₫)'}</label>
                      <input type="number" value={actualProfInput} onChange={(e) => setActualProfInput(e.target.value)} className="field field-num" />
                    </div>
                    <div>
                      <label className="label">{isVi ? 'Hoặc đo tự động từ ngày CSV' : 'Or Auto-Measure CSV Date'}</label>
                      <input type="date" value={evalDateInput} onChange={(e) => setEvalDateInput(e.target.value)} className="field" />
                    </div>
                  </div>
                  <div>
                    <label className="label">{isVi ? 'Ghi chú bối cảnh & bài học' : 'Decision Notes & Learnings'}</label>
                    <input type="text" value={notesInput} onChange={(e) => setNotesInput(e.target.value)} className="field" />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={loading} onClick={() => handleAutoEvaluateFromCsv(item)} className="btn btn-secondary text-[12.5px]">
                      {isVi ? 'Đo tự động từ dữ liệu CSV' : 'Auto-Measure from CSV'}
                    </button>
                    <button type="button" disabled={loading} onClick={() => handleSaveManualActuals(item.id)} className="btn btn-primary text-[12.5px]">
                      {isVi ? 'Lưu đối soát' : 'Save Outcome'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default JournalScreen;

