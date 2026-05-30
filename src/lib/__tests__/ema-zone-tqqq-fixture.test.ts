import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OHLCData } from '../../types';
import { runEmaZoneBacktest } from '../ema-zone-strategy';

const fixturePath = process.env.TQQQ_EMA200_RELATIVE_CSV;

function parseFixture(csvPath: string): OHLCData[] {
  const [headerLine, ...lines] = readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
  const headers = headerLine.split(',');
  const indexOf = (name: string) => {
    const index = headers.indexOf(name);
    if (index < 0) throw new Error(`Missing ${name} column in ${csvPath}`);
    return index;
  };
  const dateIndex = indexOf('date');
  const rawCloseIndex = indexOf('raw_close');
  const holderPriceIndex = indexOf('holder_value_price');

  return lines.map((line) => {
    const columns = line.split(',');
    const close = Number(columns[holderPriceIndex]);
    const rawClose = Number(columns[rawCloseIndex]);
    const splitFactor = rawClose > 0 ? close / rawClose : undefined;
    return {
      date: columns[dateIndex],
      open: close,
      high: close,
      low: close,
      close,
      rawClose,
      splitFactor,
      priceBasis: 'holder_value',
      volume: 0,
    } satisfies OHLCData;
  });
}

describe.skipIf(!fixturePath || !existsSync(fixturePath))('TQQQ EMA200 fixture verification', () => {
  it('matches the audited 15-to-40 close-signal trade chain', () => {
    const data = parseFixture(fixturePath as string);
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 200,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-15', levelPct: 15, enabled: true }],
        sellZones: [{ id: 'sell-40', levelPct: 40, enabled: true }],
      }
    );

    expect(result.trades).toHaveLength(17);
    expect(result.finalValue).toBeCloseTo(9766459.19, 2);
    expect(result.trades.map((trade) => `${trade.entryDate}->${trade.exitDate}`)).toContain('2020-09-23->2020-10-12');

    const firstTrade = result.trades[0];
    expect(firstTrade.entryDate).toBe('2011-03-15');
    expect(firstTrade.exitDate).toBe('2012-03-13');
    expect(firstTrade.context?.currentCapitalAfterExit).toBeCloseTo(14623.08, 2);

    const missedRegressionTrade = result.trades.find((trade) => trade.entryDate === '2020-09-23');
    expect(missedRegressionTrade).toBeDefined();
    expect(missedRegressionTrade?.exitDate).toBe('2020-10-12');
    expect(missedRegressionTrade?.pnl).toBeCloseTo(263948.81, 2);
    expect(missedRegressionTrade?.context?.currentCapitalAfterExit).toBeCloseTo(981836.11, 2);

    const lastTrade = result.trades.at(-1);
    expect(lastTrade?.entryDate).toBe('2025-11-18');
    expect(lastTrade?.exitDate).toBe('2026-05-06');
    expect(lastTrade?.quantity).toBeCloseTo(355.3652, 4);
    expect(lastTrade?.pnl).toBeCloseTo(3055344.72, 2);
    expect(lastTrade?.context?.currentCapitalAfterExit).toBeCloseTo(9766459.19, 2);
  });
});
