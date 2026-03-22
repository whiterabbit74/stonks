import { formatCurrencyUSD } from '../lib/backtest-utils';

interface SimulationStatsGridProps {
  finalValue: number;
  cagr: number;
  maxDrawdown: number;
  tradeCount: number;
  periodStart?: string;
  periodEnd?: string;
  leverage?: number;
  winRate?: number;
  totalReturn?: number;
}

export function SimulationStatsGrid({
  finalValue,
  cagr,
  maxDrawdown,
  tradeCount,
  periodStart,
  periodEnd,
  leverage,
  winRate,
  totalReturn,
}: SimulationStatsGridProps) {
  const card = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center';
  const label = 'text-sm text-gray-600 dark:text-gray-400';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      <div className={card}>
        <div className="text-2xl font-bold text-green-600">{formatCurrencyUSD(finalValue)}</div>
        <div className={label}>Финальная стоимость</div>
      </div>

      {totalReturn !== undefined && (
        <div className={card}>
          <div className="text-2xl font-bold text-blue-600">{totalReturn.toFixed(1)}%</div>
          <div className={label}>Общая доходность</div>
        </div>
      )}

      <div className={card}>
        <div className="text-2xl font-bold text-orange-600">{cagr.toFixed(1)}%</div>
        <div className={label}>CAGR</div>
      </div>

      {winRate !== undefined && (
        <div className={card}>
          <div className="text-2xl font-bold text-purple-600">{winRate.toFixed(1)}%</div>
          <div className={label}>Win Rate</div>
        </div>
      )}

      <div className={card}>
        <div className="text-2xl font-bold text-red-600">{maxDrawdown.toFixed(1)}%</div>
        <div className={label}>Макс. просадка</div>
      </div>

      <div className={card}>
        <div className="text-2xl font-bold text-indigo-600">{tradeCount}</div>
        <div className={label}>Всего сделок</div>
      </div>

      {(periodStart || periodEnd || leverage !== undefined) && (
        <div className="col-span-2 md:col-span-4 lg:col-span-6 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 px-1 items-center">
          {periodStart && periodEnd && <span>Период: {periodStart} — {periodEnd}</span>}
          {leverage !== undefined && <span>Текущее плечо: ×{leverage.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}
