import type { MouseEventHandler, ReactNode } from 'react';

interface DropdownMenuProps {
  open: boolean;
  onClose?: () => void;
  align?: 'left' | 'right';
  overlay?: boolean;
  widthClassName?: string;
  className?: string;
  children: ReactNode;
}

interface DropdownMenuItemProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactNode;
  active?: boolean;
  danger?: boolean;
  className?: string;
}

export function DropdownMenu({
  open,
  onClose,
  align = 'right',
  overlay = false,
  widthClassName = 'min-w-[160px]',
  className = '',
  children,
}: DropdownMenuProps) {
  if (!open) return null;

  return (
    <>
      {overlay ? (
        <div
          className="fixed inset-0 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}
      <div
        className={[
          'absolute top-full z-50 mt-1.5 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900',
          align === 'right' ? 'right-0' : 'left-0',
          widthClassName,
          className,
        ].filter(Boolean).join(' ')}
        role="menu"
      >
        {children}
      </div>
    </>
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  icon = null,
  active = false,
  danger = false,
  className = '',
}: DropdownMenuItemProps) {
  const colorStyles = danger
    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
    : active
      ? 'font-semibold text-indigo-600 hover:bg-gray-50 dark:text-indigo-400 dark:hover:bg-gray-800'
      : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
        colorStyles,
        className,
      ].filter(Boolean).join(' ')}
      role="menuitem"
    >
      {icon ? <span className="flex-shrink-0">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function DropdownMenuDivider() {
  return <div className="my-1 border-t border-gray-200 dark:border-gray-700" role="separator" />;
}
