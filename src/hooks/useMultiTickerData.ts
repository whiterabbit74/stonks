import { useState, useCallback } from 'react';
import { DatasetAPI } from '../lib/api';
import { prepareTickerDataFromDataset } from '../lib/ticker-data-processing';
import { useToastActions } from '../components/ui';
import type { TickerData, SplitEvent } from '../types';
import { daysBetweenTradingDates, getTodayNYSE, toTradingDate, type TradingDate } from '../lib/date-utils';

export function useMultiTickerData() {
  const [tickersData, setTickersData] = useState<TickerData[]>([]);
  const [refreshingTickers, setRefreshingTickers] = useState<Set<string>>(new Set());
  const toast = useToastActions();

  // Устарело, если последний бар старше двух календарных дней от текущего
  // биржевого дня (запас на выходные). Считаем по датам, а не по моментам
  // времени, иначе порог зависел бы от таймзоны машины.
  const isDataOutdated = useCallback((lastDate: TradingDate | undefined): boolean => {
    if (!lastDate) return true;
    return daysBetweenTradingDates(toTradingDate(lastDate), getTodayNYSE()) > 2;
  }, []);

  // Function to load data for a single ticker
  const loadTickerData = useCallback(async (ticker: string): Promise<TickerData> => {
    const ds = await DatasetAPI.getDataset(ticker);

    const normalizedTicker = (ds.ticker || ticker).toUpperCase();

    let splits: SplitEvent[] = [];
    try {
      splits = await DatasetAPI.getSplits(normalizedTicker);
    } catch {
      splits = [];
    }

    const prepared = prepareTickerDataFromDataset({ ticker, dataset: ds, splits });
    if (prepared.detectedSplits && prepared.detectedSplits.length > 0) {
      const first = prepared.detectedSplits[0];
      const suffix = prepared.detectedSplits.length > 1 ? ` и еще ${prepared.detectedSplits.length - 1}` : '';
      toast.warning(
        `${prepared.ticker}: найден скачок цены, похожий на сплит ${first.factor}:1 (${first.date})${suffix}. Расчеты используют только ручные сплиты.`,
        9000
      );
    }

    return prepared;
  }, [toast]);

  // Handle refresh for a single ticker
  const handleRefreshTicker = useCallback(async (ticker: string) => {
    setRefreshingTickers(prev => new Set(prev).add(ticker));
    try {
      const result = await DatasetAPI.refreshDataset(ticker);
      // Reload ticker data
      const newData = await loadTickerData(ticker);
      setTickersData(prev => prev.map(td => td.ticker === ticker ? newData : td));
      // Show success toast with number of days added
      const addedDays = result?.added ?? 0;
      if (addedDays > 0) {
        toast.success(`${ticker}: добавлено ${addedDays} ${addedDays === 1 ? 'день' : addedDays < 5 ? 'дня' : 'дней'}`);
      } else {
        toast.info(`${ticker}: данные актуальны`);
      }
    } catch (err) {
      console.error(`Failed to refresh ${ticker}:`, err);
      toast.error(`${ticker}: не удалось обновить данные`);
    } finally {
      setRefreshingTickers(prev => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  }, [loadTickerData, toast]);

  return {
    tickersData,
    setTickersData,
    loadTickerData,
    handleRefreshTicker,
    refreshingTickers,
    isDataOutdated
  };
}
