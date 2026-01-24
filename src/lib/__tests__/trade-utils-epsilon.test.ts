import { describe, it, expect } from 'vitest';
import type { OptionTrade } from '../optionsBacktest';
import { calculateTradeStats } from '../trade-utils';

describe('Trade Statistics Calculation with Epsilon', () => {
  // Mock trades with various PnL scenarios
  const trades: OptionTrade[] = [
    { pnl: 100 } as OptionTrade,       // Clear Win
    { pnl: -100 } as OptionTrade,      // Clear Loss
    { pnl: 0 } as OptionTrade,         // Breakeven (Exact)
    { pnl: 0.000001 } as OptionTrade,  // Noise Win (Should be ignored)
    { pnl: -0.000001 } as OptionTrade, // Noise Loss (Should be ignored)
  ];

  it('correctly ignores floating point noise when calculating wins and losses', () => {
    const stats = calculateTradeStats(trades);

    // calculateTradeStats now uses epsilon of 0.01
    expect(stats.wins).toBe(1); // Only the clear win
    expect(stats.losses).toBe(1); // Only the clear loss
    expect(stats.winRate).toBe(20); // 1 win out of 5 trades = 20%
    expect(stats.breakeven).toBe(3); // 1 exact zero + 2 noise trades
  });
});
