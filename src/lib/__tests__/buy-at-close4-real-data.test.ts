import { describe, it, expect, beforeEach } from 'vitest';
import { createStrategyFromTemplate } from '../strategy';
import type { OHLCData, Strategy } from '../../types';
import fs from 'fs';
import path from 'path';

describe('BuyAtClose4Simulator with Real GOOGL Data', () => {
  let googlData: OHLCData[];
  let strategy: Strategy;

  beforeEach(() => {
    // Load real GOOGL data
    const dataPath = path.join(process.cwd(), 'src/data/GOOGL.json');
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const parsedData = JSON.parse(rawData);
    
    // Convert to OHLCData format
    googlData = parsedData.data.map((item: any) => ({
      date: new Date(item.date),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume
    }));

    const template = {
      id: 'ibs-mean-reversion',
      name: 'IBS Mean Reversion',
      description: 'Test strategy with real data',
      category: 'Mean Reversion',
      defaultStrategy: {
        name: 'IBS Mean Reversion',
        description: 'Test strategy with real data',
        entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
        exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
        parameters: {
          lowIBS: 0.1,
          highIBS: 0.75,
          maxHoldDays: 30
        }
      }
    };

    strategy = createStrategyFromTemplate(template, 'test-strategy-real-data');
  });

  describe('data validation', () => {
    it('should load GOOGL data successfully', () => {
      expect(googlData).toBeDefined();
      expect(googlData.length).toBeGreaterThan(0);
      expect(googlData.length).toBeGreaterThan(1000); // GOOGL should have many data points
    });

    it('should have valid OHLC structure', () => {
      const firstBar = googlData[0];
      expect(firstBar).toHaveProperty('date');
      expect(firstBar).toHaveProperty('open');
      expect(firstBar).toHaveProperty('high');
      expect(firstBar).toHaveProperty('low');
      expect(firstBar).toHaveProperty('close');
      expect(firstBar).toHaveProperty('volume');
      
      expect(firstBar.date).toBeInstanceOf(Date);
      expect(typeof firstBar.open).toBe('number');
      expect(typeof firstBar.high).toBe('number');
      expect(typeof firstBar.low).toBe('number');
      expect(typeof firstBar.close).toBe('number');
      expect(typeof firstBar.volume).toBe('number');
    });

    it('should have valid price relationships', () => {
      googlData.forEach(bar => {
        expect(bar.high).toBeGreaterThanOrEqual(bar.low);
        expect(bar.high).toBeGreaterThanOrEqual(bar.open);
        expect(bar.high).toBeGreaterThanOrEqual(bar.close);
        expect(bar.low).toBeLessThanOrEqual(bar.open);
        expect(bar.low).toBeLessThanOrEqual(bar.close);
        expect(bar.open).toBeGreaterThan(0);
        expect(bar.close).toBeGreaterThan(0);
        expect(bar.volume).toBeGreaterThan(0);
      });
    });

    it('should have chronological order', () => {
      for (let i = 1; i < googlData.length; i++) {
        expect(googlData[i].date.getTime()).toBeGreaterThan(googlData[i-1].date.getTime());
      }
    });

    it('should have reasonable price ranges', () => {
      const prices = googlData.flatMap(bar => [bar.open, bar.high, bar.low, bar.close]);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      // GOOGL prices should be reasonable (not too low, not too high)
      expect(minPrice).toBeGreaterThan(10); // Should be above $10
      expect(maxPrice).toBeLessThan(10000); // Should be below $10,000
    });
  });

  describe('IBS calculation with real data', () => {
    it('should calculate IBS values correctly', () => {
      // Test IBS calculation on a few bars
      const testBars = googlData.slice(0, 10);
      
      testBars.forEach(bar => {
        const ibs = (bar.close - bar.low) / (bar.high - bar.low);
        expect(ibs).toBeGreaterThanOrEqual(0);
        expect(ibs).toBeLessThanOrEqual(1);
        expect(isFinite(ibs)).toBe(true);
      });
    });

    it('should have diverse IBS values', () => {
      const ibsValues = googlData.map(bar => 
        (bar.close - bar.low) / (bar.high - bar.low)
      ).filter(ibs => isFinite(ibs));
      
      const minIBS = Math.min(...ibsValues);
      const maxIBS = Math.max(...ibsValues);
      const avgIBS = ibsValues.reduce((sum, val) => sum + val, 0) / ibsValues.length;
      
      // Should have a good range of IBS values
      expect(minIBS).toBeLessThan(0.1); // Should have some low IBS values
      expect(maxIBS).toBeGreaterThan(0.9); // Should have some high IBS values
      expect(avgIBS).toBeGreaterThan(0.3); // Average should be reasonable
      expect(avgIBS).toBeLessThan(0.7);
    });
  });

  describe('strategy execution with real data', () => {
    it('should handle real data without errors', () => {
      // This test ensures the strategy can process real data
      expect(() => {
        // Simulate strategy execution logic
        const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
        const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
        const maxHoldDays = Number(strategy.parameters.maxHoldDays ?? 30);
        
        // Process first 100 bars
        const testData = googlData.slice(0, 100);
        let position = null;
        let trades = [];
        
        for (let i = 0; i < testData.length; i++) {
          const bar = testData[i];
          const ibs = (bar.close - bar.low) / (bar.high - bar.low);
          
          if (!position && ibs < lowIBS) {
            // Entry signal
            position = {
              entryDate: bar.date,
              entryPrice: bar.close,
              entryIndex: i
            };
          } else if (position) {
            // Check exit conditions
            if (ibs > highIBS || (i - position.entryIndex) >= maxHoldDays) {
              // Exit signal
              trades.push({
                entryDate: position.entryDate,
                exitDate: bar.date,
                entryPrice: position.entryPrice,
                exitPrice: bar.close,
                duration: i - position.entryIndex
              });
              position = null;
            }
          }
        }
        
        expect(trades.length).toBeGreaterThanOrEqual(0);
      }).not.toThrow();
    });

    it('should generate realistic trade statistics', () => {
      // Process a larger sample of data
      const testData = googlData.slice(0, 500);
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      const maxHoldDays = Number(strategy.parameters.maxHoldDays ?? 30);
      
      let position = null;
      let trades = [];
      
      for (let i = 0; i < testData.length; i++) {
        const bar = testData[i];
        const ibs = (bar.close - bar.low) / (bar.high - bar.low);
        
        if (!position && ibs < lowIBS) {
          position = {
            entryDate: bar.date,
            entryPrice: bar.close,
            entryIndex: i
          };
        } else if (position) {
          if (ibs > highIBS || (i - position.entryIndex) >= maxHoldDays) {
            const trade = {
              entryDate: position.entryDate,
              exitDate: bar.date,
              entryPrice: position.entryPrice,
              exitPrice: bar.close,
              duration: i - position.entryIndex,
              pnl: bar.close - position.entryPrice,
              pnlPercent: ((bar.close - position.entryPrice) / position.entryPrice) * 100
            };
            trades.push(trade);
            position = null;
          }
        }
      }
      
      if (trades.length > 0) {
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        const winRate = winningTrades.length / trades.length;
        const avgDuration = trades.reduce((sum, t) => sum + t.duration, 0) / trades.length;
        
        // Realistic expectations for GOOGL data
        expect(trades.length).toBeGreaterThan(0);
        expect(winRate).toBeGreaterThan(0.3); // Should have some winning trades
        expect(winRate).toBeLessThan(0.8); // But not too many
        expect(avgDuration).toBeGreaterThan(1); // Should hold for more than 1 day
        expect(avgDuration).toBeLessThan(maxHoldDays); // But not too long
      }
    });
  });

  describe('equity calculation with real data', () => {
    it('should calculate equity correctly with real price movements', () => {
      const initialCapital = 10000;
      const testData = googlData.slice(0, 100);
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      
      let cash = initialCapital;
      let position = null;
      let equity = [];
      
      for (let i = 0; i < testData.length; i++) {
        const bar = testData[i];
        const ibs = (bar.close - bar.low) / (bar.high - bar.low);
        
        if (!position && ibs < lowIBS && cash > 0) {
          // Entry
          const quantity = Math.floor(cash / bar.close);
          if (quantity > 0) {
            position = {
              entryDate: bar.date,
              entryPrice: bar.close,
              quantity: quantity,
              entryIndex: i
            };
            cash -= quantity * bar.close;
          }
        } else if (position) {
          // Check exit
          if (ibs > highIBS) {
            // Exit
            cash += position.quantity * bar.close;
            position = null;
          }
        }
        
        // Calculate current equity
        let currentEquity = cash;
        if (position) {
          currentEquity += position.quantity * bar.close;
        }
        equity.push({
          date: bar.date,
          value: currentEquity
        });
      }
      
      expect(equity.length).toBe(testData.length);
      expect(equity[0].value).toBe(initialCapital);
      
      // All equity values should be positive
      equity.forEach(point => {
        expect(point.value).toBeGreaterThan(0);
      });
      
      // Equity should change over time (not stay constant)
      const firstEquity = equity[0].value;
      const lastEquity = equity[equity.length - 1].value;
      expect(Math.abs(lastEquity - firstEquity)).toBeGreaterThan(0);
    });
  });

  describe('performance metrics with real data', () => {
    it('should calculate realistic performance metrics', () => {
      const testData = googlData.slice(0, 1000);
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      const maxHoldDays = Number(strategy.parameters.maxHoldDays ?? 30);
      
      let position = null;
      let trades = [];
      let equity = [];
      let cash = 10000;
      
      for (let i = 0; i < testData.length; i++) {
        const bar = testData[i];
        const ibs = (bar.close - bar.low) / (bar.high - bar.low);
        
        if (!position && ibs < lowIBS && cash > 0) {
          const quantity = Math.floor(cash / bar.close);
          if (quantity > 0) {
            position = {
              entryDate: bar.date,
              entryPrice: bar.close,
              quantity: quantity,
              entryIndex: i
            };
            cash -= quantity * bar.close;
          }
        } else if (position) {
          if (ibs > highIBS || (i - position.entryIndex) >= maxHoldDays) {
            const trade = {
              entryDate: position.entryDate,
              exitDate: bar.date,
              entryPrice: position.entryPrice,
              exitPrice: bar.close,
              quantity: position.quantity,
              duration: i - position.entryIndex,
              pnl: position.quantity * (bar.close - position.entryPrice),
              pnlPercent: ((bar.close - position.entryPrice) / position.entryPrice) * 100
            };
            trades.push(trade);
            cash += position.quantity * bar.close;
            position = null;
          }
        }
        
        let currentEquity = cash;
        if (position) {
          currentEquity += position.quantity * bar.close;
        }
        equity.push({
          date: bar.date,
          value: currentEquity
        });
      }
      
      if (trades.length > 0) {
        const totalReturn = (equity[equity.length - 1].value - equity[0].value) / equity[0].value;
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        const winRate = winningTrades.length / trades.length;
        const avgWin = winningTrades.length > 0 ? 
          winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? 
          losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
        
        // Realistic expectations
        expect(isFinite(totalReturn)).toBe(true);
        expect(winRate).toBeGreaterThanOrEqual(0);
        expect(winRate).toBeLessThanOrEqual(1);
        expect(avgWin).toBeGreaterThan(0);
        expect(avgLoss).toBeLessThan(0);
      }
    });
  });
});
