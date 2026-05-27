import { describe, expect, it } from 'vitest';
import type { OHLCData, Strategy } from '../../types';
import {
  optimizeTickerData,
  runSinglePositionBacktest,
  type TickerDataWithIndex,
} from '../singlePositionBacktest';

function bar(date: string, open: number, high: number, low: number, close: number): OHLCData {
  return { date, open, high, low, close, volume: 1000 };
}

function ibs(data: OHLCData[]): number[] {
  return data.map((item) => {
    const range = item.high - item.low;
    return range > 0 ? (item.close - item.low) / range : 0.5;
  });
}

function tickerData(ticker: string, data: OHLCData[]): TickerDataWithIndex[] {
  return optimizeTickerData([{ ticker, data, ibsValues: ibs(data) }]);
}

function strategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: 'ibs-mean-reversion',
    name: 'IBS Mean Reversion',
    description: 'Test strategy',
    type: 'ibs-mean-reversion',
    parameters: {
      lowIBS: 0.1,
      highIBS: 0.75,
      maxHoldDays: 30,
    },
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
    ...overrides,
  };
}

describe('runSinglePositionBacktest take-profit exits', () => {
  it('exits at the exact take-profit target when the daily high reaches it', () => {
    const data = [
      bar('2024-01-01', 101, 112, 99, 100),
      bar('2024-01-02', 100, 104, 100, 103.8),
    ];

    const result = runSinglePositionBacktest(
      tickerData('AAPL', data),
      strategy(),
      1,
      { allowSameDayReentry: true, takeProfitPercent: 3 }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('take_profit');
    expect(result.trades[0].entryPrice).toBe(100);
    expect(result.trades[0].exitPrice).toBe(103);
    expect(result.trades[0].pnl).toBe(300);
    expect(result.trades[0].pnlPercent).toBe(3);
    expect(result.finalValue).toBe(10300);
  });

  it('does not use the entry candle high to trigger take-profit after entering at the close', () => {
    const data = [
      bar('2024-01-01', 99, 110, 99, 100),
      bar('2024-01-02', 100, 104, 99, 100),
      bar('2024-01-03', 100, 106, 100, 101),
    ];

    const result = runSinglePositionBacktest(
      tickerData('AAPL', data),
      strategy(),
      1,
      { allowSameDayReentry: true, takeProfitPercent: 5 }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryDate).toBe('2024-01-01');
    expect(result.trades[0].exitDate).toBe('2024-01-03');
    expect(result.trades[0].exitReason).toBe('take_profit');
    expect(result.trades[0].exitPrice).toBe(105);
  });

  it('keeps the existing IBS exit behavior when take-profit is not configured', () => {
    const data = [
      bar('2024-01-01', 101, 112, 99, 100),
      bar('2024-01-02', 100, 104, 100, 103.8),
    ];

    const result = runSinglePositionBacktest(
      tickerData('AAPL', data),
      strategy(),
      1,
      { allowSameDayReentry: true }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('ibs_signal');
    expect(result.trades[0].exitPrice).toBe(103.8);
    expect(result.trades[0].pnl).toBeCloseTo(380);
    expect(result.finalValue).toBeCloseTo(10380);
  });
});
