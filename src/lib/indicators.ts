import type { OHLCData } from '../types';

/**
 * Technical Indicators Calculation Engine
 * Provides methods for calculating SMA, EMA, RSI, and IBS indicators
 */
export class IndicatorEngine {
  /**
   * Calculate Simple Moving Average (SMA)
   * @param data Array of numeric values
   * @param period Number of periods for the moving average
   * @returns Array of SMA values (NaN for insufficient data points)
   */
  static calculateSMA(data: number[], period: number): number[] {
    this.validatePeriod(period, data.length);
    
    const result: number[] = [];
    let sum = 0;
    
    // Sliding window algorithm for O(n) complexity
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sum += data[i];
        result.push(NaN);
      } else if (i === period - 1) {
        // First complete window
        sum += data[i];
        result.push(sum / period);
      } else {
        // Slide the window: remove old value, add new value
        sum = sum - data[i - period] + data[i];
        result.push(sum / period);
      }
    }
    
    return result;
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   * @param data Array of numeric values
   * @param period Number of periods for the moving average
   * @returns Array of EMA values (NaN for insufficient data points)
   */
  static calculateEMA(data: number[], period: number): number[] {
    this.validatePeriod(period, data.length);
    
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    let runningSum = 0;
    
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        runningSum = data[0];
        result.push(data[0]);
      } else if (i < period - 1) {
        // Use cumulative SMA for the first period-1 values (more efficient)
        runningSum += data[i];
        result.push(runningSum / (i + 1));
      } else if (i === period - 1) {
        // First true EMA value uses SMA as the starting point
        runningSum += data[i];
        result.push(runningSum / period);
      } else {
        // Standard EMA calculation
        const ema = (data[i] * multiplier) + (result[i - 1] * (1 - multiplier));
        result.push(ema);
      }
    }
    
    return result;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * @param data Array of numeric values (typically closing prices)
   * @param period Number of periods for RSI calculation (default: 14)
   * @returns Array of RSI values (0-100 scale, NaN for insufficient data)
   */
  static calculateRSI(data: number[], period: number = 14): number[] {
    // For RSI, we need at least period + 1 data points, but don't throw error for insufficient data
    if (data.length < period + 1) {
      return new Array(data.length).fill(NaN);
    }
    
    this.validatePeriod(period, data.length);
    
    const result: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];
    
    // Calculate price changes
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        result.push(NaN);
        gains.push(0);
        losses.push(0);
      } else {
        const change = data[i] - data[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
        
        if (i < period) {
          result.push(NaN);
        } else if (i === period) {
          // First RSI calculation using simple average (optimized)
          let sumGains = 0;
          let sumLosses = 0;
          for (let j = 1; j <= period; j++) {
            sumGains += gains[j];
            sumLosses += losses[j];
          }
          const avgGain = sumGains / period;
          const avgLoss = sumLosses / period;
          
          if (avgLoss === 0) {
            result.push(100);
          } else {
            const rs = avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            result.push(rsi);
          }
        } else {
          // Subsequent RSI calculations using smoothed averages
          const prevAvgGain = this.getRSIAverage(gains.slice(1, i), period, i - period - 1);
          const prevAvgLoss = this.getRSIAverage(losses.slice(1, i), period, i - period - 1);
          
          const avgGain = (prevAvgGain * (period - 1) + gains[i]) / period;
          const avgLoss = (prevAvgLoss * (period - 1) + losses[i]) / period;
          
          if (avgLoss === 0) {
            result.push(100);
          } else {
            const rs = avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            result.push(rsi);
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Calculate Internal Bar Strength (IBS)
   * IBS = (Close - Low) / (High - Low)
   * @param ohlcData Array of OHLC data points
   * @returns Array of IBS values (0-1 scale, NaN for invalid bars)
   */
  static calculateIBS(ohlcData: OHLCData[]): number[] {
    if (!ohlcData || ohlcData.length === 0) {
      throw new Error('OHLC data is required for IBS calculation');
    }
    
    return ohlcData.map(bar => {
      const { high, low, close } = bar;
      
      // Validate bar data
      if (high < low || close < low || close > high) {
        return NaN;
      }
      
      // Handle case where high equals low (no range) - prevents division by zero
      if (high === low) {
        // Return NaN to indicate invalid IBS - strategy engines properly handle this
        // by checking isNaN(ibs) and skipping these bars in trading logic
        return NaN;
      }
      
      return (close - low) / (high - low);
    });
  }

  /**
   * Helper function to get RSI average for smoothed calculation
   */
  private static getRSIAverage(data: number[], period: number, index: number): number {
    if (index === 0) {
      // Optimize: avoid array slicing
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += data[i];
      }
      return sum / period;
    }
    
    // Use iterative approach instead of recursion to avoid stack overflow
    // Optimize: avoid array slicing
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    let avg = sum / period;
    
    for (let i = 1; i <= index; i++) {
      avg = (avg * (period - 1) + data[i + period - 1]) / period;
    }
    
    return avg;
  }

  /**
   * Validate period parameter
   */
  private static validatePeriod(period: number, dataLength: number): void {
    if (!Number.isInteger(period) || period <= 0) {
      throw new Error('Period must be a positive integer');
    }
    
    if (period > dataLength) {
      throw new Error(`Period (${period}) cannot be greater than data length (${dataLength})`);
    }
  }

  /**
   * Validate threshold parameter
   */
  static validateThreshold(threshold: number, min: number = 0, max: number = 100): void {
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      throw new Error('Threshold must be a valid number');
    }
    
    if (threshold < min || threshold > max) {
      throw new Error(`Threshold must be between ${min} and ${max}`);
    }
  }

  /**
   * Helper function to extract price series from OHLC data
   */
  static extractPriceSeries(ohlcData: OHLCData[], priceType: 'open' | 'high' | 'low' | 'close' | 'adjClose'): number[] {
    if (!ohlcData || ohlcData.length === 0) {
      throw new Error('OHLC data is required');
    }
    
    return ohlcData.map(bar => {
      const price = bar[priceType];
      if (typeof price !== 'number' || isNaN(price)) {
        throw new Error(`Invalid ${priceType} price data`);
      }
      return price;
    });
  }

  /**
   * Helper function to detect crossovers between two series
   */
  static detectCrossover(series1: number[], series2: number[]): boolean[] {
    if (series1.length !== series2.length) {
      throw new Error('Series must have the same length for crossover detection');
    }
    
    const crossovers: boolean[] = [];
    
    for (let i = 0; i < series1.length; i++) {
      if (i === 0) {
        crossovers.push(false);
      } else {
        const prevS1 = series1[i - 1];
        const prevS2 = series2[i - 1];
        const currS1 = series1[i];
        const currS2 = series2[i];
        
        // Check if series1 crossed above series2
        const crossedAbove = prevS1 <= prevS2 && currS1 > currS2;
        crossovers.push(crossedAbove);
      }
    }
    
    return crossovers;
  }

  /**
   * Helper function to detect crossunders between two series
   */
  static detectCrossunder(series1: number[], series2: number[]): boolean[] {
    if (series1.length !== series2.length) {
      throw new Error('Series must have the same length for crossunder detection');
    }
    
    const crossunders: boolean[] = [];
    
    for (let i = 0; i < series1.length; i++) {
      if (i === 0) {
        crossunders.push(false);
      } else {
        const prevS1 = series1[i - 1];
        const prevS2 = series2[i - 1];
        const currS1 = series1[i];
        const currS2 = series2[i];
        
        // Check if series1 crossed below series2
        const crossedBelow = prevS1 > prevS2 && currS1 <= currS2;
        crossunders.push(crossedBelow);
      }
    }
    
    return crossunders;
  }

  /**
   * Helper function to validate array data
   */
  static validateArrayData(data: number[], name: string = 'data'): void {
    if (!Array.isArray(data)) {
      throw new Error(`${name} must be an array`);
    }
    
    if (data.length === 0) {
      throw new Error(`${name} array cannot be empty`);
    }
    
    const invalidIndices = data
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => typeof value !== 'number')
      .map(({ index }) => index);
    
    if (invalidIndices.length > 0) {
      throw new Error(`${name} contains non-numeric values at indices: ${invalidIndices.join(', ')}`);
    }
  }
}