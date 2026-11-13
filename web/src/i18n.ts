import { DataLabel, ScreenId } from './types';

export type Lang = 'vi' | 'en';

export const FX_CONFIG = {
  vndPerUsd: 25000,
  disclaimer: {
    en: 'illustrative conversion from USD at rate 25.000 ₫/$',
    vi: 'quy đổi minh họa từ USD theo tỷ giá 25.000 ₫/$',
  },
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

/** Turn the engine's warning codes into plain, non-technical sentences for SMB owners. */
export function describeWarning(code: string, lang: Lang = 'en'): string {
  if (lang === 'vi') {
    if (code === 'low_price_variation' || code.startsWith('low_price_variation:')) {
      return 'Trước đây shop ít khi đổi giá món này, nên máy chưa đủ dữ liệu để đoán thật chắc phản ứng của khách.';
    }
    if (code === 'not_significant' || code.startsWith('not_significant:')) {
      return 'Số liệu lịch sử chưa đủ rõ rệt để khẳng định khách mua nhiều hay ít đi do đổi giá.';
    }
    if (code.startsWith('few_observations')) {
      return 'Lịch sử bán hàng hơi ngắn (dưới 120 ngày), bạn nên xem kết quả như mức tham khảo.';
    }
    if (code.startsWith('positive_elasticity')) {
      return 'Số liệu cũ ghi nhận tăng giá mà khách lại mua nhiều hơn (dễ do trùng đợt sale/lễ) — cần xem kỹ trước khi chốt.';
    }
    if (code.startsWith('price_variation_sd below')) {
      return 'Lịch sử đổi giá ở mức vừa phải, độ chính xác ở mức trung bình.';
    }
    return code;
  }
  if (code === 'low_price_variation' || code.startsWith('low_price_variation:')) {
    return 'This item rarely changed price in the past, so buyer reaction is harder to pin down.';
  }
  if (code === 'not_significant' || code.startsWith('not_significant:')) {
    return 'Sales history is too noisy to be sure how strongly price drives demand.';
  }
  if (code.startsWith('few_observations')) {
    return 'Short sales history (< 120 days), so treat numbers as a rough guide.';
  }
  if (code.startsWith('positive_elasticity')) {
    return 'Past sales rose alongside higher prices (likely promo overlap) — double-check before acting.';
  }
  if (code.startsWith('price_variation_sd below')) {
    return 'Price varied only moderately in past records.';
  }
  return code;
}

/** Turn the optimizer's constraint messages into plain sentences. */
export function describeViolation(message: string, lang: Lang = 'en'): string {
  const margin = /^min_margin_pct \((.+?) < (.+?)\)$/.exec(message);
  if (margin) {
    return lang === 'vi'
      ? `Tỉ lệ lãi gộp (${margin[1]}) thấp hơn mức tối thiểu bạn đặt (${margin[2]})`
      : `Profit margin (${margin[1]}) is below your ${margin[2]} minimum`;
  }
  if (lang === 'vi') {
    if (message.includes('stock')) return 'Vượt quá số hàng còn trong kho';
    if (message.includes('budget')) return 'Vượt quá ngân sách giảm giá cho phép';
  }
  return message;
}

export function getStrings(lang: Lang) {
  const isVi = lang === 'vi';
  return {
    appTitle: 'What-If AI',
    appSubtitle: isVi
      ? 'Trợ lý tính thử lợi nhuận trước khi đổi giá bán cho chủ shop'
      : 'Pricing profit simulator for small & growing retail shops',
    nav: [
      { id: 'whatif' as ScreenId, step: '', label: isVi ? 'Thử kịch bản giá' : 'Simulate Price Plan' },
      { id: 'reverse' as ScreenId, step: '', label: isVi ? 'Tìm giá đạt mục tiêu lãi' : 'Find Target Price' },
      { id: 'planning' as ScreenId, step: '', label: isVi ? 'Vốn, Kho & Danh mục' : 'Capital & Portfolio' },
      { id: 'validation' as ScreenId, step: '', label: isVi ? 'Độ tin cậy công cụ' : 'Accuracy Track Record' },
      { id: 'journal' as ScreenId, step: '', label: isVi ? 'Nhật ký Quyết định' : 'Decision Journal' },
    ],
    header: {
      dataButton: isVi ? 'Nạp file bán hàng (CSV)' : 'Load Sales Data (CSV)',
      closeDataButton: isVi ? 'Đóng bảng dữ liệu' : 'Close data panel',
      offlineLabel: isVi ? 'Chế độ xem mẫu' : 'Sample snapshot mode',
      offlineTitle: isVi
        ? 'Xem kết quả đã tính sẵn ngay trên máy, không cần kết nối máy chủ.'
        : 'Use precomputed snapshots offline instead of live server calls.',
      lightTheme: isVi ? 'Chuyển nền sáng' : 'Switch to light theme',
      darkTheme: isVi ? 'Chuyển nền tối' : 'Switch to dark theme',
      langToggleTitle: isVi ? 'Switch to English' : 'Chuyển sang Tiếng Việt',
    },
    badges: {
      SYNTHETIC: {
        text: isVi ? 'BỘ MẪU THỬ NGHIỆM' : 'SAMPLE SHOP DATA',
        tooltip: isVi
          ? 'Dữ liệu cửa hàng mẫu dùng để bạn bấm thử ngay, chưa phải số liệu thật của shop bạn.'
          : 'Simulated sample shop data for testing. Not your real store records.',
      },
      PUBLIC_M5: {
        text: isVi ? 'MẪU CÔNG KHAI (M5)' : 'PUBLIC (M5)',
        tooltip: isVi
          ? `Dữ liệu bán lẻ công khai M5 Walmart, ${FX_CONFIG.disclaimer.vi}`
          : `Public M5 Walmart data, ${FX_CONFIG.disclaimer.en}`,
      },
      PUBLIC_DUNNHUMBY: {
        text: isVi ? 'MẪU CÔNG KHAI (DUNNHUMBY)' : 'PUBLIC (DUNNHUMBY)',
        tooltip: isVi
          ? `Dữ liệu siêu thị công khai Dunnhumby, ${FX_CONFIG.disclaimer.vi}`
          : `Public Dunnhumby grocery data, ${FX_CONFIG.disclaimer.en}`,
      },
      USER: {
        text: isVi ? 'SỐ LIỆU SHOP CỦA BẠN' : 'YOUR SHOP DATA',
        tooltip: isVi ? 'Dữ liệu bán hàng CSV bạn vừa tải lên.' : 'The sales CSV you uploaded.',
      },
    } satisfies Record<DataLabel, { text: string; tooltip: string }>,
    foreignUsdTag: isVi ? 'quy đổi từ USD' : 'converted from USD',
    disclaimers: {
      observational: isVi
        ? 'Máy học từ lịch sử hóa đơn cũ của shop (đã trừ riêng mùa Tết, ngày sale đôi 11.11, cuối tuần), giúp bạn cân nhắc trước khi đổi giá — không phải lời hứa chắc chắn 100%.'
        : 'Estimated from past sales records (adjusting for holidays, double-day sales, and promos) to guide your pricing decisions — not a rigid guarantee.',
      rangesNotPromises: isVi
        ? 'Con số hiển thị theo khoảng thực tế (từ kịch bản thuận lợi đến thận trọng), giúp bạn lường trước cả lúc bán chạy lẫn lúc khách chững lại.'
        : 'Shown as a realistic range from cautious to favorable buyer reactions so you can plan safely.',
      engineFigures: isVi
        ? 'Toàn bộ doanh thu & lợi nhuận do máy tính bằng công thức chuẩn xác; AI chỉ giúp hiểu câu hỏi tiếng Việt và diễn giải dễ nhớ.'
        : 'All profit and revenue numbers are calculated deterministically by the engine; AI only reads your question and summarizes results clearly.',
    },
  };
}

// Preserve static English STRINGS export for backwards compatibility
export const STRINGS = getStrings('en');
