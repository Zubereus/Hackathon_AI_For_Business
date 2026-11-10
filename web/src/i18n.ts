import { DataLabel, ScreenId } from './types';

export const FX_CONFIG = {
  vndPerUsd: 25000,
  disclaimer: 'illustrative conversion from USD at rate 25.000 ₫/$',
};

/**
 * Format an integer or floating VND amount strictly at the UI edge:
 * 1234567 -> "1.234.567 ₫"
 */
export function formatVND(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount) || !Number.isFinite(amount)) {
    return '—';
  }
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits} ₫`;
}

export function formatCompactVND(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '—';
  }
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(2)}B ₫`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M ₫`;
  }
  return formatVND(amount);
}

export function formatInt(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '—';
  }
  const rounded = Math.round(val);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits}`;
}

export function formatPct(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '—';
  }
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(decimals)}%`;
}

export const STRINGS = {
  appTitle: 'What-If AI',
  appSubtitle: 'Simulate before you decide — Retail elasticity & counterfactual planning',
  nav: [
    { id: 'upload' as ScreenId, step: '1', label: 'Upload Data' },
    { id: 'mapping' as ScreenId, step: '2', label: 'Confirm Columns' },
    { id: 'assumptions' as ScreenId, step: '3', label: 'Assumptions' },
    { id: 'whatif' as ScreenId, step: '4', label: 'What-If Simulation' },
    { id: 'reverse' as ScreenId, step: '5', label: 'Reverse What-If' },
    { id: 'validation' as ScreenId, step: '6', label: 'Validation' },
  ],
  badges: {
    SYNTHETIC: {
      text: 'SYNTHETIC',
      symbol: '◆',
      tooltip: 'Mathematically generated synthetic retail data for algorithm verification.',
    },
    PUBLIC_M5: {
      text: 'PUBLIC (M5)',
      symbol: '◎',
      tooltip: `Public M5 Walmart retail benchmark — ${FX_CONFIG.disclaimer}`,
    },
    PUBLIC_DUNNHUMBY: {
      text: 'PUBLIC (DUNNHUMBY)',
      symbol: '◎',
      tooltip: `Public Dunnhumby grocery panel — ${FX_CONFIG.disclaimer}`,
    },
    USER: {
      text: 'YOUR DATA',
      symbol: '●',
      tooltip: 'Your uploaded business sales CSV.',
    },
  } satisfies Record<DataLabel, { text: string; symbol: string; tooltip: string }>,
  disclaimers: {
    observational:
      'Method note: Elasticity estimates are controlled observational estimates from historical variation, not proven causality.',
    rangesNotPromises:
      'Ranges, not promises: Outcomes span 10th–90th percentile elasticity uncertainty from bootstrap resampling.',
    zeroBrowserMath: 'All forecasts and probabilities are computed deterministically by the Go/Python engine.',
  },
};

