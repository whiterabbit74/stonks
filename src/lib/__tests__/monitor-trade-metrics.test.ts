import { describe, it, expect } from 'vitest';
import { calculateMonitorTradeMetrics } from '../monitor-trade-metrics';
import type { MonitorTradeRecord } from '../../types';

function createTrade(id: string, pnlPercent: number | null, status: 'open' | 'closed', exitDate = '2026-01-01'): MonitorTradeRecord {
  return {
    id,
    symbol: 'TEST',
    status,
    entryDate: '2025-12-01',
    exitDate,
    entryPrice: 100,
    exitPrice: status === 'closed' ? 100 + ((pnlPercent ?? 0) / 100) * 100 : null,
    entryIBS: 0.1,
    exitIBS: status === 'closed' ? 0.8 : null,
    entryDecisionTime: `${exitDate}T15:49:00.000Z`,
    exitDecisionTime: status === 'closed' ? `${exitDate}T15:59:00.000Z` : null,
    pnlPercent,
    pnlAbsolute: pnlPercent == null ? null : pnlPercent,
    holdingDays: 3,
  };
}

describe('calculateMonitorTradeMetrics', () => {
  it('returns zeroed metrics when there are no completed trades', () => {
    const metrics = calculateMonitorTradeMetrics([createTrade('open-1', null, 'open')], 10000);

    expect(metrics.closedTradesCount).toBe(0);
    expect(metrics.finalBalance).toBe(10000);
    expect(metrics.totalReturnPct).toBe(0);
    expect(metrics.winRatePct).toBe(0);
    expect(metrics.maxDrawdownPct).toBe(0);
    expect(metrics.avgHoldingDays).toBe(0);
  });

  it('calculates compounded balance and returns from closed trades', () => {
    const trades = [
      createTrade('t1', 10, 'closed', '2026-01-01'),
      createTrade('t2', -5, 'closed', '2026-01-02'),
      createTrade('t3', 20, 'closed', '2026-01-03'),
    ];

    const metrics = calculateMonitorTradeMetrics(trades, 10000);

    expect(metrics.closedTradesCount).toBe(3);
    expect(metrics.finalBalance).toBeCloseTo(12540, 5);
    expect(metrics.netProfit).toBeCloseTo(2540, 5);
    expect(metrics.totalReturnPct).toBeCloseTo(25.4, 5);
    expect(metrics.sumReturnPct).toBeCloseTo(25, 5);
    expect(metrics.avgReturnPct).toBeCloseTo(8.333333, 5);
    expect(metrics.avgHoldingDays).toBeCloseTo(3, 5);
    expect(metrics.winRatePct).toBeCloseTo(66.666666, 5);
    expect(metrics.maxDrawdownPct).toBeCloseTo(5, 5);
    expect(metrics.profitFactor).toBeCloseTo(6, 5);
  });

  it('ignores open trades and invalid pnl values in calculations', () => {
    const trades = [
      createTrade('t1', 5, 'closed', '2026-01-01'),
      createTrade('t2', null, 'closed', '2026-01-02'),
      createTrade('t3', -2, 'closed', '2026-01-03'),
      createTrade('open-1', null, 'open', '2026-01-04'),
    ];

    const metrics = calculateMonitorTradeMetrics(trades, 10000);

    expect(metrics.closedTradesCount).toBe(2);
    expect(metrics.totalReturnPct).toBeCloseTo(2.9, 5); // 1.05 * 0.98 = 1.029
    expect(metrics.avgHoldingDays).toBeCloseTo(3, 5);
    expect(metrics.winCount).toBe(1);
    expect(metrics.lossCount).toBe(1);
  });
});
