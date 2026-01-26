import { useRef, useState } from 'react';
import { MetricsGrid, AnalysisTabs } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, Trade, EquityPoint } from '../types';
import { runSinglePositionBacktest, optimizeTickerData } from '../lib/singlePositionBacktest';
import { StrategyInfoCard } from './StrategyInfoCard';
import { StrategyConfigurationCard } from './StrategyConfigurationCard';
import { MonthlyContributionAnalysis } from './MonthlyContributionAnalysis';
import type { BacktestMetrics } from '../lib/backtest-statistics';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { BacktestResultsView } from './BacktestResultsView';
import { BacktestPageShell } from './BacktestPageShell';

interface BacktestResults {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: BacktestMetrics;
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

  type TabId = 'price' | 'tickerCharts' | 'equity' | 'trades' | 'profit' | 'monthlyContribution' | 'splits' | 'drawdown' | 'duration';
  const [activeTab, setActiveTab] = useState<TabId>('price');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');

  const {
    tickersData,
    setTickersData,
    loadTickerData,
    handleRefreshTicker,
    refreshingTickers,
    isDataOutdated
  } = useMultiTickerData();

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

      setBacktestResults({
        equity: backtestResult.equity,
        finalValue: backtestResult.finalValue,
        maxDrawdown: backtestResult.maxDrawdown,
        trades: backtestResult.trades,
        metrics: backtestResult.metrics // This is now BacktestMetrics
      });

      setMonthlyContributionResults({
        equity: monthlyResult.equity,
        finalValue: monthlyResult.finalValue,
        maxDrawdown: monthlyResult.maxDrawdown,
        trades: monthlyResult.trades,
        metrics: monthlyResult.metrics
      });

      setSelectedTradeTicker('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при выполнении бэктеста');
      console.error('Backtest error:', err);
    } finally {
      setIsLoading(false);
    }
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

          <StrategyConfigurationCard
            title="Параметры"
            fields={[
              {
                label: "Тикеры",
                content: (
                  <div>
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
                )
              },
              {
                label: "Leverage",
                content: (
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
                )
              }
            ]}
          />
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

      <BacktestPageShell isLoading={isLoading} error={error} loadingMessage="Загрузка данных и выполнение бэктеста...">
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
              {activeTab === 'monthlyContribution' && monthlyContributionResults ? (
                <MonthlyContributionAnalysis
                  monthlyContributionAmount={monthlyContributionAmount}
                  monthlyContributionDay={monthlyContributionDay}
                  onAmountChange={setMonthlyContributionAmount}
                  onDayChange={setMonthlyContributionDay}
                  results={monthlyContributionResults}
                  baseScenarioResults={backtestResults}
                  leveragePercent={leveragePercent}
                  initialCapital={initialCapital}
                  comparisonEquity={backtestResults.equity}
                />
              ) : (
                <BacktestResultsView
                    mode="multi"
                    activeTab={activeTab}
                    backtestResults={backtestResults}
                    tickersData={tickersData}
                    strategy={activeStrategy}
                    handlers={{
                        isDataOutdated,
                        handleRefreshTicker,
                        refreshingTickers,
                        selectedTradeTicker,
                        setSelectedTradeTicker
                    }}
                />
              )}
            </div>
          </div>
        )}
      </BacktestPageShell>
    </div>
  );
}
