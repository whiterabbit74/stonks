import { describe, it, expect } from 'vitest';
import { CleanBacktestEngine } from '../clean-backtest';
import { createDefaultStrategy } from '../strategy';
import { toTradingDate } from '../date-utils';
import GOOGLData from '../../data/GOOGL.json';
import type { OHLCData } from '../../types';

describe('GOOGL Trades Count Verification', () => {
  it('should generate 402 trades for GOOGL data', () => {
    // Load GOOGL data
    const rawData = GOOGLData.data as any[];

    // Convert to OHLCData format
    const data: OHLCData[] = rawData.map(item => ({
      date: toTradingDate(new Date(item.date)),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume || 0
    }));

    // Create strategy with our specific parameters
    const strategy = createDefaultStrategy();
    strategy.parameters = {
      lowIBS: 0.1,
      highIBS: 0.75,
      maxHoldDays: 30
    };
    strategy.riskManagement.initialCapital = 10000;
    strategy.positionSizing.capitalUsagePercent = 100;

    // Run backtest
    const engine = new CleanBacktestEngine(data, strategy);
    const result = engine.runBacktest();

    console.log(`📊 GOOGL Data Analysis:`);
    console.log(`   Total data points: ${data.length}`);
    console.log(`   Date range: ${data[0].date} to ${data[data.length - 1].date}`);
    console.log(`   Generated trades: ${result.trades.length}`);
    console.log(`   Expected trades: 402`);

    if (result.trades.length > 0) {
      console.log(`   First trade: ${result.trades[0].entryDate} - ${result.trades[0].exitDate}`);
      console.log(`   Last trade: ${result.trades[result.trades.length - 1].entryDate} - ${result.trades[result.trades.length - 1].exitDate}`);
    }

    // Check if we get exactly 402 trades with our specific parameters
    expect(result.trades.length).toBe(402); // Exact result with IBS < 0.1, IBS > 0.75, 30 days
  });

  it('should analyze GOOGL data structure', () => {
    const rawData = GOOGLData.data as any[];

    console.log(`📈 GOOGL Data Structure:`);
    console.log(`   Total records: ${rawData.length}`);
    console.log(`   First record: ${rawData[0].date} - O:${rawData[0].open} H:${rawData[0].high} L:${rawData[0].low} C:${rawData[0].close}`);
    console.log(`   Last record: ${rawData[rawData.length - 1].date} - O:${rawData[rawData.length - 1].open} H:${rawData[rawData.length - 1].high} L:${rawData[rawData.length - 1].low} C:${rawData[rawData.length - 1].close}`);

    // Check data integrity
    expect(rawData.length).toBeGreaterThan(4000); // Should have many years of data
    expect(rawData[0].date).toContain('2004'); // Should start from 2004
    expect(rawData[rawData.length - 1].date).toContain('2025'); // Should go to recent years
  });

  it('should test different strategy parameters for GOOGL', () => {
    const rawData = GOOGLData.data as any[];
    const data: OHLCData[] = rawData.map(item => ({
      date: toTradingDate(new Date(item.date)),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume || 0
    }));

    const strategy = createDefaultStrategy();
    strategy.riskManagement.initialCapital = 10000;
    strategy.positionSizing.capitalUsagePercent = 100;

    // Test our specific parameters and variations
    const testCases = [
      { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30, expectedMin: 300 }, // Our main strategy
      { lowIBS: 0.05, highIBS: 0.75, maxHoldDays: 30, expectedMin: 200 }, // More aggressive entry (fewer trades)
      { lowIBS: 0.1, highIBS: 0.8, maxHoldDays: 30, expectedMin: 300 } // More conservative exit
    ];

    testCases.forEach((testCase, index) => {
      strategy.parameters = {
        lowIBS: testCase.lowIBS,
        highIBS: testCase.highIBS,
        maxHoldDays: testCase.maxHoldDays
      };

      const engine = new CleanBacktestEngine(data, strategy);
      const result = engine.runBacktest();

      console.log(`📊 Test Case ${index + 1}:`);
      console.log(`   Parameters: lowIBS=${testCase.lowIBS}, highIBS=${testCase.highIBS}, maxHoldDays=${testCase.maxHoldDays}`);
      console.log(`   Trades generated: ${result.trades.length}`);
      console.log(`   Expected minimum: ${testCase.expectedMin}`);

      expect(result.trades.length).toBeGreaterThanOrEqual(testCase.expectedMin);
    });
  });
});
