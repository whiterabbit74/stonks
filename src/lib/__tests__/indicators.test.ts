import { describe, it, expect } from 'vitest';
import { IndicatorEngine } from '../indicators';
import type { OHLCData } from '../../types';

describe('IndicatorEngine', () => {
  const sampleData: OHLCData[] = [
    { date: new Date('2023-12-01'), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
    { date: new Date('2023-12-02'), open: 105, high: 115, low: 95, close: 110, volume: 1200 },
    { date: new Date('2023-12-03'), open: 110, high: 120, low: 100, close: 115, volume: 1100 },
    { date: new Date('2023-12-04'), open: 115, high: 125, low: 105, close: 120, volume: 1300 },
    { date: new Date('2023-12-05'), open: 120, high: 130, low: 110, close: 125, volume: 1400 },
    { date: new Date('2023-12-06'), open: 125, high: 135, low: 115, close: 130, volume: 1500 },
    { date: new Date('2023-12-07'), open: 130, high: 140, low: 120, close: 135, volume: 1600 },
    { date: new Date('2023-12-08'), open: 135, high: 145, low: 125, close: 140, volume: 1700 },
    { date: new Date('2023-12-09'), open: 140, high: 150, low: 130, close: 145, volume: 1800 },
    { date: new Date('2023-12-10'), open: 145, high: 155, low: 135, close: 150, volume: 1900 }
  ];

  describe('calculateSMA', () => {
    it('should calculate Simple Moving Average correctly', () => {
      const sma = IndicatorEngine.calculateSMA(sampleData.map(d => d.close), 5);
      
      expect(sma).toHaveLength(sampleData.length);
      
      // First 4 values should be NaN (not enough data)
      for (let i = 0; i < 4; i++) {
        expect(sma[i]).toBeNaN();
      }
      
      // 5th value should be average of first 5 closes
      const expectedSMA5 = (105 + 110 + 115 + 120 + 125) / 5;
      expect(sma[4]).toBeCloseTo(expectedSMA5, 2);
      
      // 6th value should be average of closes 2-6
      const expectedSMA6 = (110 + 115 + 120 + 125 + 130) / 5;
      expect(sma[5]).toBeCloseTo(expectedSMA6, 2);
    });

    it('should handle period larger than data length', () => {
      expect(() => {
        IndicatorEngine.calculateSMA(sampleData.map(d => d.close), 20);
      }).toThrow('Period (20) cannot be greater than data length (10)');
    });
  });

  describe('calculateEMA', () => {
    it('should calculate Exponential Moving Average correctly', () => {
      const ema = IndicatorEngine.calculateEMA(sampleData.map(d => d.close), 5);
      
      expect(ema).toHaveLength(sampleData.length);
      
      // First value should be the first close price
      expect(ema[0]).toBe(105);
      
      // Subsequent values should be calculated using EMA formula
      expect(ema[1]).toBeCloseTo(107.5, 2); // EMA with alpha = 2/(5+1) = 1/3
    });

    it('should handle single data point', () => {
      expect(() => {
        IndicatorEngine.calculateEMA([100], 5);
      }).toThrow('Period (5) cannot be greater than data length (1)');
    });
  });

  describe('calculateRSI', () => {
    it('should calculate RSI correctly', () => {
      const rsi = IndicatorEngine.calculateRSI(sampleData.map(d => d.close), 14);
      
      expect(rsi).toHaveLength(sampleData.length);
      
      // First value should be NaN (not enough data for RSI)
      expect(rsi[0]).toBeNaN();
      
      // RSI values should be between 0 and 100
      for (let i = 1; i < rsi.length; i++) {
        if (!isNaN(rsi[i])) {
          expect(rsi[i]).toBeGreaterThanOrEqual(0);
          expect(rsi[i]).toBeLessThanOrEqual(100);
        }
      }
    });

    it('should handle period larger than data length', () => {
      const rsi = IndicatorEngine.calculateRSI(sampleData.map(d => d.close), 20);
      
      // All values should be NaN
      rsi.forEach(value => {
        expect(value).toBeNaN();
      });
    });
  });

  describe('calculateIBS', () => {
    it('should calculate IBS correctly', () => {
      const ibs = IndicatorEngine.calculateIBS(sampleData);
      
      expect(ibs).toHaveLength(sampleData.length);
      
      // IBS should be between 0 and 1
      ibs.forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
      
      // Test specific calculation
      // IBS = (Close - Low) / (High - Low)
      const firstBar = sampleData[0];
      const expectedIBS = (firstBar.close - firstBar.low) / (firstBar.high - firstBar.low);
      expect(ibs[0]).toBeCloseTo(expectedIBS, 4);
    });

    it('should handle bars with same high and low', () => {
      const dataWithSameHL: OHLCData[] = [
        { date: new Date('2023-12-01'), open: 100, high: 100, low: 100, close: 100, volume: 1000 }
      ];
      
      const ibs = IndicatorEngine.calculateIBS(dataWithSameHL);
      expect(ibs[0]).toBe(0.5); // Should default to 0.5 when high = low
    });

    it('should handle empty data', () => {
      expect(() => {
        IndicatorEngine.calculateIBS([]);
      }).toThrow('OHLC data is required for IBS calculation');
    });
  });

});
