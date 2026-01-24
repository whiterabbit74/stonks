import type { SplitEvent } from '../types';

interface SplitsListProps {
  tickersData: {
    ticker: string;
    splits: SplitEvent[];
  }[];
  totalSplitsCount: number;
}

export function SplitsList({ tickersData, totalSplitsCount }: SplitsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          История сплитов по тикерам
        </h3>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Всего сплитов: {totalSplitsCount}
        </div>
      </div>

      {tickersData.length === 0 ? (
        <div className="h-48 rounded border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-center text-gray-500 dark:text-gray-400">
          Нет данных о сплитах. Запустите бэктест, чтобы загрузить истории тикеров.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tickersData.map(tickerData => {
            const sortedSplits = [...(tickerData.splits || [])].sort((a, b) => b.date.localeCompare(a.date));
            const hasSplits = sortedSplits.length > 0;

            return (
              <div
                key={tickerData.ticker}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{tickerData.ticker}</div>
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

                <div className="mt-3 space-y-2">
                  {hasSplits ? (
                    sortedSplits.map((split, index) => (
                      <div
                        key={`${tickerData.ticker}-${split.date}-${index}`}
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

                <div className="mt-4 text-xs">
                  <a
                    href={`https://seekingalpha.com/symbol/${tickerData.ticker}/splits`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Подробнее о сплитах {tickerData.ticker}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
