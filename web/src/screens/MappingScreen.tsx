import React from 'react';
import { Notice, PageHeader } from '../components/Page';
import { ColumnMappingItem, ColumnProfile, IngestCommitOptions } from '../types';

type FieldGroup = 'needed' | 'product' | 'optional';

export const CANONICAL_FIELDS: Array<{ value: string; label: string; group: FieldGroup }> = [
  { value: 'date', label: 'Date', group: 'needed' },
  { value: 'quantity', label: 'Quantity sold', group: 'needed' },
  { value: 'price', label: 'Price', group: 'needed' },
  { value: 'product_id', label: 'Product ID', group: 'product' },
  { value: 'product_name', label: 'Product name', group: 'product' },
  { value: 'unit_cost', label: 'Unit cost', group: 'optional' },
  { value: 'category', label: 'Category', group: 'optional' },
  { value: 'stock', label: 'Stock on hand', group: 'optional' },
  { value: 'promo', label: 'Promotion flag', group: 'optional' },
];

const GROUP_LABELS: Record<FieldGroup, string> = {
  needed: 'Needed',
  product: 'Product (at least one)',
  optional: 'Optional',
};

interface MappingScreenProps {
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
    <div>
      <PageHeader title="Confirm columns">
        {`${fileName || 'Sample dataset'}, ${nRows.toLocaleString()} rows. Check which field each column feeds. A date, quantity, price and a product ID or name are required.`}
      </PageHeader>

      <div className="space-y-3">
        {error && (
          <Notice tone="error" title="Could not apply the mapping.">
            {error}
          </Notice>
        )}

        {missingRequired.length > 0 && (
          <Notice tone="error" testId="missing-required-banner" title="Confirm is blocked.">
            {`Still needed: ${missingRequired.join(', ')}`}
          </Notice>
        )}

        {warnings.length > 0 && (
          <Notice tone="warn" title="Check these first.">
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
                  Your column
                </th>
                <th scope="col">Field</th>
                <th scope="col">Match</th>
                <th scope="col">Sample values</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => {
                const selectedCanon = sourceToCanonical[col.name] ?? '';
                const meta = metaBySource.get(col.name);
                const confPct = meta ? Math.round(meta.confidence * 100) : selectedCanon ? 100 : 0;
                const isManual = meta ? meta.canonical !== selectedCanon : selectedCanon !== '';
                const matchNote = isManual ? 'set by you' : meta?.method.replace(/_/g, ' ') || 'not matched';

                return (
                  <tr key={col.name}>
                    <td className="pl-5">
                      <div className="font-semibold">{col.name}</div>
                      <div className="hint">
                        {col.dtype_guess}, {col.n_unique} distinct values
                      </div>
                    </td>
                    <td className="min-w-[200px]">
                      <label htmlFor={`map-select-${col.name}`} className="sr-only">
                        Field for {col.name}
                      </label>
                      <select
                        id={`map-select-${col.name}`}
                        value={selectedCanon}
                        onChange={(e) => onChangeColumnMapping(col.name, e.target.value)}
                        className="field max-w-[260px]"
                      >
                        <option value="">Ignore this column</option>
                        {GROUPS.map((group) => (
                          <optgroup key={group} label={GROUP_LABELS[group]}>
                            {CANONICAL_FIELDS.filter((f) => f.group === group).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <option value={`extra_${col.name}`}>Keep as extra variable</option>
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

      <section aria-labelledby="read-options" className="mt-10">
        <h2 id="read-options" className="h2 mb-3">
          How to read the file
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="opt-price-unit" className="label">
              Price unit
            </label>
            <select
              id="opt-price-unit"
              value={options.price_unit}
              onChange={(e) => onChangeOptions({ ...options, price_unit: e.target.value })}
              className="field"
            >
              <option value="VND">Exact VND (95000)</option>
              <option value="K_VND">Thousand VND (95 means 95.000 ₫)</option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-date-format" className="label">
              Date format
            </label>
            <select
              id="opt-date-format"
              value={options.date_format ?? ''}
              onChange={(e) => onChangeOptions({ ...options, date_format: e.target.value || null })}
              className="field"
            >
              <option value="">Detect automatically</option>
              <option value="%d/%m/%Y">DD/MM/YYYY</option>
              <option value="%Y-%m-%d">YYYY-MM-DD</option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-number-locale" className="label">
              Number format
            </label>
            <select
              id="opt-number-locale"
              value={options.number_locale ?? ''}
              onChange={(e) =>
                onChangeOptions({ ...options, number_locale: e.target.value || null })
              }
              className="field"
            >
              <option value="">Detect automatically</option>
              <option value="vi_VN">Vietnamese (100.000,5)</option>
              <option value="en_US">English (100,000.5)</option>
            </select>
          </div>

          <div>
            <label htmlFor="opt-margin-pct" className="label">
              Gross margin when cost is missing (%)
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
              className="field"
            />
            {!hasUnitCost && (
              <p className="hint mt-1.5">
                No unit cost column is mapped, so cost is set from this margin. Treat profit as
                approximate.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-10 flex items-center justify-between">
        <button type="button" onClick={onBack} className="btn btn-secondary">
          Back
        </button>
        <button
          type="button"
          data-testid="confirm-mapping-btn"
          disabled={missingRequired.length > 0 || loading}
          onClick={onConfirm}
          className="btn btn-primary"
        >
          {loading ? 'Estimating…' : 'Confirm and estimate'}
        </button>
      </div>
    </div>
  );
};

export default MappingScreen;
