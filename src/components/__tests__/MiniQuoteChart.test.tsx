import { render } from '@testing-library/react';
import { MiniQuoteChart } from '../MiniQuoteChart';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createChart } from 'lightweight-charts';

// Mock lightweight-charts
const mockSeries = {
  setData: vi.fn(),
  applyOptions: vi.fn(),
  setMarkers: vi.fn(),
  createPriceLine: vi.fn().mockReturnValue({}), // Return dummy object for price line
  removePriceLine: vi.fn(),
};

const mockChart = {
  addCandlestickSeries: vi.fn().mockReturnValue(mockSeries),
  priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  timeScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  applyOptions: vi.fn(),
  remove: vi.fn(),
};

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => mockChart),
}));

describe('MiniQuoteChart Optimization', () => {
  const sampleData = [
    { date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    { date: '2023-01-02', open: 105, high: 115, low: 95, close: 110, volume: 1000 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders and creates chart', () => {
    const props = {
      history: sampleData,
      today: null,
      trades: [],
      highIBS: 0.8,
      isOpenPosition: false,
    };

    render(<MiniQuoteChart {...props} />);

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(mockChart.addCandlestickSeries).toHaveBeenCalledTimes(1);
  });

  it('should NOT recreate chart when props change (optimization check)', () => {
    const props = {
      history: sampleData,
      today: null,
      trades: [],
      highIBS: 0.8,
      isOpenPosition: false,
    };

    const { rerender } = render(<MiniQuoteChart {...props} />);

    expect(createChart).toHaveBeenCalledTimes(1);

    // Change a prop that should only trigger update, not recreation
    rerender(<MiniQuoteChart {...props} highIBS={0.9} />);

    // CURRENT BEHAVIOR: It is 2.
    // DESIRED BEHAVIOR: It should be 1.
    // I assert 1 to demonstrate failure.
    expect(createChart).toHaveBeenCalledTimes(1);
  });
});
