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
  it('closes by position stop-loss and continues simulation', () => {
    const marketData: OHLCData[] = [
      { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 101, low: 79, close: 90, volume: 1000 },
      { date: '2024-01-03', open: 90, high: 92, low: 88, close: 91, volume: 1000 },
      { date: '2024-01-04', open: 100, high: 103, low: 98, close: 101, volume: 1000 },
      { date: '2024-01-05', open: 101, high: 106, low: 100, close: 105, volume: 1000 },
    ];

    const trades: Trade[] = [
      createTrade('t1', '2024-01-01', '2024-01-03', 100, 110),
      createTrade('t2', '2024-01-04', '2024-01-05', 100, 105),
    ];

    const result = simulateMarginByTrades({
      marketData,
      trades,
      initialCapital: 10000,
      leverage: 1.25,
      positionStopLossPct: 20,
      maintenanceMarginPct: 25,
      capitalUsagePct: 100,
    });

    expect(result.positionStopEvents).toHaveLength(1);
    expect(result.liquidationEvent).toBeNull();
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].exitReason).toBe('position_stop_loss');
    expect(result.trades[0].exitDate).toBe('2024-01-02');
    expect(result.trades[0].exitPrice).toBeCloseTo(80, 6);
    expect(result.trades[1].id).toBe('t2');
    expect(result.trades[1].exitDate).toBe('2024-01-05');
  });

  it('liquidates by maintenance margin and stops further calculation', () => {
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
      positionStopLossPct: 60,
      maintenanceMarginPct: 25,
      stopAfterMaintenanceLiquidation: true,
      capitalUsagePct: 100,
    });

    expect(result.positionStopEvents).toHaveLength(0);
    expect(result.liquidationEvent).not.toBeNull();
    expect(result.maintenanceLiquidationEvents).toHaveLength(1);
    expect(result.liquidationEvent?.type).toBe('maintenance_margin');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('margin_liquidation');
    expect(result.trades[0].exitDate).toBe('2024-01-02');
    expect(result.equity).toHaveLength(2);
  });

  it('continues simulation after maintenance liquidation when stop is disabled', () => {
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
      positionStopLossPct: 60,
      maintenanceMarginPct: 25,
      stopAfterMaintenanceLiquidation: false,
      capitalUsagePct: 100,
    });

    expect(result.liquidationEvent).not.toBeNull();
    expect(result.maintenanceLiquidationEvents).toHaveLength(1);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].exitReason).toBe('margin_liquidation');
    expect(result.trades[1].id).toBe('t2');
    expect(result.equity).toHaveLength(4);
  });

  it('uses first reached threshold when both are crossed on the same bar', () => {
    const marketData: OHLCData[] = [
      { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 101, low: 60, close: 62, volume: 1000 },
      { date: '2024-01-03', open: 62, high: 70, low: 61, close: 68, volume: 1000 },
    ];

    const trades: Trade[] = [
      createTrade('t1', '2024-01-01', '2024-01-03', 100, 105),
    ];

    const result = simulateMarginByTrades({
      marketData,
      trades,
      initialCapital: 10000,
      leverage: 2,
      positionStopLossPct: 20,
      maintenanceMarginPct: 25,
      capitalUsagePct: 100,
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitReason).toBe('position_stop_loss');
    expect(result.trades[0].exitPrice).toBeCloseTo(80, 6);
    expect(result.positionStopEvents).toHaveLength(1);
    expect(result.liquidationEvent).toBeNull();
  });
});
