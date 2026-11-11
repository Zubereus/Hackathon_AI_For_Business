import React, { useRef, useState } from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { Notice, PageHeader } from '../components/Page';
import { FX_CONFIG } from '../i18n';
import { SAMPLE_CSV_DATASETS } from '../sampleDatasets';

interface UploadScreenProps {
  loading: boolean;
  error: string | null;
  liveApi: boolean;
  onSelectDemo: (label: 'SYNTHETIC' | 'PUBLIC_M5') => void;
  onLoadSample: (sampleId: string) => void;
  onUploadFile: (file: File) => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
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

  const handleFile = (file: File | undefined | null) => {
    setLocalError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setLocalError('Choose a .csv file.');
      return;
    }
    if (file.size === 0) {
      setLocalError('That file is empty.');
      return;
    }
    onUploadFile(file);
  };

  const message = error || localError;

  return (
    <div>
      <PageHeader title="Upload sales history">
        Upload a CSV of daily or per-receipt sales, or start from a sample dataset.
      </PageHeader>

      {message && (
        <div className="mb-6">
          <Notice tone="error" title="Could not use this file.">
            {message}
          </Notice>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="own-file">
          <h2 id="own-file" className="h2 mb-3">
            Your file
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
            className={`flex min-h-[280px] flex-col items-center justify-center rounded-md border border-dashed px-8 py-10 text-center transition-colors ${
              dragActive ? 'border-accent bg-sunken' : 'border-rule-strong bg-surface'
            }`}
          >
            <input
              ref={inputRef}
              id="csv-file-input"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Upload retail sales CSV file"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <p className="text-[18px] font-semibold">Drop a CSV file here</p>
            <p className="mt-1.5 max-w-[42ch] text-muted">
              Column names in Vietnamese or English both work. Prices can use thousand separators.
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
              className="btn btn-primary mt-6"
            >
              {loading ? 'Reading file…' : 'Choose file'}
            </button>
            <p className="hint mt-5">Nothing is saved in your browser's storage.</p>
          </div>
        </section>

        <section aria-labelledby="samples">
          <h2 id="samples" className="h2 mb-3">
            Sample datasets
          </h2>
          <ul className="divide-y divide-rule border-y border-rule">
            <li className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[16px] font-semibold">Vietnam fashion shop</h3>
                <DataSourceBadge label="SYNTHETIC" />
              </div>
              <p className="mt-1.5 text-muted">
                Apparel sales with Tết seasonality and promotions. The true price sensitivity is
                known, so results can be checked against it.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelectDemo('SYNTHETIC')}
                className="btn btn-secondary mt-4"
              >
                {loading ? 'Loading…' : 'Load fashion shop sample'}
              </button>
            </li>
            <li className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[16px] font-semibold">M5 Walmart retail</h3>
                <DataSourceBadge label="PUBLIC_M5" />
              </div>
              <p className="mt-1.5 text-muted">
                {`Dairy and hobby products from the public M5 data, shown in VND (${FX_CONFIG.disclaimer}). One product has too little price variation, to show the warning.`}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelectDemo('PUBLIC_M5')}
                className="btn btn-secondary mt-4"
              >
                {loading ? 'Loading…' : 'Load M5 sample'}
              </button>
            </li>
          </ul>
        </section>
      </div>

      <section aria-labelledby="more-samples" className="mt-10 border-t border-rule pt-6">
        <h2 id="more-samples" className="h2">
          Additional Sample Datasets
        </h2>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {(['sales', 'mapping'] as const).map((group) => {
            const datasets = SAMPLE_CSV_DATASETS.filter((dataset) => dataset.group === group);
            const heading =
              group === 'sales' ? 'Retail Sales Data' : 'Data Import & Mapping Samples';

            return (
              <section key={group} aria-labelledby={`sample-group-${group}`}>
                <h3 id={`sample-group-${group}`} className="mb-2 text-[15px] font-semibold">
                  {heading}
                </h3>
                <ul className="divide-y divide-rule border-y border-rule">
                  {datasets.map((dataset) => (
                    <li
                      key={dataset.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{dataset.title}</p>
                        <p className="hint mt-0.5">{dataset.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={loading || !liveApi}
                        onClick={() => onLoadSample(dataset.id)}
                        className="btn btn-secondary shrink-0"
                        title={
                          liveApi
                            ? `Load ${dataset.title} into the ingestion flow`
                            : 'Switch Offline mode off to use the live backend'
                        }
                      >
                        {liveApi ? 'Use sample' : 'Live API required'}
                      </button>
                    </li>
                  ))}
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
