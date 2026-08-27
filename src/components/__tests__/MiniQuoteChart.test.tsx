import { render } from '@testing-library/react';
import { MiniQuoteChart } from '../MiniQuoteChart';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CandlestickSeries, createChart } from 'lightweight-charts';
import { toChartTimestamp } from '../../lib/date-utils';

// Mock lightweight-charts
const mockSeries = {
  setData: vi.fn(),
  applyOptions: vi.fn(),
  createPriceLine: vi.fn().mockReturnValue({}), // Return dummy object for price line
  removePriceLine: vi.fn(),
};

const mockMarkersApi = {
  setMarkers: vi.fn(),
};

const mockChart = {
  addSeries: vi.fn().mockReturnValue(mockSeries),
  priceScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  timeScale: vi.fn().mockReturnValue({ applyOptions: vi.fn() }),
  applyOptions: vi.fn(),
  remove: vi.fn(),
};

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: Symbol('CandlestickSeries'),
  createChart: vi.fn(() => mockChart),
  createSeriesMarkers: vi.fn(() => mockMarkersApi),
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
    expect(mockChart.addSeries).toHaveBeenCalledTimes(1);
    expect(mockChart.addSeries).toHaveBeenCalledWith(CandlestickSeries, expect.any(Object));
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

  describe("today's candle", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is stamped with the NYSE date, not the UTC one', () => {
      // 02:00 UTC on 20 March is still 19 March in New York
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-20T02:00:00.000Z'));

      render(
        <MiniQuoteChart
          history={sampleData}
          today={{ open: 110, high: 120, low: 108, current: 118 }}
          trades={[]}
          highIBS={0.8}
          isOpenPosition={false}
        />
      );

      const candles = mockSeries.setData.mock.calls[0][0] as Array<{ time: number }>;
      expect(candles[candles.length - 1].time).toBe(toChartTimestamp('2026-03-19'));
    });
  });
});
