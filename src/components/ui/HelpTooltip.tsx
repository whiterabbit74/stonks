import { useRef, useState, ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { IconButton } from './IconButton';
import { Panel } from './Panel';
import { useClickOutside } from '../../hooks/useClickOutside';

export type HelpTooltipSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'max';

const sizeStyles: Record<HelpTooltipSize, string> = {
  sm: 'w-48',
  md: 'w-64',
  lg: 'w-80',
  xl: 'w-96',
  '2xl': 'w-[420px]',
  max: 'w-[min(94vw,430px)]',
};

interface HelpTooltipProps {
  content: ReactNode;
  title?: string;
  size?: HelpTooltipSize;
  align?: 'left' | 'right';
  className?: string;
  buttonClassName?: string;
  iconClassName?: string;
}

export function HelpTooltip({
  content,
  title,
  size = 'md',
  align = 'right',
  className = '',
  buttonClassName = '',
  iconClassName = 'h-3.5 w-3.5',
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useClickOutside(ref, open, () => setOpen(false), true);

  return (
    <div ref={ref} className={`relative inline-flex items-center ${className}`}>
      <IconButton
        onClick={() => setOpen((prev) => !prev)}
        variant="ghost"
        size="sm"
        className={`h-6 w-6 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 focus-visible:ring-1 ${buttonClassName}`}
        title={title || "Показать справку"}
        aria-label={title || "Показать справку"}
        aria-expanded={open}
      >
        <HelpCircle className={iconClassName} />
      </IconButton>
      {open && (
        <Panel
          padding="sm"
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-30 mt-1.5 ${sizeStyles[size]} shadow-lg dark:border-gray-700 text-left`}
        >
          {title && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {title}
            </div>
          )}
          <div className="text-xs font-normal text-gray-700 dark:text-gray-200 leading-normal">
            {content}
          </div>
        </Panel>
      )}
    </div>
  );
}
