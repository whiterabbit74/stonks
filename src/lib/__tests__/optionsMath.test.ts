import { describe, it, expect } from 'vitest';
import { blackScholes, calculateVolatility, getExpirationDate, getYearsToMaturity } from '../optionsMath';

describe('Options Math Utilities', () => {
  describe('blackScholes', () => {
    it('should calculate call price correctly (standard example)', () => {
      // S=100, K=100, T=1, r=0.05, sigma=0.2
      // Expected Call Price ~ 10.45
      const price = blackScholes('call', 100, 100, 1, 0.05, 0.2);
      expect(price).toBeCloseTo(10.45, 2);
    });

    it('should be close to zero for deep OTM call', () => {
      const price = blackScholes('call', 50, 100, 0.1, 0.05, 0.2);
      expect(price).toBeLessThan(0.01);
    });

    it('should be close to intrinsic value for deep ITM call (T->0)', () => {
      const price = blackScholes('call', 150, 100, 0.0001, 0.05, 0.2);
      expect(price).toBeCloseTo(50, 0);
    });
  });

  describe('calculateVolatility', () => {
    it('should return 0 for insufficient data', () => {
      expect(calculateVolatility([100])).toBe(0);
    });

    it('should calculate volatility correctly for flat prices', () => {
      const prices = Array(30).fill(100);
      expect(calculateVolatility(prices)).toBe(0);
    });

    // Simple manual calc check:
    // P0=100, P1=110. ln(1.1) approx 0.0953.
    // Mean = 0.0953. Var = 0 (1 point return? need >1 returns).
    // calculateVolatility needs at least 3 points to have >1 returns for meaningful stddev?
    // Actually n returns, div by n-1. So need at least 2 returns (3 prices).
  });

  describe('getExpirationDate', () => {
    it('should find next Friday roughly a month away', () => {
      // 2023-01-01 is Sunday.
      // +30 days = 2023-01-31 (Tuesday).
      // Next Friday from Tuesday is 2023-02-03.
      const start = new Date('2023-01-01T12:00:00Z');
      const expiry = getExpirationDate(start);
      expect(expiry.toISOString().slice(0, 10)).toBe('2023-02-03');
      expect(expiry.getDay()).toBe(5); // Friday
    });

    it('should handle wrapping correctly', () => {
      // 2023-01-27 is Friday.
      // +30 days = 2023-02-26 (Sunday).
      // Next Friday is 2023-03-03.
      const start = new Date('2023-01-27T12:00:00Z');
      const expiry = getExpirationDate(start);
      expect(expiry.getDay()).toBe(5);
      const diffDays = (expiry.getTime() - start.getTime()) / (1000 * 3600 * 24);
      expect(diffDays).toBeGreaterThan(28);
      expect(diffDays).toBeLessThan(45);
    });
  });

  describe('getYearsToMaturity', () => {
      it('should calculate fractional years correctly', () => {
          const d1 = new Date('2023-01-01');
          const d2 = new Date('2024-01-01');
          const T = getYearsToMaturity(d1, d2);
          expect(T).toBeCloseTo(1.0, 2);
      });
  });
});
