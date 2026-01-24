import { describe, it, expect, vi } from 'vitest';
import { runOptionsBacktest } from '../optionsBacktest';
import type { Trade, OHLCData } from '../../types';

// Mock optionsMath to return predictable values
vi.mock('../optionsMath', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-ignore
        ...actual,
        calculateVolatility: () => 0.2, // Fixed 20% vol
        blackScholes: () => 5.0, // Fixed option price $5.00
        getYearsToMaturity: () => 0.1,
        getExpirationDate: (d: Date) => {
             // Return a date far in the future (e.g., 60 days) to ensure maxHold triggers first
             const newDate = new Date(d);
             newDate.setDate(newDate.getDate() + 60);
             return newDate;
        }
    };
});

describe('runOptionsBacktest - Max Holding Days', () => {
    const createBar = (date: string, close: number): OHLCData => ({
        date,
        open: close,
        high: close,
        low: close,
        close,
        volume: 1000,
        dividend: 0,
        split: 1
    });

    const marketData = [
        createBar('2023-01-01', 100),
        createBar('2023-01-02', 100),
        createBar('2023-01-03', 100),
        createBar('2023-01-04', 100),
        createBar('2023-01-05', 100),
        createBar('2023-01-06', 100), // Day 5 from entry (if entry is day 1)
        createBar('2023-01-07', 100),
        createBar('2023-01-08', 100),
    ];

    const stockTrades: Trade[] = [
        {
            id: 't1',
            entryDate: '2023-01-01',
            exitDate: '2023-01-10', // Signal exit is LATER than max hold
            entryPrice: 100,
            exitPrice: 100,
            quantity: 10,
            context: { ticker: 'AAPL' },
            pnl: 0,
            pnlPercent: 0,
            duration: 10,
            exitReason: 'signal'
        }
    ];

    const config = {
        strikePct: 0,
        volAdjPct: 0,
        capitalPct: 50,
        expirationWeeks: 8, // Long expiration
        maxHoldingDays: 5 // Short holding limit
    };

    it('should exit trade when max holding days is reached', () => {
        const result = runOptionsBacktest(stockTrades, marketData, config);

        expect(result.trades).toHaveLength(1);
        const trade = result.trades[0];

        // Entry: 2023-01-01
        // Max Hold: 5 days
        // Expected Exit: 2023-01-06 (or around depending on calculation)
        // 1 -> 2 (1 day)
        // 1 -> 6 (5 days)

        expect(trade.exitDate).toBe('2023-01-06');
        expect(trade.exitReason).toBe('max_hold');
    });

    it('should NOT exit due to max hold if signal exit is earlier', () => {
        const earlyExitTrades: Trade[] = [
             {
                id: 't2',
                entryDate: '2023-01-01',
                exitDate: '2023-01-03', // Signal exit on Day 3
                entryPrice: 100,
                exitPrice: 100,
                quantity: 10,
                context: { ticker: 'AAPL' },
                pnl: 0,
                pnlPercent: 0,
                duration: 2,
                exitReason: 'signal'
            }
        ];

        // Config max hold is still 5
        const result = runOptionsBacktest(earlyExitTrades, marketData, config);

        expect(result.trades).toHaveLength(1);
        const trade = result.trades[0];

        expect(trade.exitDate).toBe('2023-01-03');
        expect(trade.exitReason).not.toBe('max_hold');
    });
});
