import { memo, useCallback } from 'react';
import { TickerCard } from './TickerCard';
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

// Optimization: Memoized wrapper to prevent re-rendering of all cards when one updates
// or when parent re-renders but props specific to this card haven't changed.
const TickerCardItem = memo(function TickerCardItem({
  tickerData,
  trades,
  highIBS,
  isOutdated,
  handleRefreshTicker,
  isRefreshing
}: {
  tickerData: TickerData;
  trades: Trade[];
  highIBS: number;
  isOutdated: boolean;
  handleRefreshTicker: (ticker: string) => void;
  isRefreshing: boolean;
}) {
  const handleRefresh = useCallback(() => {
    handleRefreshTicker(tickerData.ticker);
  }, [handleRefreshTicker, tickerData.ticker]);

  return (
    <TickerCard
      ticker={tickerData.ticker}
      data={tickerData.data}
      trades={trades}
      highIBS={highIBS}
      isOutdated={isOutdated}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
    />
  );
});

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
        const lastBar = tickerData.data.length > 0 ? tickerData.data[tickerData.data.length - 1] : undefined;
        const isOutdated = isDataOutdated(lastBar?.date);
        const isRefreshing = refreshingTickers.has(tickerData.ticker);

        return (
          <TickerCardItem
            key={tickerData.ticker}
            tickerData={tickerData}
            trades={tradesForTicker}
            highIBS={highIBS}
            isOutdated={isOutdated}
            handleRefreshTicker={handleRefreshTicker}
            isRefreshing={isRefreshing}
          />
        );
      })}
    </div>
  );
}
