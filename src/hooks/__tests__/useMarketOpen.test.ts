import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetAPI } from '../../lib/api';
import { getIsMarketOpen } from '../../lib/market-utils';
import { useMarketOpen } from '../useMarketOpen';

vi.mock('../../lib/api', () => ({
  DatasetAPI: {
    getTradingCalendar: vi.fn(),
  },
}));

vi.mock('../../lib/market-utils', () => ({
  getIsMarketOpen: vi.fn(() => false),
}));

describe('useMarketOpen', () => {
  beforeEach(() => {
    vi.mocked(DatasetAPI.getTradingCalendar).mockResolvedValue({
      holidays: {},
      shortDays: {},
    });
    vi.mocked(getIsMarketOpen).mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns the current getIsMarketOpen snapshot', async () => {
    vi.mocked(getIsMarketOpen).mockReturnValue(true);
    const { result } = renderHook(() => useMarketOpen(60_000));
    expect(result.current).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it('re-evaluates on the poll interval', () => {
    vi.useFakeTimers();
    vi.mocked(getIsMarketOpen).mockReturnValue(false);

    const { result } = renderHook(() => useMarketOpen(1_000));
    expect(result.current).toBe(false);

    vi.mocked(getIsMarketOpen).mockReturnValue(true);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('clears the interval on unmount', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useMarketOpen(5_000));

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
