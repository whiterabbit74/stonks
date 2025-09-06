import { useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy, Trade } from '../types';
import { EquityChart } from './EquityChart';
import { CleanBacktestEngine, type CleanBacktestOptions } from '../lib/clean-backtest';
import { TradesTable } from './TradesTable';

interface NoStopLossSimulatorProps {
  data: OHLCData[];
  strategy: Strategy | null | undefined;
}

interface SimulationResult {
  equity: EquityPoint[];
  maxDrawdown: number;
  finalValue: number;
  tradesList: Trade[];
}

function runEngineNoStopLoss(
  data: OHLCData[],
  strategy: Strategy,
  ignoreMaxHoldDaysExit: boolean,
  ibsExitRequireAboveEntry: boolean
): SimulationResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { equity: [], maxDrawdown: 0, finalValue: 0, tradesList: [] };
  }
  const options: CleanBacktestOptions = {
    entryExecution: 'nextOpen',
    ignoreMaxHoldDaysExit,
    ibsExitRequireAboveEntry
  };
  const engine = new CleanBacktestEngine(data, strategy, options);
  const res = engine.runBacktest();
  const equity = res.equity;
  const finalValue = equity.length ? equity[equity.length - 1].value : Number(strategy?.riskManagement?.initialCapital ?? 0);
  const maxDrawdown = equity.length ? Math.max(...equity.map(p => p.drawdown)) : 0;
  return { equity, maxDrawdown, finalValue, tradesList: res.trades };
}

function simulateLeverage(equity: EquityPoint[], leverage: number): { equity: EquityPoint[]; maxDrawdown: number; finalValue: number } {
  if (!equity || equity.length === 0 || leverage <= 0) {
    return { equity: [], maxDrawdown: 0, finalValue: 0 };
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

  return { equity: result, maxDrawdown: maxDD, finalValue: result[result.length - 1]?.value ?? currentValue };
}

export function NoStopLossSimulator({ data, strategy }: NoStopLossSimulatorProps) {
  const lowIBS = Number(strategy?.parameters?.lowIBS ?? 0.1);
  const highIBS = Number(strategy?.parameters?.highIBS ?? 0.75);
  const maxHoldDays = typeof strategy?.parameters?.maxHoldDays === 'number'
    ? Number(strategy?.parameters?.maxHoldDays)
    : Number(strategy?.riskManagement?.maxHoldDays ?? 30);

  const [exitOnlyOnHighIBS, setExitOnlyOnHighIBS] = useState<boolean>(false);
  const [requireAboveEntryOnIBS, setRequireAboveEntryOnIBS] = useState<boolean>(false);
  const [showTrades, setShowTrades] = useState<boolean>(false);

  const base = useMemo(
    () => runEngineNoStopLoss(
      data,
      // Ensure strategy parameters reflect thresholds
      {
        ...(strategy as Strategy),
        parameters: {
          ...(strategy?.parameters || {}),
          lowIBS,
          highIBS,
          maxHoldDays
        }
      } as Strategy,
      exitOnlyOnHighIBS,
      requireAboveEntryOnIBS
    ),
    [data, strategy, lowIBS, highIBS, maxHoldDays, exitOnlyOnHighIBS, requireAboveEntryOnIBS]
  );

  const [marginPctInput, setMarginPctInput] = useState<string>('100');
  const [appliedLeverage, setAppliedLeverage] = useState<number>(1);

  const { simEquity, simMaxDD, simFinal } = useMemo(() => {
    const sim = simulateLeverage(base.equity, appliedLeverage);
    return {
      simEquity: sim.equity,
      simMaxDD: sim.maxDrawdown,
      simFinal: sim.finalValue,
    };
  }, [base.equity, appliedLeverage]);

  const onApply = () => {
    const pct = Number(marginPctInput);
    if (!isFinite(pct) || pct <= 0) return;
    setAppliedLeverage(pct / 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600 dark:text-gray-300">Маржинальность, %</label>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={marginPctInput}
            onChange={(e) => setMarginPctInput(e.target.value)}
            className="px-3 py-2 border rounded-md w-40 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
            placeholder="например, 100"
          />
        </div>
        <button
          onClick={onApply}
          className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          Посчитать
        </button>
        <button
          onClick={() => setShowTrades(v => !v)}
          className="px-4 py-2 rounded-md border text-sm font-medium dark:border-gray-700"
        >
          {showTrades ? 'Скрыть сделки' : 'Показать все сделки'}
        </button>
        <div className="text-xs text-gray-500 dark:text-gray-300">
          Текущее плечо: ×{appliedLeverage.toFixed(2)}
        </div>
        <div className="flex items-center gap-2 ml-4">
          <input
            id="exitOnlyOnHighIBS"
            type="checkbox"
            checked={exitOnlyOnHighIBS}
            onChange={(e) => setExitOnlyOnHighIBS(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700"
          />
          <label htmlFor="exitOnlyOnHighIBS" className="text-sm text-gray-700 dark:text-gray-200">
            Только выход по highIBS (игнорировать maxHoldDays)
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="requireAboveEntryOnIBS"
            type="checkbox"
            checked={requireAboveEntryOnIBS}
            onChange={(e) => setRequireAboveEntryOnIBS(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:bg-gray-900 dark:border-gray-700"
          />
          <label htmlFor="requireAboveEntryOnIBS" className="text-sm text-gray-700 dark:text-gray-200">
            Выход по highIBS только если цена выше цены входа
          </label>
        </div>
      </div>

      <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded px-3 py-2">
        <span className="font-semibold">Стратегия:</span>{' '}
        Вход — IBS &lt; {lowIBS} на открытии следующего дня;{' '}
        Выход — IBS &gt; {highIBS}{requireAboveEntryOnIBS ? ' и Close > Entry' : ''}{exitOnlyOnHighIBS ? '' : ` или по истечении ${maxHoldDays} дней`}.
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
          Итоговый депозит: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(simFinal)}
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
          Макс. просадка: {simMaxDD.toFixed(2)}%
        </div>
      </div>

      <div className="h-[600px]">
        <EquityChart equity={simEquity} hideHeader />
      </div>
      {showTrades && (
        <div className="space-y-2">
          <div className="text-sm font-medium dark:text-gray-100">Сделки</div>
          <TradesTable trades={base.tradesList} />
        </div>
      )}
    </div>
  );
}

