import React, { useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy } from '../types';
import { IndicatorEngine } from '../lib/indicators';
import { EquityChart } from './EquityChart';

interface NoStopLossSimulatorProps {
  data: OHLCData[];
  strategy: Strategy | null | undefined;
}

interface SimulationResult {
  equity: EquityPoint[];
  maxDrawdown: number;
  finalValue: number;
}

function simulateNoStopLoss(
  data: OHLCData[],
  lowIBS: number,
  highIBS: number,
  maxHoldDays: number,
  initialCapital: number,
  capitalUsage: number
): SimulationResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { equity: [], maxDrawdown: 0, finalValue: 0 };
  }

  const ibsValues = IndicatorEngine.calculateIBS(data);

  let currentCapital = initialCapital;
  let peakValue = currentCapital;
  let maxDrawdown = 0;
  const equity: EquityPoint[] = [];

  let position: { entryIndex: number; entryDate: Date; entryPrice: number; quantity: number } | null = null;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const ibs = ibsValues[i];

    // Entry rule: IBS < lowIBS -> buy at next day's open
    if (!position && typeof ibs === 'number' && !isNaN(ibs) && ibs < lowIBS && i < data.length - 1) {
      const nextBar = data[i + 1];
      const investAmount = (currentCapital * (capitalUsage || 100)) / 100;
      const quantity = Math.floor(investAmount / nextBar.open);
      if (quantity > 0) {
        const cost = quantity * nextBar.open;
        currentCapital -= cost;
        position = {
          entryIndex: i + 1,
          entryDate: nextBar.date,
          entryPrice: nextBar.open,
          quantity,
        };
      }
    }

    // Exit rules (no stop loss):
    // - IBS > highIBS (sell at close)
    // - or holding >= maxHoldDays (sell at close)
    if (position && i > position.entryIndex) {
      let shouldExit = false;
      if (typeof ibs === 'number' && !isNaN(ibs) && ibs > highIBS) {
        shouldExit = true;
      } else {
        const daysHeld = Math.floor((bar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysHeld >= maxHoldDays) shouldExit = true;
      }
      if (shouldExit) {
        const proceeds = position.quantity * bar.close;
        currentCapital += proceeds;
        position = null;
      }
    }

    // Update equity curve (include position value at close)
    let totalValue = currentCapital;
    if (position) {
      totalValue += position.quantity * bar.close;
    }
    if (totalValue > peakValue) peakValue = totalValue;
    const dd = peakValue > 0 ? ((peakValue - totalValue) / peakValue) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    equity.push({ date: bar.date, value: totalValue, drawdown: dd });
  }

  // If position remains open at the end, equity already accounts for it via last close
  const finalValue = equity[equity.length - 1]?.value ?? currentCapital;
  return { equity, maxDrawdown, finalValue };
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
  const initialCapital = Number(strategy?.riskManagement?.initialCapital ?? 10000);
  const capitalUsage = Number(strategy?.riskManagement?.capitalUsage ?? 100);

  const base = useMemo(
    () => simulateNoStopLoss(data, lowIBS, highIBS, maxHoldDays, initialCapital, capitalUsage),
    [data, lowIBS, highIBS, maxHoldDays, initialCapital, capitalUsage]
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
        <div className="text-xs text-gray-500 dark:text-gray-300">
          Текущее плечо: ×{appliedLeverage.toFixed(2)}
        </div>
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
    </div>
  );
}

