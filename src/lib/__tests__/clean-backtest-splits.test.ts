import { describe, it, expect, beforeEach } from 'vitest';
import { CleanBacktestEngine } from '../clean-backtest';
import type { OHLCData, Strategy, SplitEvent } from '../../types';

// Реальные данные GOOGL с известными сплитами
const googlSplits: SplitEvent[] = [
  { date: '2022-07-15', factor: 20 }, // 20:1 split
  { date: '2014-04-02', factor: 2 }   // 2:1 split
];

// Тестовые данные GOOGL с IBS сигналами (close близко к low для IBS < 0.1)
const testData: OHLCData[] = [
  // До сплита 2014-04-02 (цены ~$1000+)
  { date: '2014-03-31', open: 1000, high: 1010, low: 990, close: 1005, volume: 1000 },
  { date: '2014-04-01', open: 1005, high: 1015, low: 995, close: 1010, volume: 1000 },
  { date: '2014-04-02', open: 1010, high: 1020, low: 1000, close: 1015, volume: 1000 },

  // После сплита 2014-04-02 (цены ~$500+) - IBS < 0.1 для входа (close близко к low)
  { date: '2014-04-03', open: 505, high: 510, low: 500, close: 501, volume: 2000 }, // IBS = (501-500)/(510-500) = 0.1
  { date: '2014-04-04', open: 501, high: 510, low: 500, close: 500.5, volume: 2000 }, // IBS = 0.05 < 0.1
  { date: '2014-04-05', open: 500.5, high: 520, low: 500, close: 515, volume: 2000 }, // IBS = 0.75 для выхода
  { date: '2014-04-06', open: 515, high: 525, low: 512, close: 520, volume: 2000 },

  // До сплита 2022-07-15 (цены ~$2000+)
  { date: '2022-07-14', open: 2000, high: 2010, low: 1990, close: 2005, volume: 1000 },
  { date: '2022-07-15', open: 2005, high: 2015, low: 1995, close: 2010, volume: 1000 },

  // После сплита 2022-07-15 (цены ~$100+) - IBS < 0.1 для входа (close близко к low)
  { date: '2022-07-16', open: 100.25, high: 100.75, low: 99.75, close: 100, volume: 20000 }, // IBS = 0.25
  { date: '2022-07-17', open: 100, high: 101, low: 99.5, close: 99.6, volume: 20000 }, // IBS = 0.067 < 0.1
  { date: '2022-07-18', open: 99.6, high: 101.5, low: 99.5, close: 101, volume: 20000 }, // IBS = 0.75 для выхода
  { date: '2022-07-19', open: 101, high: 102, low: 100.5, close: 101.5, volume: 20000 },
];

const defaultStrategy: Strategy = {
  parameters: {
    lowIBS: 0.1,
    highIBS: 0.75,
    maxHoldDays: 30
  },
  riskManagement: {
    initialCapital: 10000,
    capitalUsage: 100,
    commission: { type: 'percentage', percentage: 0.1 },
    slippage: 0
  },
  positionSizing: { type: 'percentage', value: 10 }
};

describe('CleanBacktestEngine with Splits', () => {
  let engine: CleanBacktestEngine;

  beforeEach(() => {
    engine = new CleanBacktestEngine(testData, defaultStrategy, {
      entryExecution: 'close',
      ignoreMaxHoldDaysExit: false,
      ibsExitRequireAboveEntry: false,
      splits: googlSplits
    });
  });

  it('should apply splits correctly to price data', () => {
    const result = engine.runBacktest();

    // Проверяем, что сплиты применены
    expect(result.trades.length).toBeGreaterThan(0);

    // Проверяем, что цены после сплитов стали реалистичными
    const tradesAfter2022Split = result.trades.filter(trade =>
      trade.entryDate >= '2022-07-15'
    );

    if (tradesAfter2022Split.length > 0) {
      const trade = tradesAfter2022Split[0];
      // После сплита 20:1 цены должны быть в районе $100, а не $2000+
      expect(trade.entryPrice).toBeLessThan(200);
      expect(trade.exitPrice).toBeLessThan(200);
    }
  });

  it('should generate realistic trade quantities after splits', () => {
    const result = engine.runBacktest();

    // Проверяем, что количество акций стало реалистичным
    result.trades.forEach(trade => {
      // После сплитов количество акций должно быть разумным
      expect(trade.quantity).toBeGreaterThan(0);
      expect(trade.quantity).toBeLessThan(10000); // Не должно быть слишком много
    });
  });

  it('should calculate realistic PnL after splits', () => {
    const result = engine.runBacktest();

    // Проверяем, что PnL стал реалистичным
    result.trades.forEach(trade => {
      // PnL не должен быть астрономическим (учитываем длительные сделки)
      expect(Math.abs(trade.pnl)).toBeLessThan(50000);
      expect(Math.abs(trade.pnlPercent)).toBeLessThan(10000); // Не более 10000%

      // Проверяем, что цены реалистичны после сплитов
      expect(trade.entryPrice).toBeGreaterThan(0);
      expect(trade.exitPrice).toBeGreaterThan(0);
      expect(trade.quantity).toBeGreaterThan(0);
    });
  });

  it('should maintain consistent equity progression', () => {
    const result = engine.runBacktest();

    // Проверяем, что equity curve логична
    expect(result.equity.length).toBeGreaterThan(0);

    const firstEquity = result.equity[0];
    const lastEquity = result.equity[result.equity.length - 1];

    expect(firstEquity.value).toBe(defaultStrategy.riskManagement.initialCapital);
    expect(lastEquity.value).toBeGreaterThan(0);

    // Проверяем, что нет отрицательных значений equity
    result.equity.forEach(point => {
      expect(point.value).toBeGreaterThan(0);
    });
  });

  it('should handle multiple splits correctly', () => {
    // Тест с данными, охватывающими оба сплита с IBS сигналами
    const multiSplitData: OHLCData[] = [
      // До первого сплита (2014)
      { date: '2014-03-31', open: 1000, high: 1010, low: 990, close: 1005, volume: 1000 },

      // После первого сплита (2014) - IBS < 0.1 для входа
      { date: '2014-04-03', open: 505, high: 510, low: 500, close: 501, volume: 2000 }, // IBS = 0.1
      { date: '2014-04-04', open: 501, high: 510, low: 500, close: 500.5, volume: 2000 }, // IBS = 0.05 < 0.1
      { date: '2014-04-05', open: 500.5, high: 520, low: 500, close: 515, volume: 2000 }, // IBS = 0.75 для выхода

      // До второго сплита (2022)
      { date: '2022-07-14', open: 2000, high: 2010, low: 1990, close: 2005, volume: 1000 },

      // После второго сплита (2022) - IBS < 0.1 для входа
      { date: '2022-07-16', open: 100.25, high: 100.75, low: 99.75, close: 100, volume: 20000 }, // IBS = 0.25
      { date: '2022-07-17', open: 100, high: 101, low: 99.5, close: 99.6, volume: 20000 }, // IBS = 0.067 < 0.1
      { date: '2022-07-18', open: 99.6, high: 101.5, low: 99.5, close: 101, volume: 20000 }, // IBS = 0.75 для выхода
    ];

    const multiSplitEngine = new CleanBacktestEngine(multiSplitData, defaultStrategy, {
      entryExecution: 'close',
      splits: googlSplits
    });

    const result = multiSplitEngine.runBacktest();

    // Проверяем, что оба сплита применены
    expect(result.trades.length).toBeGreaterThan(0);

    // Проверяем цены в разные периоды
    const trades2014 = result.trades.filter(trade =>
      trade.entryDate.startsWith('2014')
    );
    const trades2022 = result.trades.filter(trade =>
      trade.entryDate.startsWith('2022')
    );

    if (trades2014.length > 0) {
      // После сплита 2014 цены должны быть ~$25 (1000/2/20 = 25)
      expect(trades2014[0].entryPrice).toBeLessThan(30);
      expect(trades2014[0].entryPrice).toBeGreaterThan(20);
    }

    if (trades2022.length > 0) {
      // После сплита 2022 цены должны быть ~$100 (2000/20 = 100)
      expect(trades2022[0].entryPrice).toBeLessThan(150);
      expect(trades2022[0].entryPrice).toBeGreaterThan(50);
    }
  });

  it('should work without splits (backward compatibility)', () => {
    const engineWithoutSplits = new CleanBacktestEngine(testData, defaultStrategy, {
      entryExecution: 'close'
    });

    const result = engineWithoutSplits.runBacktest();

    // Должен работать без ошибок
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
    expect(result.equity.length).toBeGreaterThan(0);
  });
});
