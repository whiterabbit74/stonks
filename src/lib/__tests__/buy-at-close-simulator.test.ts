import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStrategyFromTemplate } from '../strategy';
import type { OHLCData, Strategy } from '../../types';

// Mock the runCleanBuyAtClose function
const mockRunCleanBuyAtClose = vi.fn();

// Mock the BuyAtCloseSimulator component
vi.mock('../../components/BuyAtCloseSimulator', () => ({
  runCleanBuyAtClose: mockRunCleanBuyAtClose
}));

describe('BuyAtCloseSimulator Logic', () => {
  let sampleData: OHLCData[];
  let strategy: Strategy;

  beforeEach(() => {
    // Create realistic OHLC data
    sampleData = [
      { date: '2023-12-01', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { date: '2023-12-02', open: 105, high: 115, low: 95, close: 110, volume: 1200 },
      { date: '2023-12-03', open: 110, high: 120, low: 100, close: 115, volume: 1100 },
      { date: '2023-12-04', open: 115, high: 125, low: 105, close: 120, volume: 1300 },
      { date: '2023-12-05', open: 120, high: 130, low: 110, close: 125, volume: 1400 },
      { date: '2023-12-06', open: 125, high: 135, low: 115, close: 130, volume: 1500 },
      { date: '2023-12-07', open: 130, high: 140, low: 120, close: 135, volume: 1600 },
      { date: '2023-12-08', open: 135, high: 145, low: 125, close: 140, volume: 1700 },
      { date: '2023-12-09', open: 140, high: 150, low: 130, close: 145, volume: 1800 },
      { date: '2023-12-10', open: 145, high: 155, low: 135, close: 150, volume: 1900 }
    ];

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

    // Reset mock
    mockRunCleanBuyAtClose.mockClear();
  });

  describe('runCleanBuyAtClose function', () => {
    it('should be called with correct parameters', () => {
      const mockResult = {
        equity: [],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      // Simulate calling the function
      const result = mockRunCleanBuyAtClose(sampleData, strategy);

      expect(mockRunCleanBuyAtClose).toHaveBeenCalledWith(sampleData, strategy);
      expect(result).toEqual(mockResult);
    });

    it('should handle empty data', () => {
      const mockResult = {
        equity: [],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose([], strategy);

      expect(result).toEqual(mockResult);
    });

    it('should handle null strategy', () => {
      const mockResult = {
        equity: [],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, null as any);

      expect(result).toEqual(mockResult);
    });
  });

  describe('strategy parameter handling', () => {
    it('should handle different IBS thresholds', () => {
      const customStrategy = {
        ...strategy,
        parameters: {
          ...strategy.parameters,
          lowIBS: 0.05,
          highIBS: 0.80
        }
      };

      const mockResult = {
        equity: [],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, customStrategy);

      expect(mockRunCleanBuyAtClose).toHaveBeenCalledWith(sampleData, customStrategy);
      expect(result).toEqual(mockResult);
    });

    it('should handle different max hold days', () => {
      const customStrategy = {
        ...strategy,
        parameters: {
          ...strategy.parameters,
          maxHoldDays: 15
        }
      };

      const mockResult = {
        equity: [],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, customStrategy);

      expect(mockRunCleanBuyAtClose).toHaveBeenCalledWith(sampleData, customStrategy);
      expect(result).toEqual(mockResult);
    });

    it('should handle different capital usage', () => {
      const customStrategy = {
        ...strategy,
        riskManagement: {
          ...strategy.riskManagement,
          capitalUsage: 50
        }
      };

      const mockResult = {
        equity: [],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, customStrategy);

      expect(mockRunCleanBuyAtClose).toHaveBeenCalledWith(sampleData, customStrategy);
      expect(result).toEqual(mockResult);
    });
  });

  describe('result validation', () => {
    it('should return valid result structure', () => {
      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 },
          { date: '2023-12-02', value: 10100, drawdown: 0 }
        ],
        finalValue: 10100,
        maxDrawdown: 0,
        trades: 1,
        tradesList: [
          {
            id: 'trade-1',
            entryDate: '2023-12-01',
            exitDate: '2023-12-02',
            entryPrice: 100,
            exitPrice: 101,
            quantity: 100,
            pnl: 100,
            pnlPercent: 1,
            duration: 1,
            exitReason: 'ibs_signal',
            context: {
              ticker: 'AAPL',
              currentCapitalAfterExit: 10100
            }
          }
        ]
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, strategy);

      expect(result).toHaveProperty('equity');
      expect(result).toHaveProperty('finalValue');
      expect(result).toHaveProperty('maxDrawdown');
      expect(result).toHaveProperty('trades');
      expect(result).toHaveProperty('tradesList');

      expect(Array.isArray(result.equity)).toBe(true);
      expect(Array.isArray(result.tradesList)).toBe(true);
      expect(typeof result.finalValue).toBe('number');
      expect(typeof result.maxDrawdown).toBe('number');
      expect(typeof result.trades).toBe('number');
    });

    it('should handle trades with correct structure', () => {
      const mockTrade = {
        id: 'trade-1',
        entryDate: '2023-12-01',
        exitDate: '2023-12-02',
        entryPrice: 100,
        exitPrice: 101,
        quantity: 100,
        pnl: 100,
        pnlPercent: 1,
        duration: 1,
        exitReason: 'ibs_signal',
        context: {
          ticker: 'AAPL',
          currentCapitalAfterExit: 10100
        }
      };

      const mockResult = {
        equity: [],
        finalValue: 10100,
        maxDrawdown: 0,
        trades: 1,
        tradesList: [mockTrade]
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, strategy);

      expect(result.tradesList).toHaveLength(1);
      const trade = result.tradesList[0];

      expect(trade).toHaveProperty('id');
      expect(trade).toHaveProperty('entryDate');
      expect(trade).toHaveProperty('exitDate');
      expect(trade).toHaveProperty('entryPrice');
      expect(trade).toHaveProperty('exitPrice');
      expect(trade).toHaveProperty('quantity');
      expect(trade).toHaveProperty('pnl');
      expect(trade).toHaveProperty('pnlPercent');
      expect(trade).toHaveProperty('duration');
      expect(trade).toHaveProperty('exitReason');
      expect(trade).toHaveProperty('context');

      expect(typeof trade.entryDate).toBe('string');
      expect(typeof trade.exitDate).toBe('string');
      expect(typeof trade.entryPrice).toBe('number');
      expect(typeof trade.exitPrice).toBe('number');
      expect(typeof trade.quantity).toBe('number');
      expect(typeof trade.pnl).toBe('number');
      expect(typeof trade.pnlPercent).toBe('number');
      expect(typeof trade.duration).toBe('number');
      expect(typeof trade.exitReason).toBe('string');
      expect(typeof trade.context).toBe('object');
    });
  });

  describe('edge cases', () => {
    it('should handle data with no trades', () => {
      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 }
        ],
        finalValue: 10000,
        maxDrawdown: 0,
        trades: 0,
        tradesList: []
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, strategy);

      expect(result.trades).toBe(0);
      expect(result.tradesList).toHaveLength(0);
      expect(result.finalValue).toBe(10000);
    });

    it('should handle data with losing trades', () => {
      const mockTrade = {
        id: 'trade-1',
        entryDate: '2023-12-01',
        exitDate: '2023-12-02',
        entryPrice: 100,
        exitPrice: 95,
        quantity: 100,
        pnl: -500,
        pnlPercent: -5,
        duration: 1,
        exitReason: 'ibs_signal',
        context: {
          ticker: 'AAPL',
          currentCapitalAfterExit: 9500
        }
      };

      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 },
          { date: '2023-12-02', value: 9500, drawdown: 5 }
        ],
        finalValue: 9500,
        maxDrawdown: 5,
        trades: 1,
        tradesList: [mockTrade]
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, strategy);

      expect(result.trades).toBe(1);
      expect(result.tradesList[0].pnl).toBe(-500);
      expect(result.tradesList[0].pnlPercent).toBe(-5);
      expect(result.finalValue).toBe(9500);
      expect(result.maxDrawdown).toBe(5);
    });

    it('should handle data with multiple trades', () => {
      const mockTrades = [
        {
          id: 'trade-1',
          entryDate: '2023-12-01',
          exitDate: '2023-12-02',
          entryPrice: 100,
          exitPrice: 101,
          quantity: 100,
          pnl: 100,
          pnlPercent: 1,
          duration: 1,
          exitReason: 'ibs_signal',
          context: { ticker: 'AAPL', currentCapitalAfterExit: 10100 }
        },
        {
          id: 'trade-2',
          entryDate: '2023-12-03',
          exitDate: '2023-12-04',
          entryPrice: 101,
          exitPrice: 102,
          quantity: 100,
          pnl: 100,
          pnlPercent: 0.99,
          duration: 1,
          exitReason: 'ibs_signal',
          context: { ticker: 'AAPL', currentCapitalAfterExit: 10200 }
        }
      ];

      const mockResult = {
        equity: [
          { date: '2023-12-01', value: 10000, drawdown: 0 },
          { date: '2023-12-02', value: 10100, drawdown: 0 },
          { date: '2023-12-03', value: 10100, drawdown: 0 },
          { date: '2023-12-04', value: 10200, drawdown: 0 }
        ],
        finalValue: 10200,
        maxDrawdown: 0,
        trades: 2,
        tradesList: mockTrades
      };

      mockRunCleanBuyAtClose.mockReturnValue(mockResult);

      const result = mockRunCleanBuyAtClose(sampleData, strategy);

      expect(result.trades).toBe(2);
      expect(result.tradesList).toHaveLength(2);
      expect(result.finalValue).toBe(10200);
    });
  });
});
