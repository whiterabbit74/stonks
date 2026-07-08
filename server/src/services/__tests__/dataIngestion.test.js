import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const require = createRequire(import.meta.url);

describe('data ingestion guard', () => {
  const {
    evaluateDatasetPayloadIntegrity,
    normalizeFetchedRows,
  } = require(path.join(serverRoot, 'src/services/dataIngestion.js'));

  it('normalizes provider rows into canonical OHLC rows', () => {
    const rows = normalizeFetchedRows([
      { date: '2026-05-06T12:00:00.000Z', open: '70', high: '72', low: '69', close: '71.57', volume: '123' },
      { date: 'bad', open: 'x', high: '72', low: '69', close: '71.57', volume: '123' },
    ]);

    expect(rows).toEqual([
      { date: '2026-05-06', open: 70, high: 72, low: 69, close: 71.57, adjClose: 71.57, volume: 123 },
    ]);
  });

  it('flags (without blocking) a full dataset upload when split-like gaps have no explicit split', () => {
    const result = evaluateDatasetPayloadIntegrity({
      symbol: 'TQQQ',
      payload: {
        adjustedForSplits: false,
        data: [
          { date: '2025-08-28', open: 91.28, high: 93.07, low: 90.88, close: 92.70, volume: 1000 },
          { date: '2025-08-29', open: 45.71, high: 45.79, low: 44.24, close: 44.68, volume: 1000 },
        ],
      },
      knownSplits: [],
    });

    // No throw: the write proceeds, but a warning is surfaced for Telegram review.
    expect(result.ok).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ symbol: 'TQQQ', previousDate: '2025-08-28', currentDate: '2025-08-29' });
  });

  it('allows full dataset upload when split-like gaps have explicit splits', () => {
    const result = evaluateDatasetPayloadIntegrity({
      symbol: 'V',
      payload: {
        adjustedForSplits: false,
        data: [
          { date: '2015-03-18', open: 264.09, high: 267.98, low: 259.01, close: 267.67, volume: 1000 },
          { date: '2015-03-19', open: 66.83, high: 67.19, low: 65.75, close: 66.81, volume: 1000 },
        ],
      },
      knownSplits: [{ date: '2015-03-19', factor: 4 }],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
