import React, { forwardRef } from 'react';
import { Info } from 'lucide-react';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  description?: string;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', children, description, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1 ${className}`}
        {...props}
      >
        {children}
        {description && (
          <span title={description} className="cursor-help text-gray-400">
            <Info className="w-3 h-3" />
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = 'Label';
