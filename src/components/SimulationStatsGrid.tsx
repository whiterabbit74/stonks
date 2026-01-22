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
  totalReturn
}: SimulationStatsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-300">Финальная стоимость</div>
        <div className="text-base font-semibold text-green-600 dark:text-green-400">
          {formatCurrencyUSD(finalValue)}
        </div>
      </div>

      {totalReturn !== undefined && (
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-300">Общая доходность</div>
          <div className="text-base font-semibold text-blue-600 dark:text-blue-400">
            {totalReturn.toFixed(2)}%
          </div>
        </div>
      )}

      <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-300">CAGR</div>
        <div className="text-base font-semibold text-orange-600 dark:text-orange-400">
          {cagr.toFixed(2)}%
        </div>
      </div>

      {winRate !== undefined && (
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-300">Win Rate</div>
          <div className="text-base font-semibold text-purple-600 dark:text-purple-400">
            {winRate.toFixed(1)}%
          </div>
        </div>
      )}

      <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-300">Макс. просадка</div>
        <div className="text-base font-semibold text-red-600 dark:text-red-400">
          {maxDrawdown.toFixed(2)}%
        </div>
      </div>

      {/* If we have fewer items than columns in a row, trades might wrap weirdly or take a whole spot.
          Let's just keep it simple. */}
      <div className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
        <div className="text-xs text-gray-500 dark:text-gray-300">Сделок</div>
        <div className="text-base font-semibold dark:text-gray-100">{tradeCount}</div>
      </div>

      {(periodStart || periodEnd || leverage !== undefined) && (
        <div className="col-span-2 sm:col-span-3 lg:col-span-5 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400 px-1 items-center">
          {(periodStart && periodEnd) && <span>Период: {periodStart} — {periodEnd}</span>}
          {leverage !== undefined && <span>Текущее плечо: ×{leverage.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}
