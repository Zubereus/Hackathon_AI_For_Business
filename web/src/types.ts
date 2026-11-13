export type DataLabel = 'SYNTHETIC' | 'PUBLIC_M5' | 'PUBLIC_DUNNHUMBY' | 'USER';

export type ScreenId =
  | 'upload'
  | 'mapping'
  | 'assumptions'
  | 'whatif'
  | 'reverse'
  | 'planning'
  | 'validation'
  | 'journal';

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
  daily_mean_qty?: number | null;
  daily_std_qty?: number | null;
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

// ---------------- DECISION INTELLIGENCE EXTENSIONS ----------------

export interface AssumptionsTrace {
  historical_inputs_used: string[];
  model_estimates_used: string[];
  user_assumptions: string[];
}

export interface ReplenishSKUInput {
  product_id: string;
  product_name: string;
  current_price_vnd: number;
  unit_cost_vnd: number;
  baseline_qty_per_period: number;
  baseline_period_days?: number;
  daily_mean_qty?: number | null;
  daily_std_qty?: number | null;
  stock_available: number;
  lead_time_days: number;
  lead_time_std_days: number;
  service_level_pct: number;
  ordering_cost_vnd: number;
  holding_cost_pct_per_month: number;
  moq_units: number;
  demand_multiplier?: number;
}

export interface ReplenishRequest {
  items: ReplenishSKUInput[];
  capital_budget_vnd?: number | null;
  warehouse_max_units?: number | null;
}

export interface ReplenishSKUPlan {
  product_id: string;
  product_name: string;
  daily_mean_qty: number;
  daily_std_qty: number;
  current_stock_units: number;
  days_of_stock_left: number;
  z_score: number;
  lead_time_demand_mean: number;
  lead_time_demand_std: number;
  safety_stock_units: number;
  reorder_point_units: number;
  eoq_units: number;
  uncapped_order_units: number;
  recommended_order_units: number;
  allocated_order_cost_vnd: number;
  stockout_prob_in_lead_time: number;
  estimated_margin_saved_vnd: number;
  margin_per_vnd_invested: number;
  order_status: 'order_now' | 'watch' | 'ok' | 'deferred_budget' | string;
  deferred_by_budget: boolean;
  annual_holding_cost_vnd: number;
  annual_ordering_cost_vnd: number;
  demand_source: 'historical_series' | 'baseline_period_estimate' | string;
}

export interface ReplenishResponse {
  items: ReplenishSKUPlan[];
  total_uncapped_cost_vnd: number;
  total_allocated_cost_vnd: number;
  total_allocated_units: number;
  budget_utilized_pct?: number | null;
  capital_budget_binding: boolean;
  warehouse_capacity_binding: boolean;
  order_now_count: number;
  deferred_count: number;
  provenance: AssumptionsTrace;
}

export interface CashRunwayRequest {
  starting_cash_vnd: number;
  min_cash_buffer_vnd: number;
  opening_inventory_cost_vnd: number;
  expected_daily_revenue_vnd: number;
  expected_daily_cogs_vnd: number;
  daily_revenue_std_vnd?: number;
  monthly_fixed_opex_vnd: number;
  dso_days: number;
  dpo_days: number;
  planned_restock_cash_vnd: number;
  restock_outflow_day?: number;
  horizon_days: number;
  n_sims: number;
  seed: number;
}

export interface CashTrajectoryPoint {
  day: number;
  p5_cash_vnd: number;
  p50_cash_vnd: number;
  p95_cash_vnd: number;
  expected_cash_vnd: number;
}

export interface WorkingCapitalRatios {
  dio_days: number;
  dso_days: number;
  dpo_days: number;
  cash_conversion_cycle_days: number;
  daily_net_operating_cash_vnd: number;
  daily_fixed_opex_vnd: number;
}

export interface CashRunwayResponse {
  ratios: WorkingCapitalRatios;
  trajectory: CashTrajectoryPoint[];
  ending_p50_cash_vnd: number;
  ending_p5_cash_vnd: number;
  ending_p95_cash_vnd: number;
  min_expected_cash_vnd: number;
  min_p5_cash_vnd: number;
  trough_day_p50: number;
  prob_breach_min_buffer: number;
  prob_cash_shortage: number;
  estimated_runway_days?: number | null;
  shortage_alert_level: 'healthy' | 'caution' | 'critical' | string;
  provenance: AssumptionsTrace;
}

export interface PortfolioSKUInput {
  product_id: string;
  product_name: string;
  product: ProductSimulateInput;
  allow_restock_units?: number;
}

export interface PortfolioOptimizeRequest {
  items: PortfolioSKUInput[];
  total_capital_budget_vnd: number;
  warehouse_max_units?: number | null;
  max_price_change_pct: number;
  price_step_pct?: number;
  min_margin_pct?: number | null;
  risk_aversion_lambda: number;
  horizon_days: number;
  respect_stock: boolean;
  n_sims: number;
  seed: number;
}

export interface PortfolioSKUAllocation {
  product_id: string;
  product_name: string;
  base_price_vnd: number;
  recommended_price_vnd: number;
  price_change_pct: number;
  recommended_restock_units: number;
  expected_qty: number;
  base_profit_vnd: number;
  expected_profit_vnd: number;
  p5_profit_vnd: number;
  profit_uplift_vnd: number;
  capital_required_vnd: number;
  risk_adjusted_utility: number;
}

export interface PortfolioOptimizeResponse {
  allocations: PortfolioSKUAllocation[];
  base_total_profit_vnd: number;
  optimized_expected_profit_vnd: number;
  optimized_p5_profit_vnd: number;
  profit_uplift_vnd: number;
  profit_uplift_pct: number;
  total_capital_used_vnd: number;
  total_planned_units: number;
  capital_budget_binding: boolean;
  warehouse_capacity_binding: boolean;
  independence_assumption: string;
  provenance: AssumptionsTrace;
}

export interface VOIRequest {
  product: ProductSimulateInput;
  max_price_change_pct: number;
  price_step_pct?: number;
  min_margin_pct?: number | null;
  respect_stock: boolean;
  horizon_days: number;
  experiment_days: number;
  experiment_cost_vnd: number;
  seed: number;
}

export interface VOIActionSummary {
  price_change_pct: number;
  price_vnd: number;
  expected_profit_vnd: number;
  best_posterior_share: number;
}

export interface VOIResponse {
  current_optimal_price_vnd: number;
  current_optimal_change_pct: number;
  max_expected_profit_vnd: number;
  expected_profit_perfect_info_vnd: number;
  evpi_vnd: number;
  evpi_pct_of_profit: number;
  evsi_vnd: number;
  experiment_cost_vnd: number;
  engs_vnd: number;
  break_even_info_cost_vnd: number;
  prior_elasticity_std: number;
  posterior_elasticity_std: number;
  verdict: 'run_experiment' | 'decide_now' | 'low_uncertainty' | string;
  action_landscape: VOIActionSummary[];
  provenance: AssumptionsTrace;
}

export interface ReliabilityPoint {
  nominal_quantile: number;
  empirical_coverage: number;
  n_obs: number;
}

export interface RollingCalibrationWindow {
  window_label: string;
  start_date: string;
  end_date: string;
  n_obs: number;
  wape_pct: number;
  picp_80: number;
  mpiw_80: number;
  wis: number;
}

export interface CalibrationMetrics {
  n_oos: number;
  picp_50: number;
  picp_80: number;
  picp_90: number;
  mpiw_80: number;
  relative_mpiw_80_pct: number;
  pinball_q10: number;
  pinball_q50: number;
  pinball_q90: number;
  wis: number;
  reliability_curve: ReliabilityPoint[];
  rolling_windows: RollingCalibrationWindow[];
  calibration_status: 'well_calibrated' | 'under_covered' | 'over_dispersed' | string;
}

export interface ChangePointItem {
  date: string;
  index: number;
  before_mean_qty: number;
  after_mean_qty: number;
  pct_shift: number;
  bic_gain: number;
}

export interface DemandRegime {
  regime_id: number;
  start_date: string;
  end_date: string;
  n_days: number;
  mean_qty: number;
  std_qty: number;
  cv: number;
  label: 'baseline' | 'expansion' | 'contraction' | 'volatile' | string;
}

export interface RegimeSeriesPoint {
  date: string;
  actual_qty: number;
  rolling_mean_qty: number;
  regime_mean_qty: number;
}

export interface RegimeAnalysis {
  change_points: ChangePointItem[];
  regimes: DemandRegime[];
  early_elasticity?: number | null;
  recent_elasticity?: number | null;
  elasticity_shift_z?: number | null;
  elasticity_shift_p_value?: number | null;
  elasticity_stable: boolean;
  series_preview: RegimeSeriesPoint[];
}

export interface DriftMetrics {
  baseline_window: string;
  recent_window: string;
  price_psi: number;
  price_ks_stat: number;
  price_ks_p_value: number;
  qty_psi: number;
  qty_ks_stat: number;
  qty_ks_p_value: number;
  baseline_wape_pct: number;
  recent_wape_pct: number;
  error_drift_ratio: number;
  residual_mean_bias_pct: number;
  durbin_watson: number;
  drift_status: 'healthy' | 'watch' | 'retrain_recommended' | string;
  drift_flags: string[];
}

export interface MonitoringEvaluateResponse {
  product_id: string;
  data_label: DataLabel;
  total_usable_days: number;
  calibration: CalibrationMetrics;
  regimes: RegimeAnalysis;
  drift: DriftMetrics;
  data_provenance: string;
}

export interface CausalSeriesPoint {
  date: string;
  actual_qty: number;
  counterfactual_qty: number;
  control_qty?: number | null;
  is_post: boolean;
}

export interface CausalAnalyzeRequest {
  dataset_id: string;
  product_id: string;
  control_product_id?: string | null;
  intervention_date?: string | null;
  post_days?: number;
  method?: 'auto' | 'did' | 'its';
}

export interface CausalAnalyzeResponse {
  method_used: 'did' | 'its';
  treated_product_id: string;
  control_product_id?: string | null;
  intervention_date: string;
  pre_days: number;
  post_days: number;
  incremental_daily_qty: number;
  incremental_qty_ci95_low: number;
  incremental_qty_ci95_high: number;
  p_value: number;
  incremental_total_revenue_vnd: number;
  incremental_total_profit_vnd: number;
  parallel_trends_p_value?: number | null;
  parallel_trends_passed?: boolean | null;
  control_contaminated: boolean;
  causal_confidence: 'moderate_quasi_experimental' | 'low_violated_assumptions' | 'observational_its_only' | string;
  identification_assumptions: string[];
  warnings: string[];
  series: CausalSeriesPoint[];
}

export type DecisionStatus = 'planned' | 'implemented' | 'evaluated';
export type DecisionKind = 'pricing' | 'schedule' | 'portfolio' | 'replenish' | 'template';

export interface JournalCreateRequest {
  dataset_id: string;
  data_label: DataLabel;
  product_id: string;
  product_name: string;
  title: string;
  decision_type: DecisionKind;
  horizon_days: number;
  planned_price_vnd: number;
  planned_price_change_pct: number;
  planned_restock_units?: number;
  assumptions: Record<string, unknown>;
  expected_qty: number;
  expected_revenue_vnd: number;
  expected_profit_vnd: number;
  p5_profit_vnd: number;
  p95_profit_vnd: number;
  prob_beat_base: number;
  notes?: string;
}

export interface JournalUpdateRequest {
  status?: DecisionStatus;
  implemented_at?: string | null;
  actual_qty?: number | null;
  actual_revenue_vnd?: number | null;
  actual_profit_vnd?: number | null;
  notes?: string;
}

export interface DecisionRecord {
  id: string;
  created_at: string;
  updated_at: string;
  dataset_id: string;
  data_label: string;
  product_id: string;
  product_name: string;
  title: string;
  decision_type: string;
  horizon_days: number;
  planned_price_vnd: number;
  planned_price_change_pct: number;
  planned_restock_units: number;
  assumptions: Record<string, unknown>;
  expected_qty: number;
  expected_revenue_vnd: number;
  expected_profit_vnd: number;
  p5_profit_vnd: number;
  p95_profit_vnd: number;
  prob_beat_base: number;
  status: DecisionStatus;
  implemented_at?: string | null;
  evaluated_at?: string | null;
  actual_qty?: number | null;
  actual_revenue_vnd?: number | null;
  actual_profit_vnd?: number | null;
  profit_variance_vnd?: number | null;
  profit_variance_pct?: number | null;
  within_p5_p95_band?: boolean | null;
  notes: string;
}

export interface JournalListResponse {
  items: DecisionRecord[];
  total_count: number;
  evaluated_count: number;
  within_band_rate_pct?: number | null;
  cumulative_simulated_profit_vnd: number;
  cumulative_actual_profit_vnd: number;
}

export interface ScenarioTemplateDef {
  id: string;
  tag: 'flash_sale' | 'tet_clearance' | 'marketing_expansion' | 'inventory_expansion' | 'cash_preservation' | 'new_product_launch';
  titleVi: string;
  titleEn: string;
  summaryVi: string;
  summaryEn: string;
  assumptionBadgeVi: string;
  assumptionBadgeEn: string;
  priceChangePct: number;
  horizonDays: number;
  decisionGoal: DecisionGoal;
  extraFixedCostVnd: number;
  plannedRestockUnits: number;
  holdingCostPctPerMonth: number;
  schedulePhases?: SchedulePhase[];
}

