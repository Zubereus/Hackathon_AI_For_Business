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
  it('renders distinct readable badge for every DataLabel and USD disclaimer for foreign data', () => {
    const labels: DataLabel[] = ['SYNTHETIC', 'PUBLIC_M5', 'PUBLIC_DUNNHUMBY', 'USER'];
    render(
      <div>
        {labels.map((lbl) => (
          <DataSourceBadge key={lbl} label={lbl} />
        ))}
      </div>
    );

    expect(screen.getByTestId('data-source-badge-SYNTHETIC')).toHaveTextContent('SYNTHETIC');
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
    expect(screen.getByTestId('data-source-badge-USER')).toHaveTextContent('YOUR DATA');
  });
});

describe('theme toggle', () => {
  it('switches between light and dark themes and remembers the selection', () => {
    window.localStorage.removeItem('whatif_theme');
    const app = render(<App initialUseFixtures={true} />);

    const themeToggle = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(document.documentElement).toHaveClass('dark');

    fireEvent.click(themeToggle);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(window.localStorage.getItem('whatif_theme')).toBe('light');

    app.unmount();
    render(<App initialUseFixtures={true} />);
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

    // Now simulate fixing the missing price field
    rerender(
      <MappingScreen
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

describe('Offline fixture end-to-end flow', () => {
  it('completes Upload -> sample dataset -> Assumptions -> What-if -> Reverse what-if -> Validation with zero console errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App initialUseFixtures={true} />);

    expect(screen.getAllByRole('button', { name: 'Live API required' })).toHaveLength(12);

    // Upload: load the synthetic fashion shop sample
    fireEvent.click(screen.getByRole('button', { name: /Load fashion shop sample/i }));

    // Assumptions: sample products and the method note
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Assumptions' })).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Áo thun basic/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/controlled observational estimates/i)).toBeInTheDocument();

    // Continue to the simulation
    fireEvent.click(screen.getByRole('button', { name: /Continue to simulation/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'What-if simulation' })).toBeInTheDocument();
    });
    expect(screen.getAllByText('Optimistic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pessimistic').length).toBeGreaterThan(0);
    expect(screen.getByText(/Break-even sensitivity/i)).toBeInTheDocument();

    // Reverse what-if: run the optimizer
    fireEvent.click(screen.getByRole('button', { name: /Reverse what-if/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Reverse what-if' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Find best prices/i }));
    await waitFor(() => {
      expect(screen.getByText(/Profit across candidate prices/i)).toBeInTheDocument();
    });

    // Validation tab
    fireEvent.click(screen.getByRole('button', { name: /Validation/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Validation' })).toBeInTheDocument();
    });
    expect(screen.getByText(/18 \/ 19 events \(94\.7%\)/i)).toBeInTheDocument();

    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
