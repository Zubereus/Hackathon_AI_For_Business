import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient, DEFAULT_USE_FIXTURES } from './api';
import { DataSourceBadge } from './components/DataSourceBadge';
import { MoonIcon, SunIcon } from './components/Icons';
import { STRINGS } from './i18n';
import { AssumptionsScreen } from './screens/AssumptionsScreen';
import { MappingScreen } from './screens/MappingScreen';
import { ReverseWhatIfScreen } from './screens/ReverseWhatIfScreen';
import { UploadScreen } from './screens/UploadScreen';
import { ValidationScreen } from './screens/ValidationScreen';
import { WhatIfScreen } from './screens/WhatIfScreen';
import {
  ColumnMappingItem,
  ColumnProfile,
  DataLabel,
  IngestCommitOptions,
  OptimizeResponse,
  ProductElasticity,
  ScreenId,
  SimulateResponse,
} from './types';

interface AppProps {
  initialScreen?: ScreenId;
  initialUseFixtures?: boolean;
}

export const App: React.FC<AppProps> = ({
  initialScreen = 'upload',
  initialUseFixtures = DEFAULT_USE_FIXTURES,
}) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('whatif_theme') !== 'light';
    } catch (error) {
      console.warn('Unable to read saved theme preference.', error);
      return true;
    }
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('whatif_theme', isDark ? 'dark' : 'light');
    } catch (error) {
      console.warn('Unable to save theme preference.', error);
    }
  }, [isDark]);

  const [useFixtures, setUseFixtures] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === '1' || params.get('fixtures') === '1') {
        return true;
      }
    }
    return initialUseFixtures;
  });
  const client = useMemo(() => new ApiClient(useFixtures), [useFixtures]);

  const [activeScreen, setActiveScreen] = useState<ScreenId>(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const s = new URLSearchParams(window.location.search).get('screen') as ScreenId | null;
      if (s) return s;
    }
    return initialScreen;
  });
  const [activeLabel, setActiveLabel] = useState<DataLabel>('SYNTHETIC');
  const [loading, setLoading] = useState(false);
  const [nlqLoading, setNlqLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ingestion & mapping state (strictly in React memory, never localStorage)
  const [uploadId, setUploadId] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [nRows, setNRows] = useState<number>(0);
  const [profileColumns, setProfileColumns] = useState<ColumnProfile[]>([]);
  const [mappingItems, setMappingItems] = useState<ColumnMappingItem[]>([]);
  const [sourceToCanonical, setSourceToCanonical] = useState<Record<string, string>>({});
  const [mappingWarnings, setMappingWarnings] = useState<string[]>([]);
  const [commitOptions, setCommitOptions] = useState<IngestCommitOptions>({
    price_unit: 'VND',
    date_format: null,
    number_locale: null,
    margin_pct: 35,
  });

  // Fitted elasticity & product assumption overrides
  const [products, setProducts] = useState<ProductElasticity[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('P01');
  const [priceChangePct, setPriceChangePct] = useState<number>(10);
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [seed, setSeed] = useState<number>(42);

  // Simulation, explanation & optimize outputs
  const [simulationResult, setSimulationResult] = useState<SimulateResponse | null>(null);
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [simFixtureNote, setSimFixtureNote] = useState<string | null>(null);
  const [nlqStatus, setNlqStatus] = useState<{ type: 'ok' | 'fallback'; message: string } | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResponse | null>(null);
  const [optFixtureNote, setOptFixtureNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) return;
    const params = new URLSearchParams(window.location.search);
    const reqScreen = params.get('screen') as ScreenId | null;
    if (params.get('demo') === '1') {
      const sample = client.getSampleUploadForPreview();
      const mapRecord: Record<string, string> = {};
      for (const col of sample.profile.columns) mapRecord[col.name] = '';
      for (const item of sample.mapping.mapping) {
        if (item.source) mapRecord[item.source] = item.canonical;
      }
      setUploadedFileName('fashion_shop_vn_sample.csv');
      setNRows(sample.profile.n_rows);
      setProfileColumns(sample.profile.columns);
      setMappingItems(sample.mapping.mapping);
      setSourceToCanonical(mapRecord);

      const demo = client.getDemoElasticity('SYNTHETIC').elasticity;
      setActiveLabel(demo.data_label);
      setProducts(demo.products);
      setSelectedProductId('P01');
      void runSimulateInternal(demo.products, 'P01', 10, 42);
      void client
        .optimize(
          {
            product: {
              current_price_vnd: demo.products[0].current_price_vnd,
              unit_cost_vnd: demo.products[0].unit_cost_vnd,
              baseline_qty_per_period: demo.products[0].baseline_qty_per_period,
              elasticity_samples: demo.products[0].elasticity_samples,
            },
            objective: 'hit_target',
            target_profit_uplift_pct: 10,
            constraints: { max_price_change_pct: 30, min_margin_pct: 25, respect_stock: false },
            n_sims: 2000,
            seed: 42,
          },
          { productId: 'P01' }
        )
        .then((res) => {
          setOptimizeResult(res.response);
          setOptFixtureNote(res.fixtureNote ?? null);
        });
      if (reqScreen) setActiveScreen(reqScreen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSimulateInternal = async (
    prodList: ProductElasticity[],
    pid: string,
    pct: number,
    simSeed: number
  ) => {
    const targetProd = prodList.find((p) => p.product_id === pid) ?? prodList[0];
    if (!targetProd) return;

    const respectCap = Boolean(targetProd.enforce_stock_cap && targetProd.stock_available !== null);
    const { response, fixtureNote } = await client.simulate(
      {
        product: {
          current_price_vnd: targetProd.current_price_vnd,
          unit_cost_vnd: targetProd.unit_cost_vnd,
          baseline_qty_per_period: targetProd.baseline_qty_per_period,
          stock_available: respectCap ? targetProd.stock_available : null,
          fixed_cost_vnd: targetProd.fixed_cost_vnd ?? 0,
          elasticity_samples: targetProd.elasticity_samples,
        },
        price_change_pct: pct,
        n_sims: 5000,
        seed: simSeed,
      },
      { productId: targetProd.product_id, respectStockCap: respectCap }
    );

    setSimulationResult(response);
    setSimFixtureNote(fixtureNote ?? null);

    try {
      const exp = await client.nlqExplain(response);
      setExplanationText(exp.text);
    } catch {
      setExplanationText(null);
    }
  };

  const handleSelectDemo = async (demoLabel: 'SYNTHETIC' | 'PUBLIC_M5') => {
    setLoading(true);
    setError(null);
    setOptimizeResult(null);
    try {
      let fitData;
      if (useFixtures || demoLabel === 'PUBLIC_M5') {
        // Synthetic is available in live ml-py too; M5 uses fixture when raw CSV isn't downloaded
        if (!useFixtures && demoLabel === 'SYNTHETIC') {
          fitData = await client.fitElasticity('fashion_shop_12', 'SYNTHETIC');
        } else {
          fitData = client.getDemoElasticity(demoLabel).elasticity;
        }
      } else {
        fitData = await client.fitElasticity('fashion_shop_12', 'SYNTHETIC');
      }

      setActiveLabel(fitData.data_label);
      setProducts(fitData.products);
      const firstId = fitData.products[0]?.product_id ?? 'P01';
      setSelectedProductId(firstId);
      setPriceChangePct(10);
      await runSimulateInternal(fitData.products, firstId, 10, seed);
      setActiveScreen('assumptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed loading demo dataset.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCsv = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const prof = await client.profileCsv(file);
      const mapRes = await client.proposeMapping(prof.upload_id, prof.columns);

      const initialSourceMap: Record<string, string> = {};
      for (const col of prof.columns) {
        initialSourceMap[col.name] = '';
      }
      for (const item of mapRes.mapping) {
        if (item.source && item.source in initialSourceMap) {
          initialSourceMap[item.source] = item.canonical;
        }
      }

      setUploadId(prof.upload_id);
      setUploadedFileName(file.name);
      setNRows(prof.n_rows);
      setProfileColumns(prof.columns);
      setMappingItems(mapRes.mapping);
      setSourceToCanonical(initialSourceMap);
      setMappingWarnings(mapRes.warnings);
      setActiveLabel('USER');
      setActiveScreen('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed profiling uploaded CSV.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeColumnMapping = (sourceCol: string, canonicalField: string) => {
    setSourceToCanonical((prev) => {
      const next = { ...prev };
      // Ensure one canonical field isn't mapped twice from two different columns
      if (canonicalField) {
        for (const [k, v] of Object.entries(next)) {
          if (k !== sourceCol && v === canonicalField) {
            next[k] = '';
          }
        }
      }
      next[sourceCol] = canonicalField;
      return next;
    });
  };

  const handleConfirmMapping = async () => {
    setLoading(true);
    setError(null);
    try {
      const canonToSrc: Record<string, string> = {};
      for (const [src, canon] of Object.entries(sourceToCanonical)) {
        if (canon && canon.trim()) {
          canonToSrc[canon] = src;
        }
      }
      const commitRes = await client.commitMapping(uploadId, canonToSrc, commitOptions);
      const fitRes = await client.fitElasticity(commitRes.dataset_id, commitRes.label);
      setActiveLabel(fitRes.data_label);
      setProducts(fitRes.products);
      const firstId = fitRes.products[0]?.product_id ?? 'P01';
      setSelectedProductId(firstId);
      setPriceChangePct(10);
      await runSimulateInternal(fitRes.products, firstId, 10, seed);
      setActiveScreen('assumptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed fitting elasticity after mapping.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProduct = (productId: string, patch: Partial<ProductElasticity>) => {
    setProducts((prev) =>
      prev.map((p) => (p.product_id === productId ? { ...p, ...patch } : p))
    );
  };

  const handleRunSimulate = async (override?: {
    productId?: string;
    priceChangePct?: number;
    horizonDays?: number;
    seed?: number;
  }) => {
    const pid = override?.productId ?? selectedProductId;
    const pct = override?.priceChangePct ?? priceChangePct;
    const simSeed = override?.seed ?? seed;
    setLoading(true);
    setError(null);
    try {
      await runSimulateInternal(products, pid, pct, simSeed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleParseNLQ = async (question: string) => {
    setNlqLoading(true);
    setNlqStatus(null);
    setError(null);
    try {
      const parsed = await client.nlqParse(question, products);
      if ('fallback' in parsed) {
        setNlqStatus({
          type: 'fallback',
          message: `${parsed.error} Please adjust the manual controls beside this panel.`,
        });
        return;
      }
      setSelectedProductId(parsed.product_id);
      setPriceChangePct(parsed.change_value);
      setHorizonDays(parsed.horizon_days);
      setNlqStatus({
        type: 'ok',
        message: `Parsed: SKU=${parsed.product_id}, change=${parsed.change_value > 0 ? '+' : ''}${parsed.change_value}%, horizon=${parsed.horizon_days} days.`,
      });
      await runSimulateInternal(products, parsed.product_id, parsed.change_value, seed);
    } catch (err) {
      setNlqStatus({
        type: 'fallback',
        message: `${err instanceof Error ? err.message : 'Parser error'}. Using manual controls.`,
      });
    } finally {
      setNlqLoading(false);
    }
  };

  const handleRunOptimize = async (params: {
    productId: string;
    objective: 'max_expected_profit' | 'hit_target';
    targetProfitUpliftPct: number;
    maxPriceChangePct: number;
    minMarginPct: number | null;
    budgetVnd: number | null;
    respectStock: boolean;
    seed: number;
  }) => {
    const prod = products.find((p) => p.product_id === params.productId) ?? products[0];
    if (!prod) return;

    setLoading(true);
    setError(null);
    try {
      const { response, fixtureNote } = await client.optimize(
        {
          product: {
            current_price_vnd: prod.current_price_vnd,
            unit_cost_vnd: prod.unit_cost_vnd,
            baseline_qty_per_period: prod.baseline_qty_per_period,
            stock_available: params.respectStock ? prod.stock_available : null,
            fixed_cost_vnd: prod.fixed_cost_vnd ?? 0,
            elasticity_samples: prod.elasticity_samples,
          },
          objective: params.objective,
          target_profit_uplift_pct: params.targetProfitUpliftPct,
          constraints: {
            max_price_change_pct: params.maxPriceChangePct,
            min_margin_pct: params.minMarginPct,
            budget_vnd: params.budgetVnd,
            respect_stock: params.respectStock,
          },
          n_sims: 2000,
          seed: params.seed,
        },
        { productId: prod.product_id }
      );
      setOptimizeResult(response);
      setOptFixtureNote(fixtureNote ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar with Glassmorphic Header */}
      <header className="bg-white/90 dark:bg-[#0E1526]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-0 z-30 transition-all shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-extrabold flex items-center justify-center text-sm shadow-sm ring-1 ring-slate-900/10 dark:ring-white/20 tracking-tight">
              W?
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                  {STRINGS.appTitle}
                </h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                  Decision Sim
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">{STRINGS.appSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DataSourceBadge label={activeLabel} />
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 transition-colors border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useFixtures}
                onChange={(e) => setUseFixtures(e.target.checked)}
                className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="tabular-nums font-mono text-[11px]">
                {useFixtures ? 'Offline Fixtures' : 'Live Go API (:8080)'}
              </span>
            </label>

            {/* Dark / Light Mode Toggle for Instant Eye Comfort */}
            <button
              type="button"
              onClick={() => setIsDark(!isDark)}
              title={isDark ? 'Switch to Light Theme' : 'Switch to Eye-Comfort Dark Theme'}
              className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-colors"
            >
              {isDark ? <SunIcon className="w-4 h-4 text-amber-400" /> : <MoonIcon className="w-4 h-4 text-slate-700" />}
            </button>
          </div>
        </div>

        {/* Executive Stepper Navigation */}
        <nav
          aria-label="Workflow steps"
          className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 dark:border-slate-800/60"
        >
          {STRINGS.nav.map((item, idx) => {
            const isActive = activeScreen === item.id;
            const needsProducts =
              item.id === 'assumptions' || item.id === 'whatif' || item.id === 'reverse';
            const needsMapping = item.id === 'mapping' && profileColumns.length === 0;
            const isDisabled = (needsProducts && products.length === 0) || needsMapping;

            return (
              <button
                key={item.id}
                type="button"
                disabled={isDisabled}
                onClick={() => setActiveScreen(item.id)}
                className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-sm ring-1 ring-slate-900/10 dark:ring-indigo-500/20'
                    : isDisabled
                    ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60 active:bg-slate-200/60'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : isDisabled
                      ? 'bg-slate-200/60 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-slate-300 dark:group-hover:bg-slate-700'
                  }`}
                >
                  {item.step}.
                </span>
                <span className="tracking-tight">{item.label}</span>
                {idx < STRINGS.nav.length - 1 && (
                  <span className="hidden md:inline-block ml-1 text-slate-300 dark:text-slate-700 pointer-events-none select-none">
                    /
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeScreen === 'upload' && (
          <UploadScreen
            activeLabel={activeLabel}
            loading={loading}
            error={error}
            onSelectDemo={handleSelectDemo}
            onUploadFile={handleUploadCsv}
          />
        )}

        {activeScreen === 'mapping' && (
          <MappingScreen
            activeLabel={activeLabel}
            fileName={uploadedFileName}
            nRows={nRows}
            columns={profileColumns}
            mappingItems={mappingItems}
            sourceToCanonical={sourceToCanonical}
            options={commitOptions}
            warnings={mappingWarnings}
            loading={loading}
            error={error}
            onChangeColumnMapping={handleChangeColumnMapping}
            onChangeOptions={setCommitOptions}
            onConfirm={handleConfirmMapping}
            onBack={() => setActiveScreen('upload')}
          />
        )}

        {activeScreen === 'assumptions' && (
          <AssumptionsScreen
            activeLabel={activeLabel}
            products={products}
            onUpdateProduct={handleUpdateProduct}
            onProceedToWhatIf={() => {
              runSimulateInternal(products, selectedProductId, priceChangePct, seed);
              setActiveScreen('whatif');
            }}
          />
        )}

        {activeScreen === 'whatif' && (
          <WhatIfScreen
            activeLabel={activeLabel}
            products={products}
            selectedProductId={selectedProductId}
            priceChangePct={priceChangePct}
            horizonDays={horizonDays}
            seed={seed}
            simulationResult={simulationResult}
            explanationText={explanationText}
            fixtureNote={simFixtureNote}
            nlqStatus={nlqStatus}
            loading={loading}
            nlqLoading={nlqLoading}
            error={error}
            onChangeParams={(patch) => {
              if (patch.productId !== undefined) setSelectedProductId(patch.productId);
              if (patch.priceChangePct !== undefined) setPriceChangePct(patch.priceChangePct);
              if (patch.horizonDays !== undefined) setHorizonDays(patch.horizonDays);
              if (patch.seed !== undefined) setSeed(patch.seed);
            }}
            onRunSimulate={(override) => handleRunSimulate(override)}
            onParseNLQ={handleParseNLQ}
          />
        )}

        {activeScreen === 'reverse' && (
          <ReverseWhatIfScreen
            activeLabel={activeLabel}
            products={products}
            selectedProductId={selectedProductId}
            optimizeResult={optimizeResult}
            fixtureNote={optFixtureNote}
            loading={loading}
            error={error}
            onRunOptimize={handleRunOptimize}
          />
        )}

        {activeScreen === 'validation' && <ValidationScreen activeLabel={activeLabel} />}
      </main>

      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-[#0E1526]/70 backdrop-blur-sm py-4 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-slate-500 dark:text-slate-400">
          <p>{STRINGS.disclaimers.zeroBrowserMath}</p>
          <p className="text-slate-400 dark:text-slate-500">Honest Econometrics · Every screen carries a provenance badge</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
