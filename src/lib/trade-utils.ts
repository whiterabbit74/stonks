import type { Trade } from '../types';

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

    // Win/Loss counting with epsilon
    if (pnl > 0.01) wins += 1;
    else if (pnl < -0.01) losses += 1;

    // Accumulators
    totalPnL += pnl;
    totalDuration += trade.duration ?? 0;

    // Gross Profit/Loss
    if (pnl > 0) {
      grossProfit += pnl;
    } else {
      grossLoss += Math.abs(pnl);
    }
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
