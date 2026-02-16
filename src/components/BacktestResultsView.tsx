import { ChartContainer } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import type { OHLCData, Trade, EquityPoint, SplitEvent, Strategy, TickerData } from '../types';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { formatCurrencyCompact } from '../lib/singlePositionBacktest';
import { calculateTradeStats } from '../lib/trade-utils';

const EMPTY_TRADES: Trade[] = [];
const EMPTY_EQUITY: EquityPoint[] = [];

type BacktestViewMode = 'single' | 'multi' | 'options';
type TabId =
  | 'price'
  | 'equity'
  | 'tickerCharts'
  | 'drawdown'
  | 'trades'
  | 'profit'
  | 'duration'
  | 'splits'
  | string;

type BacktestResultsData = {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: Trade[];
  metrics: any;
};

const importTradingChart = () => import('./TradingChart');
const importEquityChart = () => import('./EquityChart');
const importTradeDrawdownChart = () => import('./TradeDrawdownChart');
const importTickerCardsGrid = () => import('./TickerCardsGrid');
const importTradesTable = () => import('./TradesTable');
const importProfitFactorAnalysis = () => import('./ProfitFactorAnalysis');
const importDurationAnalysis = () => import('./DurationAnalysis');
const importSplitsList = () => import('./SplitsList');
const importMultiTickerChart = () => import('./MultiTickerChart');

const TradingChart = lazy(() => importTradingChart().then((m) => ({ default: m.TradingChart })));
const EquityChart = lazy(() => importEquityChart().then((m) => ({ default: m.EquityChart })));
const TradeDrawdownChart = lazy(() => importTradeDrawdownChart().then((m) => ({ default: m.TradeDrawdownChart })));
const TickerCardsGrid = lazy(() => importTickerCardsGrid().then((m) => ({ default: m.TickerCardsGrid })));
const TradesTable = lazy(() => importTradesTable().then((m) => ({ default: m.TradesTable })));
const ProfitFactorAnalysis = lazy(() => importProfitFactorAnalysis().then((m) => ({ default: m.ProfitFactorAnalysis })));
const DurationAnalysis = lazy(() => importDurationAnalysis().then((m) => ({ default: m.DurationAnalysis })));
const SplitsList = lazy(() => importSplitsList().then((m) => ({ default: m.SplitsList })));
const MultiTickerChart = lazy(() => importMultiTickerChart().then((m) => ({ default: m.MultiTickerChart })));

const MODE_TAB_ORDER: Record<BacktestViewMode, TabId[]> = {
  single: ['price', 'equity', 'drawdown', 'trades', 'profit', 'duration', 'splits'],
  multi: ['price', 'tickerCharts', 'equity', 'drawdown', 'trades', 'profit', 'duration', 'splits'],
  options: ['equity', 'price', 'tickerCharts', 'drawdown', 'trades', 'profit', 'duration', 'splits'],
};

function getTabImporters(tabId: TabId, mode: BacktestViewMode): Array<() => Promise<unknown>> {
  switch (tabId) {
    case 'price':
      return [mode === 'single' ? importTradingChart : importMultiTickerChart];
    case 'equity':
      return [importEquityChart];
    case 'tickerCharts':
      return [importTickerCardsGrid];
    case 'drawdown':
      return [importTradeDrawdownChart];
    case 'trades':
      return [importTradesTable];
    case 'profit':
      return [importProfitFactorAnalysis];
    case 'duration':
      return [importDurationAnalysis];
    case 'splits':
      return [importSplitsList];
    default:
      return [];
  }
}

export function prefetchBacktestTab(tabId: TabId, mode: BacktestViewMode) {
  for (const load of getTabImporters(tabId, mode)) {
    void load();
  }
}

export function prefetchBacktestResultsChunks(mode: BacktestViewMode = 'single') {
  for (const tab of MODE_TAB_ORDER[mode]) {
    prefetchBacktestTab(tab, mode);
  }
}

function getLoaderClass(tabId: TabId, mode: BacktestViewMode): string {
  if (tabId === 'price') {
    return mode === 'single'
      ? 'h-[86.4vh] min-h-[672px] md:min-h-[840px] max-h-[1320px] flex items-center justify-center'
      : 'h-[650px] flex items-center justify-center';
  }

  if (tabId === 'equity') {
    return mode === 'single'
      ? 'h-[72vh] min-h-[560px] md:min-h-[700px] max-h-[1100px] flex items-center justify-center'
      : 'h-[620px] flex items-center justify-center';
  }

  if (tabId === 'tickerCharts') {
    return 'min-h-[620px] flex items-center justify-center';
  }

  if (tabId === 'drawdown') {
    return 'min-h-[520px] flex items-center justify-center';
  }

  if (tabId === 'trades') {
    return 'min-h-[420px] flex items-center justify-center';
  }

  if (tabId === 'profit') {
    return 'min-h-[520px] flex items-center justify-center';
  }

  if (tabId === 'duration') {
    return 'min-h-[620px] flex items-center justify-center';
  }

  if (tabId === 'splits') {
    return 'min-h-[360px] flex items-center justify-center';
  }

  return 'min-h-[360px] flex items-center justify-center';
}

function TabContentLoader({ tabId, mode }: { tabId: TabId; mode: BacktestViewMode }) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 ${getLoaderClass(tabId, mode)}`}
    >
      Загрузка аналитики...
    </div>
  );
}

interface BacktestResultsViewProps {
  mode: BacktestViewMode;
  activeTab: string;

  // Data
  backtestResults: BacktestResultsData | null;
  comparisonBacktestResults?: BacktestResultsData | null;
  primarySeriesLabel?: string;
  comparisonSeriesLabel?: string;

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
  comparisonBacktestResults,
  primarySeriesLabel = 'С маржой',
  comparisonSeriesLabel = 'Без маржи (100%)',
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
  const comparisonTrades = comparisonBacktestResults?.trades ?? EMPTY_TRADES;
  const comparisonEquity = comparisonBacktestResults?.equity ?? EMPTY_EQUITY;
  const hasSingleComparison = mode === 'single' && !!comparisonBacktestResults;

  const [visitedTabs, setVisitedTabs] = useState<TabId[]>(() => [activeTab]);

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.includes(activeTab)) return prev;
      return [...prev, activeTab];
    });
  }, [activeTab]);

  useEffect(() => {
    const ordered = MODE_TAB_ORDER[mode];
    const idx = ordered.indexOf(activeTab);
    if (idx < 0) return;

    const nextTabs = ordered.slice(idx + 1, idx + 3);
    nextTabs.forEach((tab) => prefetchBacktestTab(tab, mode));
  }, [activeTab, mode]);

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
  const singleTradeStats = useMemo(() => calculateTradeStats(trades), [trades]);
  const comparisonTradeStats = useMemo(() => calculateTradeStats(comparisonTrades), [comparisonTrades]);

  // Calculations for Multi Ticker
  const totalSplitsCount = useMemo(
    () => tickersData?.reduce((sum, ticker) => sum + (ticker.splits?.length || 0), 0) || 0,
    [tickersData]
  );

  const renderComparisonPanel = (tabId: TabId): ReactNode => {
    if (!hasSingleComparison || !comparisonBacktestResults) return null;
    if (tabId === 'price' || tabId === 'splits') return null;

    if (tabId === 'equity' || tabId === 'drawdown') {
      return (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            Сравнение режимов
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <ComparisonMetric
              label="Итоговый баланс"
              baseValue={formatCurrencyCompact(comparisonBacktestResults.finalValue)}
              currentValue={formatCurrencyCompact(backtestResults?.finalValue ?? 0)}
              baseLabel={comparisonSeriesLabel}
              currentLabel={primarySeriesLabel}
            />
            <ComparisonMetric
              label="Доходность"
              baseValue={`${Number(comparisonBacktestResults.metrics?.totalReturn ?? 0).toFixed(2)}%`}
              currentValue={`${Number(backtestResults?.metrics?.totalReturn ?? 0).toFixed(2)}%`}
              baseLabel={comparisonSeriesLabel}
              currentLabel={primarySeriesLabel}
            />
            <ComparisonMetric
              label="CAGR"
              baseValue={`${Number(comparisonBacktestResults.metrics?.cagr ?? 0).toFixed(2)}%`}
              currentValue={`${Number(backtestResults?.metrics?.cagr ?? 0).toFixed(2)}%`}
              baseLabel={comparisonSeriesLabel}
              currentLabel={primarySeriesLabel}
            />
            <ComparisonMetric
              label="Макс. просадка"
              baseValue={`${Number(comparisonBacktestResults.maxDrawdown ?? 0).toFixed(2)}%`}
              currentValue={`${Number(backtestResults?.maxDrawdown ?? 0).toFixed(2)}%`}
              baseLabel={comparisonSeriesLabel}
              currentLabel={primarySeriesLabel}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
          Сравнение режимов
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <ComparisonMetric
            label="PnL"
            baseValue={formatCurrencyCompact(comparisonTradeStats.totalPnL)}
            currentValue={formatCurrencyCompact(singleTradeStats.totalPnL)}
            baseLabel={comparisonSeriesLabel}
            currentLabel={primarySeriesLabel}
          />
          <ComparisonMetric
            label="Win Rate"
            baseValue={`${comparisonTradeStats.winRate.toFixed(2)}%`}
            currentValue={`${singleTradeStats.winRate.toFixed(2)}%`}
            baseLabel={comparisonSeriesLabel}
            currentLabel={primarySeriesLabel}
          />
          <ComparisonMetric
            label="Profit Factor"
            baseValue={Number.isFinite(comparisonTradeStats.profitFactor) ? comparisonTradeStats.profitFactor.toFixed(2) : '∞'}
            currentValue={Number.isFinite(singleTradeStats.profitFactor) ? singleTradeStats.profitFactor.toFixed(2) : '∞'}
            baseLabel={comparisonSeriesLabel}
            currentLabel={primarySeriesLabel}
          />
          <ComparisonMetric
            label="Сделок"
            baseValue={String(comparisonTradeStats.totalTrades)}
            currentValue={String(singleTradeStats.totalTrades)}
            baseLabel={comparisonSeriesLabel}
            currentLabel={primarySeriesLabel}
          />
        </div>
      </div>
    );
  };

  const renderTabContent = (tabId: TabId): ReactNode => {
    const lazyFallback = <TabContentLoader tabId={tabId} mode={mode} />;

    // Price Tab
    if (tabId === 'price') {
      if (mode === 'single') {
        return (
          <ChartContainer height="86.4vh" className="min-h-[672px] md:min-h-[840px] max-h-[1320px] mt-4 mb-6">
            <ErrorBoundary>
              <Suspense fallback={lazyFallback}>
                <TradingChart
                  data={marketData || []}
                  trades={trades}
                  splits={currentSplits}
                  isVisible={tabId === activeTab}
                />
              </Suspense>
            </ErrorBoundary>
          </ChartContainer>
        );
      }

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

    // Equity Tab
    if (tabId === 'equity') {
      if (mode === 'single') {
        return (
          <div className="space-y-6">
            {renderComparisonPanel(tabId)}
            {extraEquityInfo}
            <div className="h-[72vh] min-h-[560px] md:min-h-[700px] max-h-[1100px]">
              <ErrorBoundary>
                <Suspense fallback={lazyFallback}>
                  <EquityChart
                    equity={equity}
                    comparisonEquity={hasSingleComparison ? comparisonEquity : undefined}
                    primaryLabel={primarySeriesLabel}
                    comparisonLabel={comparisonSeriesLabel}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        );
      }

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

    // Ticker Charts (Multi only)
    if (tabId === 'tickerCharts' && (mode === 'multi' || mode === 'options')) {
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
    if (tabId === 'drawdown') {
      const capital = mode === 'single'
        ? Number(strategy?.riskManagement?.initialCapital ?? 10000)
        : initialCapital;

      return (
        <div className="space-y-4">
          {renderComparisonPanel(tabId)}
          <ChartContainer title={mode === 'single' ? undefined : 'Анализ просадки'}>
            <Suspense fallback={lazyFallback}>
              <TradeDrawdownChart trades={trades} initialCapital={capital} />
            </Suspense>
          </ChartContainer>
        </div>
      );
    }

    // Trades
    if (tabId === 'trades') {
      if (mode === 'single') {
        return (
          <div className="space-y-4">
            {renderComparisonPanel(tabId)}
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
      }

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

    // Profit Factor
    if (tabId === 'profit') {
      return (
        <div className="space-y-4">
          {renderComparisonPanel(tabId)}
          <ChartContainer
            title={mode === 'single' ? undefined : 'Profit Factor по сделкам'}
            isEmpty={!trades.length}
            emptyMessage="Нет сделок для отображения"
          >
            <Suspense fallback={lazyFallback}>
              <ProfitFactorAnalysis trades={trades} />
            </Suspense>
          </ChartContainer>
        </div>
      );
    }

    // Duration
    if (tabId === 'duration') {
      return (
        <div className="space-y-4">
          {renderComparisonPanel(tabId)}
          <ChartContainer title={mode === 'single' ? undefined : 'Анализ длительности сделок'}>
            <Suspense fallback={lazyFallback}>
              <DurationAnalysis trades={trades} />
            </Suspense>
          </ChartContainer>
        </div>
      );
    }

    // Splits
    if (tabId === 'splits') {
      if (mode === 'single') {
        return (
          <Suspense fallback={lazyFallback}>
            <SplitsList splits={currentSplits || []} ticker={symbol || ''} />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={lazyFallback}>
          <SplitsList tickersData={tickersData || []} totalSplitsCount={totalSplitsCount} />
        </Suspense>
      );
    }

    // NOTE: Page-specific tabs (monthlyContribution, simulators, etc.) are handled by parent components.
    return null;
  };

  const tabNodes = visitedTabs
    .map((tabId) => ({ tabId, node: renderTabContent(tabId) }))
    .filter((item): item is { tabId: TabId; node: ReactNode } => item.node !== null);

  if (!tabNodes.length) return null;

  return (
    <div className="relative">
      {tabNodes.map(({ tabId, node }) => (
        <div key={tabId} className={tabId === activeTab ? 'block' : 'hidden'} aria-hidden={tabId !== activeTab}>
          {node}
        </div>
      ))}
    </div>
  );
}

function ComparisonMetric({
  label,
  baseValue,
  currentValue,
  baseLabel,
  currentLabel,
}: {
  label: string;
  baseValue: string;
  currentValue: string;
  baseLabel: string;
  currentLabel: string;
}) {
  return (
    <div className="rounded-md border border-indigo-200/80 bg-white/80 p-3 dark:border-indigo-900/60 dark:bg-slate-900/40">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xs text-gray-600 dark:text-gray-300">
        {baseLabel}: <span className="font-semibold">{baseValue}</span>
      </div>
      <div className="text-xs text-indigo-700 dark:text-indigo-300">
        {currentLabel}: <span className="font-semibold">{currentValue}</span>
      </div>
    </div>
  );
}
