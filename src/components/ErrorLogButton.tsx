import { useState } from 'react';
import { Bug } from 'lucide-react';
import { ErrorConsole } from './ErrorConsole';
import { useErrorEvents } from '../hooks/useErrorEvents';
import { logInfo } from '../lib/error-logger';

export function ErrorLogButton() {
  const [showConsole, setShowConsole] = useState(false);
  const { errorCount } = useErrorEvents();

  const handleToggle = () => {
    const newState = !showConsole;
    setShowConsole(newState);
    logInfo('ui', 'toggle error console from footer', { open: newState }, 'ErrorLogButton');
  };

  return (
    <>
      <button
        onClick={handleToggle}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 ${
          showConsole
            ? 'bg-amber-600 border-amber-600 text-white hover:brightness-110 shadow-lg'
            : errorCount > 0
            ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/50'
            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
        title={showConsole ? 'Скрыть журнал ошибок' : 'Показать журнал ошибок'}
        aria-label={showConsole ? 'Скрыть журнал ошибок' : 'Показать журнал ошибок'}
      >
        <Bug className={`w-4 h-4 ${showConsole ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-medium">
          {showConsole ? 'Скрыть ошибки' : 'Показать ошибки'}
        </span>
        {errorCount > 0 && (
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${
              showConsole
                ? 'bg-white/20 text-white'
                : 'bg-red-600 text-white dark:bg-red-500'
            }`}
          >
            {errorCount > 99 ? '99+' : errorCount}
          </span>
        )}
      </button>
      
      <ErrorConsole open={showConsole} onClose={() => setShowConsole(false)} />
    </>
  );
}