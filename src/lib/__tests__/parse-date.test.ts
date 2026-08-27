import { describe, it, expect } from 'vitest';
import { parseDate } from '../validation';

// Дата бара — календарный день биржи, поэтому parseDate обязан возвращать
// 'YYYY-MM-DD' и не зависеть от таймзоны машины, на которой открыт браузер.
describe('parseDate', () => {
  it('returns the trading date as a plain YYYY-MM-DD string', () => {
    expect(parseDate('2024-11-17').date).toBe('2024-11-17');
    expect(parseDate('2024-11-17T00:00:00').date).toBe('2024-11-17');
    expect(parseDate('2024-11-17T00:00:00Z').date).toBe('2024-11-17');
    expect(typeof parseDate('2024-11-17').date).toBe('string');
  });

  it('keeps the calendar day for US-format dates', () => {
    expect(parseDate('11/17/2024').date).toBe('2024-11-17');
    expect(parseDate('1/2/2024').date).toBe('2024-01-02');
  });

  it('reads European day-first dates', () => {
    expect(parseDate('17.11.2024').date).toBe('2024-11-17');
    expect(parseDate('1.2.2024').date).toBe('2024-02-01');
  });

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseDate('2024-02-30').isValid).toBe(false);
    expect(parseDate('13/45/2024').isValid).toBe(false);
    expect(parseDate('2023-02-29').isValid).toBe(false);
    expect(parseDate('not a date').isValid).toBe(false);
    expect(parseDate('').isValid).toBe(false);
  });

  it('accepts a leap day in a leap year', () => {
    expect(parseDate('2024-02-29').date).toBe('2024-02-29');
  });
});
