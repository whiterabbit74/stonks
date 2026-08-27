import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMultiTickerData } from '../useMultiTickerData';

vi.mock('../../lib/api', () => ({
  DatasetAPI: { getDataset: vi.fn(), getSplits: vi.fn() },
}));

vi.mock('../../components/ui', () => ({
  useToastActions: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

describe('useMultiTickerData: isDataOutdated', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setNowUTC(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it('treats a missing date as outdated', () => {
    setNowUTC('2024-11-20T15:00:00.000Z');
    const { result } = renderHook(() => useMultiTickerData());
    expect(result.current.isDataOutdated(undefined)).toBe(true);
  });

  it('allows a gap of two calendar days', () => {
    setNowUTC('2024-11-20T15:00:00.000Z'); // 20 Nov in New York
    const { result } = renderHook(() => useMultiTickerData());

    expect(result.current.isDataOutdated('2024-11-20')).toBe(false);
    expect(result.current.isDataOutdated('2024-11-18')).toBe(false);
    expect(result.current.isDataOutdated('2024-11-17')).toBe(true);
  });

  it('uses the exchange day, not the machine one', () => {
    // 02:00 UTC on 20 Nov is still 19 Nov in New York, so a bar from the 17th
    // is exactly two days back and must not be reported as outdated
    setNowUTC('2024-11-20T02:00:00.000Z');
    const { result } = renderHook(() => useMultiTickerData());

    expect(result.current.isDataOutdated('2024-11-17')).toBe(false);
    expect(result.current.isDataOutdated('2024-11-16')).toBe(true);
  });
});
