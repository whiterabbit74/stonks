import { useEffect, useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import { EquityChart } from './EquityChart';
import { CleanBacktestEngine, type CleanBacktestOptions } from '../lib/clean-backtest';
import { TradesTable } from './TradesTable';

interface BuyAtCloseSimulatorProps {
  data: OHLCData[];
  strategy: Strategy | null;
}

interface SimulationResult {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: number;
  tradesList: Trade[];
}

function simulateLeverage(equity: EquityPoint[], leverage: number): { equity: EquityPoint[]; finalValue: number; maxDrawdown: number } {
  if (!equity || equity.length === 0 || leverage <= 0) {
    return { equity: [], finalValue: 0, maxDrawdown: 0 };
  }
  const result: EquityPoint[] = [];
  let currentValue = equity[0].value;
  let peakValue = currentValue;
  let maxDD = 0;
  result.push({ date: equity[0].date, value: currentValue, drawdown: 0 });
  for (let i = 1; i < equity.length; i++) {
    const basePrev = equity[i - 1].value;
    const baseCurr = equity[i].value;
    if (basePrev <= 0) continue;
    const baseReturn = (baseCurr - basePrev) / basePrev;
    const leveragedReturn = baseReturn * leverage;
    currentValue = currentValue * (1 + leveragedReturn);
    if (currentValue < 0) currentValue = 0;
    if (currentValue > peakValue) peakValue = currentValue;
    const dd = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
    result.push({ date: equity[i].date, value: currentValue, drawdown: dd });
  }
  return { equity: result, finalValue: result[result.length - 1]?.value ?? currentValue, maxDrawdown: maxDD };
}

function formatCurrencyUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function runCleanBuyAtClose(data: OHLCData[], strategy: Strategy): SimulationResult {
  if (!data || data.length === 0) {
    return { equity: [], finalValue: 0, maxDrawdown: 0, trades: 0, tradesList: [] };
  }
  const options: CleanBacktestOptions = {
    entryExecution: 'close',
    ignoreMaxHoldDaysExit: false,
    ibsExitRequireAboveEntry: false
  };
  const engine = new CleanBacktestEngine(data, strategy, options);
  const res = engine.runBacktest();
  const equity = res.equity;
  const finalValue = equity.length ? equity[equity.length - 1].value : Number(strategy?.riskManagement?.initialCapital ?? 0);
  const maxDrawdown = equity.length ? Math.max(...equity.map(p => p.drawdown)) : 0;
  const trades = res.trades.length;
  return { equity, finalValue, maxDrawdown, trades, tradesList: res.trades };
}

export function BuyAtCloseSimulator({ data, strategy }: BuyAtCloseSimulatorProps) {
  const [lowIbs, setLowIbs] = useState<string>('0.10');
  const [highIbs, setHighIbs] = useState<string>('0.75');
  const [maxHold, setMaxHold] = useState<string>('30');
  const [marginPctInput, setMarginPctInput] = useState<string>('100');
  const [appliedLeverage, setAppliedLeverage] = useState<number>(1);
  const [showTrades, setShowTrades] = useState<boolean>(false);

  const effectiveStrategy: Strategy | null = useMemo(() => {
    if (!strategy) return null;
    const p = { ...strategy.parameters } as any;
    const li = Number(lowIbs);
    const hi = Number(highIbs);
    const mh = Number(maxHold);
    if (isFinite(li)) p.lowIBS = li;
    if (isFinite(hi)) p.highIBS = hi;
    if (isFinite(mh)) p.maxHoldDays = mh;
    return { ...strategy, parameters: p };
  }, [strategy, lowIbs, highIbs, maxHold]);

  const { equity, trades, tradesList } = useMemo(() => {
    if (!data || !effectiveStrategy) return { equity: [], finalValue: 0, maxDrawdown: 0, trades: 0, tradesList: [] };
    const res = runCleanBuyAtClose(data, effectiveStrategy);
    return { equity: res.equity, trades: res.trades, tradesList: res.tradesList };
  }, [data, effectiveStrategy]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('margin');
      const saved = localStorage.getItem('buyAtClose.marginPct');
      const source = fromUrl ?? saved ?? undefined;
      if (source) {
        setMarginPctInput(source);
        const pct = Number(source);
        if (isFinite(pct) && pct > 0) setAppliedLeverage(pct / 100);
      }
    } catch {
      // ignore persistence errors
    }
  }, []);

  const onApplyMargin = () => {
    const pct = Number(marginPctInput);
    if (!isFinite(pct) || pct <= 0) return;
    setAppliedLeverage(pct / 100);
    try {
      localStorage.setItem('buyAtClose.marginPct', String(pct));
      const url = new URL(window.location.href);
      url.searchParams.set('margin', String(pct));
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  };

  const leveraged = useMemo(() => simulateLeverage(equity, appliedLeverage), [equity, appliedLeverage]);

  if (!effectiveStrategy) {
    return (
      <div className="text-sm text-gray-500">Нет стратегии для симуляции</div>
    );
  }

  const start = equity[0]?.date ? new Date(equity[0].date).toLocaleDateString('ru-RU') : '';
  const end = equity[equity.length - 1]?.date ? new Date(equity[equity.length - 1].date).toLocaleDateString('ru-RU') : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Порог входа IBS (&lt;)</label>
          <input type="number" step="0.01" min={0} max={1} value={lowIbs} onChange={e => setLowIbs(e.target.value)} className="px-3 py-2 border rounded-md w-32 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Порог выхода IBS (&gt;)</label>
          <input type="number" step="0.01" min={0} max={1} value={highIbs} onChange={e => setHighIbs(e.target.value)} className="px-3 py-2 border rounded-md w-32 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Макс. дней удержания</label>
          <input type="number" step="1" min={1} value={maxHold} onChange={e => setMaxHold(e.target.value)} className="px-3 py-2 border rounded-md w-36 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Маржинальность, %</label>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={marginPctInput}
            onChange={(e) => setMarginPctInput(e.target.value)}
            className="px-3 py-2 border rounded-md w-36 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            placeholder="например, 100"
          />
        </div>
        <button onClick={onApplyMargin} className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Посчитать</button>
        <button onClick={() => setShowTrades(v => !v)} className="px-4 py-2 rounded-md border text-sm font-medium dark:border-gray-700">
          {showTrades ? 'Скрыть сделки' : 'Показать все сделки'}
        </button>
        <div className="text-xs text-gray-500 dark:text-gray-300 ml-auto flex gap-3">
          <span>Итог: {formatCurrencyUSD(leveraged.finalValue)}</span>
          <span>Макс. просадка: {leveraged.maxDrawdown.toFixed(2)}%</span>
          <span>Сделок: {trades}</span>
          {(start && end) && <span>Период: {start} — {end}</span>}
          <span>Текущее плечо: ×{appliedLeverage.toFixed(2)}</span>
        </div>
      </div>

      <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded px-3 py-2">
        <span className="font-semibold">Стратегия:</span>{' '}
        Вход — IBS &lt; {Number(effectiveStrategy.parameters.lowIBS ?? 0.1)} на закрытии дня;{' '}
        Выход — IBS &gt; {Number(effectiveStrategy.parameters.highIBS ?? 0.75)} или по истечении {Number(effectiveStrategy.parameters.maxHoldDays ?? effectiveStrategy.riskManagement.maxHoldDays ?? 30)} дней.
      </div>

      <div className="h-[600px]">
        <EquityChart equity={leveraged.equity} hideHeader />
      </div>

      {showTrades && (
        <div className="space-y-2">
          <div className="text-sm font-medium dark:text-gray-100">Сделки</div>
          <TradesTable trades={tradesList} />
        </div>
      )}
    </div>
  );
}

