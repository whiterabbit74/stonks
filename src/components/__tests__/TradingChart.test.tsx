import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TradingChart } from '../TradingChart';

const mockPriceScale = { applyOptions: vi.fn() };
const mockSeries = {
  setData: vi.fn(),
  applyOptions: vi.fn(),
  priceScale: vi.fn(() => mockPriceScale),
};
const mockMarkersApi = {
  setMarkers: vi.fn(),
};
const mockTimeScale = {
  fitContent: vi.fn(),
  setVisibleLogicalRange: vi.fn(),
};
const mockChart = {
  addSeries: vi.fn(() => mockSeries),
  applyOptions: vi.fn(),
  timeScale: vi.fn(() => mockTimeScale),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
};
let capturedBlobParts: unknown[][] = [];

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: Symbol('CandlestickSeries'),
  HistogramSeries: Symbol('HistogramSeries'),
  LineSeries: Symbol('LineSeries'),
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  createChart: vi.fn(() => mockChart),
  createSeriesMarkers: vi.fn(() => mockMarkersApi),
}));

vi.mock('../../stores', () => ({
  useAppStore: (selector: (state: { indicatorPanePercent: number }) => unknown) =>
    selector({ indicatorPanePercent: 18 }),
}));

vi.mock('../../hooks/useIsDark', () => ({
  useIsDark: () => false,
}));

vi.mock('../../hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

describe('TradingChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedBlobParts = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    vi.stubGlobal('Blob', class {
      constructor(parts: unknown[]) {
        capturedBlobParts.push(parts as unknown[]);
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:chart-export'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('shows advanced chart settings controls', () => {
    const data = [
      { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, adjClose: 104, volume: 1000 },
      { date: '2024-01-02', open: 105, high: 112, low: 101, close: 108, adjClose: 107, volume: 1200 },
    ];

    render(<TradingChart data={data} trades={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Настройки графика' }));

    expect(screen.getByLabelText('Непрозрачность EMA 20')).toBeInTheDocument();
    expect(screen.getByLabelText('Непрозрачность EMA 200')).toBeInTheDocument();
    expect(screen.getByLabelText('Размер маркеров')).toBeInTheDocument();
    expect(screen.getByText('Вход ● / выход ■')).toBeInTheDocument();
  });

  it('exports chart data as csv with the expected columns', async () => {
    const data = [
      { date: '2024-01-01', open: 100, high: 110, low: 90, close: 105, adjClose: 104, volume: 1000 },
      { date: '2024-01-02', open: 105, high: 112, low: 101, close: 108, adjClose: 107, volume: 1200 },
    ];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<TradingChart data={data} trades={[]} exportFileNamePrefix="aapl-price-data" />);

    fireEvent.click(screen.getByRole('button', { name: 'Экспортировать данные графика в CSV' }));

    const createObjectUrlMock = vi.mocked(URL.createObjectURL);
    expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
    const text = String(capturedBlobParts[0]?.[0] ?? '');

    expect(text).toContain('date,price,open,high,low,close,adj_close,volume,ibs,ema20,ema200');
    expect(text).toContain('2024-01-01,105.0000,100.0000,110.0000,90.0000,105.0000,104.0000,1000,0.750000');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:chart-export');
  });
});
