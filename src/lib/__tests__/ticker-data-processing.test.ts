import { describe, expect, it } from 'vitest';
import { prepareTickerDataFromDataset } from '../ticker-data-processing';
import type { SavedDataset, SplitEvent } from '../../types';

function dataset(data: SavedDataset['data']): SavedDataset {
  return {
    name: 'TQQQ',
    ticker: 'TQQQ',
    data,
    uploadDate: '2026-05-31T00:00:00.000Z',
    dataPoints: data.length,
    dateRange: { from: data[0]?.date ?? '2025-08-28', to: data[data.length - 1]?.date ?? '2025-08-29' },
    adjustedForSplits: false,
  };
}

describe('ticker data processing', () => {
  const rawGapRows: SavedDataset['data'] = [
    { date: '2025-08-28', open: 91.28, high: 93.07, low: 90.88, close: 92.70, adjClose: 92.70, volume: 1000 },
    { date: '2025-08-29', open: 45.71, high: 45.795, low: 44.245, close: 44.68, adjClose: 44.68, volume: 121887000 },
  ];

  it('does not use auto-detected split-like gaps as working splits', () => {
    const prepared = prepareTickerDataFromDataset({
      ticker: 'TQQQ',
      dataset: dataset(rawGapRows),
      splits: [],
    });

    expect(prepared.splits).toEqual([]);
    expect(prepared.detectedSplits).toEqual([{ date: '2025-08-29', factor: 2 }]);
    expect(prepared.data.map((row) => ({ date: row.date, close: row.close }))).toEqual([
      { date: '2025-08-28', close: 92.70 },
      { date: '2025-08-29', close: 44.68 },
    ]);
  });

  it('uses only explicit manual splits for chart and holder-value data', () => {
    const splits: SplitEvent[] = [{ date: '2025-08-29', factor: 2 }];

    const prepared = prepareTickerDataFromDataset({
      ticker: 'TQQQ',
      dataset: dataset(rawGapRows),
      splits,
    });

    expect(prepared.splits).toEqual(splits);
    expect(prepared.data.map((row) => ({ date: row.date, close: row.close }))).toEqual([
      { date: '2025-08-28', close: 46.35 },
      { date: '2025-08-29', close: 44.68 },
    ]);
    expect(prepared.holderData?.map((row) => ({ date: row.date, close: row.close }))).toEqual([
      { date: '2025-08-28', close: 92.70 },
      { date: '2025-08-29', close: 89.36 },
    ]);
  });
});
