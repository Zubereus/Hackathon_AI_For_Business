import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CashFlowVsProfitCard,
  ClearanceRecoveryCard,
  ProfitWaterfallChart,
  ScenarioComparisonTable,
  SensitivityTornadoChart,
} from './DecisionCharts';
import {
  CashFlowSummary,
  ClearanceMetrics,
  PinnedScenario,
  ScenarioMetrics,
  TornadoFactor,
  WaterfallStep,
} from '../types';

describe('DecisionCharts components', () => {
  it('renders ProfitWaterfallChart with 5 step breakdown', () => {
    const waterfall: WaterfallStep[] = [
      { key: 'revenue', amount_vnd: 100000000, start_vnd: 0, end_vnd: 100000000, is_total: false },
      { key: 'cogs', amount_vnd: -60000000, start_vnd: 100000000, end_vnd: 40000000, is_total: false },
      { key: 'gross_profit', amount_vnd: 40000000, start_vnd: 0, end_vnd: 40000000, is_total: true },
      { key: 'fixed_marketing', amount_vnd: -5000000, start_vnd: 40000000, end_vnd: 35000000, is_total: false },
      { key: 'net_profit', amount_vnd: 35000000, start_vnd: 0, end_vnd: 35000000, is_total: true },
    ];

    render(<ProfitWaterfallChart waterfall={waterfall} lang="vi" />);

    expect(screen.getByTestId('profit-waterfall-panel')).toBeInTheDocument();
    expect(screen.getByText(/Bóc tách dòng tiền/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Doanh thu/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Lợi nhuận ròng/i).length).toBeGreaterThan(0);
  });

  it('renders SensitivityTornadoChart with ranked factors', () => {
    const tornado: TornadoFactor[] = [
      {
        key: 'selling_price',
        low_profit: 20000000,
        base_profit: 35000000,
        high_profit: 50000000,
        spread_vnd: 30000000,
        low_label: '-10%',
        high_label: '+10%',
      },
      {
        key: 'unit_cost',
        low_profit: 28000000,
        base_profit: 35000000,
        high_profit: 42000000,
        spread_vnd: 14000000,
        low_label: '+10%',
        high_label: '-10%',
      },
    ];

    render(<SensitivityTornadoChart tornado={tornado} baseProfit={35000000} lang="vi" />);

    expect(screen.getByTestId('sensitivity-tornado-panel')).toBeInTheDocument();
    expect(screen.getByText(/Độ nhạy lợi nhuận/i)).toBeInTheDocument();
    expect(screen.getByText(/Giá bán sản phẩm/i)).toBeInTheDocument();
    expect(screen.getByText(/Giá vốn nhập hàng/i)).toBeInTheDocument();
  });

  it('renders CashFlowVsProfitCard with working capital restock alert', () => {
    const cashFlow: CashFlowSummary = {
      revenue_vnd: 100000000,
      cogs_vnd: 60000000,
      fixed_marketing_vnd: 5000000,
      restock_units: 500,
      restock_cash_needed_vnd: 40000000,
      net_cash_flow_vnd: -5000000,
      net_profit_vnd: 35000000,
    };

    render(<CashFlowVsProfitCard cashFlow={cashFlow} unitCostVnd={80000} lang="vi" />);

    expect(screen.getByTestId('cashflow-vs-profit-panel')).toBeInTheDocument();
    expect(screen.getByText(/Lợi nhuận sổ sách vs Tiền mặt/i)).toBeInTheDocument();
    expect(screen.getByText(/CẢNH BÁO DÒNG TIỀN ÂM/i)).toBeInTheDocument();
    expect(screen.getByText('35.000.000 ₫')).toBeInTheDocument();
    expect(screen.getByText('40.000.000 ₫')).toBeInTheDocument();
  });

  it('renders ScenarioComparisonTable and triggers onPinCurrent and onSelectPinned', () => {
    const baseMetrics: ScenarioMetrics = {
      price_vnd: 100000,
      qty: 1000,
      revenue: 100000000,
      profit: 35000000,
      spend: 0,
    };
    const expectedMetrics: ScenarioMetrics = {
      price_vnd: 110000,
      qty: 920,
      revenue: 101200000,
      profit: 39500000,
      spend: 0,
    };

    const pinned: PinnedScenario[] = [
      {
        id: 'pin-1',
        name: 'Phương án A: Tăng giá 10%',
        productId: 'P01',
        productName: 'Áo sơ mi lụa',
        priceChangePct: 10,
        unitCostChangePct: 0,
        extraFixedCostVnd: 0,
        restockUnits: 0,
        horizonDays: 30,
        isSchedule: false,
        response: {
          scenarios: {
            base: baseMetrics,
            expected: expectedMetrics,
            optimistic: expectedMetrics,
            pessimistic: expectedMetrics,
          },
          profit_distribution: { histogram: [], p5: 30000000, p50: 39500000, p95: 45000000 },
        },
        createdAt: '2026-11-13T00:00:00Z',
      },
    ];

    const onPin = vi.fn();
    const onSelect = vi.fn();
    const onRemove = vi.fn();

    render(
      <ScenarioComparisonTable
        baseMetrics={baseMetrics}
        expectedMetrics={expectedMetrics}
        pinnedScenarios={pinned}
        activeProductId="P01"
        onPinCurrent={onPin}
        onSelectPinned={onSelect}
        onRemovePinned={onRemove}
        canPinCurrent={true}
        lang="vi"
      />
    );

    expect(screen.getByTestId('scenario-comparison-panel')).toBeInTheDocument();
    expect(screen.getByText('Phương án A: Tăng giá 10%')).toBeInTheDocument();

    const pinBtn = screen.getByRole('button', { name: /Lưu phương án đang thử/i });
    fireEvent.click(pinBtn);
    expect(onPin).toHaveBeenCalled();

    const loadBtn = screen.getByRole('button', { name: /Mở lại/i });
    fireEvent.click(loadBtn);
    expect(onSelect).toHaveBeenCalledWith(pinned[0]);

    const removeBtn = screen.getByRole('button', { name: /Remove Phương án A/i });
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('pin-1');
  });

  it('renders ProfitWaterfallChart concise non-overlapping labels and handles operating costs causing net loss', () => {
    const lossSteps = [
      { key: 'revenue', amount_vnd: 142900000, start_vnd: 0, end_vnd: 142900000, is_total: true },
      { key: 'cogs', amount_vnd: -82700000, start_vnd: 142900000, end_vnd: 60200000, is_total: false },
      { key: 'gross_profit', amount_vnd: 60200000, start_vnd: 0, end_vnd: 60200000, is_total: true },
      { key: 'fixed_marketing', amount_vnd: -70000000, start_vnd: 60200000, end_vnd: -9800000, is_total: false },
      { key: 'net_profit', amount_vnd: -9800000, start_vnd: 0, end_vnd: -9800000, is_total: true },
    ];

    render(<ProfitWaterfallChart waterfall={lossSteps} lang="vi" />);

    expect(screen.getByText('1. Doanh thu')).toBeInTheDocument();
    expect(screen.getByText('2. Giá vốn')).toBeInTheDocument();
    expect(screen.getByText('3. Lãi gộp')).toBeInTheDocument();
    expect(screen.getByText('4. Chi phí ngoài')).toBeInTheDocument();
    expect(screen.getByText('5. Lợi nhuận')).toBeInTheDocument();
    expect(screen.getByText('-70.0M ₫')).toBeInTheDocument();
    expect(screen.getByText('-9.8M ₫')).toBeInTheDocument();
  });

  it('renders ClearanceRecoveryCard for both full-payback clearance and below-cost discount', () => {
    const clrWorthwhile: ClearanceMetrics = {
      decision_goal: 'clear_inventory',
      horizon_days: 14,
      unit_recovery_pct: 164.4,
      recovers_unit_cost: true,
      recovers_total_cost: true,
      extra_units_cleared: 112,
      turnover_speedup_pct: 27.9,
      total_cost_capital_turned_vnd: 62194000,
      extra_capital_freed_vnd: 13552000,
      inventory_capital_vnd: 145200000,
      stock_cleared_pct: 42.8,
      base_days_to_clear: 41.8,
      plan_days_to_clear: 32.7,
      days_saved_to_clear: 9.1,
      inventory_age_days: 90,
      age_tier: 'stale',
      holding_cost_pct_per_month: 2.0,
      holding_cost_saved_vnd: 135520,
      adjusted_profit_delta_vnd: -5239580,
    };

    const { rerender } = render(
      <ClearanceRecoveryCard
        clearance={clrWorthwhile}
        unitCostVnd={121000}
        basePriceVnd={234000}
        newPriceVnd={198900}
        baseProfitVnd={31147496}
        newProfitVnd={25772396}
        lang="vi"
      />
    );

    expect(screen.getByTestId('clearance-recovery-panel')).toBeInTheDocument();
    expect(screen.getByText('HOÀN ĐỦ VỐN & VẪN CÓ LÃI')).toBeInTheDocument();
    expect(screen.getByText('164.4%')).toBeInTheDocument();
    expect(screen.getByText(/\+112 món/)).toBeInTheDocument();
    expect(screen.getByText(/\+135\.520 ₫/)).toBeInTheDocument();
    expect(screen.getByText(/Tồn lâu \(≥60 ngày\)/)).toBeInTheDocument();

    const clrBelowCost: ClearanceMetrics = {
      ...clrWorthwhile,
      unit_recovery_pct: 96.7,
      recovers_unit_cost: false,
      recovers_total_cost: false,
      age_tier: 'new',
      inventory_age_days: 15,
      holding_cost_saved_vnd: 0,
    };

    rerender(
      <ClearanceRecoveryCard
        clearance={clrBelowCost}
        unitCostVnd={121000}
        basePriceVnd={234000}
        newPriceVnd={117000}
        baseProfitVnd={31147496}
        newProfitVnd={-18070204}
        lang="vi"
      />
    );

    expect(screen.getByText('BÁN DƯỚI GIÁ VỐN')).toBeInTheDocument();
    expect(screen.getByText('96.7%')).toBeInTheDocument();
  });
});

