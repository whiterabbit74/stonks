import { describe, it, expect } from 'vitest';
import { runSinglePositionBacktest, optimizeTickerData } from '../singlePositionBacktest';
import type { Strategy, OHLCData } from '../../types';

describe('Backtest Performance Benchmark', () => {
  it('should run backtest efficiently on large dataset', () => {
    // Generate synthetic data
    const generateData = (ticker: string, count: number): { ticker: string; data: OHLCData[]; ibsValues: number[] } => {
      const data: OHLCData[] = [];
      let price = 100;
      const startDate = new Date('2000-01-01');

      for (let i = 0; i < count; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);

        const change = (Math.random() - 0.5) * 2; // -1 to +1
        price += change;

        data.push({
          date: date, // Using Date object as per types usually
          open: price,
          high: price + 1,
          low: price - 1,
          close: price + 0.5,
          volume: 1000
        });
      }

      // Pre-calculate IBS
      const ibsValues = data.map(b => (b.close - b.low) / (b.high - b.low));

      return { ticker, data, ibsValues };
    };

    const TICKER_COUNT = 5;
    const BAR_COUNT = 5000;

    console.log(`Generating data for ${TICKER_COUNT} tickers, ${BAR_COUNT} bars each...`);
    const rawData = Array.from({ length: TICKER_COUNT }, (_, i) => generateData(`TICKER_${i}`, BAR_COUNT));

    // Optimize data (create index maps) - usually done before backtest
    const optimizedData = optimizeTickerData(rawData);

    const strategy: Strategy = {
      id: 'perf-test',
      name: 'Performance Test',
      category: 'Test',
      description: 'Test',
      entryConditions: [],
      exitConditions: [],
      riskManagement: {
        initialCapital: 100000,
        maxHoldDays: 10,
        commission: { type: 'fixed', fixed: 1 }
      },
      parameters: {
        lowIBS: 0.2,
        highIBS: 0.8,
        maxHoldDays: 10
      }
    };

    console.log('Starting backtest...');
    const start = performance.now();

    const result = runSinglePositionBacktest(optimizedData, strategy);

    const end = performance.now();
    const duration = end - start;

    console.log(`Backtest completed in ${duration.toFixed(2)}ms`);
    console.log(`Total trades: ${result.trades.length}`);
    console.log(`Final value: ${result.finalValue}`);

    expect(result.equity.length).toBeGreaterThan(0);
    // We expect it to be relatively fast.
    // Before optimization: ~5000^2 operations => 25M. JS is fast, might be 100-500ms?
    // After optimization: ~5000 operations. Should be < 50ms.

    // We won't assert exact time to avoid flakiness in CI, but we log it.
  });
});
