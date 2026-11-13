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

export type DecisionGoal = 'maximize_profit' | 'clear_inventory';

export interface BusinessContext {
  base_margin_pct?: number | null;
  recent_14d_avg_qty?: number | null;
  demand_trend_pct?: number | null;
  stock_days_cover?: number | null;
  current_stock_units?: number | null;
  stockout_days_pct?: number | null;
  promo_share_pct?: number | null;
  significant?: boolean | null;
  warnings?: string[];
}

export interface SchedulePhase {
  days: number;
  start_change_pct: number;
  daily_step_pct: number;
  relative_to_prev?: boolean;
  compound_daily_step?: boolean;
  step_on_first_day?: boolean;
  demand_multiplier?: number;
  elasticity_multiplier?: number;
  label?: string;
}

export interface DailySchedulePoint {
  day: number;
  price_vnd: number;
  price_change_pct: number;
  expected_qty: number;
  expected_revenue: number;
  expected_profit: number;
}

export interface AdvisorySummary {
  verdict_code: string;
  base_margin_pct: number;
  min_margin_pct_in_plan: number;
  expected_profit_delta_vnd: number;
  expected_profit_delta_pct: number;
  prob_beat_base: number;
  p5_beats_base: boolean;
  stockout_risk: boolean;
  stock_utilization_pct?: number | null;
  elasticity_regime: string;
  risk_flags: string[];
}

export interface CostBreakdown {
  marketing_vnd: number;
  labor_vnd: number;
  operating_vnd: number;
  other_fixed_vnd: number;
}

export interface ProductElasticity {
  product_id: string;
  product_name: string;
  current_price_vnd: number;
  unit_cost_vnd: number;
  baseline_qty_per_period: number;
  stock_available: number | null;
  fixed_cost_vnd?: number | null;
  cost_breakdown?: CostBreakdown | null;
  elasticity_median: number;
  elasticity_se: number;
  elasticity_samples: number[];
  significant?: boolean;
  price_variation_sd?: number;
  warnings?: string[];
  business_context?: BusinessContext | null;
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
  schedule?: SchedulePhase[];
  baseline_period_days?: number;
  horizon_days?: number;
  decision_goal?: DecisionGoal;
  inventory_age_days?: number | null;
  holding_cost_pct_per_month?: number | null;
  business_context?: BusinessContext | null;
  planned_restock_units?: number | null;
}

export interface ClearanceMetrics {
  decision_goal: DecisionGoal | string;
  horizon_days: number;
  unit_recovery_pct: number;
  recovers_unit_cost: boolean;
  recovers_total_cost: boolean;
  extra_units_cleared: number;
  turnover_speedup_pct: number;
  total_cost_capital_turned_vnd: number;
  extra_capital_freed_vnd: number;
  inventory_capital_vnd?: number | null;
  stock_cleared_pct?: number | null;
  base_days_to_clear?: number | null;
  plan_days_to_clear?: number | null;
  days_saved_to_clear?: number | null;
  inventory_age_days?: number | null;
  age_tier?: 'new' | 'aging' | 'stale' | string;
  holding_cost_pct_per_month: number;
  holding_cost_saved_vnd: number;
  adjusted_profit_delta_vnd: number;
}

export interface WaterfallStep {
  key: 'revenue' | 'cogs' | 'gross_profit' | 'fixed_marketing' | 'net_profit' | string;
  amount_vnd: number;
  start_vnd: number;
  end_vnd: number;
  is_total: boolean;
}

export interface CashFlowSummary {
  revenue_vnd: number;
  cogs_vnd: number;
  fixed_marketing_vnd: number;
  restock_units: number;
  restock_cash_needed_vnd: number;
  net_cash_flow_vnd: number;
  net_profit_vnd: number;
}

export interface TornadoFactor {
  key: 'selling_price' | 'buyer_reaction' | 'unit_cost' | 'fixed_marketing' | string;
  low_profit: number;
  base_profit: number;
  high_profit: number;
  spread_vnd: number;
  low_label: string;
  high_label: string;
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
  prob_beat_base?: number;
  schedule_trace?: DailySchedulePoint[];
  advisory?: AdvisorySummary | null;
  clearance?: ClearanceMetrics | null;
  waterfall?: WaterfallStep[];
  cash_flow?: CashFlowSummary | null;
  sensitivity_tornado?: TornadoFactor[];
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
  change_type: 'price_pct' | 'price_schedule';
  change_value: number;
  horizon_days: number;
  start_date?: string | null;
  schedule?: SchedulePhase[] | null;
  detected_language?: 'en' | 'vi' | null;
  question_type?: 'yes_no_feasibility' | 'what_if_scenario' | 'schedule_plan' | 'reverse_goal';
  baseline_period_days?: number | null;
  event_context?: {
    event_key?: string;
    event_label?: string;
    delay_days?: number;
    active_days?: number;
    demand_multiplier?: number;
    elasticity_multiplier?: number;
    note?: string;
  } | null;
  target_uplift_pct?: number | null;
  assumptions_summary?: string | null;
  decision_goal?: DecisionGoal | null;
  inventory_age_days?: number | null;
}

export interface SuggestedScenarioPreset {
  id: string;
  label: string;
  price_change_pct: number;
  unit_cost_change_pct?: number;
  extra_fixed_cost_vnd?: number;
  restock_units?: number | null;
  horizon_days?: number;
  decision_goal?: DecisionGoal | null;
  inventory_age_days?: number | null;
  note?: string | null;
}

export interface NLQParseFallback {
  error: string;
  fallback: 'manual_form';
  guidance_type?:
    | 'non_price_scope'
    | 'glossary'
    | 'store_health'
    | 'ambiguous_advice'
    | 'multi_option_capital'
    | 'validation_error';
  helpful_answer?: string | null;
  suggested_scenarios?: SuggestedScenarioPreset[];
}

export type NLQParseResponse = DecisionSpec | NLQParseFallback;

export interface NLQExplainResponse {
  text: string;
  direct_answer?: string | null;
  action_verdict?: string | null;
  verdict_level?: 'go' | 'caution' | 'stop' | null;
  situation_summary?: string | null;
  recommendations?: string[];
}

export interface PinnedScenario {
  id: string;
  name: string;
  productId: string;
  productName: string;
  priceChangePct: number;
  unitCostChangePct: number;
  extraFixedCostVnd: number;
  restockUnits: number | null;
  horizonDays: number;
  decisionGoal?: DecisionGoal;
  isSchedule: boolean;
  response: SimulateResponse;
  createdAt: string;
}

