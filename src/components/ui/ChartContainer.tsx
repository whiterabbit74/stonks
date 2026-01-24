import type { ReactNode } from 'react';

interface ChartContainerProps {
  title?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number | string;
  children: ReactNode;
  className?: string;
}

export function ChartContainer({
  title,
  isEmpty = false,
  emptyMessage = 'Нет данных для отображения',
  height,
  children,
  className = ''
}: ChartContainerProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}

      {isEmpty ? (
        <div
          className="bg-gray-50 dark:bg-gray-900/50 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-center p-6"
          style={{ height: height ?? '18rem' }}
        >
          <div className="text-gray-500 dark:text-gray-400">
            {title && <div className="text-lg font-medium mb-2">{title}</div>}
            <p className="text-sm">{emptyMessage}</p>
          </div>
        </div>
      ) : (
        <div style={height ? { height } : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
