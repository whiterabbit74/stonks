import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { useAppStore } from '../stores';

interface BuyAtClose4SimulatorProps {
  strategy: Strategy | null;
  defaultTickers?: string[];
}

interface Position {
  ticker: string;
  entryDate: Date;
  entryPrice: number;
  quantity: number;
  entryIndex: number;
  initialCost: number;
}

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
}

function formatCurrencyUSD(value: number): string {
  return '$' + Number(value || 0).toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

/**
 * Загружает и подготавливает данные для тикера с учетом сплитов
 */
async function loadTickerData(ticker: string): Promise<TickerData> {
  const ds = await DatasetAPI.getDataset(ticker);
  
  let processedData: OHLCData[];
  
  if ((ds as any).adjustedForSplits) {
    processedData = dedupeDailyOHLC(ds.data as unknown as OHLCData[]);
  } else {
    let splits: Array<{ date: string; factor: number }> = [];
    try { 
      splits = await DatasetAPI.getSplits(ds.ticker); 
    } catch { 
      splits = []; 
    }
    processedData = dedupeDailyOHLC(adjustOHLCForSplits(ds.data as unknown as OHLCData[], splits));
  }

  // Рассчитываем IBS для данного тикера
  const ibsValues = processedData.length > 0 ? IndicatorEngine.calculateIBS(processedData) : [];

  return {
    ticker,
    data: processedData,
    ibsValues
  };
}

/**
 * Рассчитывает комиссию для сделки
 */
function calculateCommission(tradeValue: number, strategy: Strategy): number {
  const { commission } = strategy.riskManagement;
  
  switch (commission.type) {
    case 'fixed':
      return commission.fixed || 0;
    case 'percentage':
      return tradeValue * ((commission.percentage || 0) / 100);
    case 'combined':
      return (commission.fixed || 0) + tradeValue * ((commission.percentage || 0) / 100);
    default:
      return 0;
  }
}

/**
 * Основная функция бэктеста для 4-тикерной стратегии
 */
function runMultiTickerBacktest(
  tickersData: TickerData[], 
  strategy: Strategy
): { 
  equity: EquityPoint[]; 
  finalValue: number; 
  maxDrawdown: number; 
  trades: Trade[]; 
  metrics: any; 
} {
  if (!tickersData || tickersData.length === 0) {
    return { 
      equity: [], 
      finalValue: 0, 
      maxDrawdown: 0, 
      trades: [], 
      metrics: {} 
    };
  }

  // Параметры стратегии
  const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);
  const capitalUsagePerTicker = Number(strategy?.riskManagement?.capitalUsage ?? 25); // 25% на тикер
  const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
  const maxHoldDays = Number(strategy.parameters.maxHoldDays ?? 30);

  // Состояние портфеля
  let currentCapital = initialCapital;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const positions: (Position | null)[] = new Array(tickersData.length).fill(null);

  // Создаем единую временную шкалу из всех тикеров
  const allDates = new Set<number>();
  tickersData.forEach(({ data }) => {
    data.forEach(bar => allDates.add(bar.date.getTime()));
  });
  const sortedDates = Array.from(allDates).sort((a, b) => a - b);

  console.log(`🚀 MULTI-TICKER BACKTEST START`);
  console.log(`📊 Initial Capital: ${formatCurrencyUSD(initialCapital)}`);
  console.log(`📈 Tickers: ${tickersData.map(t => t.ticker).join(', ')}`);
  console.log(`⚙️ Capital per ticker: ${capitalUsagePerTicker}%`);

  // Основной цикл по датам
  for (const dateTime of sortedDates) {
    const currentDate = new Date(dateTime);
    
    // Обрабатываем каждый тикер на текущую дату
    for (let tickerIndex = 0; tickerIndex < tickersData.length; tickerIndex++) {
      const tickerData = tickersData[tickerIndex];
      const position = positions[tickerIndex];
      
      // Находим бар для текущей даты
      const barIndex = tickerData.data.findIndex(bar => bar.date.getTime() === dateTime);
      if (barIndex === -1) continue; // Нет данных для этой даты
      
      const bar = tickerData.data[barIndex];
      const ibs = tickerData.ibsValues[barIndex];
      
      if (isNaN(ibs)) continue; // Пропускаем невалидные IBS

      // ЛОГИКА ВХОДА
      if (!position) {
        // Сигнал входа: IBS < lowIBS
        if (ibs < lowIBS) {
          const investmentAmount = (initialCapital * capitalUsagePerTicker) / 100;
          const entryPrice = bar.close;
          const quantity = Math.floor(investmentAmount / entryPrice);
          
          if (quantity > 0) {
            const initialCost = quantity * entryPrice;
            const entryCommission = calculateCommission(initialCost, strategy);
            const totalCost = initialCost + entryCommission;
            
            // Проверяем, хватает ли средств
            if (currentCapital >= totalCost) {
              positions[tickerIndex] = {
                ticker: tickerData.ticker,
                entryDate: bar.date,
                entryPrice: entryPrice,
                quantity: quantity,
                entryIndex: barIndex,
                initialCost: totalCost
              };
              
              currentCapital -= totalCost;
              
              console.log(`🟢 ENTRY [${tickerData.ticker}]: IBS=${ibs.toFixed(3)} < ${lowIBS}, bought ${quantity} shares at $${entryPrice.toFixed(2)}, cost: ${formatCurrencyUSD(totalCost)}`);
            }
          }
        }
      }
      // ЛОГИКА ВЫХОДА
      else {
        const daysSinceEntry = Math.floor((bar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
        let shouldExit = false;
        let exitReason = '';

        // Проверяем IBS условие выхода
        if (ibs > highIBS) {
          shouldExit = true;
          exitReason = 'ibs_signal';
        }
        // Проверяем максимальное время удержания
        else if (daysSinceEntry >= maxHoldDays) {
          shouldExit = true;
          exitReason = 'max_hold_days';
        }

        if (shouldExit) {
          const exitPrice = bar.close;
          const grossProceeds = position.quantity * exitPrice;
          const exitCommission = calculateCommission(grossProceeds, strategy);
          const netProceeds = grossProceeds - exitCommission;
          const pnl = netProceeds - position.initialCost;
          const pnlPercent = (pnl / position.initialCost) * 100;

          // Создаем торговую сделку
          const trade: Trade = {
            id: `trade-${trades.length}`,
            entryDate: position.entryDate,
            exitDate: bar.date,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            quantity: position.quantity,
            pnl: pnl,
            pnlPercent: pnlPercent,
            duration: daysSinceEntry,
            exitReason: exitReason,
            context: {
              ticker: position.ticker,
              marketConditions: 'normal',
              indicatorValues: { IBS: ibs },
              volatility: 0,
              trend: 'sideways',
              initialInvestment: position.initialCost,
              commissionPaid: calculateCommission(position.initialCost, strategy) + exitCommission,
              netProceeds: netProceeds
            }
          };

          trades.push(trade);
          currentCapital += netProceeds;
          positions[tickerIndex] = null;

          console.log(`🔴 EXIT [${position.ticker}]: IBS=${ibs.toFixed(3)}, ${exitReason}, P&L=${formatCurrencyUSD(pnl)}, Duration=${daysSinceEntry} days`);
        }
      }
    }

    // Рассчитываем общую стоимость портфеля на конец дня
    let totalPortfolioValue = currentCapital;
    
    for (let i = 0; i < positions.length; i++) {
      const position = positions[i];
      if (position) {
        const tickerData = tickersData[i];
        const barIndex = tickerData.data.findIndex(bar => bar.date.getTime() === dateTime);
        
        if (barIndex !== -1) {
          const currentBar = tickerData.data[barIndex];
          const currentMarketValue = position.quantity * currentBar.close;
          const exitCommission = calculateCommission(currentMarketValue, strategy);
          // Учитываем комиссию на потенциальный выход
          totalPortfolioValue += currentMarketValue - exitCommission;
        }
      }
    }

    // Рассчитываем drawdown
    const peakValue = equity.length > 0 
      ? Math.max(...equity.map(e => e.value), totalPortfolioValue)
      : totalPortfolioValue;
    const drawdown = peakValue > 0 ? ((peakValue - totalPortfolioValue) / peakValue) * 100 : 0;

    equity.push({
      date: currentDate,
      value: totalPortfolioValue,
      drawdown: drawdown
    });
  }

  // Закрываем все открытые позиции в конце периода
  const lastDate = sortedDates[sortedDates.length - 1];
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    if (position) {
      const tickerData = tickersData[i];
      const lastBarIndex = tickerData.data.length - 1;
      const lastBar = tickerData.data[lastBarIndex];
      
      const exitPrice = lastBar.close;
      const grossProceeds = position.quantity * exitPrice;
      const exitCommission = calculateCommission(grossProceeds, strategy);
      const netProceeds = grossProceeds - exitCommission;
      const pnl = netProceeds - position.initialCost;
      const pnlPercent = (pnl / position.initialCost) * 100;
      const duration = Math.floor((lastBar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));

      const trade: Trade = {
        id: `trade-${trades.length}`,
        entryDate: position.entryDate,
        exitDate: lastBar.date,
        entryPrice: position.entryPrice,
        exitPrice: exitPrice,
        quantity: position.quantity,
        pnl: pnl,
        pnlPercent: pnlPercent,
        duration: duration,
        exitReason: 'end_of_data',
        context: {
          ticker: position.ticker,
          marketConditions: 'normal',
          indicatorValues: { IBS: tickerData.ibsValues[lastBarIndex] },
          volatility: 0,
          trend: 'sideways',
          initialInvestment: position.initialCost,
          commissionPaid: calculateCommission(position.initialCost, strategy) + exitCommission,
          netProceeds: netProceeds
        }
      };

      trades.push(trade);
      currentCapital += netProceeds;

      console.log(`🔴 FINAL EXIT [${position.ticker}]: P&L=${formatCurrencyUSD(pnl)}, Duration=${duration} days`);
    }
  }

  const finalValue = currentCapital;
  const maxDrawdown = equity.length > 0 ? Math.max(...equity.map(e => e.drawdown)) : 0;
  
  // Базовые метрики
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
  const profitFactor = (avgWin * winningTrades.length) / Math.abs(avgLoss * losingTrades.length) || 0;

  // Аннуализированная доходность
  const daysDiff = sortedDates.length > 0 ? 
    (sortedDates[sortedDates.length - 1] - sortedDates[0]) / (1000 * 60 * 60 * 24) : 1;
  const years = daysDiff / 365.25;
  const cagr = years >= 1 ? 
    (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100 :
    totalReturn;

  const metrics = {
    totalReturn,
    cagr,
    maxDrawdown,
    winRate,
    profitFactor,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin,
    avgLoss,
    finalValue
  };

  console.log(`✅ BACKTEST COMPLETED:`);
  console.log(`💰 Final Value: ${formatCurrencyUSD(finalValue)} (${totalReturn.toFixed(2)}%)`);
  console.log(`📊 Total Trades: ${trades.length} (Win Rate: ${winRate.toFixed(1)}%)`);
  console.log(`📉 Max Drawdown: ${maxDrawdown.toFixed(2)}%`);

  return { equity, finalValue, maxDrawdown, trades, metrics };
}

export function BuyAtClose4Simulator({ strategy, defaultTickers = ['AAPL', 'MSFT', 'GOOGL', 'TSLA'] }: BuyAtClose4SimulatorProps) {
  const [tickers, setTickers] = useState<string[]>(defaultTickers);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedData, setLoadedData] = useState<TickerData[]>([]);
  const [inputValue, setInputValue] = useState(defaultTickers.join(', '));

  // Запуск бэктеста при изменении данных или стратегии
  const backtest = useMemo(() => {
    if (!strategy || loadedData.length === 0) {
      return { equity: [], finalValue: 0, maxDrawdown: 0, trades: [], metrics: {} };
    }
    return runMultiTickerBacktest(loadedData, strategy);
  }, [loadedData, strategy]);

  // Загрузка данных для всех тикеров
  const loadAllData = async () => {
    if (tickers.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const promises = tickers.map(ticker => loadTickerData(ticker.trim().toUpperCase()));
      const results = await Promise.all(promises);
      setLoadedData(results);
      console.log(`✅ Loaded data for ${results.length} tickers`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить данные';
      setError(message);
      console.error('❌ Error loading data:', message);
    } finally {
      setIsLoading(false);
    }
  };

  // Применить новый список тикеров
  const applyTickers = () => {
    const newTickers = inputValue
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => t.length > 0);
    
    if (newTickers.length === 0) {
      setError('Введите хотя бы один тикер');
      return;
    }
    
    setTickers(newTickers);
  };

  // Загружаем данные при монтировании компонента
  useEffect(() => {
    loadAllData();
  }, [tickers]);

  if (!strategy) {
    return (
      <div className="p-4 text-center text-gray-500">
        Выберите стратегию для запуска симулятора
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Покупка на закрытии 4 (Multi-Ticker IBS)
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Торговля по 4 тикерам одновременно с единым балансом и IBS сигналами
        </p>
      </div>

      {/* Настройка тикеров */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Настройка тикеров</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="AAPL, MSFT, GOOGL, TSLA"
            className="flex-1 min-w-[300px] px-3 py-2 border rounded-md dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
          />
          <button
            onClick={applyTickers}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isLoading ? 'Загрузка...' : 'Применить'}
          </button>
          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
          >
            Перезагрузить
          </button>
        </div>
        
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          <p>Текущие тикеры: <span className="font-mono">{tickers.join(', ')}</span></p>
          <p>Капитал на тикер: {strategy.riskManagement.capitalUsage || 25}%</p>
        </div>
      </div>

      {/* Ошибки */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        </div>
      )}

      {/* Результаты */}
      {!isLoading && loadedData.length > 0 && (
        <>
          {/* Метрики */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrencyUSD(backtest.finalValue)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Итоговый баланс</div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {backtest.metrics.totalReturn?.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Общая доходность</div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">
                {backtest.metrics.winRate?.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <div className="text-2xl font-bold text-red-600">
                {backtest.maxDrawdown.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div>
            </div>
          </div>

          {/* График equity */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
              График доходности портфеля
            </h3>
            <div className="h-[400px]">
              <EquityChart equity={backtest.equity} hideHeader />
            </div>
          </div>

          {/* Таблица сделок */}
          {backtest.trades.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                История сделок ({backtest.trades.length})
              </h3>
              <div className="max-h-[600px] overflow-auto">
                <TradesTable trades={backtest.trades} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Индикатор загрузки */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Загружаем данные...</p>
        </div>
      )}
    </div>
  );
}