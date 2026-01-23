import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { EquityPoint, Trade } from '../types';
import { EquityChart } from './EquityChart';
import { calculateCAGR, formatCurrencyUSD } from '../lib/backtest-utils';
import { SimulationStatsGrid } from './SimulationStatsGrid';

interface MarginSimulatorProps {
  equity: EquityPoint[];
  trades?: Trade[];
  symbol?: string;
}

interface SimulationResult {
  equity: EquityPoint[];
  maxDrawdown: number;
  finalValue: number;
  marginCalls: MarginCallEvent[];
}

interface MarginCallEvent {
  date: Date;
  value: number;
  type: 'partial' | 'full';
}

function simulateLeverageWithMarginCalls(equity: EquityPoint[], leverage: number): SimulationResult {
  if (!equity || equity.length === 0 || leverage <= 0) {
    return { equity: [], maxDrawdown: 0, finalValue: 0, marginCalls: [] };
  }

  const result: EquityPoint[] = [];
  let currentValue = equity[0].value;
  let peakValue = currentValue;
  let maxDD = 0;
  result.push({ date: equity[0].date, value: currentValue, drawdown: 0 });

  const marginCalls: MarginCallEvent[] = [];
  const initialCapital = equity[0].value;
  const marginCallThreshold = initialCapital * 0.3; // 30% от начального капитала
  const fullLiquidationThreshold = initialCapital * 0.1; // 10% от начального - полная ликвидация
  const recoveryThreshold = initialCapital * 0.6; // 60% от начального - восстановление плеча

  let currentLeverage = leverage; // Текущее плечо (может изменяться)
  let lastMarginCallValue = 0;

  for (let i = 1; i < equity.length; i++) {
    const basePrev = equity[i - 1].value;
    const baseCurr = equity[i].value;
    if (basePrev <= 0) continue;

    const baseReturn = (baseCurr - basePrev) / basePrev;
    const leveragedReturn = baseReturn * currentLeverage;
    currentValue = currentValue * (1 + leveragedReturn);

    // Проверка полной ликвидации
    if (currentValue <= fullLiquidationThreshold) {
      marginCalls.push({
        date: new Date(equity[i].date),
        value: currentValue,
        type: 'full'
      });
      currentValue = 0;
      maxDD = 100;
      result.push({ date: equity[i].date, value: currentValue, drawdown: 100 });
      break;
    }

    // Проверка частичной ликвидации (margin call)
    if (currentValue <= marginCallThreshold && currentValue > lastMarginCallValue * 1.1) {
      marginCalls.push({
        date: new Date(equity[i].date),
        value: currentValue,
        type: 'partial'
      });

      // Частичная ликвидация: возвращаем к безопасному уровню и убираем плечо
      currentValue = Math.max(marginCallThreshold * 1.2, currentValue * 0.7);
      currentLeverage = 1; // Убираем плечо после margin call
      lastMarginCallValue = currentValue;
    }

    // Восстановление плеча при восстановлении капитала
    if (currentLeverage < leverage && currentValue >= recoveryThreshold) {
      currentLeverage = leverage; // Восстанавливаем плечо
    }

    if (currentValue > peakValue) peakValue = currentValue;
    const dd = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
    result.push({ date: equity[i].date, value: currentValue, drawdown: dd });
  }

  const finalValue = result[result.length - 1]?.value ?? currentValue;
  return { equity: result, maxDrawdown: maxDD, finalValue, marginCalls };
}

export function MarginSimulator({ equity, trades = [], symbol }: MarginSimulatorProps) {
  const [marginPctInput, setMarginPctInput] = useState<string>('200');
  const [appliedLeverage, setAppliedLeverage] = useState<number>(2);

  const { simEquity, simMaxDD, simFinal, marginCalls, annualReturn } = useMemo(() => {
    const leverage = appliedLeverage;
    const sim = simulateLeverageWithMarginCalls(equity, leverage);

    // Рассчитываем годовые проценты
    let annualReturn = 0;
    if (sim.equity.length > 1) {
      annualReturn = calculateCAGR(
        sim.finalValue,
        equity[0]?.value || 10000,
        sim.equity[0].date,
        sim.equity[sim.equity.length - 1].date
      );
    }

    return {
      simEquity: sim.equity,
      simMaxDD: sim.maxDrawdown,
      simFinal: sim.finalValue,
      marginCalls: sim.marginCalls,
      annualReturn
    };
  }, [equity, appliedLeverage]);

  // Determine effective trades based on liquidation
  const effectiveTrades = useMemo(() => {
    const fullLiquidation = marginCalls.find(mc => mc.type === 'full');
    if (!fullLiquidation) return trades;

    const liquidationDate = fullLiquidation.date;
    // Trades are sorted by date usually, but filter safely
    // Trade dates are YYYY-MM-DD strings. We can compare strings directly if ISO,
    // but better to use Date objects to match liquidationDate (which is Date)
    // Actually liquidationDate is from equity[i].date (YYYY-MM-DD) converted to Date.
    // So comparing YYYY-MM-DD string < YYYY-MM-DD string is safe if liquidationDate is converted back,
    // but here liquidationDate is Date.

    // Convert liquidation date back to string YYYY-MM-DD for simpler comparison
    const liqStr = liquidationDate.toISOString().slice(0, 10);

    return trades.filter(t => t.entryDate <= liqStr);
  }, [trades, marginCalls]);

  const onMarginChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setMarginPctInput(val);
    const pct = Number(val);
    if (isFinite(pct) && pct > 0) {
      setAppliedLeverage(pct / 100);
    }
  };

  const handleDownloadTrades = () => {
    if (!effectiveTrades || effectiveTrades.length === 0) return;

    try {
      const dataStr = JSON.stringify(effectiveTrades, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateSuffix = new Date().toISOString().slice(0, 10);
      link.download = `trades-margin-${symbol || 'backtest'}-${dateSuffix}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export trades', err);
    }
  };

  const marginOptions = [100, 125, 150, 175, 200, 300];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 dark:text-gray-300">Маржинальность, %</label>
            <select
              value={marginPctInput}
              onChange={onMarginChange}
              className="px-3 py-2 border rounded-md w-40 bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {marginOptions.map(opt => (
                <option key={opt} value={opt}>{opt}%</option>
              ))}
            </select>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-300 pb-2">
            Текущее плечо: ×{appliedLeverage.toFixed(2)}
          </div>
        </div>

        {effectiveTrades.length > 0 && (
          <button
            onClick={handleDownloadTrades}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            title="Скачать отфильтрованные сделки"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Скачать сделки</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <SimulationStatsGrid
          finalValue={simFinal}
          cagr={annualReturn}
          maxDrawdown={simMaxDD}
          tradeCount={effectiveTrades.length}
        />
        {marginCalls.length > 0 && (
          <div className="w-full px-3 py-2 rounded border border-red-300 bg-red-50 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200">
            Margin calls: {marginCalls.length} событий
            {marginCalls.some(mc => mc.type === 'full') ? ' (включая полную ликвидацию)' : ' (частичные ликвидации)'}
          </div>
        )}
      </div>

      {/* Детальная информация о margin calls */}
      {marginCalls.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 dark:bg-red-950/30 dark:border-red-900/40">
          <h4 className="font-medium text-red-900 dark:text-red-200 mb-3">
            События маржинальных требований
          </h4>
          <div className="space-y-2 text-sm">
            {marginCalls.map((call, index) => (
              <div key={index} className="flex justify-between items-center py-1">
                <span className="text-red-800 dark:text-red-300">
                  {call.type === 'partial' ? 'Частичная ликвидация' : 'Полная ликвидация'}
                </span>
                <span className="text-red-700 dark:text-red-200">
                  {call.date.toLocaleDateString('ru-RU')} - {formatCurrencyUSD(call.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 bg-red-100 rounded text-xs text-red-800 dark:bg-red-900/50 dark:text-red-200">
            <strong>Логика системы:</strong><br />
            • При падении капитала до 30% от начального - частичная ликвидация и отключение плеча<br />
            • При восстановлении до 60% от начального - плечо восстанавливается<br />
            • При падении до 10% от начального - полная ликвидация
          </div>
        </div>
      )}

      <div className="h-[600px]">
        <EquityChart equity={simEquity} hideHeader />
      </div>
    </div>
  );
}
