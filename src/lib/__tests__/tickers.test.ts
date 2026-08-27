import { describe, expect, it } from 'vitest';
import { getDefaultTickers } from '../tickers';

describe('getDefaultTickers', () => {
  it('uses the hardcoded fallback when the store value is empty', () => {
    expect(getDefaultTickers()).toEqual(['AAPL', 'MSFT', 'AMZN', 'MAGS']);
    expect(getDefaultTickers('')).toEqual(['AAPL', 'MSFT', 'AMZN', 'MAGS']);
    expect(getDefaultTickers(null)).toEqual(['AAPL', 'MSFT', 'AMZN', 'MAGS']);
  });

  it('splits, trims, uppercases and drops empty parts', () => {
    expect(getDefaultTickers('aapl, msft,, amzn')).toEqual(['AAPL', 'MSFT', 'AMZN']);
  });
});
