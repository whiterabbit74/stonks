import { Heart } from 'lucide-react';
import { useEffect, useMemo, useState, useRef } from 'react';
import { DatasetAPI } from '../lib/api';
import { useAppStore } from '../stores';
import { TradingChart } from './TradingChart';
import { EquityChart } from './EquityChart';
import { TradeDrawdownChart } from './TradeDrawdownChart';
import { MiniQuoteChart } from './MiniQuoteChart';
import { InfoModal } from './InfoModal';

export function Results() {
  const backtestResults = useAppStore(s => s.backtestResults);
  const marketData = useAppStore(s => s.marketData);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const runBacktest = useAppStore(s => s.runBacktest);
  const backtestStatus = useAppStore(s => s.backtestStatus);
  const storeError = useAppStore(s => s.error);
  const currentSplits = useAppStore(s => s.currentSplits);
  const currentDataset = useAppStore(s => s.currentDataset);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);
  const resultsQuoteProvider = useAppStore(s => s.resultsQuoteProvider);
  const resultsRefreshProvider = useAppStore(s => s.resultsRefreshProvider);
  const setSplits = useAppStore(s => s.setSplits);
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
  const [, setSplitsError] = useState<string | null>(null);
  const fetchedSplitsForSymbolRef = useRef<string | null>(null);
  
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

  // Обеспечиваем наличие сплитов от сервера (централизованно).
  useEffect(() => {
    (async () => {
      setSplitsError(null);
      try {
        if (!symbol) return;
        // Уже загружали для этого символа — не повторяем запрос
        if (fetchedSplitsForSymbolRef.current === symbol) return;
        // Если уже есть сплиты (в т.ч. пустой массив) — не дёргаем API
        if (Array.isArray(currentSplits)) {
          fetchedSplitsForSymbolRef.current = symbol;
          return;
        }
        const s = await DatasetAPI.getSplits(symbol);
        fetchedSplitsForSymbolRef.current = symbol;
        if (Array.isArray(s)) {
          setSplits(s as any);
          try { await loadDatasetFromServer(symbol); } catch {}
        }
      } catch {
        // Не показываем 429/внешние ошибки, т.к. теперь API всегда локальный и отдаёт []
        // no-op
      }
    })();
   }, [symbol, currentSplits, loadDatasetFromServer, setSplits]);

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
    let cancelled = false;
    (async () => {
      try {
        if (!marketData || marketData.length === 0) { setIsStale(false); setStaleInfo(null); return; }
        const lastBar = marketData[marketData.length - 1];
        const lastBarDate = new Date(lastBar.date);
        // Получаем ожидаемую дату бара от сервера (централизованный календарь ET)
        const expectedYmd = await DatasetAPI.getExpectedPrevTradingDayET();
        if (cancelled) return;
        const lastKeyUTC = new Date(Date.UTC(
          lastBarDate.getUTCFullYear(),
          lastBarDate.getUTCMonth(),
          lastBarDate.getUTCDate(),
          0, 0, 0
        )).toISOString().slice(0,10);
        const stale = lastKeyUTC !== expectedYmd;
        setIsStale(stale);
        if (stale) {
          const [y, m, d] = expectedYmd.split('-').map(n => parseInt(n, 10));
          const displayDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
          setStaleInfo(`Отсутствует бар за ${displayDate.toLocaleDateString('ru-RU', { timeZone: 'America/New_York' })}`);
        } else {
          setStaleInfo(null);
        }
      } catch {
        if (!cancelled) { setIsStale(false); setStaleInfo(null); }
      }
    })();
    return () => { cancelled = true; };
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
      const map: Record<string,string> = {};
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
        const message = e instanceof Error ? e.message : 'Failed to fetch quote';
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

  const { metrics, trades, equity, chartData } = backtestResults;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Текущее состояние позиции/котировки */}
      <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="space-y-3">
            {/* Заголовок в стиле примера */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 dark:text-gray-100">{symbol || '—'}</div>
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
                          thresholdPct: watchThresholdPct,
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
                  title={watching ? 'Убрать из избранного' : 'В избранное'}
                  aria-label={watching ? 'Убрать из избранного' : 'В избранное'}
                >
                  <Heart className={`w-5 h-5 ${watching ? 'fill-current animate-heartbeat' : ''}`} />
                </button>
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-gray-100">
                {quote?.current != null ? `$${Number(quote.current).toFixed(2)}` : '—'}
              </div>
              {/* Строка изменения: динамическая подпись в зависимости от статуса рынка */}
              {(() => {
                const prev = quote?.prevClose ?? null;
                const cur = quote?.current ?? null;
                if (prev == null || cur == null) return (
                  <div className="text-sm text-gray-500">{isTrading ? 'Сегодня' : 'Вне сессии'}</div>
                );
                const delta = cur - prev;
                const pct = prev !== 0 ? (delta / prev) * 100 : 0;
                const positive = delta >= 0;
                const color = positive ? 'text-green-600 dark:text-emerald-300' : 'text-orange-600 dark:text-orange-300';
                const sign = positive ? '+' : '';
                return (
                  <div className={`text-lg font-semibold ${color}`}>
                    {`${sign}$${delta.toFixed(2)} (${sign}${pct.toFixed(2)}%)`} {' '}
                    <span className="text-gray-800 font-normal dark:text-gray-300">{isTrading ? 'Сегодня' : 'С предыдущего закрытия'}</span>
                  </div>
                );
              })()}
            </div>

            {/* Источник/время */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="px-2 py-0.5 rounded bg-gray-100 border dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Котировки: { (resultsQuoteProvider === 'alpha_vantage') ? 'Alpha Vantage' : 'Finnhub' }</span>
              <span className="px-2 py-0.5 rounded bg-gray-100 border dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Актуализация: { (resultsRefreshProvider === 'alpha_vantage') ? 'Alpha Vantage' : 'Finnhub' }</span>
              {lastUpdatedAt && (
                <span className="px-2 py-0.5 rounded bg-gray-100 border dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">Обновлено: {lastUpdatedAt.toLocaleTimeString('ru-RU')}</span>
              )}
              {!isTrading && (() => {
                // Покажем причину закрытия: выходной/вне торговых часов. Праздники уже подсвечиваются в стейле выше
                const now = new Date();
                const weekday = now.getUTCDay();
                const isWeekend = weekday === 0 || weekday === 6;
                return (
                  <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
                    Рынок закрыт{isWeekend ? ': выходной' : ''}
                  </span>
                );
              })()}
            </div>
            {isStale && (
              <div className="mt-2 flex flex-wrap items-center gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200">
                <span className="text-sm">Данные не актуальны. {staleInfo}</span>
                <button
                  onClick={async () => {
                    if (!symbol) return;
                    setRefreshing(true); setRefreshError(null);
                    try {
                      // Единый серверный refresh по тикеру
                      await DatasetAPI.refreshDataset(symbol, resultsRefreshProvider || 'finnhub');
                      // Перезагрузим активный датасет и снимем флаг «устарело»
                      try { await useAppStore.getState().loadDatasetFromServer(symbol); } catch { /* ignore */ }
                      setIsStale(false);
                      setStaleInfo(null);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Не удалось актуализировать данные';
                      setRefreshError(msg);
                    } finally {
                      setRefreshing(false);
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:bg-gray-400"
                  disabled={refreshing}
                >
                  {refreshing ? `Актуализация… (${resultsRefreshProvider})` : `Актуализировать (${resultsRefreshProvider})`}
                </button>
                {refreshError && <span className="text-sm text-red-600">{refreshError}</span>}
              </div>
            )}
            {/* Индикатор дублей дат в данных */}
            {marketData.length > 0 && (
              hasDuplicateDates ? (
                <div className="mt-2 p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-200">
                  <div className="text-sm font-semibold">High-Risk ALERT: обнаружены дубли дат</div>
                  <div className="text-xs mt-1 break-words">{duplicateDateKeys.join(', ')}</div>
                </div>
              ) : (
                <div className="mt-2 p-2 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-200">
                  Дублей дат не обнаружено
                </div>
              )
            )}
            {!isTrading ? (
              <div className="text-sm text-gray-500 mt-2">Показываем в торговые часы (NYSE): 09:30–16:00 ET</div>
            ) : (
              <>
                {quoteError && <div className="text-sm text-red-600 mt-2">{quoteError}</div>}
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                    <div className="text-xs text-gray-500 dark:text-gray-300">Open</div>
                    <div className="font-mono text-lg">{quote?.open ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                    <div className="text-xs text-gray-500 dark:text-gray-300">High</div>
                    <div className="font-mono text-lg">{quote?.high ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                    <div className="text-xs text-gray-500 dark:text-gray-300">Low</div>
                    <div className="font-mono text-lg">{quote?.low ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                    <div className="text-xs text-gray-500 dark:text-gray-300">Current</div>
                    <div className="font-mono text-lg">{quote?.current ?? '—'}</div>
                  </div>
                </div>
                {quoteLoading && <div className="text-xs text-gray-400 mt-1">загрузка…</div>}
              </>
            )}
            {marketData.length > 0 && (() => {
              const fmt = (d: Date) => {
                // Отображаем дату как YYYY-MM-DD из ISO (без сдвига часового пояса)
                const ymd = new Date(d).toISOString().slice(0, 10);
                const [y, m, dd] = ymd.split('-');
                return `${dd}.${m}.${y}`;
              };
              return (
                <div className="text-xs text-gray-500 mt-1">
                  Период данных: {fmt(marketData[0].date)} — {fmt(marketData[marketData.length - 1].date)}
                </div>
              );
            })()}
          </div>
          <div className="w-full h-[320px] lg:h-[420px] rounded-lg border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800">
            <MiniQuoteChart 
              history={marketData.slice(-10)}
              today={quote}
              trades={backtestResults?.trades || []}
              highIBS={Number(currentStrategy?.parameters?.highIBS ?? 0.75)}
              isOpenPosition={(() => {
                const trades = backtestResults?.trades || [];
                const lastTrade = trades[trades.length - 1];
                const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
                return !!(lastTrade && lastTrade.exitReason === 'end_of_data' && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
              })()}
              entryPrice={(() => {
                const trades = backtestResults?.trades || [];
                const lastTrade = trades[trades.length - 1];
                const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
                const isOpen = !!(lastTrade && lastTrade.exitReason === 'end_of_data' && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
                return isOpen ? lastTrade?.entryPrice ?? null : null;
              })()}
            />
          </div>
          {/* Блок сплитов */}
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-200">
            <div className="font-semibold mb-1">Сплиты</div>
            {/* Ошибки получения сплитов скрываем, так как источник всегда локальный */}
            {currentSplits && currentSplits.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {currentSplits.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded border bg-gray-50 text-xs dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">
                    {String(s.date).slice(0,10)} × {s.factor}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400">Нет сплитов</div>
            )}
            <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">Цены на графиках и в бэктесте скорректированы back-adjust по сплитам.</div>
          </div>
          {/* Управление наблюдением перенесено в иконку сердца рядом с тикером */}
          <InfoModal
            open={!!modal.type}
            kind={modal.type === 'error' ? 'error' : 'info'}
            title={modal.title || ''}
            message={modal.message || ''}
            onClose={() => setModal({ type: null })}
          />
        </div>
      </div>

      {/* Информация об открытой позиции и целевой цене закрытия сегодня */}
      <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Состояние позиции</h3>
          {(() => {
            const trades = backtestResults?.trades || [];
            const lastTrade = trades[trades.length - 1];
            const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
            const isOpen = !!(lastTrade && lastTrade.exitReason === 'end_of_data' && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
            return (
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${isOpen ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40' : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                {isOpen ? 'Открыта' : 'Нет позиции'}
              </span>
            );
          })()}
        </div>
        {(() => {
          const trades = backtestResults?.trades || [];
          const lastTrade = trades[trades.length - 1];
          const lastDataDate = marketData.length ? marketData[marketData.length - 1].date : null;
          const isOpen = !!(lastTrade && lastTrade.exitReason === 'end_of_data' && lastDataDate && new Date(lastTrade.exitDate).getTime() === new Date(lastDataDate).getTime());
          if (!isOpen) {
            return <div className="text-sm text-gray-600 dark:text-gray-300">Открытой позиции нет.</div>;
          }
          const highIBS = Number(currentStrategy?.parameters?.highIBS ?? 0.75);
          const L = quote?.low ?? null;
          const H = quote?.high ?? null;
          let targetClose: number | null = null;
          if (L != null && H != null && H > L) {
            targetClose = L + highIBS * (H - L);
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-gray-500 dark:text-gray-300">Вход</div>
                <div className="font-mono">${lastTrade?.entryPrice?.toFixed?.(2) ?? '—'}</div>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-gray-500 dark:text-gray-300">Цель IBS ({highIBS})</div>
                <div className="font-mono">{targetClose != null ? `$${targetClose.toFixed(2)}` : '—'}</div>
              </div>
              <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100">
                <div className="text-gray-500 dark:text-gray-300">Состояние</div>
                <div className="font-medium">{isTrading ? 'Торговая сессия' : 'Вне сессии'}</div>
              </div>
            </div>
          );
        })()}
      </div>
      {/* Удалён блок заголовка Backtest Results и кнопки повторного запуска */}

      {/* Strategy Parameters - КРУПНО И ЧЕТКО */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6 dark:bg-blue-950/20 dark:border-blue-900/40">
        <h3 className="text-xl font-bold text-blue-900 mb-4 text-center dark:text-blue-200">
          🔧 ПАРАМЕТРЫ СТРАТЕГИИ
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center bg-white rounded-lg p-4 border-2 border-blue-300 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
            <div className="text-3xl font-bold text-blue-600 mb-2 dark:text-blue-300">
              {currentStrategy?.parameters?.lowIBS || 'N/A'}
            </div>
            <div className="text-lg font-semibold text-gray-700 dark:text-gray-200">Low IBS Entry</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Вход когда IBS &lt; этого значения</div>
          </div>
          <div className="text-center bg-white rounded-lg p-4 border-2 border-blue-300 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
            <div className="text-3xl font-bold text-blue-600 mb-2 dark:text-blue-300">
              {currentStrategy?.parameters?.highIBS || 'N/A'}
            </div>
            <div className="text-lg font-semibold text-gray-700 dark:text-gray-200">High IBS Exit</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Выход когда IBS &gt; этого значения</div>
          </div>
          <div className="text-center bg-white rounded-lg p-4 border-2 border-blue-300 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
            <div className="text-3xl font-bold text-blue-600 mb-2 dark:text-blue-300">
              {currentStrategy?.parameters?.maxHoldDays || currentStrategy?.riskManagement?.maxHoldDays || 'N/A'}
            </div>
            <div className="text-lg font-semibold text-gray-700 dark:text-gray-200">Max Hold Days</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Принудительный выход через дней</div>
          </div>
        </div>
        <div className="mt-4 text-center">
          <div className="text-lg font-semibold text-gray-700 dark:text-gray-200">
            Логика: Вход при IBS &lt; {currentStrategy?.parameters?.lowIBS}, 
            Выход при IBS &gt; {currentStrategy?.parameters?.highIBS} или через {currentStrategy?.parameters?.maxHoldDays || currentStrategy?.riskManagement?.maxHoldDays} дней
          </div>
          <div className="text-md text-blue-600 mt-2 dark:text-blue-300">
            💰 Использование капитала: {currentStrategy?.riskManagement?.capitalUsage || 100}% на сделку
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
        <div className="bg-gray-50 rounded-lg p-6 text-center dark:bg-gray-900 dark:border dark:border-gray-800">
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {metrics.totalReturn.toFixed(1)}%
          </div>
          <div className="text-base text-gray-600 mt-2 dark:text-gray-300">Total Return</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-6 text-center dark:bg-gray-900 dark:border dark:border-gray-800">
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {metrics.maxDrawdown.toFixed(1)}%
          </div>
          <div className="text-base text-gray-600 mt-2 dark:text-gray-300">Max Drawdown</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-6 text-center dark:bg-gray-900 dark:border dark:border-gray-800">
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {metrics.winRate.toFixed(1)}%
          </div>
          <div className="text-base text-gray-600 mt-2 dark:text-gray-300">Win Rate</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-6 text-center dark:bg-gray-900 dark:border dark:border-gray-800">
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            ${equity.length > 0 ? equity[equity.length - 1].value.toFixed(0) : '0'}
          </div>
          <div className="text-base text-gray-600 mt-2 dark:text-gray-300">Final Capital</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-6 text-center dark:bg-gray-900 dark:border dark:border-gray-800">
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {trades.length}
          </div>
          <div className="text-base text-gray-600 mt-2 dark:text-gray-300">Total Trades</div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="bg-gray-50 rounded-lg p-4 dark:bg-gray-900 dark:border dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 mb-4 dark:text-gray-100">
          Detailed Metrics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-300">CAGR:</span>
            <span className="ml-2 font-medium dark:text-gray-100">{metrics.cagr.toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Sharpe Ratio:</span>
            <span className="ml-2 font-medium dark:text-gray-100">{metrics.sharpeRatio.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Profit Factor:</span>
            <span className="ml-2 font-medium dark:text-gray-100">{metrics.profitFactor.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Avg Win:</span>
            <span className="ml-2 font-medium dark:text-gray-100">${metrics.averageWin.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Avg Loss:</span>
            <span className="ml-2 font-medium dark:text-gray-100">${metrics.averageLoss.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Sortino Ratio:</span>
            <span className="ml-2 font-medium dark:text-gray-100">{metrics.sortinoRatio.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Charts Section - на всю ширину */}
      <div className="space-y-6">
        {/* Price Chart with Signals */}
        <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 mb-4 dark:text-gray-100">
            Price Chart with Trading Signals
          </h3>
          <div className="h-[80vh]">
            <TradingChart 
              data={marketData} 
              trades={trades}
              chartData={chartData}
              splits={currentSplits}
            />
          </div>
        </div>

        {/* Equity Curve */}
        <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 mb-4 dark:text-gray-100">
            Equity Curve
          </h3>
          <div className="h-[70vh]">
            <EquityChart equity={equity} />
          </div>
        </div>

        {/* Trade-based Drawdown Chart */}
        <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 mb-4 dark:text-gray-100">
            Trade-by-Trade Drawdown Analysis
          </h3>
          <div className="h-[60vh]">
            <TradeDrawdownChart 
              trades={trades} 
              initialCapital={currentStrategy?.riskManagement?.initialCapital || 10000} 
            />
          </div>
        </div>
      </div>

      {/* Trade List */}
      <div className="bg-white rounded-lg border p-4 dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-semibold text-gray-900 mb-4 dark:text-gray-100">
          Trade History ({trades.length} trades)
        </h3>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="w-full text-base border-separate border-spacing-0">
            <thead className="bg-gray-50 sticky top-0 z-20 dark:bg-gray-900/80">
              <tr>
                <th className="sticky top-0 text-left p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">#</th>
                <th className="sticky top-0 text-left p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Entry Date</th>
                <th className="sticky top-0 text-left p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Exit Date</th>
                <th className="sticky top-0 text-left p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Duration</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Qty</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Entry Price</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Exit Price</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Investment</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">P&L</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Return %</th>
                <th className="sticky top-0 text-right p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Current Capital</th>
                <th className="sticky top-0 text-left p-4 font-semibold text-gray-700 bg-gray-50 text-base shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:text-gray-200 dark:bg-gray-900/80">Exit Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {trades.map((trade, index: number) => {
                const investment = trade.context?.initialInvestment || (trade.quantity * trade.entryPrice);
                return (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="p-4 text-gray-600 text-base dark:text-gray-300">{index + 1}</td>
                    <td className="p-4 text-base">{new Date(trade.entryDate).toLocaleDateString('ru-RU', { timeZone: 'America/New_York' })}</td>
                    <td className="p-4 text-base">{new Date(trade.exitDate).toLocaleDateString('ru-RU', { timeZone: 'America/New_York' })}</td>
                    <td className="p-4 text-base">{trade.duration} дней</td>
                    <td className="p-4 text-right font-mono text-base">{trade.quantity}</td>
                    <td className="p-4 text-right font-mono text-base">${trade.entryPrice.toFixed(2)}</td>
                    <td className="p-4 text-right font-mono text-base">${trade.exitPrice.toFixed(2)}</td>
                    <td className="p-4 text-right font-mono text-base">${investment.toFixed(2)}</td>
                    <td className={`p-4 text-right font-mono font-medium text-base ${
                      trade.pnl > 0 ? 'text-green-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
                    }`}>
                      ${trade.pnl.toFixed(2)}
                    </td>
                    <td className={`p-4 text-right font-mono font-medium text-base ${
                      trade.pnlPercent > 0 ? 'text-green-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
                    }`}>
                      {trade.pnlPercent.toFixed(2)}%
                    </td>
                    <td className="p-4 text-right font-mono text-base">
                      ${trade.context?.currentCapitalAfterExit?.toFixed(2) || 'N/A'}
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-300">
                      <span className={`px-3 py-2 rounded text-sm ${
                        trade.exitReason === 'stop_loss' ? 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-200' :
                        trade.exitReason === 'take_profit' ? 'bg-green-100 text-green-800 dark:bg-emerald-950/30 dark:text-emerald-200' :
                        trade.exitReason === 'ibs_signal' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200' :
                        trade.exitReason === 'signal' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200' :
                        trade.exitReason === 'max_hold_days' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-200' :
                        trade.exitReason === 'time_limit' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200' :
                        trade.exitReason === 'end_of_data' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}>
                        {trade.exitReason === 'ibs_signal' ? (() => {
                          const ibs = trade.context?.indicatorValues?.IBS;
                          const ibsPct = typeof ibs === 'number' ? (ibs * 100).toFixed(2) + '%' : '';
                          return `IBS (${ibsPct})`;
                        })() :
                         trade.exitReason === 'signal' ? 'Strategy Signal' :
                         trade.exitReason === 'max_hold_days' ? 'Max Hold Days' :
                         trade.exitReason === 'time_limit' ? 'Time Limit' :
                         trade.exitReason === 'end_of_data' ? 'End of Data' :
                         trade.exitReason === 'stop_loss' ? 'Stop Loss' :
                         trade.exitReason === 'take_profit' ? 'Take Profit' :
                         trade.exitReason || 'Unknown'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {trades.length > 0 && (
              <tfoot className="bg-gray-100 border-t-2 border-gray-300 dark:bg-gray-900 dark:border-gray-800">
                <tr className="font-bold text-base">
                  <td className="p-4 text-gray-700" colSpan={8}>ИТОГО ({trades.length} сделок)</td>
                  <td className={`p-4 text-right font-mono font-bold text-lg ${
                    trades.reduce((sum: number, t) => sum + t.pnl, 0) > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ${trades.reduce((sum: number, t) => sum + t.pnl, 0).toFixed(2)}
                  </td>
                  <td className={`p-4 text-right font-mono font-bold text-lg ${
                    metrics.totalReturn > 0 ? 'text-green-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
                  }`}>
                    {metrics.totalReturn.toFixed(2)}%
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-lg">
                    ${equity.length > 0 ? equity[equity.length - 1].value.toFixed(2) : '0'}
                  </td>
                  <td className="p-4">-</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {trades.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Нет сделок для отображения
          </div>
        )}
      </div>
    </div>
  );
}