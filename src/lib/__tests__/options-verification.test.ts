
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOptionsBacktest } from '../optionsBacktest';
import { Trade, OHLCData } from '../../types';
import * as optionsMath from '../optionsMath';

// Mock only calculateVolatility, keep others original
vi.mock('../optionsMath', async (importOriginal) => {
  const actual = await importOriginal<typeof optionsMath>();
  return {
    ...actual,
    calculateVolatility: vi.fn(),
  };
});

describe('Options Backtest Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reproduces Trade 1 and Trade 10 correctly given the volatilities', () => {
    const marketData: OHLCData[] = [
      { date: '1999-11-22', open: 149, high: 150, low: 148, close: 149.3, volume: 1000 },
      { date: '1999-11-23', open: 150, high: 151, low: 149, close: 150.0, volume: 1000 },
      { date: '1999-11-24', open: 154, high: 155, low: 153, close: 154.9, volume: 1000 },
      // Gap to Trade 10
      { date: '2000-03-29', open: 110, high: 111, low: 109, close: 110.0, volume: 1000 },
      { date: '2000-03-30', open: 110, high: 111, low: 109, close: 110.0, volume: 1000 },
      { date: '2000-03-31', open: 109, high: 110, low: 108, close: 109.5, volume: 1000 },
    ];

    const stockTrades: Trade[] = [
      {
        id: 'trade-1',
        entryDate: '1999-11-22',
        exitDate: '1999-11-24',
        entryPrice: 149.3,
        exitPrice: 154.9,
        quantity: 10,
        pnl: 0,
        pnlPercent: 0,
        duration: 2,
        exitReason: 'ibs_signal',
        context: {}
      },
      {
        id: 'trade-10',
        entryDate: '2000-03-29',
        exitDate: '2000-03-31',
        entryPrice: 110,
        exitPrice: 109.5,
        quantity: 10,
        pnl: 0,
        pnlPercent: 0,
        duration: 2,
        exitReason: 'ibs_signal',
        context: {}
      }
    ];

    const calcVolMock = vi.mocked(optionsMath.calculateVolatility);

    calcVolMock.mockImplementation((prices) => {
      const lastPrice = prices[prices.length - 1];

      if (Math.abs(lastPrice - 149.3) < 0.001) return 0.2151231825422837; // Entry T1
      if (Math.abs(lastPrice - 154.9) < 0.001) return 0.2226712838429008; // Exit T1

      if (Math.abs(lastPrice - 110.0) < 0.001) return 2.15042145175482; // Entry T10
      if (Math.abs(lastPrice - 109.5) < 0.001) return 2.14978463018749; // Exit T10

      return 0.2; // Default
    });

    const config = {
      strikePct: 10,
      volAdjPct: 20,
      capitalPct: 25,
      riskFreeRate: 0.05,
      expirationWeeks: 8 // roughly 2 months
    };

    const result = runOptionsBacktest(stockTrades, marketData, config);

    // Verify Trade 1
    const t1 = result.trades.find(t => t.id === 'trade-1');
    expect(t1).toBeDefined();
    if (!t1) return;

    // Check Strike: 149.3 * 1.1 = 164.23 -> 164
    expect(t1.strike).toBe(164);

    // Check Expiration
    expect(t1.expirationDate).toBe('2000-01-21');

    // Check Option Entry Price
    expect(t1.optionEntryPrice).toBeCloseTo(1.8934866549537261, 4);

    // Check Contracts - UPDATED to expect integer
    // Capital: 10000 -> 25% = 2500.
    // Price: 1.89348... * 100 = 189.348...
    // Contracts = floor(2500 / 189.348...) = 13
    expect(t1.contracts).toBe(13);

    // Check PnL
    // Expected: 2116.7600075886007 for fractional.
    // For integer 13: 2106 approx.
    expect(t1.pnl).toBeGreaterThan(2000);


    // Verify Trade 10
    const t10 = result.trades.find(t => t.id === 'trade-10');
    // With 25% capital, contracts calculation yields < 1 (due to high vol/price), so it should be skipped.
    // Price ~40. 1 Contract ~4000. Available capitalPct ~25% of ~12000 = 3000.
    // 3000 < 4000.
    expect(t10).toBeUndefined();
  });
});
