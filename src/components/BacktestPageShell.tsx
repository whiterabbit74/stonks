import React from 'react';
import { Loader2 } from 'lucide-react';

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
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="text-red-800 dark:text-red-200">
            ❌ {error}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
