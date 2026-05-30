import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiTickerPage } from '../MultiTickerPage';
import type { Strategy } from '../../types';

const mocks = vi.hoisted(() => ({
  loadTickerData: vi.fn(),
  runSinglePositionBacktest: vi.fn(),
  optimizeTickerData: vi.fn((data) => data),
  useAppStore: vi.fn(),
  getQuote: vi.fn(),
}));

vi.mock('../../stores', () => ({
  useAppStore: mocks.useAppStore,
}));

vi.mock('../../hooks/useMultiTickerData', () => ({
  useMultiTickerData: () => ({
    tickersData: [],
    setTickersData: vi.fn(),
    loadTickerData: mocks.loadTickerData,
    handleRefreshTicker: vi.fn(),
    refreshingTickers: new Set<string>(),
    isDataOutdated: vi.fn(() => false),
  }),
}));

vi.mock('../../lib/singlePositionBacktest', () => ({
  optimizeTickerData: mocks.optimizeTickerData,
  runSinglePositionBacktest: mocks.runSinglePositionBacktest,
}));

vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    getQuote: mocks.getQuote,
  },
}));

vi.mock('../../lib/market-utils', () => ({
  getIsMarketOpen: () => false,
}));

vi.mock('../../lib/prefetch', () => ({
  scheduleIdleTask: vi.fn(() => undefined),
}));

vi.mock('../../hooks/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('../ui', () => ({
  MetricsGrid: () => <div data-testid="metrics-grid" />,
  AnalysisTabs: ({ tabs, activeTab, onChange }: any) => (
    <div data-testid="analysis-tabs">
      {tabs.map((tab: any) => (
        <button key={tab.id} type="button" aria-pressed={tab.id === activeTab} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
  PageHeader: ({ title, subtitle }: any) => <header><h1>{title}</h1><p>{subtitle}</p></header>,
  Select: (props: any) => <select {...props} />,
  Input: (props: any) => <input {...props} />,
  Button: ({ children, onClick, disabled, isLoading }: any) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {isLoading ? 'Загрузка...' : children}
    </button>
  ),
  TickerInput: ({ value, onChange }: any) => (
    <input aria-label="Тикеры" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
  ChartContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
  IconButton: ({ children, onClick, disabled, title }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  ),
  Panel: ({ children, as: Component = 'div', ...props }: any) => <Component {...props}>{children}</Component>,
}));

vi.mock('../BacktestPageShell', () => ({
  BacktestPageShell: ({ children }: any) => <div>{children}</div>,
}));
vi.mock('../HeroLineChart', () => ({ HeroLineChart: () => <div data-testid="hero-line-chart" /> }));
vi.mock('../AnimatedPrice', () => ({ AnimatedPrice: ({ value }: any) => <span>{value}</span> }));
vi.mock('../StrategyInfoCard', () => ({ StrategyInfoCard: () => <div data-testid="strategy-info" /> }));
vi.mock('../MonthlyContributionAnalysis', () => ({ MonthlyContributionAnalysis: () => <div data-testid="monthly" /> }));
vi.mock('../CompactMetrics', () => ({ CompactMetrics: () => <div data-testid="compact-metrics" /> }));
vi.mock('../StaleDataWarning', () => ({ StaleDataWarning: () => <div data-testid="stale-warning" /> }));
vi.mock('../OpenPositionBadge', () => ({ OpenPositionBadge: () => <div data-testid="open-position" /> }));
vi.mock('../QuoteDetailsPopover', () => ({ QuoteDetailsPopover: () => <div data-testid="quote-details" /> }));
vi.mock('../HeroChartSettingsPopover', () => ({ HeroChartSettingsPopover: () => <div data-testid="hero-settings" /> }));

const strategy: Strategy = {
  id: 'ibs-mean-reversion',
  name: 'IBS Mean Reversion',
  description: 'Test strategy',
  type: 'ibs-mean-reversion',
  parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 },
  entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
  exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
  riskManagement: {
    initialCapital: 10000,
    capitalUsage: 100,
    leverage: 1,
    maxPositionSize: 1,
    stopLoss: 2,
    takeProfit: 4,
    useStopLoss: false,
    useTakeProfit: false,
    maxPositions: 1,
    maxHoldDays: 30,
    commission: { type: 'percentage', percentage: 0 },
    slippage: 0,
  },
  positionSizing: { type: 'percentage', value: 100 },
};

describe('MultiTickerPage take-profit control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storage = new Map<string, string>();
    const localStorageMock = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
      removeItem: vi.fn((key: string) => { storage.delete(key); }),
      clear: vi.fn(() => { storage.clear(); }),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });
    vi.stubGlobal('localStorage', localStorageMock);
    mocks.useAppStore.mockImplementation((selector) => selector({
      defaultMultiTickerSymbols: 'AAPL',
      resultsQuoteProvider: 'finnhub',
      analysisTabsConfig: [],
      currentStrategy: strategy,
    }));
    mocks.getQuote.mockResolvedValue({ current: 100, prevClose: 99, open: 99, high: 101, low: 98 });
    mocks.loadTickerData.mockResolvedValue({
      ticker: 'AAPL',
      data: [{ date: '2024-01-01', open: 100, high: 102, low: 99, close: 100, volume: 1000 }],
      ibsValues: [0.05],
      splits: [],
    });
    mocks.runSinglePositionBacktest.mockReturnValue({
      equity: [],
      finalValue: 10000,
      maxDrawdown: 0,
      trades: [],
      metrics: {},
    });
  });

  it('passes a custom take-profit percent to all stock backtest runs and remembers it', async () => {
    render(
      <MemoryRouter>
        <MultiTickerPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(mocks.runSinglePositionBacktest).toHaveBeenCalledTimes(3));
    mocks.runSinglePositionBacktest.mockClear();

    const takeProfitInput = screen.getByRole('spinbutton', { name: 'Тейк-профит' });
    fireEvent.change(takeProfitInput, { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить бэктест' }));

    await waitFor(() => expect(mocks.runSinglePositionBacktest).toHaveBeenCalledTimes(3));

    expect(mocks.runSinglePositionBacktest.mock.calls[0][3]).toEqual(
      expect.objectContaining({ allowSameDayReentry: true, takeProfitPercent: 2.5 })
    );
    expect(mocks.runSinglePositionBacktest.mock.calls[1][3]).toEqual(
      expect.objectContaining({ allowSameDayReentry: true, takeProfitPercent: 2.5 })
    );
    expect(mocks.runSinglePositionBacktest.mock.calls[2][3]).toEqual(
      expect.objectContaining({ allowSameDayReentry: true, takeProfitPercent: 2.5 })
    );

    await waitFor(() => expect(window.localStorage.setItem).toHaveBeenCalledWith('stocks.takeProfitPercent', '2.5'));
  });

  it('loads a remembered custom take-profit percent', async () => {
    window.localStorage.setItem('stocks.takeProfitPercent', '2.5');

    render(
      <MemoryRouter>
        <MultiTickerPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('spinbutton', { name: 'Тейк-профит' })).toHaveValue(2.5);

    await waitFor(() => expect(mocks.runSinglePositionBacktest).toHaveBeenCalledTimes(3));
    expect(mocks.runSinglePositionBacktest.mock.calls[0][3]).toEqual(
      expect.objectContaining({ allowSameDayReentry: true, takeProfitPercent: 2.5 })
    );
  });
});
