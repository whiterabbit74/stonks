import { type FC } from 'react';

export interface Tab {
  id: string;
  label: string;
}

export interface AnalysisTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  onTabIntent?: (id: string) => void;
  className?: string;
}

export const AnalysisTabs: FC<AnalysisTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  onTabIntent,
  className = ''
}) => {
  return (
    <div className={`border-b border-gray-200 dark:border-gray-700 overflow-x-auto ${className}`}>
      <div className="flex items-center gap-2 flex-nowrap min-w-max px-1" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onMouseEnter={() => onTabIntent?.(tab.id)}
            onFocus={() => onTabIntent?.(tab.id)}
            onTouchStart={() => onTabIntent?.(tab.id)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};
