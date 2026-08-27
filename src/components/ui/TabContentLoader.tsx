interface TabContentLoaderProps {
  variant?: 'text' | 'skeleton';
  className?: string;
}

export function TabContentLoader({ variant = 'text', className = '' }: TabContentLoaderProps) {
  if (variant === 'skeleton') {
    return (
      <div className={`rounded-lg border border-gray-200 bg-gray-50/90 p-4 dark:border-gray-700 dark:bg-gray-900/40 ${className}`.trim()}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-48 rounded bg-gray-200/80 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300 ${className}`.trim()}>
      Загрузка аналитики...
    </div>
  );
}
