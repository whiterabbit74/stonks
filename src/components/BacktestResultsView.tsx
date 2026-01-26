import { ChartContainer } from './ui';
import { ErrorBoundary } from './ErrorBoundary';
import { TradingChart } from './TradingChart';
import { EquityChart } from './EquityChart';
import { TradeDrawdownChart } from './TradeDrawdownChart';
import { TickerCardsGrid } from './TickerCardsGrid';
import { TradesTable } from './TradesTable';
import { ProfitFactorAnalysis } from './ProfitFactorAnalysis';
import { DurationAnalysis } from './DurationAnalysis';
import { SplitsList } from './SplitsList';
import { MultiTickerChart } from './MultiTickerChart';
import type { OHLCData, Trade, EquityPoint, SplitEvent, Strategy, TickerData } from '../types';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { formatCurrencyCompact } from '../lib/singlePositionBacktest';
import { calculateTradeStats } from '../lib/trade-utils';

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

  const trades = backtestResults?.trades || [];
  const equity = backtestResults?.equity || [];

  // For Multi Ticker Trades Tab logic
  const tradesByTicker = useMemo(() => {
    if (!trades) return {} as Record<string, Trade[]>;
    return trades.reduce<Record<string, Trade[]>>((acc, trade) => {
      const ticker = (trade.context?.ticker || '').toUpperCase();
      if (!ticker) return acc;
      if (!acc[ticker]) acc[ticker] = [];
      acc[ticker].push(trade);
      return acc;
    }, {});
  }, [trades]);

  const filteredTrades = useMemo(() => {
    if (!trades) return [] as Trade[];
    if (!handlers?.selectedTradeTicker || handlers.selectedTradeTicker === 'all') return trades;
    const targetTicker = (handlers.selectedTradeTicker || '').toUpperCase();
    return trades.filter(
      trade => (trade.context?.ticker || '').toUpperCase() === targetTicker
    );
  }, [trades, handlers?.selectedTradeTicker]);

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
          <ChartContainer height="65vh" className="min-h-[300px] md:min-h-[500px] max-h-[900px] mt-4 mb-6">
            <ErrorBoundary>
              <TradingChart data={marketData || []} trades={trades} splits={currentSplits} />
            </ErrorBoundary>
          </ChartContainer>
       );
    } else {
       return (
          <ChartContainer title="Сводный график тикеров">
            <ErrorBoundary>
              <MultiTickerChart tickersData={tickersData || []} trades={trades} height={650} />
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

           <div className="h-[60vh] min-h-[300px] md:min-h-[450px] max-h-[870px]">
             <ErrorBoundary>
               <EquityChart equity={equity} />
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
                height={500}
              >
                <div className="w-full h-[500px]">
                  <ErrorBoundary>
                    <EquityChart equity={equity} hideHeader />
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
        <TickerCardsGrid
          tickersData={tickersData || []}
          tradesByTicker={tradesByTicker}
          highIBS={highIBS}
          isDataOutdated={handlers?.isDataOutdated || (() => false)}
          handleRefreshTicker={handlers?.handleRefreshTicker || (() => {})}
          refreshingTickers={handlers?.refreshingTickers || new Set()}
        />
      );
  }

  // Drawdown
  if (activeTab === 'drawdown') {
      const capital = mode === 'single'
         ? Number(strategy?.riskManagement?.initialCapital ?? 10000)
         : initialCapital;

      return (
          <ChartContainer title={mode === 'single' ? undefined : "Анализ просадки"}>
            <TradeDrawdownChart trades={trades} initialCapital={capital} />
          </ChartContainer>
      );
  }

  // Trades
  if (activeTab === 'trades') {
      if (mode === 'single') {
         return (
              <div className="space-y-4">
                {trades.length > 0 && (
                  <TradesTable
                    trades={trades}
                    exportFileNamePrefix={`trades-${symbol || 'backtest'}`}
                  />
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
                      <TradesTable
                        trades={filteredTrades}
                        exportFileNamePrefix={mode === 'options' ? `options-trades-${currentTicker}` : `trades-${currentTicker === 'all' ? 'all-tickers' : currentTicker}`}
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
            <ProfitFactorAnalysis trades={trades} />
          </ChartContainer>
      );
  }

  // Duration
  if (activeTab === 'duration') {
      return (
          <ChartContainer title={mode === 'single' ? undefined : "Анализ длительности сделок"}>
            <DurationAnalysis trades={trades} />
          </ChartContainer>
      );
  }

  // Splits
  if (activeTab === 'splits') {
      if (mode === 'single') {
         return (
            <SplitsList splits={currentSplits || []} ticker={symbol || ''} />
         );
      } else {
         return (
            <SplitsList tickersData={tickersData || []} totalSplitsCount={totalSplitsCount} />
         );
      }
  }

  // NOTE: Page-specific tabs (monthlyContribution, simulators, etc.) are now handled by parent components
  // to avoid bloating this shared view with specific logic.

  return null;
}
