import { describe, it, expect } from 'vitest';
import { blackScholes, calculateVolatility, getExpirationDate, getYearsToMaturity } from '../optionsMath';
import { dayOfWeekTradingDate } from '../date-utils';

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
      // 2023-01-01 is Sunday. +4 weeks = 2023-01-29 (Sunday).
      // Next Friday from Sunday is 2023-02-03.
      expect(getExpirationDate('2023-01-01')).toBe('2023-02-03');
      expect(dayOfWeekTradingDate(getExpirationDate('2023-01-01'))).toBe(5);
    });

    it('should expire the same day when it lands on a Friday', () => {
      // 2023-01-27 is Friday, +4 weeks = 2023-02-24, also Friday
      expect(getExpirationDate('2023-01-27')).toBe('2023-02-24');
    });

    it('should not depend on the machine timezone', () => {
      // The whole app lives in the exchange's calendar: the same input date
      // must always give the same expiration string
      expect(getExpirationDate('2000-01-03')).toBe('2000-02-04');
      expect(getExpirationDate('2024-12-31', 1)).toBe('2025-01-10');
    });
  });

  describe('getYearsToMaturity', () => {
      it('should calculate fractional years correctly', () => {
          expect(getYearsToMaturity('2023-01-01', '2024-01-01')).toBeCloseTo(1.0, 2);
      });

      it('should be zero on the expiration day', () => {
          expect(getYearsToMaturity('2024-03-15', '2024-03-15')).toBe(0);
      });
  });
});
