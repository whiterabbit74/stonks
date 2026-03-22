import { RefreshCw } from 'lucide-react';

interface Props {
  ticker: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function StaleDataWarning({ ticker, isRefreshing, onRefresh }: Props) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="flex items-start justify-between gap-2">
        <div>Данные {ticker} не актуальны</div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-900/60 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
          title="Обновить данные"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
