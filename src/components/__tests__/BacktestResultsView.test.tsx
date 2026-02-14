import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BacktestResultsView } from '../BacktestResultsView';
import type { Trade } from '../../types';

// Mock child components to avoid rendering complexity
vi.mock('../ui', () => ({
  ChartContainer: ({ children, title }: any) => <div data-testid="chart-container" title={title}>{children}</div>
}));
vi.mock('../TradingChart', () => ({ TradingChart: () => <div>TradingChart</div> }));
vi.mock('../EquityChart', () => ({ EquityChart: () => <div>EquityChart</div> }));
vi.mock('../MultiTickerChart', () => ({ MultiTickerChart: () => <div>MultiTickerChart</div> }));
vi.mock('../TickerCardsGrid', () => ({ TickerCardsGrid: () => <div>TickerCardsGrid</div> }));
vi.mock('../TradesTable', () => ({
  TradesTable: ({ trades }: { trades: Trade[] }) => (
    <div data-testid="trades-table">
      {trades.map((t, i) => (
        <div key={i} data-testid="trade-row">
          {(t.context as any)?.ticker}
        </div>
      ))}
    </div>
  )
}));
vi.mock('../ProfitFactorAnalysis', () => ({ ProfitFactorAnalysis: () => <div>ProfitFactorAnalysis</div> }));
vi.mock('../DurationAnalysis', () => ({ DurationAnalysis: () => <div>DurationAnalysis</div> }));
vi.mock('../SplitsList', () => ({ SplitsList: () => <div>SplitsList</div> }));
vi.mock('../TradeDrawdownChart', () => ({ TradeDrawdownChart: () => <div>TradeDrawdownChart</div> }));

describe('BacktestResultsView Logic Optimization', () => {
  const mockTrades: Trade[] = [
    {
      entryDate: '2023-01-01', exitDate: '2023-01-05', pnl: 100,
      context: { ticker: 'AAPL' }
    },
    {
      entryDate: '2023-01-02', exitDate: '2023-01-06', pnl: 200,
      context: { ticker: 'GOOGL' }
    },
    {
      entryDate: '2023-01-03', exitDate: '2023-01-07', pnl: 150,
      context: { ticker: 'AAPL' }
    }
  ] as any[];

  it('renders all trades in single mode', async () => {
    render(
      <BacktestResultsView
        mode="single"
        activeTab="trades"
        backtestResults={{ trades: mockTrades } as any}
        symbol="AAPL"
      />
    );

    const rows = await screen.findAllByTestId('trade-row');
    expect(rows).toHaveLength(3);
  });

  it('renders all trades in multi mode when selectedTradeTicker is all', async () => {
    render(
      <BacktestResultsView
        mode="multi"
        activeTab="trades"
        backtestResults={{ trades: mockTrades } as any}
        tickersData={[{ ticker: 'AAPL' }, { ticker: 'GOOGL' }] as any}
        handlers={{
          selectedTradeTicker: 'all',
          setSelectedTradeTicker: vi.fn()
        } as any}
      />
    );

    const rows = await screen.findAllByTestId('trade-row');
    expect(rows).toHaveLength(3);
  });

  it('renders filtered trades in multi mode when specific ticker selected', async () => {
    render(
      <BacktestResultsView
        mode="multi"
        activeTab="trades"
        backtestResults={{ trades: mockTrades } as any}
        tickersData={[{ ticker: 'AAPL' }, { ticker: 'GOOGL' }] as any}
        handlers={{
          selectedTradeTicker: 'AAPL',
          setSelectedTradeTicker: vi.fn()
        } as any}
      />
    );

    const rows = await screen.findAllByTestId('trade-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toBe('AAPL');
    expect(rows[1].textContent).toBe('AAPL');
  });
});
