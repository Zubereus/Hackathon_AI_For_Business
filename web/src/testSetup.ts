import '@testing-library/jest-dom';

// Clean ResizeObserver polyfill for Recharts ResponsiveContainer inside jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}
