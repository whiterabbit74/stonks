import { describe, it, expect } from 'vitest';
import { getRiskFreeRate, RISK_FREE_RATES } from '../riskFreeRates';

describe('Risk Free Rate Data', () => {
    it('should have data for key historical months', () => {
        expect(RISK_FREE_RATES['1999-01']).toBeCloseTo(0.0434);
        expect(RISK_FREE_RATES['2000-01']).toBeCloseTo(0.0532);
        expect(RISK_FREE_RATES['2008-12']).toBeCloseTo(0.0003); // Near zero era
        expect(RISK_FREE_RATES['2023-01']).toBeCloseTo(0.0454); // Recent high rate era
    });

    it('should return correct rate from helper function', () => {
        expect(getRiskFreeRate('1999-01-15')).toBeCloseTo(0.0434);
        expect(getRiskFreeRate('2020-04-01')).toBeCloseTo(0.0014);
    });

    it('should take the month from the trading date itself', () => {
        // First and last day of a month must resolve to that same month
        expect(getRiskFreeRate('2020-04-30')).toBeCloseTo(0.0014);
        expect(getRiskFreeRate('2020-04-01')).toBe(getRiskFreeRate('2020-04-30'));
    });

    it('should return undefined for future dates or dates out of range', () => {
        expect(getRiskFreeRate('2030-01-01')).toBeUndefined();
        expect(getRiskFreeRate('1980-01-01')).toBeUndefined();
    });
});
