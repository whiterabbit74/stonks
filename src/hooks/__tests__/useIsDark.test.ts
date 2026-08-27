import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsDark } from '../useIsDark';

describe('useIsDark', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('initialises from the documentElement dark class', () => {
    document.documentElement.classList.add('dark');
    const { result } = renderHook(() => useIsDark());
    expect(result.current).toBe(true);
  });

  it('updates from a themechange CustomEvent and falls back to the class list', () => {
    const { result } = renderHook(() => useIsDark());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('themechange', { detail: { effectiveDark: true } })
      );
    });
    expect(result.current).toBe(true);

    document.documentElement.classList.add('dark');
    act(() => {
      window.dispatchEvent(new CustomEvent('themechange'));
    });
    expect(result.current).toBe(true);

    document.documentElement.classList.remove('dark');
    act(() => {
      window.dispatchEvent(
        new CustomEvent('themechange', { detail: { effectiveDark: false } })
      );
    });
    expect(result.current).toBe(false);
  });

  it('removes the themechange listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useIsDark());

    const attached = addSpy.mock.calls.find((call) => call[0] === 'themechange');
    expect(attached).toBeTruthy();

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('themechange', attached?.[1]);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
