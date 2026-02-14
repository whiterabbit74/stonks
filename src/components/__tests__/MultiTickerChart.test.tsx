import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiTickerChart } from '../MultiTickerChart';
import { createChart } from 'lightweight-charts';

const mockSeries = {
  setData: vi.fn(),
  priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
};

const mockChart = {
  addSeries: vi.fn(() => mockSeries),
  timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
  remove: vi.fn(),
};

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => mockChart),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
  CandlestickSeries: Symbol('CandlestickSeries'),
  LineSeries: Symbol('LineSeries'),
}));

describe('MultiTickerChart', () => {
  const tickersData = [
    {
      ticker: 'AAPL',
      ibsValues: [],
      data: [
        { date: '2025-01-01', open: 100, high: 105, low: 98, close: 103, volume: 1000 },
        { date: '2025-01-02', open: 103, high: 106, low: 102, close: 104, volume: 1200 },
      ],
    },
    {
      ticker: 'MSFT',
      ibsValues: [],
      data: [
        { date: '2025-01-01', open: 200, high: 205, low: 198, close: 204, volume: 1400 },
        { date: '2025-01-02', open: 204, high: 206, low: 201, close: 202, volume: 1500 },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chart controls and initializes chart', () => {
    render(<MultiTickerChart tickersData={tickersData} trades={[]} />);

    expect(createChart).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Candles' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Normalized (Base 100)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /AAPL/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MSFT/ })).toBeInTheDocument();
  });

  it('switches to normalized mode', () => {
    render(<MultiTickerChart tickersData={tickersData} trades={[]} />);

    const before = (createChart as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Normalized (Base 100)' }));
    const after = (createChart as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    expect(after).toBeGreaterThan(before);
  });
});
