import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { isIbsEntrySignal, isIbsExitSignal } = require(
  path.join(process.cwd(), 'server/src/utils/ibsSignals.js')
);

describe('IBS signal thresholds', () => {
  it('does not enter on an IBS exactly at the threshold', () => {
    // high=100, low=90, close=91 -> IBS = 0.10 exactly; the backtest uses ibs < lowIBS
    expect(isIbsEntrySignal(0.1, 0.1)).toBe(false);
    expect(isIbsEntrySignal(0.0999, 0.1)).toBe(true);
  });

  it('does not exit on an IBS exactly at the threshold', () => {
    // high=100, low=90, close=97.5 -> IBS = 0.75 exactly; the backtest uses ibs > highIBS
    expect(isIbsExitSignal(0.75, 0.75)).toBe(false);
    expect(isIbsExitSignal(0.7501, 0.75)).toBe(true);
  });

  it('falls back to the default thresholds', () => {
    expect(isIbsEntrySignal(0.05, undefined)).toBe(true);
    expect(isIbsEntrySignal(0.15, null)).toBe(false);
    expect(isIbsExitSignal(0.8, undefined)).toBe(true);
  });

  it('ignores non-numeric IBS values', () => {
    expect(isIbsEntrySignal(null, 0.1)).toBe(false);
    expect(isIbsEntrySignal(NaN, 0.1)).toBe(false);
    expect(isIbsExitSignal('0.9', 0.75)).toBe(false);
  });
});
