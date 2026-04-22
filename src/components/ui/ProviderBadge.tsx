import { ChevronDown, Zap } from 'lucide-react';
import { useState, useRef, type ReactNode } from 'react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { DropdownMenu, DropdownMenuItem } from './DropdownMenu';

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

  useClickOutside(ref, open, () => setOpen(false), false);

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
        <DropdownMenu open={open} widthClassName="min-w-[160px]" className="mt-1">
          {options!.map((opt) => (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => { onChange!(opt.value); setOpen(false); }}
              active={opt.value === provider}
            >
              {opt.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
      )}
    </div>
  );
}
