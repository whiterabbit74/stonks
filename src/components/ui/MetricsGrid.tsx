import { formatCurrencyUSD } from '../../lib/formatters';

export interface MetricsGridProps {
  finalValue: number;
  maxDrawdown: number;
  metrics: {
    totalReturn: number;
    cagr: number;
    winRate: number;
    totalTrades?: number; // totalTrades can be optional in some contexts
    profitFactor: number;
    // Optional fields used in MultiTicker pages
    netProfit?: number;
    netReturn?: number;
    totalContribution?: number;
    contributionCount?: number;
  };
  initialCapital?: number; // Optional, for display context if needed
}

export function MetricsGrid({ finalValue, maxDrawdown, metrics }: MetricsGridProps) {
  // Common formatting helpers
  const fmtPct = (v: number) => (v != null ? v.toFixed(1) : '0.0') + '%';
  const fmtNum = (v: number) => (v != null ? v.toFixed(2) : '0.00');

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
      <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-green-600">
          {formatCurrencyUSD(finalValue)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Итоговый баланс</div>
      </div>

      <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-blue-600">
          {fmtPct(metrics.totalReturn)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Общая доходность</div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-orange-600">
          {fmtPct(metrics.cagr)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">CAGR</div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-purple-600">
          {fmtPct(metrics.winRate)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Win Rate</div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-red-600">
          {fmtPct(maxDrawdown)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Макс. просадка</div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-indigo-600">
          {metrics.totalTrades ?? 0}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Всего сделок</div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
        <div className="text-2xl font-bold text-teal-600">
          {fmtNum(metrics.profitFactor)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">Profit Factor</div>
      </div>
    </div>
  );
}
