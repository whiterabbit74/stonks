import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { LoggedEvent, ErrorCategory } from '../lib/error-logger';
import { subscribe, getEvents, clearEvents } from '../lib/error-logger';
import { Maximize2, Minimize2, Trash2, X } from 'lucide-react';

interface ErrorConsoleProps {
  open: boolean;
  onClose: () => void;
}

export function ErrorConsole({ open, onClose }: ErrorConsoleProps) {
  const [events, setEvents] = useState<LoggedEvent[]>(() => getEvents());
  const [filter, setFilter] = useState<ErrorCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (open) {
      setIsFullscreen(true);
    }
  }, [open]);

  useEffect(() => {
    const unsub = subscribe((_evt, all) => {
      setEvents(all);
    });
    return () => unsub();
  }, []);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    
    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isFullscreen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e: LoggedEvent) => {
      if (filter !== 'all' && e.category !== filter) return false;
      if (!q) return true;
      return (
        (e.message?.toLowerCase().includes(q)) ||
        (e.source?.toLowerCase().includes(q)) ||
        (e.stack?.toLowerCase().includes(q))
      );
    }).slice().reverse();
  }, [events, filter, search]);

  if (!open) return null;

  const badgeColor = (level: string) => level === 'error' ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40'
    : level === 'warn' ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40'
    : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40';

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 bg-white dark:bg-gray-900" : "fixed left-0 right-0 bottom-0 z-40"}>
      <div className={isFullscreen ? "h-full flex flex-col px-4 py-4" : "mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"}>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${isFullscreen ? 'text-xl' : 'text-sm'}`}>Журнал ошибок</span>
            <span className="text-xs text-gray-500">{events.length}</span>
            {isFullscreen && <span className="text-xs text-gray-400">(полноэкранный режим)</span>}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilter(e.target.value as any)}
              className="text-xs border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-700"
            >
              <option value="all">все</option>
              <option value="data">данные</option>
              <option value="calc">расчёт</option>
              <option value="chart">график</option>
              <option value="backtest">бэктест</option>
              <option value="network">сеть</option>
              <option value="ui">ui</option>
              <option value="console">console</option>
            </select>
            <input
              id="error-search"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="поиск"
              aria-label="Поиск по ошибкам"
              className="text-xs border rounded px-2 py-1 w-40 dark:bg-gray-900 dark:border-gray-700"
            />
            <button
              onClick={() => clearEvents()}
              className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 inline-flex items-center gap-1"
              title="Очистить журнал"
            >
              <Trash2 className="w-3 h-3" />
              Очистить
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 inline-flex items-center gap-1"
              title={isFullscreen ? 'Свернуть в окно' : 'Развернуть на весь экран'}
            >
              {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              {isFullscreen ? 'Свернуть' : 'Развернуть'}
            </button>
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 inline-flex items-center gap-1"
              title="Закрыть журнал"
            >
              <X className="w-3 h-3" />
              Закрыть
            </button>
          </div>
        </div>
        <div className={`rounded-t-lg border border-b-0 bg-white dark:bg-gray-900 dark:border-gray-800 shadow-sm ${isFullscreen ? 'flex-1' : ''}`}>
          <div className={`overflow-auto divide-y dark:divide-gray-800 ${isFullscreen ? 'h-full' : 'max-h-96'}`}>
            {filtered.length === 0 && (
              <div className="p-3 text-sm text-gray-500">Нет записей</div>
            )}
            {filtered.map(e => (
              <div key={e.id} className={`p-3 ${isFullscreen ? 'text-sm py-4' : 'text-xs'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded border ${badgeColor(e.level)}`}>{e.level}</span>
                  <span className="px-1.5 py-0.5 rounded border bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700">{e.category}</span>
                  <span className="text-gray-400">{new Date(e.timestamp).toLocaleTimeString('ru-RU')}</span>
                  {e.source && <span className="text-gray-500">{e.source}</span>}
                </div>
                <div className={`font-mono text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words ${isFullscreen ? 'text-base leading-relaxed' : ''}`}>{e.message}</div>
                {/* Top frame quick link */}
                {e.context && (e.context as any).topFrame && (
                  <div className={`mt-1 text-gray-600 dark:text-gray-300 ${isFullscreen ? 'text-xs' : 'text-[11px]'}`}>
                    <span className="inline-flex items-center gap-1">
                      <span className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">место</span>
                      <span className="font-mono">
                        {((e.context as any).topFrame as any).functionName ? `${((e.context as any).topFrame as any).functionName} @ ` : ''}
                        {((e.context as any).topFrame as any).file}:{((e.context as any).topFrame as any).line}:{((e.context as any).topFrame as any).column}
                      </span>
                    </span>
                  </div>
                )}
                {e.stack && (
                  <details className="mt-1">
                    <summary className={`cursor-pointer text-gray-500 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>stack</summary>
                    <pre className={`mt-1 whitespace-pre-wrap break-words text-gray-600 dark:text-gray-300 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>{e.stack}</pre>
                  </details>
                )}
                {e.context && Object.keys(e.context).length > 0 && (
                  <details className="mt-1">
                    <summary className={`cursor-pointer text-gray-500 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>context</summary>
                    <pre className={`mt-1 whitespace-pre-wrap break-words text-gray-600 dark:text-gray-300 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>{JSON.stringify(e.context, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
