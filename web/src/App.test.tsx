import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { DataSourceBadge } from './components/DataSourceBadge';
import { formatVND } from './i18n';
import { MappingScreen } from './screens/MappingScreen';
import { DataLabel } from './types';

describe('formatVND', () => {
  it('formats 1234567 strictly as "1.234.567 ₫"', () => {
    expect(formatVND(1234567)).toBe('1.234.567 ₫');
    expect(formatVND(0)).toBe('0 ₫');
    expect(formatVND(-50000)).toBe('-50.000 ₫');
    expect(formatVND(null)).toBe('—');
  });
});

describe('DataSourceBadge', () => {
  it('renders distinct readable badge for every DataLabel in EN and VI', () => {
    const labels: DataLabel[] = ['SYNTHETIC', 'PUBLIC_M5', 'PUBLIC_DUNNHUMBY', 'USER'];
    const { rerender } = render(
      <div>
        {labels.map((lbl) => (
          <DataSourceBadge key={lbl} label={lbl} lang="en" />
        ))}
      </div>
    );

    expect(screen.getByTestId('data-source-badge-SYNTHETIC')).toHaveTextContent('SAMPLE SHOP DATA');
    expect(screen.getByTestId('data-source-badge-PUBLIC_M5')).toHaveTextContent('PUBLIC (M5)');
    expect(screen.getByTestId('data-source-badge-PUBLIC_M5')).toHaveTextContent('converted from USD');
    expect(screen.getByTestId('data-source-badge-PUBLIC_M5')).toHaveAttribute(
      'title',
      expect.stringContaining('illustrative conversion from USD at rate 25.000 ₫/$')
    );
    expect(screen.getByTestId('data-source-badge-PUBLIC_DUNNHUMBY')).toHaveAttribute(
      'title',
      expect.stringContaining('illustrative conversion from USD at rate 25.000 ₫/$')
    );
    expect(screen.getByTestId('data-source-badge-PUBLIC_DUNNHUMBY')).toHaveTextContent(
      'PUBLIC (DUNNHUMBY)'
    );
    expect(screen.getByTestId('data-source-badge-USER')).toHaveTextContent('YOUR SHOP DATA');

    rerender(
      <div>
        {labels.map((lbl) => (
          <DataSourceBadge key={lbl} label={lbl} lang="vi" />
        ))}
      </div>
    );
    expect(screen.getByTestId('data-source-badge-SYNTHETIC')).toHaveTextContent('BỘ MẪU THỬ NGHIỆM');
    expect(screen.getByTestId('data-source-badge-USER')).toHaveTextContent('SỐ LIỆU SHOP CỦA BẠN');
  });
});

describe('theme toggle', () => {
  it('switches between light and dark themes and remembers the selection', async () => {
    window.localStorage.removeItem('whatif_theme');
    const app = render(<App initialUseFixtures={true} initialLang="en" />);
    await waitFor(() => {
      expect(screen.getByTestId('advisory-panel')).toBeInTheDocument();
    });

    const themeToggle = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(document.documentElement).toHaveClass('dark');

    fireEvent.click(themeToggle);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(window.localStorage.getItem('whatif_theme')).toBe('light');

    app.unmount();
    render(<App initialUseFixtures={true} initialLang="en" />);
    await waitFor(() => {
      expect(screen.getByTestId('advisory-panel')).toBeInTheDocument();
    });
    expect(document.documentElement).not.toHaveClass('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem('whatif_theme')).toBe('dark');
  });
});

describe('MappingScreen required field guardrail', () => {
  it('disables Confirm button and shows red missing-required alert when required fields are unmapped', () => {
    const onChangeMapping = vi.fn();
    const { rerender } = render(
      <MappingScreen
        lang="en"
        fileName="messy.csv"
        nRows={100}
        columns={[
          { name: 'ngay', dtype_guess: 'date', null_pct: 0, n_unique: 10, samples: ['2025-01-01'] },
          { name: 'ma', dtype_guess: 'string', null_pct: 0, n_unique: 3, samples: ['P01'] },
          { name: 'gia', dtype_guess: 'numeric', null_pct: 0, n_unique: 5, samples: ['100000'] },
          { name: 'sl', dtype_guess: 'numeric', null_pct: 0, n_unique: 8, samples: ['20'] },
        ]}
        mappingItems={[]}
        sourceToCanonical={{ ngay: 'date', ma: 'product_id', gia: '', sl: 'quantity' }}
        options={{ price_unit: 'VND' }}
        warnings={[]}
        loading={false}
        error={null}
        onChangeColumnMapping={onChangeMapping}
        onChangeOptions={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />
    );

    const confirmBtn = screen.getByTestId('confirm-mapping-btn');
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByTestId('missing-required-banner')).toHaveTextContent('price');

    rerender(
      <MappingScreen
        lang="en"
        fileName="messy.csv"
        nRows={100}
        columns={[
          { name: 'ngay', dtype_guess: 'date', null_pct: 0, n_unique: 10, samples: ['2025-01-01'] },
          { name: 'ma', dtype_guess: 'string', null_pct: 0, n_unique: 3, samples: ['P01'] },
          { name: 'gia', dtype_guess: 'numeric', null_pct: 0, n_unique: 5, samples: ['100000'] },
          { name: 'sl', dtype_guess: 'numeric', null_pct: 0, n_unique: 8, samples: ['20'] },
        ]}
        mappingItems={[]}
        sourceToCanonical={{ ngay: 'date', ma: 'product_id', gia: 'price', sl: 'quantity' }}
        options={{ price_unit: 'VND' }}
        warnings={[]}
        loading={false}
        error={null}
        onChangeColumnMapping={onChangeMapping}
        onChangeOptions={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByTestId('confirm-mapping-btn')).not.toBeDisabled();
    expect(screen.queryByTestId('missing-required-banner')).not.toBeInTheDocument();
  });
});

describe('Unified E2E Operate-mode bilingual SMB workflow', () => {
  it('renders plain-language hero, step-by-step 4-step walkthrough, inline Data/Assumptions drawers, multi-phase schedule, VI|EN switching, Target Price finder, and Accuracy Track Record with zero console errors', async () => {
    window.localStorage.removeItem('whatif_lang');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App initialUseFixtures={true} />);

    // 1. Lands directly on plain-language Vietnamese workspace with hero art; 4-step guide is optional (collapsed by default)
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /Tính thử lời lãi trước khi tăng hoặc giảm giá bán/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId('advisory-panel')).toBeInTheDocument();
      expect(screen.getByTestId('price-delta-bridge')).toBeInTheDocument();
    });
    expect(screen.getByTestId('price-delta-bridge')).toHaveTextContent(/So sánh nhanh trong 30 ngày tới/i);
    expect(screen.getByTestId('data-source-badge-SYNTHETIC')).toHaveTextContent('BỘ MẪU THỬ NGHIỆM');
    expect(screen.queryByTestId('step-explainer')).not.toBeInTheDocument();

    // Open optional 4-step walkthrough and step through
    fireEvent.click(screen.getByTestId('toggle-step-guide-btn'));
    expect(screen.getByTestId('step-explainer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xem bước tiếp theo/i }));
    expect(screen.getByText(/Bước 2: Chạy thử 5\.000 tình huống sức mua khác nhau/i)).toBeInTheDocument();

    // 2. Open inline Data & CSV drawer, see illustration & CSV samples, load fashion shop sample
    fireEvent.click(screen.getByTestId('toggle-data-panel-btn'));
    expect(screen.getByTestId('data-drawer-panel')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cần Live API' })).toHaveLength(13);
    fireEvent.click(screen.getByRole('button', { name: /Dùng bộ dữ liệu Thời trang/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('data-drawer-panel')).not.toBeInTheDocument();
    });

    // 3. Open inline product assumptions right inside What-If
    fireEvent.click(screen.getByTestId('toggle-assumptions-btn'));
    expect(screen.getByTestId('inline-assumptions-panel')).toBeInTheDocument();
    expect(screen.getAllByText(/Áo thun basic/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng & tính lại ngay/i }));
    await waitFor(() => {
      expect(screen.queryByTestId('inline-assumptions-panel')).not.toBeInTheDocument();
    });

    // 4. Multi-phase schedule NLQ + trajectory + advice
    fireEvent.click(screen.getByRole('button', { name: /15 ngày −30%, sau đó \+1%\/ngày/i }));
    fireEvent.click(screen.getByRole('button', { name: /Phân tích câu hỏi & tính thử/i }));
    await waitFor(() => {
      expect(screen.getByText(/Đã hiểu lộ trình đa pha/i)).toBeInTheDocument();
      expect(screen.getByText(/Lộ trình đổi giá & Tiền lãi ước tính từng ngày/i)).toBeInTheDocument();
    });

    // 4b. Delayed seasonal Tết Yes/No question renders direct answer & 67-day trace cleanly
    fireEvent.click(screen.getByRole('button', { name: /Dịp Tết \(60 ngày nữa\) tăng \+15%\?/i }));
    fireEvent.click(screen.getByRole('button', { name: /Phân tích câu hỏi & tính thử/i }));
    await waitFor(() => {
      expect(screen.getByTestId('direct-answer-box')).toBeInTheDocument();
      expect(screen.getByText(/60 ngày đầu giữ nguyên giá cũ/i)).toBeInTheDocument();
    });

    // 5. Switch VI -> EN cleanly in header
    fireEvent.click(screen.getByTestId('lang-toggle-btn'));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: /Preview profit & risk before you change prices/i,
        })
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText('Favorable case').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Most likely/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cautious case').length).toBeGreaterThan(0);
    expect(screen.getByText(/Break-even safety cushion/i)).toBeInTheDocument();

    // 6. Find Target Price
    fireEvent.click(screen.getByRole('button', { name: /Find Target Price/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /Find the best price for your profit goal/i })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Find best prices/i }));
    await waitFor(() => {
      expect(screen.getByText(/Profit across candidate prices/i)).toBeInTheDocument();
    });

    // 7. Accuracy Track Record
    fireEvent.click(screen.getByRole('button', { name: /Accuracy Track Record/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /How accurate & honest is this tool\?/i })
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/18 \/ 19 events \(94\.7%\)/i)).toBeInTheDocument();

    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('evaluates 14-day clearance preset honestly with capital recovery card and Clear Inventory goal', async () => {
    window.localStorage.removeItem('whatif_lang');
    render(<App initialUseFixtures={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('advisory-panel')).toBeInTheDocument();
    });

    // Honest StoreHealthPulse badge: should NOT falsely label <25d cover SKU as TỒN KHO LÂU NGÀY
    expect(screen.getByText('XẢ HÀNG & XOAY VỐN')).toBeInTheDocument();

    // Click StoreHealthPulse Card 2 preset: 14-day -15% clearance
    const clearanceBtn = screen.getByRole('button', { name: /Chạy thử: Xả kho −15%/i });
    fireEvent.click(clearanceBtn);

    await waitFor(() => {
      const horizonInput = screen.getByLabelText(/Thời gian mô phỏng \(ngày\)/i) as HTMLInputElement;
      expect(horizonInput.value).toBe('14');
      expect(screen.getByTestId('goal-clear-inventory')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('clearance-recovery-panel')).toBeInTheDocument();
      expect(screen.getByTestId('advisory-panel')).toHaveTextContent(/XẢ KHO|XOAY VỐN/i);
    });

    // Toggling back to Maximize Profit re-evaluates and exposes quick switch button on advisory-panel
    fireEvent.click(screen.getByTestId('goal-maximize-profit'));
    await waitFor(() => {
      expect(screen.getByTestId('goal-maximize-profit')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('switch-to-clearance-goal-btn')).toBeInTheDocument();
    });
  });
});
