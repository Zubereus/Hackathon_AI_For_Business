import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient, DEFAULT_USE_FIXTURES } from './api';
import { BrandLogoMark } from './components/BrandVisuals';
import { DataSourceBadge } from './components/DataSourceBadge';
import { DatabaseIcon, MoonIcon, SunIcon } from './components/Icons';
import { getStrings, Lang } from './i18n';
import { loadSampleCsv } from './sampleDatasets';
import { JournalScreen } from './screens/JournalScreen';
import { MappingScreen } from './screens/MappingScreen';
import { PlanningScreen } from './screens/PlanningScreen';
import { ReverseWhatIfScreen } from './screens/ReverseWhatIfScreen';
import { UploadScreen } from './screens/UploadScreen';
import { ValidationScreen } from './screens/ValidationScreen';
import { WhatIfScreen } from './screens/WhatIfScreen';
import {
  BusinessContext,
  ColumnMappingItem,
  ColumnProfile,
  DataLabel,
  DecisionGoal,
  DecisionSpec,
  IngestCommitOptions,
  NLQExplainResponse,
  NLQParseFallback,
  OptimizeResponse,
  ProductElasticity,
  RankedOption,
  SchedulePhase,
  ScreenId,
  SimulateResponse,
} from './types';

interface AppProps {
  initialScreen?: ScreenId;
  initialUseFixtures?: boolean;
  initialLang?: Lang;
}

type DataPanelMode = null | 'picker' | 'mapping';

function buildBusinessContext(targetProd: ProductElasticity): BusinessContext {
  return {
    ...(targetProd.business_context ?? {}),
    current_stock_units: targetProd.stock_available ?? null,
    base_margin_pct:
      targetProd.current_price_vnd > 0
        ? Number(
            (
              ((targetProd.current_price_vnd - targetProd.unit_cost_vnd) /
                targetProd.current_price_vnd) *
              100
            ).toFixed(2)
          )
        : 0,
    significant: targetProd.significant ?? true,
    warnings: targetProd.warnings ?? [],
  };
}

export const App: React.FC<AppProps> = ({
  initialScreen = 'whatif',
  initialUseFixtures = DEFAULT_USE_FIXTURES,
  initialLang,
}) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('whatif_theme') !== 'light';
    } catch {
      return true;
    }
  });

  const [lang, setLang] = useState<Lang>(() => {
    if (initialLang) return initialLang;
    if (typeof window !== 'undefined' && window.location.search) {
      const qLang = new URLSearchParams(window.location.search).get('lang');
      if (qLang === 'en' || qLang === 'vi') return qLang;
    }
    try {
      const saved = window.localStorage.getItem('whatif_lang');
      if (saved === 'en' || saved === 'vi') return saved;
    } catch {
      // Ignore storage failures cleanly
    }
    return 'vi';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('whatif_theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failures cleanly
    }
  }, [isDark]);

  useEffect(() => {
    try {
      window.localStorage.setItem('whatif_lang', lang);
    } catch {
      // Ignore storage failures cleanly
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const strings = useMemo(() => getStrings(lang), [lang]);

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

  const [dataPanelMode, setDataPanelMode] = useState<DataPanelMode>(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const s = new URLSearchParams(window.location.search).get('screen');
      if (s === 'upload') return 'picker';
      if (s === 'mapping') return 'mapping';
    }
    if (initialScreen === 'upload') return 'picker';
    if (initialScreen === 'mapping') return 'mapping';
    return null;
  });

  const [activeScreen, setActiveScreen] = useState<ScreenId>(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      const s = new URLSearchParams(window.location.search).get('screen') as ScreenId | null;
      if (s === 'reverse' || s === 'planning' || s === 'validation' || s === 'journal' || s === 'whatif') {
        return s;
      }
    }
    if (
      initialScreen === 'reverse' ||
      initialScreen === 'planning' ||
      initialScreen === 'validation' ||
      initialScreen === 'journal'
    ) {
      return initialScreen;
    }
    return 'whatif';
  });

  const [activeDatasetId, setActiveDatasetId] = useState<string>('fashion_shop_12');
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
  const [unitCostChangePct, setUnitCostChangePct] = useState<number>(0);
  const [extraFixedCostVnd, setExtraFixedCostVnd] = useState<number>(0);
  const [plannedRestockUnits, setPlannedRestockUnits] = useState<number>(0);
  const [horizonDays, setHorizonDays] = useState<number>(30);
  const [decisionGoal, setDecisionGoal] = useState<DecisionGoal>('maximize_profit');
  const [inventoryAgeDays, setInventoryAgeDays] = useState<number | null>(null);
  const [holdingCostPctPerMonth, setHoldingCostPctPerMonth] = useState<number>(0);
  const [schedulePhases, setSchedulePhases] = useState<SchedulePhase[]>([]);
  const [seed, setSeed] = useState<number>(42);

  // Simulation, explanation & optimize outputs
  const [simulationResult, setSimulationResult] = useState<SimulateResponse | null>(null);
  const [explanationData, setExplanationData] = useState<NLQExplainResponse | null>(null);
  const [nlqGuidance, setNlqGuidance] = useState<NLQParseFallback | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [lastDecisionSpec, setLastDecisionSpec] = useState<DecisionSpec | null>(null);
  const [simFixtureNote, setSimFixtureNote] = useState<string | null>(null);
  const [nlqStatus, setNlqStatus] = useState<{ type: 'ok' | 'fallback'; message: string } | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResponse | null>(null);
  const [optFixtureNote, setOptFixtureNote] = useState<string | null>(null);
  const [journalStatus, setJournalStatus] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runSimulateInternal = async (
    prodList: ProductElasticity[],
    pid: string,
    pct: number,
    simSeed: number,
    opts?: {
      schedule?: SchedulePhase[];
      horizonDays?: number;
      decisionGoal?: DecisionGoal;
      inventoryAgeDays?: number | null;
      holdingCostPctPerMonth?: number | null;
      baselinePeriodDays?: number;
      language?: 'en' | 'vi' | null;
      question?: string | null;
      decisionSpec?: DecisionSpec | null;
      optimizeSummary?: Record<string, unknown> | null;
      clientOverride?: ApiClient;
      unitCostChangePct?: number;
      extraFixedCostVnd?: number;
      plannedRestockUnits?: number | null;
    }
  ) => {
    const activeClient = opts?.clientOverride ?? client;
    const targetProd = prodList.find((p) => p.product_id === pid) ?? prodList[0];
    if (!targetProd) return;

    const respectCap = Boolean(targetProd.enforce_stock_cap && targetProd.stock_available !== null);
    const activeSchedule = opts?.schedule && opts.schedule.length > 0 ? opts.schedule : undefined;
    const bizCtx = buildBusinessContext(targetProd);

    const effHorizon = activeSchedule
      ? activeSchedule.reduce((s, ph) => s + (ph.days || 0), 0) || 30
      : opts?.horizonDays ?? horizonDays;
    const effGoal = opts?.decisionGoal ?? decisionGoal;
    const effAge = opts?.inventoryAgeDays !== undefined ? opts.inventoryAgeDays : inventoryAgeDays;
    const effHoldingPct =
      opts?.holdingCostPctPerMonth !== undefined
        ? opts.holdingCostPctPerMonth
        : holdingCostPctPerMonth;

    const effectiveSpec: DecisionSpec | null =
      opts?.decisionSpec ??
      (effGoal !== 'maximize_profit' || effAge !== null
        ? {
            product_id: targetProd.product_id,
            change_type: activeSchedule ? 'price_schedule' : 'price_pct',
            change_value: pct,
            horizon_days: effHorizon || 30,
            decision_goal: effGoal,
            inventory_age_days: effAge,
          }
        : null);

    const costMult = 1.0 + (opts?.unitCostChangePct ?? unitCostChangePct) / 100.0;
    const effUnitCost = Math.max(1, Math.round(targetProd.unit_cost_vnd * costMult));
    const effFixedCost = Math.max(
      0,
      Math.round((targetProd.fixed_cost_vnd ?? 0) + (opts?.extraFixedCostVnd ?? extraFixedCostVnd))
    );
    const restockUnits =
      opts?.plannedRestockUnits !== undefined
        ? opts.plannedRestockUnits
        : plannedRestockUnits;

    const { response, fixtureNote } = await activeClient.simulate(
      {
        product: {
          current_price_vnd: targetProd.current_price_vnd,
          unit_cost_vnd: effUnitCost,
          baseline_qty_per_period: targetProd.baseline_qty_per_period,
          stock_available: respectCap ? targetProd.stock_available : null,
          fixed_cost_vnd: effFixedCost,
          elasticity_samples: targetProd.elasticity_samples,
        },
        price_change_pct: pct,
        n_sims: 5000,
        seed: simSeed,
        schedule: activeSchedule,
        baseline_period_days: opts?.baselinePeriodDays ?? 30,
        horizon_days: activeSchedule ? undefined : effHorizon,
        decision_goal: effGoal,
        inventory_age_days: effAge,
        holding_cost_pct_per_month:
          effHoldingPct !== null && effHoldingPct > 0 ? effHoldingPct : undefined,
        business_context: bizCtx,
        planned_restock_units: restockUnits,
      },
      { productId: targetProd.product_id, respectStockCap: respectCap }
    );

    if (!mountedRef.current) return;
    setSimulationResult(response);
    setSimFixtureNote(fixtureNote ?? null);
    setLastDecisionSpec(effectiveSpec);

    try {
      const exp = await activeClient.nlqExplain(
        response,
        bizCtx,
        opts?.language ?? lang,
        opts?.question ?? lastQuestion,
        {
          decisionSpec: effectiveSpec,
          optimizeSummary: opts?.optimizeSummary ?? null,
        }
      );
      if (mountedRef.current) {
        setExplanationData(exp);
      }
    } catch {
      if (mountedRef.current) {
        setExplanationData(null);
      }
    }
  };

  // Preload the ready-to-use workspace on mount so the user lands directly in a live E2E app.
  useEffect(() => {
    let cancelled = false;

    const initWorkspace = async () => {
      const params =
        typeof window !== 'undefined' && window.location.search
          ? new URLSearchParams(window.location.search)
          : null;

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

      let fitData;
      let bootClient = client;

      if (!useFixtures && params?.get('demo') !== '1') {
        try {
          fitData = await client.fitElasticity('fashion_shop_12', 'SYNTHETIC');
        } catch {
          // Live backend unavailable right now: gracefully hydrate snapshot in-memory without blocking UI.
          bootClient = new ApiClient(true);
          fitData = bootClient.getDemoElasticity('SYNTHETIC').elasticity;
        }
      } else {
        fitData = client.getDemoElasticity('SYNTHETIC').elasticity;
      }

      if (cancelled || !mountedRef.current) return;
      setActiveDatasetId('fashion_shop_12');
      setActiveLabel(fitData.data_label);
      setProducts(fitData.products);
      const firstId = fitData.products[0]?.product_id ?? 'P01';
      setSelectedProductId(firstId);

      try {
        await runSimulateInternal(fitData.products, firstId, 10, 42, {
          language: lang,
          clientOverride: bootClient,
        });
      } catch {
        const offlineClient = new ApiClient(true);
        const offlineFit = offlineClient.getDemoElasticity('SYNTHETIC').elasticity;
        if (!cancelled && mountedRef.current) {
          setProducts(offlineFit.products);
          await runSimulateInternal(offlineFit.products, offlineFit.products[0].product_id, 10, 42, {
            language: lang,
            clientOverride: offlineClient,
          });
        }
      }

      try {
        const p0 = fitData.products[0];
        if (p0) {
          const res = await bootClient.optimize(
            {
              product: {
                current_price_vnd: p0.current_price_vnd,
                unit_cost_vnd: p0.unit_cost_vnd,
                baseline_qty_per_period: p0.baseline_qty_per_period,
                elasticity_samples: p0.elasticity_samples,
              },
              objective: 'hit_target',
              target_profit_uplift_pct: 10,
              constraints: { max_price_change_pct: 30, min_margin_pct: 25, respect_stock: false },
              n_sims: 2000,
              seed: 42,
            },
            { productId: p0.product_id }
          );
          if (!cancelled && mountedRef.current) {
            setOptimizeResult(res.response);
            setOptFixtureNote(res.fixtureNote ?? null);
          }
        }
      } catch {
        // Ignore non-critical initial optimization failure
      }
    };

    void initWorkspace();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleLang = () => {
    const nextLang: Lang = lang === 'vi' ? 'en' : 'vi';
    setLang(nextLang);
    const activeProd = products.find((p) => p.product_id === selectedProductId) ?? products[0];
    if (simulationResult && activeProd) {
      const bizCtx = buildBusinessContext(activeProd);
      void client
        .nlqExplain(simulationResult, bizCtx, nextLang, lastQuestion, {
          decisionSpec: lastDecisionSpec,
        })
        .then((exp) => {
          if (mountedRef.current) setExplanationData(exp);
        })
        .catch(() => {
          // Keep existing explanation if endpoint is unavailable
        });
    }
  };

  const handleSelectDemo = async (demoLabel: 'SYNTHETIC' | 'PUBLIC_M5') => {
    setLoading(true);
    setError(null);
    setOptimizeResult(null);
    try {
      let fitData;
      if (!useFixtures && demoLabel === 'SYNTHETIC') {
        fitData = await client.fitElasticity('fashion_shop_12', 'SYNTHETIC');
      } else {
        fitData = client.getDemoElasticity(demoLabel).elasticity;
      }

      setActiveDatasetId(demoLabel === 'PUBLIC_M5' ? 'M5' : 'fashion_shop_12');
      setActiveLabel(fitData.data_label);
      setProducts(fitData.products);
      const firstId = fitData.products[0]?.product_id ?? 'P01';
      setSelectedProductId(firstId);
      setPriceChangePct(10);
      setSchedulePhases([]);
      await runSimulateInternal(fitData.products, firstId, 10, seed, { language: lang });
      setDataPanelMode(null);
      if (activeScreen === 'validation') {
        setActiveScreen('whatif');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'vi'
            ? 'Không thể tải dữ liệu mẫu.'
            : 'Could not load the sample dataset.'
      );
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
      setDataPanelMode('mapping');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'vi'
            ? 'Không thể đọc tệp CSV này.'
            : 'Could not read that CSV file.'
      );
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
      setError(
        err instanceof Error
          ? err.message
          : lang === 'vi'
            ? 'Không thể nạp bộ mẫu CSV.'
            : 'Could not load the synthetic sample.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChangeColumnMapping = (sourceCol: string, canonicalField: string) => {
    setSourceToCanonical((prev) => {
      const next = { ...prev };
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
      setActiveDatasetId(commitRes.dataset_id);
      setActiveLabel(uploadDataLabel);
      setProducts(fitRes.products);
      const firstId = fitRes.products[0]?.product_id ?? 'P01';
      setSelectedProductId(firstId);
      setPriceChangePct(10);
      setSchedulePhases([]);
      await runSimulateInternal(fitRes.products, firstId, 10, seed, { language: lang });
      setDataPanelMode(null);
      setActiveScreen('whatif');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'vi'
            ? 'Không thể ước lượng độ nhạy giá từ các cột đã chọn.'
            : 'Could not estimate price sensitivity from these columns.'
      );
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
    decisionGoal?: DecisionGoal;
    inventoryAgeDays?: number | null;
    holdingCostPctPerMonth?: number;
    seed?: number;
    schedule?: SchedulePhase[];
    unitCostChangePct?: number;
    extraFixedCostVnd?: number;
    plannedRestockUnits?: number | null;
  }) => {
    const pid = override?.productId ?? selectedProductId;
    const pct = override?.priceChangePct ?? priceChangePct;
    const simSeed = override?.seed ?? seed;
    const nextSched = override?.schedule !== undefined ? override.schedule : schedulePhases;
    const nextHorizon = override?.horizonDays !== undefined ? override.horizonDays : horizonDays;
    const nextGoal = override?.decisionGoal ?? decisionGoal;
    const nextAge =
      override?.inventoryAgeDays !== undefined ? override.inventoryAgeDays : inventoryAgeDays;
    const nextHoldingPct =
      override?.holdingCostPctPerMonth !== undefined
        ? override.holdingCostPctPerMonth
        : holdingCostPctPerMonth;
    const nextUnitCostPct =
      override?.unitCostChangePct !== undefined ? override.unitCostChangePct : unitCostChangePct;
    const nextExtraFixed =
      override?.extraFixedCostVnd !== undefined ? override.extraFixedCostVnd : extraFixedCostVnd;
    const nextRestock =
      override?.plannedRestockUnits !== undefined ? override.plannedRestockUnits : plannedRestockUnits;

    setLoading(true);
    setError(null);
    try {
      await runSimulateInternal(products, pid, pct, simSeed, {
        schedule: nextSched,
        horizonDays: nextHorizon,
        decisionGoal: nextGoal,
        inventoryAgeDays: nextAge,
        holdingCostPctPerMonth: nextHoldingPct,
        language: lang,
        unitCostChangePct: nextUnitCostPct,
        extraFixedCostVnd: nextExtraFixed,
        plannedRestockUnits: nextRestock,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === 'vi'
            ? 'Mô phỏng chưa chạy được.'
            : 'The simulation did not run.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleParseNLQ = async (question: string) => {
    setNlqLoading(true);
    setNlqStatus(null);
    setNlqGuidance(null);
    setError(null);
    setLastQuestion(question);
    try {
      const parsed = await client.nlqParse(question, products, selectedProductId);
      if ('fallback' in parsed) {
        if (parsed.helpful_answer) {
          setNlqGuidance(parsed);
          setNlqStatus({
            type: 'ok',
            message:
              lang === 'vi'
                ? 'Đã trả lời câu hỏi và gợi ý các phương án mô phỏng bên dưới.'
                : 'Direct answer & suggested scenarios provided below.',
          });
        } else {
          setNlqStatus({
            type: 'fallback',
            message: `${parsed.error} ${
              lang === 'vi'
                ? 'Hãy chỉnh trực tiếp trong mục Tự kéo chỉnh thông số bên cạnh.'
                : 'Set the price change with the controls instead.'
            }`,
          });
        }
        return;
      }
      setSelectedProductId(parsed.product_id);
      setPriceChangePct(parsed.change_value);
      setHorizonDays(parsed.horizon_days);
      const parsedGoal: DecisionGoal =
        parsed.decision_goal === 'clear_inventory' ? 'clear_inventory' : 'maximize_profit';
      const parsedAge: number | null = parsed.inventory_age_days ?? null;
      setDecisionGoal(parsedGoal);
      setInventoryAgeDays(parsedAge);
      const parsedSched = parsed.schedule ?? [];
      setSchedulePhases(parsedSched);

      const statusMsg = parsed.assumptions_summary
        ? `${parsed.product_id}: ${parsed.assumptions_summary}`
        : parsed.change_type === 'price_schedule' && parsedSched.length > 0
          ? lang === 'vi'
            ? `Đã hiểu lộ trình đa pha: ${parsed.product_id}, ${parsedSched.length} chặng trong ${parsed.horizon_days} ngày.`
            : `Read as multi-phase schedule: ${parsed.product_id}, ${parsedSched.length} phases over ${parsed.horizon_days} days.`
          : lang === 'vi'
            ? `Đã hiểu: ${parsed.product_id}, đổi giá ${
                parsed.change_value > 0 ? '+' : ''
              }${parsed.change_value}% trong ${parsed.horizon_days} ngày.`
            : `Read as: ${parsed.product_id}, ${
                parsed.change_value > 0 ? '+' : ''
              }${parsed.change_value}% price change over ${parsed.horizon_days} days.`;

      setNlqStatus({ type: 'ok', message: statusMsg });

      // Agent Tool-Use: counter-check via Go Reverse Optimizer on feasibility / reverse-goal / event queries
      let optimizeSummary: Record<string, unknown> | null = null;
      const targetProd = products.find((p) => p.product_id === parsed.product_id) ?? products[0];
      if (
        targetProd &&
        (parsed.question_type === 'yes_no_feasibility' ||
          parsed.question_type === 'reverse_goal' ||
          Boolean(parsed.event_context))
      ) {
        try {
          const evCtx = parsed.event_context;
          const activeDays = evCtx?.active_days ?? (parsed.horizon_days || 30);
          const dMult = evCtx?.demand_multiplier ?? 1.0;
          const eMult = evCtx?.elasticity_multiplier ?? 1.0;
          const scaledQty = Math.max(
            1,
            Math.round((targetProd.baseline_qty_per_period / 30) * activeDays * dMult)
          );
          const scaledSamples = targetProd.elasticity_samples.map((e) => e * eMult);
          const optRes = await client.optimize(
            {
              product: {
                current_price_vnd: targetProd.current_price_vnd,
                unit_cost_vnd: targetProd.unit_cost_vnd,
                baseline_qty_per_period: scaledQty,
                stock_available:
                  targetProd.enforce_stock_cap && targetProd.stock_available !== null
                    ? targetProd.stock_available
                    : null,
                fixed_cost_vnd: targetProd.fixed_cost_vnd ?? 0,
                elasticity_samples: scaledSamples,
              },
              objective: parsed.question_type === 'reverse_goal' ? 'hit_target' : 'max_expected_profit',
              target_profit_uplift_pct: parsed.target_uplift_pct ?? 10,
              constraints: {
                max_price_change_pct: 30,
                min_margin_pct: 15,
                respect_stock: Boolean(targetProd.enforce_stock_cap),
              },
              n_sims: 1000,
              seed,
            },
            { productId: targetProd.product_id }
          );
          const bestFeasible =
            optRes.response.ranked.find((r) => r.feasible) ?? optRes.response.ranked[0];
          if (bestFeasible) {
            optimizeSummary = { best_feasible: bestFeasible };
          }
        } catch {
          // Optional optimizer counter-check failed; continue smoothly with simulation alone
        }
      }

      await runSimulateInternal(products, parsed.product_id, parsed.change_value, seed, {
        schedule: parsedSched,
        horizonDays: parsed.horizon_days,
        decisionGoal: parsedGoal,
        inventoryAgeDays: parsedAge,
        baselinePeriodDays: parsed.baseline_period_days ?? undefined,
        language: parsed.detected_language ?? lang,
        question,
        decisionSpec: parsed,
        optimizeSummary,
      });
    } catch (err) {
      setNlqStatus({
        type: 'fallback',
        message: `${
          err instanceof Error
            ? err.message
            : lang === 'vi'
              ? 'Không thể đọc câu hỏi.'
              : 'Could not read the question.'
        } ${
          lang === 'vi'
            ? 'Hãy dùng bảng Tự kéo chỉnh thông số bên cạnh.'
            : 'Set the price change with the controls instead.'
        }`,
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
      setError(
        err instanceof Error
          ? err.message
          : lang === 'vi'
            ? 'Không thể chạy tối ưu hóa.'
            : 'The optimization did not run.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWhatIfToJournal = async (payload: {
    title: string;
    decisionType: 'pricing' | 'schedule' | 'template';
  }) => {
    const prod = products.find((p) => p.product_id === selectedProductId) ?? products[0];
    if (!prod || !simulationResult) return;
    setJournalStatus(null);
    try {
      await client.createJournalEntry({
        dataset_id: activeDatasetId,
        data_label: activeLabel,
        product_id: prod.product_id,
        product_name: prod.product_name,
        title: payload.title,
        decision_type: payload.decisionType,
        horizon_days: horizonDays,
        planned_price_vnd: Math.round(prod.current_price_vnd * (1 + priceChangePct / 100)),
        planned_price_change_pct: priceChangePct,
        planned_restock_units: plannedRestockUnits,
        assumptions: {
          elasticity_median: prod.elasticity_median,
          unit_cost_change_pct: unitCostChangePct,
          extra_fixed_cost_vnd: extraFixedCostVnd,
          decision_goal: decisionGoal,
        },
        expected_qty: simulationResult.scenarios.expected.qty,
        expected_revenue_vnd: simulationResult.scenarios.expected.revenue,
        expected_profit_vnd: simulationResult.scenarios.expected.profit,
        p5_profit_vnd: simulationResult.profit_distribution.p5,
        p95_profit_vnd: simulationResult.profit_distribution.p95,
        prob_beat_base: simulationResult.prob_beat_base ?? 0.5,
      });
      setJournalStatus(
        lang === 'vi'
          ? 'Đã lưu kịch bản vào Nhật ký Quyết định (SQLite).'
          : 'Saved scenario to Decision Journal (SQLite).'
      );
    } catch (e) {
      setJournalStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveOptimizeToJournal = async (bestOpt: RankedOption, pid: string) => {
    const prod = products.find((p) => p.product_id === pid) ?? products[0];
    if (!prod) return;
    setJournalStatus(null);
    try {
      await client.createJournalEntry({
        dataset_id: activeDatasetId,
        data_label: activeLabel,
        product_id: prod.product_id,
        product_name: prod.product_name,
        title: `${prod.product_id} Target-Price (${bestOpt.price_change_pct > 0 ? `+${bestOpt.price_change_pct}%` : `${bestOpt.price_change_pct}%`})`,
        decision_type: 'pricing',
        horizon_days: 30,
        planned_price_vnd: bestOpt.price_vnd,
        planned_price_change_pct: bestOpt.price_change_pct,
        planned_restock_units: 0,
        assumptions: { elasticity_median: prod.elasticity_median, source: 'reverse_optimizer' },
        expected_qty: prod.baseline_qty_per_period,
        expected_revenue_vnd: bestOpt.price_vnd * prod.baseline_qty_per_period,
        expected_profit_vnd: bestOpt.expected_profit,
        p5_profit_vnd: bestOpt.p5_profit,
        p95_profit_vnd: bestOpt.expected_profit + (bestOpt.expected_profit - bestOpt.p5_profit),
        prob_beat_base: bestOpt.prob_hit_target,
      });
      setJournalStatus(
        lang === 'vi'
          ? 'Đã lưu mức giá mục tiêu vào Nhật ký Quyết định (SQLite).'
          : 'Saved best candidate price to Decision Journal (SQLite).'
      );
    } catch (e) {
      setJournalStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogoMark className="h-9 w-9 shrink-0 shadow-sm" />
            <div>
              <p className="text-[18px] font-bold leading-tight tracking-[-0.015em] text-ink">
                {strings.appTitle}
              </p>
              <span className="hidden text-[12px] text-muted md:block">{strings.appSubtitle}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <DataSourceBadge label={activeLabel} lang={lang} />
            <button
              type="button"
              data-testid="toggle-data-panel-btn"
              aria-expanded={dataPanelMode !== null}
              onClick={() => setDataPanelMode((prev) => (prev ? null : 'picker'))}
              className={`btn gap-1.5 text-[13px] ${
                dataPanelMode
                  ? 'btn-primary'
                  : 'border border-cobalt/35 bg-cobalt-bg/65 text-cobalt hover:bg-cobalt hover:text-white'
              }`}
            >
              <DatabaseIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {dataPanelMode ? strings.header.closeDataButton : strings.header.dataButton}
              </span>
            </button>
            <label
              className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-rule bg-sunken/60 px-2.5 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink"
              title={strings.header.offlineTitle}
            >
              <input
                type="checkbox"
                checked={useFixtures}
                onChange={(e) => setUseFixtures(e.target.checked)}
                className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
              />
              <span>{strings.header.offlineLabel}</span>
            </label>
            <button
              type="button"
              data-testid="lang-toggle-btn"
              onClick={handleToggleLang}
              aria-label={strings.header.langToggleTitle}
              title={strings.header.langToggleTitle}
              className="btn btn-quiet rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-[12px] font-bold tracking-wide"
            >
              <span className={lang === 'vi' ? 'text-accent' : 'text-muted'}>VI</span>
              <span className="mx-1 text-rule-strong">|</span>
              <span className={lang === 'en' ? 'text-accent' : 'text-muted'}>EN</span>
            </button>
            <button
              type="button"
              onClick={() => setIsDark(!isDark)}
              aria-label={isDark ? strings.header.lightTheme : strings.header.darkTheme}
              title={isDark ? strings.header.lightTheme : strings.header.darkTheme}
              className="btn btn-quiet rounded-lg border border-rule bg-surface px-2.5 py-1.5"
            >
              {isDark ? <SunIcon aria-hidden="true" /> : <MoonIcon aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[1380px] px-4 pb-3 sm:px-6">
          <nav
            aria-label="Workspace"
            className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-rule bg-sunken/85 p-1"
          >
            {strings.nav.map((item) => {
              const isActive = activeScreen === item.id;
              const needsProducts = item.id === 'whatif' || item.id === 'reverse' || item.id === 'planning';
              const isDisabled = needsProducts && products.length === 0;

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isDisabled}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setDataPanelMode(null);
                    setActiveScreen(item.id);
                  }}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[13.5px] transition-all sm:px-4 sm:py-2 sm:text-[14px] ${
                    isActive
                      ? 'bg-surface font-bold text-ink shadow-sm ring-1 ring-rule-strong/50'
                      : isDisabled
                        ? 'cursor-not-allowed text-muted opacity-50'
                        : 'font-medium text-muted hover:bg-surface/60 hover:text-ink'
                  }`}
                >
                  {item.step && (
                    <span
                      className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                        isActive ? 'bg-accent text-accent-ink' : 'bg-rule text-ink'
                      }`}
                    >
                      {item.step}
                    </span>
                  )}
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1380px] flex-1 px-4 py-7 sm:px-6">
        {dataPanelMode !== null && (
          <section
            aria-label={lang === 'vi' ? 'Bảng nguồn dữ liệu và CSV' : 'Data source and CSV panel'}
            data-testid="data-drawer-panel"
            className="panel mb-10 p-6"
          >
            {dataPanelMode === 'picker' && (
              <UploadScreen
                lang={lang}
                loading={loading}
                error={error}
                liveApi={!useFixtures}
                onSelectDemo={handleSelectDemo}
                onLoadSample={handleLoadSample}
                onUploadFile={handleUploadCsv}
              />
            )}

            {dataPanelMode === 'mapping' && (
              <MappingScreen
                lang={lang}
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
                onBack={() => setDataPanelMode('picker')}
              />
            )}
          </section>
        )}

        {activeScreen === 'whatif' && (
          <WhatIfScreen
            lang={lang}
            products={products}
            selectedProductId={selectedProductId}
            priceChangePct={priceChangePct}
            unitCostChangePct={unitCostChangePct}
            extraFixedCostVnd={extraFixedCostVnd}
            plannedRestockUnits={plannedRestockUnits}
            horizonDays={horizonDays}
            decisionGoal={decisionGoal}
            inventoryAgeDays={inventoryAgeDays}
            holdingCostPctPerMonth={holdingCostPctPerMonth}
            schedulePhases={schedulePhases}
            seed={seed}
            simulationResult={simulationResult}
            explanationData={explanationData}
            fixtureNote={simFixtureNote}
            nlqStatus={nlqStatus}
            nlqGuidance={nlqGuidance}
            loading={loading}
            nlqLoading={nlqLoading}
            error={error}
            onUpdateProduct={handleUpdateProduct}
            onChangeParams={(patch) => {
              if (patch.productId !== undefined) setSelectedProductId(patch.productId);
              if (patch.priceChangePct !== undefined) setPriceChangePct(patch.priceChangePct);
              if (patch.unitCostChangePct !== undefined) setUnitCostChangePct(patch.unitCostChangePct);
              if (patch.extraFixedCostVnd !== undefined) setExtraFixedCostVnd(patch.extraFixedCostVnd);
              if (patch.plannedRestockUnits !== undefined) setPlannedRestockUnits(patch.plannedRestockUnits);
              if (patch.horizonDays !== undefined) setHorizonDays(patch.horizonDays);
              if (patch.decisionGoal !== undefined) setDecisionGoal(patch.decisionGoal);
              if (patch.inventoryAgeDays !== undefined) setInventoryAgeDays(patch.inventoryAgeDays);
              if (patch.holdingCostPctPerMonth !== undefined) {
                setHoldingCostPctPerMonth(patch.holdingCostPctPerMonth);
              }
              if (patch.seed !== undefined) setSeed(patch.seed);
              if (patch.schedulePhases !== undefined) setSchedulePhases(patch.schedulePhases);
            }}
            onRunSimulate={(override) => handleRunSimulate(override)}
            onParseNLQ={handleParseNLQ}
            onSaveToJournal={handleSaveWhatIfToJournal}
            journalStatus={journalStatus}
          />
        )}

        {activeScreen === 'reverse' && (
          <ReverseWhatIfScreen
            lang={lang}
            products={products}
            selectedProductId={selectedProductId}
            optimizeResult={optimizeResult}
            fixtureNote={optFixtureNote}
            loading={loading}
            error={error}
            onRunOptimize={handleRunOptimize}
            onSaveToJournal={handleSaveOptimizeToJournal}
            journalStatus={journalStatus}
          />
        )}

        {activeScreen === 'planning' && (
          <PlanningScreen
            lang={lang}
            products={products}
            selectedProductId={selectedProductId}
            client={client}
            useFixtures={useFixtures}
          />
        )}

        {activeScreen === 'validation' && (
          <ValidationScreen
            lang={lang}
            client={client}
            activeDatasetId={activeDatasetId}
            products={products}
            selectedProductId={selectedProductId}
            useFixtures={useFixtures}
          />
        )}

        {activeScreen === 'journal' && (
          <JournalScreen
            lang={lang}
            client={client}
            activeDatasetId={activeDatasetId}
            useFixtures={useFixtures}
          />
        )}
      </main>

      <footer className="border-t border-rule">
        <p className="mx-auto max-w-6xl px-6 py-4 text-[13px] text-muted">
          {strings.disclaimers.engineFigures}
        </p>
      </footer>
    </div>
  );
};

export default App;
