import precomputedBundle from './fixtures/precomputed_fixtures.json';
import { formatInt, formatNum, formatPct, formatVND } from './i18n';
import {
  ColumnMappingItem,
  ColumnProfile,
  DataLabel,
  DecisionSpec,
  ElasticityFitResponse,
  IngestCommitOptions,
  IngestCommitResponse,
  IngestMapResponse,
  IngestProfileResponse,
  NLQExplainResponse,
  NLQParseResponse,
  OptimizeRequest,
  OptimizeResponse,
  ProductElasticity,
  SimulateRequest,
  SimulateResponse,
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
      const response = prodEntry[modeKey][String(nearest)];
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
    return { response };
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
    products: ProductElasticity[]
  ): Promise<NLQParseResponse> {
    const catalog = products.map((p) => ({
      product_id: p.product_id,
      name: p.product_name,
    }));

    if (this.useFixtures) {
      const trimmed = question.trim();
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
      const lower = trimmed.toLowerCase();
      const matched =
        products.find(
          (p) =>
            lower.includes(p.product_id.toLowerCase()) ||
            lower.includes(p.product_name.toLowerCase())
        ) ?? products[0];

      if (!matched) {
        return { error: 'No matching product found in catalog.', fallback: 'manual_form' };
      }

      const spec: DecisionSpec = {
        product_id: matched.product_id,
        change_type: 'price_pct',
        change_value: pct,
        horizon_days: 30,
      };
      return spec;
    }

    const res = await fetch(`${GO_API_BASE}/api/nlq/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, catalog }),
    });
    if (!res.ok) {
      return {
        error: await parseErrorDetail(res),
        fallback: 'manual_form',
      };
    }
    return res.json();
  }

  public async nlqExplain(scenarioResult: SimulateResponse): Promise<NLQExplainResponse> {
    if (this.useFixtures) {
      const { base, expected, optimistic, pessimistic } = scenarioResult.scenarios;
      const dist = scenarioResult.profit_distribution;
      const be = scenarioResult.break_even_elasticity;
      const beText =
        be !== null && be !== undefined
          ? ` Profit stays level only if elasticity is ${formatNum(be)}.`
          : ' There is no break-even point when the price change is 0% or unit cost is at or above the price.';
      return {
        text:
          `Baseline: ${formatInt(base.qty)} units at ${formatVND(base.price_vnd ?? null)} give a profit of ${formatVND(base.profit)}. ` +
          `At the expected sensitivity, profit moves to ${formatVND(expected.profit)} (${formatVND(pessimistic.profit)} pessimistic, ${formatVND(optimistic.profit)} optimistic). ` +
          `Nine in ten simulated outcomes land between ${formatVND(dist.p5)} and ${formatVND(dist.p95)}.` +
          beText,
      };
    }

    const res = await fetch(`${GO_API_BASE}/api/nlq/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_result: scenarioResult }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorDetail(res));
    }
    return res.json();
  }
}

export const apiClient = new ApiClient();
