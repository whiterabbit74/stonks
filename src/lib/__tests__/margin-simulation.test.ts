import { describe, it, expect } from 'vitest';
import type { OHLCData, Trade } from '../../types';
import { simulateMarginByTrades } from '../margin-simulation';

function createTrade(
  id: string,
  entryDate: string,
  exitDate: string,
  entryPrice: number,
  exitPrice: number
): Trade {
  return {
    id,
    entryDate,
    exitDate,
    entryPrice,
    exitPrice,
    quantity: 1,
    pnl: 0,
    pnlPercent: 0,
    duration: 0,
    exitReason: 'ibs_signal',
  };
}

describe('simulateMarginByTrades', () => {
  it('liquidates by maintenance margin and continues simulation', () => {
    const marketData: OHLCData[] = [
      { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 101, low: 60, close: 62, volume: 1000 },
      { date: '2024-01-03', open: 62, high: 64, low: 58, close: 60, volume: 1000 },
      { date: '2024-01-04', open: 60, high: 63, low: 59, close: 61, volume: 1000 },
    ];

    const trades: Trade[] = [
      createTrade('t1', '2024-01-01', '2024-01-03', 100, 110),
      createTrade('t2', '2024-01-03', '2024-01-04', 60, 61),
    ];

    const result = simulateMarginByTrades({
      marketData,
      trades,
      initialCapital: 10000,
      leverage: 2,
      maintenanceMarginPct: 25,
      capitalUsagePct: 100,
    });

    expect(result.liquidationEvent).not.toBeNull();
    expect(result.maintenanceLiquidationEvents).toHaveLength(1);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].exitReason).toBe('margin_liquidation');
    expect(result.trades[0].exitDate).toBe('2024-01-02');
    expect(result.trades[0].exitPrice).toBeCloseTo(66.666666, 4);
    expect(result.trades[1].id).toBe('t2');
    expect(result.trades[1].exitDate).toBe('2024-01-04');
  });

  it('calculates liquidation threshold according to leverage and maintenance margin', () => {
    const marketData: OHLCData[] = [
      { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 101, low: 66.5, close: 67, volume: 1000 },
      { date: '2024-01-03', open: 67, high: 70, low: 66.8, close: 69, volume: 1000 },
    ];

    const trades: Trade[] = [
      createTrade('t1', '2024-01-01', '2024-01-03', 100, 105),
    ];

    const result = simulateMarginByTrades({
      marketData,
      trades,
      initialCapital: 10000,
      leverage: 2,
      maintenanceMarginPct: 25,
      capitalUsagePct: 100,
    });

    expect(result.liquidationEvent).not.toBeNull();
    expect(result.maintenanceLiquidationEvents).toHaveLength(1);
    expect(result.liquidationEvent?.type).toBe('maintenance_margin');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('margin_liquidation');
    expect(result.trades[0].exitDate).toBe('2024-01-02');
    expect(result.trades[0].exitPrice).toBeCloseTo(66.666666, 4);
    expect(result.liquidationEvent?.positionDropPct).toBeCloseTo(33.333333, 3);
  });

  it('does not liquidate when drawdown is above threshold', () => {
    const marketData: OHLCData[] = [
      { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 103, low: 75, close: 90, volume: 1000 },
      { date: '2024-01-03', open: 90, high: 110, low: 88, close: 105, volume: 1000 },
    ];

    const trades: Trade[] = [
      createTrade('t1', '2024-01-01', '2024-01-03', 100, 105),
    ];

    const result = simulateMarginByTrades({
      marketData,
      trades,
      initialCapital: 10000,
      leverage: 2,
      maintenanceMarginPct: 25,
      capitalUsagePct: 100,
    });

    expect(result.liquidationEvent).toBeNull();
    expect(result.maintenanceLiquidationEvents).toHaveLength(0);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('ibs_signal');
    expect(result.trades[0].exitDate).toBe('2024-01-03');
  });
});
