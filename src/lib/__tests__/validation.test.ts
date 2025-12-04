import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Papa Parse before any imports
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn()
  }
}));

import {
  validateOHLCData,
  validateNumeric,
  validateNumber,
  parseCSV
} from '../validation';
import type { OHLCData } from '../../types';

describe('Validation Module', () => {
  describe('validateOHLCData', () => {
    it('should validate correct OHLC data', () => {
      const validData: Partial<OHLCData>[] = [
        {
          date: new Date('2024-01-01'),
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000
        },
        {
          date: new Date('2024-01-02'),
          open: 105,
          high: 115,
          low: 95,
          close: 110,
          volume: 1200
        }
      ];

      const result = validateOHLCData(validData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should warn about invalid prices', () => {
      const invalidData: Partial<OHLCData>[] = [
        {
          date: new Date('2024-01-01'),
          open: 100,
          high: 90, // High less than open
          low: 95,
          close: 105,
          volume: 1000
        }
      ];

      const result = validateOHLCData(invalidData);

      expect(result.isValid).toBe(true); // Validation passes but with warnings
      expect(result.warnings?.length).toBeGreaterThan(0);
    });

    it('should accept data with negative prices (no specific negative price validation)', () => {
      const invalidData: Partial<OHLCData>[] = [
        {
          date: new Date('2024-01-01'),
          open: -100, // Negative price - but valid number
          high: 110,
          low: 90,
          close: 105,
          volume: 1000
        }
      ];

      const result = validateOHLCData(invalidData);

      expect(result.isValid).toBe(true); // Negative prices are valid numbers
      expect(result.warnings?.length).toBeGreaterThan(0); // But may generate warnings for OHLC relationships
    });

    it('should reject data with invalid dates', () => {
      const invalidData: Partial<OHLCData>[] = [
        {
          date: undefined, // Missing date
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000
        }
      ];

      const result = validateOHLCData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty data', () => {
      const result = validateOHLCData([]);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'EMPTY_DATA',
          message: expect.stringContaining('No')
        })
      ]));
    });

    it('should handle missing required fields', () => {
      const invalidData: Partial<OHLCData>[] = [
        {
          date: new Date('2024-01-01'),
          // Missing open, high, low, close
          volume: 1000
        }
      ];

      const result = validateOHLCData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateNumeric', () => {
    it('should validate positive numbers', () => {
      const result = validateNumeric(100);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(100);
    });

    it('should validate zero', () => {
      const result = validateNumeric(0);

      expect(result.isValid).toBe(true);
      expect(result.value).toBe(0);
    });

    it('should apply min constraint', () => {
      const result = validateNumeric(-5, { min: 0 });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('minimum');
    });

    it('should apply max constraint', () => {
      const result = validateNumeric(150, { max: 100 });

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('maximum');
    });

    it('should apply precision constraint', () => {
      const result = validateNumeric(123.456789, { precision: 2 });

      expect(result.isValid).toBe(true);
      expect(result.normalized).toBe(123.46);
    });

    it('should reject non-numeric values', () => {
      const result = validateNumeric('not-a-number');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('number');
    });

    it('should accept infinite values (no specific infinite validation)', () => {
      const result = validateNumeric(Infinity);

      expect(result.isValid).toBe(true); // Current implementation allows Infinity
      expect(result.value).toBe(Infinity);
    });

    it('should reject NaN values', () => {
      const result = validateNumeric(NaN);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('number');
    });
  });

  describe('validateNumber', () => {
    it('should validate numeric values', () => {
      expect(validateNumber(42)).toBe(42);
      expect(validateNumber('123')).toBe(123);
      expect(validateNumber('123.45')).toBe(123.45);
    });

    it('should return null for invalid values', () => {
      expect(validateNumber(null)).toBe(null);
      expect(validateNumber(undefined)).toBe(null);
      expect(validateNumber('')).toBe(null);
      expect(validateNumber('not-a-number')).toBe(null);
      expect(validateNumber(NaN)).toBe(null);
    });

    it('should handle edge cases', () => {
      expect(validateNumber(0)).toBe(0);
      expect(validateNumber('0')).toBe(0);
      expect(validateNumber(-42)).toBe(-42);
      expect(validateNumber(Infinity)).toBe(Infinity);
    });
  });

  describe('parseCSV', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should parse valid CSV file', async () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResults = {
        data: [
          { date: '2024-01-01', open: '100', high: '110', low: '90', close: '105', volume: '1000' },
          { date: '2024-01-02', open: '105', high: '115', low: '95', close: '110', volume: '1200' }
        ],
        errors: [],
        meta: {}
      };

      const mockPapa = await import('papaparse');
      vi.mocked(mockPapa.default.parse).mockImplementation((file, config) => {
        setTimeout(() => config.complete(mockResults), 0);
      });

      const result = await parseCSV(mockFile);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 1000
      });
      expect(result[0].date).toBeInstanceOf(Date);
      expect(result[0].date.getFullYear()).toBe(2024);
      expect(result[0].date.getMonth()).toBe(0); // January
      expect(result[0].date.getDate()).toBe(1);
    });

    it('should handle CSV parsing errors', async () => {
      const mockFile = new File(['invalid'], 'test.csv', { type: 'text/csv' });
      const mockResults = {
        data: [],
        errors: [{ message: 'Parse error' }],
        meta: {}
      };

      const mockPapa = await import('papaparse');
      vi.mocked(mockPapa.default.parse).mockImplementation((file, config) => {
        setTimeout(() => config.complete(mockResults), 0);
      });

      await expect(parseCSV(mockFile)).rejects.toThrow('CSV parsing error: Parse error');
    });

    it('should handle invalid OHLC data in CSV', async () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResults = {
        data: [
          { date: 'invalid-date', open: 'not-a-number', high: '110', low: '90', close: '105', volume: '1000' }
        ],
        errors: [],
        meta: {}
      };

      const mockPapa = await import('papaparse');
      vi.mocked(mockPapa.default.parse).mockImplementation((file, config) => {
        setTimeout(() => config.complete(mockResults), 0);
      });

      await expect(parseCSV(mockFile)).rejects.toThrow();
    });

    it('should handle different column name formats', async () => {
      const mockFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      const mockResults = {
        data: [
          { Date: '2024-01-01', Open: '100', High: '110', Low: '90', Close: '105', Volume: '1000' }
        ],
        errors: [],
        meta: {}
      };

      const mockPapa = await import('papaparse');
      vi.mocked(mockPapa.default.parse).mockImplementation((file, config) => {
        setTimeout(() => config.complete(mockResults), 0);
      });

      const result = await parseCSV(mockFile);

      expect(result).toHaveLength(1);
      expect(result[0].open).toBe(100);
    });
  });
});