import { type ReactNode, useMemo, memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { MiniQuoteChart } from './MiniQuoteChart';
import { calculateTradeStats } from '../lib/trade-utils';
import { formatCurrencyCompact } from '../lib/singlePositionBacktest';
import type { OHLCData, Trade } from '../types';

export interface TickerCardProps {
  ticker: string;
  data: OHLCData[];
  trades: Trade[];
  highIBS: number;
  currentQuote?: { current: number | null; open: number | null; high: number | null; low: number | null; prevClose: number | null } | null;
  isOpenPosition?: boolean;
  entryPrice?: number | null;
  isOutdated?: boolean;
  onRefresh?: (ticker: string) => void;
  isRefreshing?: boolean;
  hideHeader?: boolean;
  customStats?: ReactNode;
  className?: string;
}

/**
 * Optimized TickerCard component.
 * Uses React.memo to prevent unnecessary re-renders when parent grid updates.
 * Internal heavy calculations (stats, chart history) are memoized.
 */
export const TickerCard = memo(function TickerCard({
  ticker,
  data,
  trades,
  highIBS,
  currentQuote = null,
  isOpenPosition = false,
  entryPrice = null,
  isOutdated = false,
  onRefresh,
  isRefreshing = false,
  hideHeader = false,
  customStats,
  className = ''
}: TickerCardProps) {
  const lastBar = data.length > 0 ? data[data.length - 1] : undefined;

  // Determine display price: priority to currentQuote, fallback to lastBar
  const displayPrice = currentQuote?.current ?? lastBar?.close;

  // Calculate change
  let changePct: number | null = null;
  if (currentQuote?.current != null && currentQuote?.prevClose != null && currentQuote.prevClose !== 0) {
    changePct = ((currentQuote.current - currentQuote.prevClose) / currentQuote.prevClose) * 100;
  } else if (lastBar && data.length > 1) {
    const prevBar = data[data.length - 2];
    if (prevBar.close !== 0) {
      changePct = ((lastBar.close - prevBar.close) / prevBar.close) * 100;
    }
  }

  // Memoize trade stats calculation to avoid O(N) operation on every render
  const defaultStats = useMemo(() => !customStats ? calculateTradeStats(trades) : null, [customStats, trades]);

  // Slice data for chart performance (pass only what's needed + buffer)
  const chartHistory = useMemo(() => data.slice(-30), [data]);

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      {!hideHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {ticker}
              </div>
              {isOutdated && onRefresh && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefresh(ticker);
                  }}
                  disabled={isRefreshing}
                  className="p-1.5 rounded-md text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
                  title="Обновить данные"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Баров: {data.length}
            </div>
          </div>
          {displayPrice != null && (
            <div className="text-right">
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                ${displayPrice.toFixed(2)}
              </div>
              {changePct !== null && Number.isFinite(changePct) && (
                <div className={`text-sm font-medium ${changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-500 dark:text-orange-400'}`}>
                  {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                </div>
              )}
              {lastBar && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                   {currentQuote ? 'Сейчас' : `Обновлено ${new Date(lastBar.date).toLocaleDateString('ru-RU')}`}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`${hideHeader ? '' : 'mt-4'} h-48`}>
        <MiniQuoteChart
          history={chartHistory}
          today={currentQuote}
          trades={trades}
          highIBS={highIBS}
          isOpenPosition={isOpenPosition}
          entryPrice={entryPrice}
        />
      </div>

      <div className="mt-4">
        {customStats ? (
          customStats
        ) : (
          defaultStats && (
            <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
              <div>
                <div className="text-xs uppercase tracking-wide">Сделок</div>
                <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                  {defaultStats.totalTrades}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide">Win rate</div>
                <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                  {defaultStats.winRate.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide">PnL</div>
                <div className={`mt-1 text-base font-semibold ${defaultStats.totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-orange-500 dark:text-orange-300'}`}>
                  {formatCurrencyCompact(defaultStats.totalPnL)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide">Средняя длительность</div>
                <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                  {defaultStats.avgDuration.toFixed(1)} дн.
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
});
