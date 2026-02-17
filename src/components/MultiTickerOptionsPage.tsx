import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MetricsGrid, AnalysisTabs, PageHeader, Select, Input, Label, Button, TickerInput } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, Trade, EquityPoint } from '../types';
import { optimizeTickerData, runSinglePositionBacktest } from '../lib/singlePositionBacktest';
import { runMultiTickerOptionsBacktest } from '../lib/optionsBacktest';
import { StrategyInfoCard } from './StrategyInfoCard';
import { StrategyConfigurationCard } from './StrategyConfigurationCard';
import { calculateBacktestMetrics } from '../lib/backtest-statistics';
import type { BacktestMetrics } from '../lib/backtest-statistics';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { BacktestPageShell } from './BacktestPageShell';
import { scheduleIdleTask } from '../lib/prefetch';

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

export function MultiTickerOptionsPage() {
  const defaultMultiTickerSymbols = useAppStore(s => s.defaultMultiTickerSymbols);

  const getDefaultTickers = () => {
    const symbolsStr = defaultMultiTickerSymbols || 'AAPL,MSFT,AMZN,MAGS';
    return symbolsStr.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  };

  const [tickers, setTickers] = useState<string[]>(getDefaultTickers());
  const [tickersInput, setTickersInput] = useState<string>(defaultMultiTickerSymbols || 'AAPL, MSFT, AMZN, MAGS');

  // Options specific state
  const [strikePct, setStrikePct] = useState<number>(10);
  const [volAdjPct, setVolAdjPct] = useState<number>(20);
  const [capitalPct, setCapitalPct] = useState<number>(10);
  const [expirationWeeks, setExpirationWeeks] = useState<number>(4);
  const [maxHoldingDays, setMaxHoldingDays] = useState<number>(30);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null);

  type TabId = 'equity' | 'price' | 'tickerCharts' | 'drawdown' | 'trades' | 'profit' | 'duration' | 'splits';
  const [activeTab, setActiveTab] = useState<TabId>('equity');
  const [selectedTradeTicker, setSelectedTradeTicker] = useState<'all' | string>('all');
  const lazyFallback = <ResultsPanelLoader />;

  const prefetchAnalysisTab = (tabId: string) => {
    void importBacktestResultsView().then((module) => {
      module.prefetchBacktestTab(tabId, 'options');
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
  // Strategy max hold, purely informational if overridden by Options params, but actually stock signals depend on it.
  const strategyMaxHoldDays = Number(
    typeof activeStrategy?.parameters?.maxHoldDays === 'number'
      ? activeStrategy.parameters.maxHoldDays
      : activeStrategy?.riskManagement?.maxHoldDays ?? 30
  );

  // Hardcoded for options backtest base, could be dynamic
  const initialCapital = 10000;

  const runBacktest = async () => {
    if (!activeStrategy) {
      setError('Недоступна стратегия для запуска расчёта');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Loading data for tickers:', tickers);
      const tickersDataPromises = tickers.map(ticker => loadTickerData(ticker));
      const loadedData = await Promise.all(tickersDataPromises);

      console.log('Loaded data:', loadedData.map(t => ({ ticker: t.ticker, bars: t.data.length })));

      if (loadedData.length === 0) {
        throw new Error('Нет данных для выбранных тикеров');
      }

      setTickersData(loadedData);

      // 1. Run Stock Backtest to get entry signals
      const optimizedData = optimizeTickerData(loadedData);

      // We run standard backtest to find where the stock strategy would enter.
      // We ignore leverage here as options logic handles position sizing via capitalPct
      const stockBacktestResult = runSinglePositionBacktest(
        optimizedData,
        activeStrategy,
        1.0, // Leverage irrelevant for signal generation usually
        { allowSameDayReentry: true }
      );

      const allStockTrades = stockBacktestResult.trades.sort((a, b) => {
             const dateA = new Date(a.entryDate).getTime();
             const dateB = new Date(b.entryDate).getTime();
             return dateA - dateB;
      });

      // 2. Run Options Backtest using those signals
      const optionsResult = runMultiTickerOptionsBacktest(allStockTrades, loadedData, {
        strikePct,
        volAdjPct,
        capitalPct,
        expirationWeeks,
        maxHoldingDays
      });

      // 3. Calculate Metrics for Options Result
      const metrics = calculateBacktestMetrics(
        optionsResult.trades,
        optionsResult.equity,
        initialCapital
      );

      const result: BacktestResults = {
          equity: optionsResult.equity,
          finalValue: optionsResult.finalValue,
          maxDrawdown: metrics.maxDrawdown,
          trades: optionsResult.trades,
          metrics
      };

      setBacktestResults(result);
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
        module.prefetchBacktestResultsChunks('options');
      });
    }, 1000);
  }, [backtestResults]);

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <PageHeader title="Опционы (Мульти)" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <StrategyInfoCard
            strategy={activeStrategy}
            lowIBS={lowIBS}
            highIBS={highIBS}
            maxHoldDays={strategyMaxHoldDays}
            optionsMode={true}
          />

          {/* Parameters Card */}
          <StrategyConfigurationCard
            title="Параметры Опционов"
            icon={<SettingsIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
          >
             <div className="space-y-4">
               {/* Tickers */}
              <div>
                <Label>Тикеры</Label>
                <TickerInput
                  value={tickersInput}
                  onChange={setTickersInput}
                  tickers={tickers}
                  onTickersChange={setTickers}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <Label>Страйк (+%)</Label>
                    <Select
                        value={strikePct}
                        onChange={(e) => setStrikePct(Number(e.target.value))}
                    >
                        {[5, 10, 15, 20].map(v => <option key={v} value={v}>+{v}%</option>)}
                    </Select>
                </div>
                 <div>
                    <Label>IV Adj (+%)</Label>
                    <Select
                        value={volAdjPct}
                        onChange={(e) => setVolAdjPct(Number(e.target.value))}
                    >
                        {[0, 5, 10, 15, 20, 25, 30, 40, 50].map(v => <option key={v} value={v}>+{v}%</option>)}
                    </Select>
                </div>
                <div>
                    <Label>Капитал на сделку</Label>
                    <Select
                        value={capitalPct}
                        onChange={(e) => setCapitalPct(Number(e.target.value))}
                    >
                        {[5, 10, 15, 20, 25, 30, 50].map(v => <option key={v} value={v}>{v}%</option>)}
                    </Select>
                </div>
                <div>
                    <Label>Экспирация</Label>
                    <Select
                        value={expirationWeeks}
                        onChange={(e) => setExpirationWeeks(Number(e.target.value))}
                    >
                         <option value={1}>1 неделя</option>
                         <option value={2}>2 недели</option>
                         <option value={4}>1 месяц</option>
                         <option value={8}>2 месяца</option>
                         <option value={12}>3 месяца</option>
                         <option value={24}>6 месяцев</option>
                    </Select>
                </div>
                <div>
                    <Label>Макс. удержание (дней)</Label>
                    <Input
                        type="number"
                        min={1}
                        max={365}
                        value={maxHoldingDays}
                        onChange={(e) => setMaxHoldingDays(Number(e.target.value))}
                    />
                </div>
              </div>
            </div>
          </StrategyConfigurationCard>
        </div>

        <div className="flex justify-center">
          <Button
            onClick={runBacktest}
            disabled={isLoading || !activeStrategy || tickers.length === 0}
            isLoading={isLoading}
            variant="primary"
            size="lg"
            className="px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/25 border-0"
            leftIcon={!isLoading ? (
               <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ) : undefined}
          >
            Запустить бэктест
          </Button>
        </div>

      </div>

      <BacktestPageShell isLoading={isLoading} error={error} loadingMessage="Загрузка данных и выполнение бэктеста...">
        {/* Main Analysis Block */}
        {backtestResults && (
          <MetricsGrid
            finalValue={backtestResults.finalValue}
            maxDrawdown={backtestResults.maxDrawdown}
            metrics={backtestResults.metrics}
          />
        )}

        {backtestResults && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <AnalysisTabs
              tabs={[
                { id: 'equity', label: 'Баланс' },
                { id: 'price', label: 'Цены' },
                { id: 'tickerCharts', label: 'Графики тикеров' },
                { id: 'drawdown', label: 'Просадка' },
                { id: 'trades', label: 'Сделки' },
                { id: 'profit', label: 'Профит Фактор' },
                { id: 'duration', label: 'Длительность' },
                { id: 'splits', label: 'Сплиты' },
              ]}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as TabId)}
              onTabIntent={prefetchAnalysisTab}
            />

            <div className="p-6">
              <Suspense fallback={lazyFallback}>
                <BacktestResultsView
                    mode="options"
                    activeTab={activeTab}
                    backtestResults={backtestResults}
                    tickersData={tickersData}
                    strategy={activeStrategy}
                    initialCapital={initialCapital}
                    handlers={{
                        isDataOutdated,
                        handleRefreshTicker,
                        refreshingTickers,
                        selectedTradeTicker,
                        setSelectedTradeTicker
                    }}
                />
              </Suspense>
            </div>
          </div>
        )}
      </BacktestPageShell>
    </div>
  );
}

// Simple Icon component for the parameters card
function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  );
}
