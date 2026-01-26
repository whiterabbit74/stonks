import { useRef, useState } from 'react';
import { MetricsGrid, AnalysisTabs } from './ui';
import { useAppStore } from '../stores';
import type { Strategy, Trade, EquityPoint } from '../types';
import { runSinglePositionBacktest, optimizeTickerData } from '../lib/singlePositionBacktest';
import { runMultiTickerOptionsBacktest } from '../lib/optionsBacktest';
import { StrategyInfoCard } from './StrategyInfoCard';
import { createStrategyFromTemplate, STRATEGY_TEMPLATES } from '../lib/strategy';
import { useMultiTickerData } from '../hooks/useMultiTickerData';
import { BacktestResultsView } from './BacktestResultsView';
import { calculateTradeStats } from '../lib/trade-utils';

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
      const stats = calculateTradeStats(optionsResult.trades);
      const { totalTrades, wins, losses, winRate } = stats;
      const totalReturn = ((optionsResult.finalValue - initialCapital) / initialCapital) * 100;

      // Calculate Profit Factor properly
      let grossProfit = 0;
      let grossLoss = 0;
      optionsResult.trades.forEach(t => {
          const p = t.pnl || 0;
          if (p > 0) grossProfit += p;
          else grossLoss += Math.abs(p);
      });
      const realProfitFactor = grossLoss !== 0 ? grossProfit / grossLoss : grossProfit > 0 ? 100 : 0;

      // CAGR
      const startDate = optionsResult.equity.length > 0 ? new Date(optionsResult.equity[0].date) : new Date();
      const endDate = optionsResult.equity.length > 0 ? new Date(optionsResult.equity[optionsResult.equity.length - 1].date) : new Date();
      const years = Math.max((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24 * 365.25), 0.1);
      const cagr = (Math.pow(optionsResult.finalValue / initialCapital, 1 / years) - 1) * 100;

      // Max Drawdown
      let maxDD = 0;
      optionsResult.equity.forEach(p => {
          if (p.drawdown > maxDD) maxDD = p.drawdown;
      });

      const result: BacktestResults = {
          equity: optionsResult.equity,
          finalValue: optionsResult.finalValue,
          maxDrawdown: maxDD,
          trades: optionsResult.trades,
          metrics: {
              totalReturn,
              cagr,
              winRate,
              totalTrades,
              winningTrades: wins,
              losingTrades: losses,
              profitFactor: realProfitFactor,
              netProfit: optionsResult.finalValue - initialCapital,
              netReturn: totalReturn,
              totalContribution: 0,
              contributionCount: 0
          }
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

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Опционы (Мульти)
          </h1>
          <div className="mt-2 h-px bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-transparent" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <StrategyInfoCard
            strategy={activeStrategy}
            lowIBS={lowIBS}
            highIBS={highIBS}
            maxHoldDays={strategyMaxHoldDays}
            optionsMode={true}
          />

          {/* Parameters Card */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/60 dark:to-slate-900/40 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-400/10">
                <SettingsIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Параметры Опционов
              </span>
            </div>

            <div className="space-y-4">
               {/* Tickers */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Тикеры
                </label>
                <input
                  type="text"
                  value={tickersInput}
                  onChange={(e) => {
                    setTickersInput(e.target.value);
                    const parsedTickers = Array.from(new Set(
                      e.target.value.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
                    ));
                    setTickers(parsedTickers);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  placeholder="AAPL, MSFT..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Страйк (+%)
                    </label>
                    <select
                        value={strikePct}
                        onChange={(e) => setStrikePct(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                        {[5, 10, 15, 20].map(v => <option key={v} value={v}>+{v}%</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        IV Adj (+%)
                    </label>
                    <select
                        value={volAdjPct}
                        onChange={(e) => setVolAdjPct(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                        {[0, 5, 10, 15, 20, 25, 30, 40, 50].map(v => <option key={v} value={v}>+{v}%</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Капитал на сделку
                    </label>
                    <select
                        value={capitalPct}
                        onChange={(e) => setCapitalPct(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                        {[5, 10, 15, 20, 25, 30, 50].map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Экспирация
                    </label>
                    <select
                        value={expirationWeeks}
                        onChange={(e) => setExpirationWeeks(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                         <option value={1}>1 неделя</option>
                         <option value={2}>2 недели</option>
                         <option value={4}>1 месяц</option>
                         <option value={8}>2 месяца</option>
                         <option value={12}>3 месяца</option>
                         <option value={24}>6 месяцев</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Макс. удержание (дней)
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={365}
                        value={maxHoldingDays}
                        onChange={(e) => setMaxHoldingDays(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                </div>
              </div>
            </div>
          </div>
        </div>

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
              { id: 'equity', label: 'Equity' },
              { id: 'price', label: 'Цены' },
              { id: 'tickerCharts', label: 'Графики тикеров' },
              { id: 'drawdown', label: 'Просадка' },
              { id: 'trades', label: 'Сделки' },
              { id: 'profit', label: 'Profit factor' },
              { id: 'duration', label: 'Длительность' },
              { id: 'splits', label: 'Сплиты' },
            ]}
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
          />

          <div className="p-6">
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
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        </div>
      )}

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

// Simple Icon component for the parameters card
function SettingsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  );
}
