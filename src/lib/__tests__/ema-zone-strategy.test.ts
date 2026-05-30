import { describe, expect, it } from 'vitest';
import type { OHLCData } from '../../types';
import { runEmaZoneBacktest } from '../ema-zone-strategy';

function bar(date: string, close: number): OHLCData {
  return { date, open: close, high: close, low: close, close, volume: 1000 };
}

describe('runEmaZoneBacktest', () => {
  it('does not trade before the first full EMA period is available', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 90),
        bar('2024-01-03', 90),
        bar('2024-01-04', 130),
      ] }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-15', levelPct: 15, enabled: true }],
        sellZones: [],
      }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryDate).toBe('2024-01-03');
    expect(result.trades[0].exitReason).toBe('end_of_data');
  });

  it('buys each enabled buy zone with an equal capital share and sells by sell zone', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 80),
        bar('2024-01-05', 130),
      ] }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [
          { id: 'buy-5', levelPct: -5, enabled: true },
          { id: 'buy-10', levelPct: -10, enabled: true },
        ],
        sellZones: [{ id: 'sell-15', levelPct: 15, enabled: true }],
      }
    );

    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => trade.quantity)).toEqual([62.5, 62.5]);
    expect(result.trades.every((trade) => trade.entryDate === '2024-01-04')).toBe(true);
    expect(result.trades.every((trade) => trade.exitDate === '2024-01-05')).toBe(true);
    expect(result.equity.find((point) => point.date === '2024-01-04')?.value).toBe(10000);
    expect(result.finalValue).toBe(16250);
  });

  it('keeps equity equal to cash plus position value minus borrowed debt for leveraged EMA lots', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 80),
      ] }],
      {
        initialCapital: 10000,
        leverage: 3,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-10', levelPct: -10, enabled: true }],
        sellZones: [],
      }
    );

    expect(result.equity.find((point) => point.date === '2024-01-04')?.value).toBe(10000);
    expect(result.exposure.find((point) => point.date === '2024-01-04')?.positionValue).toBe(30000);
    expect(result.exposure.find((point) => point.date === '2024-01-04')?.exposurePct).toBe(300);
    expect(result.finalValue).toBe(10000);
  });

  it('sells equal original shares across multiple sell zones and closes the rounding remainder on the last zone', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 80),
        bar('2024-01-05', 150),
      ] }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-10', levelPct: -10, enabled: true }],
        sellZones: [
          { id: 'sell-10', levelPct: 10, enabled: true },
          { id: 'sell-20', levelPct: 20, enabled: true },
        ],
      }
    );

    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => trade.quantity)).toEqual([62.5, 62.5]);
    expect(result.trades.map((trade) => trade.exitReason)).toEqual(['ema_sell_10', 'ema_sell_20']);
    expect(result.finalValue).toBe(18750);
  });

  it('does not close a losing lot when noSellAtLoss is enabled', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 80),
        bar('2024-01-05', 70),
      ] }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: true,
        buyZones: [{ id: 'buy-10', levelPct: -10, enabled: true }],
        sellZones: [{ id: 'sell-loss', levelPct: -25, enabled: true }],
      }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('end_of_data');
    expect(result.trades[0].exitPrice).toBe(70);
  });

  it('uses take profit before EMA sell zones', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 80),
        { date: '2024-01-05', open: 82, high: 88, low: 81, close: 82, volume: 1000 },
      ] }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: 10,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-10', levelPct: -10, enabled: true }],
        sellZones: [{ id: 'sell-15', levelPct: 15, enabled: true }],
      }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('take_profit');
    expect(result.trades[0].exitPrice).toBe(88);
  });

  it('uses continuous holder-value prices for EMA signals and PnL while preserving raw close display prices', () => {
    const result = runEmaZoneBacktest(
      [{
        ticker: 'TQQQ',
        data: [
          { ...bar('2024-01-01', 200), rawClose: 200, priceBasis: 'holder_value' },
          { ...bar('2024-01-02', 200), rawClose: 200, priceBasis: 'holder_value' },
          { ...bar('2024-01-03', 200), rawClose: 200, priceBasis: 'holder_value' },
          { ...bar('2024-01-04', 100), rawClose: 50, splitFactor: 2, priceBasis: 'holder_value' },
          { ...bar('2024-01-05', 150), rawClose: 75, splitFactor: 2, priceBasis: 'holder_value' },
        ],
      }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-20', levelPct: -20, enabled: true }],
        sellZones: [{ id: 'sell-0', levelPct: 0, enabled: true }],
      }
    );

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryPrice).toBe(100);
    expect(result.trades[0].exitPrice).toBe(150);
    expect(result.trades[0].quantity).toBe(100);
    expect(result.trades[0].pnl).toBe(5000);
    expect(result.finalValue).toBe(15000);
    expect(result.trades[0].context).toMatchObject({
      priceBasis: 'holder_value',
      priceBasisLabel: 'Индексная цена с учетом сплитов',
      quantityBasis: 'index_units',
      entryRawClose: 50,
      exitRawClose: 75,
      entryIndexPrice: 100,
      exitIndexPrice: 150,
    });
  });

  it('re-enters the same buy zone after a full sell cycle and records capital after each exit', () => {
    const result = runEmaZoneBacktest(
      [{ ticker: 'TQQQ', data: [
        bar('2024-01-01', 100),
        bar('2024-01-02', 100),
        bar('2024-01-03', 100),
        bar('2024-01-04', 400),
        bar('2024-01-05', 100),
        bar('2024-01-06', 450),
      ] }],
      {
        initialCapital: 10000,
        leverage: 1,
        emaPeriod: 3,
        signalSource: 'close',
        takeProfitPercent: null,
        noSellAtLoss: false,
        buyZones: [{ id: 'buy-15', levelPct: 15, enabled: true }],
        sellZones: [{ id: 'sell-40', levelPct: 40, enabled: true }],
      }
    );

    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => `${trade.entryDate}->${trade.exitDate}`)).toEqual([
      '2024-01-03->2024-01-04',
      '2024-01-05->2024-01-06',
    ]);
    expect(result.trades.map((trade) => trade.context?.currentCapitalAfterExit)).toEqual([
      40000,
      180000,
    ]);
    expect(result.finalValue).toBe(180000);
  });
});
