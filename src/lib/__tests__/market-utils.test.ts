import { afterEach, describe, expect, it, vi } from 'vitest';
import { getIsMarketOpen, hasCalendarDateEntry, type TradingCalendarData } from '../market-utils';

// 2026-07-08 is a Wednesday; New York is on EDT (UTC-4) in July.
// 14:00 UTC = 10:00 ET (open), 13:00 UTC = 09:00 ET (pre-open),
// 20:30 UTC = 16:30 ET (post-close), 17:00 UTC = 13:00 ET.

afterEach(() => {
  vi.useRealTimers();
});

function at(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('getIsMarketOpen', () => {
  it('is open during regular weekday hours', () => {
    at('2026-07-08T14:00:00Z'); // 10:00 ET Wed
    expect(getIsMarketOpen()).toBe(true);
  });

  it('is closed before the open and after the close', () => {
    at('2026-07-08T13:00:00Z'); // 09:00 ET
    expect(getIsMarketOpen()).toBe(false);
    at('2026-07-08T20:30:00Z'); // 16:30 ET
    expect(getIsMarketOpen()).toBe(false);
  });

  it('is closed at exactly 16:00 ET', () => {
    at('2026-07-08T20:00:00Z'); // 16:00 ET
    expect(getIsMarketOpen()).toBe(false);
  });

  it('is closed on weekends', () => {
    at('2026-07-11T14:00:00Z'); // Saturday 10:00 ET
    expect(getIsMarketOpen()).toBe(false);
  });

  it('is closed on a calendar holiday even during regular hours', () => {
    at('2026-07-08T14:00:00Z'); // 10:00 ET
    const calendar: TradingCalendarData = { holidays: { '2026': { '07-08': { name: 'Test holiday' } } } };
    expect(getIsMarketOpen(calendar)).toBe(false);
    // …but open without the calendar (fallback ignores holidays).
    expect(getIsMarketOpen()).toBe(true);
  });

  it('closes early on a short (half) day', () => {
    const calendar: TradingCalendarData = {
      shortDays: { '2026': { '07-08': { name: 'Half day' } } },
      tradingHours: { normal: { start: '09:30', end: '16:00' }, short: { start: '09:30', end: '13:00' } },
    };
    at('2026-07-08T16:00:00Z'); // 12:00 ET — before the early close
    expect(getIsMarketOpen(calendar)).toBe(true);
    at('2026-07-08T17:00:00Z'); // 13:00 ET — at the early close
    expect(getIsMarketOpen(calendar)).toBe(false);
    // Without the calendar, the same 13:00 ET moment is still within regular hours.
    expect(getIsMarketOpen()).toBe(true);
  });
});

describe('hasCalendarDateEntry', () => {
  it('matches both year→MM-DD and flat YYYY-MM-DD keyings', () => {
    expect(hasCalendarDateEntry({ '2026': { '07-08': {} } }, 2026, 7, 8)).toBe(true);
    expect(hasCalendarDateEntry({ '2026-07-08': {} }, 2026, 7, 8)).toBe(true);
    expect(hasCalendarDateEntry({ '2026': { '07-09': {} } }, 2026, 7, 8)).toBe(false);
    expect(hasCalendarDateEntry(undefined, 2026, 7, 8)).toBe(false);
  });
});
