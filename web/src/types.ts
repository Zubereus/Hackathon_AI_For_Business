export type DataLabel = 'SYNTHETIC' | 'PUBLIC_M5' | 'PUBLIC_DUNNHUMBY' | 'USER';

export type ScreenId =
  | 'upload'
  | 'mapping'
  | 'assumptions'
  | 'whatif'
  | 'reverse'
  | 'validation';

export interface ColumnProfile {
  name: string;
  dtype_guess: string;
  null_pct: number;
  n_unique: number;
  samples: Array<string | number | boolean | null>;
}

export interface IngestProfileResponse {
  upload_id: string;
  n_rows: number;
  columns: ColumnProfile[];
}

export interface MappingAlternative {
  source: string;
  score: number;
}

export interface ColumnMappingItem {
  canonical: string;
  source: string | null;
  confidence: number;
  method: string;
  alternatives: MappingAlternative[];
}

export interface IngestMapResponse {
  mapping: ColumnMappingItem[];
  missing_required: string[];
  warnings: string[];
}

export interface IngestCommitOptions {
  price_unit: string;
  date_format?: string | null;
  number_locale?: string | null;
  margin_pct?: number | null;
}

export interface IngestCommitResponse {
  dataset_id: string;
  label: DataLabel;
  quality_report: Record<string, unknown>;
}

export interface ProductElasticity {
  product_id: string;
  product_name: string;
  current_price_vnd: number;
  unit_cost_vnd: number;
  baseline_qty_per_period: number;
  stock_available: number | null;
  fixed_cost_vnd?: number | null;
  elasticity_median: number;
  elasticity_se: number;
  elasticity_samples: number[];
  significant?: boolean;
  price_variation_sd?: number;
  warnings?: string[];
  /** Client-side editable assumption override (does not compute math in browser) */
  enforce_stock_cap?: boolean;
}

export interface ElasticityFitResponse {
  period_days: number;
  data_label: DataLabel;
  products: ProductElasticity[];
}

export interface ProductSimulateInput {
  current_price_vnd: number;
  unit_cost_vnd: number;
  baseline_qty_per_period: number;
  stock_available?: number | null;
  fixed_cost_vnd?: number | null;
  elasticity_samples: number[];
  sigma_resid?: number | null;
}

export interface SimulateRequest {
  product: ProductSimulateInput;
  price_change_pct: number;
  n_sims: number;
  seed: number;
}

export interface ScenarioMetrics {
  price_vnd?: number;
  qty: number;
  revenue: number;
  profit: number;
  spend: number;
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface ProfitDistribution {
  histogram: HistogramBin[];
  p5: number;
  p50: number;
  p95: number;
}

export interface SimulateResponse {
  scenarios: {
    base: ScenarioMetrics;
    optimistic: ScenarioMetrics;
    expected: ScenarioMetrics;
    pessimistic: ScenarioMetrics;
  };
  profit_distribution: ProfitDistribution;
  break_even_elasticity?: number | null;
}

export interface OptimizeConstraints {
  max_price_change_pct: number;
  min_margin_pct?: number | null;
  budget_vnd?: number | null;
  respect_stock: boolean;
}

export interface OptimizeRequest {
  product: ProductSimulateInput;
  objective: 'max_expected_profit' | 'hit_target';
  target_profit_uplift_pct?: number | null;
  constraints: OptimizeConstraints;
  n_sims: number;
  seed: number;
}

export interface RankedOption {
  price_vnd: number;
  price_change_pct: number;
  expected_profit: number;
  p5_profit: number;
  prob_hit_target: number;
  feasible: boolean;
  violated: string[];
}

export interface OptimizeResponse {
  ranked: RankedOption[];
}

export interface DecisionSpec {
  product_id: string;
  change_type: 'price_pct';
  change_value: number;
  horizon_days: number;
  start_date?: string | null;
}

export interface NLQParseFallback {
  error: string;
  fallback: 'manual_form';
}

export type NLQParseResponse = DecisionSpec | NLQParseFallback;

export interface NLQExplainResponse {
  text: string;
}

