import { Heart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';
import { TradingChart } from './TradingChart';
import { EquityChart } from './EquityChart';
import { TradeDrawdownChart } from './TradeDrawdownChart';
import { MiniQuoteChart } from './MiniQuoteChart';
import { InfoModal } from './InfoModal';
import { TradesTable } from './TradesTable';
import { ProfitFactorChart } from './ProfitFactorChart';
import { TradeDurationChart } from './TradeDurationChart';

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
  const updateMarketData = useAppStore(s => s.updateMarketData);
  const updateDatasetOnServer = useAppStore(s => s.updateDatasetOnServer);
  const saveDatasetToServer = useAppStore(s => s.saveDatasetToServer);
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
  
  type ChartTab = 'price' | 'equity' | 'drawdown' | 'trades' | 'profit' | 'duration';
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

  // Быстрая проверка актуальности данных (ожидаем бар за предыдущий торговый день по времени NYSE / America/New_York)
  useEffect(() => {
    if (!marketData || marketData.length === 0) { setIsStale(false); setStaleInfo(null); return; }
    const lastBar = marketData[marketData.length - 1];
    const lastBarDate = new Date(lastBar.date);
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
    const keyFromParts = (p: {y:number;m:number;d:number}) => `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
    const isWeekendET = (p: {weekday:number}) => p.weekday === 0 || p.weekday === 6;
    const nthWeekdayOfMonth = (year: number, monthIndex0: number, weekday: number, n: number) => {
      const first = new Date(Date.UTC(year, monthIndex0, 1));
      // step days until ET weekday matches
      let cursor = first;
      while (getETParts(cursor).weekday !== weekday) {
        const c = new Date(cursor); c.setUTCDate(c.getUTCDate()+1); cursor = c;
      }
      for (let i=1; i<n; i++) { const c = new Date(cursor); c.setUTCDate(c.getUTCDate()+7); cursor = c; }
      return getETParts(cursor);
    };
    const lastWeekdayOfMonth = (year: number, monthIndex0: number, weekday: number) => {
      const last = new Date(Date.UTC(year, monthIndex0 + 1, 0));
      let move = last;
      while (getETParts(move).weekday !== weekday) {
        const c = new Date(move); c.setUTCDate(c.getUTCDate()-1); move = c;
      }
      return getETParts(move);
    };
    const observedFixedET = (year: number, monthIndex0: number, day: number) => {
      const base = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
      const p = getETParts(base);
      if (p.weekday === 0) { // Sunday -> Monday
        const d = new Date(base); d.setUTCDate(d.getUTCDate()+1); return getETParts(d);
      }
      if (p.weekday === 6) { // Saturday -> Friday
        const d = new Date(base); d.setUTCDate(d.getUTCDate()-1); return getETParts(d);
      }
      return p;
    };
    const easterUTC = (year: number) => {
      const a = year % 19;
      const b = Math.floor(year / 100);
      const c = year % 100;
      const d = Math.floor(b / 4);
      const e = b % 4;
      const f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3);
      const h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4);
      const k = c % 4;
      const l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(Date.UTC(year, month, day, 12, 0, 0));
    };
    const goodFridayET = (year: number) => {
      const easter = easterUTC(year);
      const gf = new Date(easter); gf.setUTCDate(gf.getUTCDate()-2); return getETParts(gf);
    };
    const nyseHolidaySetET = (year: number) => {
      const keys = new Set<string>();
      keys.add(keyFromParts(observedFixedET(year, 0, 1)));  // New Year’s Day
      keys.add(keyFromParts(observedFixedET(year, 5, 19))); // Juneteenth
      keys.add(keyFromParts(observedFixedET(year, 6, 4)));  // Independence Day
      keys.add(keyFromParts(observedFixedET(year, 11, 25))); // Christmas
      keys.add(keyFromParts(nthWeekdayOfMonth(year, 0, 1, 3))); // MLK Day (Mon)
      keys.add(keyFromParts(nthWeekdayOfMonth(year, 1, 1, 3))); // Presidents’ Day (Mon)
      keys.add(keyFromParts(goodFridayET(year))); // Good Friday
      keys.add(keyFromParts(lastWeekdayOfMonth(year, 4, 1))); // Memorial Day (Mon)
      keys.add(keyFromParts(nthWeekdayOfMonth(year, 8, 1, 1))); // Labor Day (Mon)
      keys.add(keyFromParts(nthWeekdayOfMonth(year, 10, 4, 4))); // Thanksgiving (Thu)
      return keys;
    };
    const isHolidayET = (p: {y:number;m:number;d:number}) => nyseHolidaySetET(p.y).has(keyFromParts(p));
    const previousTradingDayET = (fromUTC: Date) => {
      let cursor = new Date(fromUTC);
      // step back at least one day
      cursor.setUTCDate(cursor.getUTCDate()-1);
      while (true) {
        const parts = getETParts(cursor);
        if (!isWeekendET(parts) && !isHolidayET(parts)) return parts;
        cursor.setUTCDate(cursor.getUTCDate()-1);
      }
    };

    const expectedParts = previousTradingDayET(now);
    // Сравниваем в UTC-ключах, чтобы не было сдвига дат между UTC и ET
    const lastKeyUTC = new Date(Date.UTC(
      lastBarDate.getUTCFullYear(),
      lastBarDate.getUTCMonth(),
      lastBarDate.getUTCDate(),
      0, 0, 0
    )).toISOString().slice(0,10);
    const expectedKeyUTC = new Date(Date.UTC(
      expectedParts.y,
      expectedParts.m - 1,
      expectedParts.d,
      0, 0, 0
    )).toISOString().slice(0,10);
    const stale = lastKeyUTC !== expectedKeyUTC;
    setIsStale(stale);
    if (stale) {
      const displayDate = new Date(Date.UTC(expectedParts.y, expectedParts.m - 1, expectedParts.d, 12, 0, 0));
      setStaleInfo(`Отсутствует бар за ${displayDate.toLocaleDateString('ru-RU', { timeZone: 'America/New_York' })}`);
    } else {
      setStaleInfo(null);
    }
  }, [marketData]);

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
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
      });
      const parts = fmt.formatToParts(new Date());
      const map: Record<string,string> = {} as any;
      parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
      const weekdayMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
      const weekday = weekdayMap[map.weekday] ?? 0;
      const hh = parseInt(map.hour || '0', 10);
      const mm = parseInt(map.minute || '0', 10);
      const isWeekday = weekday >= 1 && weekday <= 5; // Mon..Fri in ET
      const minutes = hh * 60 + mm;
      const openMin = 9 * 60 + 30;  // 09:30 ET
      const closeMin = 16 * 60;     // 16:00 ET
      return isWeekday && minutes >= openMin && minutes <= closeMin;
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
  }, [symbol, resultsQuoteProvider]);

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
      {/* Верхний блок: символ слева, правая панель с мини-графиком/ценами и кнопкой мониторинга */}
      <section className="rounded-xl border bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Левая часть: символ и статус */}
          <div className="space-y-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 dark:text-gray-100">
                {symbol || '—'}
              </div>
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
                className={`inline-flex items-center justify-center w-10 h-10 rounded-full border transition ${watching ? 'bg-rose-600 border-rose-600 text-white hover:brightness-110' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700'}`}
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
          </div>

          {/* Правая часть: мини-график + цены + кнопка мониторинга */}
          <div className="md:col-span-2 flex flex-col gap-3">
            <div className="bg-white rounded-lg border p-3 dark:bg-gray-900 dark:border-gray-800">
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
                {/* Ценовые блоки перенесены в левую часть */}
              </div>
            </div>
            {/* Кнопка мониторинга перемещена к названию тикера */}
            {quoteLoading && <div className="text-xs text-gray-400">загрузка…</div>}
            {!isTrading && (
              <div className="text-sm text-gray-500">Показываем в торговые часы (NYSE): 09:30–16:00 ET</div>
            )}
            {quoteError && <div className="text-sm text-red-600">{quoteError}</div>}
          </div>
        </div>
      </section>

      {/* Основной контент: KPI и графики (во всю ширину) */}
      <div className="space-y-6">
        <div className="space-y-6">
          {/* KPI */}
          <section className="rounded-xl border bg-white p-3 dark:bg-gray-900 dark:border-gray-800">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
              <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">CAGR</div>
                <div className="text-lg font-semibold dark:text-gray-100">{metrics.cagr.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Sharpe</div>
                <div className="text-lg font-semibold dark:text-gray-100">{metrics.sharpeRatio.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Макс. просадка</div>
                <div className="text-lg font-semibold dark:text-gray-100">{metrics.maxDrawdown.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Win rate</div>
                <div className="text-lg font-semibold dark:text-gray-100">{metrics.winRate.toFixed(2)}%</div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Profit factor</div>
                <div className="text-lg font-semibold dark:text-gray-100">{metrics.profitFactor.toFixed(2)}</div>
              </div>
              <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-300">Сделок</div>
                <div className="text-lg font-semibold dark:text-gray-100">{(metrics.totalTrades ?? trades.length).toString()}</div>
              </div>
            </div>
            {/* Состояние данных (перенесено сюда) */}
            <div className="mt-3 space-y-2">
              {isStale && (
                <div className="flex flex-col gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
                  <span className="text-sm">Данные не актуальны. {staleInfo}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (!symbol) return;
                        setRefreshing(true); setRefreshError(null);
                        try {
                          const lastBarDate = new Date(marketData[marketData.length - 1].date);
                          const start = new Date(lastBarDate);
                          start.setUTCDate(start.getUTCDate() - 7);
                          const startTs = Math.floor(start.getTime() / 1000);
                          const endTs = Math.floor(Date.now() / 1000);
                          const prov = resultsRefreshProvider || 'finnhub';
                          const base = window.location.href.includes('/stonks') ? '/stonks/api' : '/api';
                          const url = `${base}/yahoo-finance/${encodeURIComponent(symbol)}?start=${startTs}&end=${endTs}&provider=${prov}&adjustment=split_only`;
                          const resp = await fetch(url, { credentials: 'include' });
                          if (!resp.ok) {
                            let msg = `${resp.status} ${resp.statusText}`;
                            try { const e = await resp.json(); msg = e.error || msg; } catch {}
                            throw new Error(msg);
                          }
                          const json = await resp.json();
                          const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
                          if (!Array.isArray(rows) || rows.length === 0) {
                            setIsStale(false);
                            setStaleInfo(null);
                            return;
                          }
                          const { parseOHLCDate, adjustOHLCForSplits } = await import('../lib/utils');
                          const incoming = rows.map((r: { date: string; open: number; high: number; low: number; close: number; adjClose?: number; volume: number; }) => ({
                            date: parseOHLCDate(r.date), open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: r.volume,
                          }));
                          const existingDates = new Set(marketData.map((d) => d.date.toDateString()));
                          const filtered = incoming.filter((d: { date: Date }) => !existingDates.has(d.date.toDateString()));
                          if (filtered.length) {
                            const merged = [...marketData, ...filtered].sort((a, b) => a.date.getTime() - b.date.getTime());
                            const finalData = adjustOHLCForSplits(merged, currentSplits);
                            updateMarketData(finalData);
                            try {
                              if (currentDataset && currentDataset.name) {
                                await updateDatasetOnServer();
                              } else if (symbol) {
                                await saveDatasetToServer(symbol);
                              }
                            } catch (e) {
                              const msg = e instanceof Error ? e.message : 'Не удалось сохранить изменения на сервере';
                              setRefreshError(msg);
                            }
                          }
                          setIsStale(false);
                          setStaleInfo(null);
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : 'Не удалось актуализировать данные';
                          setRefreshError(msg);
                        }
                      }}
                      className="inline-flex items-center px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                      disabled={refreshing}
                    >
                      {refreshing ? 'Обновляем…' : 'Обновить данные'}
                    </button>
                    {refreshError && <span className="text-sm text-red-600">{refreshError}</span>}
                  </div>
                </div>
              )}
              {hasDuplicateDates && (
                <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
                  Дубли дат в данных: {duplicateDateKeys.join(', ')}
                </div>
              )}
            </div>
          </section>

          {/* Табы для графиков */}
          <section className="rounded-xl border bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs sm:text-sm">
              <button className={`px-3 py-1.5 rounded border ${activeChart === 'price' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`} onClick={() => setActiveChart('price')}>Цена</button>
              <button className={`px-3 py-1.5 rounded border ${activeChart === 'equity' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`} onClick={() => setActiveChart('equity')}>Equity</button>
              <button className={`px-3 py-1.5 rounded border ${activeChart === 'drawdown' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`} onClick={() => setActiveChart('drawdown')}>Просадки</button>
              <button className={`px-3 py-1.5 rounded border ${activeChart === 'trades' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`} onClick={() => setActiveChart('trades')}>Сделки</button>
              <button className={`px-3 py-1.5 rounded border ${activeChart === 'profit' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`} onClick={() => setActiveChart('profit')}>Profit factor</button>
              <button className={`px-3 py-1.5 rounded border ${activeChart === 'duration' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-900/40 dark:text-blue-200' : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`} onClick={() => setActiveChart('duration')}>Длительность</button>
            </div>

            {activeChart === 'price' && (
              <div className="h-[420px]">
                <TradingChart data={marketData} trades={trades} splits={currentSplits} />
              </div>
            )}
            {activeChart === 'equity' && (
              <EquityChart equity={equity} />
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
          </section>
        </div>
      </div>

      <InfoModal open={modal.type != null} title={modal.title || ''} message={modal.message || ''} onClose={() => setModal({ type: null })} kind={modal.type === 'error' ? 'error' : 'info'} />
    </div>
  );
}