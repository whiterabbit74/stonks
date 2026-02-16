import type {
  Trade,
  EquityPoint,
  PerformanceMetrics,
  OHLCData
} from '../types';
import { daysBetweenTradingDates } from './date-utils';
import { TRADE_PNL_EPSILON } from './trade-utils';

/**
 * Performance metrics calculation system
 * Implements comprehensive financial metrics with progressive disclosure hierarchy
 */
export class MetricsCalculator {
  private trades: Trade[];
  private equity: EquityPoint[];
  private initialCapital: number;
  private benchmarkData?: OHLCData[];
  // Performance caching
  private _cachedAverageWin?: number;
  private _cachedAverageLoss?: number;

  constructor(
    trades: Trade[],
    equity: EquityPoint[],
    initialCapital: number,
    benchmarkData?: OHLCData[]
  ) {
    this.trades = trades;
    this.equity = equity;
    this.initialCapital = initialCapital;
    this.benchmarkData = benchmarkData;
  }

  /**
   * Calculate all performance metrics with progressive disclosure hierarchy
   */
  public calculateAllMetrics(): PerformanceMetrics {
    const returns = this.calculateReturns();
    const finalValue = this.getFinalValue();
    const tradingPeriodYears = this.getTradingPeriodYears();

    // Pre-calculate statistics to avoid redundant O(N) iterations
    const meanReturn = this.calculateMean(returns);
    const cagr = this.calculateCAGR(finalValue, tradingPeriodYears);
    const beta = this.calculateBeta(returns, meanReturn);
    const maxDrawdown = this.calculateMaxDrawdown();
    const totalReturn = this.calculateTotalReturn(finalValue);

    return {
      // Level 1 - Always Visible (Hero Metrics)
      totalReturn: totalReturn,
      cagr: cagr,
      maxDrawdown: maxDrawdown,
      winRate: this.calculateWinRate(),
      totalTrades: this.trades.length,
      sharpeRatio: this.calculateSharpeRatio(returns, meanReturn),

      // Level 2 - Show More (Risk-Adjusted Metrics)
      sortinoRatio: this.calculateSortinoRatio(returns, meanReturn),
      calmarRatio: this.calculateCalmarRatio(cagr, maxDrawdown),
      profitFactor: this.calculateProfitFactor(),
      averageWin: this.calculateAverageWin(),
      averageLoss: this.calculateAverageLoss(),

      // Level 3 - Advanced (Statistical Metrics)
      beta: beta,
      alpha: this.calculateAlpha(cagr, beta),
      recoveryFactor: this.calculateRecoveryFactor(totalReturn, maxDrawdown),
      skewness: this.calculateSkewness(returns, meanReturn),
      kurtosis: this.calculateKurtosis(returns, meanReturn),
      valueAtRisk: this.calculateVaR(returns, 0.05)
    };
  }

  /**
   * Generate equity curve from trade history
   */
  public static generateEquityCurve(
    trades: Trade[],
    marketData: OHLCData[],
    initialCapital: number
  ): EquityPoint[] {
    const equity: EquityPoint[] = [];
    let currentCapital = initialCapital;
    let peakValue = initialCapital;

    // Create a map of dates to trades for efficient lookup
    const tradesByDate = new Map<string, Trade[]>();
    trades.forEach(trade => {
      const dateKey = trade.exitDate; // TradingDate is already YYYY-MM-DD string
      if (!tradesByDate.has(dateKey)) {
        tradesByDate.set(dateKey, []);
      }
      tradesByDate.get(dateKey)!.push(trade);
    });

    // Process each market data point
    marketData.forEach(bar => {
      const dateKey = bar.date; // TradingDate is already YYYY-MM-DD string
      const dayTrades = tradesByDate.get(dateKey) || [];

      // Add P&L from trades that closed on this day
      const dayPnL = dayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
      currentCapital += dayPnL;

      // Update peak value
      if (currentCapital > peakValue) {
        peakValue = currentCapital;
      }

      // Calculate drawdown
      const drawdown = peakValue > 0 ? ((peakValue - currentCapital) / peakValue) * 100 : 0;

      equity.push({
        date: bar.date,
        value: currentCapital,
        drawdown
      });
    });

    return equity;
  }

  // Level 1 Metrics - Always Visible

  /**
   * Calculate total return percentage
   */
  private calculateTotalReturn(finalValue: number): number {
    if (this.initialCapital <= 0) return 0;
    return ((finalValue - this.initialCapital) / this.initialCapital) * 100;
  }

  /**
   * Calculate Compound Annual Growth Rate (CAGR)
   * Исправлена проблема завышенных значений для периодов < 1 года
   */
  private calculateCAGR(finalValue: number, years: number): number {
    if (this.initialCapital <= 0 || years <= 0) return 0;

    // Для периодов менее года не аннуализируем CAGR
    if (years < 1) {
      return ((finalValue - this.initialCapital) / this.initialCapital) * 100;
    }

    const cagr = (Math.pow(finalValue / this.initialCapital, 1 / years) - 1) * 100;

    return cagr;
  }

  /**
   * Calculate maximum drawdown percentage
   */
  private calculateMaxDrawdown(): number {
    if (this.equity.length === 0) return 0;
    // Оптимизированный поиск максимума без создания промежуточного массива
    let maxDrawdown = 0;
    for (let i = 0; i < this.equity.length; i++) {
      if (this.equity[i].drawdown > maxDrawdown) {
        maxDrawdown = this.equity[i].drawdown;
      }
    }
    return maxDrawdown;
  }

  /**
   * Calculate win rate percentage
   */
  private calculateWinRate(): number {
    if (this.trades.length === 0) return 0;
    // Оптимизированный расчет без создания промежуточного массива
    let winningCount = 0;
    for (let i = 0; i < this.trades.length; i++) {
      // Use epsilon to ignore floating point noise
      if (this.trades[i].pnl > TRADE_PNL_EPSILON) {
        winningCount++;
      }
    }
    return (winningCount / this.trades.length) * 100;
  }

  /**
   * Calculate Sharpe ratio (risk-adjusted return)
   */
  private calculateSharpeRatio(returns: number[], mean?: number): number {
    if (returns.length === 0) return 0;

    const meanReturn = mean ?? this.calculateMean(returns);
    const stdDev = this.calculateStandardDeviation(returns, meanReturn);

    if (stdDev === 0) return 0;

    // Annualize assuming daily returns
    const annualizedReturn = meanReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);
    const riskFreeRate = 0.02; // 2% risk-free rate assumption

    const sharpeRatio = (annualizedReturn - riskFreeRate) / annualizedStdDev;

    return sharpeRatio;
  }

  // Level 2 Metrics - Show More

  /**
   * Calculate Sortino ratio (downside deviation adjusted return)
   */
  private calculateSortinoRatio(returns: number[], mean?: number): number {
    if (returns.length === 0) return 0;

    const meanReturn = mean ?? this.calculateMean(returns);
    const annualizedReturn = meanReturn * 252;
    const riskFreeRateAnnual = 0.02; // 2% годовых
    const marDaily = riskFreeRateAnnual / 252; // MAR на день

    const downwardDeviation = this.calculateDownwardDeviation(returns, marDaily);
    if (downwardDeviation === 0) return 0;

    const annualizedDownwardDev = downwardDeviation * Math.sqrt(252);

    const sortinoRatio = (annualizedReturn - riskFreeRateAnnual) / annualizedDownwardDev;

    return sortinoRatio;
  }

  /**
   * Calculate Calmar ratio (CAGR / Max Drawdown)
   */
  private calculateCalmarRatio(cagr: number, maxDrawdown: number): number {
    if (maxDrawdown === 0) return 0;
    return cagr / maxDrawdown;
  }

  /**
   * Calculate profit factor (gross profit / gross loss)
   */
  private calculateProfitFactor(): number {
    // Оптимизированный расчет в одном проходе
    let grossProfit = 0;
    let grossLoss = 0;

    for (let i = 0; i < this.trades.length; i++) {
      const pnl = this.trades[i].pnl;
      if (pnl > TRADE_PNL_EPSILON) {
        grossProfit += pnl;
      } else if (pnl < -TRADE_PNL_EPSILON) {
        grossLoss += Math.abs(pnl);
      }
    }

    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
    return grossProfit / grossLoss;
  }

  /**
   * Calculate average winning trade amount
   */
  private calculateAverageWin(): number {
    // Кешируем результат если он уже был вычислен
    if (this._cachedAverageWin !== undefined) return this._cachedAverageWin;

    let totalWin = 0;
    let winCount = 0;

    for (let i = 0; i < this.trades.length; i++) {
      if (this.trades[i].pnl > TRADE_PNL_EPSILON) {
        totalWin += this.trades[i].pnl;
        winCount++;
      }
    }

    this._cachedAverageWin = winCount === 0 ? 0 : totalWin / winCount;
    return this._cachedAverageWin;
  }

  /**
   * Calculate average losing trade amount (absolute value)
   */
  private calculateAverageLoss(): number {
    // Кешируем результат если он уже был вычислен
    if (this._cachedAverageLoss !== undefined) return this._cachedAverageLoss;

    let totalLoss = 0;
    let lossCount = 0;

    for (let i = 0; i < this.trades.length; i++) {
      if (this.trades[i].pnl < -TRADE_PNL_EPSILON) {
        totalLoss += Math.abs(this.trades[i].pnl);
        lossCount++;
      }
    }

    this._cachedAverageLoss = lossCount === 0 ? 0 : totalLoss / lossCount;
    return this._cachedAverageLoss;
  }

  // Level 3 Metrics - Advanced

  /**
   * Calculate beta (correlation with benchmark)
   */
  private calculateBeta(returns: number[], returnsMean?: number): number {
    if (!this.benchmarkData || returns.length === 0) return 1.0; // Default beta

    const benchmarkReturns = this.calculateBenchmarkReturns();
    if (benchmarkReturns.length !== returns.length) return 1.0;

    const benchmarkMean = this.calculateMean(benchmarkReturns);
    const covariance = this.calculateCovariance(returns, benchmarkReturns, returnsMean, benchmarkMean);
    const benchmarkVariance = this.calculateVariance(benchmarkReturns, benchmarkMean);

    if (benchmarkVariance === 0) return 1.0;
    return covariance / benchmarkVariance;
  }

  /**
   * Calculate alpha (excess return over benchmark)
   */
  private calculateAlpha(cagr: number, beta: number): number {
    const riskFreeRate = 2; // 2% assumption
    const marketReturn = 8; // 8% market return assumption

    return cagr - (riskFreeRate + beta * (marketReturn - riskFreeRate));
  }

  /**
   * Calculate recovery factor (total return / max drawdown)
   */
  private calculateRecoveryFactor(totalReturn: number, maxDrawdown: number): number {
    if (maxDrawdown === 0) return totalReturn > 0 ? Infinity : 0;
    return totalReturn / maxDrawdown;
  }

  /**
   * Calculate skewness (asymmetry of return distribution)
   */
  private calculateSkewness(returns: number[], mean?: number): number {
    if (returns.length < 3) return 0;

    const m = mean ?? this.calculateMean(returns);
    const stdDev = this.calculateStandardDeviation(returns, m);

    if (stdDev === 0) return 0;

    const skewness = returns.reduce((sum, ret) => {
      return sum + Math.pow((ret - m) / stdDev, 3);
    }, 0) / returns.length;

    return skewness;
  }

  /**
   * Calculate kurtosis (tail risk measure)
   */
  private calculateKurtosis(returns: number[], mean?: number): number {
    if (returns.length < 4) return 0;

    const m = mean ?? this.calculateMean(returns);
    const stdDev = this.calculateStandardDeviation(returns, m);

    if (stdDev === 0) return 0;

    const kurtosis = returns.reduce((sum, ret) => {
      return sum + Math.pow((ret - m) / stdDev, 4);
    }, 0) / returns.length;

    return kurtosis - 3; // Excess kurtosis
  }

  /**
   * Calculate Value at Risk (VaR) at given confidence level
   */
  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor(returns.length * confidence);

    return Math.abs(sortedReturns[index] || 0) * 100; // Convert to percentage
  }

  // Helper Methods

  /**
   * Calculate daily returns from equity curve
   */
  private calculateReturns(): number[] {
    const returns: number[] = [];

    for (let i = 1; i < this.equity.length; i++) {
      const prevValue = this.equity[i - 1].value;
      const currentValue = this.equity[i].value;

      if (prevValue > 0) {
        const dailyReturn = (currentValue - prevValue) / prevValue;
        returns.push(dailyReturn);
      }
    }

    return returns;
  }

  /**
   * Get final portfolio value
   */
  private getFinalValue(): number {
    if (this.equity.length === 0) return this.initialCapital;
    const lastEquity = this.equity[this.equity.length - 1];
    return lastEquity?.value ?? this.initialCapital;
  }

  /**
   * Calculate trading period in years
   * Uses TradingDate string comparisons
   */
  private getTradingPeriodYears(): number {
    if (this.equity.length < 2) return 1 / 365.25; // 1 day

    const startDate = this.equity[0]?.date;
    const endDate = this.equity[this.equity.length - 1]?.date;

    if (!startDate || !endDate) return 1 / 365.25;

    // Use daysBetweenTradingDates for TradingDate strings
    const daysDiff = Math.max(1, daysBetweenTradingDates(startDate, endDate));

    return daysDiff / 365.25;
  }

  /**
   * Calculate mean of an array
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStandardDeviation(values: number[], mean?: number): number {
    if (values.length === 0) return 0;

    const m = mean ?? this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[], mean?: number): number {
    if (values.length === 0) return 0;

    const m = mean ?? this.calculateMean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / values.length;
  }

  /**
   * Calculate downward deviation (for Sortino ratio)
   */
  private calculateDownwardDeviation(returns: number[], marDaily: number): number {
    // Классическое определение: учитываем только наблюдения ниже MAR
    const downsideSquares: number[] = [];
    for (const r of returns) {
      if (r < marDaily) {
        downsideSquares.push(Math.pow(r - marDaily, 2));
      }
    }
    if (downsideSquares.length === 0) return 0;
    const variance = downsideSquares.reduce((s, v) => s + v, 0) / downsideSquares.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate covariance between two series
   */
  private calculateCovariance(series1: number[], series2: number[], mean1?: number, mean2?: number): number {
    if (series1.length !== series2.length || series1.length === 0) return 0;

    const m1 = mean1 ?? this.calculateMean(series1);
    const m2 = mean2 ?? this.calculateMean(series2);

    const covariance = series1.reduce((sum, val1, index) => {
      const val2 = series2[index];
      return sum + (val1 - m1) * (val2 - m2);
    }, 0) / series1.length;

    return covariance;
  }

  /**
   * Calculate benchmark returns (if benchmark data is available)
   */
  private calculateBenchmarkReturns(): number[] {
    if (!this.benchmarkData || this.benchmarkData.length < 2) return [];

    const returns: number[] = [];

    for (let i = 1; i < this.benchmarkData.length; i++) {
      const prevPrice = this.benchmarkData[i - 1].close;
      const currentPrice = this.benchmarkData[i].close;

      if (prevPrice > 0) {
        returns.push((currentPrice - prevPrice) / prevPrice);
      }
    }

    return returns;
  }
}

/**
 * Progressive disclosure system for metrics hierarchy
 */
export interface MetricsHierarchy {
  level1: {
    title: string;
    description: string;
    metrics: (keyof PerformanceMetrics)[];
  };
  level2: {
    title: string;
    description: string;
    metrics: (keyof PerformanceMetrics)[];
  };
  level3: {
    title: string;
    description: string;
    metrics: (keyof PerformanceMetrics)[];
  };
}

/**
 * Get metrics hierarchy configuration for progressive disclosure
 */
export function getMetricsHierarchy(): MetricsHierarchy {
  return {
    level1: {
      title: "Key Performance",
      description: "Essential metrics that tell the story of your strategy's performance",
      metrics: ['totalReturn', 'cagr', 'maxDrawdown', 'winRate', 'sharpeRatio']
    },
    level2: {
      title: "Risk Analysis",
      description: "Advanced risk-adjusted metrics for deeper performance insight",
      metrics: ['sortinoRatio', 'calmarRatio', 'profitFactor', 'averageWin', 'averageLoss']
    },
    level3: {
      title: "Statistical Analysis",
      description: "Professional-grade statistical measures for comprehensive evaluation",
      metrics: ['beta', 'alpha', 'recoveryFactor', 'skewness', 'kurtosis', 'valueAtRisk']
    }
  };
}

/**
 * Format metric values for display
 */
export function formatMetricValue(metric: keyof PerformanceMetrics, value: number): string {
  // Percentage metrics
  if (['totalReturn', 'cagr', 'maxDrawdown', 'winRate'].includes(metric)) {
    return `${value.toFixed(2)}%`;
  }

  // Ratio metrics (2 decimal places)
  if (['sharpeRatio', 'sortinoRatio', 'calmarRatio', 'profitFactor', 'beta', 'recoveryFactor'].includes(metric)) {
    return value.toFixed(2);
  }

  // Currency metrics
  if (['averageWin', 'averageLoss'].includes(metric)) {
    return `$${value.toFixed(2)}`;
  }

  // Statistical metrics (3 decimal places)
  if (['alpha', 'skewness', 'kurtosis', 'valueAtRisk'].includes(metric)) {
    return value.toFixed(3);
  }

  // Default formatting
  return value.toFixed(2);
}

/**
 * Get metric descriptions for tooltips and explanations
 */
export function getMetricDescription(metric: keyof PerformanceMetrics): string {
  const descriptions: Record<keyof PerformanceMetrics, string> = {
    totalReturn: "Total percentage return from initial capital to final value",
    cagr: "Compound Annual Growth Rate - annualized return accounting for compounding",
    maxDrawdown: "Maximum peak-to-trough decline in portfolio value",
    winRate: "Percentage of trades that were profitable",
    sharpeRatio: "Risk-adjusted return measure (return per unit of volatility)",
    sortinoRatio: "Risk-adjusted return focusing only on downside volatility",
    calmarRatio: "Annual return divided by maximum drawdown",
    profitFactor: "Ratio of gross profit to gross loss",
    averageWin: "Average profit per winning trade",
    averageLoss: "Average loss per losing trade",
    beta: "Correlation with market benchmark (1.0 = same as market)",
    alpha: "Excess return over what would be expected given the risk taken",
    recoveryFactor: "Total return divided by maximum drawdown",
    skewness: "Measure of asymmetry in return distribution",
    kurtosis: "Measure of tail risk in return distribution",
    valueAtRisk: "Maximum expected loss at 95% confidence level",
    totalTrades: "Total number of executed trades"
  };

  return descriptions[metric];
}
