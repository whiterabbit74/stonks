import { describe, expect, it, vi } from 'vitest';
import { prefetchAnalysisTab } from '../prefetch';

describe('prefetchAnalysisTab', () => {
  it('runs the mapped loader and ignores fallback', () => {
    const mapped = vi.fn();
    const fallback = vi.fn();
    prefetchAnalysisTab('buyhold', { buyhold: mapped }, fallback);
    expect(mapped).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('skips a tab mapped to null', () => {
    const fallback = vi.fn();
    prefetchAnalysisTab('summary', { summary: null }, fallback);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('uses fallback when the tab is not in the map', () => {
    const fallback = vi.fn();
    prefetchAnalysisTab('equity', { summary: null }, fallback);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
