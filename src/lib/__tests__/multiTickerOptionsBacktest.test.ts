import { describe, it, expect, vi } from 'vitest';
import { runMultiTickerOptionsBacktest } from '../optionsBacktest';
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
             const newDate = new Date(d);
             newDate.setDate(newDate.getDate() + 30);
             return newDate;
        }
    };
});

describe('runMultiTickerOptionsBacktest', () => {
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

    const tickersData = [
        {
            ticker: 'AAPL',
            data: [
                createBar('2023-01-01', 100),
                createBar('2023-01-02', 100),
                createBar('2023-01-03', 105), // Exit day
                createBar('2023-01-04', 105),
            ]
        },
        {
            ticker: 'MSFT',
            data: [
                createBar('2023-01-01', 200),
                createBar('2023-01-02', 200),
                createBar('2023-01-03', 200),
                createBar('2023-01-04', 210), // Exit day
            ]
        }
    ];

    const stockTrades: Trade[] = [
        {
            id: 't1',
            entryDate: '2023-01-01',
            exitDate: '2023-01-03',
            entryPrice: 100,
            exitPrice: 105,
            quantity: 10,
            context: { ticker: 'AAPL' }
        },
        {
            id: 't2',
            entryDate: '2023-01-02',
            exitDate: '2023-01-04',
            entryPrice: 200,
            exitPrice: 210,
            quantity: 5,
            context: { ticker: 'MSFT' }
        }
    ];

    const config = {
        strikePct: 0,
        volAdjPct: 0,
        capitalPct: 50, // Invest 50% of capital
        expirationWeeks: 4
    };

    it('should share capital between tickers', () => {
        // Initial Capital = 10,000
        // Day 1 (2023-01-01): AAPL Trade.
        // Capital = 10,000. Invest 50% = 5,000.
        // Option Price Mocked = $5.00.
        // Contracts = 5000 / (5 * 100) = 10 contracts.
        // Cost = 10 * 5 * 100 = 5000.
        // Remaining Cash = 5000.

        // Day 2 (2023-01-02): MSFT Trade.
        // Current Capital (Cash) = 5000.
        // Invest 50% = 2500.
        // Contracts = 2500 / (5 * 100) = 5 contracts.
        // Cost = 5 * 5 * 100 = 2500.
        // Remaining Cash = 2500.

        // Day 3 (2023-01-03): AAPL Exit.
        // Price Mocked = $5.00 (We mocked it constant for simplicity, ideally it should change but here we test flow).
        // Let's assume price stays $5.
        // Proceeds = 10 contracts * 5 * 100 = 5000.
        // Cash = 2500 + 5000 = 7500.

        // Day 4 (2023-01-04): MSFT Exit.
        // Proceeds = 5 contracts * 5 * 100 = 2500.
        // Cash = 7500 + 2500 = 10000.

        const result = runMultiTickerOptionsBacktest(stockTrades, tickersData, config);

        expect(result.trades).toHaveLength(2);

        const aaplTrade = result.trades.find(t => t.context?.ticker === 'AAPL');
        const msftTrade = result.trades.find(t => t.context?.ticker === 'MSFT');

        expect(aaplTrade).toBeDefined();
        expect(msftTrade).toBeDefined();

        // AAPL should have 10 contracts (50% of 10k)
        expect(aaplTrade?.contracts).toBe(10);

        // MSFT should have 5 contracts (50% of remaining 5k)
        // This PROVES they share capital. If independent, MSFT would have 10 contracts (50% of 10k).
        expect(msftTrade?.contracts).toBe(5);

        // Final value should be 10000 (since price didn't move in mock)
        expect(result.finalValue).toBe(10000);
    });
});
