import type { ReactNode } from 'react';
import { Settings, Info } from 'lucide-react';

interface ConfigurationField {
  label: string;
  description?: string;
  content: ReactNode;
  colSpan?: number; // 1 or 2 (default 1)
}

interface StrategyConfigurationCardProps {
  title?: string;
  icon?: ReactNode;
  children?: ReactNode; // For free-form content
  fields?: ConfigurationField[]; // For structured grid
  className?: string;
}

export function StrategyConfigurationCard({
  title = "Параметры",
  icon,
  children,
  fields,
  className = ""
}: StrategyConfigurationCardProps) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/60 dark:to-slate-900/40 p-5 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-400/10">
          {icon || (
            <Settings className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          )}
        </div>
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title}
        </span>
      </div>

      <div className="space-y-4">
        {fields ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field, idx) => (
              <div key={idx} className={field.colSpan === 2 ? "md:col-span-2" : ""}>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  {field.label}
                  {field.description && (
                     <span title={field.description} className="cursor-help text-gray-400">
                       <Info className="w-3 h-3" />
                     </span>
                  )}
                </label>
                {field.content}
              </div>
            ))}
          </div>
        ) : children}
      </div>
    </div>
  );
}
