import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient, DEFAULT_USE_FIXTURES } from './api';
import { DataSourceBadge } from './components/DataSourceBadge';
import { MoonIcon, SunIcon } from './components/Icons';
import { STRINGS } from './i18n';
import { loadSampleCsv } from './sampleDatasets';
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
  const [uploadDataLabel, setUploadDataLabel] = useState<DataLabel>('USER');
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
      setError(err instanceof Error ? err.message : 'Could not load the sample dataset.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCsv = async (file: File, dataLabel: DataLabel = 'USER') => {
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
      setUploadDataLabel(dataLabel);
      setActiveLabel(dataLabel);
      setActiveScreen('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that CSV file.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = async (sampleId: string) => {
    setLoading(true);
    setError(null);
    try {
      const sampleFile = await loadSampleCsv(sampleId);
      await handleUploadCsv(sampleFile, 'SYNTHETIC');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the synthetic sample.');
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
      setActiveLabel(uploadDataLabel);
      setProducts(fitRes.products);
      const firstId = fitRes.products[0]?.product_id ?? 'P01';
      setSelectedProductId(firstId);
      setPriceChangePct(10);
      await runSimulateInternal(fitRes.products, firstId, 10, seed);
      setActiveScreen('assumptions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not estimate price sensitivity from these columns.');
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
      setError(err instanceof Error ? err.message : 'The simulation did not run.');
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
          message: `${parsed.error} Set the price change with the controls instead.`,
        });
        return;
      }
      setSelectedProductId(parsed.product_id);
      setPriceChangePct(parsed.change_value);
      setHorizonDays(parsed.horizon_days);
      setNlqStatus({
        type: 'ok',
        message: `Read as: ${parsed.product_id}, ${parsed.change_value > 0 ? '+' : ''}${parsed.change_value}% price change over ${parsed.horizon_days} days.`,
      });
      await runSimulateInternal(products, parsed.product_id, parsed.change_value, seed);
    } catch (err) {
      setNlqStatus({
        type: 'fallback',
        message: `${err instanceof Error ? err.message : 'Could not read the question.'} Set the price change with the controls instead.`,
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
      setError(err instanceof Error ? err.message : 'The optimization did not run.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 pt-3">
          <p className="text-[18px] font-semibold tracking-[-0.01em]">{STRINGS.appTitle}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <DataSourceBadge label={activeLabel} />
            <label
              className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-muted"
              title="Show results saved from the engine instead of calling it."
            >
              <input
                type="checkbox"
                checked={useFixtures}
                onChange={(e) => setUseFixtures(e.target.checked)}
                className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
              />
              <span>Offline mode</span>
            </label>
            <button
              type="button"
              onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="btn btn-quiet"
            >
              {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
            </button>
          </div>
        </div>

        <nav
          aria-label="Workflow"
          className="mx-auto mt-1 flex max-w-6xl flex-wrap items-end gap-x-1 px-3 sm:px-6"
        >
          {STRINGS.nav.map((item) => {
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
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveScreen(item.id)}
                className={`-mb-px whitespace-nowrap border-b-2 px-2 py-2 text-sm transition-colors sm:px-3 sm:py-2.5 sm:text-[15px] ${
                  item.id === 'reverse' ? 'sm:ml-6' : ''
                } ${
                  isActive
                    ? 'border-accent font-semibold text-ink'
                    : isDisabled
                    ? 'cursor-not-allowed border-transparent text-muted opacity-50'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {item.step && <span className="mr-1.5">{item.step}.</span>}
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {activeScreen === 'upload' && (
          <UploadScreen
            loading={loading}
            error={error}
            liveApi={!useFixtures}
            onSelectDemo={handleSelectDemo}
            onLoadSample={handleLoadSample}
            onUploadFile={handleUploadCsv}
          />
        )}

        {activeScreen === 'mapping' && (
          <MappingScreen
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
            products={products}
            selectedProductId={selectedProductId}
            optimizeResult={optimizeResult}
            fixtureNote={optFixtureNote}
            loading={loading}
            error={error}
            onRunOptimize={handleRunOptimize}
          />
        )}

        {activeScreen === 'validation' && <ValidationScreen />}
      </main>

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-6xl px-6 py-4 text-[13px] text-muted">
          {STRINGS.disclaimers.engineFigures}
        </p>
      </footer>
    </div>
  );
};

export default App;
