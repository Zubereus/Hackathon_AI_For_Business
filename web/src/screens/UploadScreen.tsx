import React, { useRef, useState } from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { FX_CONFIG } from '../i18n';
import { DataLabel } from '../types';

interface UploadScreenProps {
  activeLabel: DataLabel;
  loading: boolean;
  error: string | null;
  onSelectDemo: (label: 'SYNTHETIC' | 'PUBLIC_M5') => void;
  onUploadFile: (file: File) => void;
}

export const UploadScreen: React.FC<UploadScreenProps> = ({
  activeLabel,
  loading,
  error,
  onSelectDemo,
  onUploadFile,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File | undefined | null) => {
    setLocalError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setLocalError('Please select a valid .csv sales history file.');
      return;
    }
    if (file.size === 0) {
      setLocalError('The selected CSV file is empty.');
      return;
    }
    onUploadFile(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Step 1: Upload Sales History or Pick a Demo Dataset</h2>
          <p className="text-sm text-slate-600 mt-1">
            Upload your store CSV (daily or receipt-level) or explore immediately with labeled benchmark datasets.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {(error || localError) && (
        <div
          role="alert"
          className="bg-red-50 border border-red-300 text-red-900 rounded-lg p-4 text-sm flex items-start gap-3"
        >
          <span className="font-bold" aria-hidden="true">⚠</span>
          <div>
            <p className="font-semibold">Upload Notice</p>
            <p>{error || localError}</p>
          </div>
        </div>
      )}

      {/* Drag & Drop Zone */}
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
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-600 bg-blue-50'
            : 'border-slate-300 bg-white hover:border-slate-400'
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
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xl font-bold mb-3">
          ↑
        </div>
        <p className="text-base font-semibold text-slate-900">Drag & drop your retail sales CSV here</p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Supports messy Vietnamese or English headers, thousand-separated VND, and receipt-level rows. Uploaded data stays in session memory only (never stored in browser localStorage).
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex items-center px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Profiling CSV...' : 'Choose CSV File'}
        </button>
      </div>

      {/* Demo Dataset Picker */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Or start immediately with a verified benchmark dataset
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-slate-900">Synthetic Vietnam Fashion Shop</span>
                <DataSourceBadge label="SYNTHETIC" />
              </div>
              <p className="text-sm text-slate-600">
                365 days across Vietnamese apparel SKUs (Áo thun basic, Áo sơ mi trắng, Quần jeans nam, Váy midi) with Tet seasonality, markdown promos, and known ground-truth elasticity.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => onSelectDemo('SYNTHETIC')}
              className="mt-4 w-full px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load Synthetic Shop Demo →'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-slate-900">Public M5 Walmart Retail Demo</span>
                <DataSourceBadge label="PUBLIC_M5" />
              </div>
              <p className="text-sm text-slate-600">
                Real US store SKUs (Dairy & Hobby) scaled from USD into VND ({FX_CONFIG.disclaimer}). Includes intentional low-price-variation warning example.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => onSelectDemo('PUBLIC_M5')}
              className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load Public M5 Demo →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadScreen;
