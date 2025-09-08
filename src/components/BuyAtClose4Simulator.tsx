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

function runMultiTickerBacktest(tickersData: Array<{ticker: string, data: OHLCData[]}>, strategy: Strategy, margins: string[]): { equity: EquityPoint[], finalValue: number, maxDrawdown: number, trades: Trade[] } {
  if (!tickersData || tickersData.length === 0) {
    return { equity: [], finalValue: 0, maxDrawdown: 0, trades: [] };
  }
  
  const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);
  let currentCapital = initialCapital;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const positions: Array<{ticker: string, entryDate: Date, entryPrice: number, quantity: number, entryIndex: number} | null> = new Array(tickersData.length).fill(null);
  
  // Создаем единую временную шкалу из всех тикеров
  const allDates = new Set<number>();
  tickersData.forEach(({data}) => {
    data.forEach(bar => allDates.add(bar.date.getTime()));
  });
  const sortedDates = Array.from(allDates).sort((a, b) => a - b);
  
  // Рассчитываем IBS для всех тикеров
  const ibsData = tickersData.map(({data}) => {
    const ibsValues = data.map(bar => {
      const range = bar.high - bar.low;
      if (range === 0) return NaN; // Избегаем деления на ноль
      return (bar.close - bar.low) / range;
    });
    return ibsValues;
  });
  
  const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
  const maxHoldDays = Number(strategy.parameters.maxHoldDays ?? 30);
  
  // Проходим по каждой дате
  for (const dateTime of sortedDates) {
    const date = new Date(dateTime);
    let totalPortfolioValue = currentCapital;
    
    // Для каждого тикера проверяем, есть ли данные на эту дату
    for (let tickerIdx = 0; tickerIdx < tickersData.length; tickerIdx++) {
      const {ticker, data} = tickersData[tickerIdx];
      const barIdx = data.findIndex(bar => bar.date.getTime() === dateTime);
      if (barIdx === -1) continue; // Нет данных на эту дату для этого тикера
      
      const bar = data[barIdx];
      const ibs = ibsData[tickerIdx][barIdx];
      const position = positions[tickerIdx];
      const marginFactor = Math.max(0, Number(margins[tickerIdx] || '100') / 100) || 1;
      
      // Если есть открытая позиция - проверяем условия выхода
      if (position) {
        const daysSinceEntry = Math.floor((date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
        let shouldExit = false;
        let exitReason = '';
        
        // Проверяем условия выхода
        if (!isNaN(ibs) && ibs > highIBS) {
          shouldExit = true;
          exitReason = 'ibs_signal';
        } else if (daysSinceEntry >= maxHoldDays) {
          shouldExit = true;
          exitReason = 'max_hold_days';
        }
        
        if (shouldExit) {
          // Закрываем позицию
          const exitPrice = bar.close;
          const grossProceeds = position.quantity * exitPrice;
          const pnl = (exitPrice - position.entryPrice) * position.quantity;
          const pnlPercent = (pnl / (position.quantity * position.entryPrice)) * 100;
          
          // Обновляем общий капитал
          currentCapital += grossProceeds;
          
          // Создаем запись о сделке
          const trade: Trade = {
            entryDate: position.entryDate,
            exitDate: date,
            entryPrice: position.entryPrice,
            exitPrice: exitPrice,
            quantity: position.quantity,
            pnl: pnl,
            pnlPercent: pnlPercent,
            exitReason: exitReason,
            context: { ticker }
          };
          
          trades.push(trade);
          positions[tickerIdx] = null; // Закрываем позицию
          
          console.log(`🔴 EXIT ${ticker}: ${position.quantity} shares at $${exitPrice.toFixed(2)}, P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%), Reason: ${exitReason}`);
        } else {
          // Позиция остается открытой, добавляем ее стоимость к портфелю
          const positionValue = position.quantity * bar.close;
          totalPortfolioValue += positionValue - (position.quantity * position.entryPrice);
        }
      } else {
        // Нет позиции - проверяем условия входа
        if (!isNaN(ibs) && ibs < lowIBS && currentCapital > 0) {
          // Сигнал входа - используем 1/4 от текущего капитала
          const investmentAmount = currentCapital * 0.25;
          const quantity = Math.floor(investmentAmount / bar.close);
          
          if (quantity > 0) {
            const totalCost = quantity * bar.close;
            
            // Открываем позицию
            positions[tickerIdx] = {
              ticker,
              entryDate: date,
              entryPrice: bar.close,
              quantity: quantity,
              entryIndex: barIdx
            };
            
            // Вычитаем стоимость из общего капитала
            currentCapital -= totalCost;
            
            console.log(`🟢 ENTRY ${ticker}: ${quantity} shares at $${bar.close.toFixed(2)}, IBS=${ibs.toFixed(3)}, Investment: $${totalCost.toFixed(2)}, Remaining capital: $${currentCapital.toFixed(2)}`);
          }
        }
      }
    }
    
    // Рассчитываем общую стоимость портфеля на эту дату
    totalPortfolioValue = currentCapital;
    positions.forEach((pos, idx) => {
      if (pos) {
        const tickerData = tickersData[idx].data;
        const barIdx = tickerData.findIndex(bar => bar.date.getTime() === dateTime);
        if (barIdx !== -1) {
          const currentPrice = tickerData[barIdx].close;
          totalPortfolioValue += pos.quantity * currentPrice;
        }
      }
    });
    
    // Добавляем точку equity
    equity.push({
      date,
      value: totalPortfolioValue,
      drawdown: 0 // Будет рассчитано позже
    });
  }
  
  // Закрываем все оставшиеся позиции в конце
  for (let tickerIdx = 0; tickerIdx < positions.length; tickerIdx++) {
    const position = positions[tickerIdx];
    if (position) {
      const {ticker, data} = tickersData[tickerIdx];
      const lastBar = data[data.length - 1];
      const exitPrice = lastBar.close;
      const grossProceeds = position.quantity * exitPrice;
      const pnl = (exitPrice - position.entryPrice) * position.quantity;
      const pnlPercent = (pnl / (position.quantity * position.entryPrice)) * 100;
      
      currentCapital += grossProceeds;
      
      const trade: Trade = {
        entryDate: position.entryDate,
        exitDate: lastBar.date,
        entryPrice: position.entryPrice,
        exitPrice: exitPrice,
        quantity: position.quantity,
        pnl: pnl,
        pnlPercent: pnlPercent,
        exitReason: 'end_of_data',
        context: { ticker }
      };
      
      trades.push(trade);
    }
  }
  
  // Рассчитываем drawdown
  let peak = equity[0]?.value || initialCapital;
  equity.forEach(point => {
    if (point.value > peak) peak = point.value;
    point.drawdown = peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
  });
  
  const finalValue = equity.length > 0 ? equity[equity.length - 1].value : initialCapital;
  const maxDrawdown = equity.length > 0 ? Math.max(...equity.map(p => p.drawdown)) : 0;
  
  return { equity, finalValue, maxDrawdown, trades };
}

// Функция больше не нужна, так как мы используем единый портфель

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

    // Подготавливаем данные для мульти-тикерного бэктеста
    const validTickersData = selectedTickers
      .map((ticker, index) => {
        if (!ticker || !loaded[ticker] || loaded[ticker].length === 0) return null;
        const data = loaded[ticker].slice().sort((a: OHLCData, b: OHLCData) => a.date.getTime() - b.date.getTime());
        return { ticker, data, index };
      })
      .filter((item): item is {ticker: string, data: OHLCData[], index: number} => item !== null);
    
    if (validTickersData.length === 0) {
      return { equity: [] as EquityPoint[], finalValue: 0, maxDrawdown: 0, trades: [] as Trade[] };
    }
    
    // Запускаем единый мульти-тикерный бэктест
    const result = runMultiTickerBacktest(
      validTickersData.map(({ticker, data}) => ({ticker, data})), 
      effectiveStrategy, 
      margins
    );
    
    return result;
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
        <span className="font-semibold">Стратегия "Покупка на закрытии 4" (единый портфель):</span>{' '}
        Используется единый общий баланс. При получении сигнала на любой акции тратится 25% от текущего доступного капитала.{' '}
        Вход — IBS &lt; {Number(lowIbs)}; выход — IBS &gt; {Number(highIbs)} или по истечении {Number(maxHold)} дней.{' '}
        Все позиции влияют на общий капитал портфеля.
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

