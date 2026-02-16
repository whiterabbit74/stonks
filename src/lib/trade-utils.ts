import type { Trade } from '../types';

export const TRADE_PNL_EPSILON = 0.01;

export function calculateTradeStats(trades: Trade[] = []) {
  const totalTrades = trades.length;
  let wins = 0;
  let losses = 0;
  let totalPnL = 0;
  let totalDuration = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  trades.forEach(trade => {
    const pnl = trade.pnl ?? 0;

    // Win/Loss and gross P/L use the same epsilon to keep metrics consistent.
    if (pnl > TRADE_PNL_EPSILON) {
      wins += 1;
      grossProfit += pnl;
    } else if (pnl < -TRADE_PNL_EPSILON) {
      losses += 1;
      grossLoss += Math.abs(pnl);
    }

    // Accumulators
    totalPnL += pnl;
    totalDuration += trade.duration ?? 0;
  });

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgDuration = totalTrades > 0 ? totalDuration / totalTrades : 0;

  // Profit Factor Calculation
  // If grossLoss is 0:
  //   - if grossProfit > 0, PF is Infinity
  //   - if grossProfit <= 0, PF is 0 (no activity or only breakeven)
  const profitFactor = grossLoss !== 0
    ? grossProfit / grossLoss
    : (grossProfit > 0 ? Infinity : 0);

  return {
    totalTrades,
    wins,
    losses,
    breakeven: totalTrades - wins - losses,
    totalPnL,
    grossProfit,
    grossLoss,
    profitFactor,
    winRate,
    avgDuration
  };
}
