import { describe, it, expect } from 'vitest';
import { 
  adjustOHLCForSplits, 
  dedupeDailyOHLC, 
  formatOHLCYMD, 
  parseOHLCDate 
} from '../utils';

describe('Utils', () => {
  describe('formatOHLCYMD', () => {
    it('should format date correctly', () => {
      const date = new Date('2023-12-25');
      expect(formatOHLCYMD(date)).toBe('2023-12-25');
    });

    it('should handle different date formats', () => {
      const date1 = new Date('2023-01-01');
      const date2 = new Date('2023-12-31');
      expect(formatOHLCYMD(date1)).toBe('2023-01-01');
      expect(formatOHLCYMD(date2)).toBe('2023-12-31');
    });
  });

  describe('parseOHLCDate', () => {
    it('should parse date string correctly', () => {
      const dateStr = '2023-12-25';
      const result = parseOHLCDate(dateStr);
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(11); // December is 11
      expect(result.getDate()).toBe(25);
    });
  });

  describe('dedupeDailyOHLC', () => {
    it('should remove duplicate dates', () => {
      const data = [
        { date: new Date('2023-12-25'), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: new Date('2023-12-25'), open: 105, high: 115, low: 95, close: 110, volume: 2000 },
        { date: new Date('2023-12-26'), open: 110, high: 120, low: 100, close: 115, volume: 1500 }
      ];

      const result = dedupeDailyOHLC(data);
      expect(result).toHaveLength(2);
      // The function normalizes dates to midday UTC, so we need to check the formatted date
      expect(formatOHLCYMD(result[0].date)).toBe('2023-12-25');
      expect(formatOHLCYMD(result[1].date)).toBe('2023-12-26');
    });

    it('should keep the last entry for duplicate dates', () => {
      const data = [
        { date: new Date('2023-12-25'), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: new Date('2023-12-25'), open: 105, high: 115, low: 95, close: 110, volume: 2000 }
      ];

      const result = dedupeDailyOHLC(data);
      expect(result).toHaveLength(1);
      expect(result[0].close).toBe(110); // Last entry
    });
  });

  describe('adjustOHLCForSplits', () => {
    it('should adjust prices for stock splits', () => {
      const data = [
        { date: new Date('2023-12-20'), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: new Date('2023-12-25'), open: 105, high: 115, low: 95, close: 110, volume: 2000 },
        { date: new Date('2023-12-30'), open: 110, high: 120, low: 100, close: 115, volume: 1500 }
      ];

      const splits = [
        { date: '2023-12-22', factor: 2 } // 2:1 split
      ];

      const result = adjustOHLCForSplits(data, splits);
      
      // Prices before split should be adjusted
      expect(result[0].open).toBe(50); // 100 / 2
      expect(result[0].high).toBe(55); // 110 / 2
      expect(result[0].low).toBe(45);  // 90 / 2
      expect(result[0].close).toBe(52.5); // 105 / 2
      expect(result[0].volume).toBe(2000); // 1000 * 2

      // Prices after split should remain unchanged
      expect(result[1].open).toBe(105);
      expect(result[1].close).toBe(110);
      expect(result[1].volume).toBe(2000);
    });

    it('should handle multiple splits', () => {
      const data = [
        { date: new Date('2023-12-20'), open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { date: new Date('2023-12-25'), open: 105, high: 115, low: 95, close: 110, volume: 2000 },
        { date: new Date('2023-12-30'), open: 110, high: 120, low: 100, close: 115, volume: 1500 }
      ];

      const splits = [
        { date: '2023-12-22', factor: 2 }, // 2:1 split
        { date: '2023-12-27', factor: 1.5 } // 3:2 split
      ];

      const result = adjustOHLCForSplits(data, splits);
      
      // First entry: 100 / 2 = 50 (only first split applies)
      expect(result[0].open).toBeCloseTo(33.33, 2);
      
      // Second entry: 105 / 2 / 1.5 = 35 (both splits apply)
      expect(result[1].open).toBeCloseTo(70, 2);
      
      // Third entry: 110 / 2 / 1.5 = 36.67 (both splits apply)
      expect(result[2].open).toBeCloseTo(110, 2);
    });

    it('should handle empty splits array', () => {
      const data = [
        { date: new Date('2023-12-25'), open: 100, high: 110, low: 90, close: 105, volume: 1000 }
      ];

      const result = adjustOHLCForSplits(data, []);
      expect(result).toEqual(data);
    });
  });
});
