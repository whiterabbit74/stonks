import { ChevronDown, Zap } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';

export interface ProviderOption {
  value: string;
  label: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { value: 'alpha_vantage', label: 'Alpha Vantage' },
  { value: 'finnhub', label: 'Finnhub' },
  { value: 'twelve_data', label: 'Twelve Data' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'webull', label: 'Webull' },
];

const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  PROVIDER_OPTIONS.map((o) => [o.value, o.label]),
);

export function providerDisplayName(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}

interface ProviderBadgeProps {
  /** Short label above the value, e.g. "Провайдер данных" */
  label: string;
  /** Current provider key, e.g. "alpha_vantage" */
  provider: string;
  /** Optional icon override. Default: Zap */
  icon?: ReactNode;
  /** If provided, a change button with a dropdown will appear */
  options?: ProviderOption[];
  onChange?: (value: string) => void;
}

/**
 * Compact mini-card that mirrors InfoCard's visual language but at ~half the size.
 * Use in PageHeader actions or toolbars wherever a provider is relevant.
 */
export function ProviderBadge({ label, provider, icon, options, onChange }: ProviderBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const canChange = !!(options && onChange);

  return (
    <div ref={ref} className="relative">
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="text-indigo-500 dark:text-indigo-400">
            {icon ?? <Zap className="h-3.5 w-3.5" />}
          </span>
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none">
            {providerDisplayName(provider)}
          </span>
          {canChange && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Сменить провайдер"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {open && canChange && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {options!.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange!(opt.value); setOpen(false); }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                opt.value === provider
                  ? 'font-semibold text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
