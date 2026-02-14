import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../stores';
import { DatasetAPI } from '../lib/api';
import { useToastActions } from '../components/ui';

// Intl formatters
const ET_TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const ET_PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});

const ET_FULL_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
});

const ET_YMD_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit'
});

type TradingCalendarData = {
  metadata?: { years?: Array<string | number> };
  holidays?: Record<string, Record<string, unknown> | unknown>;
  shortDays?: Record<string, Record<string, unknown> | unknown>;
  tradingHours?: {
    normal?: { start?: string; end?: string };
    short?: { start?: string; end?: string };
  };
};

function hasCalendarDateEntry(
  map: TradingCalendarData['holidays'] | TradingCalendarData['shortDays'],
  y: number,
  m: number,
  d: number
): boolean {
  if (!map || typeof map !== 'object') return false;

  const yearKey = String(y);
  const monthDayKey = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fullDateKey = `${yearKey}-${monthDayKey}`;
  const root = map as Record<string, unknown>;

  const byYear = root[yearKey];
  if (byYear && typeof byYear === 'object' && !Array.isArray(byYear)) {
    return Boolean((byYear as Record<string, unknown>)[monthDayKey]);
  }

  return Boolean(root[fullDateKey]);
}

export function useSingleTickerData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const backtestResults = useAppStore((s) => s.backtestResults);
  const marketData = useAppStore((s) => s.marketData);
  const currentStrategy = useAppStore((s) => s.currentStrategy);
  const runBacktest = useAppStore((s) => s.runBacktest);
  const backtestStatus = useAppStore((s) => s.backtestStatus);
  const storeError = useAppStore((s) => s.error);
  const currentDataset = useAppStore((s) => s.currentDataset);
  const resultsQuoteProvider = useAppStore((s) => s.resultsQuoteProvider);
  const resultsRefreshProvider = useAppStore((s) => s.resultsRefreshProvider);
  const loadDatasetFromServer = useAppStore((s) => s.loadDatasetFromServer);
  const loadDatasetsFromServer = useAppStore((s) => s.loadDatasetsFromServer);
  const savedDatasets = useAppStore((s) => s.savedDatasets);
  const isLoading = useAppStore((s) => s.isLoading);

  const [quote, setQuote] = useState<{ open: number | null; high: number | null; low: number | null; current: number | null; prevClose: number | null } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [staleInfo, setStaleInfo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);

  const toast = useToastActions();

  const [tradingCalendar, setTradingCalendar] = useState<TradingCalendarData | null>(null);

  const symbol = useMemo(() => (
    currentDataset?.ticker || backtestResults?.symbol || backtestResults?.ticker || backtestResults?.meta?.ticker
  ), [currentDataset, backtestResults]);

  const requestedTicker = searchParams.get('ticker');
  const effectiveSymbol = requestedTicker ? requestedTicker.toUpperCase() : symbol;

  const isDataReady = useMemo(() => {
    if (!backtestResults) return false;
    if (!requestedTicker) return true;
    const resultSym = backtestResults.symbol || backtestResults.ticker || backtestResults.meta?.ticker;
    return resultSym && resultSym.toUpperCase() === requestedTicker.toUpperCase();
  }, [backtestResults, requestedTicker]);

  const lastSyncedSymbol = useRef(symbol);

  // Load available datasets
  useEffect(() => {
    if (!requestedTicker && savedDatasets.length === 0) {
      loadDatasetsFromServer();
    }
  }, [requestedTicker, savedDatasets.length, loadDatasetsFromServer]);

  // Load dataset when URL changes
  useEffect(() => {
    if (requestedTicker) {
      const upperTicker = requestedTicker.toUpperCase();
      if (upperTicker !== symbol) {
        loadDatasetFromServer(upperTicker).catch(console.error);
      }
    }
  }, [requestedTicker, symbol, loadDatasetFromServer]);

  // Sync URL with store
  useEffect(() => {
    if (symbol && symbol !== lastSyncedSymbol.current) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('ticker', symbol);
        return next;
      }, { replace: true });
      lastSyncedSymbol.current = symbol;
    } else if (symbol && !requestedTicker) {
       setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('ticker', symbol);
        return next;
      }, { replace: true });
       lastSyncedSymbol.current = symbol;
    }
  }, [symbol, setSearchParams, requestedTicker]);

  // Refresh handler
  const handleRefresh = async () => {
    if (!symbol) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const result = await DatasetAPI.refreshDataset(symbol, resultsRefreshProvider as any);
      await loadDatasetFromServer(symbol);
      const addedDays = result?.added ?? 0;
      if (addedDays > 0) {
        toast.success(`${symbol}: добавлено ${addedDays} ${addedDays === 1 ? 'день' : addedDays < 5 ? 'дня' : 'дней'}`);
      } else {
        toast.info(`${symbol}: данные актуальны`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось обновить датасет';
      setRefreshError(message);
      toast.error(`${symbol}: ${message}`);
    } finally {
      setRefreshing(false);
    }
  };

  // Load calendar
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const cal = await DatasetAPI.getTradingCalendar();
        if (active) setTradingCalendar(cal);
      } catch {
        if (active) setTradingCalendar(null);
      }
    })();
    return () => { active = false; };
  }, []);

  // Check watch status
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!symbol) { setWatching(false); return; }
        const list = await DatasetAPI.listTelegramWatches();
        if (!active) return;
        setWatching(!!list.find(w => (w.symbol || '').toUpperCase() === symbol.toUpperCase()));
      } catch {
        if (active) setWatching(false);
      }
    })();
    return () => { active = false; };
  }, [symbol, setWatching]);

  // Check for stale data
  useEffect(() => {
    if (!marketData || marketData.length === 0) { setIsStale(false); setStaleInfo(null); return; }
    const now = new Date();

    const getETParts = (date: Date) => {
      const parts = ET_PARTS_FMT.formatToParts(date);
      const map: Record<string, string> = {};
      parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
      const y = Number(map.year), m = Number(map.month), d = Number(map.day);
      const weekdayStr = map.weekday;
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const weekday = weekdayMap[weekdayStr as keyof typeof weekdayMap] ?? 0;
      return { y, m, d, weekday };
    };
    const isWeekendET = (p: { weekday: number }) => p.weekday === 0 || p.weekday === 6;
    const isHolidayET = (p: { y: number; m: number; d: number }) => {
      try {
        return hasCalendarDateEntry(tradingCalendar?.holidays, p.y, p.m, p.d);
      } catch { return false; }
    };
    const parseHmToMinutes = (hm: string | undefined | null): number | null => {
      try {
        if (!hm || typeof hm !== 'string' || hm.indexOf(':') < 0) return null;
        const [h, m] = hm.split(':');
        return parseInt(h, 10) * 60 + parseInt(m, 10);
      } catch { return null; }
    };
    const isShortDayET = (p: { y: number; m: number; d: number }) => {
      try {
        return hasCalendarDateEntry(tradingCalendar?.shortDays, p.y, p.m, p.d);
      } catch { return false; }
    };
    const getSessionForDateET = (p: { y: number; m: number; d: number }) => {
      const open = parseHmToMinutes(tradingCalendar?.tradingHours?.normal?.start) ?? (9 * 60 + 30);
      const normalClose = parseHmToMinutes(tradingCalendar?.tradingHours?.normal?.end) ?? (16 * 60);
      const shortClose = parseHmToMinutes(tradingCalendar?.tradingHours?.short?.end) ?? (13 * 60);
      const short = isShortDayET(p);
      return { openMin: open, closeMin: short ? shortClose : normalClose, short };
    };
    const previousTradingDayET = (fromUTC: Date) => {
      const cursor = new Date(fromUTC);
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      let attempts = 0;
      while (attempts < 30) {
        const parts = getETParts(cursor);
        if (!isWeekendET(parts) && !isHolidayET(parts)) return parts;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        attempts++;
      }
      const prevDay = new Date(fromUTC);
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);
      return getETParts(prevDay);
    };

    const tparts = ET_TIME_FMT.formatToParts(now);
    const tmap: Record<string, string> = {};
    tparts.forEach(p => { if (p.type !== 'literal') tmap[p.type] = p.value; });
    const hh = parseInt(tmap.hour || '0', 10);
    const mm = parseInt(tmap.minute || '0', 10);
    const minutes = hh * 60 + mm;
    const session = getSessionForDateET(getETParts(now));
    const closeMin = session.closeMin;
    const bufferMin = 30;
    const todayET = getETParts(now);
    const todayIsTradingDay = !isWeekendET(todayET) && !isHolidayET(todayET);

    const expectedParts = (todayIsTradingDay && minutes >= (closeMin + bufferMin))
      ? todayET
      : previousTradingDayET(now);

    const etDate = new Date();
    etDate.setFullYear(expectedParts.y, expectedParts.m - 1, expectedParts.d);
    etDate.setHours(12, 0, 0, 0);

    const expectedKeyUTC = etDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const dataKeys = new Set(marketData.map(b => b.date));
    const stale = !dataKeys.has(expectedKeyUTC);
    setIsStale(stale);
    if (stale) {
      const displayDate = new Date(Date.UTC(expectedParts.y, expectedParts.m - 1, expectedParts.d, 12, 0, 0));
      setStaleInfo(`Отсутствует бар за ${displayDate.toLocaleDateString('ru-RU', { timeZone: 'America/New_York' })}`);
    } else {
      setStaleInfo(null);
    }
  }, [marketData, tradingCalendar]);

  // Quote polling
  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let isFetching = false;
    if (!symbol) return;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const isPageVisible = () => {
      if (typeof document === 'undefined') return true;
      return !document.hidden;
    };

    const isMarketOpenNow = () => {
      const fmtParts = ET_FULL_FMT.formatToParts(new Date());
      const map: Record<string, string> = {};
      fmtParts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
      const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const weekday = weekdayMap[map.weekday] ?? 0;
      const hh = parseInt(map.hour || '0', 10);
      const mm = parseInt(map.minute || '0', 10);
      const isWeekday = weekday >= 1 && weekday <= 5;
      const minutes = hh * 60 + mm;
      if (!isWeekday) return false;
      const ymd = ET_YMD_FMT.formatToParts(new Date()).reduce((acc: any, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
      const ymdObj = { y: Number(ymd.year), m: Number(ymd.month), d: Number(ymd.day) };
      const isHoliday = hasCalendarDateEntry(tradingCalendar?.holidays, ymdObj.y, ymdObj.m, ymdObj.d);
      if (isHoliday) return false;
      const short = hasCalendarDateEntry(tradingCalendar?.shortDays, ymdObj.y, ymdObj.m, ymdObj.d);
      const parseHm = (hm?: string) => {
         if (!hm || hm.indexOf(':') < 0) return null;
         const [h, m] = hm.split(':');
         return parseInt(h, 10) * 60 + parseInt(m, 10);
      };
      const openMin = parseHm(tradingCalendar?.tradingHours?.normal?.start) ?? (9 * 60 + 30);
      const closeMin = short
        ? (parseHm(tradingCalendar?.tradingHours?.short?.end) ?? (13 * 60))
        : (parseHm(tradingCalendar?.tradingHours?.normal?.end) ?? (16 * 60));
      return minutes >= openMin && minutes <= closeMin;
    };

    setIsTrading(isMarketOpenNow());
    const scheduleNext = (delayMs: number) => {
      clearTimer();
      timer = setTimeout(() => {
        void fetchQuote();
      }, delayMs);
    };

    const fetchQuote = async () => {
      if (!isMounted) return;
      if (!isPageVisible()) {
        setQuoteLoading(false);
        return;
      }

      const open = isMarketOpenNow();
      if (!open) {
        setIsTrading(false);
        setQuoteLoading(false);
        scheduleNext(5 * 60 * 1000);
        return;
      }

      if (isFetching) {
        return;
      }

      isFetching = true;
      setIsTrading(true);
      setQuoteLoading(true);
      try {
        const q = await DatasetAPI.getQuote(symbol, (resultsQuoteProvider || 'finnhub') as any);
        if (isMounted) { setQuote(q); setQuoteError(null); setLastUpdatedAt(new Date()); }
      } catch (e) {
        if (isMounted) setQuoteError(e instanceof Error ? e.message : 'Не удалось получить котировку');
      } finally {
        if (isMounted) {
          isFetching = false;
          setQuoteLoading(false);
          if (isPageVisible()) {
            scheduleNext(15000);
          } else {
            clearTimer();
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (!isMounted || typeof document === 'undefined') return;
      if (document.hidden) {
        clearTimer();
        setQuoteLoading(false);
        return;
      }
      void fetchQuote();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    fetchQuote();
    return () => {
      isMounted = false;
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [symbol, resultsQuoteProvider, tradingCalendar]);

  // Auto run backtest (single entrypoint to avoid duplicate starts)
  useEffect(() => {
    if (!backtestResults && marketData.length > 0 && currentStrategy && backtestStatus === 'idle') {
      const t = setTimeout(() => { runBacktest(); }, 300);
      return () => clearTimeout(t);
    }
  }, [backtestResults, marketData, currentStrategy, backtestStatus, runBacktest]);

  return {
    symbol,
    requestedTicker,
    effectiveSymbol,
    isDataReady,
    marketData,
    backtestResults,
    currentStrategy,
    isLoading,
    storeError,
    quote,
    quoteError,
    quoteLoading,
    isTrading,
    lastUpdatedAt,
    isStale,
    staleInfo,
    refreshing,
    refreshError,
    handleRefresh,
    watching,
    watchBusy,
    setWatching,
    setWatchBusy,
    savedDatasets,
    loadDatasetFromServer,
    runBacktest,
    backtestStatus,
    setSearchParams,
    tradingCalendar
  };
}
