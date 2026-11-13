import precomputedBundle from './fixtures/precomputed_fixtures.json';
import { formatInt, formatNum, formatPct, formatVND } from './i18n';
import {
  BusinessContext,
  CashRunwayRequest,
  CashRunwayResponse,
  CausalAnalyzeRequest,
  CausalAnalyzeResponse,
  ClearanceMetrics,
  ColumnMappingItem,
  ColumnProfile,
  DataLabel,
  DecisionGoal,
  DecisionRecord,
  DecisionSpec,
  ElasticityFitResponse,
  IngestCommitOptions,
  IngestCommitResponse,
  IngestMapResponse,
  IngestProfileResponse,
  JournalCreateRequest,
  JournalListResponse,
  JournalUpdateRequest,
  MonitoringEvaluateResponse,
  NLQExplainResponse,
  NLQParseResponse,
  OptimizeRequest,
  OptimizeResponse,
  PortfolioOptimizeRequest,
  PortfolioOptimizeResponse,
  ProductElasticity,
  ReplenishRequest,
  ReplenishResponse,
  SchedulePhase,
  SimulateRequest,
  SimulateResponse,
  VOIRequest,
  VOIResponse,
} from './types';

export const GO_API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) || 'http://localhost:8080';

// Phase 7 default: talk to live Go gateway (:8080). Set VITE_USE_FIXTURES=1 for offline demo fallback.
export const DEFAULT_USE_FIXTURES =
  (import.meta.env.VITE_USE_FIXTURES as string | undefined) === '1';

type PrecomputedProductMap = Record<
  string,
  {
    unconstrained: Record<string, SimulateResponse>;
    capped: Record<string, SimulateResponse>;
    schedule_showcase?: SimulateResponse;
  }
>;

type PrecomputedOptimizeMap = Record<
  string,
  {
    max_expected_profit: OptimizeResponse;
    hit_target: OptimizeResponse;
  }
>;

interface FixtureBundle {
  pct_grid: number[];
  datasets: Record<'SYNTHETIC' | 'PUBLIC_M5', ElasticityFitResponse & { dataset_id: string }>;
  sample_profile: IngestProfileResponse;
  sample_mapping: IngestMapResponse;
  simulations: PrecomputedProductMap;
  optimizations: PrecomputedOptimizeMap;
}

const BUNDLE = precomputedBundle as unknown as FixtureBundle;

const OFFLINE_HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'ngay', 'ngay_ban', 'day', 'order_date', 'transaction_date', 'thoi_gian'],
  product_id: ['product_id', 'sku', 'ma_sp', 'ma_hang', 'item_id', 'id'],
  product_name: ['product_name', 'ten_sp', 'ten_hang', 'name', 'item_name'],
  price: ['price', 'gia_ban', 'don_gia', 'gia', 'selling_price', 'unit_price'],
  quantity: ['quantity', 'qty', 'so_luong', 'sl', 'units_sold', 'volume'],
  unit_cost: ['unit_cost', 'cost', 'gia_von', 'cogs', 'cost_price'],
  stock: ['stock', 'ton_kho', 'ton_cuoi_ngay', 'inventory'],
  promo: ['promo', 'promotion', 'khuyen_mai', 'is_promo'],
  marketing_cost: ['marketing_cost', 'marketing_cost_vnd', 'chi_phi_marketing', 'chi_phi_mkt', 'quang_cao', 'ads'],
  labor_cost: ['labor_cost', 'labor_cost_vnd', 'nhan_cong', 'chi_phi_nhan_cong', 'tien_luong', 'payroll'],
  operating_cost: ['operating_cost', 'operating_cost_vnd', 'chi_phi_van_hanh', 'van_hanh', 'mat_bang', 'phi_san'],
  fixed_cost: ['fixed_cost', 'fixed_cost_vnd', 'chi_phi_co_dinh', 'chi_phi_ngoai', 'chi_phi_khac'],
};

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
    if (typeof body?.detail === 'string' && body.detail.trim()) return body.detail;
  } catch {
    // ignore parse failures
  }
  return `Server responded with status ${res.status}.`;
}

function scaleScenarioMetrics(m: SimulateResponse['scenarios']['base'], scale: number) {
  return {
    ...m,
    qty: Math.round(m.qty * scale),
    revenue: Math.round(m.revenue * scale),
    profit: Math.round(m.profit * scale),
    spend: Math.round(m.spend * scale),
  };
}

function buildOfflineClearanceAndAdvisory(
  res: SimulateResponse,
  req: SimulateRequest
): SimulateResponse {
  const basePeriod = req.baseline_period_days && req.baseline_period_days > 0 ? req.baseline_period_days : 30;
  const hasSchedule = Boolean(req.schedule && req.schedule.length > 0);
  const horizonDays = hasSchedule
    ? req.schedule!.reduce((acc, ph) => acc + Math.max(0, ph.days || 0), 0) || basePeriod
    : req.horizon_days && req.horizon_days > 0
      ? req.horizon_days
      : basePeriod;
  const scale = !hasSchedule && horizonDays !== basePeriod ? horizonDays / basePeriod : 1;

  let working: SimulateResponse = res;
  if (scale !== 1) {
    working = {
      ...res,
      scenarios: {
        base: scaleScenarioMetrics(res.scenarios.base, scale),
        optimistic: scaleScenarioMetrics(res.scenarios.optimistic, scale),
        expected: scaleScenarioMetrics(res.scenarios.expected, scale),
        pessimistic: scaleScenarioMetrics(res.scenarios.pessimistic, scale),
      },
      profit_distribution: {
        ...res.profit_distribution,
        p5: Math.round(res.profit_distribution.p5 * scale),
        p50: Math.round(res.profit_distribution.p50 * scale),
        p95: Math.round(res.profit_distribution.p95 * scale),
      },
      waterfall: undefined,
      cash_flow: undefined,
      sensitivity_tornado: undefined,
    };
  }

  const base = working.scenarios.base;
  const exp = working.scenarios.expected;
  const goal: DecisionGoal =
    req.decision_goal === 'clear_inventory' ? 'clear_inventory' : 'maximize_profit';
  const unitCost = req.product.unit_cost_vnd || 0;
  const avgExpPrice =
    exp.qty > 0 ? exp.revenue / exp.qty : exp.price_vnd ?? req.product.current_price_vnd;
  const unitRecoveryPct = unitCost > 0 ? Number(((avgExpPrice / unitCost) * 100).toFixed(2)) : 100;
  const recoversUnitCost = avgExpPrice >= unitCost;
  const extraUnitsCleared = exp.qty - base.qty;
  const turnoverSpeedupPct =
    base.qty > 0 ? Number((((exp.qty - base.qty) / base.qty) * 100).toFixed(2)) : 0;
  const baseCostTurned = Math.round(base.qty * unitCost);
  const planCostTurned = Math.round(exp.qty * unitCost);
  const extraCapitalFreed = planCostTurned - baseCostTurned;
  const fixedScaled = Math.round((req.product.fixed_cost_vnd ?? 0) * scale);
  const totalCostIncurred = planCostTurned + fixedScaled;
  const recoversTotalCost = exp.revenue >= totalCostIncurred && exp.profit >= 0;

  const rawStock = req.business_context?.current_stock_units ?? req.product.stock_available ?? null;
  const stockUnits =
    rawStock !== null && rawStock !== undefined && rawStock > 0
      ? rawStock + Math.max(0, req.planned_restock_units ?? 0)
      : null;
  const inventoryCapital = stockUnits !== null ? Math.round(stockUnits * unitCost) : null;
  const stockClearedPct =
    stockUnits !== null && stockUnits > 0
      ? Number(Math.min(100, (exp.qty / stockUnits) * 100).toFixed(1))
      : null;
  const baseDailyRate = base.qty / horizonDays;
  const planDailyRate = exp.qty / horizonDays;
  const baseDaysToClear =
    stockUnits !== null && baseDailyRate > 0 ? Number((stockUnits / baseDailyRate).toFixed(1)) : null;
  const planDaysToClear =
    stockUnits !== null && planDailyRate > 0 ? Number((stockUnits / planDailyRate).toFixed(1)) : null;
  const daysSavedToClear =
    baseDaysToClear !== null && planDaysToClear !== null
      ? Number((baseDaysToClear - planDaysToClear).toFixed(1))
      : null;

  const invAge = req.inventory_age_days ?? null;
  const ageTier =
    invAge !== null ? (invAge >= 60 ? 'stale' : invAge >= 30 ? 'aging' : 'new') : undefined;
  const holdingPct = req.holding_cost_pct_per_month ?? 0;
  const holdingCostSaved =
    holdingPct > 0 && extraCapitalFreed > 0
      ? Math.round(extraCapitalFreed * (holdingPct / 100) * (horizonDays / 30))
      : 0;
  const profitDelta = exp.profit - base.profit;
  const adjustedProfitDelta = profitDelta + holdingCostSaved;

  const clearance: ClearanceMetrics = working.clearance ?? {
    decision_goal: goal,
    horizon_days: horizonDays,
    unit_recovery_pct: unitRecoveryPct,
    recovers_unit_cost: recoversUnitCost,
    recovers_total_cost: recoversTotalCost,
    extra_units_cleared: extraUnitsCleared,
    turnover_speedup_pct: turnoverSpeedupPct,
    total_cost_capital_turned_vnd: planCostTurned,
    extra_capital_freed_vnd: extraCapitalFreed,
    inventory_capital_vnd: inventoryCapital,
    stock_cleared_pct: stockClearedPct,
    base_days_to_clear: baseDaysToClear,
    plan_days_to_clear: planDaysToClear,
    days_saved_to_clear: daysSavedToClear,
    inventory_age_days: invAge,
    age_tier: ageTier,
    holding_cost_pct_per_month: holdingPct,
    holding_cost_saved_vnd: holdingCostSaved,
    adjusted_profit_delta_vnd: adjustedProfitDelta,
  };

  let advisory = working.advisory ?? null;
  if (advisory) {
    const baseDeltaPct =
      base.profit !== 0 ? Number(((profitDelta / Math.abs(base.profit)) * 100).toFixed(2)) : 0;
    const riskFlags = [...(advisory.risk_flags ?? [])];
    let verdictCode = advisory.verdict_code;
    if (goal === 'clear_inventory') {
      if (!recoversUnitCost || exp.profit < 0) {
        verdictCode = 'CLEARANCE_BELOW_COST';
        if (!riskFlags.includes('below_cost_clearance')) riskFlags.push('below_cost_clearance');
      } else if (
        extraUnitsCleared > 0 &&
        (adjustedProfitDelta >= 0 || recoversTotalCost || (invAge !== null && invAge >= 45))
      ) {
        verdictCode = 'CLEARANCE_WORTHWHILE';
        if (profitDelta < 0 && !riskFlags.includes('tradeoff_profit_for_cash_clearance')) {
          riskFlags.push('tradeoff_profit_for_cash_clearance');
        }
      } else {
        verdictCode = 'CLEARANCE_PROFITABLE_TRADE_OFF';
      }
    }
    advisory = {
      ...advisory,
      verdict_code: verdictCode,
      expected_profit_delta_vnd: profitDelta,
      expected_profit_delta_pct: baseDeltaPct,
      risk_flags: riskFlags,
    };
  }

  return {
    ...working,
    advisory,
    clearance,
  };
}

function hydrateFinancialDiagnostics(
  res: SimulateResponse,
  req: SimulateRequest
): SimulateResponse {
  if (res.waterfall && res.cash_flow && res.sensitivity_tornado) {
    return res;
  }
  const exp = res.scenarios.expected;
  const basePeriod = req.baseline_period_days && req.baseline_period_days > 0 ? req.baseline_period_days : 30;
  const hasSchedule = Boolean(req.schedule && req.schedule.length > 0);
  const horizonDays = hasSchedule
    ? req.schedule!.reduce((acc, ph) => acc + Math.max(0, ph.days || 0), 0) || basePeriod
    : req.horizon_days && req.horizon_days > 0
      ? req.horizon_days
      : basePeriod;
  const fixedScale = !hasSchedule && horizonDays !== basePeriod ? horizonDays / basePeriod : 1;
  const fixedCost = Math.round((req.product.fixed_cost_vnd ?? 0) * fixedScale);
  const cogs = Math.max(0, Math.round(exp.qty * req.product.unit_cost_vnd));
  const grossProfit = exp.revenue - cogs;
  const netProfit = exp.profit;

  const waterfall = res.waterfall ?? [
    { key: 'revenue', amount_vnd: exp.revenue, start_vnd: 0, end_vnd: exp.revenue, is_total: false },
    { key: 'cogs', amount_vnd: -cogs, start_vnd: exp.revenue, end_vnd: grossProfit, is_total: false },
    { key: 'gross_profit', amount_vnd: grossProfit, start_vnd: 0, end_vnd: grossProfit, is_total: true },
    { key: 'fixed_marketing', amount_vnd: -fixedCost, start_vnd: grossProfit, end_vnd: netProfit, is_total: false },
    { key: 'net_profit', amount_vnd: netProfit, start_vnd: 0, end_vnd: netProfit, is_total: true },
  ];

  const restockUnits = req.planned_restock_units ?? 0;
  const restockCashNeeded = restockUnits * req.product.unit_cost_vnd;
  const netCashFlow = exp.revenue - cogs - fixedCost - restockCashNeeded;

  const cashFlow = res.cash_flow ?? {
    revenue_vnd: exp.revenue,
    cogs_vnd: cogs,
    fixed_marketing_vnd: fixedCost,
    restock_units: restockUnits,
    restock_cash_needed_vnd: restockCashNeeded,
    net_cash_flow_vnd: netCashFlow,
    net_profit_vnd: netProfit,
  };

  const reactionSpread = Math.abs(
    res.scenarios.optimistic.profit - res.scenarios.pessimistic.profit
  );
  const priceSwing = Math.max(Math.round(exp.revenue * 0.08), Math.round(Math.abs(netProfit) * 0.16));
  const cogsSwing = Math.round(cogs * 0.1);
  const mktSwing = Math.max(2_000_000, Math.round(fixedCost * 0.5));

  const sensitivity_tornado =
    res.sensitivity_tornado ??
    [
      {
        key: 'selling_price',
        low_profit: netProfit - priceSwing,
        base_profit: netProfit,
        high_profit: netProfit + priceSwing,
        spread_vnd: priceSwing * 2,
        low_label: '-10%',
        high_label: '+10%',
      },
      {
        key: 'buyer_reaction',
        low_profit: res.scenarios.pessimistic.profit,
        base_profit: netProfit,
        high_profit: res.scenarios.optimistic.profit,
        spread_vnd: reactionSpread,
        low_label: 'p10',
        high_label: 'p90',
      },
      {
        key: 'unit_cost',
        low_profit: netProfit - cogsSwing,
        base_profit: netProfit,
        high_profit: netProfit + cogsSwing,
        spread_vnd: cogsSwing * 2,
        low_label: '+10%',
        high_label: '-10%',
      },
      {
        key: 'fixed_marketing',
        low_profit: netProfit - mktSwing,
        base_profit: netProfit,
        high_profit: netProfit + Math.round(mktSwing * 0.4),
        spread_vnd: Math.round(mktSwing * 1.4),
        low_label: `+${Math.round(mktSwing / 1_000_000)}M ₫`,
        high_label: `-${Math.round((mktSwing * 0.4) / 1_000_000)}M ₫`,
      },
    ].sort((a, b) => b.spread_vnd - a.spread_vnd);

  return {
    ...res,
    waterfall,
    cash_flow: cashFlow,
    sensitivity_tornado,
  };
}

export class ApiClient {
  public useFixtures: boolean;

  constructor(useFixtures = DEFAULT_USE_FIXTURES) {
    this.useFixtures = useFixtures;
  }

  public getSampleUploadForPreview(): {
    profile: IngestProfileResponse;
    mapping: IngestMapResponse;
  } {
    return {
      profile: BUNDLE.sample_profile,
      mapping: BUNDLE.sample_mapping,
    };
  }

  public getDemoElasticity(label: 'SYNTHETIC' | 'PUBLIC_M5'): {
    datasetId: string;
    elasticity: ElasticityFitResponse;
  } {
    const entry = BUNDLE.datasets[label];
    return {
      datasetId: entry.dataset_id,
      elasticity: {
        period_days: entry.period_days,
        data_label: entry.data_label,
        products: entry.products.map((p) => ({
          ...p,
          fixed_cost_vnd: p.fixed_cost_vnd ?? 0,
          enforce_stock_cap: label !== 'SYNTHETIC',
        })),
      },
    };
  }

  public async profileCsv(file: File): Promise<IngestProfileResponse> {
    if (this.useFixtures) {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length < 2) {
        return BUNDLE.sample_profile;
      }
      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const sampleRows = lines.slice(1, 6).map((row) =>
        row.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      );
      const columns: ColumnProfile[] = headers.map((name, colIdx) => {
        const vals = sampleRows
          .map((r) => r[colIdx] ?? '')
          .filter((v) => v !== '')
          .slice(0, 3);
        const looksNumeric =
          vals.length > 0 && vals.every((v) => /^-?[\d.,]+$/.test(v));
        const looksDate =
          vals.length > 0 && vals.every((v) => /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(v));
        return {
          name,
          dtype_guess: looksDate ? 'date' : looksNumeric ? 'numeric' : 'string',
          null_pct: 0,
          n_unique: lines.length - 1,
          samples: vals,
        };
      });
      return {
        upload_id: `offline-${Date.now()}`,
        n_rows: lines.length - 1,
        columns,
      };
    }

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${GO_API_BASE}/api/ingest/profile`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  public async proposeMapping(
    uploadId: string,
    profileColumns?: ColumnProfile[]
  ): Promise<IngestMapResponse> {
    if (this.useFixtures) {
      if (!profileColumns || profileColumns.length === 0) {
        return BUNDLE.sample_mapping;
      }
      const mapping: ColumnMappingItem[] = [];
      const usedSources = new Set<string>();
      for (const [canonical, aliases] of Object.entries(OFFLINE_HEADER_ALIASES)) {
        let bestSrc: string | null = null;
        let bestScore = 0;
        for (const col of profileColumns) {
          if (usedSources.has(col.name)) continue;
          const norm = col.name.toLowerCase().trim();
          if (aliases.includes(norm)) {
            bestSrc = col.name;
            bestScore = 0.95;
            break;
          }
          if (aliases.some((a) => norm.includes(a) || a.includes(norm))) {
            if (0.72 > bestScore) {
              bestSrc = col.name;
              bestScore = 0.72;
            }
          }
        }
        if (bestSrc) usedSources.add(bestSrc);
        mapping.push({
          canonical,
          source: bestSrc,
          confidence: bestScore,
          method: bestSrc ? 'fixture_alias' : 'unmatched',
          alternatives: [],
        });
      }
      const mappedCanon = new Set(mapping.filter((m) => m.source).map((m) => m.canonical));
      const missing: string[] = [];
      for (const req of ['date', 'price', 'quantity']) {
        if (!mappedCanon.has(req)) missing.push(req);
      }
      if (!mappedCanon.has('product_id') && !mappedCanon.has('product_name')) {
        missing.push('product_id');
      }
      return {
        mapping,
        missing_required: missing,
        warnings:
          missing.length > 0
            ? [`Missing required columns: ${missing.join(', ')}`]
            : [],
      };
    }

    const res = await fetch(`${GO_API_BASE}/api/ingest/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  public async commitMapping(
    uploadId: string,
    mapping: Record<string, string>,
    options: IngestCommitOptions
  ): Promise<IngestCommitResponse> {
    if (this.useFixtures) {
      return {
        dataset_id: 'fashion_shop_12',
        label: 'USER',
        quality_report: {
          mode: 'offline_fixture',
          mapped_fields: Object.keys(mapping).length,
          price_unit: options.price_unit,
        },
      };
    }

    const res = await fetch(`${GO_API_BASE}/api/ingest/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id: uploadId, mapping, options }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  public async fitElasticity(
    datasetId: string,
    fallbackLabel: DataLabel = 'SYNTHETIC'
  ): Promise<ElasticityFitResponse> {
    if (this.useFixtures) {
      const demoKey = fallbackLabel === 'PUBLIC_M5' ? 'PUBLIC_M5' : 'SYNTHETIC';
      const demo = this.getDemoElasticity(demoKey);
      return {
        ...demo.elasticity,
        data_label: fallbackLabel === 'USER' ? 'USER' : demo.elasticity.data_label,
      };
    }

    const res = await fetch(`${GO_API_BASE}/api/elasticity/fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    const payload = (await res.json()) as ElasticityFitResponse;
    payload.products = payload.products.map((p) => ({
      ...p,
      fixed_cost_vnd: p.fixed_cost_vnd ?? 0,
      enforce_stock_cap:
        p.stock_available !== null &&
        p.stock_available !== undefined &&
        p.stock_available >= p.baseline_qty_per_period * 0.25,
    }));
    return payload;
  }

  public async simulate(
    req: SimulateRequest,
    meta?: { productId: string; respectStockCap: boolean }
  ): Promise<{ response: SimulateResponse; fixtureNote?: string }> {
    if (this.useFixtures) {
      const pid = meta?.productId || 'P01';
      const prodEntry = BUNDLE.simulations[pid] || BUNDLE.simulations.P01;
      if (req.schedule && req.schedule.length > 0 && prodEntry.schedule_showcase) {
        const computed = buildOfflineClearanceAndAdvisory(prodEntry.schedule_showcase, req);
        return {
          response: hydrateFinancialDiagnostics(computed, req),
          fixtureNote:
            'Offline mode shows the saved multi-phase Go schedule (15 days −30%, then 15 days +1%/day). Turn off offline mode to simulate custom daily schedules.',
        };
      }
      const modeKey = meta?.respectStockCap && prodEntry.capped ? 'capped' : 'unconstrained';
      const grid = BUNDLE.pct_grid;
      let nearest = grid[0];
      let bestDist = Math.abs(req.price_change_pct - nearest);
      for (const candidate of grid) {
        const dist = Math.abs(req.price_change_pct - candidate);
        if (dist < bestDist) {
          bestDist = dist;
          nearest = candidate;
        }
      }
      const computed = buildOfflineClearanceAndAdvisory(prodEntry[modeKey][String(nearest)], req);
      const response = hydrateFinancialDiagnostics(computed, req);
      const note =
        bestDist > 0.01
          ? `Offline mode shows the nearest saved step (${formatPct(nearest, 0)}). Turn off offline mode to simulate exactly ${formatPct(req.price_change_pct, 1)}.`
          : 'Saved engine results (offline mode).';
      return { response, fixtureNote: note };
    }

    const res = await fetch(`${GO_API_BASE}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    const response = (await res.json()) as SimulateResponse;
    return { response: hydrateFinancialDiagnostics(response, req) };
  }

  public async optimize(
    req: OptimizeRequest,
    meta?: { productId: string }
  ): Promise<{ response: OptimizeResponse; fixtureNote?: string }> {
    if (this.useFixtures) {
      const pid = meta?.productId || 'P01';
      const entry = BUNDLE.optimizations[pid] || BUNDLE.optimizations.P01;
      const response = entry[req.objective] || entry.max_expected_profit;
      return {
        response,
        fixtureNote: 'Saved engine results (offline mode).',
      };
    }

    const res = await fetch(`${GO_API_BASE}/api/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    const response = (await res.json()) as OptimizeResponse;
    return { response };
  }

  public async nlqParse(
    question: string,
    products: ProductElasticity[],
    activeProductId?: string | null
  ): Promise<NLQParseResponse> {
    const catalog = products.map((p) => ({
      product_id: p.product_id,
      name: p.product_name,
    }));

    if (this.useFixtures) {
      const trimmed = question.trim();
      const lower = trimmed.toLowerCase();
      const isVi =
        /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/.test(lower) ||
        /(tăng|tang|giảm|giam|ngày|ngay|nagyf|mỗi ngày|tết|tet|có được không)/.test(lower);
      const activeFallback = products.find((p) => p.product_id === activeProductId) ?? products[0];
      const matched =
        products.find(
          (p) =>
            lower.includes(p.product_id.toLowerCase()) ||
            lower.includes(p.product_name.toLowerCase())
        ) ?? activeFallback;

      if (!matched) {
        return { error: 'No matching product found in catalog.', fallback: 'manual_form' };
      }

      const isYesNo = /(có được không|co duoc khong|có nên|co nen|có ổn|có lỗ|can i|should i|feasible)/.test(
        lower
      );
      const isTet = /(tết|tet|cận tết|can tet)/.test(lower);
      const isDoubleSale = /(11\.11|12\.12|9\.9|10\.10|ngày đôi|ngay doi|mega sale)/.test(lower);
      const decisionGoal: DecisionGoal =
        /(xả kho|xa kho|xả hàng|xa hang|thu hồi vốn|thu hoi von|xoay vòng vốn|xoay vong von|thanh lý|thanh ly|tồn kho lâu|ton kho lau|giải phóng vốn|clear stock|clear inventory|clearance|working capital|free up cash)/.test(
          lower
        )
          ? 'clear_inventory'
          : 'maximize_profit';
      const ageM = lower.match(
        /(?:nhập kho|nhap kho|lưu kho|luu kho|nằm kho|nam kho|tồn kho|ton kho|tồn|ton|in stock|sitting)\s*(?:được|duoc|khoảng|khoang|từ|tu|đã|da|hơn|hon|gần|gan|for|over|about)?\s*(\d+)\s*(?:ngày|ngay|days?)/
      );
      const monthAgeM = !ageM
        ? lower.match(/(?:nhập kho|nhap kho|lưu kho|nằm kho|tồn kho|in stock)\s*(?:được|khoảng|for|over)?\s*(\d+)\s*(?:tháng|thang|months?)/)
        : null;
      const inventoryAgeDays = ageM
        ? parseInt(ageM[1], 10)
        : monthAgeM
          ? parseInt(monthAgeM[1], 10) * 30
          : null;
      const cleanedLower = ageM
        ? `${lower.slice(0, ageM.index)} ${lower.slice((ageM.index ?? 0) + ageM[0].length)}`.trim()
        : monthAgeM
          ? `${lower.slice(0, monthAgeM.index)} ${lower.slice((monthAgeM.index ?? 0) + monthAgeM[0].length)}`.trim()
          : lower;
      const qType = isYesNo ? 'yes_no_feasibility' : 'what_if_scenario';

      // Support offline multi-phase query parsing (e.g. "15 ngày đầu giảm 30%, 15 ngày sau mỗi ngày tăng 1%")
      const clauses = lower.split(/[,;]|sau đó|sau do|rồi|roi|then/).map((c) => c.trim()).filter(Boolean);
      const parsedPhases: SchedulePhase[] = [];
      if (clauses.length >= 2) {
        for (let i = 0; i < clauses.length; i += 1) {
          const cl = clauses[i];
          const dayM = cl.match(/(\d+)\s*(?:ngày|ngay|nagyf|nagy|days?)/);
          const pctM = cl.match(/([+-]?\d+(?:\.\d+)?)\s*(?:%|percent|pct|phần trăm)/);
          if (!dayM || !pctM) continue;
          let pVal = parseFloat(pctM[1]);
          if (/(giam|giảm|decrease|cut|drop|discount|lower|down)/.test(cl) && pVal > 0) pVal = -pVal;
          const isDaily = /(mỗi ngày|moi ngay|moi nagyf|hàng ngày|per day|each day|daily)/.test(cl);
          parsedPhases.push(
            isDaily
              ? {
                  days: parseInt(dayM[1], 10),
                  start_change_pct: 0,
                  daily_step_pct: pVal,
                  relative_to_prev: i > 0,
                  compound_daily_step: true,
                  step_on_first_day: true,
                }
              : {
                  days: parseInt(dayM[1], 10),
                  start_change_pct: pVal,
                  daily_step_pct: 0,
                }
          );
        }
      }
      if (parsedPhases.length >= 2) {
        const totalDays = parsedPhases.reduce((acc, ph) => acc + ph.days, 0);
        if (totalDays < 7 || totalDays > 90) {
          return { error: `Total horizon ${totalDays} days is outside [7, 90].`, fallback: 'manual_form' };
        }
        return {
          product_id: matched.product_id,
          change_type: 'price_schedule',
          change_value: parsedPhases[0].start_change_pct,
          horizon_days: totalDays,
          schedule: parsedPhases,
          detected_language: isVi ? 'vi' : 'en',
          question_type: isYesNo ? 'yes_no_feasibility' : 'schedule_plan',
          baseline_period_days: 30,
          decision_goal: decisionGoal,
          inventory_age_days: inventoryAgeDays,
        };
      }

      const pctMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?)\s*(?:%|percent|pct|phần trăm)/i);
      if (!pctMatch) {
        return {
          error: 'Could not detect a clear percentage price change (e.g. "+10%" or "-15%").',
          fallback: 'manual_form',
        };
      }
      let pct = parseFloat(pctMatch[1]);
      if (/(giam|giảm|decrease|cut|drop|discount|lower|down)/i.test(trimmed) && pct > 0) {
        pct = -pct;
      }
      if (pct < -50 || pct > 100) {
        return {
          error: `Requested change ${pct}% is outside allowed bounds [-50%, +100%].`,
          fallback: 'manual_form',
        };
      }

      // Support delayed seasonal event parsing offline too
      const delayM = cleanedLower.match(/(\d+)\s*(?:ngày|ngay)\s*(?:nữa|nua|sau)/);
      const winM = cleanedLower.match(/(?:vào|vao|trong)\s+(\d+)\s*(?:ngày|ngay|days?)/);
      if (delayM || isTet || isDoubleSale) {
        const delayDays = delayM ? parseInt(delayM[1], 10) : 0;
        const winDays = winM ? parseInt(winM[1], 10) : delayDays > 0 ? 7 : 14;
        const dMult = isTet ? 1.65 : isDoubleSale ? 1.85 : 1.0;
        const eMult = isTet ? 0.75 : isDoubleSale ? 1.15 : 1.0;
        const evLabel = isTet
          ? isVi
            ? 'Dịp Tết Nguyên Đán'
            : 'Tết Holiday Rush'
          : isDoubleSale
            ? isVi
              ? 'Ngày siêu sale đôi'
              : 'Double-Day Sale'
            : isVi
              ? 'Giai đoạn đổi giá'
              : 'Target window';
        const phases: SchedulePhase[] = [];
        if (delayDays > 0 && delayDays + winDays <= 90) {
          phases.push({
            days: delayDays,
            start_change_pct: 0,
            daily_step_pct: 0,
            demand_multiplier: 1.0,
            elasticity_multiplier: 1.0,
            label: isVi ? `${delayDays} ngày bình thường (giữ giá)` : `${delayDays} normal days`,
          });
        }
        phases.push({
          days: winDays,
          start_change_pct: pct,
          daily_step_pct: 0,
          demand_multiplier: dMult,
          elasticity_multiplier: eMult,
          label: isVi ? `${winDays} ngày ${evLabel} (${pct > 0 ? '+' : ''}${pct}%)` : `${winDays} ${evLabel} days`,
        });
        const tot = phases.reduce((acc, ph) => acc + ph.days, 0);
        if (tot >= 7 && tot <= 90) {
          return {
            product_id: matched.product_id,
            change_type: 'price_schedule',
            change_value: pct,
            horizon_days: tot,
            schedule: phases,
            detected_language: isVi ? 'vi' : 'en',
            question_type: qType,
            baseline_period_days: 30,
            decision_goal: decisionGoal,
            inventory_age_days: inventoryAgeDays,
            event_context: {
              event_key: isTet ? 'tet' : isDoubleSale ? 'double_sale' : 'delayed_window',
              event_label: evLabel,
              delay_days: delayDays,
              active_days: winDays,
              demand_multiplier: dMult,
              elasticity_multiplier: eMult,
            },
            assumptions_summary: isVi
              ? `${delayDays > 0 ? `${delayDays} ngày đầu giữ nguyên giá cũ (ngày thường 1,0x) → ` : ''}${winDays} ngày ${evLabel} áp dụng ${pct > 0 ? '+' : ''}${pct}% (sức mua ${dMult}x, độ nhạy giá ${eMult}x).`
              : `${delayDays > 0 ? `Hold current price for ${delayDays} normal days → ` : ''}apply ${pct > 0 ? '+' : ''}${pct}% for ${winDays} ${evLabel} days (${dMult}x demand, ${eMult}x sensitivity).`,
          };
        }
      }

      const singleHorizon = winM
        ? Math.min(90, Math.max(7, parseInt(winM[1], 10)))
        : decisionGoal === 'clear_inventory'
          ? 14
          : 30;
      const spec: DecisionSpec = {
        product_id: matched.product_id,
        change_type: 'price_pct',
        change_value: pct,
        horizon_days: singleHorizon,
        detected_language: isVi ? 'vi' : 'en',
        question_type: qType,
        decision_goal: decisionGoal,
        inventory_age_days: inventoryAgeDays,
      };
      return spec;
    }

    const res = await fetch(`${GO_API_BASE}/api/nlq/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        catalog,
        active_product_id: activeProductId ?? null,
      }),
    });
    if (!res.ok) {
      return {
        error: await parseErrorDetail(res),
        fallback: 'manual_form',
      };
    }
    return res.json();
  }

  public async nlqExplain(
    scenarioResult: SimulateResponse,
    businessContext?: BusinessContext | null,
    language?: 'en' | 'vi' | null,
    question?: string | null,
    extra?: {
      decisionSpec?: DecisionSpec | null;
      optimizeSummary?: Record<string, unknown> | null;
    }
  ): Promise<NLQExplainResponse> {
    if (this.useFixtures) {
      const { base, expected, optimistic, pessimistic } = scenarioResult.scenarios;
      const dist = scenarioResult.profit_distribution;
      const be = scenarioResult.break_even_elasticity;
      const adv = scenarioResult.advisory;
      const isVi =
        language === 'vi' ||
        Boolean(question && /(ngày|ngay|nagyf|giảm|giam|tăng|tang|lợi nhuận|giá|tết|tet)/.test(question.toLowerCase()));

      const verdictCode =
        adv?.verdict_code ??
        (expected.profit > base.profit && dist.p5 >= base.profit
          ? 'STRONGLY_RECOMMENDED'
          : expected.profit >= base.profit
          ? 'CAUTIOUS_TRIAL_RECOMMENDED'
          : 'NEGATIVE_EXPECTED_PROFIT');
      const verdictLevel: 'go' | 'caution' | 'stop' =
        verdictCode === 'STRONGLY_RECOMMENDED' || verdictCode === 'CLEARANCE_WORTHWHILE'
          ? 'go'
          : verdictCode === 'CAUTIOUS_TRIAL_RECOMMENDED' ||
              verdictCode === 'HIGH_UNCERTAINTY_AB_TEST' ||
              verdictCode === 'CLEARANCE_PROFITABLE_TRADE_OFF'
          ? 'caution'
          : 'stop';

      const baseMargin = adv?.base_margin_pct ?? businessContext?.base_margin_pct;
      const stockCover = businessContext?.stock_days_cover;
      const spec = extra?.decisionSpec;
      const clr = scenarioResult.clearance;
      const isClearanceGoal =
        clr?.decision_goal === 'clear_inventory' || spec?.decision_goal === 'clear_inventory';
      const isYesNoOrPlan =
        spec?.question_type === 'yes_no_feasibility' ||
        spec?.question_type === 'schedule_plan' ||
        Boolean(spec?.event_context);
      let directAnswer: string | null = null;
      if (isYesNoOrPlan) {
        if (isVi) {
          if (verdictCode === 'CLEARANCE_WORTHWHILE' && clr) {
            directAnswer = `CÓ — ĐÁNG ĐỂ XẢ KHO: giá mới vẫn thu hồi ${clr.unit_recovery_pct.toFixed(0)}% tiền nhập vốn, bán thêm ${formatInt(clr.extra_units_cleared)} món và giải phóng thêm ${formatVND(clr.extra_capital_freed_vnd)} tiền mặt.`;
          } else if (verdictCode === 'CLEARANCE_PROFITABLE_TRADE_OFF' && clr) {
            directAnswer = `CÓ THỂ CÂN NHẮC XẢ KHO: giá mới vẫn cao hơn giá nhập (${clr.unit_recovery_pct.toFixed(0)}%) để thu về tiền mặt, chỉ cần giới hạn số ngày chạy khuyến mãi.`;
          } else if (verdictCode === 'CLEARANCE_BELOW_COST') {
            directAnswer = `KHÔNG NÊN GIẢM SÂU TỚI MỨC NÀY: giá bán thấp hơn giá vốn hoặc làm tổng tiền lãi bị âm (${formatVND(expected.profit)}).`;
          } else {
            directAnswer =
              verdictLevel === 'go'
                ? `CÓ, NÊN THỰC HIỆN: phương án đạt lãi dự kiến ${formatVND(expected.profit)} (tăng hơn giữ giá cũ ${formatVND(base.profit)}).`
                : verdictLevel === 'caution'
                  ? `CÓ THỂ THỬ NGHIỆM NHỎ TRƯỚC: lãi dự kiến ${formatVND(expected.profit)} so với giữ giá cũ ${formatVND(base.profit)}, cần theo dõi phản ứng khách.`
                  : `KHÔNG NÊN ÁP DỤNG MỨC NÀY: lãi dự kiến còn ${formatVND(expected.profit)} (thấp hơn giữ giá cũ ${formatVND(base.profit)}) hoặc chạm giới hạn rủi ro.`;
          }
        } else {
          if (verdictCode === 'CLEARANCE_WORTHWHILE' && clr) {
            directAnswer = `YES — WORTHWHILE CLEARANCE: covers ${clr.unit_recovery_pct.toFixed(0)}% of purchase cost, moves ${formatInt(clr.extra_units_cleared)} extra units, and frees ${formatVND(clr.extra_capital_freed_vnd)} more inventory capital.`;
          } else {
            directAnswer =
              verdictLevel === 'go'
                ? `YES — GOOD TO TRY: projected profit reaches ${formatVND(expected.profit)} vs keeping old price (${formatVND(base.profit)}).`
                : verdictLevel === 'caution'
                  ? `POSSIBLE WITH A SMALL TRIAL: projected profit is ${formatVND(expected.profit)} vs keeping old price (${formatVND(base.profit)}).`
                  : `NO — SKIP THIS LEVEL: projected profit drops to ${formatVND(expected.profit)} vs keeping old price (${formatVND(base.profit)}).`;
          }
        }
      }

      if (isVi) {
        const verdictVi: Record<string, string> = {
          STRONGLY_RECOMMENDED: 'NÊN ÁP DỤNG THỬ (KHẢ QUAN)',
          CAUTIOUS_TRIAL_RECOMMENDED: 'CÓ THỂ THỬ NGHIỆM NHỎ TRƯỚC',
          HIGH_UNCERTAINTY_AB_TEST: 'NÊN THỬ NGẮN NGÀY TRƯỚC (SỐ LIỆU CŨ CHƯA RÕ)',
          MARGIN_EROSION_WARNING: 'CẨN TRỌNG: TIỀN LỜI MỖI MÓN QUÁ MỎNG HOẶC BỊ LỖ',
          STOCK_CONSTRAINED_HOLD_OR_RAISE: 'CẢNH BÁO THIẾU HÀNG — KHÔNG NÊN GIẢM GIÁ SÂU',
          NEGATIVE_EXPECTED_PROFIT: 'KHÔNG NÊN ĐỔI — TỔNG TIỀN LÃI GIẢM SO VỚI GIÁ CŨ',
          CLEARANCE_WORTHWHILE: 'KHẢ QUAN CHO MỤC TIÊU XẢ KHO & XOAY VỐN',
          CLEARANCE_PROFITABLE_TRADE_OFF: 'CHẤP NHẬN ĐƯỢC NẾU MUỐN XOAY VỐN NHANH',
          CLEARANCE_BELOW_COST: 'CẢNH BÁO BÁN DƯỚI GIÁ VỐN — GIẢM QUÁ SÂU',
        };
        const sitParts: string[] = [];
        if (baseMargin !== undefined && baseMargin !== null) {
          sitParts.push(`Tiền lời hiện chiếm ${baseMargin.toFixed(1)}% trên mỗi đồng bán ra.`);
        }
        if (stockCover !== undefined && stockCover !== null) {
          sitParts.push(`Hàng trong kho hiện đủ bán khoảng ${stockCover.toFixed(1)} ngày.`);
        }
        if (clr?.inventory_age_days) {
          sitParts.push(`Lô hàng đã nhập kho ${clr.inventory_age_days} ngày.`);
        }
        const recs: string[] = [];
        if (isClearanceGoal && clr) {
          if (clr.recovers_unit_cost) {
            recs.push(
              `Hoàn vốn nhập hàng: giá mới đạt ${clr.unit_recovery_pct.toFixed(0)}% so với giá nhập (chưa lỗ vốn gốc), bán nhanh hơn ${clr.turnover_speedup_pct.toFixed(1)}% (${formatInt(clr.extra_units_cleared)} món) và thu hồi thêm ${formatVND(clr.extra_capital_freed_vnd)} tiền vốn.`
            );
          } else {
            recs.push(
              `Giá mới chỉ thu lại ${clr.unit_recovery_pct.toFixed(0)}% tiền nhập mỗi món — nên bớt mức giảm để tránh bán dưới giá vốn.`
            );
          }
          if (clr.days_saved_to_clear && clr.days_saved_to_clear > 0 && clr.plan_days_to_clear) {
            recs.push(
              `Tốc độ dọn kho: thời gian bán hết tồn kho rút ngắn ${clr.days_saved_to_clear.toFixed(1)} ngày (còn khoảng ${clr.plan_days_to_clear.toFixed(1)} ngày).`
            );
          }
          if (clr.holding_cost_saved_vnd > 0) {
            recs.push(
              `Tiết kiệm thêm khoảng ${formatVND(clr.holding_cost_saved_vnd)} chi phí lưu kho / rớt giá hàng tồn khi xoay vốn sớm.`
            );
          }
        } else if (expected.profit >= base.profit) {
          recs.push(
            `Tiền lãi dự kiến đạt ${formatVND(expected.profit)} (so với giữ giá cũ ${formatVND(base.profit)}); lượng bán ước tính quanh ${formatInt(expected.qty)} món.`
          );
        } else {
          const recoveryHint =
            clr && clr.recovers_unit_cost && clr.extra_units_cleared > 0
              ? ` Tuy nhiên nếu mục tiêu là xả kho xoay vốn, giá này vẫn hoàn ${clr.unit_recovery_pct.toFixed(0)}% tiền nhập và giải phóng thêm ${formatVND(clr.extra_capital_freed_vnd)}.`
              : ' — hãy thử mục "Tìm giá đạt mục tiêu lãi" để máy gợi ý mức giá tốt hơn.';
          recs.push(
            `Tiền lãi dự kiến giảm còn ${formatVND(expected.profit)} (thấp hơn giữ giá cũ ${formatVND(base.profit)})${recoveryHint}`
          );
        }
        if (adv && adv.min_margin_pct_in_plan < 15) {
          recs.push(
            `Ở ngày giảm sâu nhất, tiền lời mỗi món chỉ còn ${adv.min_margin_pct_in_plan.toFixed(1)}% — nên giảm nhẹ bớt hoặc rút ngắn thời gian khuyến mãi.`
          );
        }
        if (be !== null && be !== undefined && !isClearanceGoal) {
          recs.push(
            `Giới hạn an toàn: nếu khách giảm mua mạnh quá ngưỡng ${formatNum(be)}% cho mỗi 1% đổi giá, hãy quay lại giá cũ ${formatVND(base.price_vnd ?? null)}.`
          );
        }
        const extraBullet =
          clr && clr.extra_units_cleared > 0
            ? `\n• Hiệu quả xả kho & hoàn vốn: giá mới hoàn ${clr.unit_recovery_pct.toFixed(0)}% tiền nhập, đẩy thêm ${formatInt(clr.extra_units_cleared)} món (+${clr.turnover_speedup_pct.toFixed(1)}% tốc độ bán) và giải phóng thêm ${formatVND(clr.extra_capital_freed_vnd)} tiền vốn.`
            : '';
        return {
          text: [
            `• Nếu giữ nguyên giá cũ (${formatVND(base.price_vnd ?? null)}): bán khoảng ${formatInt(base.qty)} món, tiền lãi ${formatVND(base.profit)}.`,
            `• Với phương án mới: dự kiến bán ${formatInt(expected.qty)} món, tiền lãi đạt ${formatVND(expected.profit)} (tốt nhất ${formatVND(optimistic.profit)}, trường hợp khách ngại giá ${formatVND(pessimistic.profit)}).`,
            `• Khi chạy thử nhiều tình huống thị trường, 90% khả năng tiền lãi nằm trong khoảng từ ${formatVND(dist.p5)} đến ${formatVND(dist.p95)}.`,
          ].join('\n') + extraBullet,
          direct_answer: directAnswer,
          action_verdict: verdictVi[verdictCode] ?? 'NÊN XEM KỸ TRƯỚC KHI ÁP DỤNG',
          verdict_level: verdictLevel,
          situation_summary:
            sitParts.join(' ') || 'Đánh giá dựa trên hóa đơn bán hàng và giá nhập hiện tại của shop.',
          recommendations: recs,
        };
      }

      const verdictEn: Record<string, string> = {
        STRONGLY_RECOMMENDED: 'GOOD TO TRY — STRONG UPSIDE',
        CAUTIOUS_TRIAL_RECOMMENDED: 'TRY ON A SMALL SCALE FIRST',
        HIGH_UNCERTAINTY_AB_TEST: 'CAUTION — TEST BRIEFLY FIRST (LIMITED DATA)',
        MARGIN_EROSION_WARNING: 'CAUTION: PROFIT PER ITEM GETS TOO THIN',
        STOCK_CONSTRAINED_HOLD_OR_RAISE: 'STOCKOUT RISK — HOLD OR RAISE PRICE INSTEAD',
        NEGATIVE_EXPECTED_PROFIT: 'SKIP THIS PLAN — PROJECTED PROFIT DROPS',
        CLEARANCE_WORTHWHILE: 'WORTHWHILE CLEARANCE — GOOD WORKING-CAPITAL TRADE-OFF',
        CLEARANCE_PROFITABLE_TRADE_OFF: 'VIABLE FOR FAST CASH ROTATION WITH TIME CAP',
        CLEARANCE_BELOW_COST: 'BELOW COST WARNING — DISCOUNT TOO DEEP',
      };
      const beText =
        be !== null && be !== undefined
          ? `• Safety limit is ${formatNum(be)}: if buyers pull back more sharply than this, profit dips below your old price.`
          : '• Break-even limit applies only when price changes and selling price exceeds unit cost.';
      const sitPartsEn: string[] = [];
      if (baseMargin !== undefined && baseMargin !== null) {
        sitPartsEn.push(`Current profit takes ${baseMargin.toFixed(1)}% of selling price.`);
      }
      if (stockCover !== undefined && stockCover !== null) {
        sitPartsEn.push(`Current inventory covers roughly ${stockCover.toFixed(1)} days of normal sales.`);
      }
      if (clr?.inventory_age_days) {
        sitPartsEn.push(`Current batch has been in stock for ${clr.inventory_age_days} days.`);
      }
      const recsEn: string[] = [];
      if (isClearanceGoal && clr) {
        recsEn.push(
          clr.recovers_unit_cost
            ? `Cost recovery: new price recovers ${clr.unit_recovery_pct.toFixed(0)}% of unit cost, moves ${formatInt(clr.extra_units_cleared)} extra units (+${clr.turnover_speedup_pct.toFixed(1)}% faster), and frees ${formatVND(clr.extra_capital_freed_vnd)} more capital.`
            : `Selling price only recovers ${clr.unit_recovery_pct.toFixed(0)}% of unit cost — shallow the cut to avoid selling below purchase cost.`
        );
      } else {
        recsEn.push(
          expected.profit >= base.profit
            ? `Projected profit reaches ${formatVND(expected.profit)} vs keeping old price (${formatVND(base.profit)}); track units sold near ${formatInt(expected.qty)} items.`
            : clr && clr.recovers_unit_cost && clr.extra_units_cleared > 0
              ? `Projected profit softens to ${formatVND(expected.profit)} vs keeping old price (${formatVND(base.profit)}), though if clearing stock you recover ${clr.unit_recovery_pct.toFixed(0)}% of unit cost and free ${formatVND(clr.extra_capital_freed_vnd)} extra capital.`
              : `Projected profit drops to ${formatVND(expected.profit)} below keeping old price (${formatVND(base.profit)}); switch to Find Target Price to test better options.`
        );
      }
      if (adv?.stockout_risk) {
        recsEn.push('Stockout risk detected: hold or raise price unless inventory is replenished first.');
      }
      if (be !== null && be !== undefined && !isClearanceGoal) {
        recsEn.push(`Watch safety limit (${formatNum(be)}); revert toward ${formatVND(base.price_vnd ?? null)} early if orders fall steeply.`);
      }
      const extraBulletEn =
        clr && clr.extra_units_cleared > 0
          ? `\n• Clearance & capital rotation: recovers ${clr.unit_recovery_pct.toFixed(0)}% of unit cost, clears ${formatInt(clr.extra_units_cleared)} extra units (+${clr.turnover_speedup_pct.toFixed(1)}% velocity), and frees ${formatVND(clr.extra_capital_freed_vnd)} extra capital.`
          : '';
      return {
        text: [
          `• Keeping today’s price (${formatVND(base.price_vnd ?? null)}): about ${formatInt(base.qty)} units sold, earning ${formatVND(base.profit)}.`,
          `• With this plan: projected sales reach ${formatInt(expected.qty)} units and profit is ${formatVND(expected.profit)} (between ${formatVND(pessimistic.profit)} cautious and ${formatVND(optimistic.profit)} favorable).`,
          `• Across simulated market runs, 90% of outcomes land between ${formatVND(dist.p5)} and ${formatVND(dist.p95)}.`,
          beText,
        ].join('\n') + extraBulletEn,
        direct_answer: directAnswer,
        action_verdict: verdictEn[verdictCode] ?? 'REVIEW ASSUMPTIONS',
        verdict_level: verdictLevel,
        situation_summary:
          sitPartsEn.join(' ') || 'Assessment based on your item cost, stock, and sales history.',
        recommendations: recsEn,
      };
    }

    const res = await fetch(`${GO_API_BASE}/api/nlq/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_result: scenarioResult,
        business_context: businessContext ?? null,
        language: language ?? null,
        question: question ?? null,
        decision_spec: extra?.decisionSpec ?? null,
        optimize_summary: extra?.optimizeSummary ?? null,
      }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  // ---------------- DECISION INTELLIGENCE ENDPOINTS ----------------

  private async postJson<TReq, TResp>(path: string, payload: TReq): Promise<TResp> {
    const res = await fetch(`${GO_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  async optimizeReplenishment(req: ReplenishRequest): Promise<ReplenishResponse> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live Go engine (:8080) to compute EOQ & Safety Stock.');
    }
    return this.postJson('/api/planning/replenish', req);
  }

  async simulateCashRunway(req: CashRunwayRequest): Promise<CashRunwayResponse> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live Go engine (:8080) to simulate cash runway.');
    }
    return this.postJson('/api/planning/runway', req);
  }

  async optimizePortfolio(req: PortfolioOptimizeRequest): Promise<PortfolioOptimizeResponse> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live Go engine (:8080) to optimize multi-SKU portfolio.');
    }
    return this.postJson('/api/planning/portfolio', req);
  }

  async analyzeValueOfInformation(req: VOIRequest): Promise<VOIResponse> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live Go engine (:8080) to compute EVPI & EVSI.');
    }
    return this.postJson('/api/planning/voi', req);
  }

  async evaluateMonitoring(
    datasetId: string,
    productId: string,
    nRollingWindows = 3
  ): Promise<MonitoringEvaluateResponse> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live ML service to run rolling calibration & drift tests.');
    }
    return this.postJson('/api/monitoring/evaluate', {
      dataset_id: datasetId,
      product_id: productId,
      n_rolling_windows: nRollingWindows,
      seed: 42,
    });
  }

  async analyzeCausalImpact(req: CausalAnalyzeRequest): Promise<CausalAnalyzeResponse> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live ML service to run causal DiD / ITS diagnostics.');
    }
    return this.postJson('/api/causal/analyze', req);
  }

  async listJournal(productId?: string): Promise<JournalListResponse> {
    if (this.useFixtures) {
      return {
        items: [],
        total_count: 0,
        evaluated_count: 0,
        within_band_rate_pct: null,
        cumulative_simulated_profit_vnd: 0,
        cumulative_actual_profit_vnd: 0,
      };
    }
    const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : '';
    const res = await fetch(`${GO_API_BASE}/api/journal${qs}`);
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  async createJournalEntry(req: JournalCreateRequest): Promise<DecisionRecord> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live backend to persist decisions into SQLite journal.');
    }
    return this.postJson('/api/journal', req);
  }

  async updateJournalEntry(decisionId: string, req: JournalUpdateRequest): Promise<DecisionRecord> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live backend to update decision records.');
    }
    const res = await fetch(`${GO_API_BASE}/api/journal/${encodeURIComponent(decisionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }

  async evaluateJournalFromDataset(
    decisionId: string,
    datasetId: string,
    startDate: string,
    horizonDays?: number
  ): Promise<DecisionRecord> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live backend to auto-measure CSV outcomes.');
    }
    return this.postJson(`/api/journal/${encodeURIComponent(decisionId)}/evaluate`, {
      dataset_id: datasetId,
      start_date: startDate,
      horizon_days: horizonDays ?? null,
    });
  }

  async deleteJournalEntry(decisionId: string): Promise<{ deleted: boolean }> {
    if (this.useFixtures) {
      throw new Error('Sample snapshot mode: connect to live backend to delete decision records.');
    }
    const res = await fetch(`${GO_API_BASE}/api/journal/${encodeURIComponent(decisionId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }
}

export const apiClient = new ApiClient();
