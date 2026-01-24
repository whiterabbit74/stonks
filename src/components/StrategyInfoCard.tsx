import type { Strategy } from '../types';

interface StrategyInfoCardProps {
  strategy: Strategy | null;
  lowIBS: number;
  highIBS: number;
  maxHoldDays: number;
  optionsMode?: boolean; // If true, shows "Buy CALL" instead of "Buy"
}

export function StrategyInfoCard({
  strategy,
  lowIBS,
  highIBS,
  maxHoldDays,
  optionsMode = false,
}: StrategyInfoCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-400/10">
          <svg className="h-4 w-4 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Стратегия
        </span>
      </div>

      <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">
        {strategy?.name || 'IBS Mean Reversion'}
      </div>

      <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400">↓</span>
          IBS &lt; {Math.round(lowIBS * 100)}% → {optionsMode ? 'покупка CALL' : 'покупка'}
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">↑</span>
          IBS &gt; {Math.round(highIBS * 100)}% → продажа
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">⏱</span>
          Макс. удержание {maxHoldDays} дней
        </li>
      </ul>

      {!optionsMode && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{strategy?.riskManagement?.capitalUsage ?? 100}% капитала</span>
          <span>
            Комиссия: {strategy?.riskManagement?.commission?.type === 'percentage'
              ? `${strategy?.riskManagement?.commission?.percentage ?? 0}%`
              : strategy?.riskManagement?.commission?.type === 'fixed'
                ? `$${strategy?.riskManagement?.commission?.fixed ?? 0}`
                : 'комбинированная'}
          </span>
        </div>
      )}
    </div>
  );
}
