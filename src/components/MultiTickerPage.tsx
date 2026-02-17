import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MetricsGrid, AnalysisTabs, PageHeader, Select, Button, TickerInput } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, Trade, EquityPoint } from '../types';
import { runSinglePositionBacktest, optimizeTickerData } from '../lib/singlePositionBacktest';
import { StrategyInfoCard } from './StrategyInfoCard';
import { MonthlyContributionAnalysis } from './MonthlyContributionAnalysis';
import type { BacktestMetrics } from '../lib/backtest-statistics';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { BacktestPageShell } from './BacktestPageShell';
import { scheduleIdleTask } from '../lib/prefetch';
import { HelpCircle } from 'lucide-react';

const importBacktestResultsView = () => import('./BacktestResultsView');
const BacktestResultsView = lazy(() => importBacktestResultsView().then((m) => ({ default: m.BacktestResultsView })));

interface BacktestResults {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: BacktestMetrics;
}

function ResultsPanelLoader() {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
      Загрузка аналитики...
    </div>
  );
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
  const [showStrategyInfo, setShowStrategyInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);
  const [monthlyContributionResults, setMonthlyContributionResults] = useState<BacktestResults | null>(null);

  type TabId = 'price' | 'tickerCharts' | 'equity' | 'trades' | 'profit' | 'monthlyContribution' | 'splits' | 'drawdown' | 'duration';
  const [activeTab, setActiveTab] = useState<TabId>('price');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');
  const lazyFallback = <ResultsPanelLoader />;
  const strategyHelpRef = useRef<HTMLDivElement | null>(null);

  const prefetchAnalysisTab = (tabId: string) => {
    if (tabId === 'monthlyContribution') return;
    void importBacktestResultsView().then((module) => {
      module.prefetchBacktestTab(tabId, 'multi');
    });
  };

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

  useEffect(() => {
    if (!showStrategyInfo) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!strategyHelpRef.current) return;
      if (!strategyHelpRef.current.contains(event.target as Node)) {
        setShowStrategyInfo(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowStrategyInfo(false);
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [showStrategyInfo]);

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

  useEffect(() => {
    if (!backtestResults) return;

    return scheduleIdleTask(() => {
      void importBacktestResultsView().then((module) => {
        module.prefetchBacktestResultsChunks('multi');
      });
    }, 1000);
  }, [backtestResults]);

  return (
    <div className="space-y-6">
      {/* Заголовок и контролы — Card-based дизайн */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <PageHeader title="Несколько тикеров" />

        <div className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/60 dark:to-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Параметры
            </span>

            <div ref={strategyHelpRef} className="relative">
              <button
                type="button"
                onClick={() => setShowStrategyInfo((prev) => !prev)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                title="Показать описание стратегии"
                aria-label="Показать описание стратегии"
                aria-expanded={showStrategyInfo}
              >
                <HelpCircle className="h-4 w-4" />
              </button>

              {showStrategyInfo && (
                <div className="absolute right-0 top-full z-20 mt-2 w-[min(94vw,430px)]">
                  <StrategyInfoCard
                    strategy={activeStrategy}
                    lowIBS={lowIBS}
                    highIBS={highIBS}
                    maxHoldDays={maxHoldDays}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
            <div className="w-full lg:w-[380px]">
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Тикеры</label>
              <TickerInput
                value={tickersInput}
                onChange={setTickersInput}
                tickers={tickers}
                onTickersChange={setTickers}
                showBadges={false}
              />
            </div>

            <div className="w-full lg:w-[220px]">
              <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Маржинальность</label>
              <Select
                value={leveragePercent}
                onChange={(e) => setLeveragePercent(Number(e.target.value))}
              >
                <option value={100}>100%</option>
                <option value={125}>125%</option>
                <option value={150}>150%</option>
                <option value={175}>175%</option>
                <option value={200}>200%</option>
                <option value={225}>225%</option>
                <option value={250}>250%</option>
                <option value={275}>275%</option>
                <option value={300}>300%</option>
              </Select>
            </div>

            <div className="w-full lg:w-auto lg:min-w-[220px]">
              <span className="mb-1 block text-xs font-medium text-transparent select-none">Запуск</span>
              <Button
                onClick={runBacktest}
                disabled={isLoading || !activeStrategy || tickers.length === 0}
                isLoading={isLoading}
                variant="primary"
                size="md"
                className="w-full"
              >
                Запустить бэктест
              </Button>
            </div>
          </div>
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
                { id: 'equity', label: 'Баланс' },
                { id: 'drawdown', label: 'Просадка' },
                { id: 'trades', label: 'Сделки' },
                { id: 'profit', label: 'Профит Фактор' },
                { id: 'duration', label: 'Длительность' },
                monthlyContributionResults ? { id: 'monthlyContribution', label: 'Пополнения' } : null,
                { id: 'splits', label: 'Сплиты' },
              ].filter((t): t is { id: string; label: string } => !!t)}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as TabId)}
              onTabIntent={prefetchAnalysisTab}
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
                <Suspense fallback={lazyFallback}>
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
                </Suspense>
              )}
            </div>
          </div>
        )}
      </BacktestPageShell>
    </div>
  );
}
