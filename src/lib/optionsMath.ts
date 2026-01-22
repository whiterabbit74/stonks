
// Standard Normal Cumulative Distribution Function
function cnd(x: number): number {
  const a1 = 0.31938153;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2.0) / Math.sqrt(2 * Math.PI);
  return x < 0 ? 1 - y : y;
}

/**
 * Black-Scholes Option Pricing Formula
 * @param type 'call' | 'put'
 * @param S Current Stock Price
 * @param K Strike Price
 * @param T Time to Maturity (in years)
 * @param r Risk-free Interest Rate (decimal, e.g., 0.05 for 5%)
 * @param sigma Volatility (decimal, e.g., 0.2 for 20%)
 * @returns Option Price
 */
export function blackScholes(
  type: 'call' | 'put',
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number
): number {
  if (T <= 0) return Math.max(0, type === 'call' ? S - K : K - S);

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2.0) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  if (type === 'call') {
    return S * cnd(d1) - K * Math.exp(-r * T) * cnd(d2);
  } else {
    return K * Math.exp(-r * T) * cnd(-d2) - S * cnd(-d1);
  }
}

/**
 * Calculates Annualized Rolling Volatility
 * Based on standard deviation of log returns
 * @param prices Array of prices (must be sorted ascending by date)
 * @param window Window size (e.g. 30 days)
 * @returns annualized volatility (decimal)
 */
export function calculateVolatility(prices: number[], window: number = 30): number {
  if (prices.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  if (returns.length === 0) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize (assuming 252 trading days)
  return stdDev * Math.sqrt(252);
}

/**
 * Finds the date of the next month's Friday that corresponds to "Strike date a month ahead".
 * We'll interpret this as: Add 30 days, then find the nearest Friday (or specifically the Friday of that week).
 * Or as per prompt: "Use date month ahead, accordingly Friday".
 * Standard option expiration is 3rd Friday.
 * Let's approximate: Date + 30 days. Then find the next Friday.
 */
export function getExpirationDate(fromDate: Date): Date {
  // Add 1 month (roughly 30 days)
  const targetDate = new Date(fromDate);
  targetDate.setDate(targetDate.getDate() + 30);

  // Find the next Friday (5)
  // Day: 0 (Sun) to 6 (Sat)
  const day = targetDate.getDay();
  const diff = 5 - day; // If Fri (5), diff=0. If Sat (6), diff=-1 (prev Fri) or +6 (next Fri).

  // If we want "upcoming" Friday, ensuring we don't go back?
  // "Date month ahead, accordingly Friday".
  // If target is Saturday, Next Friday is +6 days.
  // If target is Friday, it's today.
  // If target is Thursday, it's +1 day.

  let daysToAdd = diff;
  if (daysToAdd < 0) daysToAdd += 7; // Move to next week if passed

  targetDate.setDate(targetDate.getDate() + daysToAdd);
  return targetDate;
}

export function getYearsToMaturity(fromDate: Date, toDate: Date): number {
    const diffMs = toDate.getTime() - fromDate.getTime();
    return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}
