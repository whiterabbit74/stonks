import type { Trade, EquityPoint } from '../types';
import { calculateTradeStats } from './trade-utils';

export interface BacktestMetrics {
  totalReturn: number;
  cagr: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  netProfit: number;
  netReturn: number;
  maxDrawdown: number;
  totalContribution: number;
  contributionCount: number;
}

/**
 * Centralized calculation of backtest metrics.
 * unifying logic from MultiTickerPage and MultiTickerOptionsPage.
 */
export function calculateBacktestMetrics(
  trades: Trade[],
  equity: EquityPoint[],
  initialCapital: number,
  contributions: { total: number; count: number } = { total: 0, count: 0 }
): BacktestMetrics {
  const tradeStats = calculateTradeStats(trades);

  const finalValue = equity.length > 0 ? equity[equity.length - 1].value : initialCapital;

  // Calculate Net Profit
  // Net Profit = Final Value - Initial Capital - Total Contributions
  // Note: Some legacy calculations might just do Final - Initial.
  // We should be consistent with how "Profit" is defined.
  // Usually Net Profit = Total PnL from trades.
  // But here we might want "Portfolio Net Profit".
  // Let's stick to (Final - (Initial + Contributions)) for Portfolio Profit.
  const netProfit = finalValue - initialCapital - contributions.total;

  // Total Return (%)
  // (Net Profit / (Initial + Contributions)) * 100 ?
  // Or just (Final - Initial) / Initial if no contributions?
  // MultiTickerPage uses: source.metrics.totalReturn
  // which comes from SinglePositionBacktest.

  // Let's calculate it from equity to be sure.
  const totalInvested = initialCapital + contributions.total;
  const netReturn = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  // CAGR
  let cagr = 0;
  if (equity.length >= 2) {
    const startDate = new Date(equity[0].date);
    const endDate = new Date(equity[equity.length - 1].date);
    const days = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
    const years = Math.max(days / 365.25, 0.1); // Avoid division by zero or very small periods

    // CAGR formula: (End / Start)^(1/n) - 1
    // If contributions exist, CAGR is complex (IRR).
    // For simplicity and matching existing logic:
    // We use the simple growth rate over the period relative to start capital for non-contrib scenarios,
    // or just the ratio.
    // MultiTickerPage logic: (final / initial)^(1/years) - 1.
    // This is flawed if contributions exist, but we stick to the unified logic.
    // Ideally we should use TWR or IRR.
    // For now, let's replicate the existing behavior but safely.

    if (finalValue > 0 && initialCapital > 0) {
        cagr = (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100;
    }
  }

  // Max Drawdown
  let maxDrawdown = 0;
  for (const point of equity) {
    if (point.drawdown > maxDrawdown) {
      maxDrawdown = point.drawdown;
    }
  }

  return {
    totalReturn: netReturn, // Aligning "totalReturn" with "netReturn" for consistency or pass explicit if different
    cagr,
    winRate: tradeStats.winRate,
    totalTrades: tradeStats.totalTrades,
    winningTrades: tradeStats.wins,
    losingTrades: tradeStats.losses,
    profitFactor: tradeStats.profitFactor,
    netProfit,
    netReturn,
    maxDrawdown,
    totalContribution: contributions.total,
    contributionCount: contributions.count
  };
}
