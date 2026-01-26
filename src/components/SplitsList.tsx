import type { SplitEvent } from '../types';

interface SplitsListProps {
  tickersData?: {
    ticker: string;
    splits: SplitEvent[];
  }[];
  splits?: SplitEvent[];
  ticker?: string;
  totalSplitsCount?: number;
}

export function SplitsList({ tickersData, splits, ticker, totalSplitsCount }: SplitsListProps) {
  // Normalize inputs to a uniform array of objects
  const data = tickersData
    ? tickersData
    : (splits ? [{ ticker: ticker || '', splits }] : []);

  // Calculate total splits if not provided
  const count = totalSplitsCount ?? data.reduce((sum, item) => sum + (item.splits?.length || 0), 0);

  // Header depends on whether we are showing multiple tickers or just one context
  const title = tickersData ? "История сплитов по тикерам" : "История сплитов";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Всего сплитов: {count}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-48 rounded border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-500 dark:text-gray-400">
          {tickersData
            ? "Нет данных о сплитах. Запустите бэктест, чтобы загрузить истории тикеров."
            : "Сплиты не найдены"}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${tickersData ? 'md:grid-cols-2' : ''}`}>
          {data.map((item, idx) => {
            const sortedSplits = [...(item.splits || [])].sort((a, b) => b.date.localeCompare(a.date));
            const hasSplits = sortedSplits.length > 0;
            const displayTicker = item.ticker;

            return (
              <div
                key={displayTicker || idx}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                {displayTicker && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{displayTicker}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {hasSplits ? `Найдено ${sortedSplits.length} ${sortedSplits.length === 1 ? 'событие' : 'событий'}` : 'Сплиты не найдены'}
                      </div>
                    </div>
                    {hasSplits && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                        Последний: {new Date(sortedSplits[0].date).toLocaleDateString('ru-RU')}
                      </div>
                    )}
                  </div>
                )}

                <div className={`${displayTicker ? 'mt-3' : ''} space-y-2`}>
                  {hasSplits ? (
                    sortedSplits.map((split, index) => (
                      <div
                        key={`${displayTicker}-${split.date}-${index}`}
                        className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        <span className="font-mono">{new Date(split.date).toLocaleDateString('ru-RU')}</span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">Коэфф.: {split.factor}:1</span>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md bg-gray-50 px-3 py-3 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                      Для этого тикера сплиты не найдены.
                    </div>
                  )}
                </div>

                {displayTicker && (
                  <div className="mt-4 text-xs">
                    <a
                      href={`https://seekingalpha.com/symbol/${displayTicker}/splits`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Подробнее о сплитах {displayTicker}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
