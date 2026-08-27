import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createChart } from 'lightweight-charts';
import { OpenDayDrawdownChart } from '../OpenDayDrawdownChart';
import type { OHLCData, Trade } from '../../types';

const mockSeries = {
  setData: vi.fn(),
  createPriceLine: vi.fn().mockReturnValue({}),
};

const mockChart = {
  addSeries: vi.fn(() => mockSeries),
  remove: vi.fn(),
};

vi.mock('lightweight-charts', () => ({
  HistogramSeries: Symbol('HistogramSeries'),
  createChart: vi.fn(() => mockChart),
}));

const data = [
  { date: '2024-01-02', open: 100, high: 104, low: 95, close: 102, volume: 1000 },
  { date: '2024-01-03', open: 102, high: 106, low: 99, close: 105, volume: 1000 },
] as OHLCData[];

const trades = [
  { entryDate: '2024-01-02' },
  { entryDate: '2024-01-03' },
] as Trade[];

describe('OpenDayDrawdownChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the chart instance across parent re-renders with unchanged data', () => {
    const { rerender } = render(<OpenDayDrawdownChart trades={trades} data={data} />);

    expect(createChart).toHaveBeenCalledTimes(1);

    rerender(<OpenDayDrawdownChart trades={trades} data={data} />);

    expect(createChart).toHaveBeenCalledTimes(1);
    expect(mockChart.remove).not.toHaveBeenCalled();
  });
});
