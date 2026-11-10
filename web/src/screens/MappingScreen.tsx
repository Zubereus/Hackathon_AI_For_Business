import React from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { AlertTriangleIcon, ArrowLeftIcon, ArrowRightIcon, XIcon } from '../components/Icons';
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Step 2: Confirm Column Mapping</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            File: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{fileName || 'Sample Dataset'}</span> ({nRows.toLocaleString()} rows). Verify how each spreadsheet column maps to the canonical schema.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {error && (
        <div role="alert" className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 rounded-xl p-4 text-sm flex items-start gap-3 shadow-sm">
          <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 shrink-0">
            <AlertTriangleIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-rose-950 dark:text-rose-100">Mapping commit failed</p>
            <p className="text-rose-800 dark:text-rose-300 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {missingRequired.length > 0 && (
        <div
          role="alert"
          data-testid="missing-required-banner"
          className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 rounded-xl p-4 text-sm flex items-start gap-3 shadow-sm"
        >
          <div className="p-1 rounded-lg bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 shrink-0">
            <XIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-rose-950 dark:text-rose-100">Required fields missing — Confirm is blocked</p>
            <p className="text-rose-800 dark:text-rose-300 text-xs mt-0.5">
              Please map: <span className="font-mono font-bold text-rose-950 dark:text-white">{missingRequired.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 rounded-xl p-4 text-sm flex items-start gap-3 shadow-sm">
          <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 shrink-0">
            <AlertTriangleIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-amber-950 dark:text-amber-100 mb-1">Mapping Warnings</p>
            <ul className="list-disc pl-4 space-y-0.5 text-xs text-amber-900 dark:text-amber-300">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Mapping Table */}
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800 text-sm">
            <thead className="bg-slate-50/75 dark:bg-slate-950/70">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Your Column</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Canonical Field</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Confidence & Method</th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Masked Samples</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {columns.map((col) => {
                const selectedCanon = sourceToCanonical[col.name] ?? '';
                const meta = metaBySource.get(col.name);
                const confPct = meta ? Math.round(meta.confidence * 100) : selectedCanon ? 100 : 0;
                const isManual = meta ? meta.canonical !== selectedCanon : selectedCanon !== '';

                return (
                  <tr key={col.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-white">
                      <div className="font-semibold">{col.name}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                        {col.dtype_guess} · {col.n_unique} unique
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <label htmlFor={`map-select-${col.name}`} className="sr-only">
                        Canonical field for {col.name}
                      </label>
                      <select
                        id={`map-select-${col.name}`}
                        aria-label={`Canonical field for ${col.name}`}
                        value={selectedCanon}
                        onChange={(e) => onChangeColumnMapping(col.name, e.target.value)}
                        className="w-full max-w-xs border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 shadow-sm"
                      >
                        {CANONICAL_FIELDS.map((opt) => (
                          <option key={opt.value || 'ignore'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                        <option value={`extra_${col.name}`}>extra_{col.name} (Optional covariate)</option>
                      </select>
                    </td>
                    <td className="px-5 py-3.5 min-w-[180px]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-700">
                          <div
                            className={`h-full transition-all duration-300 ${
                              confPct >= 85
                                ? 'bg-emerald-500'
                                : confPct >= 60
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`}
                            style={{ width: `${confPct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {confPct}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 capitalize">
                        {isManual ? 'manual override' : meta?.method || 'unmapped'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {col.samples.slice(0, 3).map((s, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-2.5 py-0.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200/70 dark:border-slate-700"
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

      {/* Commit Options & Missing-Cost Margin Fallback */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label htmlFor="opt-price-unit" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Price Unit in CSV
          </label>
          <select
            id="opt-price-unit"
            value={options.price_unit}
            onChange={(e) => onChangeOptions({ ...options, price_unit: e.target.value })}
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="VND">Exact VND (e.g. 95000)</option>
            <option value="K_VND">Thousand VND (x1.000 ₫)</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-date-format" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Date Format
          </label>
          <select
            id="opt-date-format"
            value={options.date_format ?? ''}
            onChange={(e) =>
              onChangeOptions({ ...options, date_format: e.target.value || null })
            }
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Auto-detect</option>
            <option value="%d/%m/%Y">DD/MM/YYYY (VN)</option>
            <option value="%Y-%m-%d">YYYY-MM-DD (ISO)</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-number-locale" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Number Locale
          </label>
          <select
            id="opt-number-locale"
            value={options.number_locale ?? ''}
            onChange={(e) =>
              onChangeOptions({ ...options, number_locale: e.target.value || null })
            }
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Auto-detect</option>
            <option value="vi_VN">Vietnamese (100.000,5)</option>
            <option value="en_US">English (100,000.5)</option>
          </select>
        </div>

        <div>
          <label htmlFor="opt-margin-pct" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Fallback Gross Margin % {!hasUnitCost && <span className="text-amber-500 font-normal">(Cost missing)</span>}
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
            className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:text-slate-400 shadow-sm"
          />
          {!hasUnitCost && (
            <p className="text-[11px] text-amber-500 mt-1">
              Assumption flagged: unit cost derived from this margin %.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm transition-all"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span>Back to Upload</span>
        </button>
        <button
          type="button"
          data-testid="confirm-mapping-btn"
          disabled={missingRequired.length > 0 || loading}
          onClick={onConfirm}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] rounded-xl shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>{loading ? 'Fitting Elasticity Model...' : 'Confirm Mapping & Estimate Elasticity'}</span>
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default MappingScreen;
