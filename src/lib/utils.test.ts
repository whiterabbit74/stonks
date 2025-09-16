import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OHLCData, SplitEvent } from '../types';
import {
  adjustOHLCForSplits,
  arraysEqual,
  clamp,
  cn,
  daysBetween,
  debounce,
  dedupeDailyOHLC,
  deepClone,
  formatCurrency,
  formatDate,
  formatOHLCYMD,
  formatPercentage,
  generateId,
  getDeviceType,
  getOptimalChartHeight,
  getSafeAreaInsets,
  isLandscape,
  isMobile,
  isTablet,
  isTouchDevice,
  isValidNumber,
  parseOHLCDate,
  prefersReducedMotion,
  roundTo,
  safeParseFloat,
  safeParseInt,
  throttle,
  toTitleCase,
} from './utils';

function createBar(partial: Partial<OHLCData> & { date: Date }): OHLCData {
  return {
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    ...partial,
  };
}

describe('parseOHLCDate', () => {
  it('normalizes YYYY-MM-DD strings to midday UTC', () => {
    const result = parseOHLCDate('2024-01-05');
    expect(result.toISOString()).toBe('2024-01-05T12:00:00.000Z');
  });

  it('normalizes Date instances to midday UTC based on their UTC calendar day', () => {
    const input = new Date('2024-01-05T23:45:00-05:00');
    const result = parseOHLCDate(input);
    expect(result.toISOString()).toBe('2024-01-06T12:00:00.000Z');
  });

  it('throws a descriptive error for invalid values', () => {
    expect(() => parseOHLCDate('not-a-date')).toThrowError(
      'Unable to parse date from value: not-a-date',
    );
  });
});

describe('formatOHLCYMD', () => {
  it('returns the YYYY-MM-DD representation of a date using UTC fields', () => {
    const date = new Date(Date.UTC(2024, 0, 5, 12, 0, 0));
    expect(formatOHLCYMD(date)).toBe('2024-01-05');
  });
});

describe('adjustOHLCForSplits', () => {
  const baseData: OHLCData[] = [
    createBar({
      date: parseOHLCDate('2024-01-10'),
      open: 100,
      high: 108,
      low: 97,
      close: 105,
      adjClose: 106,
      volume: 900,
    }),
    createBar({
      date: parseOHLCDate('2024-01-20'),
      open: 120,
      high: 130,
      low: 115,
      close: 125,
      adjClose: 126,
      volume: 1100,
    }),
  ];

  it('adjusts historical prices before a split and scales volume', () => {
    const splits: SplitEvent[] = [
      { date: '2024-01-15', factor: 3 },
    ];

    const adjusted = adjustOHLCForSplits(baseData, splits);

    expect(adjusted).toHaveLength(2);
    expect(adjusted[0]).toMatchObject({
      open: 33.333333,
      high: 36,
      low: 32.333333,
      close: 35,
      adjClose: 35.333333,
      volume: 2700,
    });

    expect(adjusted[1]).toMatchObject({
      open: 120,
      high: 130,
      low: 115,
      close: 125,
      adjClose: 126,
      volume: 1100,
    });
  });

  it('returns original series when no splits are provided', () => {
    const adjusted = adjustOHLCForSplits(baseData, []);
    expect(adjusted).toEqual(baseData);
  });
});

describe('dedupeDailyOHLC', () => {
  it('combines multiple bars per day while keeping chronological order', () => {
    const series: OHLCData[] = [
      createBar({
        date: new Date('2024-03-11T18:00:00.000Z'),
        open: 102,
        high: 112,
        low: 101,
        close: 110,
        volume: 150,
      }),
      createBar({
        date: new Date('2024-03-10T15:00:00.000Z'),
        open: 100,
        high: 105,
        low: 95,
        close: 101,
        volume: 50,
      }),
      createBar({
        date: new Date('2024-03-10T20:00:00.000Z'),
        open: 101,
        high: 108,
        low: 94,
        close: 107,
        volume: 75,
        adjClose: 108,
      }),
    ];

    const result = dedupeDailyOHLC(series);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      open: 100,
      high: 108,
      low: 94,
      close: 107,
      volume: 125,
      adjClose: 108,
    });
    expect(result[0].date.toISOString()).toBe('2024-03-10T12:00:00.000Z');
    expect(result[1]).toMatchObject({
      open: 102,
      high: 112,
      low: 101,
      close: 110,
      volume: 150,
    });
  });
});

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    const result = cn('px-2', 'text-white', ['py-4', null], { hidden: false, block: true }, 'px-4');
    expect(result).toBe('text-white py-4 block px-4');
  });
});

describe('format helpers', () => {
  it('formats currency with two decimals by default', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(50, 'EUR')).toBe('€50.00');
  });

  it('formats percentages with the provided precision', () => {
    expect(formatPercentage(0.1234)).toBe('12.34%');
    expect(formatPercentage(0.1234, 1)).toBe('12.3%');
  });

  it('formats dates in short and long form using en-US locale', () => {
    const date = new Date(Date.UTC(2024, 0, 5, 12));
    expect(formatDate(date)).toBe('1/5/2024');
    expect(formatDate(date, 'long')).toBe('January 5, 2024');
  });
});

describe('math helpers', () => {
  it('computes days between dates rounding up partial days', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-10T10:00:00Z');
    expect(daysBetween(start, end)).toBe(10);
    expect(daysBetween(end, start)).toBe(10);
  });

  it('clamps numbers within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('provides safe parsing helpers and numeric predicates', () => {
    expect(safeParseFloat('42.5')).toBe(42.5);
    expect(safeParseFloat('abc', 1.5)).toBe(1.5);
    expect(safeParseInt('10')).toBe(10);
    expect(safeParseInt(undefined, 3)).toBe(3);
    expect(isValidNumber(10)).toBe(true);
    expect(isValidNumber(NaN)).toBe(false);
    expect(roundTo(1.2345, 2)).toBe(1.23);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes the wrapped function after the wait and exposes cancel', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    const cancellable = debounced as typeof debounced & { cancel: () => void };

    cancellable('first');
    vi.advanceTimersByTime(50);
    cancellable('second');
    vi.advanceTimersByTime(90);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');

    cancellable('third');
    cancellable.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('limits how frequently the wrapped function can run', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    const cancellable = throttled as typeof throttled & { cancel: () => void };

    cancellable('one');
    cancellable('two');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('one');

    vi.advanceTimersByTime(100);
    cancellable('three');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('three');

    cancellable.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('generateId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('combines random entropy with timestamp', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    expect(generateId()).toBe('4fzzzxjylrxloyw3v28');
  });
});

describe('string helpers', () => {
  it('converts strings to title case', () => {
    expect(toTitleCase('hello wORLD')).toBe('Hello World');
  });
});

describe('deepClone', () => {
  it('creates deep copies of nested structures', () => {
    const original = {
      count: 1,
      nested: { value: 2 },
      list: [1, { label: 'a' }],
      when: new Date('2024-01-05T00:00:00Z'),
    };

    const cloned = deepClone(original);

    expect(cloned).not.toBe(original);
    expect(cloned).toEqual(original);
    (cloned.nested as { value: number }).value = 5;
    (cloned.list[1] as { label: string }).label = 'b';
    expect(original.nested.value).toBe(2);
    expect((original.list[1] as { label: string }).label).toBe('a');
    expect(cloned.when).not.toBe(original.when);
    expect(cloned.when.getTime()).toBe(original.when.getTime());
  });
});

describe('arraysEqual', () => {
  it('performs shallow equality checks', () => {
    expect(arraysEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(arraysEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(arraysEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });
});

describe('responsive helpers', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  const originalTouchPoints = (navigator as any).maxTouchPoints;
  const originalTouchStart = (window as any).ontouchstart;

  afterEach(() => {
    window.innerWidth = originalWidth;
    window.innerHeight = originalHeight;
    if (originalTouchPoints !== undefined) {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: originalTouchPoints,
        configurable: true,
        writable: true,
      });
    } else {
      delete (navigator as any).maxTouchPoints;
    }

    if (originalTouchStart === undefined) {
      delete (window as any).ontouchstart;
    } else {
      (window as any).ontouchstart = originalTouchStart;
    }
  });

  it('detects device size breakpoints', () => {
    window.innerWidth = 500;
    expect(isMobile()).toBe(true);
    expect(isTablet()).toBe(false);
    expect(getDeviceType()).toBe('mobile');

    window.innerWidth = 1000;
    expect(isMobile()).toBe(false);
    expect(isTablet()).toBe(true);
    expect(getDeviceType()).toBe('tablet');

    window.innerWidth = 1600;
    expect(isTablet()).toBe(false);
    expect(getDeviceType()).toBe('desktop');
  });

  it('computes optimal chart heights and orientation', () => {
    window.innerHeight = 900;
    expect(getOptimalChartHeight('mobile')).toBe(300);
    expect(getOptimalChartHeight('tablet')).toBe(400);
    expect(getOptimalChartHeight('desktop')).toBe(500);

    window.innerWidth = 1200;
    window.innerHeight = 800;
    expect(isLandscape()).toBe(true);

    window.innerWidth = 700;
    window.innerHeight = 900;
    expect(isLandscape()).toBe(false);
  });

  it('detects touch capabilities', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
    delete (window as any).ontouchstart;
    expect(isTouchDevice()).toBe(false);

    Object.defineProperty(window, 'ontouchstart', { value: () => {}, configurable: true, writable: true });
    expect(isTouchDevice()).toBe(true);

    delete (window as any).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 2, configurable: true, writable: true });
    expect(isTouchDevice()).toBe(true);
  });
});

describe('environment helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads safe area insets from computed styles', () => {
    const styleMap: Record<string, string> = {
      'env(safe-area-inset-top)': '10px',
      'env(safe-area-inset-right)': '5px',
      'env(safe-area-inset-bottom)': '15px',
      'env(safe-area-inset-left)': '8px',
    };

    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => styleMap[prop] ?? '0px',
    } as unknown as CSSStyleDeclaration);

    expect(getSafeAreaInsets()).toEqual({ top: 10, right: 5, bottom: 15, left: 8 });
  });

  it('respects reduced motion media queries', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);

    expect(prefersReducedMotion()).toBe(true);
    expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });
});
