import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import { DatasetAPI } from '../lib/api';
import { adjustOHLCForSplits, dedupeDailyOHLC, formatOHLCYMD, parseOHLCDate } from '../lib/utils';
import { IndicatorEngine } from '../lib/indicators';
import { CleanBacktestEngine, type CleanBacktestOptions } from '../lib/clean-backtest';
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

function runSingleTickerBacktest(data: OHLCData[], strategy: Strategy, ticker: string): { equity: EquityPoint[], finalValue: number, maxDrawdown: number, trades: Trade[] } {
  if (!data || data.length === 0) {
    return { equity: [], finalValue: 0, maxDrawdown: 0, trades: [] };
  }
  const options: CleanBacktestOptions = {
    entryExecution: 'close',
    ignoreMaxHoldDaysExit: false,
    ibsExitRequireAboveEntry: false
  };
  const engine = new CleanBacktestEngine(data, strategy, options);
  const res = engine.runBacktest();
  
  // Добавляем информацию о тикере к сделкам
  const tradesWithTicker = res.trades.map(trade => ({
    ...trade,
    context: { ...trade.context, ticker }
  }));
  
  const equity = res.equity;
  const finalValue = equity.length ? equity[equity.length - 1].value : Number(strategy?.riskManagement?.initialCapital ?? 0);
  const maxDrawdown = equity.length ? Math.max(...equity.map(p => p.drawdown)) : 0;
  return { equity, finalValue, maxDrawdown, trades: tradesWithTicker };
}

function combineEquityCurves(equityCurves: EquityPoint[][]): EquityPoint[] {
  if (equityCurves.length === 0) return [];
  
  // Собираем все уникальные даты
  const allDates = new Set<number>();
  equityCurves.forEach(curve => {
    curve.forEach(point => allDates.add(point.date.getTime()));
  });
  
  const sortedDates = Array.from(allDates).sort((a, b) => a - b);
  
  const combined: EquityPoint[] = [];
  let lastValues = new Array(equityCurves.length).fill(0);
  
  for (const dateTime of sortedDates) {
    const date = new Date(dateTime);
    let totalValue = 0;
    
    // Для каждой кривой находим значение на эту дату или берем последнее известное
    equityCurves.forEach((curve, idx) => {
      const pointForDate = curve.find(p => p.date.getTime() === dateTime);
      if (pointForDate) {
        lastValues[idx] = pointForDate.value;
      }
      totalValue += lastValues[idx];
    });
    
    combined.push({
      date,
      value: totalValue,
      drawdown: 0 // Будет пересчитан позже
    });
  }
  
  // Пересчитываем drawdown для объединенной кривой
  let peak = combined[0]?.value || 0;
  combined.forEach(point => {
    if (point.value > peak) peak = point.value;
    point.drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
  });
  
  return combined;
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
    const selectedTickers: string[] = (tickers || []).map((t: string) => (t || '').toUpperCase()).filter(Boolean).slice(0, 4) as string[];
    
    if (!strategy || selectedTickers.length === 0) {
      return { equity: [] as EquityPoint[], finalValue: 0, maxDrawdown: 0, trades: [] as Trade[] };
    }

    // Создаем стратегию с правильными параметрами
    const effectiveStrategy: Strategy = {
      ...strategy,
      parameters: {
        ...strategy.parameters,
        lowIBS: Number(lowIbs),
        highIBS: Number(highIbs),
        maxHoldDays: Number(maxHold)
      }
    };

    const allTrades: Trade[] = [];
    const allEquityCurves: EquityPoint[][] = [];
    let totalFinalValue = 0;
    let maxDrawdownOverall = 0;
    
    // Для каждого выбранного тикера запускаем отдельный backtest
    selectedTickers.forEach((ticker, index) => {
      if (!ticker || !loaded[ticker] || loaded[ticker].length === 0) return;
      
      const data = loaded[ticker].slice().sort((a: OHLCData, b: OHLCData) => a.date.getTime() - b.date.getTime());
      
      // Создаем стратегию с капиталом в 1/4 от общего (или 1/N от общего, где N - количество выбранных тикеров)
      const quarterCapital = initialCapital / selectedTickers.filter(t => t && loaded[t] && loaded[t].length > 0).length;
      const tickerStrategy: Strategy = {
        ...effectiveStrategy,
        riskManagement: {
          ...effectiveStrategy.riskManagement,
          initialCapital: quarterCapital
        }
      };
      
      // Запускаем backtest для этого тикера
      const result = runSingleTickerBacktest(data, tickerStrategy, ticker);
      
      // Применяем маржинальность к этому тикеру
      const marginFactor = Math.max(0, Number(margins[index] || '100') / 100) || 1;
      const leveragedEquity = result.equity.map(point => ({
        ...point,
        value: point.value * marginFactor
      }));
      const leveragedFinalValue = result.finalValue * marginFactor;
      const leveragedMaxDrawdown = result.maxDrawdown * marginFactor;
      
      // Добавляем результаты
      allEquityCurves.push(leveragedEquity);
      allTrades.push(...result.trades);
      totalFinalValue += leveragedFinalValue;
      maxDrawdownOverall = Math.max(maxDrawdownOverall, leveragedMaxDrawdown);
    });
    
    // Сортируем сделки по дате
    allTrades.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());
    
    // Объединяем equity curves всех тикеров
    const combinedEquity = combineEquityCurves(allEquityCurves);
    
    // Пересчитываем общую максимальную просадку из объединенной кривой
    const actualMaxDrawdown = combinedEquity.length > 0 ? Math.max(...combinedEquity.map(p => p.drawdown)) : 0;

    return {
      equity: combinedEquity,
      finalValue: totalFinalValue,
      maxDrawdown: actualMaxDrawdown,
      trades: allTrades
    };
  }, [tickers, loaded, lowIbs, highIbs, maxHold, initialCapital, margins, strategy]);

  const start = simulation.equity[0]?.date ? new Date(simulation.equity[0].date).toLocaleDateString('ru-RU') : '';
  const end = simulation.equity[simulation.equity.length - 1]?.date ? new Date(simulation.equity[simulation.equity.length - 1].date).toLocaleDateString('ru-RU') : '';
  
  // Рассчитываем годовые проценты
  const annualReturn = useMemo(() => {
    if (simulation.equity.length > 1) {
      const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);
      const finalValue = simulation.finalValue;
      const startDate = simulation.equity[0].date;
      const endDate = simulation.equity[simulation.equity.length - 1].date;
      const years = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      
      if (years > 0 && initialCapital > 0) {
        return (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100;
      }
    }
    return 0;
  }, [simulation.equity, simulation.finalValue, strategy]);

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
          <span>Годовые проценты: {annualReturn.toFixed(2)}%</span>
          <span>Макс. просадка: {simulation.maxDrawdown.toFixed(2)}%</span>
          <span>Сделок: {simulation.trades.length}</span>
          {(start && end) && <span>Период: {start} — {end}</span>}
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Загрузка данных…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      
      {/* Описание стратегии */}
      <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded px-3 py-2">
        <span className="font-semibold">Стратегия "Покупка на закрытии 4":</span>{' '}
        Капитал делится поровну между выбранными тикерами (по 1/{(() => { const validTickers = (tickers || []).filter((t, i) => t && loaded[t] && loaded[t].length > 0); return validTickers.length || 1; })()} от общего капитала на каждый тикер).{' '}
        Для каждого тикера независимо: вход — IBS &lt; {Number(lowIbs)}; выход — IBS &gt; {Number(highIbs)} или по истечении {Number(maxHold)} дней.{' '}
        Маржинальность применяется к каждому тикеру отдельно.
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

