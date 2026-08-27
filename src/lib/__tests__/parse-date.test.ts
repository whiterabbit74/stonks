import { describe, it, expect } from 'vitest';
import { parseDate } from '../validation';
import { toTradingDate } from '../date-utils';

// toTradingDate reads the UTC parts of a Date, so parseDate must anchor calendar
// dates at midday UTC — a local midnight shifts the day in every positive offset.
function tradingDateOf(input: string): string {
  const result = parseDate(input);
  expect(result.isValid).toBe(true);
  return toTradingDate(result.date!);
}

describe('parseDate', () => {
  it('keeps the calendar day for ISO dates', () => {
    expect(tradingDateOf('2024-11-17')).toBe('2024-11-17');
    expect(tradingDateOf('2024-11-17T00:00:00')).toBe('2024-11-17');
    expect(tradingDateOf('2024-11-17T00:00:00Z')).toBe('2024-11-17');
  });

  it('keeps the calendar day for US-format dates', () => {
    expect(tradingDateOf('11/17/2024')).toBe('2024-11-17');
    expect(tradingDateOf('1/2/2024')).toBe('2024-01-02');
  });

  it('anchors parsed dates at midday UTC', () => {
    const result = parseDate('11/17/2024');
    expect(result.date!.getUTCHours()).toBe(12);
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseDate('13/45/2024').isValid).toBe(false);
    expect(parseDate('2024-02-30').isValid).toBe(false);
    expect(parseDate('not a date').isValid).toBe(false);
    expect(parseDate('').isValid).toBe(false);
  });
});
