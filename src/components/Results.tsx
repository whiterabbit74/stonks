import { useEffect, useMemo, useState } from 'react';
import { Heart, RefreshCcw, AlertTriangle, Bug } from 'lucide-react';
import { DatasetAPI } from '../lib/api';
import { formatOHLCYMD } from '../lib/utils';
import { useAppStore } from '../stores';
import { TradingChart } from './TradingChart';
import { EquityChart } from './EquityChart';
import { TradeDrawdownChart } from './TradeDrawdownChart';
import { MiniQuoteChart } from './MiniQuoteChart';
import { InfoModal } from './InfoModal';
import { TradesTable } from './TradesTable';
import { ProfitFactorChart } from './ProfitFactorChart';
import { TradeDurationChart } from './TradeDurationChart';
import { OpenDayDrawdownChart } from './OpenDayDrawdownChart';
import { MarginSimulator } from './MarginSimulator';
import { BuyAtCloseSimulator } from './BuyAtCloseSimulator';
import { NoStopLossSimulator } from './NoStopLossSimulator';
import type { EquityPoint } from '../types';
import { ErrorConsole } from './ErrorConsole';
import { logInfo } from '../lib/error-logger';

function simulateLeverageForEquity(equity: EquityPoint[], leverage: number): EquityPoint[] {
  try {
    if (!Array.isArray(equity) || equity.length === 0 || !Number.isFinite(leverage) || leverage <= 0) return [];
    const result: EquityPoint[] = [];
    let currentValue = equity[0].value;
    let peakValue = currentValue;
    result.push({ date: equity[0].date, value: currentValue, drawdown: 0 });
    for (let i = 1; i < equity.length; i++) {
      const basePrev = equity[i - 1].value;
      const baseCurr = equity[i].value;
      if (!(basePrev > 0)) continue;
      const baseReturn = (baseCurr - basePrev) / basePrev;
      const leveragedReturn = baseReturn * leverage;
      currentValue = currentValue * (1 + leveragedReturn);
      if (currentValue < 0) currentValue = 0;
      if (currentValue > peakValue) peakValue = currentValue;
      const dd = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
      result.push({ date: equity[i].date, value: currentValue, drawdown: dd });
    }
    return result;
  } catch {
    return [];
  }
}

export function Results() {
  const backtestResults = useAppStore(s => s.backtestResults);
  const marketData = useAppStore(s => s.marketData);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const runBacktest = useAppStore(s => s.runBacktest);
  const backtestStatus = useAppStore(s => s.backtestStatus);
  const storeError = useAppStore(s => s.error);
  const currentSplits = useAppStore(s => s.currentSplits);
  const currentDataset = useAppStore(s => s.currentDataset);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);
  const resultsRefreshProvider = useAppStore(s => s.resultsRefreshProvider);
  const loadDatasetFromServer = useAppStore(s => s.loadDatasetFromServer);
  const [quote, setQuote] = useState<{ open: number|null; high: number|null; low: number|null; current: number|null; prevClose: number|null } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [staleInfo, setStaleInfo] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ type: 'info' | 'error' | null; title?: string; message?: string }>({ type: null });
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  // Trading calendar (holidays, short days, trading hours)
  type TradingCalendarData = {
    metadata: { years: string[] };
    holidays: Record<string, Record<string, { name: string; type: string; description: string }>>;
    shortDays: Record<string, Record<string, { name: string; type: string; description: string; hours?: number }>>;
    tradingHours: { normal: { start: string; end: string }; short: { start: string; end: string } };
  };
  const [tradingCalendar, setTradingCalendar] = useState<TradingCalendarData | null>(null);
  
  type ChartTab = 'price' | 'equity' | 'buyhold' | 'drawdown' | 'trades' | 'profit' | 'duration' | 'openDayDrawdown' | 'margin' | 'buyAtClose' | 'noStopLoss' | 'splits';
  const [activeChart, setActiveChart] = useState<ChartTab>('price');
  
  // Проверка дублей дат в marketData (ключ YYYY-MM-DD)
  const { hasDuplicateDates, duplicateDateKeys } = useMemo(() => {
    try {
      const dateKeyOf = (v: unknown): string => {
        if (!v) return '';
        if (typeof v === 'string') {
          // строка ISO или 'YYYY-MM-DD' — берём первые 10 символов
          return v.length >= 10 ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10);
        }
        const d = new Date(v as string | number | Date);
        return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      };
      const countByKey = new Map<string, number>();
      for (const bar of (marketData || [])) {
        const k = dateKeyOf(bar.date as unknown as string);
        if (!k) continue;
        countByKey.set(k, (countByKey.get(k) || 0) + 1);
      }
      const dup = Array.from(countByKey.entries()).filter(([, c]) => c > 1).map(([k, c]) => `${k}×${c}`);
      return { hasDuplicateDates: dup.length > 0, duplicateDateKeys: dup };
    } catch {
      return { hasDuplicateDates: false, duplicateDateKeys: [] };
    }
  }, [marketData]);

  const symbol = useMemo(() => (
    currentDataset?.ticker || backtestResults?.symbol || backtestResults?.ticker || backtestResults?.meta?.ticker
  ), [currentDataset, backtestResults]);

  

  const handleRefresh = async () => {
    if (!symbol) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      await DatasetAPI.refreshDataset(symbol, resultsRefreshProvider);
      // Reload the dataset to reflect server-updated data
      await loadDatasetFromServer(symbol);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось обновить датасет';
      setRefreshError(message);
    } finally {
      setRefreshing(false);
    }
  };

  // Load trading calendar once to detect early-close days
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

  // Быстрая проверка актуальности данных (ожидаем бар за текущий торговый день после закрытия, иначе — за предыдущий)
  useEffect(() => {
    if (!marketData || marketData.length === 0) { setIsStale(false); setStaleInfo(null); return; }
    const now = new Date();

    const getETParts = (date: Date) => {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      });
      const parts = fmt.formatToParts(date);
      const map: Record<string,string> = {};
      parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
      const y = Number(map.year), m = Number(map.month), d = Number(map.day);
      const weekdayStr = map.weekday; // e.g., Mon, Tue
      const weekdayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
      const weekday = weekdayMap[weekdayStr as keyof typeof weekdayMap] ?? 0;
      return { y, m, d, weekday };
    };
    const isWeekendET = (p: {weekday:number}) => p.weekday === 0 || p.weekday === 6;
    const parseHmToMinutes = (hm: string | undefined | null): number | null => {
      try {
        if (!hm || typeof hm !== 'string' || hm.indexOf(':') < 0) return null;
        const [h, m] = hm.split(':');
        const hh = parseInt(h, 10);
        const mm = parseInt(m, 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return hh * 60 + mm;
      } catch { return null; }
    };
    const isHolidayET = (p: {y:number;m:number;d:number}) => {
      try {
        if (!tradingCalendar) return false;
        const y = String(p.y);
        const key = `${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
        return !!(tradingCalendar.holidays[y] && tradingCalendar.holidays[y][key]);
      } catch { return false; }
    };
    const isShortDayET = (p: {y:number;m:number;d:number}) => {
      try {
        if (!tradingCalendar) return false;
        const y = String(p.y);
        const key = `${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
        return !!(tradingCalendar.shortDays[y] && tradingCalendar.shortDays[y][key]);
      } catch { return false; }
    };
    const getSessionForDateET = (p: {y:number;m:number;d:number}) => {
      const open = parseHmToMinutes(tradingCalendar?.tradingHours?.normal?.start) ?? (9*60+30);
      const normalClose = parseHmToMinutes(tradingCalendar?.tradingHours?.normal?.end) ?? (16*60);
      const shortClose = parseHmToMinutes(tradingCalendar?.tradingHours?.short?.end) ?? (13*60);
      const short = isShortDayET(p);
      return { openMin: open, closeMin: short ? shortClose : normalClose, short };
    };
    const previousTradingDayET = (fromUTC: Date) => {
      const cursor = new Date(fromUTC);
      // step back at least one day
      cursor.setUTCDate(cursor.getUTCDate()-1);
      while (true) {
        const parts = getETParts(cursor);
        if (!isWeekendET(parts) && !isHolidayET(parts)) return parts;
        cursor.setUTCDate(cursor.getUTCDate()-1);
      }
    };

    // Determine if by now we should expect today's daily bar (after close + buffer) or yesterday's
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const tparts = timeFmt.formatToParts(now);
    const tmap: Record<string, string> = {};
    tparts.forEach(p => { if (p.type !== 'literal') tmap[p.type] = p.value; });
    const hh = parseInt(tmap.hour || '0', 10);
    const mm = parseInt(tmap.minute || '0', 10);
    const minutes = hh * 60 + mm;
    const session = getSessionForDateET(getETParts(now));
    const closeMin = session.closeMin; // dynamic close (short day aware)
    const bufferMin = 30; // safety buffer after close for data providers
    const todayET = getETParts(now);

    const todayIsTradingDay = !isWeekendET(todayET) && !isHolidayET(todayET);

    const expectedParts = (todayIsTradingDay && minutes >= (closeMin + bufferMin))
      ? todayET
      : previousTradingDayET(now);

    // Сравниваем в UTC-ключах, чтобы не было сдвига дат между UTC и ET
    const expectedKeyUTC = new Date(Date.UTC(
      expectedParts.y,
      expectedParts.m - 1,
      expectedParts.d,
      0, 0, 0
    )).toISOString().slice(0,10);
    // Проверяем наличие ожидаемой даты в данных, а не только последнюю дату
    const dataKeys = new Set(
      marketData.map(b => {
        try {
          const d = b.date instanceof Date ? b.date : new Date(b.date as unknown as string | number | Date);
          return formatOHLCYMD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0)));
        } catch {
          return '';
        }
      })
    );
    const stale = !dataKeys.has(expectedKeyUTC);
    setIsStale(stale);
    if (stale) {
      const displayDate = new Date(Date.UTC(expectedParts.y, expectedParts.m - 1, expectedParts.d, 12, 0, 0));
      setStaleInfo(`Отсутствует бар за ${displayDate.toLocaleDateString('ru-RU', { timeZone: 'America/New_York' })}`);
    } else {
      setStaleInfo(null);
    }
  }, [marketData, tradingCalendar]);

  // Авто-пуллинг котировок (пропускаем вызовы API в выходные/вне торговых часов)
  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!symbol) return;
    const isMarketOpenNow = () => {
      // Compute ET local time safely using Intl APIs
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
      });
      const fmtParts = fmt.formatToParts(new Date());
      const map: Record<string, string> = {};
      fmtParts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
      const weekdayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
      const weekday = weekdayMap[map.weekday] ?? 0;
      const hh = parseInt(map.hour || '0', 10);
      const mm = parseInt(map.minute || '0', 10);
      const isWeekday = weekday >= 1 && weekday <= 5; // Mon..Fri in ET
      const minutes = hh * 60 + mm;
      if (!isWeekday) return false;
      // Holiday/short-day aware session bounds
      const ymd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
        .formatToParts(new Date())
        .reduce((acc: any, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
      const ymdObj = { y: Number(ymd.year), m: Number(ymd.month), d: Number(ymd.day) };
      const isHoliday = (() => {
        try {
          if (!tradingCalendar) return false;
          const y = String(ymdObj.y);
          const key = `${String(ymdObj.m).padStart(2,'0')}-${String(ymdObj.d).padStart(2,'0')}`;
          return !!(tradingCalendar.holidays[y] && tradingCalendar.holidays[y][key]);
        } catch { return false; }
      })();
      if (isHoliday) return false;
      const short = (() => {
        try {
          if (!tradingCalendar) return false;
          const y = String(ymdObj.y);
          const key = `${String(ymdObj.m).padStart(2,'0')}-${String(ymdObj.d).padStart(2,'0')}`;
          return !!(tradingCalendar.shortDays[y] && tradingCalendar.shortDays[y][key]);
        } catch { return false; }
      })();
      const parseHm = (hm?: string) => {
        if (!hm || hm.indexOf(':') < 0) return null;
        const [h, m] = hm.split(':');
        const H = parseInt(h, 10), M = parseInt(m, 10);
        return Number.isFinite(H) && Number.isFinite(M) ? (H*60 + M) : null;
      };
      const openMin = parseHm(tradingCalendar?.tradingHours?.normal?.start) ?? (9*60+30);
      const closeMin = short
        ? (parseHm(tradingCalendar?.tradingHours?.short?.end) ?? (13*60))
        : (parseHm(tradingCalendar?.tradingHours?.normal?.end) ?? (16*60));
      return minutes >= openMin && minutes <= closeMin;
    };
    setIsTrading(isMarketOpenNow());
    const fetchQuote = async () => {
      try {
        const open = isMarketOpenNow();
        if (!open) {
          if (isMounted) setIsTrading(false);
          // Вне часов/выходные — не дергаем API, редкий опрос для смены статуса
          timer = setTimeout(fetchQuote, 5 * 60 * 1000);
          return;
        }
        if (isMounted) { setIsTrading(true); setQuoteLoading(true); }
        const q = await DatasetAPI.getQuote(symbol, resultsQuoteProvider || 'finnhub');
        if (isMounted) { setQuote(q); setQuoteError(null); setLastUpdatedAt(new Date()); }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Не удалось получить котировку';
        if (isMounted) setQuoteError(message);
      } finally {
        if (isMounted) { setQuoteLoading(false); timer = setTimeout(fetchQuote, 15000); }
      }
    };
    fetchQuote();
    return () => { isMounted = false; if (timer) clearTimeout(timer); };
  }, [symbol, resultsQuoteProvider, tradingCalendar]);

  // Автозапуск бэктеста, если результатов ещё нет, но данные и стратегия готовы
  useEffect(() => {
    if (!backtestResults && marketData.length > 0 && currentStrategy && backtestStatus !== 'running') {
      runBacktest();
    }
  }, [backtestResults, marketData, currentStrategy, backtestStatus, runBacktest]);
  // Лёгкий повтор через короткую задержку, если всё готово, а статуса запуска нет
  useEffect(() => {
    if (!backtestResults && marketData.length > 0 && currentStrategy && backtestStatus === 'idle') {
      const t = setTimeout(() => { runBacktest(); }, 300);
      return () => clearTimeout(t);
    }
  }, [backtestResults, marketData, currentStrategy, backtestStatus, runBacktest]);

  // Compute once regardless of results presence to keep hook order stable
  const initialCapital = Number(currentStrategy?.riskManagement?.initialCapital ?? 10000);
  const buyHoldEquity = useMemo(() => {
    try {
      if (!Array.isArray(marketData) || marketData.length === 0) return [] as { date: Date; value: number; drawdown: number }[];
      const first = marketData[0];
      const firstPrice = typeof first?.adjClose === 'number' && first.adjClose > 0 ? first.adjClose : first.close;
      if (!firstPrice || firstPrice <= 0) return [] as { date: Date; value: number; drawdown: number }[];
      let peak = initialCapital;
      const series = marketData.map(b => {
        const price = typeof b?.adjClose === 'number' && b.adjClose > 0 ? b.adjClose : b.close;
        const value = initialCapital * (price / firstPrice);
        if (value > peak) peak = value;
        const drawdown = peak > 0 ? ((peak - value) / peak) * 100 : 0;
        const d = b.date instanceof Date ? b.date : new Date(b.date as unknown as string | number | Date);
        return { date: d, value, drawdown };
      });
      return series;
    } catch {
      return [] as { date: Date; value: number; drawdown: number }[];
    }
  }, [marketData, initialCapital]);

  const [buyHoldMarginPctInput, setBuyHoldMarginPctInput] = useState<string>('100');
  const [buyHoldAppliedLeverage, setBuyHoldAppliedLeverage] = useState<number>(1);
  const buyHoldSimEquity = useMemo(() => (
    simulateLeverageForEquity(buyHoldEquity as unknown as EquityPoint[], buyHoldAppliedLeverage)
  ), [buyHoldEquity, buyHoldAppliedLeverage]);
  const onApplyBuyHold = () => {
    const pct = Number(buyHoldMarginPctInput);
    if (!isFinite(pct) || pct <= 0) return;
    setBuyHoldAppliedLeverage(pct / 100);
  };

  if (!backtestResults) {
    return (
      <div className="text-center py-8">
        <div className="space-y-3">
          <p className="text-gray-600">
            {backtestStatus === 'running' ? 'Запуск бэктеста…' : 'Готовим бэктест…'}
          </p>
          {storeError && (
            <div className="text-sm text-red-600">{String(storeError)}</div>
          )}
          {backtestStatus !== 'running' && (
            <button
              onClick={() => runBacktest()}
              className="inline-flex items-center px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Запустить бэктест
            </button>
          )}
        </div>
      </div>
    );
  }

  const { metrics, trades, equity } = backtestResults;
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Верхний блок: символ слева, правая панель с мини-графиком/ценами и кнопку мониторинга */}
      <section className="rounded-xl border bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Левая часть: символ и статус */}
          <div className="space-y-2 md:col-span-1">
            <div className="flex items-center gap-3 w-full">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 dark:text-gray-100">
                {symbol || '—'}
              </div>
              <button
                onClick={() => {
                  setShowConsole(v => !v);
                  logInfo('ui', 'toggle error console', { open: !showConsole }, 'Results');
                }}
                className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition ${showConsole ? 'bg-amber-600 border-amber-600 text-white hover:brightness-110' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                title={showConsole ? 'Скрыть журнал ошибок' : 'Показать журнал ошибок'}
                aria-label={showConsole ? 'Скрыть журнал ошибок' : 'Показать журнал ошибок'}
              >
                <Bug className={`w-5 h-5 ${showConsole ? 'animate-pulse' : ''}`} />
              </button>
              <button
                disabled={!symbol || watchBusy}
                onClick={async () => {
                  if (!symbol) return;
                  setWatchBusy(true);
                  try {
                    if (!watching) {
                      const trades = backtestResults?.trades || [];
                      const lastTrade = trades[trades.length - 1];
                      const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
                      const isOpen = !!(lastTrade && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
                      await DatasetAPI.registerTelegramWatch({
                        symbol,
                        highIBS: Number(currentStrategy?.parameters?.highIBS ?? 0.75),
                        lowIBS: Number(currentStrategy?.parameters?.lowIBS ?? 0.1),
                        entryPrice: isOpen ? lastTrade?.entryPrice ?? null : null,
                        isOpenPosition: isOpen,
                      });
                      setWatching(true);
                    } else {
                      await DatasetAPI.deleteTelegramWatch(symbol);
                      setWatching(false);
                    }
                  } catch (e) {
                    const message = e instanceof Error ? e.message : 'Операция не выполнена';
                    setModal({ type: 'error', title: watching ? 'Ошибка удаления' : 'Ошибка добавления', message });
                  } finally {
                    setWatchBusy(false);
                  }
                }}
                className={`ml-auto inline-flex items-center justify-center w-10 h-10 rounded-full border transition ${watching ? 'bg-rose-600 border-rose-600 text-white hover:brightness-110' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                title={watching ? 'Удалить из мониторинга' : 'Добавить в мониторинг'}
                aria-label={watching ? 'Удалить из мониторинга' : 'Добавить в мониторинг'}
              >
                <Heart className={`w-5 h-5 ${watching ? 'fill-current animate-heartbeat' : ''}`} />
              </button>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
              {quote?.current != null ? `$${Number(quote.current).toFixed(2)}` : '—'}
            </div>
            <div>
              {(() => {
                const prev = quote?.prevClose ?? null;
                const cur = quote?.current ?? null;
                if (prev == null || cur == null) {
                  return <div className="text-sm text-gray-500">{isTrading ? 'Сегодня' : 'Вне сессии'}</div>;
                }
                const delta = cur - prev;
                const pct = prev !== 0 ? (delta / prev) * 100 : 0;
                const positive = delta >= 0;
                const color = positive ? 'text-green-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300';
                const sign = positive ? '+' : '';
                return (
                  <div className={`text-lg font-semibold ${color}`}>
                    {`${sign}$${delta.toFixed(2)} (${sign}${pct.toFixed(2)}%)`}{' '}
                    <span className="text-gray-800 font-normal dark:text-gray-300">{isTrading ? 'Сегодня' : 'С предыдущего закрытия'}</span>
                  </div>
                );
              })()}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-0.5 rounded bg-gray-100 border dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Источник: {(resultsQuoteProvider === 'alpha_vantage') ? 'Alpha Vantage' : 'Finnhub'}</span>
              {lastUpdatedAt && (
                <span className="px-2 py-0.5 rounded bg-gray-100 border dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Обновлено: {lastUpdatedAt.toLocaleTimeString('ru-RU')}</span>
              )}
              <span className={`px-2 py-0.5 rounded border ${isTrading ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-200' : 'bg-amber-100 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200'}`}>
                {isTrading ? 'Рынок открыт' : 'Рынок закрыт'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center sm:text-left">
              <div className="p-2 rounded border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-300">Откр</div>
                <div className="font-mono text-sm">{quote?.open ?? '—'}</div>
              </div>
              <div className="p-2 rounded border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-300">Макс</div>
                <div className="font-mono text-sm">{quote?.high ?? '—'}</div>
              </div>
              <div className="p-2 rounded border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-300">Мин</div>
                <div className="font-mono text-sm">{quote?.low ?? '—'}</div>
              </div>
              <div className="p-2 rounded border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-300">Текущ</div>
                <div className="font-mono text-sm">{quote?.current ?? '—'}</div>
              </div>
            </div>
            {/* Под стикером: инфо об открытой сделке и компактный алерт об устаревании + иконка обновления */}
            <div className="mt-2 space-y-2">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {(() => {
                  const lastTrade = trades[trades.length - 1];
                  const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
                  const isOpen = !!(lastTrade && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
                  return (
                    <span>
                      Открытая сделка: <span className={isOpen ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-500'}>{isOpen ? 'да' : 'нет'}</span>
                      {isOpen && lastTrade?.entryPrice != null && (
                        <span className="ml-2 text-xs text-gray-500">вход: ${Number(lastTrade.entryPrice).toFixed(2)}</span>
                      )}
                    </span>
                  );
                })()}
              </div>
              {isStale && (
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Данные не актуальны{staleInfo ? ` — ${staleInfo}` : ''}</span>
                </div>
              )}
              {isStale && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full border bg-white hover:bg-gray-50 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                    title="Обновить данные"
                    aria-label="Обновить данные"
                    disabled={refreshing}
                  >
                    <RefreshCcw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                  {refreshError && <span className="text-xs text-red-600">{refreshError}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Правая часть: мини-график + KPI (переносятся ниже при < ~1130px) */}
          <div className="md:col-span-2 flex gap-3 flex-col xl:flex-row">
            <div className="flex-1 bg-white rounded-lg border p-3 dark:bg-gray-900 dark:border-gray-800">
              <div className="w-full">
                <div className="h-[260px] sm:h-[300px]">
                  <MiniQuoteChart 
                    history={marketData.slice(-10)}
                    today={quote}
                    trades={trades}
                    highIBS={Number(currentStrategy?.parameters?.highIBS ?? 0.75)}
                    isOpenPosition={(() => {
                      const lastTrade = trades[trades.length - 1];
                      const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
                      return !!(lastTrade && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
                    })()}
                    entryPrice={(() => {
                      const lastTrade = trades[trades.length - 1];
                      const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
                      const isOpen = !!(lastTrade && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
                      return isOpen ? lastTrade?.entryPrice ?? null : null;
                    })()}
                  />
                </div>
              </div>
            </div>
            <div className="w-full xl:w-56 grid grid-cols-3 xl:flex xl:flex-col gap-2">
              <div className="rounded-lg border p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">CAGR</div>
                <div className="text-base font-semibold dark:text-gray-100">{metrics.cagr.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Sharpe</div>
                <div className="text-base font-semibold dark:text-gray-100">{metrics.sharpeRatio.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Макс. просадка</div>
                <div className="text-base font-semibold dark:text-gray-100">{metrics.maxDrawdown.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Win rate</div>
                <div className="text-base font-semibold dark:text-gray-100">{metrics.winRate.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Profit factor</div>
                <div className="text-base font-semibold dark:text-gray-100">{metrics.profitFactor.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border p-2 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Сделок</div>
                <div className="text-base font-semibold dark:text-gray-100">{(metrics.totalTrades ?? trades.length).toString()}</div>
              </div>
            </div>
          </div>
          {/* Подсказки под правым блоком */}
          {quoteLoading && <div className="text-xs text-gray-400">загрузка…</div>}
          {!isTrading && (
            <div className="text-sm text-gray-500">
              {(() => {
                const parseHm = (hm?: string) => {
                  if (!hm || hm.indexOf(':') < 0) return null;
                  const [h, m] = hm.split(':');
                  const H = parseInt(h, 10), M = parseInt(m, 10);
                  return Number.isFinite(H) && Number.isFinite(M) ? { H, M } : null;
                };
                const now = new Date();
                const ymd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
                  .formatToParts(now)
                  .reduce((acc: any, p) => { if (p.type !== 'literal') acc[p.type] = p.value; return acc; }, {});
                const y = String(ymd.year);
                const md = `${ymd.month}-${ymd.day}`;
                const short = !!(tradingCalendar && tradingCalendar.shortDays && tradingCalendar.shortDays[y] && tradingCalendar.shortDays[y][md]);
                const start = parseHm(tradingCalendar?.tradingHours?.normal?.start) || { H: 9, M: 30 };
                const endHm = short ? (parseHm(tradingCalendar?.tradingHours?.short?.end) || { H: 13, M: 0 }) : (parseHm(tradingCalendar?.tradingHours?.normal?.end) || { H: 16, M: 0 });
                const fmt = (x: { H: number; M: number }) => `${String(x.H).padStart(2,'0')}:${String(x.M).padStart(2,'0')}`;
                return `Показываем в торговые часы (NYSE): ${fmt(start)}–${fmt(endHm)} ET${short ? ' (сокр.)' : ''}`;
              })()}
            </div>
          )}
          {quoteError && <div className="text-sm text-red-600">{quoteError}</div>}
        </div>
      </section>

      {/* Основной контент: графики (во всю ширину) */}
      <div className="space-y-6">
        <div className="space-y-6">
          {/* Компактный алерт о дублях дат */}
          {hasDuplicateDates && (
            <div className="rounded-lg border p-3 bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
              Дубли дат в данных: {duplicateDateKeys.join(', ')}
            </div>
          )}
          {/* Табы для графиков */}
          <section className="rounded-xl border bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Аналитика сделок</h2>
            </div>
            <div className="horizontal-scroll pb-2">
              <div className="flex items-center gap-2 flex-nowrap min-w-max px-1">
              <button className={`${activeChart === 'price' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('price')}>Цена</button>
              <button className={`${activeChart === 'equity' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('equity')}>Equity</button>
              <button className={`${activeChart === 'buyhold' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('buyhold')}>Buy and hold</button>
              <button className={`${activeChart === 'drawdown' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('drawdown')}>Просадки</button>
              <button className={`${activeChart === 'trades' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('trades')}>Сделки</button>
              <button className={`${activeChart === 'profit' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('profit')}>Profit factor</button>
              <button className={`${activeChart === 'duration' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('duration')}>Длительность</button>
              <button className={`${activeChart === 'openDayDrawdown' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('openDayDrawdown')}>Стартовая просадка</button>
              <button className={`${activeChart === 'margin' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('margin')}>Маржа</button>
              <button className={`${activeChart === 'buyAtClose' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('buyAtClose')}>Покупка на закрытии</button>
              <button className={`${activeChart === 'noStopLoss' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('noStopLoss')}>Без stop loss</button>
              <button className={`${activeChart === 'splits' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'} px-3 py-1.5 rounded border`} onClick={() => setActiveChart('splits')}>Сплиты</button>
              </div>
            </div>

            {/* Strategy summary near charts for clarity */}
            <div className="mt-3 mb-4 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2">
              {(() => {
                const low = Number(currentStrategy?.parameters?.lowIBS ?? 0.1);
                const high = Number(currentStrategy?.parameters?.highIBS ?? 0.75);
                const hold = Number(
                  typeof currentStrategy?.parameters?.maxHoldDays === 'number'
                    ? currentStrategy?.parameters?.maxHoldDays
                    : currentStrategy?.riskManagement?.maxHoldDays ?? 30
                );
                const useSL = !!currentStrategy?.riskManagement?.useStopLoss;
                const useTP = !!currentStrategy?.riskManagement?.useTakeProfit;
                const sl = Number(currentStrategy?.riskManagement?.stopLoss ?? 0);
                const tp = Number(currentStrategy?.riskManagement?.takeProfit ?? 0);
                return (
                  <div>
                    <span className="font-semibold">Стратегия IBS:</span>{' '}
                    <span>Вход — IBS &lt; {low}; </span>
                    <span>Выход — IBS &gt; {high} или по истечении {hold} дней.</span>{' '}
                    <span className="ml-2">SL: {useSL ? `${sl}%` : 'выкл'}, TP: {useTP ? `${tp}%` : 'выкл'}</span>
                  </div>
                );
              })()}
            </div>

            {activeChart === 'price' && (
              <div className="h-[600px] mt-4 mb-6">
                <TradingChart data={marketData} trades={trades} splits={currentSplits} />
              </div>
            )}
            {activeChart === 'equity' && (
              <EquityChart equity={equity} />
            )}
            {activeChart === 'buyhold' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 dark:text-gray-300">Маржинальность, %</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step={1}
                      value={buyHoldMarginPctInput}
                      onChange={(e) => setBuyHoldMarginPctInput(e.target.value)}
                      className="px-3 py-2 border rounded-md w-40 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                      placeholder="например, 100"
                    />
                  </div>
                  <button
                    onClick={onApplyBuyHold}
                    className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Посчитать
                  </button>
                  <div className="text-xs text-gray-500 dark:text-gray-300">
                    Текущее плечо: ×{buyHoldAppliedLeverage.toFixed(2)}
                  </div>
                </div>
                <EquityChart equity={buyHoldSimEquity.length ? buyHoldSimEquity : (buyHoldEquity as unknown as EquityPoint[])} />
              </div>
            )}
            {activeChart === 'drawdown' && (
              <TradeDrawdownChart trades={trades} initialCapital={Number(currentStrategy?.riskManagement?.initialCapital ?? 10000)} />
            )}
            {activeChart === 'trades' && (
              <TradesTable trades={trades} />
            )}
            {activeChart === 'profit' && (
              <ProfitFactorChart trades={trades} />
            )}
            {activeChart === 'duration' && (
              <TradeDurationChart trades={trades} />
            )}
            {activeChart === 'openDayDrawdown' && (
              <OpenDayDrawdownChart trades={trades} data={marketData} />
            )}
            {activeChart === 'margin' && (
              <MarginSimulator equity={equity} />
            )}
            {activeChart === 'buyAtClose' && (
              <BuyAtCloseSimulator data={marketData} strategy={currentStrategy} />
            )}
            {activeChart === 'noStopLoss' && (
              <NoStopLossSimulator data={marketData} strategy={currentStrategy} />
            )}
            {activeChart === 'splits' && (
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">История сплитов</h3>
                  {currentSplits && Array.isArray(currentSplits) && currentSplits.length > 0 ? (
                    <div className="space-y-2">
                      {currentSplits.map((split, index) => (
                        <div key={index} className="flex justify-between items-center py-3 px-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {new Date(split.date).toLocaleDateString('ru-RU')}
                          </span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Коэффициент: {split.factor}:1
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p>Для этой акции сплиты не найдены</p>
                    </div>
                  )}

                  {/* Ссылки на внешние ресурсы */}
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <a
                        href={`https://seekingalpha.com/symbol/${symbol}/splits`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      >
                        посмотреть сплиты
                      </a>
                      <a
                        href="https://divvydiary.com/en/microsectors-fang-index-3x-leveraged-etn-etf-US0636795348?utm_source=chatgpt.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      >
                        и вот здесь
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <InfoModal open={modal.type != null} title={modal.title || ''} message={modal.message || ''} onClose={() => setModal({ type: null })} kind={modal.type === 'error' ? 'error' : 'info'} />
      <ErrorConsole open={showConsole} onClose={() => setShowConsole(false)} />
    </div>
  );
}