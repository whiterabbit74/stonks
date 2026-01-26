import { useState, useCallback } from 'react';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { useToastActions } from '../components/ui';
import type { TickerData, OHLCData, SplitEvent } from '../types';

export function useMultiTickerData() {
  const [tickersData, setTickersData] = useState<TickerData[]>([]);
  const [refreshingTickers, setRefreshingTickers] = useState<Set<string>>(new Set());
  const toast = useToastActions();

  // Check if data is outdated (last bar is more than 2 days old)
  const isDataOutdated = useCallback((lastDate: string | Date | undefined): boolean => {
    if (!lastDate) return true;
    const now = new Date();
    const lastDateNormalized = new Date(lastDate);
    // Get difference in days
    const diffMs = now.getTime() - lastDateNormalized.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    // Data is outdated if it's more than 2 days old (accounts for weekends)
    return diffDays > 2;
  }, []);

  // Function to load data for a single ticker
  const loadTickerData = async (ticker: string): Promise<TickerData> => {
    const ds = await DatasetAPI.getDataset(ticker);

    const normalizedTicker = (ds.ticker || ticker).toUpperCase();

    let splits: SplitEvent[] = [];
    try {
      splits = await DatasetAPI.getSplits(normalizedTicker);
    } catch {
      splits = [];
    }

    let processedData: OHLCData[];

    if ((ds as any).adjustedForSplits) {
      processedData = dedupeDailyOHLC(ds.data as unknown as OHLCData[]);
    } else {
      processedData = dedupeDailyOHLC(adjustOHLCForSplits(ds.data as unknown as OHLCData[], splits));
    }

    const ibsValues = processedData.length > 0 ? IndicatorEngine.calculateIBS(processedData) : [];

    return {
      ticker: normalizedTicker,
      data: processedData,
      ibsValues,
      splits
    };
  };

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
  }, [toast]);

  return {
    tickersData,
    setTickersData,
    loadTickerData,
    handleRefreshTicker,
    refreshingTickers,
    isDataOutdated
  };
}
