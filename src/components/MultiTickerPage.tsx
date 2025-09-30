import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { useAppStore } from '../stores';
import type { Strategy, OHLCData, Trade, EquityPoint, SplitEvent, MonitorTradeHistoryResponse } from '../types';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { MultiTickerChart } from './MultiTickerChart';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { runSinglePositionBacktest, optimizeTickerData, formatCurrencyCompact } from '../lib/singlePositionBacktest';
import { MiniQuoteChart } from './MiniQuoteChart';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { MonitorTradeHistoryPanel } from './MonitorTradeHistoryPanel';

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
  splits: SplitEvent[];
}

interface BacktestResults {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: {
    totalReturn: number;
    cagr: number;
    winRate: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    profitFactor: number;
  };
}

function calculateTradeStats(trades: Trade[] = []) {
  const totalTrades = trades.length;
  let wins = 0;
  let losses = 0;
  let totalPnL = 0;
  let totalDuration = 0;

  trades.forEach(trade => {
    const pnl = trade.pnl ?? 0;
    if (pnl > 0) wins += 1;
    if (pnl < 0) losses += 1;
    totalPnL += pnl;
    totalDuration += trade.duration ?? 0;
  });

  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgDuration = totalTrades > 0 ? totalDuration / totalTrades : 0;

  return {
    totalTrades,
    wins,
    losses,
    breakeven: totalTrades - wins - losses,
    totalPnL,
    winRate,
    avgDuration
  };
}

export function MultiTickerPage() {
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT', 'GOOGL', 'AMZN']);
  const [tickersInput, setTickersInput] = useState<string>('AAPL, MSFT, GOOGL, AMZN');
  const [leveragePercent, setLeveragePercent] = useState(200);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [tickersData, setTickersData] = useState<TickerData[]>([]);
  const [activeTab, setActiveTab] = useState<'price' | 'equity' | 'trades' | 'monitorTrades' | 'splits'>('price');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');
  const [monitorTradeHistory, setMonitorTradeHistory] = useState<MonitorTradeHistoryResponse | null>(null);
  const [monitorTradesLoading, setMonitorTradesLoading] = useState(false);
  const [monitorTradesError, setMonitorTradesError] = useState<string | null>(null);

  const currentStrategy = useAppStore(s => s.currentStrategy);
  const fallbackStrategyRef = useRef<Strategy | null>(null);

  if (!fallbackStrategyRef.current) {
    fallbackStrategyRef.current = createStrategyFromTemplate(STRATEGY_TEMPLATES[0]);
  }

  const activeStrategy = currentStrategy ?? fallbackStrategyRef.current;
  const lowIBS = Number(activeStrategy?.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(activeStrategy?.parameters?.highIBS ?? 0.75);
  const maxHoldDays = Number(
    typeof activeStrategy?.parameters?.maxHoldDays === 'number'
      ? activeStrategy.parameters.maxHoldDays
      : activeStrategy?.riskManagement?.maxHoldDays ?? 30
  );

  const tradesByTicker = useMemo(() => {
    if (!backtestResults?.trades) return {} as Record<string, Trade[]>;
    return backtestResults.trades.reduce<Record<string, Trade[]>>((acc, trade) => {
      const ticker = (trade.context?.ticker || '').toUpperCase();
      if (!ticker) return acc;
      if (!acc[ticker]) acc[ticker] = [];
      acc[ticker].push(trade);
      return acc;
    }, {});
  }, [backtestResults]);

  const filteredTrades = useMemo(() => {
    if (!backtestResults) return [] as Trade[];
    if (selectedTradeTicker === 'all') return backtestResults.trades;
    const targetTicker = (selectedTradeTicker || '').toUpperCase();
    return backtestResults.trades.filter(
      trade => (trade.context?.ticker || '').toUpperCase() === targetTicker
    );
  }, [backtestResults, selectedTradeTicker]);

  const filteredTradeStats = useMemo(() => calculateTradeStats(filteredTrades), [filteredTrades]);

  const totalSplitsCount = useMemo(
    () => tickersData.reduce((sum, ticker) => sum + (ticker.splits?.length || 0), 0),
    [tickersData]
  );

  const loadMonitorTrades = useCallback(async () => {
    setMonitorTradesLoading(true);
    setMonitorTradesError(null);
    try {
      const history = await DatasetAPI.getMonitorTradeHistory();
      setMonitorTradeHistory(history);
    } catch (e) {
      setMonitorTradesError(e instanceof Error ? e.message : 'Не удалось загрузить сделки мониторинга');
    } finally {
      setMonitorTradesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitorTrades();
  }, [loadMonitorTrades]);

  // Функция загрузки данных тикера
  const loadTickerData = async (ticker: string): Promise<TickerData> => {
    const ds = await DatasetAPI.getDataset(ticker);

    const normalizedTicker = (ds.ticker || ticker).toUpperCase();

    let splits: SplitEvent[] = [];
    try {
      splits = await DatasetAPI.getSplits(normalizedTicker);
    } catch {
      splits = [];
    }

    let processedData: OHLCData[];

    if ((ds as any).adjustedForSplits) {
      processedData = dedupeDailyOHLC(ds.data as unknown as OHLCData[]);
    } else {
      processedData = dedupeDailyOHLC(adjustOHLCForSplits(ds.data as unknown as OHLCData[], splits));
    }

    const ibsValues = processedData.length > 0 ? IndicatorEngine.calculateIBS(processedData) : [];

    return {
      ticker: normalizedTicker,
      data: processedData,
      ibsValues,
      splits
    };
  };

  // Запуск бэктеста
  const runBacktest = async () => {
    if (!activeStrategy) {
      setError('Недоступна стратегия для запуска расчёта');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🚀 Loading data for tickers:', tickers);
      const tickersDataPromises = tickers.map(ticker => loadTickerData(ticker));
      const loadedData = await Promise.all(tickersDataPromises);

      console.log('✅ Loaded data:', loadedData.map(t => ({ ticker: t.ticker, bars: t.data.length })));

      if (loadedData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      setTickersData(loadedData);

      // Run backtest with real logic
      const optimizedData = optimizeTickerData(loadedData);
      const backtestResult = runSinglePositionBacktest(optimizedData, activeStrategy, leveragePercent / 100);

      const results: BacktestResults = {
        equity: backtestResult.equity,
        finalValue: backtestResult.finalValue,
        maxDrawdown: backtestResult.maxDrawdown,
        trades: backtestResult.trades,
        metrics: {
          totalReturn: backtestResult.metrics.totalReturn || 0,
          cagr: backtestResult.metrics.cagr || 0,
          winRate: backtestResult.metrics.winRate || 0,
          totalTrades: backtestResult.metrics.totalTrades || 0,
          winningTrades: backtestResult.metrics.winningTrades || 0,
          losingTrades: backtestResult.metrics.losingTrades || 0,
          profitFactor: backtestResult.metrics.profitFactor || 0
        }
      };

      setBacktestResults(results);
      setSelectedTradeTicker('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выполнении бэктеста');
      console.error('Backtest error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: number): string => {
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    } else if (Math.abs(value) >= 1_000) {
      return `$${(value / 1_000).toFixed(1)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и контролы */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Несколько тикеров
          </h1>
          <Settings className="w-6 h-6 text-gray-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Стратегия
            </div>
            <div className="h-full rounded-md border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900/60 dark:bg-blue-950/40">
              <div className="text-base font-semibold text-blue-700 dark:text-blue-300">
                {activeStrategy?.name || 'IBS Mean Reversion'}
              </div>
              <p className="mt-2 text-gray-700 dark:text-gray-200">
                Вход при IBS ниже {Math.round(lowIBS * 100)}%, выход при превышении {Math.round(highIBS * 100)}% или по истечении {maxHoldDays} дн.
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-600 dark:text-gray-300">
                <div>
                  <dt className="uppercase tracking-wide">Риск-менеджмент</dt>
                  <dd className="mt-1 font-medium text-gray-800 dark:text-gray-100">
                    1 позиция • {activeStrategy?.riskManagement?.capitalUsage ?? 100}% капитала
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wide">Комиссия</dt>
                  <dd className="mt-1 font-medium text-gray-800 dark:text-gray-100">
                    {activeStrategy?.riskManagement?.commission?.type === 'percentage'
                      ? `${activeStrategy?.riskManagement?.commission?.percentage ?? 0}%`
                      : activeStrategy?.riskManagement?.commission?.type === 'fixed'
                        ? `$${activeStrategy?.riskManagement?.commission?.fixed ?? 0}`
                        : 'Комбинированная'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Тикеры */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Тикеры (через запятую)
            </label>
            <input
              type="text"
              value={tickersInput}
              onChange={(e) => {
                setTickersInput(e.target.value);
                const parsedTickers = Array.from(new Set(
                  e.target.value
                    .split(',')
                    .map(t => t.trim().toUpperCase())
                    .filter(Boolean)
                ));
                setTickers(parsedTickers);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              placeholder="AAPL, MSFT, GOOGL, AMZN"
            />
          </div>

          {/* Leverage */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Leverage: {(leveragePercent/100).toFixed(1)}:1
            </label>
            <select
              value={leveragePercent}
              onChange={(e) => setLeveragePercent(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value={100}>100% (без плеча)</option>
              <option value={150}>150% (1.5:1)</option>
              <option value={200}>200% (2:1)</option>
              <option value={250}>250% (2.5:1)</option>
              <option value={300}>300% (3:1)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex flex-wrap items-center justify-between gap-2 text-gray-700 dark:text-gray-300">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">Текущие тикеры</p>
                  <p className="font-mono text-sm">{tickers.join(', ') || '—'}</p>
                </div>
                <div className="text-right">
                  <p>Торговое плечо: {(leveragePercent / 100).toFixed(1)}:1</p>
                  <p>Максимум 1 позиция одновременно</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>Тикеры: <span className="font-mono">{tickers.join(', ')}</span></p>
            <p>Стратегия Single Position: одна позиция на весь депозит</p>
          </div>

          <button
            onClick={runBacktest}
            disabled={isLoading || !activeStrategy || tickers.length === 0}
            className="inline-flex items-center px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
          >
            {isLoading ? 'Расчёт...' : 'Запустить бэктест'}
          </button>
        </div>
      </div>

      {/* Основной график */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Сводный график тикеров
        </h2>
        <MultiTickerChart tickersData={tickersData} height={500} />
      </div>

      {/* Метрики доходности */}
      {backtestResults && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(backtestResults.finalValue)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Итоговый баланс</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {backtestResults.metrics.totalReturn.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Общая доходность</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {backtestResults.metrics.cagr.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">CAGR</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {backtestResults.metrics.winRate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {backtestResults.maxDrawdown.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-indigo-600">
              {backtestResults.metrics.totalTrades}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Всего сделок</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
            <div className="text-2xl font-bold text-teal-600">
              {backtestResults.metrics.profitFactor.toFixed(2)}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Profit Factor</div>
          </div>
        </div>
      )}

      {/* Табы с анализом */}
      {backtestResults && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {/* Заголовки табов */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {[
              { id: 'price' as const, label: '📈 Цены' },
              { id: 'equity' as const, label: '💰 Equity' },
              { id: 'trades' as const, label: '📊 Сделки (бэктест)' },
              { id: 'monitorTrades' as const, label: '📝 Сделки (мониторинг)' },
              { id: 'splits' as const, label: '🪙 Сплиты' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Содержимое табов */}
          <div className="p-6">
            {activeTab === 'price' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Индивидуальные графики цен
                </h3>
                {tickersData.length === 0 ? (
                  <div className="h-48 rounded border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    Нет данных для отображения. Запустите бэктест, чтобы загрузить котировки.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {tickersData.map(tickerData => {
                      const tradesForTicker = tradesByTicker[tickerData.ticker] || [];
                      const stats = calculateTradeStats(tradesForTicker);
                      const lastBar = tickerData.data[tickerData.data.length - 1];
                      const prevBar = tickerData.data.length > 1 ? tickerData.data[tickerData.data.length - 2] : undefined;
                      const dailyChange = lastBar && prevBar && prevBar.close !== 0
                        ? ((lastBar.close - prevBar.close) / prevBar.close) * 100
                        : null;

                      return (
                        <div
                          key={tickerData.ticker}
                          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                {tickerData.ticker}
                              </div>
                              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Баров: {tickerData.data.length}
                              </div>
                            </div>
                            {lastBar && (
                              <div className="text-right">
                                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                  ${lastBar.close.toFixed(2)}
                                </div>
                                {dailyChange !== null && Number.isFinite(dailyChange) && (
                                  <div className={`text-sm font-medium ${dailyChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500 dark:text-orange-400'}`}>
                                    {dailyChange >= 0 ? '+' : ''}{dailyChange.toFixed(2)}%
                                  </div>
                                )}
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Обновлено {lastBar.date.toLocaleDateString('ru-RU')}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 h-48">
                            <MiniQuoteChart
                              history={tickerData.data}
                              today={null}
                              trades={tradesForTicker}
                              highIBS={highIBS}
                              isOpenPosition={false}
                            />
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
                            <div>
                              <div className="text-xs uppercase tracking-wide">Сделок</div>
                              <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                                {stats.totalTrades}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide">Win rate</div>
                              <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                                {stats.winRate.toFixed(1)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide">PnL</div>
                              <div className={`mt-1 text-base font-semibold ${stats.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-500 dark:text-orange-300'}`}>
                                {formatCurrencyCompact(stats.totalPnL)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide">Средняя длительность</div>
                              <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                                {stats.avgDuration.toFixed(1)} дн.
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'equity' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  График капитала
                </h3>
                {backtestResults.equity.length > 0 ? (
                  <div className="w-full h-[500px]">
                    <EquityChart equity={backtestResults.equity} hideHeader />
                  </div>
                ) : (
                  <div className="h-96 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <div className="text-gray-500 dark:text-gray-400 text-center">
                      <div className="text-lg font-medium mb-2">📈 Equity Chart</div>
                      <p className="text-sm">Нет данных по equity</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'trades' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  История сделок ({backtestResults.trades.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedTradeTicker('all')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      selectedTradeTicker === 'all'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Все ({backtestResults.trades.length})
                  </button>
                  {tickersData.map(tickerData => {
                    const tradesForTicker = tradesByTicker[tickerData.ticker] || [];
                    return (
                      <button
                        key={tickerData.ticker}
                        onClick={() => setSelectedTradeTicker(tickerData.ticker)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                          selectedTradeTicker === tickerData.ticker
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {tickerData.ticker} ({tradesForTicker.length})
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-900/40 md:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Сделок</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{filteredTradeStats.totalTrades}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Win rate</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{filteredTradeStats.winRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">PnL</div>
                    <div className={`mt-1 text-lg font-semibold ${filteredTradeStats.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-500 dark:text-orange-300'}`}>
                      {formatCurrencyCompact(filteredTradeStats.totalPnL)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Средняя длительность</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{filteredTradeStats.avgDuration.toFixed(1)} дн.</div>
                  </div>
                </div>

                {filteredTrades.length > 0 ? (
                  <div className="max-h-[600px] overflow-auto">
                    <TradesTable trades={filteredTrades} />
                  </div>
                ) : (
                  <div className="h-72 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <div className="text-gray-500 dark:text-gray-400 text-center">
                      <div className="text-lg font-medium mb-2">📊 Trades Table</div>
                      <p className="text-sm">Для выбранного тикера сделки отсутствуют</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'monitorTrades' && (
              <div className="space-y-4">
                <MonitorTradeHistoryPanel
                  data={monitorTradeHistory}
                  loading={monitorTradesLoading}
                  error={monitorTradesError}
                  onRefresh={loadMonitorTrades}
                />
              </div>
            )}

            {activeTab === 'splits' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    История сплитов по тикерам
                  </h3>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Всего сплитов: {totalSplitsCount}
                  </div>
                </div>

                {tickersData.length === 0 ? (
                  <div className="h-48 rounded border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    Нет данных о сплитах. Запустите бэктест, чтобы загрузить истории тикеров.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {tickersData.map(tickerData => {
                      const sortedSplits = [...(tickerData.splits || [])].sort((a, b) => b.date.localeCompare(a.date));
                      const hasSplits = sortedSplits.length > 0;

                      return (
                        <div
                          key={tickerData.ticker}
                          className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{tickerData.ticker}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {hasSplits ? `Найдено ${sortedSplits.length} ${sortedSplits.length === 1 ? 'событие' : 'событий'}` : 'Сплиты не найдены'}
                              </div>
                            </div>
                            {hasSplits && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                                Последний: {new Date(sortedSplits[0].date).toLocaleDateString('ru-RU')}
                              </div>
                            )}
                          </div>

                          <div className="mt-3 space-y-2">
                            {hasSplits ? (
                              sortedSplits.map((split, index) => (
                                <div
                                  key={`${tickerData.ticker}-${split.date}-${index}`}
                                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                >
                                  <span className="font-mono">{new Date(split.date).toLocaleDateString('ru-RU')}</span>
                                  <span className="font-semibold text-gray-900 dark:text-gray-100">Коэфф.: {split.factor}:1</span>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-md bg-gray-50 px-3 py-3 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                                Для этого тикера сплиты не найдены.
                              </div>
                            )}
                          </div>

                          <div className="mt-4 text-xs">
                            <a
                              href={`https://seekingalpha.com/symbol/${tickerData.ticker}/splits`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Подробнее о сплитах {tickerData.ticker}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ошибки */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        </div>
      )}

      {/* Состояние загрузки */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="text-gray-600 dark:text-gray-400">
            🔄 Загрузка данных и выполнение бэктеста...
          </div>
        </div>
      )}
    </div>
  );
}