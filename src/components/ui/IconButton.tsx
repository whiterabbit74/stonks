import React, { forwardRef } from 'react';

export type IconButtonVariant = 'glass' | 'outline' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonStyleOptions {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
  className?: string;
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  active?: boolean;
}

const sizeStyles: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
};

const variantStyles: Record<IconButtonVariant, string> = {
  glass: 'border border-gray-200 bg-white/80 text-gray-700 shadow-sm backdrop-blur-sm hover:bg-gray-100 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-gray-200 dark:hover:bg-slate-700/80 dark:hover:text-white',
  outline: 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100',
  ghost: 'bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100',
};

const activeStyles: Record<IconButtonVariant, string> = {
  glass: 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600',
  outline: 'border-indigo-600 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/40',
  ghost: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/40',
};

export function getIconButtonClasses({
  variant = 'outline',
  size = 'md',
  active = false,
  className = '',
}: IconButtonStyleOptions = {}) {
  return [
    'inline-flex items-center justify-center rounded-full transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900',
    sizeStyles[size],
    active ? activeStyles[variant] : variantStyles[variant],
    className,
  ].filter(Boolean).join(' ');
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'outline', size = 'md', active = false, className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={getIconButtonClasses({ variant, size, active, className })}
      {...props}
    />
  )
);

IconButton.displayName = 'IconButton';
