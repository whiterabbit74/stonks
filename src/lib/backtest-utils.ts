import type { EquityPoint } from '../types';

/**
 * Simulates leverage on equity curve by amplifying returns
 * @param equity - Array of equity points from backtest
 * @param leverage - Leverage multiplier (e.g., 2 for 2x leverage)
 * @returns Leveraged equity curve with max drawdown and final value
 */
export function simulateLeverage(equity: EquityPoint[], leverage: number): { equity: EquityPoint[]; finalValue: number; maxDrawdown: number } {
  if (!equity || equity.length === 0 || leverage <= 0) {
    return { equity: [], finalValue: 0, maxDrawdown: 0 };
  }
  const result: EquityPoint[] = [];
  let currentValue = equity[0].value;
  let peakValue = currentValue;
  let maxDD = 0;
  result.push({ date: equity[0].date, value: currentValue, drawdown: 0 });
  for (let i = 1; i < equity.length; i++) {
    const basePrev = equity[i - 1].value;
    const baseCurr = equity[i].value;
    if (basePrev <= 0) continue;

    const baseReturn = (baseCurr - basePrev) / basePrev;
    const leveragedReturn = baseReturn * leverage;

    currentValue = currentValue * (1 + leveragedReturn);
    if (currentValue < 0) currentValue = 0;

    if (currentValue > peakValue) peakValue = currentValue;
    const dd = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;

    if (dd > maxDD) maxDD = dd;

    result.push({ date: equity[i].date, value: currentValue, drawdown: dd });
  }
  return { equity: result, finalValue: result[result.length - 1]?.value ?? currentValue, maxDrawdown: maxDD };
}

/**
 * Calculate CAGR from equity curve (or start/end values and dates)
 */
export function calculateCAGR(
  finalValue: number,
  initialValue: number,
  startDate: Date | string,
  endDate: Date | string
): number {
  if (initialValue <= 0) return 0;

  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  if (years <= 0) return 0;

  // For periods less than a year, we often return simple return or annualize it.
  // Standard CAGR formula:
  return (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
}

/**
 * Format currency USD
 */
export function formatCurrencyUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
