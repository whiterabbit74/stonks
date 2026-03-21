import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import type { TradingDate } from '../lib/date-utils';
import { daysBetweenTradingDates, isSameDay, formatTradingDateDisplay } from '../lib/date-utils';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { StrategyParameters } from './StrategyParameters';
import { logWarn } from '../lib/error-logger';
import { calculateCAGR } from '../lib/backtest-utils';
import { SimulationStatsGrid } from './SimulationStatsGrid';

interface BuyAtClose4SimulatorProps {
  strategy: Strategy | null;
  defaultTickers?: string[];
}

interface Position {
  ticker: string;
  entryDate: TradingDate; // Use TradingDate string
  entryPrice: number;
  quantity: number;
  entryIndex: number;
  // Новая чистая структура данных позиции
  totalCost: number;          // Полная стоимость покупки (quantity * price + commission)
  entryCommission: number;    // Комиссия при входе
  entryIBS: number;          // IBS при входе
}

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
}

interface PortfolioState {
  // Чистый раздельный учёт капитала
  freeCapital: number;           // Свободные деньги (не инвестированные)
  totalInvestedCost: number;     // Общая сумма затрат на все позиции
  totalPortfolioValue: number;   // Общая стоимость портфеля (free + market value of positions)
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

  if ('adjustedForSplits' in ds && ds.adjustedForSplits) {
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
 * Вычисляет рыночную стоимость позиции на текущую дату
 */
function getPositionMarketValue(
  position: Position,
  currentPrice: number,
  strategy: Strategy
): { marketValue: number; netValue: number; unrealizedPnL: number } {
  const marketValue = position.quantity * currentPrice;
  const exitCommission = calculateCommission(marketValue, strategy);
  // ИСПРАВЛЕНИЕ: Для leverage позиций считаем P&L от вложенного маржина
  const stockPnL = (currentPrice - position.entryPrice) * position.quantity;
  const unrealizedPnL = stockPnL - exitCommission; // Нереализованная прибыль/убыток от изменения цены
  const netPositionValue = position.totalCost + unrealizedPnL; // Маржин + нереализованная P&L

  return {
    marketValue,
    netValue: netPositionValue, // ИСПРАВЛЕНИЕ: Возвращаем стоимость позиции с учетом маржина
    unrealizedPnL
  };
}

/**
 * Обновляет состояние портфеля с учётом текущих рыночных цен
 */
function updatePortfolioState(
  portfolio: PortfolioState,
  positions: (Position | null)[],
  tickersData: TickerData[],
  currentDate: TradingDate,
  strategy: Strategy
): PortfolioState {
  let totalPositionsValue = 0;

  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    if (position) {
      const tickerData = tickersData[i];
      const barIndex = tickerData.data.findIndex(bar => bar.date === currentDate);

      if (barIndex !== -1) {
        const currentPrice = tickerData.data[barIndex].close;
        const { netValue } = getPositionMarketValue(position, currentPrice, strategy);
        totalPositionsValue += netValue; // Сумма всех позиций с учетом leverage
      }
    }
  }

  // ИСПРАВЛЕНИЕ: Правильный расчет общей стоимости портфеля с leverage
  return {
    freeCapital: portfolio.freeCapital,
    totalInvestedCost: portfolio.totalInvestedCost,
    totalPortfolioValue: portfolio.freeCapital + totalPositionsValue // Свободный капитал + стоимость позиций
  };
}

/**
 * НОВАЯ БЕЗУПРЕЧНАЯ ТОРГОВАЯ ЛОГИКА - ВАРИАНТ 2
 * 
 * Принципы:
 * 1. Чистый раздельный учёт: freeCapital + investedCost = полный контроль
 * 2. Динамическое распределение: % от общей стоимости портфеля
 * 3. Математическая корректность: каждый доллар учитывается точно один раз
 * 4. Прозрачность всех операций
 */
function runMultiTickerBacktest(
  tickersData: TickerData[],
  strategy: Strategy,
  leverage: number = 1
): {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: Record<string, number>;
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
  const capitalUsagePerTicker = 100 / tickersData.length; // Равномерно по тикерам
  const lowIBS = Number(strategy.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters?.highIBS ?? 0.75);
  const maxHoldDays = Number(strategy.parameters?.maxHoldDays ?? 30);

  // ✨ НОВОЕ: Чистое состояние портфеля с раздельным учётом
  const portfolio: PortfolioState = {
    freeCapital: initialCapital,      // Изначально все деньги свободны
    totalInvestedCost: 0,             // Ничего не инвестировано
    totalPortfolioValue: initialCapital
  };

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const positions: (Position | null)[] = new Array(tickersData.length).fill(null);

  // Создаем единую временную шкалу из всех тикеров (TradingDate strings)
  const allDates = new Set<TradingDate>();
  tickersData.forEach(({ data }) => {
    data.forEach(bar => allDates.add(bar.date));
  });
  const sortedDates = Array.from(allDates).sort(); // String sort works for YYYY-MM-DD

  console.log(`🚀 MULTI-TICKER BACKTEST START (V2 - PERFECT LOGIC WITH LEVERAGE)`);
  console.log(`📊 Initial Capital: ${formatCurrencyUSD(initialCapital)}`);
  console.log(`📈 Tickers: ${tickersData.map(t => t.ticker).join(', ')}`);
  console.log(`⚙️ Capital per ticker: ${capitalUsagePerTicker.toFixed(1)}%`);
  console.log(`💹 Leverage: ${leverage.toFixed(1)}:1 (${(leverage * 100).toFixed(0)}%)`);
  console.log(`💡 Logic: Dynamic allocation from total portfolio value with leverage`);

  // ✨ ГЛАВНЫЙ ЦИКЛ - с новой логикой
  for (const currentDate of sortedDates) {

    // ✨ 1. ОБНОВЛЯЕМ СОСТОЯНИЕ ПОРТФЕЛЯ НА ТЕКУЩУЮ ДАТУ
    const updatedPortfolio = updatePortfolioState(portfolio, positions, tickersData, currentDate, strategy);
    Object.assign(portfolio, updatedPortfolio);

    // ✨ 2. ОБРАБАТЫВАЕМ КАЖДЫЙ ТИКЕР
    for (let tickerIndex = 0; tickerIndex < tickersData.length; tickerIndex++) {
      const tickerData = tickersData[tickerIndex];
      const position = positions[tickerIndex];

      // Находим бар для текущей даты
      const barIndex = tickerData.data.findIndex(bar => bar.date === currentDate);
      if (barIndex === -1) continue;

      const bar = tickerData.data[barIndex];
      const ibs = tickerData.ibsValues[barIndex];

      // ✨ ЛОГИКА ВХОДА - НОВАЯ
      if (!position) {
        if (ibs < lowIBS) {
          // 🎯 КЛЮЧЕВОЕ УЛУЧШЕНИЕ: используем % от общей стоимости портфеля с leverage
          const baseTargetInvestment = portfolio.totalPortfolioValue * (capitalUsagePerTicker / 100);
          const targetInvestment = baseTargetInvestment * leverage; // Применяем плечо
          const entryPrice = bar.close;
          const quantity = Math.floor(targetInvestment / entryPrice);

          if (quantity > 0) {
            const stockCost = quantity * entryPrice;
            const entryCommission = calculateCommission(stockCost, strategy);
            // ИСПРАВЛЕНИЕ: Маржинальный депозит = только часть от стоимости акций, комиссия отдельно
            const marginRequired = stockCost / leverage; // Чистый маржинальный депозит
            const totalCashRequired = marginRequired + entryCommission; // Общие денежные затраты

            // Проверяем наличие свободного капитала для общих затрат
            if (portfolio.freeCapital >= totalCashRequired) {
              // ✨ СОЗДАЁМ ЧИСТУЮ ПОЗИЦИЮ
              positions[tickerIndex] = {
                ticker: tickerData.ticker,
                entryDate: bar.date,
                entryPrice: entryPrice,
                quantity: quantity,
                entryIndex: barIndex,
                totalCost: marginRequired,          // ИСПРАВЛЕНИЕ: Только маржинальный депозит (для расчета %)
                entryCommission: entryCommission,
                entryIBS: ibs
              };

              // ✨ ОБНОВЛЯЕМ СОСТОЯНИЕ ПОРТФЕЛЯ МАТЕМАТИЧЕСКИ КОРРЕКТНО
              portfolio.freeCapital -= totalCashRequired;        // ИСПРАВЛЕНИЕ: Вычитаем маржин + комиссию
              portfolio.totalInvestedCost += totalCashRequired;  // ИСПРАВЛЕНИЕ: Учитываем маржин + комиссию
              // totalPortfolioValue останется тем же (деньги перешли из free в invested)

              console.log(`🟢 ENTRY [${tickerData.ticker}]: IBS=${ibs.toFixed(3)} < ${lowIBS}`);
              console.log(`   💰 Stock Value: ${formatCurrencyUSD(stockCost)} | Margin: ${formatCurrencyUSD(marginRequired)} | Commission: ${formatCurrencyUSD(entryCommission)}`);
              console.log(`   📊 Portfolio: Free=${formatCurrencyUSD(portfolio.freeCapital)} | Invested=${formatCurrencyUSD(portfolio.totalInvestedCost)}`); console.log(`   🎯 Leverage: ${leverage.toFixed(1)}:1 | Total Cash Required: ${formatCurrencyUSD(totalCashRequired)}`);
            } else {
              logWarn('backtest', 'Entry signal but insufficient free capital', {
                ticker: tickerData.ticker,
                date: bar.date,
                ibs: ibs,
                freeCapital: portfolio.freeCapital,
                requiredCapital: totalCashRequired,
                targetInvestment,
                quantity
              }, 'BuyAtClose4Simulator_V2');
            }
          }
        }
      }

      // ✨ ЛОГИКА ВЫХОДА - НОВАЯ
      else {
        const daysSinceEntry = daysBetweenTradingDates(position.entryDate, bar.date);
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
          const stockProceeds = position.quantity * exitPrice;
          const exitCommission = calculateCommission(stockProceeds, strategy);
          const netProceeds = stockProceeds - exitCommission;

          // ✨ ЧИСТЫЙ РАСЧЁТ P&L с учетом leverage
          // ИСПРАВЛЕНИЕ: Корректный расчет P&L с leverage
          const stockValueAtEntry = position.quantity * position.entryPrice;
          const totalCommissions = position.entryCommission + exitCommission;
          const stockPnL = (exitPrice - position.entryPrice) * position.quantity; // Прибыль/убыток от изменения цены
          const totalPnL = stockPnL - totalCommissions; // Итоговая P&L за вычетом всех комиссий
          const totalCashInvested = position.totalCost + position.entryCommission; // Общие вложенные деньги
          const pnlPercent = totalCashInvested > 0 ? (totalPnL / totalCashInvested) * 100 : 0;

          // ✨ ОБНОВЛЯЕМ ПОРТФЕЛЬ МАТЕМАТИЧЕСКИ КОРРЕКТНО
          const capitalBeforeExit = portfolio.freeCapital;
          // ИСПРАВЛЕНИЕ: Возвращаем весь вложенный капитал + P&L
          portfolio.freeCapital += totalCashInvested + totalPnL;    // Возвращаем маржин + комиссию + P&L
          portfolio.totalInvestedCost -= totalCashInvested;         // ИСПРАВЛЕНИЕ: Убираем весь вложенный капитал

          // ✨ ЗАКРЫВАЕМ ПОЗИЦИЮ ПЕРЕД ПЕРЕСЧЁТОМ ПОРТФЕЛЯ
          positions[tickerIndex] = null;

          // ✨ ПЕРЕСЧИТЫВАЕМ ОБЩУЮ СТОИМОСТЬ ПОРТФЕЛЯ ПОСЛЕ СДЕЛКИ
          const updatedPortfolioAfterExit = updatePortfolioState(portfolio, positions, tickersData, currentDate, strategy);
          Object.assign(portfolio, updatedPortfolioAfterExit);

          // ✨ СОЗДАЁМ ИДЕАЛЬНУЮ СДЕЛКУ
          const trade: Trade = {
            id: `trade-${trades.length}`,
            entryDate: position.entryDate,
            exitDate: bar.date,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            quantity: position.quantity,
            pnl: totalPnL,
            pnlPercent: pnlPercent,
            duration: daysSinceEntry,
            exitReason: exitReason,
            context: {
              ticker: position.ticker,
              marketConditions: 'normal',
              indicatorValues: { IBS: position.entryIBS, exitIBS: ibs },
              volatility: 0,
              trend: 'sideways',
              // ✨ ИСПРАВЛЕННЫЕ КРИСТАЛЬНО ЧИСТЫЕ ДАННЫЕ
              initialInvestment: totalCashInvested,            // ИСПРАВЛЕНИЕ: Маржинальный депозит + комиссии входа
              grossInvestment: position.quantity * position.entryPrice, // Стоимость акций без комиссий
              leverage: leverage,                              // Используемое плечо
              leverageDebt: stockValueAtEntry - position.totalCost, // ИСПРАВЛЕНИЕ: Заёмные средства (без комиссий)
              commissionPaid: totalCommissions,                // ИСПРАВЛЕНИЕ: Все комиссии
              netProceeds: netProceeds,
              capitalBeforeExit: capitalBeforeExit,
              currentCapitalAfterExit: portfolio.totalPortfolioValue, // ✅ Показываем ОБЩУЮ стоимость портфеля
              marginUsed: position.totalCost                   // Чистый маржинальный депозит
            }
          };

          trades.push(trade);

          console.log(`🔴 EXIT [${position.ticker}]: IBS=${ibs.toFixed(3)}, ${exitReason}`);
          console.log(`   💰 P&L=${formatCurrencyUSD(totalPnL)} (${pnlPercent.toFixed(2)}%), Duration=${daysSinceEntry} days`);
          console.log(`   📊 Portfolio: Free=${formatCurrencyUSD(portfolio.freeCapital)} | Invested=${formatCurrencyUSD(portfolio.totalInvestedCost)}`);
        }
      }
    }

    // ✨ ОБНОВЛЯЕМ ФИНАЛЬНОЕ СОСТОЯНИЕ ПОРТФЕЛЯ И EQUITY
    const finalPortfolio = updatePortfolioState(portfolio, positions, tickersData, currentDate, strategy);
    Object.assign(portfolio, finalPortfolio);

    // ✨ КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Обновляем депозиты всех сделок за этот день
    const todaysTrades = trades.filter(trade =>
      isSameDay(trade.exitDate, currentDate)
    );

    if (todaysTrades.length > 0) {
      console.log(`📊 FIXING ${todaysTrades.length} trades for ${formatTradingDateDisplay(currentDate)}: Final Portfolio = ${formatCurrencyUSD(portfolio.totalPortfolioValue)}`);

      // Все сделки за один день показывают одинаковый итоговый депозит
      todaysTrades.forEach(trade => {
        if (trade.context) {
          trade.context.currentCapitalAfterExit = portfolio.totalPortfolioValue;
        }
      });
    }

    // Рассчитываем drawdown
    const peakValue = equity.length > 0
      ? Math.max(...equity.map(e => e.value), portfolio.totalPortfolioValue)
      : portfolio.totalPortfolioValue;
    const drawdown = peakValue > 0 ? ((peakValue - portfolio.totalPortfolioValue) / peakValue) * 100 : 0;

    equity.push({
      date: currentDate, // TradingDate string
      value: portfolio.totalPortfolioValue,
      drawdown: drawdown
    });
  }

  // ✨ ЗАКРЫВАЕМ ВСЕ ОСТАВШИЕСЯ ПОЗИЦИИ (аналогичная логика)
  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    if (position) {
      const tickerData = tickersData[i];
      const lastBarIndex = tickerData.data.length - 1;
      const lastBar = tickerData.data[lastBarIndex];

      const exitPrice = lastBar.close;
      const stockProceeds = position.quantity * exitPrice;
      const exitCommission = calculateCommission(stockProceeds, strategy);
      const netProceeds = stockProceeds - exitCommission;

      // ИСПРАВЛЕНИЕ: Корректный расчет P&L для конца данных
      const stockValueAtEntry = position.quantity * position.entryPrice;
      const totalCommissions = position.entryCommission + exitCommission;
      const stockPnL = (exitPrice - position.entryPrice) * position.quantity;
      const totalPnL = stockPnL - totalCommissions;
      const totalCashInvested = position.totalCost + position.entryCommission;
      const pnlPercent = totalCashInvested > 0 ? (totalPnL / totalCashInvested) * 100 : 0;
      const duration = daysBetweenTradingDates(position.entryDate, lastBar.date);

      const capitalBeforeExit = portfolio.freeCapital;
      // ИСПРАВЛЕНИЕ: Возвращаем весь вложенный капитал + P&L
      portfolio.freeCapital += totalCashInvested + totalPnL;
      portfolio.totalInvestedCost -= totalCashInvested;

      // ✨ ОБНОВЛЯЕМ ОБЩУЮ СТОИМОСТЬ ПОРТФЕЛЯ
      portfolio.totalPortfolioValue = portfolio.freeCapital + portfolio.totalInvestedCost;

      const trade: Trade = {
        id: `trade-${trades.length}`,
        entryDate: position.entryDate,
        exitDate: lastBar.date,
        entryPrice: position.entryPrice,
        exitPrice: exitPrice,
        quantity: position.quantity,
        pnl: totalPnL,
        pnlPercent: pnlPercent,
        duration: duration,
        exitReason: 'end_of_data',
        context: {
          ticker: position.ticker,
          marketConditions: 'normal',
          indicatorValues: { IBS: position.entryIBS, exitIBS: tickerData.ibsValues[lastBarIndex] },
          volatility: 0,
          trend: 'sideways',
          initialInvestment: totalCashInvested,                    // ИСПРАВЛЕНИЕ: Маржин + комиссия входа
          grossInvestment: position.quantity * position.entryPrice,
          leverage: leverage,
          leverageDebt: stockValueAtEntry - position.totalCost + position.entryCommission,
          commissionPaid: position.entryCommission + exitCommission,
          netProceeds: netProceeds,
          capitalBeforeExit: capitalBeforeExit,
          currentCapitalAfterExit: portfolio.totalPortfolioValue, // ✅ Общая стоимость портфеля
          marginUsed: position.totalCost
        }
      };

      trades.push(trade);
      console.log(`🔴 FINAL EXIT [${position.ticker}]: P&L=${formatCurrencyUSD(totalPnL)} (${pnlPercent.toFixed(2)}%)`);
    }
  }

  // ✨ ИСПРАВЛЯЕМ ДЕПОЗИТЫ ДЛЯ ФИНАЛЬНЫХ СДЕЛОК
  // Группируем финальные сделки по датам и обновляем депозиты
  const finalTradesMap = new Map<string, Trade[]>();

  trades.forEach(trade => {
    if (trade.exitReason === 'end_of_data') {
      const dateKey = trade.exitDate; // TradingDate string
      if (!finalTradesMap.has(dateKey)) {
        finalTradesMap.set(dateKey, []);
      }
      finalTradesMap.get(dateKey)!.push(trade);
    }
  });

  // Для каждой даты финальных сделок обновляем депозит до общего финального значения
  finalTradesMap.forEach((dailyTrades, dateKey) => {
    console.log(`📊 FIXING ${dailyTrades.length} final trades for ${dateKey}: Final Portfolio = ${formatCurrencyUSD(portfolio.totalPortfolioValue)}`);

    dailyTrades.forEach(trade => {
      if (trade.context) {
        trade.context.currentCapitalAfterExit = portfolio.totalPortfolioValue;
      }
    });
  });

  const finalValue = portfolio.totalPortfolioValue; // Общая стоимость портфеля
  const maxDrawdown = equity.length > 0 ? Math.max(...equity.map(e => e.drawdown)) : 0;

  // Базовые метрики
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0;
  const profitFactor = (avgWin * winningTrades.length) / Math.abs(avgLoss * losingTrades.length) || 0;

  const cagr = calculateCAGR(
    finalValue,
    initialCapital,
    sortedDates.length > 0 ? sortedDates[0] : new Date(),
    sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : new Date()
  );

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

  console.log(`✅ PERFECT BACKTEST COMPLETED:`);
  console.log(`💰 Final Value: ${formatCurrencyUSD(finalValue)} (${totalReturn.toFixed(2)}%)`);
  console.log(`📊 Total Trades: ${trades.length} (Win Rate: ${winRate.toFixed(1)}%)`);
  console.log(`📉 Max Drawdown: ${maxDrawdown.toFixed(2)}%`);

  return { equity, finalValue, maxDrawdown, trades, metrics };
}

export function BuyAtClose4Simulator({ strategy, defaultTickers = ['AAPL', 'MSFT', 'AMZN', 'MAGS'] }: BuyAtClose4SimulatorProps) {
  const [tickers, setTickers] = useState<string[]>(defaultTickers);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedData, setLoadedData] = useState<TickerData[]>([]);
  const [inputValue, setInputValue] = useState(defaultTickers.join(', '));
  const [leveragePercent, setLeveragePercent] = useState<number>(100); // 100% = 1:1, 200% = 2:1

  // Расчет капитала на тикер - всегда определен для безопасного доступа
  const capitalUsagePerTicker = tickers.length > 0 ? Math.floor(100 / tickers.length) : 25;

  // Запуск бэктеста при изменении данных, стратегии или leverage
  const backtest = useMemo(() => {
    if (!strategy || loadedData.length === 0) {
      return { equity: [], finalValue: 0, maxDrawdown: 0, trades: [], metrics: {} };
    }
    return runMultiTickerBacktest(loadedData, strategy, leveragePercent / 100);
  }, [loadedData, strategy, leveragePercent]);

  // Загрузка данных для всех тикеров
  const loadAllData = useCallback(async () => {
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
  }, [tickers]);

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
  }, [loadAllData]);

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
          Мультитикерная IBS стратегия (V2 - Perfect Logic)
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Торговля по множественным тикерам с математически корректным распределением капитала
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
            placeholder="AAPL, MSFT, AMZN, MAGS"
            className="flex-1 min-w-[150px] px-3 py-2 border rounded-lg dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
          />
          <button
            onClick={applyTickers}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Загрузка...' : 'Применить'}
          </button>
          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Перезагрузить
          </button>
        </div>

        {/* Настройка leverage */}
        <div className="mt-4 p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Leverage (плечо): {leveragePercent}% {leveragePercent > 100 ? `(${(leveragePercent / 100).toFixed(1)}:1)` : ''}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="100"
              max="300"
              step="25"
              value={leveragePercent}
              onChange={(e) => setLeveragePercent(Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min="100"
              max="300"
              step="25"
              value={leveragePercent}
              onChange={(e) => setLeveragePercent(Number(e.target.value))}
              className="w-20 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="text-sm text-gray-500">%</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            100% = без плеча, 200% = 2:1, 300% = 3:1. Увеличивает потенциальную прибыль и риск.
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          <p>Текущие тикеры: <span className="font-mono">{tickers.join(', ')}</span></p>
          <p>Капитал на тикер: {capitalUsagePerTicker}% ({tickers.length} тикеров)</p>
          <p>Leverage: <span className="font-mono text-orange-600 dark:text-orange-400">{(leveragePercent / 100).toFixed(1)}:1</span></p>
          <p className="text-green-600 dark:text-green-400">
            ✨ V2 Logic: Dynamic allocation from total portfolio value with leverage
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
      {!isLoading && loadedData.length > 0 && (
        <>
          {/* Метрики */}
          <SimulationStatsGrid
            finalValue={backtest.finalValue}
            totalReturn={backtest.metrics.totalReturn}
            cagr={backtest.metrics.cagr || 0}
            winRate={backtest.metrics.winRate}
            maxDrawdown={backtest.maxDrawdown}
            tradeCount={backtest.trades.length}
            leverage={leveragePercent / 100}
          />

          {/* График equity */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
              График доходности портфеля (V2 - Perfect Logic)
            </h3>
            <div className="w-full h-[600px] min-h-[600px]">
              <EquityChart equity={backtest.equity} hideHeader />
            </div>
          </div>

          {/* Таблица сделок */}
          {backtest.trades.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                История сделок ({backtest.trades.length}) - V2 Perfect Logic
              </h3>

              <StrategyParameters
                strategy={strategy}
                additionalParams={{
                  'Капитал на тикер': `${capitalUsagePerTicker}%`,
                  'Количество тикеров': tickers.length,
                  'Начальный капитал': '$10,000',
                  'Leverage': `${(leveragePercent / 100).toFixed(1)}:1 (${leveragePercent}%)`,
                  'Логика': 'V2 - Dynamic from total portfolio with leverage'
                }}
              />

              <div className="max-h-[600px] overflow-auto">
                <TradesTable
                  trades={backtest.trades}
                  exportFileNamePrefix="trades-buy-at-close-v2"
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Индикатор загрузки */}
      {isLoading && (
        <div className="text-center py-8">
          <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Загружаем данные...</p>
        </div>
      )}
    </div>
  );
}