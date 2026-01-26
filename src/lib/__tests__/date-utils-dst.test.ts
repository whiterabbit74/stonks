import { describe, it, expect } from 'vitest';
import { daysBetweenTradingDates, toTradingDate } from '../date-utils';

describe('DST Duration Calculation', () => {
    // Scenario described by user: March 10 to March 18, 2023 (8 days).
    // DST transition in US occurred on March 12, 2023.
    // Clocks moved forward 1 hour.
    // Actual elapsed time: 8 days * 24 hours - 1 hour = 191 hours.
    // 191 / 24 = 7.958333...

    it('should correctly calculate days across DST spring forward (short day)', () => {
        const start = '2023-03-10' as any;
        const end = '2023-03-18' as any;

        const duration = daysBetweenTradingDates(start, end);
        expect(duration).toBe(8);
    });

    it('should correctly calculate days across DST fall back (long day)', () => {
        // DST end 2023: Nov 5.
        const start = '2023-11-01' as any;
        const end = '2023-11-10' as any;
        // 9 days. One day is 25 hours.
        // Total hours: 9 * 24 + 1 = 217 hours.
        // 217 / 24 = 9.0416...

        const duration = daysBetweenTradingDates(start, end);
        expect(duration).toBe(9);
    });

    it('demonstrates why Math.floor fails for short days (simulation)', () => {
        // We simulate the calculation that was causing the bug
        const ONE_DAY_MS = 1000 * 3600 * 24;
        const exactEightDaysMs = 8 * ONE_DAY_MS;
        const shortEightDaysMs = exactEightDaysMs - (1000 * 3600); // minus 1 hour

        // Buggy implementation
        const floorDuration = Math.floor(shortEightDaysMs / ONE_DAY_MS);
        expect(floorDuration).toBe(7); // Truncated to 7

        // Correct implementation
        const roundDuration = Math.round(shortEightDaysMs / ONE_DAY_MS);
        expect(roundDuration).toBe(8); // Correctly rounded to 8
    });
});
