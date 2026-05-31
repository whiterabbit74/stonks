import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const require = createRequire(import.meta.url);

describe('market data integrity guard', () => {
  const {
    evaluatePriceIntegrity,
    formatIntegrityWarningBlock,
    validateOhlcMergeIntegrity,
  } = require(path.join(serverRoot, 'src/services/marketDataIntegrity.js'));

  it('allows normal price movement', () => {
    const result = evaluatePriceIntegrity({
      symbol: 'TQQQ',
      previousBar: { date: '2026-05-05', close: 70 },
      currentPrice: 71.57,
      currentDate: '2026-05-06',
      adjustedForSplits: true,
    });

    expect(result.ok).toBe(true);
    expect(result.blockSignals).toBe(false);
  });

  it('blocks split-like movement when no manual split exists', () => {
    const result = evaluatePriceIntegrity({
      symbol: 'TQQQ',
      previousBar: { date: '2025-08-28', close: 92.7 },
      currentPrice: 44.68,
      currentDate: '2025-08-29',
      knownSplits: [],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(false);
    expect(result.blockSignals).toBe(true);
    expect(result.code).toBe('possible_split_or_mixed_adjustment');
    expect(result.matchedFactor).toBe(2);
    expect(result.telegramLines.join('\n')).toContain('TQQQ');
    expect(result.telegramLines.join('\n')).toContain('x2.07');
  });

  it('allows a known manual split boundary for raw data', () => {
    const result = evaluatePriceIntegrity({
      symbol: 'TQQQ',
      previousBar: { date: '2025-11-19', close: 90 },
      currentPrice: 45,
      currentDate: '2025-11-20',
      knownSplits: [{ date: '2025-11-20', factor: 2 }],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(true);
    expect(result.blockSignals).toBe(false);
    expect(result.knownSplitBoundary).toBe(true);
  });

  it('blocks a known split boundary when dataset claims it is already split-adjusted', () => {
    const result = evaluatePriceIntegrity({
      symbol: 'TQQQ',
      previousBar: { date: '2025-11-19', close: 90 },
      currentPrice: 45,
      currentDate: '2025-11-20',
      knownSplits: [{ date: '2025-11-20', factor: 2 }],
      adjustedForSplits: true,
    });

    expect(result.ok).toBe(false);
    expect(result.blockSignals).toBe(true);
    expect(result.code).toBe('adjusted_dataset_split_gap');
  });

  it('formats Telegram warning as a separate recognizable block', () => {
    const warning = evaluatePriceIntegrity({
      symbol: 'TQQQ',
      previousBar: { date: '2025-08-28', close: 92.7 },
      currentPrice: 44.68,
      currentDate: '2025-08-29',
      knownSplits: [],
      adjustedForSplits: false,
    });

    const text = formatIntegrityWarningBlock([warning]);

    expect(text).toContain('ПРОВЕРКА ДАННЫХ');
    expect(text).toContain('TQQQ');
    expect(text).toContain('EMA/IBS сигналы заблокированы');
  });

  it('blocks a refresh merge that would create a mixed-basis split-like gap', () => {
    const result = validateOhlcMergeIntegrity({
      symbol: 'TQQQ',
      existingRows: [
        { date: '2025-08-27', open: 90.14, high: 91.40, low: 89.41, close: 91.04, volume: 1000 },
        { date: '2025-08-28', open: 91.28, high: 93.07, low: 90.88, close: 92.70, volume: 1000 },
      ],
      incomingRows: [
        { date: '2025-08-29', open: 45.71, high: 45.795, low: 44.245, close: 44.68, volume: 121887000 },
      ],
      knownSplits: [],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(false);
    expect(result.blockWrite).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('possible_split_or_mixed_adjustment');
    expect(result.warnings[0].previousDate).toBe('2025-08-28');
    expect(result.warnings[0].currentDate).toBe('2025-08-29');
  });

  it('allows a refresh merge across an explicit raw split boundary', () => {
    const result = validateOhlcMergeIntegrity({
      symbol: 'TQQQ',
      existingRows: [
        { date: '2025-11-19', open: 98.65, high: 101.3, low: 96.5, close: 100.05, volume: 1000 },
      ],
      incomingRows: [
        { date: '2025-11-20', open: 52.95, high: 54.1, low: 45.5, close: 46.45, volume: 1000 },
      ],
      knownSplits: [{ date: '2025-11-20', factor: 2 }],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(true);
    expect(result.blockWrite).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('allows a refresh merge across an explicit raw 20:1 split boundary', () => {
    const result = validateOhlcMergeIntegrity({
      symbol: 'GOOGL',
      existingRows: [
        { date: '2022-07-15', open: 2250, high: 2260, low: 2210, close: 2235.55, volume: 1000 },
      ],
      incomingRows: [
        { date: '2022-07-18', open: 112.64, high: 114, low: 110, close: 109.03, volume: 1000 },
      ],
      knownSplits: [{ date: '2022-07-18', factor: 20 }],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(true);
    expect(result.blockWrite).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('allows a refresh merge across an explicit raw reverse split boundary even with market movement', () => {
    const result = validateOhlcMergeIntegrity({
      symbol: 'MSTR',
      existingRows: [
        { date: '2002-07-30', open: 0.49, high: 0.5, low: 0.46, close: 0.48, volume: 1000 },
      ],
      incomingRows: [
        { date: '2002-07-31', open: 5.75, high: 6.00, low: 5.50, close: 5.84, volume: 1000 },
      ],
      knownSplits: [{ date: '2002-07-31', factor: 0.1 }],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(true);
    expect(result.blockWrite).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('blocks a refresh merge across a split boundary when the dataset is already adjusted', () => {
    const result = validateOhlcMergeIntegrity({
      symbol: 'TQQQ',
      existingRows: [
        { date: '2025-11-19', open: 98.65, high: 101.3, low: 96.5, close: 100.05, volume: 1000 },
      ],
      incomingRows: [
        { date: '2025-11-20', open: 52.95, high: 54.1, low: 45.5, close: 46.45, volume: 1000 },
      ],
      knownSplits: [{ date: '2025-11-20', factor: 2 }],
      adjustedForSplits: true,
    });

    expect(result.ok).toBe(false);
    expect(result.blockWrite).toBe(true);
    expect(result.warnings[0].code).toBe('adjusted_dataset_split_gap');
  });

  it('does not block a new refresh because of an old untouched historical crash', () => {
    const result = validateOhlcMergeIntegrity({
      symbol: 'AAPL',
      existingRows: [
        { date: '2000-09-28', open: 54.5, high: 55, low: 53, close: 53.50, volume: 1000 },
        { date: '2000-09-29', open: 28.19, high: 30, low: 25, close: 25.75, volume: 1000 },
        { date: '2026-05-05', open: 200, high: 202, low: 198, close: 201, volume: 1000 },
      ],
      incomingRows: [
        { date: '2026-05-06', open: 202, high: 204, low: 201, close: 203, volume: 1000 },
      ],
      knownSplits: [],
      adjustedForSplits: false,
    });

    expect(result.ok).toBe(true);
    expect(result.blockWrite).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });
});
