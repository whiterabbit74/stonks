import { useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { ChartQuote } from '../types';
import { useClickOutside } from '../hooks/useClickOutside';
import { IconButton, Panel } from './ui';
import type { IconButtonSize } from './ui';
import { providerDisplayName } from './ui/ProviderBadge';

interface QuoteDetailsPopoverProps {
  quote: ChartQuote | null;
  provider: string;
  updatedAt?: Date | null;
  buttonSize?: IconButtonSize;
  buttonClassName?: string;
  iconClassName?: string;
}

function formatQuoteValue(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? Number(value).toFixed(2) : '—';
}

export function QuoteDetailsPopover({
  quote,
  provider,
  updatedAt,
  buttonSize = 'md',
  buttonClassName = '',
  iconClassName = 'h-3.5 w-3.5',
}: QuoteDetailsPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useClickOutside(ref, open, () => setOpen(false), false);

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={() => setOpen((prev) => !prev)}
        variant="outline"
        size={buttonSize}
        className={buttonClassName}
        title="Детали котировки"
        aria-label="Детали котировки"
      >
        <HelpCircle className={iconClassName} />
      </IconButton>
      {open && (
        <Panel className="absolute right-0 top-full z-20 mt-1.5 w-56 p-3 shadow-lg dark:border-gray-700">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Детали котировки
          </div>
          <div className="mt-2 space-y-1.5 text-xs text-gray-700 dark:text-gray-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-500 dark:text-gray-400">Источник</span>
              <span>{providerDisplayName(provider)}</span>
            </div>
            {updatedAt !== undefined && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500 dark:text-gray-400">Обновлено</span>
                <span>{updatedAt ? updatedAt.toLocaleTimeString('ru-RU') : '—'}</span>
              </div>
            )}
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Откр</div>
                <div className="font-mono text-xs">{formatQuoteValue(quote?.open)}</div>
              </div>
              <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Макс</div>
                <div className="font-mono text-xs">{formatQuoteValue(quote?.high)}</div>
              </div>
              <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Мин</div>
                <div className="font-mono text-xs">{formatQuoteValue(quote?.low)}</div>
              </div>
              <div className="rounded border border-gray-200 px-2 py-1 dark:border-gray-700">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Текущ</div>
                <div className="font-mono text-xs">{formatQuoteValue(quote?.current)}</div>
              </div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
