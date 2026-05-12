import { useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';
import { IconButton, Panel } from './ui';
import type { IconButtonSize } from './ui';

type HeroChartKind = 'line' | 'candles';

interface HeroChartSettingsPopoverProps {
  chartKind: HeroChartKind;
  onChartKindChange: (kind: HeroChartKind) => void;
  showTrades: boolean;
  onShowTradesChange: (show: boolean) => void;
  buttonSize?: IconButtonSize;
  iconClassName?: string;
}

export function HeroChartSettingsPopover({
  chartKind,
  onChartKindChange,
  showTrades,
  onShowTradesChange,
  buttonSize = 'md',
  iconClassName = 'h-3.5 w-3.5',
}: HeroChartSettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useClickOutside(ref, open, () => setOpen(false), false);

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={() => setOpen((prev) => !prev)}
        variant="outline"
        size={buttonSize}
        title="Настройки графика"
        aria-label="Настройки графика"
      >
        <Settings2 className={iconClassName} />
      </IconButton>
      {open && (
        <Panel className="absolute right-0 top-full z-20 mt-1.5 w-48 p-2.5 shadow-lg dark:border-gray-700">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Тип графика</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {(['line', 'candles'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onChartKindChange(kind)}
                className={`rounded px-2 py-1 text-[11px] ${
                  chartKind === kind
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {kind === 'line' ? 'Линия' : 'Свечи'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onShowTradesChange(!showTrades)}
            className="mt-2 flex w-full items-center justify-between rounded bg-gray-100 px-2 py-1.5 text-[11px] text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <span>Показывать сделки</span>
            <span className={showTrades ? 'text-green-600 dark:text-green-300' : 'text-gray-500'}>
              {showTrades ? 'Вкл' : 'Выкл'}
            </span>
          </button>
        </Panel>
      )}
    </div>
  );
}
