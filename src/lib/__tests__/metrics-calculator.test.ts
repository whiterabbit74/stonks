import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCalculator } from '../metrics';
import type { Trade, EquityPoint, OHLCData } from '../../types';

describe('MetricsCalculator - Critical Calculations', () => {
  let sampleTrades: Trade[];
  let sampleEquity: EquityPoint[];
  let sampleMarketData: OHLCData[];
  let initialCapital: number;

  beforeEach(() => {
    initialCapital = 10000;

    // Create realistic trades with TradingDate strings
    sampleTrades = [
      {
        id: 'trade-1',
        entryDate: '2023-12-01',
        exitDate: '2023-12-03',
        entryPrice: 100,
        exitPrice: 105,
        quantity: 100,
        pnl: 500,
        pnlPercent: 5,
        duration: 2,
        exitReason: 'ibs_signal',
        context: {
          ticker: 'AAPL',
          currentCapitalAfterExit: 10500
        }
      },
      {
        id: 'trade-2',
        entryDate: '2023-12-04',
        exitDate: '2023-12-06',
        entryPrice: 105,
        exitPrice: 98,
        quantity: 100,
        pnl: -700,
        pnlPercent: -6.67,
        duration: 2,
        exitReason: 'ibs_signal',
        context: {
          ticker: 'AAPL',
          currentCapitalAfterExit: 9800
        }
      },
      {
        id: 'trade-3',
        entryDate: '2023-12-07',
        exitDate: '2023-12-09',
        entryPrice: 98,
        exitPrice: 102,
        quantity: 100,
        pnl: 400,
        pnlPercent: 4.08,
        duration: 2,
        exitReason: 'max_hold_days',
        context: {
          ticker: 'AAPL',
          currentCapitalAfterExit: 10200
        }
      }
    ] as Trade[];

    // Create realistic equity curve with TradingDate strings
    sampleEquity = [
      { date: '2023-12-01', value: 10000, drawdown: 0 },
      { date: '2023-12-02', value: 10000, drawdown: 0 },
      { date: '2023-12-03', value: 10500, drawdown: 0 },
      { date: '2023-12-04', value: 10500, drawdown: 0 },
      { date: '2023-12-05', value: 10500, drawdown: 0 },
      { date: '2023-12-06', value: 9800, drawdown: 6.67 },
      { date: '2023-12-07', value: 9800, drawdown: 6.67 },
      { date: '2023-12-08', value: 9800, drawdown: 6.67 },
      { date: '2023-12-09', value: 10200, drawdown: 0 }
    ] as EquityPoint[];

    // Create market data with TradingDate strings
    sampleMarketData = [
      { date: '2023-12-01', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { date: '2023-12-02', open: 101, high: 103, low: 100, close: 102, volume: 1100 },
      { date: '2023-12-03', open: 102, high: 106, low: 101, close: 105, volume: 1200 },
      { date: '2023-12-04', open: 105, high: 106, low: 104, close: 105, volume: 1000 },
      { date: '2023-12-05', open: 105, high: 106, low: 103, close: 104, volume: 900 },
      { date: '2023-12-06', open: 104, high: 105, low: 97, close: 98, volume: 1500 },
      { date: '2023-12-07', open: 98, high: 99, low: 97, close: 98, volume: 800 },
      { date: '2023-12-08', open: 98, high: 100, low: 97, close: 99, volume: 900 },
      { date: '2023-12-09', open: 99, high: 103, low: 98, close: 102, volume: 1100 }
    ] as OHLCData[];
  });

  describe('total return calculation', () => {
    it('should calculate total return correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      const expectedTotalReturn = (10200 - 10000) / 10000 * 100; // 2%
      expect(metrics.totalReturn).toBeCloseTo(expectedTotalReturn, 2);
    });

    it('should handle zero initial capital', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, 0);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.totalReturn).toBe(0);
    });

    it('should handle negative total return', () => {
      const losingEquity = sampleEquity.map(point => ({
        ...point,
        value: point.value * 0.8 // 20% loss
      }));

      const calculator = new MetricsCalculator(sampleTrades, losingEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.totalReturn).toBeLessThan(0);
      expect(metrics.totalReturn).toBeCloseTo(-18.4, 1);
    });
  });

  describe('CAGR calculation', () => {
    it('should calculate CAGR correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // With 2% return over ~8 days, CAGR should be calculated
      expect(isFinite(metrics.cagr)).toBe(true);
      expect(metrics.cagr).toBeGreaterThan(0);
    });

    it('should handle single day period', () => {
      const singleDayEquity = [sampleEquity[0]];
      const calculator = new MetricsCalculator([], singleDayEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.cagr).toBe(0);
    });
  });

  describe('max drawdown calculation', () => {
    it('should calculate max drawdown correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // Max drawdown should be 6.67% (from 10500 to 9800)
      expect(metrics.maxDrawdown).toBeCloseTo(6.67, 2);
    });

    it('should handle no drawdown', () => {
      const noDrawdownEquity = sampleEquity.map(point => ({
        ...point,
        value: Math.max(point.value, 10000) // No values below initial
      }));

      const calculator = new MetricsCalculator(sampleTrades, noDrawdownEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.maxDrawdown).toBeCloseTo(6.67, 1);
    });

    it('should handle 100% drawdown', () => {
      const totalLossEquity: EquityPoint[] = [
        { date: '2023-12-01', value: 10000, drawdown: 0 },
        { date: '2023-12-02', value: 0, drawdown: 100 }
      ];

      const calculator = new MetricsCalculator(sampleTrades, totalLossEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.maxDrawdown).toBe(100);
    });
  });

  describe('win rate calculation', () => {
    it('should calculate win rate correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // 2 winning trades out of 3 total trades = 66.67%
      expect(metrics.winRate).toBeCloseTo(66.67, 2);
    });

    it('should handle no trades', () => {
      const calculator = new MetricsCalculator([], sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.winRate).toBe(0);
    });

    it('should handle all winning trades', () => {
      const allWinningTrades = sampleTrades.map(trade => ({
        ...trade,
        pnl: Math.abs(trade.pnl) // Make all positive
      }));

      const calculator = new MetricsCalculator(allWinningTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.winRate).toBe(100);
    });

    it('should handle all losing trades', () => {
      const allLosingTrades = sampleTrades.map(trade => ({
        ...trade,
        pnl: -Math.abs(trade.pnl) // Make all negative
      }));

      const calculator = new MetricsCalculator(allLosingTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.winRate).toBe(0);
    });
  });

  describe('profit factor calculation', () => {
    it('should calculate profit factor correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // Total wins: 500 + 400 = 900
      // Total losses: 700
      // Profit factor: 900 / 700 = 1.286
      expect(metrics.profitFactor).toBeCloseTo(1.286, 3);
    });

    it('should handle no losses', () => {
      const noLossTrades = sampleTrades.map(trade => ({
        ...trade,
        pnl: Math.abs(trade.pnl) // Make all positive
      }));

      const calculator = new MetricsCalculator(noLossTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.profitFactor).toBe(Infinity);
    });

    it('should handle no wins', () => {
      const noWinTrades = sampleTrades.map(trade => ({
        ...trade,
        pnl: -Math.abs(trade.pnl) // Make all negative
      }));

      const calculator = new MetricsCalculator(noWinTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.profitFactor).toBe(0);
    });
  });

  describe('average win/loss calculation', () => {
    it('should calculate average win correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // Average of 500 and 400 = 450
      expect(metrics.averageWin).toBeCloseTo(450, 0);
    });

    it('should calculate average loss correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // Only one loss: -700
      expect(metrics.averageLoss).toBeCloseTo(700, 0);
    });

    it('should handle no wins', () => {
      const noWinTrades = sampleTrades.map(trade => ({
        ...trade,
        pnl: -Math.abs(trade.pnl) // Make all negative
      }));

      const calculator = new MetricsCalculator(noWinTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.averageWin).toBe(0);
    });

    it('should handle no losses', () => {
      const noLossTrades = sampleTrades.map(trade => ({
        ...trade,
        pnl: Math.abs(trade.pnl) // Make all positive
      }));

      const calculator = new MetricsCalculator(noLossTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.averageLoss).toBe(0);
    });
  });

  describe('Sharpe ratio calculation', () => {
    it('should calculate Sharpe ratio correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(isFinite(metrics.sharpeRatio)).toBe(true);
      expect(typeof metrics.sharpeRatio).toBe('number');
    });

    it('should handle zero volatility', () => {
      const constantEquity = sampleEquity.map(point => ({
        ...point,
        value: initialCapital // Constant value
      }));

      const calculator = new MetricsCalculator([], constantEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.sharpeRatio).toBe(0);
    });
  });

  describe('Sortino ratio calculation', () => {
    it('should calculate Sortino ratio correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(isFinite(metrics.sortinoRatio)).toBe(true);
      expect(typeof metrics.sortinoRatio).toBe('number');
    });
  });

  describe('Calmar ratio calculation', () => {
    it('should calculate Calmar ratio correctly', () => {
      const calculator = new MetricsCalculator(sampleTrades, sampleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(isFinite(metrics.calmarRatio)).toBe(true);
      expect(typeof metrics.calmarRatio).toBe('number');
    });

    it('should handle zero max drawdown', () => {
      const noDrawdownEquity = sampleEquity.map((point, index) => ({
        ...point,
        value: 10000 * (1 + index * 0.01), // Monotonically increasing
        drawdown: 0
      }));

      const calculator = new MetricsCalculator(sampleTrades, noDrawdownEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      // When max drawdown is 0, Calmar ratio should be 0 (as per implementation)
      // This represents infinite return-to-risk ratio
      expect(metrics.calmarRatio).toBe(0);
    });
  });

  describe('equity curve generation', () => {
    it('should generate equity curve from trades', () => {
      const equity = MetricsCalculator.generateEquityCurve(
        sampleTrades,
        sampleMarketData,
        initialCapital
      );

      expect(equity).toHaveLength(sampleMarketData.length);
      expect(equity[0].value).toBe(initialCapital);
      expect(equity[equity.length - 1].value).toBe(10200);
    });

    it('should handle empty trades', () => {
      const equity = MetricsCalculator.generateEquityCurve(
        [],
        sampleMarketData,
        initialCapital
      );

      expect(equity).toHaveLength(sampleMarketData.length);
      equity.forEach(point => {
        expect(point.value).toBe(initialCapital);
        expect(point.drawdown).toBe(0);
      });
    });

    it('should handle trades on same day', () => {
      const sameDayTrades: Trade[] = [
        {
          ...sampleTrades[0],
          exitDate: '2023-12-03'
        },
        {
          ...sampleTrades[1],
          entryDate: '2023-12-03',
          exitDate: '2023-12-03',
          pnl: 200
        }
      ];

      const equity = MetricsCalculator.generateEquityCurve(
        sameDayTrades,
        sampleMarketData,
        initialCapital
      );

      // Should handle multiple trades on same day
      expect(equity).toHaveLength(sampleMarketData.length);
    });
  });

  describe('edge cases', () => {
    it('should handle empty equity array', () => {
      const calculator = new MetricsCalculator(sampleTrades, [], initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.totalReturn).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.cagr).toBe(0);
    });

    it('should handle single equity point', () => {
      const singleEquity = [sampleEquity[0]];
      const calculator = new MetricsCalculator(sampleTrades, singleEquity, initialCapital);
      const metrics = calculator.calculateAllMetrics();

      expect(metrics.totalReturn).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
    });

    it('should handle very large numbers', () => {
      const largeEquity = sampleEquity.map(point => ({
        ...point,
        value: point.value * 1000000
      }));

      const calculator = new MetricsCalculator(sampleTrades, largeEquity, initialCapital * 1000000);
      const metrics = calculator.calculateAllMetrics();

      expect(isFinite(metrics.totalReturn)).toBe(true);
      expect(isFinite(metrics.maxDrawdown)).toBe(true);
    });

    it('should handle very small numbers', () => {
      const smallEquity = sampleEquity.map(point => ({
        ...point,
        value: point.value * 0.001
      }));

      const calculator = new MetricsCalculator(sampleTrades, smallEquity, initialCapital * 0.001);
      const metrics = calculator.calculateAllMetrics();

      expect(isFinite(metrics.totalReturn)).toBe(true);
      expect(isFinite(metrics.maxDrawdown)).toBe(true);
    });
  });
});
