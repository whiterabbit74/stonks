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
        // 1999-01-15 -> Should return 1999-01 rate
        const date1 = new Date(1999, 0, 15);
        expect(getRiskFreeRate(date1)).toBeCloseTo(0.0434);

        // 2020-04-01 -> Should return 2020-04 rate (0.0014)
        const date2 = new Date(2020, 3, 1);
        expect(getRiskFreeRate(date2)).toBeCloseTo(0.0014);
    });

    it('should return undefined for future dates or dates out of range', () => {
        // Way in the future (assuming data stops at 2025)
        const dateFuture = new Date(2030, 0, 1);
        expect(getRiskFreeRate(dateFuture)).toBeUndefined();

        // Way in the past
        const datePast = new Date(1980, 0, 1);
        expect(getRiskFreeRate(datePast)).toBeUndefined();
    });
});
