import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/index';
import type { Strategy, OHLCData, Trade, EquityPoint } from '../types';
import { TradesTable } from './TradesTable';
import { EquityChart } from './EquityChart';
import { StrategyParameters } from './StrategyParameters';
import { logWarn } from '../lib/error-logger';

// Вспомогательная функция для форматирования валюты
function formatCurrencyUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
}

interface PortfolioState {
  freeCapital: number;
  totalInvestedCost: number;
  totalPortfolioValue: number;
}

interface Position {
  ticker: string;
  entryDate: Date;
  entryPrice: number;
  quantity: number;
  entryIndex: number;
  totalCost: number;
  entryCommission: number;
  entryIBS: number;
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
 * Вычисляет рыночную стоимость позиции на текущую дату с учетом leverage
 */
function getPositionMarketValue(
  position: Position, 
  currentPrice: number, 
  strategy: Strategy
): { marketValue: number; netValue: number; unrealizedPnL: number } {
  const marketValue = position.quantity * currentPrice;
  const exitCommission = calculateCommission(marketValue, strategy);
  // Для leverage позиций считаем P&L от вложенного маржина
  const stockPnL = (currentPrice - position.entryPrice) * position.quantity;
  const unrealizedPnL = stockPnL - exitCommission; // Нереализованная прибыль/убыток от изменения цены
  const netPositionValue = position.totalCost + unrealizedPnL; // Маржин + нереализованная P&L
  
  return { 
    marketValue, 
    netValue: netPositionValue, // Возвращаем стоимость позиции с учетом маржина
    unrealizedPnL 
  };
}

/**
 * Обновляет состояние портфеля с учетом текущих рыночных цен
 */
function updatePortfolioState(
  portfolio: PortfolioState,
  position: Position | null,
  tickersData: TickerData[],
  currentDateTime: number,
  strategy: Strategy
): PortfolioState {
  let positionValue = 0;
  
  if (position) {
    // Найти данные для тикера текущей позиции
    const tickerData = tickersData.find(t => t.ticker === position.ticker);
    if (tickerData) {
      const barIndex = tickerData.data.findIndex(bar => bar.date.getTime() === currentDateTime);
      if (barIndex !== -1) {
        const currentPrice = tickerData.data[barIndex].close;
        const { netValue } = getPositionMarketValue(position, currentPrice, strategy);
        positionValue = Math.max(0, netValue); // Стоимость позиции не может быть отрицательной для портфеля
      } else {
        // Если данных на текущую дату нет, используем последнюю известную цену
        const lastBar = tickerData.data[tickerData.data.length - 1];
        if (lastBar) {
          const { netValue } = getPositionMarketValue(position, lastBar.close, strategy);
          positionValue = Math.max(0, netValue);
        }
      }
    }
  }
  
  // Правильный расчет общей стоимости портфеля с leverage
  return {
    freeCapital: portfolio.freeCapital,
    totalInvestedCost: portfolio.totalInvestedCost,
    totalPortfolioValue: portfolio.freeCapital + positionValue // Свободный капитал + стоимость позиции
  };
}

/**
 * SINGLE POSITION MULTI-TICKER STRATEGY - V1
 * 
 * Принципы:
 * 1. Торгуется несколько тикеров одновременно
 * 2. Только одна позиция открыта в любой момент времени
 * 3. Используется 100% доступного депозита на сделку
 * 4. Поддержка leverage 1:1, 2:1, 3:1
 * 5. Выбор лучшего сигнала среди всех тикеров
 */
function runSinglePositionBacktest(
  tickersData: TickerData[], 
  strategy: Strategy,
  leverage: number = 1
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
  const lowIBS = Number(strategy.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters?.highIBS ?? 0.75);
  const maxHoldDays = Number(strategy.parameters?.maxHoldDays ?? 30);

  // Состояние портфеля - только одна позиция
  const portfolio: PortfolioState = {
    freeCapital: initialCapital,
    totalInvestedCost: 0,
    totalPortfolioValue: initialCapital
  };

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  let currentPosition: Position | null = null;

  // Создаем единую временную шкалу из всех тикеров
  const allDates = new Set<number>();
  tickersData.forEach(({ data }) => {
    data.forEach(bar => allDates.add(bar.date.getTime()));
  });
  const sortedDates = Array.from(allDates).sort((a, b) => a - b);

  console.log(`🚀 SINGLE POSITION MULTI-TICKER BACKTEST START`);
  console.log(`📊 Initial Capital: ${formatCurrencyUSD(initialCapital)}`);
  console.log(`📈 Tickers: ${tickersData.map(t => t.ticker).join(', ')}`);
  console.log(`💰 Position Size: 100% депозита на сделку`);
  console.log(`💹 Leverage: ${leverage.toFixed(1)}:1 (${(leverage * 100).toFixed(0)}%)`);

  // ГЛАВНЫЙ ЦИКЛ
  for (const dateTime of sortedDates) {
    const currentDate = new Date(dateTime);
    
    // 1. ОБНОВЛЯЕМ СОСТОЯНИЕ ПОРТФЕЛЯ НА ТЕКУЩУЮ ДАТУ
    const updatedPortfolio = updatePortfolioState(portfolio, currentPosition, tickersData, dateTime, strategy);
    Object.assign(portfolio, updatedPortfolio);
    
    // 2. ОБРАБОТКА ТЕКУЩЕЙ ПОЗИЦИИ (ВЫХОД)
    if (currentPosition) {
      const tickerData = tickersData.find(t => t.ticker === currentPosition.ticker);
      if (tickerData) {
        const barIndex = tickerData.data.findIndex(bar => bar.date.getTime() === dateTime);
        if (barIndex !== -1) {
          const bar = tickerData.data[barIndex];
          const ibs = tickerData.ibsValues[barIndex];
          
          const daysSinceEntry = Math.floor((bar.date.getTime() - currentPosition.entryDate.getTime()) / (1000 * 60 * 60 * 24));
          let shouldExit = false;
          let exitReason = '';

          if (ibs > highIBS) {
            shouldExit = true;
            exitReason = 'ibs_signal';
          } else if (daysSinceEntry >= maxHoldDays) {
            shouldExit = true;
            exitReason = 'max_hold_days';
          }

          if (shouldExit) {
            const exitPrice = bar.close;
            const stockProceeds = currentPosition.quantity * exitPrice;
            const exitCommission = calculateCommission(stockProceeds, strategy);
            const netProceeds = stockProceeds - exitCommission;
            
            // Корректный расчет P&L с leverage
            const stockValueAtEntry = currentPosition.quantity * currentPosition.entryPrice;
            const totalCommissions = currentPosition.entryCommission + exitCommission;
            const stockPnL = (exitPrice - currentPosition.entryPrice) * currentPosition.quantity;
            const totalPnL = stockPnL - totalCommissions;
            const totalCashInvested = currentPosition.totalCost + currentPosition.entryCommission;
            const pnlPercent = totalCashInvested > 0 ? (totalPnL / totalCashInvested) * 100 : 0;
            
            // ОБНОВЛЯЕМ ПОРТФЕЛЬ 
            const capitalBeforeExit = portfolio.freeCapital;
            portfolio.freeCapital += totalCashInvested + totalPnL;    // Возвращаем весь капитал + P&L
            portfolio.totalInvestedCost = Math.max(0, portfolio.totalInvestedCost - totalCashInvested); // Убираем вложенный капитал
            
            // ПЕРЕСЧИТЫВАЕМ ОБЩУЮ СТОИМОСТЬ ПОРТФЕЛЯ ПОСЛЕ СДЕЛКИ
            const updatedPortfolioAfterExit = updatePortfolioState(portfolio, null, tickersData, dateTime, strategy);
            Object.assign(portfolio, updatedPortfolioAfterExit);
            
            // СОЗДАЁМ СДЕЛКУ
            const trade: Trade = {
              id: `trade-${trades.length}`,
              entryDate: currentPosition.entryDate,
              exitDate: bar.date,
              entryPrice: currentPosition.entryPrice,
              exitPrice: exitPrice,
              quantity: currentPosition.quantity,
              pnl: totalPnL,
              pnlPercent: pnlPercent,
              duration: daysSinceEntry,
              exitReason: exitReason,
              context: {
                ticker: currentPosition.ticker,
                marketConditions: 'normal',
                indicatorValues: { IBS: currentPosition.entryIBS, exitIBS: ibs },
                volatility: 0,
                trend: 'sideways',
                initialInvestment: totalCashInvested,
                grossInvestment: currentPosition.quantity * currentPosition.entryPrice,
                leverage: leverage,
                leverageDebt: stockValueAtEntry - currentPosition.totalCost,
                commissionPaid: totalCommissions,
                netProceeds: netProceeds,
                capitalBeforeExit: capitalBeforeExit,
                currentCapitalAfterExit: portfolio.totalPortfolioValue,
                marginUsed: currentPosition.totalCost
              }
            };

            trades.push(trade);
            currentPosition = null; // Закрываем позицию

            console.log(`🔴 EXIT [${trade.context.ticker}]: IBS=${ibs.toFixed(3)}, ${exitReason}`);
            console.log(`   💰 P&L=${formatCurrencyUSD(totalPnL)} (${pnlPercent.toFixed(2)}%), Duration=${daysSinceEntry} days`);
            console.log(`   📊 Portfolio: ${formatCurrencyUSD(portfolio.totalPortfolioValue)}`);
          }
        }
      }
    }
    
    // 3. ПОИСК НОВОГО ВХОДА (только если нет открытой позиции)
    if (!currentPosition) {
      let bestSignal: { tickerIndex: number; ibs: number; bar: OHLCData } | null = null;
      
      // Ищем лучший сигнал среди всех тикеров
      for (let tickerIndex = 0; tickerIndex < tickersData.length; tickerIndex++) {
        const tickerData = tickersData[tickerIndex];
        const barIndex = tickerData.data.findIndex(bar => bar.date.getTime() === dateTime);
        if (barIndex === -1) continue;
        
        const bar = tickerData.data[barIndex];
        const ibs = tickerData.ibsValues[barIndex];
        
        // Проверяем сигнал входа
        if (ibs < lowIBS) {
          // Выбираем сигнал с самым низким IBS (самый сильный сигнал)
          if (!bestSignal || ibs < bestSignal.ibs) {
            bestSignal = { tickerIndex, ibs, bar };
          }
        }
      }
      
      // Открываем позицию по лучшему сигналу
      if (bestSignal) {
        const tickerData = tickersData[bestSignal.tickerIndex];
        const { bar, ibs } = bestSignal;
        
        // Используем 100% доступного капитала с leverage
        const baseTargetInvestment = portfolio.freeCapital; // 100% СВОБОДНОГО депозита
        const targetInvestment = baseTargetInvestment * leverage; // Применяем плечо
        const entryPrice = bar.close;
        const quantity = Math.floor(targetInvestment / entryPrice);
        
        if (quantity > 0) {
          const stockCost = quantity * entryPrice;
          const entryCommission = calculateCommission(stockCost, strategy);
          const marginRequired = stockCost / leverage; // Чистый маржинальный депозит
          const totalCashRequired = marginRequired + entryCommission; // Общие денежные затраты
          
          // Проверяем наличие свободного капитала (должно быть >= totalCashRequired)
          if (portfolio.freeCapital >= totalCashRequired && totalCashRequired > 0) {
            // СОЗДАЁМ ПОЗИЦИЮ
            currentPosition = {
              ticker: tickerData.ticker,
              entryDate: bar.date,
              entryPrice: entryPrice,
              quantity: quantity,
              entryIndex: bestSignal.tickerIndex,
              totalCost: marginRequired,
              entryCommission: entryCommission,
              entryIBS: ibs
            };
            
            // ОБНОВЛЯЕМ СОСТОЯНИЕ ПОРТФЕЛЯ
            portfolio.freeCapital -= totalCashRequired;
            portfolio.totalInvestedCost += totalCashRequired;
            
            console.log(`🟢 ENTRY [${tickerData.ticker}]: IBS=${ibs.toFixed(3)} < ${lowIBS}`);
            console.log(`   💰 Stock Value: ${formatCurrencyUSD(stockCost)} | Margin: ${formatCurrencyUSD(marginRequired)} | Commission: ${formatCurrencyUSD(entryCommission)}`);
            console.log(`   📊 Portfolio: Free=${formatCurrencyUSD(portfolio.freeCapital)} | Invested=${formatCurrencyUSD(portfolio.totalInvestedCost)}`);
            console.log(`   🎯 Leverage: ${leverage.toFixed(1)}:1 | Total Cash Required: ${formatCurrencyUSD(totalCashRequired)}`);
          }
        }
      }
    }

    // ОБНОВЛЯЕМ ФИНАЛЬНОЕ СОСТОЯНИЕ ПОРТФЕЛЯ И EQUITY
    const finalPortfolio = updatePortfolioState(portfolio, currentPosition, tickersData, dateTime, strategy);
    Object.assign(portfolio, finalPortfolio);

    // Рассчитываем drawdown
    const peakValue = equity.length > 0 
      ? Math.max(...equity.map(e => e.value), portfolio.totalPortfolioValue)
      : portfolio.totalPortfolioValue;
    const drawdown = peakValue > 0 ? ((peakValue - portfolio.totalPortfolioValue) / peakValue) * 100 : 0;

    equity.push({
      date: currentDate,
      value: portfolio.totalPortfolioValue,
      drawdown: drawdown
    });
  }

  // ЗАКРЫВАЕМ ОСТАВШУЮСЯ ПОЗИЦИЮ (если есть)
  if (currentPosition) {
    const tickerData = tickersData.find(t => t.ticker === currentPosition.ticker);
    if (tickerData) {
      const lastBarIndex = tickerData.data.length - 1;
      const lastBar = tickerData.data[lastBarIndex];
      
      const exitPrice = lastBar.close;
      const stockProceeds = currentPosition.quantity * exitPrice;
      const exitCommission = calculateCommission(stockProceeds, strategy);
      
      // Корректный расчет P&L для конца данных
      const stockValueAtEntry = currentPosition.quantity * currentPosition.entryPrice;
      const totalCommissions = currentPosition.entryCommission + exitCommission;
      const stockPnL = (exitPrice - currentPosition.entryPrice) * currentPosition.quantity; 
      const totalPnL = stockPnL - totalCommissions;
      const totalCashInvested = currentPosition.totalCost + currentPosition.entryCommission;
      const pnlPercent = totalCashInvested > 0 ? (totalPnL / totalCashInvested) * 100 : 0;
      const duration = Math.floor((lastBar.date.getTime() - currentPosition.entryDate.getTime()) / (1000 * 60 * 60 * 24));

      portfolio.freeCapital += totalCashInvested + totalPnL;
      portfolio.totalInvestedCost = Math.max(0, portfolio.totalInvestedCost - totalCashInvested);
      portfolio.totalPortfolioValue = portfolio.freeCapital + portfolio.totalInvestedCost;
      
      const trade: Trade = {
        id: `trade-${trades.length}`,
        entryDate: currentPosition.entryDate,
        exitDate: lastBar.date,
        entryPrice: currentPosition.entryPrice,
        exitPrice: exitPrice,
        quantity: currentPosition.quantity,
        pnl: totalPnL,
        pnlPercent: pnlPercent,
        duration: duration,
        exitReason: 'end_of_data',
        context: {
          ticker: currentPosition.ticker,
          marketConditions: 'normal',
          indicatorValues: { IBS: currentPosition.entryIBS, exitIBS: tickerData.ibsValues[lastBarIndex] },
          volatility: 0,
          trend: 'sideways',
          initialInvestment: totalCashInvested,
          grossInvestment: currentPosition.quantity * currentPosition.entryPrice,
          leverage: leverage,
          leverageDebt: stockValueAtEntry - currentPosition.totalCost,
          commissionPaid: totalCommissions,
          netProceeds: stockProceeds - exitCommission,
          capitalBeforeExit: portfolio.freeCapital - totalCashInvested - totalPnL,
          currentCapitalAfterExit: portfolio.totalPortfolioValue,
          marginUsed: currentPosition.totalCost
        }
      };

      trades.push(trade);
    }
  }

  // Вычисляем метрики
  const finalValue = portfolio.totalPortfolioValue;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
  const maxDrawdown = equity.length > 0 ? Math.max(...equity.map(e => e.drawdown)) : 0;
  
  const winningTrades = trades.filter(t => (t.pnl ?? 0) > 0).length;
  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  
  // CAGR calculation
  const daysDiff = equity.length > 0 ? 
    (equity[equity.length - 1].date.getTime() - equity[0].date.getTime()) / (1000 * 60 * 60 * 24) : 1;
  const years = daysDiff / 365.25;
  const cagr = years > 0 ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100 : 0;

  const metrics = {
    totalReturn,
    cagr,
    winRate,
    totalTrades: trades.length,
    winningTrades,
    losingTrades: trades.length - winningTrades
  };

  console.log(`✅ SINGLE POSITION BACKTEST COMPLETE`);
  console.log(`📊 Final Value: ${formatCurrencyUSD(finalValue)}`);
  console.log(`📈 Total Return: ${totalReturn.toFixed(2)}%`);
  console.log(`🎯 Total Trades: ${trades.length}`);

  return { 
    equity, 
    finalValue, 
    maxDrawdown, 
    trades, 
    metrics 
  };
}

interface SinglePositionSimulatorProps {
  strategy: Strategy | null;
}

export function SinglePositionSimulator({ strategy }: SinglePositionSimulatorProps) {
  const loadedData = useAppStore(s => s.marketData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtest, setBacktest] = useState<{
    equity: EquityPoint[];
    finalValue: number;
    maxDrawdown: number;
    trades: Trade[];
    metrics: any;
  } | null>(null);
  
  // Настройки стратегии
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'TSLA']);
  const [leveragePercent, setLeveragePercent] = useState(200); // 200% = 2:1 leverage

  if (!strategy) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-yellow-800 dark:text-yellow-200">
          ⚠️ Выберите стратегию для запуска симуляции Single Position Multi-Ticker
        </p>
      </div>
    );
  }

  const runBacktest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Группируем данные по тикерам
      const tickerDataMap = new Map<string, OHLCData[]>();
      loadedData.forEach(bar => {
        if (!tickerDataMap.has(bar.symbol)) {
          tickerDataMap.set(bar.symbol, []);
        }
        tickerDataMap.get(bar.symbol)!.push(bar);
      });

      // Создаем данные только для выбранных тикеров
      const tickersData: TickerData[] = [];
      for (const ticker of tickers) {
        const data = tickerDataMap.get(ticker);
        if (data && data.length > 0) {
          // Сортируем по дате
          const sortedData = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());
          
          // Вычисляем IBS
          const ibsValues = sortedData.map((bar, index) => {
            if (index === 0) return 0.5; // Первый бар
            const prevBar = sortedData[index - 1];
            const range = bar.high - bar.low;
            if (range === 0) return 0.5;
            return (bar.close - bar.low) / range;
          });
          
          tickersData.push({
            ticker,
            data: sortedData,
            ibsValues
          });
        }
      }

      if (tickersData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      const result = runSinglePositionBacktest(tickersData, strategy, leveragePercent / 100);
      setBacktest(result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (loadedData.length > 0) {
      runBacktest();
    }
  }, [loadedData, tickers, leveragePercent, strategy]);

  return (
    <div className="space-y-6">
      {/* Настройки стратегии */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
          🎯 Single Position Multi-Ticker Strategy
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Тикеры (через запятую)
            </label>
            <input
              type="text"
              value={tickers.join(', ')}
              onChange={(e) => setTickers(e.target.value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="AAPL, MSFT, GOOGL, TSLA"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Leverage: {(leveragePercent/100).toFixed(1)}:1
            </label>
            <select
              value={leveragePercent}
              onChange={(e) => setLeveragePercent(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value={100}>100% (без плеча)</option>
              <option value={200}>200% (2:1)</option>
              <option value={300}>300% (3:1)</option>
            </select>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 mt-2">
          Одна позиция на 100% депозита. Выбирается лучший сигнал среди всех тикеров.
        </div>
        
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          <p>Тикеры: <span className="font-mono">{tickers.join(', ')}</span></p>
          <p>Размер позиции: <span className="font-mono text-green-600 dark:text-green-400">100% депозита</span></p>
          <p>Leverage: <span className="font-mono text-orange-600 dark:text-orange-400">{(leveragePercent/100).toFixed(1)}:1</span></p>
          <p className="text-blue-600 dark:text-blue-400">
            ✨ Single Position: Только одна позиция в любой момент времени
          </p>
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
      {!isLoading && backtest && (
        <>
          {/* Метрики */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <div className="text-2xl font-bold text-orange-600">
                {backtest.metrics.cagr?.toFixed(2)}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Годовые проценты</div>
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
              График доходности портфеля (Single Position Strategy)
            </h3>
            <div className="w-full h-[600px] min-h-[600px]">
              <EquityChart equity={backtest.equity} hideHeader />
            </div>
          </div>

          {/* Таблица сделок */}
          {backtest.trades.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                История сделок ({backtest.trades.length}) - Single Position Strategy
              </h3>
              
              <StrategyParameters 
                strategy={strategy} 
                additionalParams={{
                  'Размер позиции': '100% депозита',
                  'Количество тикеров': tickers.length,
                  'Начальный капитал': '$10,000',
                  'Leverage': `${(leveragePercent/100).toFixed(1)}:1 (${leveragePercent}%)`,
                  'Логика': 'Single Position - одна позиция на весь депозит'
                }}
              />
              
              <div className="max-h-[600px] overflow-auto">
                <TradesTable trades={backtest.trades} />
              </div>
            </div>
          )}
        </>
      )}

      {isLoading && (
        <div className="text-center py-8">
          <div className="text-gray-600 dark:text-gray-400">
            🔄 Выполняется Single Position бэктест...
          </div>
        </div>
      )}
    </div>
  );
}