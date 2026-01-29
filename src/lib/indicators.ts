import type { OHLCData } from '../types';
import { logWarn, logInfo } from './error-logger';

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
    
    // Track smoothed averages for O(N) performance (replacing expensive recalculation)
    let avgGain = 0;
    let avgLoss = 0;

    // Calculate price changes
    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        result.push(NaN);
        gains.push(0);
        losses.push(0);
      } else {
        const change = data[i] - data[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;

        gains.push(gain);
        losses.push(loss);
        
        if (i < period) {
          result.push(NaN);
        } else if (i === period) {
          // First RSI calculation using simple average
          let sumGains = 0;
          let sumLosses = 0;
          for (let j = 1; j <= period; j++) {
            sumGains += gains[j];
            sumLosses += losses[j];
          }
          avgGain = sumGains / period;
          avgLoss = sumLosses / period;
          
          if (avgLoss === 0) {
            result.push(100);
          } else {
            const rs = avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            result.push(rsi);
          }
        } else {
          // Subsequent RSI calculations using smoothed averages
          // Update running averages in O(1) instead of recalculating from scratch
          avgGain = (avgGain * (period - 1) + gain) / period;
          avgLoss = (avgLoss * (period - 1) + loss) / period;
          
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
   * @returns Array of IBS values (0-1 scale, 0.5 for invalid bars)
   */
  static calculateIBS(ohlcData: OHLCData[]): number[] {
    if (!ohlcData || ohlcData.length === 0) {
      throw new Error('OHLC data is required for IBS calculation');
    }

    let invalidCount = 0;
    let zeroRangeCount = 0;
    let firstInvalidExample: { index: number, bar: OHLCData } | null = null;
    let firstZeroRangeExample: { index: number, bar: OHLCData } | null = null;
    
    const result = ohlcData.map((bar, index) => {
      const { high, low, close } = bar;
      
      // Validate bar data
      if (high < low || close < low || close > high) {
        invalidCount++;
        if (!firstInvalidExample) {
          firstInvalidExample = { index, bar };
        }
        return 0.5; // Return neutral IBS
      }
      
      // Handle case where high equals low (no range) - prevents division by zero
      if (high === low) {
        zeroRangeCount++;
        if (!firstZeroRangeExample) {
          firstZeroRangeExample = { index, bar };
        }
        return 0.5; // Return neutral IBS
      }
      
      return (close - low) / (high - low);
    });

    // Log batched warnings/infos if issues were found to prevent console flooding
    if (typeof window !== 'undefined') {
      if (invalidCount > 0 && firstInvalidExample) {
        const { index, bar } = firstInvalidExample;
        logWarn('calc', `Found ${invalidCount} invalid OHLC bars. First at index ${index}: H=${bar.high}, L=${bar.low}, C=${bar.close}`, {
          count: invalidCount,
          firstIndex: index,
          firstDate: bar.date,
          high: bar.high,
          low: bar.low,
          close: bar.close
        }, 'calculateIBS');
      }

      if (zeroRangeCount > 0 && firstZeroRangeExample) {
        const { index, bar } = firstZeroRangeExample;
        logInfo('calc', `Found ${zeroRangeCount} zero-range bars. First at index ${index}: H=L=${bar.high}, C=${bar.close}`, {
          count: zeroRangeCount,
          firstIndex: index,
          firstDate: bar.date,
          value: bar.high
        }, 'calculateIBS');
      }
    }

    return result;
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
