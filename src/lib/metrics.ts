import type {
  Trade,
  EquityPoint,
  PerformanceMetrics,
  OHLCData
} from '../types';

/**
 * Performance metrics calculation system
 * Implements comprehensive financial metrics with progressive disclosure hierarchy
 */
export class MetricsCalculator {
  private trades: Trade[];
  private equity: EquityPoint[];
  private initialCapital: number;
  private benchmarkData?: OHLCData[];

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

    return {
      // Level 1 - Always Visible (Hero Metrics)
      totalReturn: this.calculateTotalReturn(finalValue),
      cagr: this.calculateCAGR(finalValue, tradingPeriodYears),
      maxDrawdown: this.calculateMaxDrawdown(),
      winRate: this.calculateWinRate(),
      sharpeRatio: this.calculateSharpeRatio(returns),
      
      // Level 2 - Show More (Risk-Adjusted Metrics)
      sortinoRatio: this.calculateSortinoRatio(returns),
      calmarRatio: this.calculateCalmarRatio(returns, tradingPeriodYears),
      profitFactor: this.calculateProfitFactor(),
      averageWin: this.calculateAverageWin(),
      averageLoss: this.calculateAverageLoss(),
      
      // Level 3 - Advanced (Statistical Metrics)
      beta: this.calculateBeta(returns),
      alpha: this.calculateAlpha(returns, tradingPeriodYears),
      recoveryFactor: this.calculateRecoveryFactor(),
      skewness: this.calculateSkewness(returns),
      kurtosis: this.calculateKurtosis(returns),
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
      const dateKey = trade.exitDate.toISOString().split('T')[0];
      if (!tradesByDate.has(dateKey)) {
        tradesByDate.set(dateKey, []);
      }
      tradesByDate.get(dateKey)!.push(trade);
    });

    // Process each market data point
    marketData.forEach(bar => {
      const dateKey = bar.date.toISOString().split('T')[0];
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
   */
  private calculateCAGR(finalValue: number, years: number): number {
    if (this.initialCapital <= 0 || years <= 0) return 0;
    
    const cagr = (Math.pow(finalValue / this.initialCapital, 1 / years) - 1) * 100;
    
    return cagr;
  }

  /**
   * Calculate maximum drawdown percentage
   */
  private calculateMaxDrawdown(): number {
    if (this.equity.length === 0) return 0;
    return Math.max(...this.equity.map(point => point.drawdown));
  }

  /**
   * Calculate win rate percentage
   */
  private calculateWinRate(): number {
    if (this.trades.length === 0) return 0;
    const winningTrades = this.trades.filter(trade => trade.pnl > 0);
    return (winningTrades.length / this.trades.length) * 100;
  }

  /**
   * Calculate Sharpe ratio (risk-adjusted return)
   */
  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = this.calculateMean(returns);
    const stdDev = this.calculateStandardDeviation(returns);
    
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
  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const meanReturn = this.calculateMean(returns);
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
  private calculateCalmarRatio(_returns: number[], years: number): number {
    const cagr = this.calculateCAGR(this.getFinalValue(), years);
    const maxDrawdown = this.calculateMaxDrawdown();
    
    if (maxDrawdown === 0) return 0;
    return cagr / maxDrawdown;
  }

  /**
   * Calculate profit factor (gross profit / gross loss)
   */
  private calculateProfitFactor(): number {
    const winningTrades = this.trades.filter(trade => trade.pnl > 0);
    const losingTrades = this.trades.filter(trade => trade.pnl < 0);
    
    const grossProfit = winningTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl, 0));
    
    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
    return grossProfit / grossLoss;
  }

  /**
   * Calculate average winning trade amount
   */
  private calculateAverageWin(): number {
    const winningTrades = this.trades.filter(trade => trade.pnl > 0);
    if (winningTrades.length === 0) return 0;
    
    return winningTrades.reduce((sum, trade) => sum + trade.pnl, 0) / winningTrades.length;
  }

  /**
   * Calculate average losing trade amount (absolute value)
   */
  private calculateAverageLoss(): number {
    const losingTrades = this.trades.filter(trade => trade.pnl < 0);
    if (losingTrades.length === 0) return 0;
    
    return Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl, 0) / losingTrades.length);
  }

  // Level 3 Metrics - Advanced

  /**
   * Calculate beta (correlation with benchmark)
   */
  private calculateBeta(returns: number[]): number {
    if (!this.benchmarkData || returns.length === 0) return 1.0; // Default beta
    
    const benchmarkReturns = this.calculateBenchmarkReturns();
    if (benchmarkReturns.length !== returns.length) return 1.0;
    
    const covariance = this.calculateCovariance(returns, benchmarkReturns);
    const benchmarkVariance = this.calculateVariance(benchmarkReturns);
    
    if (benchmarkVariance === 0) return 1.0;
    return covariance / benchmarkVariance;
  }

  /**
   * Calculate alpha (excess return over benchmark)
   */
  private calculateAlpha(returns: number[], years: number): number {
    const cagr = this.calculateCAGR(this.getFinalValue(), years);
    const riskFreeRate = 2; // 2% assumption
    const marketReturn = 8; // 8% market return assumption
    const beta = this.calculateBeta(returns);
    
    return cagr - (riskFreeRate + beta * (marketReturn - riskFreeRate));
  }

  /**
   * Calculate recovery factor (total return / max drawdown)
   */
  private calculateRecoveryFactor(): number {
    const totalReturn = this.calculateTotalReturn(this.getFinalValue());
    const maxDrawdown = this.calculateMaxDrawdown();
    
    if (maxDrawdown === 0) return totalReturn > 0 ? Infinity : 0;
    return totalReturn / maxDrawdown;
  }

  /**
   * Calculate skewness (asymmetry of return distribution)
   */
  private calculateSkewness(returns: number[]): number {
    if (returns.length < 3) return 0;
    
    const mean = this.calculateMean(returns);
    const stdDev = this.calculateStandardDeviation(returns);
    
    if (stdDev === 0) return 0;
    
    const skewness = returns.reduce((sum, ret) => {
      return sum + Math.pow((ret - mean) / stdDev, 3);
    }, 0) / returns.length;
    
    return skewness;
  }

  /**
   * Calculate kurtosis (tail risk measure)
   */
  private calculateKurtosis(returns: number[]): number {
    if (returns.length < 4) return 0;
    
    const mean = this.calculateMean(returns);
    const stdDev = this.calculateStandardDeviation(returns);
    
    if (stdDev === 0) return 0;
    
    const kurtosis = returns.reduce((sum, ret) => {
      return sum + Math.pow((ret - mean) / stdDev, 4);
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
    return this.equity[this.equity.length - 1].value;
  }

  /**
   * Calculate trading period in years
   */
  private getTradingPeriodYears(): number {
    if (this.equity.length < 2) return 1;
    
    const startDate = this.equity[0].date;
    const endDate = this.equity[this.equity.length - 1].date;
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return Math.max(daysDiff / 365.25, 1/365.25); // Minimum 1 day
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
  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = this.calculateMean(values);
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return Math.sqrt(variance);
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = this.calculateMean(values);
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
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
  private calculateCovariance(series1: number[], series2: number[]): number {
    if (series1.length !== series2.length || series1.length === 0) return 0;
    
    const mean1 = this.calculateMean(series1);
    const mean2 = this.calculateMean(series2);
    
    const covariance = series1.reduce((sum, val1, index) => {
      const val2 = series2[index];
      return sum + (val1 - mean1) * (val2 - mean2);
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
    valueAtRisk: "Maximum expected loss at 95% confidence level"
  };
  
  return descriptions[metric];
}