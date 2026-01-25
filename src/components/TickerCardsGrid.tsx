import { RefreshCw } from 'lucide-react';
import { MiniQuoteChart } from './MiniQuoteChart';
import { calculateTradeStats } from '../lib/trade-utils';
import { formatCurrencyCompact } from '../lib/singlePositionBacktest';
import type { OHLCData, Trade, SplitEvent } from '../types';

export interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
  splits: SplitEvent[];
}

interface TickerCardsGridProps {
  tickersData: TickerData[];
  tradesByTicker: Record<string, Trade[]>;
  highIBS: number;
  isDataOutdated: (date: string | Date | undefined) => boolean;
  handleRefreshTicker: (ticker: string) => void;
  refreshingTickers: Set<string>;
}

export function TickerCardsGrid({
  tickersData,
  tradesByTicker,
  highIBS,
  isDataOutdated,
  handleRefreshTicker,
  refreshingTickers
}: TickerCardsGridProps) {
  return (
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
                <div className="flex items-center gap-2">
                  <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {tickerData.ticker}
                  </div>
                  {isDataOutdated(lastBar?.date) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefreshTicker(tickerData.ticker);
                      }}
                      disabled={refreshingTickers.has(tickerData.ticker)}
                      className="p-1.5 rounded-md text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
                      title="Обновить данные"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshingTickers.has(tickerData.ticker) ? 'animate-spin' : ''}`} />
                    </button>
                  )}
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
                    Обновлено {new Date(lastBar.date).toLocaleDateString('ru-RU')}
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
  );
}
