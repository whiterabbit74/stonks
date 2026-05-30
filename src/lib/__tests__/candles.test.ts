import { describe, expect, it } from 'vitest';
import type { OHLCData } from '../../types';
import { aggregateOhlcToWeekly, mapDateToAggregatedBarTime } from '../candles';

function candle(date: string, open: number, high: number, low: number, close: number, volume = 100): OHLCData {
  return { date, open, high, low, close, volume };
}

describe('candle aggregation helpers', () => {
  it('aggregates daily OHLC bars into last-trading-day weekly bars', () => {
    const weekly = aggregateOhlcToWeekly([
      candle('2024-01-02', 100, 105, 98, 101, 10),
      candle('2024-01-03', 101, 110, 99, 109, 20),
      candle('2024-01-05', 109, 112, 107, 108, 30),
      candle('2024-01-08', 108, 115, 106, 114, 40),
      candle('2024-01-09', 114, 116, 111, 112, 50),
    ]);

    expect(weekly).toEqual([
      candle('2024-01-05', 100, 112, 98, 108, 60),
      candle('2024-01-09', 108, 116, 106, 112, 90),
    ]);
  });

  it('maps a daily trade date to the containing weekly bar date', () => {
    const weekly = aggregateOhlcToWeekly([
      candle('2024-01-02', 100, 105, 98, 101),
      candle('2024-01-03', 101, 110, 99, 109),
      candle('2024-01-05', 109, 112, 107, 108),
    ]);

    expect(mapDateToAggregatedBarTime('2024-01-03', 'weekly', weekly)).toBe('2024-01-05');
    expect(mapDateToAggregatedBarTime('2024-01-03', 'daily', weekly)).toBe('2024-01-03');
  });
});
