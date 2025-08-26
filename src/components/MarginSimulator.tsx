import { useMemo, useState } from 'react';
import type { EquityPoint } from '../types';
import { EquityChart } from './EquityChart';

interface MarginSimulatorProps {
  equity: EquityPoint[];
}

interface SimulationResult {
  equity: EquityPoint[];
  maxDrawdown: number;
  finalValue: number;
  marginCall: boolean;
  marginCallDate?: Date;
}

function simulateLeverage(equity: EquityPoint[], leverage: number): SimulationResult {
  if (!equity || equity.length === 0 || leverage <= 0) {
    return { equity: [], maxDrawdown: 0, finalValue: 0, marginCall: false };
  }

  const result: EquityPoint[] = [];
  let prevValue = equity[0].value;
  let currentValue = prevValue;
  let peakValue = currentValue;
  let maxDD = 0;
  result.push({ date: equity[0].date, value: currentValue, drawdown: 0 });

  let marginCall = false;
  let marginCallDate: Date | undefined = undefined;

  for (let i = 1; i < equity.length; i++) {
    const basePrev = equity[i - 1].value;
    const baseCurr = equity[i].value;
    if (basePrev <= 0) continue;
    const baseReturn = (baseCurr - basePrev) / basePrev;
    const leveragedReturn = baseReturn * leverage;
    currentValue = currentValue * (1 + leveragedReturn);

    if (currentValue <= 0) {
      currentValue = 0;
      marginCall = true;
      marginCallDate = equity[i].date;
      maxDD = 100;
      result.push({ date: equity[i].date, value: currentValue, drawdown: 100 });
      break;
    }

    if (currentValue > peakValue) peakValue = currentValue;
    const dd = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
    result.push({ date: equity[i].date, value: currentValue, drawdown: dd });
  }

  const finalValue = result[result.length - 1]?.value ?? currentValue;
  return { equity: result, maxDrawdown: maxDD, finalValue, marginCall, marginCallDate };
}

export function MarginSimulator({ equity }: MarginSimulatorProps) {
  const [marginPctInput, setMarginPctInput] = useState<string>('200');
  const [appliedLeverage, setAppliedLeverage] = useState<number>(2);

  const { simEquity, simMaxDD, simFinal, marginCall, marginDate } = useMemo(() => {
    const leverage = appliedLeverage;
    const sim = simulateLeverage(equity, leverage);
    return {
      simEquity: sim.equity,
      simMaxDD: sim.maxDrawdown,
      simFinal: sim.finalValue,
      marginCall: sim.marginCall,
      marginDate: sim.marginCallDate,
    };
  }, [equity, appliedLeverage]);

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
            placeholder="например, 200"
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
          Итоговый депозит: {simFinal.toFixed(2)}
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
          Макс. просадка: {simMaxDD.toFixed(2)}%
        </div>
        {marginCall && (
          <div className="px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
            Margin call: баланс ушёл в ноль{marginDate ? ` (${new Date(marginDate).toLocaleDateString('ru-RU')})` : ''}
          </div>
        )}
      </div>

      <div className="h-[600px]">
        <EquityChart equity={simEquity} hideHeader />
      </div>
    </div>
  );
}