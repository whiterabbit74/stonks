import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface BacktestPageShellProps {
  isLoading: boolean;
  error?: string | null;
  loadingMessage?: string;
  children: React.ReactNode;
}

export function BacktestPageShell({
  isLoading,
  error,
  loadingMessage = "Загрузка данных...",
  children
}: BacktestPageShellProps) {

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 animate-fade-in">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {loadingMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-start gap-3 text-red-800 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
