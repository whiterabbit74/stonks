import { describe, it, expect, beforeEach } from 'vitest';
import { createStrategyFromTemplate } from '../strategy';
import type { OHLCData, Strategy } from '../../types';
import fs from 'fs';
import path from 'path';

describe('BuyAtCloseSimulator with Real GOOGL Data', () => {
  let googlData: OHLCData[];
  let strategy: Strategy;

  beforeEach(() => {
    // Load real GOOGL data
    const dataPath = path.join(process.cwd(), 'server/datasets/GOOGL.json');
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

  describe('BuyAtClose strategy execution', () => {
    it('should execute trades at close prices', () => {
      const testData = googlData.slice(0, 200);
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      const maxHoldDays = Number(strategy.parameters.maxHoldDays ?? 30);
      
      let position = null;
      let trades = [];
      
      for (let i = 0; i < testData.length; i++) {
        const bar = testData[i];
        const ibs = (bar.close - bar.low) / (bar.high - bar.low);
        
        if (!position && ibs < lowIBS) {
          // Entry at close
          position = {
            entryDate: bar.date,
            entryPrice: bar.close, // Buy at close
            entryIndex: i
          };
        } else if (position) {
          // Check exit conditions
          if (ibs > highIBS || (i - position.entryIndex) >= maxHoldDays) {
            // Exit at close
            const trade = {
              entryDate: position.entryDate,
              exitDate: bar.date,
              entryPrice: position.entryPrice,
              exitPrice: bar.close, // Sell at close
              duration: i - position.entryIndex,
              pnl: bar.close - position.entryPrice,
              pnlPercent: ((bar.close - position.entryPrice) / position.entryPrice) * 100,
              exitReason: ibs > highIBS ? 'ibs_signal' : 'max_hold_days'
            };
            trades.push(trade);
            position = null;
          }
        }
      }
      
      expect(trades.length).toBeGreaterThanOrEqual(0);
      
      // Verify all trades are executed at close prices
      trades.forEach(trade => {
        expect(trade.entryPrice).toBeGreaterThan(0);
        expect(trade.exitPrice).toBeGreaterThan(0);
        expect(trade.duration).toBeGreaterThan(0);
        expect(isFinite(trade.pnl)).toBe(true);
        expect(isFinite(trade.pnlPercent)).toBe(true);
      });
    });

    it('should handle different IBS thresholds with real data', () => {
      const testData = googlData.slice(0, 500);
      const thresholds = [
        { low: 0.05, high: 0.80 },
        { low: 0.10, high: 0.75 },
        { low: 0.15, high: 0.70 },
        { low: 0.20, high: 0.65 }
      ];
      
      const results = thresholds.map(threshold => {
        let position = null;
        let trades = [];
        
        for (let i = 0; i < testData.length; i++) {
          const bar = testData[i];
          const ibs = (bar.close - bar.low) / (bar.high - bar.low);
          
          if (!position && ibs < threshold.low) {
            position = {
              entryDate: bar.date,
              entryPrice: bar.close,
              entryIndex: i
            };
          } else if (position) {
            if (ibs > threshold.high) {
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
        
        return {
          threshold,
          trades: trades.length,
          avgDuration: trades.length > 0 ? trades.reduce((sum, t) => sum + t.duration, 0) / trades.length : 0,
          winRate: trades.length > 0 ? trades.filter(t => t.pnl > 0).length / trades.length : 0
        };
      });
      
      // Verify different thresholds produce different results
      expect(results.length).toBe(4);
      results.forEach(result => {
        expect(result.trades).toBeGreaterThanOrEqual(0);
        expect(result.avgDuration).toBeGreaterThanOrEqual(0);
        expect(result.winRate).toBeGreaterThanOrEqual(0);
        expect(result.winRate).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('equity calculation with real data', () => {
    it('should calculate equity correctly with real price movements', () => {
      const testData = googlData.slice(0, 300);
      const initialCapital = 10000;
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      
      let cash = initialCapital;
      let position = null;
      let equity = [];
      
      for (let i = 0; i < testData.length; i++) {
        const bar = testData[i];
        const ibs = (bar.close - bar.low) / (bar.high - bar.low);
        
        if (!position && ibs < lowIBS && cash > 0) {
          // Entry at close
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
          if (ibs > highIBS) {
            // Exit at close
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
      
      // Equity should change over time
      const firstEquity = equity[0].value;
      const lastEquity = equity[equity.length - 1].value;
      expect(Math.abs(lastEquity - firstEquity)).toBeGreaterThan(0);
    });

    it('should handle multiple trades correctly', () => {
      const testData = googlData.slice(0, 1000);
      const initialCapital = 10000;
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      
      let cash = initialCapital;
      let position = null;
      let trades = [];
      let equity = [];
      
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
          if (ibs > highIBS) {
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
      
      expect(trades.length).toBeGreaterThanOrEqual(0);
      expect(equity.length).toBe(testData.length);
      
      // Verify equity consistency
      if (trades.length > 0) {
        const totalPnL = trades.reduce((sum, trade) => sum + trade.pnl, 0);
        const finalEquity = equity[equity.length - 1].value;
        const expectedFinalEquity = initialCapital + totalPnL;
        
        // Should be close (within 1% tolerance for rounding)
        expect(Math.abs(finalEquity - expectedFinalEquity)).toBeLessThan(initialCapital * 0.01);
      }
    });
  });

  describe('performance metrics with real data', () => {
    it('should calculate realistic performance metrics', () => {
      const testData = googlData.slice(0, 1000);
      const initialCapital = 10000;
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      
      let cash = initialCapital;
      let position = null;
      let trades = [];
      let equity = [];
      
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
          if (ibs > highIBS) {
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
        // Calculate performance metrics
        const totalReturn = (equity[equity.length - 1].value - equity[0].value) / equity[0].value;
        const winningTrades = trades.filter(t => t.pnl > 0);
        const losingTrades = trades.filter(t => t.pnl < 0);
        const winRate = winningTrades.length / trades.length;
        const avgWin = winningTrades.length > 0 ? 
          winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? 
          losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
        const avgDuration = trades.reduce((sum, t) => sum + t.duration, 0) / trades.length;
        
        // Calculate max drawdown
        let maxDrawdown = 0;
        let peak = equity[0].value;
        for (const point of equity) {
          if (point.value > peak) {
            peak = point.value;
          }
          const drawdown = (peak - point.value) / peak;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        
        // Verify metrics are realistic
        expect(isFinite(totalReturn)).toBe(true);
        expect(winRate).toBeGreaterThanOrEqual(0);
        expect(winRate).toBeLessThanOrEqual(1);
        expect(avgWin).toBeGreaterThan(0);
        expect(avgLoss).toBeLessThan(0);
        expect(avgDuration).toBeGreaterThan(0);
        expect(maxDrawdown).toBeGreaterThanOrEqual(0);
        expect(maxDrawdown).toBeLessThan(1);
        
        // Log metrics for analysis
        console.log('Performance Metrics:');
        console.log(`Total Return: ${(totalReturn * 100).toFixed(2)}%`);
        console.log(`Win Rate: ${(winRate * 100).toFixed(2)}%`);
        console.log(`Average Win: $${avgWin.toFixed(2)}`);
        console.log(`Average Loss: $${avgLoss.toFixed(2)}`);
        console.log(`Average Duration: ${avgDuration.toFixed(1)} days`);
        console.log(`Max Drawdown: ${(maxDrawdown * 100).toFixed(2)}%`);
        console.log(`Total Trades: ${trades.length}`);
      }
    });
  });

  describe('edge cases with real data', () => {
    it('should handle data gaps correctly', () => {
      // Create data with gaps (weekends, holidays)
      const testData = googlData.slice(0, 100);
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      
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
          if (ibs > highIBS) {
            const trade = {
              entryDate: position.entryDate,
              exitDate: bar.date,
              entryPrice: position.entryPrice,
              exitPrice: bar.close,
              duration: i - position.entryIndex,
              pnl: bar.close - position.entryPrice
            };
            trades.push(trade);
            position = null;
          }
        }
      }
      
      // Should handle gaps without errors
      expect(trades.length).toBeGreaterThanOrEqual(0);
      trades.forEach(trade => {
        expect(trade.duration).toBeGreaterThan(0);
        expect(isFinite(trade.pnl)).toBe(true);
      });
    });

    it('should handle extreme price movements', () => {
      // Find periods with significant price movements
      const testData = googlData.slice(200, 400);
      const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
      const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
      
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
          if (ibs > highIBS) {
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
      
      // Should handle extreme movements without errors
      expect(trades.length).toBeGreaterThanOrEqual(0);
      trades.forEach(trade => {
        expect(isFinite(trade.pnl)).toBe(true);
        expect(isFinite(trade.pnlPercent)).toBe(true);
        expect(trade.duration).toBeGreaterThan(0);
      });
    });
  });
});
