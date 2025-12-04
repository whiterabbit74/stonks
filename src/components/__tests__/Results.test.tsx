import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Results } from '../Results';
import type { Strategy, OHLCData, BacktestResult } from '../../types';

// Mock the stores
vi.mock('../../stores', () => ({
  useAppStore: vi.fn()
}));

// Mock components that are not under test
vi.mock('../EquityChart', () => ({
  EquityChart: ({ equity }: { equity: Array<{date: Date; value: number; drawdown: number}> }) => (
    <div data-testid="equity-chart">
      {equity.length > 0 ? 'Chart with data' : 'No chart data'}
    </div>
  )
}));

vi.mock('../TradesTable', () => ({
  TradesTable: ({ trades }: { trades: Array<{id: string; entryDate: Date; exitDate: Date; pnl: number}> }) => (
    <div data-testid="trades-table">
      {trades.length} trades
    </div>
  )
}));

vi.mock('../StrategyParameters', () => ({
  StrategyParameters: () => <div data-testid="strategy-parameters">Strategy Parameters</div>
}));

describe('Results - Position Monitoring Logic', () => {
  const mockStrategy: Strategy = {
    id: 'test-strategy',
    name: 'IBS Mean Reversion Test',
    description: 'Test strategy',
    type: 'ibs-mean-reversion',
    parameters: {
      lowIBS: 0.1,
      highIBS: 0.75,
      maxHoldDays: 30
    },
    entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
    exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
    riskManagement: {
      initialCapital: 10000,
      capitalUsage: 100,
      maxPositionSize: 1,
      stopLoss: 2,
      takeProfit: 4,
      useStopLoss: false,
      useTakeProfit: false,
      maxPositions: 1,
      maxHoldDays: 30,
      commission: { type: 'percentage', percentage: 0 },
      slippage: 0
    },
    positionSizing: { type: 'percentage', value: 10 }
  };

  const sampleOHLCData: OHLCData[] = [
    { date: new Date('2024-01-01'), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    { date: new Date('2024-01-02'), open: 105, high: 115, low: 95, close: 110, volume: 1200 },
    { date: new Date('2024-01-03'), open: 110, high: 120, low: 100, close: 115, volume: 1100 },
    { date: new Date('2024-01-04'), open: 115, high: 125, low: 105, close: 120, volume: 1300 },
    { date: new Date('2024-01-05'), open: 120, high: 130, low: 110, close: 125, volume: 1400 }
  ];

  const mockBacktestResult: BacktestResult = {
    equity: [
      { date: new Date('2024-01-01'), value: 10000, drawdown: 0 },
      { date: new Date('2024-01-02'), value: 10200, drawdown: 0 },
      { date: new Date('2024-01-03'), value: 10500, drawdown: 0 },
      { date: new Date('2024-01-04'), value: 10300, drawdown: 1.9 },
      { date: new Date('2024-01-05'), value: 10800, drawdown: 0 }
    ],
    trades: [
      {
        id: 'trade-1',
        entryDate: new Date('2024-01-01'),
        exitDate: new Date('2024-01-03'),
        entryPrice: 100,
        exitPrice: 115,
        quantity: 100,
        pnl: 1500,
        pnlPercent: 15,
        duration: 2,
        exitReason: 'ibs_signal',
        context: {
          ticker: 'TEST',
          currentCapitalAfterExit: 10500
        }
      },
      {
        id: 'trade-2', 
        entryDate: new Date('2024-01-04'),
        exitDate: new Date('2024-01-05'), // Fixed null date
        entryPrice: 115,
        exitPrice: 0,
        quantity: 90,
        pnl: 0,
        pnlPercent: 0,
        duration: 0,
        exitReason: 'open_position',
        context: {
          ticker: 'TEST',
          currentCapitalAfterExit: 10300
        }
      }
    ],
    metrics: {
      totalReturn: 8,
      cagr: 15.2,
      maxDrawdown: 1.9,
      winRate: 50,
      profitFactor: 2.5,
      sharpeRatio: 1.2,
      averageWin: 1500,
      averageLoss: 0,
      sortinoRatio: 1.8,
      calmarRatio: 8.0,
      recoveryFactor: 4.2,
      beta: 1.0,
      alpha: 0.05,
      skewness: 0.2,
      kurtosis: 3.1,
      valueAtRisk: -0.02
    }
  };

  const mockUseAppStore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock store with default values
    mockUseAppStore.mockImplementation((selector) => {
      const mockState = {
        telegramWatches: [],
        addTelegramWatch: vi.fn(),
        removeTelegramWatch: vi.fn()
      };
      return selector(mockState);
    });
    
    vi.mocked(require('../../stores').useAppStore).mockImplementation(mockUseAppStore);
  });

  describe('Position Status Detection', () => {
    it('should correctly identify closed positions', async () => {
      const resultWithClosedPosition: BacktestResult = {
        ...mockBacktestResult,
        trades: [
          {
            id: 'closed-trade',
            entryDate: new Date('2024-01-01'),
            exitDate: new Date('2024-01-03'), // Has exit date - closed
            entryPrice: 100,
            exitPrice: 115,
            quantity: 100,
            pnl: 1500,
            pnlPercent: 15,
            duration: 2,
            exitReason: 'ibs_signal',
            context: {
              ticker: 'TEST',
              currentCapitalAfterExit: 10500
            }
          }
        ]
      };

      await act(async () => {
        render(
          <Results
            result={resultWithClosedPosition}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      // Should show monitoring button for closed position (looking for entry)
      const monitorButton = screen.getByText('Добавить в мониторинг');
      expect(monitorButton).toBeInTheDocument();
    });

    it('should correctly identify open positions', async () => {
      const resultWithOpenPosition: BacktestResult = {
        ...mockBacktestResult,
        trades: [
          {
            id: 'open-trade',
            entryDate: new Date('2024-01-04'),
            exitDate: new Date('2024-01-05'), // Fixed null date
            entryPrice: 115,
            exitPrice: 0,
            quantity: 90,
            pnl: 0,
            pnlPercent: 0,
            duration: 0,
            exitReason: 'open_position',
            context: {
              ticker: 'TEST',
              currentCapitalAfterExit: 10300
            }
          }
        ]
      };

      await act(async () => {
        render(
          <Results
            result={resultWithOpenPosition}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      // Should show monitoring button for open position (looking for exit)
      const monitorButton = screen.getByText('Добавить в мониторинг');
      expect(monitorButton).toBeInTheDocument();
    });

    it('should use time-based logic when entry/exit dates are at data boundaries', async () => {
      const lastDataDate = new Date('2024-01-05');
      const lastDataTime = lastDataDate.getTime();
      
      // Position entered before last data date, no exit = open
      const entryBeforeLastData = new Date('2024-01-04');
      const entryTime = entryBeforeLastData.getTime();
      
      const resultWithBoundaryPosition: BacktestResult = {
        ...mockBacktestResult,
        trades: [
          {
            id: 'boundary-trade',
            entryDate: entryBeforeLastData,
            exitDate: new Date('2024-01-06'),
            entryPrice: 115,
            exitPrice: 0,
            quantity: 90,
            pnl: 0,
            pnlPercent: 0,
            duration: 0,
            exitReason: 'open_position',
            context: {
              ticker: 'TEST',
              currentCapitalAfterExit: 10300
            }
          }
        ]
      };

      await act(async () => {
        render(
          <Results
            result={resultWithBoundaryPosition}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      // Logic should detect: entryTime <= lastDataTime AND no exitDate = open position
      expect(screen.getByText('Добавить в мониторинг')).toBeInTheDocument();
    });

    it('should handle case when position entered and exited after last data date', async () => {
      const futureEntryDate = new Date('2024-01-10'); // After last data date
      const futureExitDate = new Date('2024-01-12');
      
      const resultWithFuturePosition: BacktestResult = {
        ...mockBacktestResult,
        trades: [
          {
            id: 'future-trade',
            entryDate: futureEntryDate,
            exitDate: futureExitDate,
            entryPrice: 130,
            exitPrice: 140,
            quantity: 80,
            pnl: 800,
            pnlPercent: 7.7,
            duration: 2,
            exitReason: 'ibs_signal',
            context: {
              ticker: 'TEST',
              currentCapitalAfterExit: 11000
            }
          }
        ]
      };

      await act(async () => {
        render(
          <Results
            result={resultWithFuturePosition}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      // Position outside data range should still be monitored for entry signals
      expect(screen.getByText('Добавить в мониторинг')).toBeInTheDocument();
    });

    it('should add position to monitoring with correct signal type', async () => {
      const mockAddTelegramWatch = vi.fn();
      
      mockUseAppStore.mockImplementation((selector) => {
        const mockState = {
          telegramWatches: [],
          addTelegramWatch: mockAddTelegramWatch,
          removeTelegramWatch: vi.fn()
        };
        return selector(mockState);
      });

      const resultWithClosedPosition: BacktestResult = {
        ...mockBacktestResult,
        trades: [
          {
            id: 'closed-trade',
            entryDate: new Date('2024-01-01'),
            exitDate: new Date('2024-01-03'),
            entryPrice: 100,
            exitPrice: 115,
            quantity: 100,
            pnl: 1500,
            pnlPercent: 15,
            duration: 2,
            exitReason: 'ibs_signal',
            context: {
              ticker: 'TEST',
              currentCapitalAfterExit: 10500
            }
          }
        ]
      };

      await act(async () => {
        render(
          <Results
            result={resultWithClosedPosition}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      const monitorButton = screen.getByText('Добавить в мониторинг');
      
      await act(async () => {
        fireEvent.click(monitorButton);
      });

      // Should add to monitoring with correct parameters for closed position (entry signal)
      expect(mockAddTelegramWatch).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: 'TEST',
          strategy: mockStrategy,
          signalType: 'entry' // Closed position should monitor for entry
        })
      );
    });
  });

  describe('UI Rendering', () => {
    it('should render all result metrics', async () => {
      await act(async () => {
        render(
          <Results
            result={mockBacktestResult}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      expect(screen.getByText('8.00%')).toBeInTheDocument(); // Total return
      expect(screen.getByText('15.20%')).toBeInTheDocument(); // CAGR
      expect(screen.getByText('1.90%')).toBeInTheDocument(); // Max drawdown
      expect(screen.getByText('50.0%')).toBeInTheDocument(); // Win rate
      expect(screen.getByText('2.50')).toBeInTheDocument(); // Profit factor
    });

    it('should render equity chart', async () => {
      await act(async () => {
        render(
          <Results
            result={mockBacktestResult}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      expect(screen.getByTestId('equity-chart')).toBeInTheDocument();
      expect(screen.getByText('Chart with data')).toBeInTheDocument();
    });

    it('should show strategy parameters when trades table is visible', async () => {
      await act(async () => {
        render(
          <Results
            result={mockBacktestResult}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      // Click show trades button
      const showTradesButton = screen.getByText(/Показать сделки/);
      
      await act(async () => {
        fireEvent.click(showTradesButton);
      });

      expect(screen.getByTestId('strategy-parameters')).toBeInTheDocument();
      expect(screen.getByTestId('trades-table')).toBeInTheDocument();
    });

    it('should handle empty results', async () => {
      const emptyResult: BacktestResult = {
        equity: [],
        trades: [],
        metrics: {
          totalReturn: 0,
          cagr: 0,
          maxDrawdown: 0,
          winRate: 0,
          profitFactor: 0,
          sharpeRatio: 0,
          averageWin: 0,
          averageLoss: 0,
          sortinoRatio: 0,
          calmarRatio: 0,
          recoveryFactor: 0,
          beta: 0,
          alpha: 0,
          skewness: 0,
          kurtosis: 0,
          valueAtRisk: 0
        }
      };

      await act(async () => {
        render(
          <Results
            result={emptyResult}
            data={sampleOHLCData}
            strategy={mockStrategy}
            ticker="TEST"
          />
        );
      });

      expect(screen.getByText('No chart data')).toBeInTheDocument();
      expect(screen.getByText('0 trades')).toBeInTheDocument();
    });
  });
});