import { ChartContainer } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import type { OHLCData, Trade, EquityPoint, SplitEvent, Strategy, TickerData } from '../types';
import { lazy, Suspense, useMemo } from 'react';
import type { ReactNode } from 'react';
import { formatCurrencyCompact } from '../lib/singlePositionBacktest';
import { calculateTradeStats } from '../lib/trade-utils';

const EMPTY_TRADES: Trade[] = [];
const EMPTY_EQUITY: EquityPoint[] = [];
const TradingChart = lazy(() => import('./TradingChart').then((m) => ({ default: m.TradingChart })));
const EquityChart = lazy(() => import('./EquityChart').then((m) => ({ default: m.EquityChart })));
const TradeDrawdownChart = lazy(() => import('./TradeDrawdownChart').then((m) => ({ default: m.TradeDrawdownChart })));
const TickerCardsGrid = lazy(() => import('./TickerCardsGrid').then((m) => ({ default: m.TickerCardsGrid })));
const TradesTable = lazy(() => import('./TradesTable').then((m) => ({ default: m.TradesTable })));
const ProfitFactorAnalysis = lazy(() => import('./ProfitFactorAnalysis').then((m) => ({ default: m.ProfitFactorAnalysis })));
const DurationAnalysis = lazy(() => import('./DurationAnalysis').then((m) => ({ default: m.DurationAnalysis })));
const SplitsList = lazy(() => import('./SplitsList').then((m) => ({ default: m.SplitsList })));
const MultiTickerChart = lazy(() => import('./MultiTickerChart').then((m) => ({ default: m.MultiTickerChart })));

function TabContentLoader() {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
      Загрузка аналитики...
    </div>
  );
}

interface BacktestResultsViewProps {
  mode: 'single' | 'multi' | 'options';
  activeTab: string;

  // Data
  backtestResults: {
    equity: EquityPoint[];
    finalValue: number;
    maxDrawdown: number;
    trades: Trade[];
    metrics: any;
  } | null;

  // Single Ticker Specifics
  marketData?: OHLCData[];
  currentSplits?: SplitEvent[];
  symbol?: string;
  strategy?: Strategy | null;

  // Multi Ticker Specifics
  tickersData?: TickerData[];

  // Handlers
  handlers?: {
    isDataOutdated?: (date: any) => boolean;
    handleRefreshTicker?: (ticker: string) => void;
    refreshingTickers?: Set<string>;
    setSelectedTradeTicker?: (ticker: string) => void;
    selectedTradeTicker?: string;
  };

  // Options specific
  initialCapital?: number;

  // Render props for flexibility
  extraEquityInfo?: ReactNode; // To inject StrategyInfoCard or similar
}

export function BacktestResultsView({
  mode,
  activeTab,
  backtestResults,
  marketData,
  currentSplits,
  symbol,
  strategy,
  tickersData,
  handlers,
  initialCapital = 10000,
  extraEquityInfo
}: BacktestResultsViewProps) {

  const trades = backtestResults?.trades ?? EMPTY_TRADES;
  const equity = backtestResults?.equity ?? EMPTY_EQUITY;
  const lazyFallback = <TabContentLoader />;

  // For Multi Ticker Trades Tab logic
  const tradesByTicker = useMemo(() => {
    // Optimization: Skip expensive O(N) grouping in single-ticker mode
    if (mode === 'single') return {};

    if (!trades) return {} as Record<string, Trade[]>;
    return trades.reduce<Record<string, Trade[]>>((acc, trade) => {
      const ticker = (trade.context?.ticker || '').toUpperCase();
      if (!ticker) return acc;
      if (!acc[ticker]) acc[ticker] = [];
      acc[ticker].push(trade);
      return acc;
    }, {});
  }, [trades, mode]);

  const filteredTrades = useMemo(() => {
    if (!trades) return [] as Trade[];
    if (!handlers?.selectedTradeTicker || handlers.selectedTradeTicker === 'all') return trades;

    // Optimization: Use O(1) lookup map instead of O(N) filter in multi-ticker mode
    if (mode !== 'single') {
      const targetTicker = (handlers.selectedTradeTicker || '').toUpperCase();
      return tradesByTicker[targetTicker] || [];
    }

    const targetTicker = (handlers.selectedTradeTicker || '').toUpperCase();
    return trades.filter(
      trade => (trade.context?.ticker || '').toUpperCase() === targetTicker
    );
  }, [trades, handlers?.selectedTradeTicker, tradesByTicker, mode]);

  const filteredTradeStats = useMemo(() => calculateTradeStats(filteredTrades), [filteredTrades]);

  // Calculations for Multi Ticker
  const totalSplitsCount = useMemo(
    () => tickersData?.reduce((sum, ticker) => sum + (ticker.splits?.length || 0), 0) || 0,
    [tickersData]
  );

  // --- Content Rendering ---

  // Price Tab
  if (activeTab === 'price') {
    if (mode === 'single') {
       return (
          <ChartContainer height="72vh" className="min-h-[560px] md:min-h-[700px] max-h-[1100px] mt-4 mb-6">
            <ErrorBoundary>
              <Suspense fallback={lazyFallback}>
                <TradingChart data={marketData || []} trades={trades} splits={currentSplits} />
              </Suspense>
            </ErrorBoundary>
          </ChartContainer>
       );
    } else {
       return (
          <ChartContainer title="Сводный график тикеров">
            <ErrorBoundary>
              <Suspense fallback={lazyFallback}>
                <MultiTickerChart tickersData={tickersData || []} trades={trades} height={650} />
              </Suspense>
            </ErrorBoundary>
          </ChartContainer>
       );
    }
  }

  // Equity Tab
  if (activeTab === 'equity') {
    if (mode === 'single') {
       return (
         <div className="space-y-6">
           {/* Injected Strategy Info */}
           {extraEquityInfo}

           <div className="h-[72vh] min-h-[560px] md:min-h-[700px] max-h-[1100px]">
             <ErrorBoundary>
               <Suspense fallback={lazyFallback}>
                 <EquityChart equity={equity} />
               </Suspense>
             </ErrorBoundary>
           </div>
         </div>
       );
    } else {
       return (
         <div className="space-y-6">
            <ChartContainer
                title="График капитала"
                isEmpty={!equity.length}
                emptyMessage="Нет данных по equity"
                height={620}
              >
                <div className="w-full h-[620px]">
                  <ErrorBoundary>
                    <Suspense fallback={lazyFallback}>
                      <EquityChart equity={equity} hideHeader />
                    </Suspense>
                  </ErrorBoundary>
                </div>
            </ChartContainer>
         </div>
       );
    }
  }

  // Ticker Charts (Multi only)
  if (activeTab === 'tickerCharts' && (mode === 'multi' || mode === 'options')) {
      const highIBS = Number(strategy?.parameters?.highIBS ?? 0.75);
      return (
        <Suspense fallback={lazyFallback}>
          <TickerCardsGrid
            tickersData={tickersData || []}
            tradesByTicker={tradesByTicker}
            highIBS={highIBS}
            isDataOutdated={handlers?.isDataOutdated || (() => false)}
            handleRefreshTicker={handlers?.handleRefreshTicker || (() => {})}
            refreshingTickers={handlers?.refreshingTickers || new Set()}
          />
        </Suspense>
      );
  }

  // Drawdown
  if (activeTab === 'drawdown') {
      const capital = mode === 'single'
         ? Number(strategy?.riskManagement?.initialCapital ?? 10000)
         : initialCapital;

      return (
          <ChartContainer title={mode === 'single' ? undefined : "Анализ просадки"}>
            <Suspense fallback={lazyFallback}>
              <TradeDrawdownChart trades={trades} initialCapital={capital} />
            </Suspense>
          </ChartContainer>
      );
  }

  // Trades
  if (activeTab === 'trades') {
      if (mode === 'single') {
         return (
              <div className="space-y-4">
                {trades.length > 0 && (
                  <Suspense fallback={lazyFallback}>
                    <TradesTable
                      trades={trades}
                      exportFileNamePrefix={`trades-${symbol || 'backtest'}`}
                    />
                  </Suspense>
                )}
              </div>
         );
      } else {
         // Multi/Options Trades Tab logic (with ticker filter)
         const { selectedTradeTicker, setSelectedTradeTicker } = handlers || {};
         const currentTicker = selectedTradeTicker || 'all';

         return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  История сделок ({trades.length})
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedTradeTicker?.('all')}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${currentTicker === 'all'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                  >
                    Все ({trades.length})
                  </button>
                  {tickersData?.map(tickerData => {
                    const tradesForTicker = tradesByTicker[tickerData.ticker] || [];
                    return (
                      <button
                        key={tickerData.ticker}
                        onClick={() => setSelectedTradeTicker?.(tickerData.ticker)}
                        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${currentTicker === tickerData.ticker
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
                      <Suspense fallback={lazyFallback}>
                        <TradesTable
                          trades={filteredTrades}
                          exportFileNamePrefix={mode === 'options' ? `options-trades-${currentTicker}` : `trades-${currentTicker === 'all' ? 'all-tickers' : currentTicker}`}
                        />
                      </Suspense>
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
         );
      }
  }

  // Profit Factor
  if (activeTab === 'profit') {
      return (
          <ChartContainer
            title={mode === 'single' ? undefined : "Profit Factor по сделкам"}
            isEmpty={!trades.length}
            emptyMessage="Нет сделок для отображения"
          >
            <Suspense fallback={lazyFallback}>
              <ProfitFactorAnalysis trades={trades} />
            </Suspense>
          </ChartContainer>
      );
  }

  // Duration
  if (activeTab === 'duration') {
      return (
          <ChartContainer title={mode === 'single' ? undefined : "Анализ длительности сделок"}>
            <Suspense fallback={lazyFallback}>
              <DurationAnalysis trades={trades} />
            </Suspense>
          </ChartContainer>
      );
  }

  // Splits
  if (activeTab === 'splits') {
      if (mode === 'single') {
         return (
            <Suspense fallback={lazyFallback}>
              <SplitsList splits={currentSplits || []} ticker={symbol || ''} />
            </Suspense>
         );
      } else {
         return (
            <Suspense fallback={lazyFallback}>
              <SplitsList tickersData={tickersData || []} totalSplitsCount={totalSplitsCount} />
            </Suspense>
         );
      }
  }

  // NOTE: Page-specific tabs (monthlyContribution, simulators, etc.) are now handled by parent components
  // to avoid bloating this shared view with specific logic.

  return null;
}
