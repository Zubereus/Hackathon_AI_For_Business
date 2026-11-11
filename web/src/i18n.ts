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

/** Fixed-decimal number with a true minus sign (U+2212), for elasticities. */
export function formatNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || Number.isNaN(val)) {
    return '—';
  }
  return val.toFixed(decimals).replace('-', '−');
}

/** Turn the engine's warning codes into plain sentences. Unknown text passes through. */
export function describeWarning(code: string): string {
  if (code === 'low_price_variation') return 'Price barely changed, so the estimate is unreliable';
  if (code === 'not_significant') return 'Not statistically significant';
  if (code.startsWith('price_variation_sd below')) return 'Price varied only moderately';
  return code;
}

/** Turn the optimizer's constraint messages into plain sentences. Unknown text passes through. */
export function describeViolation(message: string): string {
  const margin = /^min_margin_pct \((.+?) < (.+?)\)$/.exec(message);
  if (margin) return `Margin ${margin[1]} is below the ${margin[2]} minimum`;
  return message;
}

export const STRINGS = {
  appTitle: 'What-If AI',
  nav: [
    { id: 'upload' as ScreenId, step: '1', label: 'Upload data' },
    { id: 'mapping' as ScreenId, step: '2', label: 'Confirm columns' },
    { id: 'assumptions' as ScreenId, step: '3', label: 'Assumptions' },
    { id: 'whatif' as ScreenId, step: '4', label: 'What-if' },
    { id: 'reverse' as ScreenId, step: '', label: 'Reverse what-if' },
    { id: 'validation' as ScreenId, step: '', label: 'Validation' },
  ],
  badges: {
    SYNTHETIC: {
      text: 'SYNTHETIC',
      tooltip: 'Synthetic data generated to test the method. Not a real business.',
    },
    PUBLIC_M5: {
      text: 'PUBLIC (M5)',
      tooltip: `Public M5 Walmart data, ${FX_CONFIG.disclaimer}`,
    },
    PUBLIC_DUNNHUMBY: {
      text: 'PUBLIC (DUNNHUMBY)',
      tooltip: `Public Dunnhumby grocery data, ${FX_CONFIG.disclaimer}`,
    },
    USER: {
      text: 'YOUR DATA',
      tooltip: 'The sales CSV you uploaded.',
    },
  } satisfies Record<DataLabel, { text: string; tooltip: string }>,
  disclaimers: {
    observational:
      'These are controlled observational estimates: they use past price changes and adjust for season, promotions and holidays, but they do not prove cause and effect.',
    rangesNotPromises:
      'Ranges, not promises. The optimistic and pessimistic cases use the 10th and 90th percentile of the estimated price sensitivity.',
    engineFigures:
      'Every figure comes from the engine. The language model only reads your question, maps ambiguous columns and explains results.',
  },
};
