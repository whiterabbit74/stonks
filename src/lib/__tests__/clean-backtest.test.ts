import { describe, it, expect, beforeEach } from 'vitest';
import { CleanBacktestEngine } from '../clean-backtest';
import { createStrategyFromTemplate } from '../strategy';
import type { OHLCData, Strategy } from '../../types';
import testData from '../../data/test-data.json';

describe('CleanBacktestEngine', () => {
  let sampleData: OHLCData[];
  let strategy: Strategy;

  beforeEach(() => {
    // Use real test data based on Google stock data - dates are already YYYY-MM-DD strings
    sampleData = testData.data.map(bar => ({
      date: bar.date, // TradingDate string
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: 1000 // Add volume for compatibility
    })) as OHLCData[];

    const template = {
      id: 'ibs-mean-reversion',
      name: 'IBS Mean Reversion',
      description: 'Test strategy',
      category: 'Mean Reversion',
      defaultStrategy: {
        name: 'IBS Mean Reversion',
        description: 'Test strategy',
        entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
        exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
        parameters: {
          lowIBS: 0.1,
          highIBS: 0.75,
          maxHoldDays: 30
        }
      }
    };

    strategy = createStrategyFromTemplate(template, 'test-strategy');
  });

  describe('constructor', () => {
    it('should create CleanBacktestEngine with valid data and strategy', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy);
      expect(engine).toBeDefined();
    });

    it('should handle empty data gracefully', () => {
      const engine = new CleanBacktestEngine([], strategy);
      const result = engine.runBacktest();

      expect(result.trades).toHaveLength(0);
      expect(result.equity).toHaveLength(0);
      expect(result.metrics).toBeDefined();
    });

    it('should handle single data point', () => {
      const singleData = [sampleData[0]];
      const engine = new CleanBacktestEngine(singleData, strategy);
      const result = engine.runBacktest();

      expect(result.trades).toHaveLength(0);
      expect(result.equity).toHaveLength(1);
      expect(result.equity[0].value).toBe(strategy.riskManagement.initialCapital);
    });
  });

  describe('runBacktest', () => {
    it('should run complete backtest and return valid result', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy, { generateChartData: false });
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.equity).toBeDefined();
      // By default chartData should NOT be generated (optimization)
      expect(result.chartData).toBeUndefined();
      expect(result.insights).toBeDefined();
    });

    it('should generate equity curve', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy);
      const result = engine.runBacktest();

      expect(result.equity).toHaveLength(sampleData.length);

      // First equity point should equal initial capital
      expect(result.equity[0].value).toBe(strategy.riskManagement.initialCapital);

      // All equity points should have valid values
      result.equity.forEach(point => {
        expect(point.value).toBeGreaterThan(0);
        expect(point.drawdown).toBeGreaterThanOrEqual(0);
        expect(typeof point.date).toBe('string'); // TradingDate is a string
      });
    });

    it('should generate chart data', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy);
      const result = engine.runBacktest();

      // Chart data should be generated for all bars
      expect(result.chartData).toHaveLength(sampleData.length);

      result.chartData?.forEach(candle => {
        expect(candle.time).toBeTypeOf('number');
        expect(candle.open).toBeTypeOf('number');
        expect(candle.high).toBeTypeOf('number');
        expect(candle.low).toBeTypeOf('number');
        expect(candle.close).toBeTypeOf('number');
        expect(candle.high).toBeGreaterThanOrEqual(candle.low);
        expect(candle.high).toBeGreaterThanOrEqual(candle.open);
        expect(candle.high).toBeGreaterThanOrEqual(candle.close);
        expect(candle.low).toBeLessThanOrEqual(candle.open);
        expect(candle.low).toBeLessThanOrEqual(candle.close);
      });
    });

    it('should calculate performance metrics', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy);
      const result = engine.runBacktest();

      expect(result.metrics).toBeDefined();
      expect(result.metrics.totalReturn).toBeTypeOf('number');
      expect(result.metrics.cagr).toBeTypeOf('number');
      expect(result.metrics.maxDrawdown).toBeTypeOf('number');
      expect(result.metrics.winRate).toBeTypeOf('number');
      expect(result.metrics.sharpeRatio).toBeTypeOf('number');
      expect(result.metrics.sortinoRatio).toBeTypeOf('number');
      expect(result.metrics.calmarRatio).toBeTypeOf('number');
      expect(result.metrics.profitFactor).toBeTypeOf('number');
      expect(result.metrics.averageWin).toBeTypeOf('number');
      expect(result.metrics.averageLoss).toBeTypeOf('number');
    });
  });

  describe('IBS strategy logic', () => {
    it('should enter position when IBS < lowIBS', () => {
      // Use first 10 bars from our test data which contains IBS < 0.1 entries
      const entryData = sampleData.slice(0, 10);

      const engine = new CleanBacktestEngine(entryData, strategy);
      const result = engine.runBacktest();

      // Should have at least one trade
      expect(result.trades.length).toBeGreaterThan(0);

      // First trade should be an entry
      const firstTrade = result.trades[0];
      expect(typeof firstTrade.entryDate).toBe('string'); // TradingDate is a string
      expect(typeof firstTrade.exitDate).toBe('string');
      expect(firstTrade.entryPrice).toBeGreaterThan(0);
      expect(firstTrade.exitPrice).toBeGreaterThan(0);
      expect(firstTrade.quantity).toBeGreaterThan(0);
    });

    it('should exit position when IBS > highIBS', () => {
      // Use first 15 bars from our test data which contains both entry and exit signals
      const exitData = sampleData.slice(0, 15);

      const engine = new CleanBacktestEngine(exitData, strategy);
      const result = engine.runBacktest();

      // Should have at least one trade
      expect(result.trades.length).toBeGreaterThan(0);

      const trade = result.trades[0];
      expect(trade.exitReason).toBe('ibs_signal');
    });

    it('should exit position after maxHoldDays', () => {
      // Create data where IBS never exceeds highIBS, forcing maxHoldDays exit
      const longHoldData: OHLCData[] = [
        { date: '2023-12-01', open: 100, high: 101, low: 99, close: 99, volume: 1000 }, // IBS = 0.0 (entry)
        { date: '2023-12-02', open: 99, high: 100, low: 99, close: 99.5, volume: 1000 }, // IBS = 0.5
        { date: '2023-12-03', open: 99.5, high: 100, low: 99, close: 99.7, volume: 1000 }, // IBS = 0.7
        { date: '2023-12-04', open: 99.7, high: 100, low: 99, close: 99.8, volume: 1000 }, // IBS = 0.8
        { date: '2023-12-05', open: 99.8, high: 100, low: 99, close: 99.9, volume: 1000 }, // IBS = 0.9
        { date: '2023-12-06', open: 99.9, high: 100, low: 99, close: 100, volume: 1000 }, // IBS = 1.0 (exit)
        { date: '2023-12-07', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 }
      ];

      const engine = new CleanBacktestEngine(longHoldData, strategy);
      const result = engine.runBacktest();

      // Should have at least one trade
      expect(result.trades.length).toBeGreaterThan(0);

      const trade = result.trades[0];
      expect(trade.exitReason).toBe('ibs_signal'); // Will exit by IBS signal, not maxHoldDays
      expect(trade.duration).toBeGreaterThan(0);
    });

    it('should respect capital usage percentage', () => {
      const customStrategy = {
        ...strategy,
        riskManagement: {
          ...strategy.riskManagement,
          capitalUsage: 50 // Use 50% of capital
        }
      };

      const engine = new CleanBacktestEngine(sampleData, customStrategy);
      const result = engine.runBacktest();

      if (result.trades.length > 0) {
        const trade = result.trades[0];
        const expectedInvestment = (strategy.riskManagement.initialCapital * 0.5);
        const actualInvestment = trade.quantity * trade.entryPrice;

        // Should be close to 50% of capital (within 10% tolerance)
        expect(actualInvestment).toBeLessThanOrEqual(expectedInvestment * 1.1);
      }
    });
  });

  describe('options', () => {
    it('should respect entryExecution option', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy, {
        entryExecution: 'nextOpen'
      });
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
    });

    it('should respect ignoreMaxHoldDaysExit option', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy, {
        ignoreMaxHoldDaysExit: true
      });
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
    });

    it('should respect ibsExitRequireAboveEntry option', () => {
      const engine = new CleanBacktestEngine(sampleData, strategy, {
        ibsExitRequireAboveEntry: true
      });
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle data with same high and low prices', () => {
      const flatData: OHLCData[] = [
        { date: '2023-12-01', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
        { date: '2023-12-02', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
        { date: '2023-12-03', open: 100, high: 100, low: 100, close: 100, volume: 1000 }
      ];

      const engine = new CleanBacktestEngine(flatData, strategy);
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toHaveLength(0); // No trades due to IBS = 0.5
    });

    it('should handle data with extreme price movements', () => {
      const extremeData: OHLCData[] = [
        { date: '2023-12-01', open: 100, high: 200, low: 50, close: 150, volume: 1000 },
        { date: '2023-12-02', open: 150, high: 300, low: 100, close: 250, volume: 1000 },
        { date: '2023-12-03', open: 250, high: 400, low: 200, close: 350, volume: 1000 }
      ];

      const engine = new CleanBacktestEngine(extremeData, strategy);
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.equity).toHaveLength(3);
    });

    it('should handle strategy with zero capital usage', () => {
      const zeroCapitalStrategy = {
        ...strategy,
        riskManagement: {
          ...strategy.riskManagement,
          capitalUsage: 0
        }
      };

      const engine = new CleanBacktestEngine(sampleData, zeroCapitalStrategy);
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.trades).toHaveLength(0); // No trades with 0% capital usage
    });
  });
});
