interface Props {
  isOpen: boolean;
  entryPrice: number | null;
}

export function OpenPositionBadge({ isOpen, entryPrice }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-200">
      <span>
        Открытая сделка:{' '}
        <span className={isOpen ? 'text-emerald-600 dark:text-emerald-300' : 'text-gray-500'}>
          {isOpen ? 'да' : 'нет'}
        </span>
        {isOpen && entryPrice != null && (
          <span className="ml-1 text-gray-600 dark:text-gray-300">вход: ${Number(entryPrice).toFixed(2)}</span>
        )}
      </span>
    </div>
  );
}
