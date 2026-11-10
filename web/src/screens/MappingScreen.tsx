import React from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { ColumnMappingItem, ColumnProfile, DataLabel, IngestCommitOptions } from '../types';

export const CANONICAL_FIELDS: Array<{ value: string; label: string; required?: boolean }> = [
  { value: '', label: '-- Ignore column --' },
  { value: 'date', label: 'date (Required)', required: true },
  { value: 'quantity', label: 'quantity (Required)', required: true },
  { value: 'price', label: 'price (Required)', required: true },
  { value: 'product_id', label: 'product_id (Required*)', required: true },
  { value: 'product_name', label: 'product_name (Required*)' },
  { value: 'unit_cost', label: 'unit_cost (Optional)' },
  { value: 'category', label: 'category (Optional)' },
  { value: 'stock', label: 'stock (Optional)' },
  { value: 'promo', label: 'promo (Optional)' },
];

interface MappingScreenProps {
  activeLabel: DataLabel;
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

export const MappingScreen: React.FC<MappingScreenProps> = ({
  activeLabel,
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Step 2: Confirm Column Mapping</h2>
          <p className="text-sm text-slate-600 mt-1">
            File: <span className="font-mono font-semibold">{fileName || 'Sample Dataset'}</span> ({nRows} rows). Verify how each spreadsheet column maps to the canonical schema.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {error && (
        <div role="alert" className="bg-red-50 border border-red-300 text-red-900 rounded-lg p-4 text-sm">
          <strong>Mapping commit failed: </strong>
          {error}
        </div>
      )}

      {missingRequired.length > 0 && (
        <div
          role="alert"
          data-testid="missing-required-banner"
          className="bg-red-50 border-2 border-red-400 text-red-900 rounded-lg p-4 text-sm flex items-start gap-3"
        >
          <span className="font-bold text-base" aria-hidden="true">✕</span>
          <div>
            <p className="font-bold">Required fields missing — Confirm is blocked</p>
            <p className="mt-0.5">
              Please map: <span className="font-mono font-semibold">{missingRequired.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-lg p-4 text-sm">
          <p className="font-semibold mb-1">Mapping Warnings</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Your Column</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Canonical Field</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Confidence & Method</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Masked Samples (up to 3)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {columns.map((col) => {
              const selectedCanon = sourceToCanonical[col.name] ?? '';
              const meta = metaBySource.get(col.name);
              const confPct = meta ? Math.round(meta.confidence * 100) : selectedCanon ? 100 : 0;
              const isManual = meta ? meta.canonical !== selectedCanon : selectedCanon !== '';

              return (
                <tr key={col.name} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div>{col.name}</div>
                    <div className="text-xs text-slate-500">
                      {col.dtype_guess} · {col.n_unique} unique
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <label htmlFor={`map-select-${col.name}`} className="sr-only">
                      Canonical field for {col.name}
                    </label>
                    <select
                      id={`map-select-${col.name}`}
                      aria-label={`Canonical field for ${col.name}`}
                      value={selectedCanon}
                      onChange={(e) => onChangeColumnMapping(col.name, e.target.value)}
                      className="w-full max-w-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {CANONICAL_FIELDS.map((opt) => (
                        <option key={opt.value || 'ignore'} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value={`extra_${col.name}`}>extra_{col.name} (Optional covariate)</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            confPct >= 85
                              ? 'bg-emerald-500'
                              : confPct >= 60
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                          style={{ width: `${confPct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold text-slate-700">
                        {confPct}%
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {isManual ? 'manual override' : meta?.method || 'unmapped'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {col.samples.slice(0, 3).map((s, idx) => (
                        <span
                          key={idx}
                          className="inline-block px-2 py-0.5 text-xs font-mono bg-slate-100 text-slate-700 rounded border border-slate-200"
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

      {/* Commit Options & Missing-Cost Margin Fallback */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label htmlFor="opt-price-unit" className="block text-xs font-semibold text-slate-700 mb-1">
            Price Unit in CSV
          </label>
          <select
            id="opt-price-unit"
            value={options.price_unit}
            onChange={(e) => onChangeOptions({ ...options, price_unit: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="VND">Exact VND (e.g. 95000)</option>
            <option value="K_VND">Thousand VND (x1.000 ₫)</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-date-format" className="block text-xs font-semibold text-slate-700 mb-1">
            Date Format
          </label>
          <select
            id="opt-date-format"
            value={options.date_format ?? ''}
            onChange={(e) =>
              onChangeOptions({ ...options, date_format: e.target.value || null })
            }
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Auto-detect</option>
            <option value="%d/%m/%Y">DD/MM/YYYY (VN)</option>
            <option value="%Y-%m-%d">YYYY-MM-DD (ISO)</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-number-locale" className="block text-xs font-semibold text-slate-700 mb-1">
            Number Locale
          </label>
          <select
            id="opt-number-locale"
            value={options.number_locale ?? ''}
            onChange={(e) =>
              onChangeOptions({ ...options, number_locale: e.target.value || null })
            }
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            <option value="">Auto-detect</option>
            <option value="vi_VN">Vietnamese (100.000,5)</option>
            <option value="en_US">English (100,000.5)</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-margin-pct" className="block text-xs font-semibold text-slate-700 mb-1">
            Fallback Gross Margin % {!hasUnitCost && <span className="text-amber-700">(Cost missing)</span>}
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
            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-500"
          />
          {!hasUnitCost && (
            <p className="text-[11px] text-amber-700 mt-1">
              Assumption flagged: unit cost derived from this margin %.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          ← Back to Upload
        </button>
        <button
          type="button"
          data-testid="confirm-mapping-btn"
          disabled={missingRequired.length > 0 || loading}
          onClick={onConfirm}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
        >
          {loading ? 'Fitting Elasticity Model...' : 'Confirm Mapping & Estimate Elasticity →'}
        </button>
      </div>
    </div>
  );
};

export default MappingScreen;

