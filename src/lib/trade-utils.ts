import type { Trade } from '../types';

export function calculateTradeStats(trades: Trade[] = []) {
  const totalTrades = trades.length;
  let wins = 0;
  let losses = 0;
  let totalPnL = 0;
  let totalDuration = 0;

  trades.forEach(trade => {
    const pnl = trade.pnl ?? 0;
    // Use epsilon to ignore floating point noise
    if (pnl > 0.01) wins += 1;
    else if (pnl < -0.01) losses += 1;
    totalPnL += pnl;
    totalDuration += trade.duration ?? 0;
  });

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgDuration = totalTrades > 0 ? totalDuration / totalTrades : 0;

  return {
    totalTrades,
    wins,
    losses,
    breakeven: totalTrades - wins - losses,
    totalPnL,
    winRate,
    avgDuration
  };
}
