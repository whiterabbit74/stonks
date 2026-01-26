import { useCallback, useMemo, useRef, useState } from 'react';
import { useToastActions, MetricsGrid, ChartContainer, AnalysisTabs } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, OHLCData, Trade, EquityPoint, SplitEvent } from '../types';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { MultiTickerChart } from './MultiTickerChart';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { ProfitFactorAnalysis } from './ProfitFactorAnalysis';
import { TradeDrawdownChart } from './TradeDrawdownChart';
import { DurationAnalysis } from './DurationAnalysis';
import { runSinglePositionBacktest, optimizeTickerData, formatCurrencyCompact } from '../lib/singlePositionBacktest';
import { calculateTradeStats } from '../lib/trade-utils';
import { SplitsList } from './SplitsList';
import { StrategyInfoCard } from './StrategyInfoCard';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { TickerCardsGrid } from './TickerCardsGrid';

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
    netProfit: number;
    netReturn: number;
    totalContribution: number;
    contributionCount: number;
  };
}

export function MultiTickerPage() {
  const defaultMultiTickerSymbols = useAppStore(s => s.defaultMultiTickerSymbols);

  // Parse default symbols from settings
  const getDefaultTickers = () => {
    const symbolsStr = defaultMultiTickerSymbols || 'AAPL,MSFT,AMZN,MAGS';
    return symbolsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  };

  const [tickers, setTickers] = useState<string[]>(getDefaultTickers());
  const [tickersInput, setTickersInput] = useState<string>(defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS');
  const [leveragePercent, setLeveragePercent] = useState(200);
  const [monthlyContributionAmount, setMonthlyContributionAmount] = useState<number>(500);
  const [monthlyContributionDay, setMonthlyContributionDay] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [monthlyContributionResults, setMonthlyContributionResults] = useState<BacktestResults | null>(null);
  const [tickersData, setTickersData] = useState<TickerData[]>([]);
  type TabId = 'price' | 'tickerCharts' | 'equity' | 'trades' | 'profit' | 'monthlyContribution' | 'splits' | 'drawdown' | 'duration';
  const [activeTab, setActiveTab] = useState<TabId>('price');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');
  const [refreshingTickers, setRefreshingTickers] = useState<Set<string>>(new Set());

  // Check if data is outdated (last bar is more than 1 trading day old)
  const isDataOutdated = useCallback((lastDate: string | Date | undefined): boolean => {
    if (!lastDate) return true;
    const now = new Date();
    const lastDateNormalized = new Date(lastDate);
    // Get difference in days
    const diffMs = now.getTime() - lastDateNormalized.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    // Data is outdated if it's more than 2 days old (accounts for weekends)
    return diffDays > 2;
  }, []);

  // Handle refresh for a single ticker
  const toast = useToastActions();
  const handleRefreshTicker = useCallback(async (ticker: string) => {
    setRefreshingTickers(prev => new Set(prev).add(ticker));
    try {
      const result = await DatasetAPI.refreshDataset(ticker);
      // Reload ticker data
      const newData = await loadTickerData(ticker);
      setTickersData(prev => prev.map(td => td.ticker === ticker ? newData : td));
      // Show success toast with number of days added
      const addedDays = result?.added ?? 0;
      if (addedDays > 0) {
        toast.success(`${ticker}: добавлено ${addedDays} ${addedDays === 1 ? 'день' : addedDays < 5 ? 'дня' : 'дней'}`);
      } else {
        toast.info(`${ticker}: данные актуальны`);
      }
    } catch (err) {
      console.error(`Failed to refresh ${ticker}:`, err);
      toast.error(`${ticker}: не удалось обновить данные`);
    } finally {
      setRefreshingTickers(prev => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  }, [toast]);

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
  const initialCapital = Number(activeStrategy?.riskManagement?.initialCapital ?? 10000);

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

  const monthlyScenarioDiff = useMemo(() => {
    if (!backtestResults || !monthlyContributionResults) return null;

    return {
      finalValueDelta: monthlyContributionResults.finalValue - backtestResults.finalValue,
      totalReturnDelta: monthlyContributionResults.metrics.totalReturn - backtestResults.metrics.totalReturn,
      cagrDelta: monthlyContributionResults.metrics.cagr - backtestResults.metrics.cagr,
      netProfitDelta: monthlyContributionResults.metrics.netProfit - backtestResults.metrics.netProfit
    };
  }, [backtestResults, monthlyContributionResults]);

  const totalSplitsCount = useMemo(
    () => tickersData.reduce((sum, ticker) => sum + (ticker.splits?.length || 0), 0),
    [tickersData]
  );

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
    setMonthlyContributionResults(null);

    try {
      console.log('Loading data for tickers:', tickers);
      const tickersDataPromises = tickers.map(ticker => loadTickerData(ticker));
      const loadedData = await Promise.all(tickersDataPromises);

      console.log('Loaded data:', loadedData.map(t => ({ ticker: t.ticker, bars: t.data.length })));

      if (loadedData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      setTickersData(loadedData);

      // Run backtest with real logic
      const optimizedData = optimizeTickerData(loadedData);
      const backtestResult = runSinglePositionBacktest(
        optimizedData,
        activeStrategy,
        leveragePercent / 100,
        { allowSameDayReentry: true }
      );

      const monthlyResult = runSinglePositionBacktest(
        optimizedData,
        activeStrategy,
        leveragePercent / 100,
        {
          allowSameDayReentry: true,
          monthlyContribution:
            monthlyContributionAmount > 0
              ? {
                amount: monthlyContributionAmount,
                dayOfMonth: monthlyContributionDay,
                startDate: optimizedData[0]?.data?.[0]?.date ? new Date(optimizedData[0].data[0].date) : undefined
              }
              : null
        }
      );

      const mapResult = (source: ReturnType<typeof runSinglePositionBacktest>): BacktestResults => ({
        equity: source.equity,
        finalValue: source.finalValue,
        maxDrawdown: source.maxDrawdown,
        trades: source.trades,
        metrics: {
          totalReturn: source.metrics.totalReturn || 0,
          cagr: source.metrics.cagr || 0,
          winRate: source.metrics.winRate || 0,
          totalTrades: source.metrics.totalTrades || 0,
          winningTrades: source.metrics.winningTrades || 0,
          losingTrades: source.metrics.losingTrades || 0,
          profitFactor: source.metrics.profitFactor || 0,
          netProfit: source.metrics.netProfit ?? 0,
          netReturn: source.metrics.netReturn ?? 0,
          totalContribution: source.metrics.totalContribution ?? 0,
          contributionCount: source.metrics.contributionCount ?? 0
        }
      });

      setBacktestResults(mapResult(backtestResult));
      setMonthlyContributionResults(mapResult(monthlyResult));
      setSelectedTradeTicker('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выполнении бэктеста');
      console.error('Backtest error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Format currency with comma separators (e.g. $1,234,567.89)
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Заголовок и контролы — Card-based дизайн */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        {/* Заголовок */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Несколько тикеров
          </h1>
          <div className="mt-2 h-px bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-transparent" />
        </div>

        {/* Две карточки */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <StrategyInfoCard
            strategy={activeStrategy}
            lowIBS={lowIBS}
            highIBS={highIBS}
            maxHoldDays={maxHoldDays}
          />

          {/* Карточка Параметры */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/60 dark:to-slate-900/40 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-400/10">
                <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <span className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Параметры
              </span>
            </div>

            <div className="space-y-4">
              {/* Тикеры */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Тикеры
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
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  placeholder="AAPL, MSFT, AMZN, MAGS"
                />
                {tickers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tickers.map((ticker, idx) => (
                      <span
                        key={ticker}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${idx % 4 === 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' :
                          idx % 4 === 1 ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' :
                            idx % 4 === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' :
                              'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                          }`}
                      >
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Leverage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Leverage
                </label>
                <select
                  value={leveragePercent}
                  onChange={(e) => setLeveragePercent(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                >
                  <option value={100}>1:1 — без плеча</option>
                  <option value={150}>1.5:1</option>
                  <option value={200}>2:1</option>
                  <option value={250}>2.5:1</option>
                  <option value={300}>3:1</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Кнопка запуска */}
        <div className="flex justify-center">
          <button
            onClick={runBacktest}
            disabled={isLoading || !activeStrategy || tickers.length === 0}
            className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:shadow-none transition-all duration-200"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Расчёт...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Запустить бэктест
              </>
            )}
          </button>
        </div>
      </div>

      {/* Метрики доходности */}
      {backtestResults && (
        <MetricsGrid
          finalValue={backtestResults.finalValue}
          maxDrawdown={backtestResults.maxDrawdown}
          metrics={backtestResults.metrics}
        />
      )}

      {/* Табы с анализом */}
      {backtestResults && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <AnalysisTabs
            tabs={[
              { id: 'price', label: 'Цены' },
              { id: 'tickerCharts', label: 'Графики тикеров' },
              { id: 'equity', label: 'Equity' },
              { id: 'drawdown', label: 'Просадка' },
              { id: 'trades', label: 'Сделки' },
              { id: 'profit', label: 'Profit factor' },
              { id: 'duration', label: 'Длительность' },
              monthlyContributionResults ? { id: 'monthlyContribution', label: 'Пополнения' } : null,
              { id: 'splits', label: 'Сплиты' },
            ].filter((t): t is { id: string; label: string } => !!t)}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />

          {/* Содержимое табов */}
          <div className="p-6">
            {activeTab === 'price' && (
              <ChartContainer title="Сводный график тикеров">
                <MultiTickerChart tickersData={tickersData} trades={backtestResults?.trades || []} height={650} />
              </ChartContainer>
            )}

            {activeTab === 'tickerCharts' && (
              <TickerCardsGrid
                tickersData={tickersData}
                tradesByTicker={tradesByTicker}
                highIBS={highIBS}
                isDataOutdated={isDataOutdated}
                handleRefreshTicker={handleRefreshTicker}
                refreshingTickers={refreshingTickers}
              />
            )}

            {activeTab === 'equity' && (
              <ChartContainer
                title="График капитала"
                isEmpty={!backtestResults.equity.length}
                emptyMessage="Нет данных по equity"
                height={500}
              >
                <div className="w-full h-[500px]">
                  <EquityChart equity={backtestResults.equity} hideHeader />
                </div>
              </ChartContainer>
            )}

            {activeTab === 'drawdown' && (
              <ChartContainer title="Анализ просадки">
                <TradeDrawdownChart trades={backtestResults.trades} initialCapital={initialCapital} />
              </ChartContainer>
            )}

            {activeTab === 'trades' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  История сделок ({backtestResults.trades.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedTradeTicker('all')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selectedTradeTicker === 'all'
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
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${selectedTradeTicker === tickerData.ticker
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
                  <div className="-mx-6 overflow-x-auto">
                    <div className="min-w-full px-6">
                      <TradesTable
                        trades={filteredTrades}
                        exportFileNamePrefix={`trades-${selectedTradeTicker === 'all' ? 'all-tickers' : selectedTradeTicker}`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="h-72 bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                    <div className="text-gray-500 dark:text-gray-400 text-center">
                      <div className="text-lg font-medium mb-2">Trades Table</div>
                      <p className="text-sm">Для выбранного тикера сделки отсутствуют</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'profit' && (
              <ChartContainer
                title="Profit Factor по сделкам"
                isEmpty={!backtestResults.trades.length}
                emptyMessage="Нет сделок для отображения"
              >
                <ProfitFactorAnalysis trades={backtestResults.trades} />
              </ChartContainer>
            )}

            {activeTab === 'duration' && (
              <ChartContainer title="Анализ длительности сделок">
                <DurationAnalysis trades={backtestResults.trades} />
              </ChartContainer>
            )}

            {activeTab === 'monthlyContribution' && monthlyContributionResults && (
              <div className="space-y-6">
                {/* Настройки пополнения */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3">Настройки ежемесячного пополнения</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                        Сумма пополнения, $
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={monthlyContributionAmount}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          setMonthlyContributionAmount(Number.isFinite(value) ? Math.max(0, value) : 0);
                        }}
                        className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                        День месяца (1-28)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={monthlyContributionDay}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          const normalized = Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 1), 28) : 1;
                          setMonthlyContributionDay(normalized);
                        }}
                        className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-blue-600 dark:text-blue-300">
                    Пополнение становится доступно в торговый день, когда наступает {monthlyContributionDay}-е число месяца.
                    Для применения изменений запустите бэктест заново.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Сценарий с ежемесячными пополнениями
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Каждый месяц депозит пополняется на {formatCurrency(monthlyContributionAmount)} в {monthlyContributionDay}-й торговый день месяца. Пополнения сразу доступны для новой сделки с плечом {(leveragePercent / 100).toFixed(1)}:1.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Итоговый баланс</div>
                    <div className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(monthlyContributionResults.finalValue)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Сумма пополнений</div>
                    <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-300">
                      {formatCurrency(monthlyContributionResults.metrics.totalContribution)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {monthlyContributionResults.metrics.contributionCount} взнос(ов)
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Чистая прибыль</div>
                    <div className={`mt-2 text-2xl font-bold ${monthlyContributionResults.metrics.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-500 dark:text-orange-300'}`}>
                      {formatCurrency(monthlyContributionResults.metrics.netProfit)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Чистая доходность</div>
                    <div className="mt-2 text-2xl font-bold text-purple-600 dark:text-purple-300">
                      {monthlyContributionResults.metrics.netReturn.toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Общая доходность</div>
                    <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-300">
                      {monthlyContributionResults.metrics.totalReturn.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">CAGR</div>
                    <div className="mt-2 text-2xl font-bold text-orange-600 dark:text-orange-300">
                      {monthlyContributionResults.metrics.cagr.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Profit Factor</div>
                    <div className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-300">
                      {monthlyContributionResults.metrics.profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-700 dark:bg-gray-900">
                    <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">Сделок</div>
                    <div className="mt-2 text-2xl font-bold text-teal-600 dark:text-teal-300">
                      {monthlyContributionResults.metrics.totalTrades}
                    </div>
                  </div>
                </div>

                {monthlyScenarioDiff && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-100">
                    <div className="text-sm uppercase tracking-wide text-emerald-600 dark:text-emerald-200">Сравнение со стандартным режимом</div>
                    <ul className="mt-2 space-y-1">
                      <li className="flex items-center justify-between">
                        <span>Δ конечного капитала</span>
                        <span className="font-semibold">{monthlyScenarioDiff.finalValueDelta >= 0 ? '+' : ''}{formatCurrency(monthlyScenarioDiff.finalValueDelta)}</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Δ общей доходности</span>
                        <span className="font-semibold">{monthlyScenarioDiff.totalReturnDelta >= 0 ? '+' : ''}{monthlyScenarioDiff.totalReturnDelta.toFixed(1)}%</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Δ CAGR</span>
                        <span className="font-semibold">{monthlyScenarioDiff.cagrDelta >= 0 ? '+' : ''}{monthlyScenarioDiff.cagrDelta.toFixed(1)}%</span>
                      </li>
                      <li className="flex items-center justify-between">
                        <span>Δ чистой прибыли</span>
                        <span className="font-semibold">{monthlyScenarioDiff.netProfitDelta >= 0 ? '+' : ''}{formatCurrency(monthlyScenarioDiff.netProfitDelta)}</span>
                      </li>
                    </ul>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      График капитала (сравнение со стандартным режимом)
                    </h4>
                    {monthlyContributionResults.equity.length > 0 ? (
                      <div className="w-full h-[440px] lg:h-[520px]">
                        <EquityChart
                          equity={monthlyContributionResults.equity}
                          comparisonEquity={backtestResults?.equity || []}
                          comparisonLabel="Без пополнений"
                          primaryLabel="С пополнениями"
                          hideHeader
                        />
                      </div>
                    ) : (
                      <div className="flex h-72 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                        Нет данных по equity
                      </div>
                    )}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 shadow-sm dark:border-blue-900/60 dark:bg-blue-900/40 dark:text-blue-100">
                      <p>Совокупные вложения: {formatCurrency(monthlyContributionResults.metrics.totalContribution + initialCapital)}</p>
                      <p>Пополнений произведено: {monthlyContributionResults.metrics.contributionCount}</p>
                      <p>Плечо стратегии: {(leveragePercent / 100).toFixed(1)}:1</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      История сделок ({monthlyContributionResults.trades.length})
                    </h4>
                    {monthlyContributionResults.trades.length > 0 ? (
                      <div className="-mx-6 overflow-x-auto">
                        <div className="min-w-full px-6">
                          <TradesTable
                            trades={monthlyContributionResults.trades}
                            exportFileNamePrefix={`trades-monthly-contribution-${monthlyContributionAmount}`}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-72 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                        Сделки отсутствуют
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'splits' && (
              <SplitsList tickersData={tickersData} totalSplitsCount={totalSplitsCount} />
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
            Загрузка данных и выполнение бэктеста...
          </div>
        </div>
      )}
    </div>
  );
}