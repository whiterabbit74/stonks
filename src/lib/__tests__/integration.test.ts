import { describe, it, expect, beforeEach } from 'vitest';
import { BacktestEngine } from '../backtest';
import { createStrategyFromTemplate } from '../strategy';
import { IndicatorEngine } from '../indicators';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../utils';
import { toChartTimestamp, compareTradingDates } from '../date-utils';
import type { OHLCData, Strategy } from '../../types';

describe('Integration Tests', () => {
  describe('Complete IBS Strategy Workflow', () => {
    let sampleData: OHLCData[];
    let strategy: Strategy;

    beforeEach(() => {
      // Create realistic OHLC data with varying IBS values
      sampleData = [
        // Low IBS period (entry signals)
        { date: '2023-12-01', open: 100, high: 100, low: 100, close: 100, volume: 1000 }, // IBS = 0.5
        { date: '2023-12-02', open: 100, high: 100, low: 100, close: 100, volume: 1000 }, // IBS = 0.5
        { date: '2023-12-03', open: 100, high: 110, low: 100, close: 101, volume: 1000 }, // IBS = 0.1 (entry)
        { date: '2023-12-04', open: 101, high: 110, low: 100, close: 102, volume: 1000 },
        { date: '2023-12-05', open: 102, high: 110, low: 100, close: 103, volume: 1000 },
        { date: '2023-12-06', open: 103, high: 110, low: 100, close: 104, volume: 1000 },
        { date: '2023-12-07', open: 104, high: 110, low: 100, close: 105, volume: 1000 },
        { date: '2023-12-08', open: 105, high: 110, low: 100, close: 106, volume: 1000 },
        { date: '2023-12-09', open: 106, high: 110, low: 100, close: 107, volume: 1000 },
        { date: '2023-12-10', open: 107, high: 110, low: 100, close: 108, volume: 1000 },
        // High IBS period (exit signals)
        { date: '2023-12-11', open: 108, high: 110, low: 100, close: 109, volume: 1000 }, // IBS = 0.9 (exit)
        { date: '2023-12-12', open: 109, high: 110, low: 100, close: 110, volume: 1000 },
        { date: '2023-12-13', open: 110, high: 110, low: 100, close: 110, volume: 1000 },
        { date: '2023-12-14', open: 110, high: 110, low: 100, close: 110, volume: 1000 },
        { date: '2023-12-15', open: 110, high: 110, low: 100, close: 110, volume: 1000 }
      ];

      const template = {
        id: 'ibs-mean-reversion',
        name: 'IBS Mean Reversion',
        description: 'Integration test strategy',
        category: 'Mean Reversion',
        defaultStrategy: {
          name: 'IBS Mean Reversion',
          description: 'Integration test strategy',
          entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
          exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
          parameters: {
            lowIBS: 0.1,
            highIBS: 0.75,
            maxHoldDays: 10
          }
        }
      };

      strategy = createStrategyFromTemplate(template, 'integration-test');
    });

    it('should complete full backtest workflow', () => {
      const engine = new BacktestEngine(sampleData, strategy);
      const result = engine.runBacktest();

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.trades).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.equity).toBeDefined();
      expect(result.chartData).toBeDefined();

      // Verify equity curve
      expect(result.equity).toHaveLength(sampleData.length);
      expect(result.equity[0].value).toBe(strategy.riskManagement.initialCapital);

      // Verify chart data
      expect(result.chartData).toHaveLength(sampleData.length);
      expect(result.chartData[0].time).toBe(toChartTimestamp(sampleData[0].date));

      // Verify metrics
      expect(result.metrics.totalReturn).toBeTypeOf('number');
      expect(result.metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
      expect(result.metrics.winRate).toBeLessThanOrEqual(100);
    });

    it('should generate valid trades', () => {
      const engine = new BacktestEngine(sampleData, strategy);
      const result = engine.runBacktest();

      if (result.trades.length > 0) {
        const trade = result.trades[0];

        // Verify trade structure
        expect(trade.id).toBeDefined();
        expect(typeof trade.entryDate).toBe('string');
        expect(typeof trade.exitDate).toBe('string');
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.exitPrice).toBeGreaterThan(0);
        expect(trade.quantity).toBeGreaterThan(0);
        expect(trade.pnl).toBeTypeOf('number');
        expect(trade.pnlPercent).toBeTypeOf('number');
        expect(trade.duration).toBeGreaterThanOrEqual(0);
        expect(trade.exitReason).toBeDefined();
        expect(trade.context).toBeDefined();

        // Verify trade logic - using string comparison for TradingDates
        expect(compareTradingDates(trade.exitDate, trade.entryDate)).toBe(1); // exit > entry
        expect(trade.duration).toBeGreaterThanOrEqual(1);
      }
    });

    it('should respect max hold days', () => {
      const longHoldStrategy = {
        ...strategy,
        parameters: {
          ...strategy.parameters,
          maxHoldDays: 5
        }
      };

      const engine = new BacktestEngine(sampleData, longHoldStrategy);
      const result = engine.runBacktest();

      if (result.trades.length > 0) {
        const trade = result.trades[0];
        expect(trade.duration).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('Data Processing Pipeline', () => {
    it('should process data through complete pipeline', () => {
      const rawData: OHLCData[] = [
        { date: '2023-12-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2023-12-01', open: 105, high: 115, low: 95, close: 110, volume: 2000 }, // Duplicate date
        { date: '2023-12-02', open: 110, high: 120, low: 100, close: 115, volume: 1500 }
      ];

      const splits = [
        { date: '2023-12-01', factor: 2 } // 2:1 split
      ];

      // Step 1: Deduplicate data
      const dedupedData = dedupeDailyOHLC(rawData);
      expect(dedupedData).toHaveLength(2);

      // Step 2: Apply splits
      const adjustedData = adjustOHLCForSplits(dedupedData, splits);
      expect(adjustedData).toHaveLength(2);
      expect(adjustedData[0].close).toBe(110); // Second entry after deduplication

      // Step 3: Calculate indicators
      const ibs = IndicatorEngine.calculateIBS(adjustedData);
      expect(ibs).toHaveLength(2);
      expect(ibs[0]).toBeGreaterThanOrEqual(0);
      expect(ibs[0]).toBeLessThanOrEqual(1);

      // Step 4: Run backtest
      const strategy = createStrategyFromTemplate({
        id: 'test',
        name: 'Test',
        description: 'Test',
        category: 'Test',
        defaultStrategy: {
          name: 'Test',
          description: 'Test',
          entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
          exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
          parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 }
        }
      }, 'test');

      const engine = new BacktestEngine(adjustedData, strategy);
      const result = engine.runBacktest();

      expect(result).toBeDefined();
      expect(result.equity).toHaveLength(adjustedData.length);
    });
  });

  describe('Multiple Indicators Integration', () => {
    it('should calculate multiple indicators correctly', () => {
      const data: OHLCData[] = [
        { date: '2023-12-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: '2023-12-02', open: 105, high: 115, low: 95, close: 110, volume: 1200 },
        { date: '2023-12-03', open: 110, high: 120, low: 100, close: 115, volume: 1100 },
        { date: '2023-12-04', open: 115, high: 125, low: 105, close: 120, volume: 1300 },
        { date: '2023-12-05', open: 120, high: 130, low: 110, close: 125, volume: 1400 }
      ];

      const closePrices = data.map(d => d.close);

      // Calculate all indicators
      const sma = IndicatorEngine.calculateSMA(closePrices, 3);
      const ema = IndicatorEngine.calculateEMA(closePrices, 3);
      const rsi = IndicatorEngine.calculateRSI(closePrices, 3);
      const ibs = IndicatorEngine.calculateIBS(data);

      // Verify all indicators have correct length
      expect(sma).toHaveLength(data.length);
      expect(ema).toHaveLength(data.length);
      expect(rsi).toHaveLength(data.length);
      expect(ibs).toHaveLength(data.length);

      // Verify indicator values are within expected ranges
      ibs.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle invalid data gracefully', () => {
      const invalidData = [
        { date: '2023-12-01', open: 100, high: 90, low: 110, close: 105, volume: 1000 } // high < low
      ];

      const strategy = createStrategyFromTemplate({
        id: 'test',
        name: 'Test',
        description: 'Test',
        category: 'Test',
        defaultStrategy: {
          name: 'Test',
          description: 'Test',
          entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
          exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
          parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 }
        }
      }, 'test');

      expect(() => {
        new BacktestEngine(invalidData, strategy);
      }).toThrow('Invalid data at index 0: high < low');
    });

    it('should handle empty data gracefully', () => {
      const strategy = createStrategyFromTemplate({
        id: 'test',
        name: 'Test',
        description: 'Test',
        category: 'Test',
        defaultStrategy: {
          name: 'Test',
          description: 'Test',
          entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
          exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
          parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 }
        }
      }, 'test');

      expect(() => {
        new BacktestEngine([], strategy);
      }).toThrow('Market data is required for backtesting');
    });

    it('should handle missing strategy gracefully', () => {
      const data: OHLCData[] = [
        { date: '2023-12-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 }
      ];

      expect(() => {
        new BacktestEngine(data, null as any);
      }).toThrow();
    });
  });
});
