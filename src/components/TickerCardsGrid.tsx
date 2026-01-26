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

        return (
          <TickerCard
            key={tickerData.ticker}
            ticker={tickerData.ticker}
            data={tickerData.data}
            trades={tradesForTicker}
            highIBS={highIBS}
            isOutdated={isDataOutdated(lastBar?.date)}
            onRefresh={() => handleRefreshTicker(tickerData.ticker)}
            isRefreshing={refreshingTickers.has(tickerData.ticker)}
          />
        );
      })}
    </div>
  );
}
