import React, { forwardRef } from 'react';

type PanelTone = 'default' | 'soft' | 'subtle';
type PanelPadding = 'none' | 'sm' | 'md' | 'lg';
type PanelRadius = 'xl' | '2xl';

interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'aside' | 'article' | 'details';
  tone?: PanelTone;
  padding?: PanelPadding;
  radius?: PanelRadius;
  shadow?: boolean;
}

const toneStyles: Record<PanelTone, string> = {
  default: 'border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
  soft: 'border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/70',
  subtle: 'border border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-950/40',
};

const paddingStyles: Record<PanelPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const radiusStyles: Record<PanelRadius, string> = {
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
};

export const Panel = forwardRef<HTMLElement, PanelProps>(
  (
    {
      as = 'div',
      tone = 'default',
      padding = 'md',
      radius = 'xl',
      shadow = true,
      className = '',
      ...props
    },
    ref
  ) => {
    const Component = as;
    return (
      <Component
        ref={ref as never}
        className={[
          radiusStyles[radius],
          toneStyles[tone],
          paddingStyles[padding],
          shadow ? 'shadow-sm' : '',
          className,
        ].filter(Boolean).join(' ')}
        {...props}
      />
    );
  }
);

Panel.displayName = 'Panel';
