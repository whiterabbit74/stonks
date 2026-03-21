import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, Trash2, ExternalLink, Edit2, Check, X, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle } from 'lucide-react';
import { DatasetAPI } from '../lib/api';
import { ConfirmModal } from './ConfirmModal';
import { InfoModal } from './InfoModal';
import { useAppStore } from '../stores';
import { Link } from 'react-router-dom';
import type { MonitorTradeHistoryResponse, MonitorTradeRecord, EquityPoint } from '../types';
import { MonitorTradeHistoryPanel } from './MonitorTradeHistoryPanel';
import { calculateMonitorTradeMetrics } from '../lib/monitor-trade-metrics';
import { formatCurrencyUSD } from '../lib/formatters';
import { AnalysisTabs, ChartContainer, PageHeader } from './ui';
import { EquityChart } from './EquityChart';

interface WatchItem {
  symbol: string;
  highIBS: number;
  lowIBS?: number;
  entryPrice: number | null;
  entryDate: string | null;
  entryIBS: number | null;
  entryDecisionTime: string | null;
  currentTradeId: string | null;
  isOpenPosition: boolean;
}

type WatchTab = 'summary' | 'trades' | 'tickers';

const WATCH_TAB_ITEMS: Array<{ id: WatchTab; label: string }> = [
  { id: 'summary', label: 'Сводка' },
  { id: 'trades', label: 'Сделки' },
  { id: 'tickers', label: 'Тикеры' },
];

const MONITOR_MARGIN_OPTIONS = [100, 125, 150, 175, 200] as const;

function normalizeMonitorMarginPercent(value: number): number {
  const normalized = Number.isFinite(value) ? Math.round(value) : 100;
  return MONITOR_MARGIN_OPTIONS.includes(normalized as typeof MONITOR_MARGIN_OPTIONS[number]) ? normalized : 100;
}

function getMonitorTradeSortKey(trade: MonitorTradeRecord): string {
  return trade.exitDecisionTime || trade.exitDate || trade.entryDecisionTime || trade.entryDate || '';
}

function getMonitorTradePointDate(trade: MonitorTradeRecord): string {
  return trade.exitDate || trade.exitDecisionTime || trade.entryDate || trade.entryDecisionTime || new Date().toISOString().slice(0, 10);
}

function buildMonitorBalanceEquity(trades: MonitorTradeRecord[], initialCapital = 10000): EquityPoint[] {
  const normalizedInitial = Number.isFinite(initialCapital) && initialCapital > 0 ? initialCapital : 10000;
  const closedTrades = trades
    .filter((trade) => trade.status === 'closed' && typeof trade.pnlPercent === 'number' && Number.isFinite(trade.pnlPercent))
    .slice()
    .sort((a, b) => getMonitorTradeSortKey(a).localeCompare(getMonitorTradeSortKey(b)));

  if (closedTrades.length === 0) {
    return [];
  }

  let balance = normalizedInitial;
  let peak = normalizedInitial;
  const points: EquityPoint[] = [{ date: getMonitorTradePointDate(closedTrades[0]), value: normalizedInitial, drawdown: 0 }];

  for (const trade of closedTrades) {
    const pct = trade.pnlPercent ?? 0;
    balance *= 1 + pct / 100;
    if (balance > peak) peak = balance;
    const drawdown = peak > 0 ? ((peak - balance) / peak) * 100 : 0;
    points.push({
      date: getMonitorTradePointDate(trade),
      value: balance,
      drawdown,
    });
  }

  return points;
}

function applyMonitorMarginSimulation(trades: MonitorTradeRecord[], marginPercent: number): MonitorTradeRecord[] {
  const leverage = Math.max(1, marginPercent / 100);
  if (leverage === 1) return trades;

  return trades.map((trade) => {
    if (trade.status !== 'closed') return trade;
    if (typeof trade.pnlPercent !== 'number' || !Number.isFinite(trade.pnlPercent)) return trade;

    const simulatedPnlPct = Math.max(-100, trade.pnlPercent * leverage);
    return {
      ...trade,
      pnlPercent: simulatedPnlPct,
      pnlAbsolute: typeof trade.pnlAbsolute === 'number' && Number.isFinite(trade.pnlAbsolute)
        ? trade.pnlAbsolute * leverage
        : trade.pnlAbsolute,
    };
  });
}

export function TelegramWatches() {
  const [watches, setWatches] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Тест уведомлений удалён
  const [confirm, setConfirm] = useState<{ open: boolean; symbol: string | null }>(() => ({ open: false, symbol: null }));
  const [info, setInfo] = useState<{ open: boolean; title: string; message: string; kind?: 'success' | 'error' | 'info' }>({ open: false, title: '', message: '' });
  const [secondsToNext, setSecondsToNext] = useState<number | null>(null);
  const [editingPrice, setEditingPrice] = useState<{ symbol: string; value: string } | null>(null);
  const [tradeHistory, setTradeHistory] = useState<MonitorTradeHistoryResponse | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<WatchTab>('summary');
  const [sortConfig, setSortConfig] = useState<{ key: keyof WatchItem | null; direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [monitorMarginPercent, setMonitorMarginPercent] = useState<number>(() => {
    if (typeof window === 'undefined') return 100;
    return normalizeMonitorMarginPercent(Number(window.localStorage.getItem('monitor.marginPercent') || 100));
  });
  const [showMarginHelp, setShowMarginHelp] = useState(false);
  const watchThresholdPct = useAppStore(s => s.watchThresholdPct);
  const currentStrategy = useAppStore(s => s.currentStrategy);
  const initialCapital = Number(currentStrategy?.riskManagement?.initialCapital ?? 10000);

  // Reusable Intl formatters
  const ET_PARTS_FMT = useMemo(() => new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }), []);

  // Sorting logic
  const sortedWatches = useMemo(() => {
    if (!sortConfig.key) return watches;
    return [...watches].sort((a, b) => {
      const aVal = a[sortConfig.key!];
      const bVal = b[sortConfig.key!];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [watches, sortConfig]);

  const handleSort = (key: keyof WatchItem) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: keyof WatchItem }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const secondsUntilNextSignal = useCallback((now: Date = new Date()): number => {
    // getETParts function is defined outside or inside the component but it is used here.
    // The warning says useCallback has a missing dependency: 'getETParts'.
    // If getETParts is defined inside the component, it should be wrapped in useCallback or moved outside.
    // It is defined as a function inside the component.
    // I will move `getETParts` inside `secondsUntilNextSignal` or define it outside component.
    // Actually, `getETParts` uses `ET_PARTS_FMT` which is defined inside the component but it is a const.
    // Wait, `ET_PARTS_FMT` is defined inside the component.
    // I should move `ET_PARTS_FMT` and `getETParts` outside the component or use useMemo/useCallback.

    // For now, I'll just redefine getETParts here or use the one from scope if I wrap it.
    // But better to fix the dependency.

    function getETPartsInner(date: Date): { y: number; m: number; d: number; hh: number; mm: number; ss: number; weekday: number } {
        const parts = ET_PARTS_FMT.formatToParts(date);
        const map: Record<string, string> = {};
        for (const p of parts) map[p.type] = p.value;
        const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        return {
          y: Number(map.year),
          m: Number(map.month),
          d: Number(map.day),
          hh: Number(map.hour),
          mm: Number(map.minute),
          ss: Number(map.second),
          weekday: wdMap[map.weekday] ?? 0,
        };
    }

    const p = getETPartsInner(now);
    const secOfDay = p.hh * 3600 + p.mm * 60 + p.ss;

    // Для упрощения используем обычные часы торгов: 9:30-16:00, короткие дни: 9:30-13:00
    // В реальности должен загружаться календарь торгов, но для данной задачи используем стандартное время
    const isNormalDay = true; // В реальности нужно проверить календарь
    const closeHour = isNormalDay ? 16 : 13;
    const closeMin = closeHour * 60; // в минутах от начала дня

    const target1 = (closeMin - 11) * 60; // 11 минут до закрытия в секундах
    const target2 = (closeMin - 1) * 60;  // 1 минута до закрытия в секундах
    const isWeekday = p.weekday >= 1 && p.weekday <= 5;

    if (isWeekday) {
      if (secOfDay < target1) return target1 - secOfDay;
      if (secOfDay < target2) return target2 - secOfDay;
    }

    // Roll to next weekday
    let daysToAdd = 1;
    let wd = p.weekday;
    let attempts = 0;
    const maxAttempts = 7; // Safety limit for weekday search

    while (attempts < maxAttempts) {
      wd = (wd + 1) % 7;
      if (wd >= 1 && wd <= 5) break;
      daysToAdd++;
      attempts++;
    }

    // If no weekday found within 7 attempts, fallback to Monday (1)
    if (attempts >= maxAttempts) {
      console.warn('Could not find next weekday, using Monday as fallback');
      daysToAdd = 1;
    }
    const remainingToday = 24 * 3600 - secOfDay;
    const extraFullDays = daysToAdd - 1;
    return remainingToday + extraFullDays * 24 * 3600 + target1;
  }, [ET_PARTS_FMT]);

  function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    // Compact format: 1д 2ч 34м 56с
    if (days > 0) return `${days}д ${hours}ч ${minutes}м`;
    if (hours > 0) return `${hours}ч ${minutes}м ${secs}с`;
    return `${minutes}м ${secs}с`;
  }

  const loadTrades = useCallback(async () => {
    setTradesLoading(true);
    setTradesError(null);
    try {
      const history = await DatasetAPI.getMonitorTradeHistory();
      setTradeHistory(history);
    } catch (e) {
      setTradesError(e instanceof Error ? e.message : 'Не удалось загрузить историю сделок');
    } finally {
      setTradesLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await DatasetAPI.listTelegramWatches();
      const mapped = list.map((w: unknown) => {
        const watch = w as Record<string, unknown>;
        const item: WatchItem = {
          symbol: watch.symbol as string,
          highIBS: watch.highIBS as number,
          lowIBS: (watch.lowIBS as number | undefined) ?? 0.1,
          entryPrice: (watch.entryPrice as number | null | undefined) ?? null,
          entryDate: (watch.entryDate as string | undefined) ?? null,
          entryIBS: typeof watch.entryIBS === 'number' ? watch.entryIBS : null,
          entryDecisionTime: (watch.entryDecisionTime as string | undefined) ?? null,
          currentTradeId: (watch.currentTradeId as string | undefined) ?? null,
          isOpenPosition: !!watch.isOpenPosition
        };
        return item;
      });
      setWatches(mapped);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось загрузить список';
      setError(message);
    } finally {
      setLoading(false);
    }
    await loadTrades();
  }, [loadTrades]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const tick = () => setSecondsToNext(secondsUntilNextSignal());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [secondsUntilNextSignal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('monitor.marginPercent', String(monitorMarginPercent));
  }, [monitorMarginPercent]);

  useEffect(() => {
    if (!showMarginHelp) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-monitor-margin-help]')) return;
      setShowMarginHelp(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [showMarginHelp]);

  const simulatedTrades = useMemo(
    () => applyMonitorMarginSimulation(tradeHistory?.trades ?? [], monitorMarginPercent),
    [tradeHistory, monitorMarginPercent]
  );

  const monitorMetrics = useMemo(
    () => calculateMonitorTradeMetrics(simulatedTrades, initialCapital),
    [simulatedTrades, initialCapital]
  );

  const formatSignedPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  const formatSignedMoney = (value: number) => `${value > 0 ? '+' : ''}${formatCurrencyUSD(value)}`;
  const formatHoldingDays = (value: number) => `${value.toFixed(1)} дн.`;
  const hasClosedTrades = monitorMetrics.closedTradesCount > 0;
  const monitorBalanceInitialCapital = initialCapital;
  const monitorBalanceEquity = useMemo(
    () => buildMonitorBalanceEquity(simulatedTrades, monitorBalanceInitialCapital),
    [simulatedTrades, monitorBalanceInitialCapital]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Мониторинг"
        subtitle="Отслеживание позиций и уведомления в Telegram"
        actions={
          <button
            onClick={load}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            title="Обновить список"
            aria-label="Обновить список"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        }
      />

      {typeof watchThresholdPct === 'number' && (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Глобальный порог уведомлений: {watchThresholdPct}% <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(применяется ко всем отслеживаемым акциям)</span>
        </div>
      )}

      {typeof secondsToNext === 'number' && (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          До следующего подсчёта сигналов: {formatDuration(secondsToNext)}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Результат по совершенным сделкам</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            База расчета: {formatCurrencyUSD(monitorMetrics.initialCapital)}
          </span>
        </div>

        {hasClosedTrades ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className="text-2xl font-bold text-green-600 dark:text-emerald-300">{formatCurrencyUSD(monitorMetrics.finalBalance)}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Итоговый баланс</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className={`text-2xl font-bold ${monitorMetrics.totalReturnPct > 0 ? 'text-emerald-600 dark:text-emerald-300' : monitorMetrics.totalReturnPct < 0 ? 'text-orange-600 dark:text-orange-300' : 'text-gray-700 dark:text-gray-200'}`}>
                  {formatSignedPercent(monitorMetrics.totalReturnPct)}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Общая доходность</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className="text-xl font-bold text-red-600 dark:text-red-300">{monitorMetrics.maxDrawdownPct.toFixed(2)}%</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Макс. просадка</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-300">{monitorMetrics.winRatePct.toFixed(1)}%</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Win Rate</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className="text-xl font-bold text-indigo-600 dark:text-indigo-300">{monitorMetrics.closedTradesCount}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Закрытых сделок</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className={`text-xl font-bold ${monitorMetrics.avgReturnPct > 0 ? 'text-emerald-600 dark:text-emerald-300' : monitorMetrics.avgReturnPct < 0 ? 'text-orange-600 dark:text-orange-300' : 'text-gray-700 dark:text-gray-200'}`}>
                  {formatSignedPercent(monitorMetrics.avgReturnPct)}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Средняя сделка</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className="text-xl font-bold text-violet-600 dark:text-violet-300">
                  {formatHoldingDays(monitorMetrics.avgHoldingDays)}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Средняя длительность</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className={`text-xl font-bold ${monitorMetrics.netProfit > 0 ? 'text-emerald-600 dark:text-emerald-300' : monitorMetrics.netProfit < 0 ? 'text-orange-600 dark:text-orange-300' : 'text-gray-700 dark:text-gray-200'}`}>
                  {formatSignedMoney(monitorMetrics.netProfit)}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Чистая прибыль</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-800">
                <div className="text-xl font-bold text-teal-600 dark:text-teal-300">
                  {Number.isFinite(monitorMetrics.profitFactor) ? monitorMetrics.profitFactor.toFixed(2) : '∞'}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Profit Factor</div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-600 dark:text-gray-400">Маржинальность</div>
                  <div className="relative" data-monitor-margin-help>
                    <button
                      type="button"
                      onClick={() => setShowMarginHelp((prev) => !prev)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      title="Пояснение по симуляции маржи"
                      aria-label="Пояснение по симуляции маржи"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                    {showMarginHelp && (
                      <div className="absolute right-0 top-full z-10 mt-1.5 w-52 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700 shadow-lg dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        Коэффициент применяем к доходности каждой закрытой сделки. 100% = без маржи, 200% = 2x.
                      </div>
                    )}
                  </div>
                </div>
                <select
                  value={monitorMarginPercent}
                  onChange={(e) => setMonitorMarginPercent(normalizeMonitorMarginPercent(Number(e.target.value)))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  aria-label="Маржинальность мониторинга"
                >
                  {MONITOR_MARGIN_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}%
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300">
            Пока нет закрытых сделок. Метрики появятся после первого завершенного трейда.
          </div>
        )}
      </section>

      <AnalysisTabs
        tabs={WATCH_TAB_ITEMS}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as WatchTab)}
      />

      {activeTab === 'summary' && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <ChartContainer
            title={`Баланс мониторинга (старт ${formatCurrencyUSD(monitorBalanceInitialCapital)})`}
            isEmpty={!tradesLoading && !tradesError && monitorBalanceEquity.length === 0}
            emptyMessage="Нет закрытых сделок для построения кривой баланса."
            height={560}
          >
            {tradesLoading ? (
              <div className="flex h-[560px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">Загрузка истории сделок…</div>
            ) : tradesError ? (
              <div className="flex h-[560px] items-center justify-center text-sm text-red-600 dark:text-red-400">{tradesError}</div>
            ) : (
              <EquityChart
                equity={monitorBalanceEquity}
                primaryLabel={`Мониторинг (старт ${formatCurrencyUSD(monitorBalanceInitialCapital)})`}
                hideHeader={false}
              />
            )}
          </ChartContainer>
        </section>
      )}

      {activeTab === 'trades' && (
        <MonitorTradeHistoryPanel
          data={tradeHistory}
          loading={tradesLoading}
          error={tradesError}
          onRefresh={loadTrades}
          initialCapital={initialCapital}
        />
      )}

      {activeTab === 'tickers' && (
        <>
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Загрузка…</div>
          ) : error ? (
            <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
          ) : watches.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Нет активных наблюдений. Включите мониторинг на вкладке «Результаты».</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="text-left p-3 dark:text-gray-100">
                      <button onClick={() => handleSort('symbol')} className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400">
                        Тикер <SortIcon columnKey="symbol" />
                      </button>
                    </th>
                    <th className="text-left p-3 dark:text-gray-100">
                      <button onClick={() => handleSort('lowIBS')} className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400">
                        IBS вход <SortIcon columnKey="lowIBS" />
                      </button>
                    </th>
                    <th className="text-left p-3 dark:text-gray-100">
                      <button onClick={() => handleSort('highIBS')} className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400">
                        IBS выход <SortIcon columnKey="highIBS" />
                      </button>
                    </th>
                    <th className="text-left p-3 dark:text-gray-100">
                      <button onClick={() => handleSort('entryPrice')} className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400">
                        Цена входа <SortIcon columnKey="entryPrice" />
                      </button>
                    </th>
                    <th className="text-left p-3 dark:text-gray-100">
                      <button onClick={() => handleSort('isOpenPosition')} className="inline-flex items-center hover:text-blue-600 dark:hover:text-blue-400">
                        Позиция <SortIcon columnKey="isOpenPosition" />
                      </button>
                    </th>
                    <th className="text-left p-3 dark:text-gray-100">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {sortedWatches.map(w => (
                    <tr key={w.symbol} className="group hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-3">
                        <Link
                          to={`/stocks?tickers=${encodeURIComponent(w.symbol)}`}
                          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                          title={`Перейти к результатам для ${w.symbol}`}
                        >
                          {w.symbol}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="p-3 dark:text-gray-300">≤ {(w.lowIBS ?? 0.1).toFixed(2)}</td>
                      <td className="p-3 dark:text-gray-300">≥ {w.highIBS.toFixed(2)}</td>
                      <td className="p-3">
                        {editingPrice?.symbol === w.symbol ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              value={editingPrice.value}
                              onChange={(e) => setEditingPrice({ symbol: w.symbol, value: e.target.value })}
                              className="w-20 px-2 py-1 text-xs border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  const price = parseFloat(editingPrice.value);
                                  if (!isNaN(price) && price >= 0) {
                                    try {
                                      await DatasetAPI.updateTelegramWatch(w.symbol, {
                                        entryPrice: price > 0 ? price : null
                                      });
                                      await load();
                                      setEditingPrice(null);
                                    } catch (e) {
                                      setError(e instanceof Error ? e.message : 'Не удалось обновить цену');
                                    }
                                  }
                                }
                                if (e.key === 'Escape') {
                                  setEditingPrice(null);
                                }
                              }}
                              autoFocus
                            />
                            <button
                              onClick={async () => {
                                const price = parseFloat(editingPrice.value);
                                if (!isNaN(price) && price >= 0) {
                                  try {
                                    await DatasetAPI.updateTelegramWatch(w.symbol, {
                                      entryPrice: price > 0 ? price : null
                                    });
                                    await load();
                                    setEditingPrice(null);
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : 'Не удалось обновить цену');
                                  }
                                }
                              }}
                              className="p-1 text-green-600 hover:text-green-800"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingPrice(null)}
                              className="p-1 text-gray-600 hover:text-gray-800"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="dark:text-gray-300">
                              {w.entryPrice != null ? `$${w.entryPrice.toFixed(2)}` : '—'}
                            </span>
                            <button
                              onClick={() => setEditingPrice({
                                symbol: w.symbol,
                                value: w.entryPrice?.toString() || ''
                              })}
                              className="p-1 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 transition-colors"
                              title="Редактировать цену входа"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${w.isOpenPosition ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' : 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                          {w.isOpenPosition ? 'Открыта' : 'Нет'}
                        </span>
                        {w.isOpenPosition && (
                          <div className="text-xs text-gray-500 mt-1" title="Позиция автоматически определяется по цене входа">
                            {w.entryDate || '—'}
                            {typeof w.entryIBS === 'number' ? ` • IBS ${(w.entryIBS * 100).toFixed(1)}%` : ''}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => setConfirm({ open: true, symbol: w.symbol })}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-red-900/30"
                          title="Удалить из мониторинга"
                          aria-label="Удалить из мониторинга"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Bottom-right test buttons */}
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  onClick={async () => {
                    try {
                      const r = await DatasetAPI.simulateTelegram('overview');
                      setInfo({ open: true, title: 'Тест отправки (T-11)', message: r.success ? 'Сообщение отправлено (T-11, TEST)' : 'Отправка не произошла', kind: r.success ? 'success' : 'error' });
                    } catch (e) {
                      setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось выполнить тест', kind: 'error' });
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Тест уведомления за 11 минут до закрытия рынка (обзор IBS)"
                >
                  Тест T-11
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await DatasetAPI.simulateTelegram('confirmations');
                      setInfo({ open: true, title: 'Тест отправки (T-2)', message: r.success ? 'Сообщение отправлено (T-2, TEST)' : 'Отправка не произошла', kind: r.success ? 'success' : 'error' });
                    } catch (e) {
                      setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось выполнить тест', kind: 'error' });
                    }
                  }}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title="Тест уведомления за 2 минуты до закрытия рынка (подтверждение сигналов)"
                >
                  Тест T-2
                </button>
                <button
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const response = await fetch('/api/telegram/update-all', {
                        method: 'POST',
                        credentials: 'include'
                      });
                      const r = await response.json();

                      if (r.success) {
                        let pricesMessage = '';
                        if (r.prices.hasProblems) {
                          pricesMessage = `⚠️ Цены: ${r.prices.count}/${r.prices.totalTickers} обновлены с данными за сегодня`;
                          if (r.prices.tickersWithoutTodayData?.length) {
                            pricesMessage += `. Без данных за сегодня: ${r.prices.tickersWithoutTodayData.length}`;
                          }
                          if (r.prices.failedTickers?.length) {
                            pricesMessage += `. Ошибки: ${r.prices.failedTickers.length}`;
                          }
                        } else if (r.prices.updated) {
                          pricesMessage = `✅ Цены: обновлено ${r.prices.count} тикеров${r.prices.tickers?.length ? ` (${r.prices.tickers.join(', ')})` : ''}`;
                        } else {
                          // Check if server provided timing information
                          if (r.prices.reason === 'wrong_timing') {
                            pricesMessage = `⏰ Цены: скрипт не запускался (${r.prices.currentTime || 'неизвестно'}, нужно: ${r.prices.targetRunTime || '16:16 ET'})`;
                          } else if (r.prices.reason === 'not_trading_day') {
                            pricesMessage = `📅 Цены: не торговый день, скрипт не запускался`;
                          } else if (r.prices.reason === 'disabled_by_settings') {
                            pricesMessage = '⏸️ Цены: автоактуализация после закрытия рынка выключена в настройках';
                          } else {
                            pricesMessage = `ℹ️ Цены: обновления не требуются`;
                          }
                        }

                        const changesCount = r.positions.changes?.length || 0;
                        const changesList = r.positions.changes?.map((c: any) =>
                          `${c.symbol}: ${c.changeType === 'opened' ? 'открыта' : 'закрыта'} ${c.entryPrice ? `($${c.entryPrice.toFixed(2)})` : ''}`
                        ).join(', ') || '';

                        const positionsMessage = changesCount > 0
                          ? `Позиции: обновлено ${r.positions.updated}, изменений: ${changesCount}. ${changesList}`
                          : `Позиции: обновлено ${r.positions.updated}, изменений нет`;

                        const message = `${pricesMessage}. ${positionsMessage}`;
                        const kind = r.prices.hasProblems ? 'error' : 'success';
                        setInfo({ open: true, title: 'Обновление цен и позиций', message, kind });
                        await load(); // Перезагружаем список
                      } else {
                        setInfo({ open: true, title: 'Ошибка', message: 'Не удалось обновить данные', kind: 'error' });
                      }
                    } catch (e) {
                      setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось обновить данные', kind: 'error' });
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="inline-flex items-center px-3 py-2 rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={loading}
                >
                  {loading ? 'Обновление...' : 'Обновить цены и позиции'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirm.open}
        title="Удалить из мониторинга?"
        message={confirm.symbol ? `Тикер ${confirm.symbol} будет удалён из мониторинга.` : ''}
        confirmText="Удалить"
        cancelText="Отмена"
        onConfirm={async () => {
          if (!confirm.symbol) return;
          try { await DatasetAPI.deleteTelegramWatch(confirm.symbol); await load(); setInfo({ open: true, title: 'Удалено', message: `Тикер ${confirm.symbol} удалён из мониторинга`, kind: 'success' }); }
          catch (e) { setInfo({ open: true, title: 'Ошибка', message: e instanceof Error ? e.message : 'Не удалось удалить', kind: 'error' }); }
          finally { setConfirm({ open: false, symbol: null }); }
        }}
        onClose={() => setConfirm({ open: false, symbol: null })}
      />
      <InfoModal open={info.open} title={info.title} message={info.message} kind={info.kind} onClose={() => setInfo({ open: false, title: '', message: '' })} />
    </div>
  );
}
