import React, { useRef, useState } from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { AlertTriangleIcon, ArrowRightIcon, FileSpreadsheetIcon, SparklesIcon, UploadIcon } from '../components/Icons';
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
      {/* Surface Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Step 1: Upload Sales History or Pick a Demo Dataset
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Upload your store sales CSV (daily or receipt-level) or immediately evaluate scenarios using pre-verified benchmark datasets.
          </p>
        </div>
        <DataSourceBadge label={activeLabel} />
      </div>

      {(error || localError) && (
        <div
          role="alert"
          className="bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 rounded-xl p-4 text-sm flex items-start gap-3 shadow-sm"
        >
          <div className="p-1 rounded-lg bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 shrink-0">
            <AlertTriangleIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-rose-950 dark:text-rose-100">Upload Notice</p>
            <p className="text-rose-800 dark:text-rose-300 text-xs mt-0.5">{error || localError}</p>
          </div>
        </div>
      )}

      {/* Main 2-Column Balanced Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Interactive CSV Drop Zone */}
        <div className="lg:col-span-7 flex flex-col">
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
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 min-h-[340px] ${
              dragActive
                ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-4 ring-indigo-500/20'
                : 'border-slate-300 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 shadow-sm'
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
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm mb-4 transition-transform hover:scale-105">
              <UploadIcon className="w-8 h-8" />
            </div>
            <p className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight">
              Drag & drop your retail sales CSV here
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
              Supports messy Vietnamese or English headers, thousand-separated VND amounts, and raw receipt-level transactions. Data stays strictly in session memory and is never saved to localStorage.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">.csv only</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">UTF-8 / ASCII</span>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">VND currency</span>
            </div>
            <div className="mt-6">
              <button
                type="button"
                disabled={loading}
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-md shadow-indigo-500/10 disabled:opacity-50"
              >
                <FileSpreadsheetIcon className="w-4 h-4 text-slate-300 dark:text-indigo-200" />
                <span>{loading ? 'Profiling CSV...' : 'Choose CSV File'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Prominent Benchmark Demo Cards */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center gap-2 px-1">
            <SparklesIcon className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Or start immediately with verified demo data
            </h3>
          </div>

          {/* Synthetic Demo Card */}
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-amber-500/40 dark:hover:border-amber-500/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between flex-1 group">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-slate-900 dark:text-white tracking-tight">Synthetic Vietnam Fashion Shop</span>
                <DataSourceBadge label="SYNTHETIC" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                365 days across Vietnamese apparel SKUs (Áo thun basic, Áo sơ mi trắng, Quần jeans nam, Váy midi) with Tet seasonality, markdown promos, and known ground-truth elasticity.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">12 SKUs</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">VND currency</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">Tet Peak</span>
              </div>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => onSelectDemo('SYNTHETIC')}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white text-xs font-semibold rounded-xl shadow-md shadow-amber-600/10 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Loading...' : 'Load Synthetic Shop Demo'}</span>
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* M5 Public Demo Card */}
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between flex-1 group">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-slate-900 dark:text-white tracking-tight">Public M5 Walmart Retail Demo</span>
                <DataSourceBadge label="PUBLIC_M5" />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Real US store SKUs (Dairy & Hobby) converted from USD into VND ({FX_CONFIG.disclaimer}). Includes intentional low-price-variation warning example.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">10 SKUs</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">USD→VND</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">Benchmark</span>
              </div>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => onSelectDemo('PUBLIC_M5')}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/10 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Loading...' : 'Load Public M5 Demo'}</span>
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadScreen;
