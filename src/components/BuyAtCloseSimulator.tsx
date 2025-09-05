import React, { useMemo, useState } from 'react';
import type { EquityPoint, OHLCData, Strategy } from '../types';
import { EquityChart } from './EquityChart';
import { IndicatorEngine } from '../lib/indicators';

interface BuyAtCloseSimulatorProps {
  data: OHLCData[];
  strategy: Strategy | null;
}

interface SimulationResult {
  equity: EquityPoint[];
  finalValue: number;
  maxDrawdown: number;
  trades: number;
}

function formatCurrencyUSD(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function simulateBuyAtClose(data: OHLCData[], strategy: Strategy): SimulationResult {
  if (!data || data.length === 0) {
    return { equity: [], finalValue: 0, maxDrawdown: 0, trades: 0 };
  }
  const lowIBS = Number(strategy.parameters.lowIBS ?? 0.1);
  const highIBS = Number(strategy.parameters.highIBS ?? 0.75);
  const maxHoldDays = typeof strategy.parameters.maxHoldDays === 'number'
    ? strategy.parameters.maxHoldDays
    : (strategy.riskManagement.maxHoldDays ?? 30);
  const capitalUsage = strategy.riskManagement.capitalUsage ?? 100;
  const initialCapital = Number(strategy.riskManagement.initialCapital ?? 10000);

  const ibsValues = IndicatorEngine.calculateIBS(data);

  let currentCapital = initialCapital;
  const equity: EquityPoint[] = [];
  let peakValue = initialCapital;

  let position: { entryDate: Date; entryPrice: number; quantity: number; entryIndex: number } | null = null;
  let tradeCount = 0;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    const ibs = ibsValues[i];
    if (!isFinite(ibs)) {
      // even if no valid IBS, just record equity point and continue
      const totalValue = position ? currentCapital + position.quantity * bar.close : currentCapital;
      if (totalValue > peakValue) peakValue = totalValue;
      const drawdown = peakValue > 0 ? ((peakValue - totalValue) / peakValue) * 100 : 0;
      equity.push({ date: bar.date, value: totalValue, drawdown });
      continue;
    }

    // Entry: if no position and IBS < low threshold, buy today at close
    if (!position && ibs < lowIBS) {
      const investmentAmount = (currentCapital * capitalUsage) / 100;
      const quantity = Math.floor(investmentAmount / bar.close);
      if (quantity > 0) {
        const totalCost = quantity * bar.close;
        currentCapital -= totalCost;
        position = {
          entryDate: bar.date,
          entryPrice: bar.close,
          quantity,
          entryIndex: i,
        };
      }
    }

    // Exit: if position exists and holding at least 1 day, check rules
    if (position && i > position.entryIndex) {
      let shouldExit = false;
      let exitPrice = bar.close;
      // Exit rule by IBS high
      if (ibs > highIBS) {
        shouldExit = true;
      } else {
        const daysHeld = Math.floor((bar.date.getTime() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysHeld >= maxHoldDays) {
          shouldExit = true;
        }
      }
      if (shouldExit) {
        const grossProceeds = position.quantity * exitPrice;
        currentCapital += grossProceeds;
        tradeCount += 1;
        position = null;
      }
    }

    // Record equity at day end
    const totalValue = position ? currentCapital + position.quantity * bar.close : currentCapital;
    if (totalValue > peakValue) peakValue = totalValue;
    const drawdown = peakValue > 0 ? ((peakValue - totalValue) / peakValue) * 100 : 0;
    equity.push({ date: bar.date, value: totalValue, drawdown });
  }

  // If still in position at the end — mark equity with last close already included above
  const finalValue = equity.length ? equity[equity.length - 1].value : currentCapital;
  const maxDrawdown = equity.length ? Math.max(...equity.map(p => p.drawdown)) : 0;

  return { equity, finalValue, maxDrawdown, trades: tradeCount };
}

export function BuyAtCloseSimulator({ data, strategy }: BuyAtCloseSimulatorProps) {
  const [lowIbs, setLowIbs] = useState<string>('0.10');
  const [highIbs, setHighIbs] = useState<string>('0.75');
  const [maxHold, setMaxHold] = useState<string>('30');

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

  const { equity, finalValue, maxDrawdown, trades } = useMemo(() => {
    if (!data || !effectiveStrategy) return { equity: [], finalValue: 0, maxDrawdown: 0, trades: 0 };
    return simulateBuyAtClose(data, effectiveStrategy);
  }, [data, effectiveStrategy]);

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
        <div className="text-xs text-gray-500 dark:text-gray-300 ml-auto flex gap-3">
          <span>Итог: {formatCurrencyUSD(finalValue)}</span>
          <span>Макс. просадка: {maxDrawdown.toFixed(2)}%</span>
          <span>Сделок: {trades}</span>
          {(start && end) && <span>Период: {start} — {end}</span>}
        </div>
      </div>

      <div className="h-[600px]">
        <EquityChart equity={equity} hideHeader />
      </div>
    </div>
  );
}

