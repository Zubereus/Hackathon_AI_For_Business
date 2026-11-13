import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api';
import { App } from '../App';
import { SCENARIO_TEMPLATES } from '../data/scenarioTemplates';
import { ProductElasticity } from '../types';
import { JournalScreen } from './JournalScreen';
import { PlanningScreen } from './PlanningScreen';
import { ValidationScreen } from './ValidationScreen';

const SAMPLE_PRODUCTS: ProductElasticity[] = [
  {
    product_id: 'P01',
    product_name: 'Áo thun basic',
    current_price_vnd: 200000,
    unit_cost_vnd: 100000,
    baseline_qty_per_period: 300,
    stock_available: 120,
    fixed_cost_vnd: 2000000,
    elasticity_median: -1.6,
    elasticity_se: 0.25,
    elasticity_samples: [-1.8, -1.6, -1.4],
    significant: true,
    warnings: [],
    business_context: {
      daily_mean_qty: 10,
      daily_std_qty: 3.5,
      base_margin_pct: 50,
      current_stock_units: 120,
    },
  },
  {
    product_id: 'P02',
    product_name: 'Quần jean ống đứng',
    current_price_vnd: 450000,
    unit_cost_vnd: 220000,
    baseline_qty_per_period: 150,
    stock_available: 80,
    fixed_cost_vnd: 1500000,
    elasticity_median: -1.1,
    elasticity_se: 0.2,
    elasticity_samples: [-1.3, -1.1, -0.9],
    significant: true,
    warnings: [],
    business_context: {
      daily_mean_qty: 5,
      daily_std_qty: 2,
      base_margin_pct: 51.1,
      current_stock_units: 80,
    },
  },
];

describe('Scenario Templates (#11)', () => {
  it('exposes all 6 structured templates and applies Flash Sale & Tết Clearance assumptions cleanly', async () => {
    expect(SCENARIO_TEMPLATES).toHaveLength(6);
    render(<App initialUseFixtures={true} initialLang="en" />);

    await waitFor(() => {
      expect(screen.getByTestId('scenario-templates-bar')).toBeInTheDocument();
    });

    for (const tpl of SCENARIO_TEMPLATES) {
      expect(screen.getByTestId(`template-btn-${tpl.id}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('template-btn-tet_clearance'));
    await waitFor(() => {
      const horizonInput = screen.getByLabelText(/Horizon \(days\)/i) as HTMLInputElement;
      expect(horizonInput.value).toBe('14');
      expect(screen.getByTestId('goal-clear-inventory')).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

describe('PlanningScreen (#1 Replenish, #2 Runway, #3 Portfolio, #9 VoI)', () => {
  it('calls Go engine client methods and renders returned metrics without browser math', async () => {
    const mockClient = new ApiClient(false);
    mockClient.optimizeReplenishment = vi.fn().mockResolvedValue({
      items: [
        {
          product_id: 'P01',
          product_name: 'Áo thun basic',
          daily_mean_qty: 10,
          daily_std_qty: 3.5,
          current_stock_units: 120,
          days_of_stock_left: 12,
          z_score: 1.645,
          lead_time_demand_mean: 70,
          lead_time_demand_std: 22.1,
          safety_stock_units: 37,
          reorder_point_units: 107,
          eoq_units: 247,
          uncapped_order_units: 0,
          recommended_order_units: 0,
          allocated_order_cost_vnd: 0,
          stockout_prob_in_lead_time: 0.012,
          estimated_margin_saved_vnd: 0,
          margin_per_vnd_invested: 0,
          order_status: 'watch',
          deferred_by_budget: false,
          annual_holding_cost_vnd: 1200000,
          annual_ordering_cost_vnd: 1500000,
          demand_source: 'historical_series',
        },
      ],
      total_uncapped_cost_vnd: 0,
      total_allocated_cost_vnd: 0,
      total_allocated_units: 0,
      capital_budget_binding: false,
      warehouse_capacity_binding: false,
      order_now_count: 0,
      deferred_count: 0,
      provenance: {
        historical_inputs_used: ['daily_mean_qty'],
        model_estimates_used: ['eoq_formula'],
        user_assumptions: ['lead_time_days'],
      },
    });
    mockClient.simulateCashRunway = vi.fn().mockResolvedValue({
      ratios: {
        dio_days: 15,
        dso_days: 3,
        dpo_days: 14,
        cash_conversion_cycle_days: 4,
        daily_net_operating_cash_vnd: 1200000,
        daily_fixed_opex_vnd: 100000,
      },
      trajectory: [
        { day: 1, p5_cash_vnd: 34000000, p50_cash_vnd: 35000000, p95_cash_vnd: 36000000, expected_cash_vnd: 35000000 },
        { day: 60, p5_cash_vnd: 72000000, p50_cash_vnd: 95000000, p95_cash_vnd: 118000000, expected_cash_vnd: 95000000 },
      ],
      ending_p50_cash_vnd: 95000000,
      ending_p5_cash_vnd: 72000000,
      ending_p95_cash_vnd: 118000000,
      min_expected_cash_vnd: 35000000,
      min_p5_cash_vnd: 34000000,
      trough_day_p50: 1,
      prob_breach_min_buffer: 0,
      prob_cash_shortage: 0,
      estimated_runway_days: null,
      shortage_alert_level: 'healthy',
      provenance: {
        historical_inputs_used: ['opening_inventory_cost_vnd'],
        model_estimates_used: ['cash_conversion_cycle_days'],
        user_assumptions: ['starting_cash_vnd'],
      },
    });
    mockClient.analyzeValueOfInformation = vi.fn().mockResolvedValue({
      current_optimal_price_vnd: 210000,
      current_optimal_change_pct: 5,
      max_expected_profit_vnd: 28000000,
      expected_profit_perfect_info_vnd: 29500000,
      evpi_vnd: 1500000,
      evpi_pct_of_profit: 5.36,
      evsi_vnd: 1100000,
      experiment_cost_vnd: 1500000,
      engs_vnd: -400000,
      break_even_info_cost_vnd: 1100000,
      prior_elasticity_std: 0.45,
      posterior_elasticity_std: 0.22,
      verdict: 'decide_now',
      action_landscape: [{ price_change_pct: 5, price_vnd: 210000, expected_profit_vnd: 28000000, best_posterior_share: 0.8 }],
      provenance: { historical_inputs_used: [], model_estimates_used: [], user_assumptions: [] },
    });

    render(
      <PlanningScreen
        lang="en"
        products={SAMPLE_PRODUCTS}
        selectedProductId="P01"
        client={mockClient}
        useFixtures={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Calculate EOQ & Reorder Plan/i }));
    await waitFor(() => {
      expect(mockClient.optimizeReplenishment).toHaveBeenCalledTimes(1);
      expect(screen.getByText('247')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Working Capital & Cash Runway/i }));
    fireEvent.click(screen.getByRole('button', { name: /Simulate CCC & Cash Runway/i }));
    await waitFor(() => {
      expect(mockClient.simulateCashRunway).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/4\.0 days/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Value of Information/i }));
    fireEvent.click(screen.getByRole('button', { name: /Evaluate Experiment Worth/i }));
    await waitFor(() => {
      expect(mockClient.analyzeValueOfInformation).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/DECIDE NOW/i)).toBeInTheDocument();
    });
  });
});

describe('ValidationScreen (#5 Causal, #6 Calibration, #7 Regimes, #8 Drift) & JournalScreen (#12)', () => {
  it('renders live monitoring & causal audit sub-tabs and persisted SQLite journal metrics', async () => {
    const mockClient = new ApiClient(false);
    mockClient.evaluateMonitoring = vi.fn().mockResolvedValue({
      product_id: 'P01',
      data_label: 'SYNTHETIC',
      total_usable_days: 120,
      calibration: {
        n_oos: 45,
        picp_50: 51.1,
        picp_80: 82.2,
        picp_90: 91.1,
        mpiw_80: 6.4,
        relative_mpiw_80_pct: 42.1,
        pinball_q10: 0.72,
        pinball_q50: 1.45,
        pinball_q90: 0.69,
        wis: 1.38,
        reliability_curve: [{ nominal_quantile: 50, empirical_coverage: 51.1, n_obs: 45 }],
        rolling_windows: [],
        calibration_status: 'well_calibrated',
      },
      regimes: {
        change_points: [],
        regimes: [],
        early_elasticity: -1.5,
        recent_elasticity: -1.6,
        elasticity_shift_z: -0.3,
        elasticity_shift_p_value: 0.76,
        elasticity_stable: true,
        series_preview: [{ date: '2025-01-01', actual_qty: 10, rolling_mean_qty: 10, regime_mean_qty: 10 }],
      },
      drift: {
        baseline_window: '2025-01-01 -> 2025-03-01',
        recent_window: '2025-03-02 -> 2025-04-30',
        price_psi: 0.04,
        price_ks_stat: 0.12,
        price_ks_p_value: 0.45,
        qty_psi: 0.06,
        qty_ks_stat: 0.11,
        qty_ks_p_value: 0.52,
        baseline_wape_pct: 14.2,
        recent_wape_pct: 15.1,
        error_drift_ratio: 1.06,
        residual_mean_bias_pct: -1.4,
        durbin_watson: 1.94,
        drift_status: 'healthy',
        drift_flags: [],
      },
      data_provenance: 'historical_sales_only',
    });
    mockClient.listJournal = vi.fn().mockResolvedValue({
      items: [
        {
          id: 'dec-1',
          created_at: '2026-01-10T00:00:00Z',
          updated_at: '2026-01-25T00:00:00Z',
          dataset_id: 'fashion_shop_12',
          data_label: 'SYNTHETIC',
          product_id: 'P01',
          product_name: 'Áo thun basic',
          title: 'Flash sale -10%',
          decision_type: 'template',
          horizon_days: 14,
          planned_price_vnd: 180000,
          planned_price_change_pct: -10,
          planned_restock_units: 0,
          assumptions: {},
          expected_qty: 150,
          expected_revenue_vnd: 27000000,
          expected_profit_vnd: 12000000,
          p5_profit_vnd: 9500000,
          p95_profit_vnd: 14500000,
          prob_beat_base: 0.82,
          status: 'evaluated',
          implemented_at: '2026-01-11',
          evaluated_at: '2026-01-25T00:00:00Z',
          actual_qty: 158,
          actual_revenue_vnd: 28440000,
          actual_profit_vnd: 12640000,
          profit_variance_vnd: 640000,
          profit_variance_pct: 5.33,
          within_p5_p95_band: true,
          notes: 'Matched weekend ramp',
        },
      ],
      total_count: 1,
      evaluated_count: 1,
      within_band_rate_pct: 100,
      cumulative_simulated_profit_vnd: 12000000,
      cumulative_actual_profit_vnd: 12640000,
    });

    const { unmount } = render(
      <ValidationScreen
        lang="en"
        client={mockClient}
        activeDatasetId="fashion_shop_12"
        products={SAMPLE_PRODUCTS}
        selectedProductId="P01"
        useFixtures={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /2\. Calibration, Regimes & Drift Monitor/i }));
    fireEvent.click(screen.getByRole('button', { name: /Run Calibration, Regime & Drift Audit/i }));
    await waitFor(() => {
      expect(mockClient.evaluateMonitoring).toHaveBeenCalledTimes(1);
      expect(screen.getByText('82.2%')).toBeInTheDocument();
      expect(screen.getByText(/well_calibrated/i)).toBeInTheDocument();
    });
    unmount();

    render(
      <JournalScreen
        lang="en"
        client={mockClient}
        activeDatasetId="fashion_shop_12"
        useFixtures={false}
      />
    );
    await waitFor(() => {
      expect(mockClient.listJournal).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Flash sale -10%/i)).toBeInTheDocument();
      expect(screen.getByText(/Inside Band/i)).toBeInTheDocument();
    });
  });
});
