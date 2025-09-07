import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC, formatOHLCYMD, parseOHLCDate } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { EquityChart } from './EquityChart';
import { TradesTable } from './TradesTable';
import { useAppStore } from '../stores';

interface BuyAtClose4SimulatorProps {
  strategy: Strategy | null;
  defaultTickers?: string[];
}

type LoadedDataMap = Record<string, OHLCData[]>;

function formatCurrencyUSD(value: number): string {
  return '$' + Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function loadAdjustedDataset(ticker: string): Promise<OHLCData[]> {
  const ds = await DatasetAPI.getDataset(ticker);
  // If already adjusted on the server, use as-is
  if ((ds as any).adjustedForSplits) {
    return dedupeDailyOHLC(ds.data as unknown as OHLCData[]);
  }
  // Otherwise, apply splits locally
  let splits: Array<{ date: string; factor: number }> = [];
  try { splits = await DatasetAPI.getSplits(ds.ticker); } catch { splits = []; }
  return dedupeDailyOHLC(adjustOHLCForSplits(ds.data as unknown as OHLCData[], splits));
}

export function BuyAtClose4Simulator({ strategy, defaultTickers }: BuyAtClose4SimulatorProps) {
  const savedDatasets = useAppStore((s) => s.savedDatasets);
  const loadDatasetsFromServer = useAppStore((s) => s.loadDatasetsFromServer);

  const [lowIbs, setLowIbs] = useState<string>('0.10');
  const [highIbs, setHighIbs] = useState<string>('0.75');
  const [maxHold, setMaxHold] = useState<string>('30');
  const [tickers, setTickers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('buyAtClose4.tickers');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) return [arr[0] || '', arr[1] || '', arr[2] || '', arr[3] || ''];
      }
    } catch { /* ignore */ }
    const d = (defaultTickers && defaultTickers.length) ? [defaultTickers[0], '', '', ''] : ['', '', '', ''];
    return d.map(v => (v || '').toUpperCase());
  });
  const [margins, setMargins] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('buyAtClose4.margins');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) return [String(arr[0] ?? '100'), String(arr[1] ?? '100'), String(arr[2] ?? '100'), String(arr[3] ?? '100')];
      }
    } catch { /* ignore */ }
    return ['100', '100', '100', '100'];
  });
  const [loaded, setLoaded] = useState<LoadedDataMap>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrades, setShowTrades] = useState<boolean>(false);

  // Sync defaults from strategy
  useEffect(() => {
    if (!strategy) return;
    try {
      const li = Number((strategy.parameters as any)?.lowIBS ?? 0.1);
      const hi = Number((strategy.parameters as any)?.highIBS ?? 0.75);
      const mh = Number(
        typeof (strategy.parameters as any)?.maxHoldDays === 'number'
          ? (strategy.parameters as any)?.maxHoldDays
          : strategy.riskManagement?.maxHoldDays ?? 30
      );
      if (Number.isFinite(li)) setLowIbs(li.toFixed(2));
      if (Number.isFinite(hi)) setHighIbs(hi.toFixed(2));
      if (Number.isFinite(mh)) setMaxHold(String(mh));
    } catch { /* ignore */ }
  }, [strategy]);

  // Ensure datasets list is loaded (for selects)
  useEffect(() => {
    if (!savedDatasets || savedDatasets.length === 0) {
      loadDatasetsFromServer().catch(() => {});
    }
  }, [savedDatasets, loadDatasetsFromServer]);

  // Persist selections
  useEffect(() => {
    try { localStorage.setItem('buyAtClose4.tickers', JSON.stringify(tickers)); } catch { /* ignore */ }
  }, [tickers]);
  useEffect(() => {
    try { localStorage.setItem('buyAtClose4.margins', JSON.stringify(margins)); } catch { /* ignore */ }
  }, [margins]);

  // Load data for selected tickers
  useEffect(() => {
    const unique = Array.from(
      new Set(
        (tickers || [])
          .filter((t): t is string => typeof t === 'string' && t.length > 0)
          .map((t: string) => t.toUpperCase())
      )
    ).slice(0, 4);
    if (unique.length === 0) return;
    let active = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const pairs: Array<[string, OHLCData[]]> = await Promise.all(unique.map(async (t: string) => {
          try {
            const data = await loadAdjustedDataset(t);
            return [t, data] as [string, OHLCData[]];
          } catch (e) {
            return [t, [] as OHLCData[]];
          }
        }));
        if (!active) return;
        const next: LoadedDataMap = {};
        for (const [t, data] of pairs) next[t] = data;
        setLoaded(next);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить данные для выбранных тикеров');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tickers]);

  const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);

  const simulation = useMemo(() => {
    const selectedRaw: string[] = (tickers || []).map((t: string) => (t || '').toUpperCase()).filter(Boolean).slice(0, 4) as string[];
    // Дедуплируем тикеры, чтобы один и тот же тикер не открывался/считался несколько раз
    const selectedUnique: string[] = Array.from(new Set(selectedRaw));
    if (!strategy || selectedUnique.length === 0) {
      return { equity: [] as EquityPoint[], finalValue: 0, maxDrawdown: 0, trades: [] as Trade[] };
    }

    // Prepare data and IBS maps per ticker
    const dataByTicker: Record<string, OHLCData[]> = {};
    const ibsByTicker: Record<string, number[]> = {};
    const indexByDayByTicker: Record<string, Map<string, number>> = {};
    for (const t of selectedUnique) {
      const arr = (loaded[t] || []).slice().sort((a: OHLCData, b: OHLCData) => a.date.getTime() - b.date.getTime());
      dataByTicker[t] = arr;
      if (arr.length) {
        try { ibsByTicker[t] = IndicatorEngine.calculateIBS(arr); } catch { ibsByTicker[t] = new Array(arr.length).fill(NaN); }
      } else {
        ibsByTicker[t] = [];
      }
      const map = new Map<string, number>();
      for (let i = 0; i < arr.length; i++) {
        map.set(formatOHLCYMD(arr[i].date), i);
      }
      indexByDayByTicker[t] = map;
    }

    // Build union of all days
    const daySet = new Set<string>();
    for (const t of selectedUnique) {
      for (const d of (dataByTicker[t] || [])) daySet.add(formatOHLCYMD(d.date));
    }
    const dayKeys = Array.from(daySet.values()).sort();
    if (dayKeys.length === 0) {
      return { equity: [], finalValue: 0, maxDrawdown: 0, trades: [] };
    }

    // Positions and portfolio state
    type Position = {
      ticker: string;
      entryDate: Date;
      entryPrice: number;
      quantity: number;
      borrowedPrincipal: number;
      baseCashUsed: number;
      entryDayIndex: number;
      lastMarkedPrice: number;
    };
    const positions: Record<string, Position | null> = {};
    const trades: Trade[] = [];
    let cash = initialCapital;
    let peak = initialCapital;
    const equitySeries: EquityPoint[] = [];

    const low = Number(lowIbs);
    const high = Number(highIbs);
    const maxHoldDays = Number(maxHold);

    // Карта маржинальности на тикер: берём значение с первого слота этого тикера
    const marginByTicker: Record<string, number> = {};
    for (const t of selectedUnique) {
      const firstIdx = selectedRaw.indexOf(t);
      const pct = Number(margins[firstIdx] || '100');
      marginByTicker[t] = (Number.isFinite(pct) && pct > 0) ? pct : 100;
    }

    // Helper to compute current equity (after marking positions for given dayKey)
    const computeEquity = (): number => {
      let val = cash;
      for (const key of Object.keys(positions)) {
        const p = positions[key as keyof typeof positions];
        if (p) {
          // Equity = Cash + Σ(Position market value)
          // Заемные средства уже учтены в cash при входе в позицию
          val += p.quantity * p.lastMarkedPrice;
        }
      }
      return val;
    };

    // Process each day
    for (let di = 0; di < dayKeys.length; di++) {
      const dayKey = dayKeys[di];
      const dateObj = parseOHLCDate(dayKey);

      // 1) Mark-to-market: update lastMarkedPrice for positions with current close (if bar exists)
      for (const t of selectedUnique) {
        const idx = indexByDayByTicker[t].get(dayKey);
        if (idx != null) {
          const bar = dataByTicker[t][idx];
          if (positions[t]) positions[t] = { ...(positions[t] as Position), lastMarkedPrice: bar.close };
        }
      }

      // 2) Compute exits first, then size new entries against updated equity baseline

      // 3) Exits first
      const exitedToday = new Set<string>();
      for (const t of selectedUnique) {
        const pos = positions[t];
        if (!pos) continue;
        const idx = indexByDayByTicker[t].get(dayKey);
        if (idx == null) continue; // cannot exit without today's bar
        if (di <= pos.entryDayIndex) continue; // do not exit on same day as entry (close execution)
        const bar = dataByTicker[t][idx];
        const ibs = ibsByTicker[t][idx];
        const heldDays = Math.floor((bar.date.getTime() - pos.entryDate.getTime()) / (1000 * 60 * 60 * 24));

        let shouldExit = false;
        let exitReason = '';
        if (!isNaN(ibs) && ibs > high) {
          shouldExit = true; exitReason = 'ibs_signal';
        } else if (heldDays >= maxHoldDays) {
          shouldExit = true; exitReason = 'max_hold_days';
        }
        if (shouldExit) {
          const exitPrice = bar.close;
          const grossProceeds = pos.quantity * exitPrice;
          // Возвращаем заемные средства и получаем чистую прибыль
          const netProceeds = grossProceeds - pos.borrowedPrincipal;
          cash += grossProceeds; // Получаем полную выручку от продажи
          const pnl = netProceeds - pos.baseCashUsed; // PnL = чистая выручка - наши вложения
          const pnlPercent = pos.baseCashUsed > 0 ? (pnl / pos.baseCashUsed) * 100 : 0;
          
          // ВАЖНО: В реальности брокер автоматически возвращает заемные средства
          // Поэтому наш итоговый cash = начальный cash + PnL
          // Но в симуляции мы получаем полную выручку, что правильно для расчета equity

          // Equity after this exit (valuing other positions with current marks)
          const equityAfterExit = (() => {
            let otherValue = cash; // already includes grossProceeds from this exit
            for (const ot of Object.keys(positions)) {
              if (ot === t) continue;
              const op = positions[ot];
              if (op) otherValue += op.quantity * op.lastMarkedPrice;
            }
            return otherValue;
          })();

          const trade: Trade = {
            id: `${t}-trade-${trades.length}`,
            entryDate: pos.entryDate,
            exitDate: bar.date,
            entryPrice: pos.entryPrice,
            exitPrice: exitPrice,
            quantity: pos.quantity,
            pnl,
            pnlPercent,
            duration: heldDays,
            exitReason,
            context: {
              ticker: t,
              initialInvestment: pos.baseCashUsed,
              grossProceeds: grossProceeds,
              currentCapitalAfterExit: equityAfterExit,
            }
          };
          trades.push(trade);
          positions[t] = null;
          exitedToday.add(t);
        }
      }

      // 4) After exits: compute baseline equity for sizing new entries at this close
      const equityBaseline = computeEquity();

      // 5) Entries: determine candidates, then size against the updated baseline equity
      const entryCandidates: Array<{ t: string; bar: OHLCData }> = [];
      for (const t of selectedUnique) {
        if (positions[t]) continue;
        if (exitedToday.has(t)) continue; // do not re-enter same day after exit
        const idx = indexByDayByTicker[t].get(dayKey);
        if (idx == null) continue;
        const ibs = ibsByTicker[t][idx];
        if (!isNaN(ibs) && ibs < low) {
          entryCandidates.push({ t, bar: dataByTicker[t][idx] });
        }
      }

      let remainingCash = cash;
      for (const { t, bar } of entryCandidates) {
        if (remainingCash <= 0) break;
        const desiredBase = equityBaseline * 0.25;
        let baseToUse = Math.max(0, Math.min(desiredBase, remainingCash));
        if (!(baseToUse > 0)) continue;
        // На случай если к этому моменту позиция уже открылась из-за дублей
        if (positions[t]) continue;
        const marginFactor = Math.max(0, (marginByTicker[t] ?? 100) / 100) || 1;
        const exposure = baseToUse * marginFactor;
        const qty = Math.floor(exposure / bar.close);
        if (qty <= 0) continue;
        const notional = qty * bar.close;
        // При маржинальной торговле: используем наши деньги как залог, занимаем остальное
        const cashUsed = baseToUse; // Всегда используем только наши деньги как залог
        const borrowed = Math.max(0, notional - cashUsed);
        cash -= cashUsed; // Изымаем наши деньги
        remainingCash -= cashUsed;
        positions[t] = {
          ticker: t,
          entryDate: bar.date,
          entryPrice: bar.close,
          quantity: qty,
          borrowedPrincipal: borrowed,
          baseCashUsed: cashUsed,
          entryDayIndex: di,
          lastMarkedPrice: bar.close,
        };
      }

      // 6) Record equity point for the day
      const equityNow = computeEquity();
      if (equityNow > peak) peak = equityNow;
      const drawdown = peak > 0 ? ((peak - equityNow) / peak) * 100 : 0;
      equitySeries.push({ date: dateObj, value: equityNow, drawdown });
    }

    const finalValue = equitySeries.length ? equitySeries[equitySeries.length - 1].value : initialCapital;
    const maxDrawdown = equitySeries.length ? Math.max(...equitySeries.map(p => p.drawdown)) : 0;
    return { equity: equitySeries, finalValue, maxDrawdown, trades };
  }, [tickers, loaded, lowIbs, highIbs, maxHold, initialCapital, margins, strategy]);

  const start = simulation.equity[0]?.date ? new Date(simulation.equity[0].date).toLocaleDateString('ru-RU') : '';
  const end = simulation.equity[simulation.equity.length - 1]?.date ? new Date(simulation.equity[simulation.equity.length - 1].date).toLocaleDateString('ru-RU') : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Порог входа IBS (&lt;)</label>
          <input type="number" step="0.01" min={0} max={1} value={lowIbs} onChange={(e: any) => setLowIbs(e.target.value)} className="px-3 py-2 border rounded-md w-32 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Порог выхода IBS (&gt;)</label>
          <input type="number" step="0.01" min={0} max={1} value={highIbs} onChange={(e: any) => setHighIbs(e.target.value)} className="px-3 py-2 border rounded-md w-32 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Макс. дней удержания</label>
          <input type="number" step="1" min={1} value={maxHold} onChange={(e: any) => setMaxHold(e.target.value)} className="px-3 py-2 border rounded-md w-36 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          {[0,1,2,3].map((i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex flex-col">
                <label className="text-xs text-gray-600 dark:text-gray-300">Тикер {i+1}</label>
                <select
                  value={tickers[i] || ''}
                  onChange={(e: any) => {
                    const next = [...tickers]; next[i] = (e.target.value || '').toUpperCase(); setTickers(next);
                  }}
                  className="px-3 py-2 border rounded-md w-44 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                >
                  <option value="">— выберите —</option>
                  {savedDatasets.map(d => (
                    <option key={d.ticker} value={d.ticker}>{d.ticker}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-600 dark:text-gray-300">Маржинальность {i+1}, %</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={margins[i]}
                  onChange={(e: any) => { const next = [...margins]; next[i] = e.target.value; setMargins(next); }}
                  className="px-3 py-2 border rounded-md w-28 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
                  placeholder="100"
                />
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => setShowTrades((v: boolean) => !v)} className="px-4 py-2 rounded-md border text-sm font-medium dark:border-gray-700">
          {showTrades ? 'Скрыть сделки' : 'Показать все сделки'}
        </button>

        <div className="text-xs text-gray-500 dark:text-gray-300 ml-auto flex gap-3">
          <span>Итог: {formatCurrencyUSD(simulation.finalValue)}</span>
          <span>Макс. просадка: {simulation.maxDrawdown.toFixed(2)}%</span>
          <span>Сделок: {simulation.trades.length}</span>
          {(start && end) && <span>Период: {start} — {end}</span>}
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Загрузка данных…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded px-3 py-2">
        <span className="font-semibold">Стратегия:</span>{' '}
        Вход — IBS &lt; {Number(lowIbs)} на закрытии дня;{' '}
        Выход — IBS &gt; {Number(highIbs)} или по истечении {Number(maxHold)} дней.{' '}
        Каждая позиция открывается на 1/4 текущего депозита с учётом маржинальности.
      </div>

      <div className="h-[600px]">
        <EquityChart equity={simulation.equity} hideHeader />
      </div>

      {showTrades && (
        <div className="space-y-2">
          <div className="text-sm font-medium dark:text-gray-100">Сделки</div>
          <TradesTable trades={simulation.trades} />
        </div>
      )}
    </div>
  );
}

