/*
  Lightweight client-side error logging with categories and subscriptions.
  - Captures global window errors and unhandled promise rejections
  - Provides imperative logging helpers for data/calculation/chart/backtest/UI
  - Maintains a ring buffer of recent events for an on-page console
*/

export type ErrorLevel = 'error' | 'warn' | 'info';
export type ErrorCategory = 'data' | 'calc' | 'chart' | 'network' | 'ui' | 'backtest' | 'console' | 'unknown';

export interface LoggedEvent {
  id: string;
  timestamp: number; // epoch ms
  level: ErrorLevel;
  category: ErrorCategory;
  message: string;
  source?: string; // component/module/function
  stack?: string;
  context?: Record<string, unknown>;
}

type Subscriber = (event: LoggedEvent, all: LoggedEvent[]) => void;

const MAX_EVENTS = 500;

const state = {
  events: [] as LoggedEvent[],
  subscribers: new Set<Subscriber>(),
  initialized: false,
  originalConsoleError: console.error.bind(console) as (...args: unknown[]) => void,
  cleanup: null as (() => void) | null,
};

/**
 * Generates a unique ID for log entries
 * @returns Unique string ID based on timestamp and random string
 */
function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function coerceCategoryFromError(err: unknown): ErrorCategory {
  try {
    const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
    const stack = String((err as any)?.stack ?? '').toLowerCase();
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) return 'network';
    if (stack.includes('lightweight-charts') || msg.includes('series') || msg.includes('price scale')) return 'chart';
    if (msg.includes('backtest') || stack.includes('clean-backtest') || stack.includes('backtest')) return 'backtest';
    if (msg.includes('typeerror') || msg.includes('value is null') || msg.includes('cannot read')) return 'calc';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function pushEvent(event: LoggedEvent): void {
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
  for (const sub of state.subscribers) {
    try { sub(event, state.events); } catch { /* ignore subscriber errors */ }
  }
}

export function log(level: ErrorLevel, category: ErrorCategory, message: string, context?: Record<string, unknown>, source?: string, stack?: string): LoggedEvent {
  const evt: LoggedEvent = {
    id: nextId(),
    timestamp: Date.now(),
    level,
    category,
    message,
    source,
    stack,
    context,
  };
  pushEvent(evt);
  return evt;
}

export function logError(category: ErrorCategory, message: string, context?: Record<string, unknown>, source?: string, stack?: string): LoggedEvent {
  return log('error', category, message, context, source, stack);
}

export function logWarn(category: ErrorCategory, message: string, context?: Record<string, unknown>, source?: string, stack?: string): LoggedEvent {
  return log('warn', category, message, context, source, stack);
}

export function logInfo(category: ErrorCategory, message: string, context?: Record<string, unknown>, source?: string, stack?: string): LoggedEvent {
  return log('info', category, message, context, source, stack);
}

export function captureException(err: unknown, context?: Record<string, unknown>, source?: string): LoggedEvent {
  const stack = (err as any)?.stack ? String((err as any).stack) : undefined;
  const message = (err instanceof Error) ? err.message : String(err);
  const category = coerceCategoryFromError(err);

  // Extract top frame for quick location insight
  const topFrame = stack ? parseTopStackFrame(stack) : undefined;
  const enrichedContext = {
    ...(context || {}),
    ...(topFrame ? { topFrame } : {}),
  } as Record<string, unknown> | undefined;

  return logError(category, message, enrichedContext, source, stack);
}

export function subscribe(cb: Subscriber): () => void {
  state.subscribers.add(cb);
  // Emit synthetic event for initial sync with current history
  try { cb({ id: '__init__', timestamp: Date.now(), level: 'info', category: 'ui', message: 'init' }, state.events); } catch { /* no-op */ }
  return () => { state.subscribers.delete(cb); };
}

export function getEvents(): LoggedEvent[] {
  return state.events.slice();
}

export function clearEvents(): void {
  state.events = [];
  // Inform subscribers with a synthetic event
  pushEvent({ id: nextId(), timestamp: Date.now(), level: 'info', category: 'ui', message: 'clear' });
}

export interface InitOptions {
  captureConsoleErrors?: boolean;
}

export function initErrorLogger(opts: InitOptions = {}): void {
  if (state.initialized) return;
  state.initialized = true;

  const cleanupFunctions: (() => void)[] = [];

  // Global window error
  if (typeof window !== 'undefined') {
    const errorHandler = (ev: ErrorEvent) => {
      const err = ev.error || new Error(String(ev.message || 'Unknown window error'));
      const ctx = { filename: ev.filename, lineno: ev.lineno, colno: ev.colno } as Record<string, unknown>;
      captureException(err, ctx, 'window.onerror');
    };

    const rejectionHandler = (ev: PromiseRejectionEvent) => {
      const reason = (ev as any).reason ?? 'Unhandled rejection';
      captureException(reason, {}, 'window.unhandledrejection');
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    cleanupFunctions.push(() => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    });
  }

  // Optionally mirror console.error into logger
  if (opts.captureConsoleErrors) {
    console.error = (...args: unknown[]) => {
      try {
        const message = args.map(a => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        const maybeErr = args.find(a => a instanceof Error) as Error | undefined;
        const stack = maybeErr?.stack;
        logError('console', message, { args: safeSerialize(args) }, 'console.error', stack);
      } catch {
        // ignore
      }
      state.originalConsoleError(...args);
    };

    cleanupFunctions.push(() => {
      console.error = state.originalConsoleError;
    });
  }

  // Store cleanup function
  state.cleanup = () => {
    cleanupFunctions.forEach(fn => fn());
    state.initialized = false;
    state.cleanup = null;
  };
}

export function destroyErrorLogger(): void {
  if (state.cleanup) {
    state.cleanup();
  }
}

function safeSerialize(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

// Parse the top application frame: { file, line, column, functionName, raw }
function parseTopStackFrame(stack: string): { file?: string; line?: number; column?: number; functionName?: string; raw: string } | undefined {
  try {
    const lines = String(stack).split('\n').map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      // Skip internal eval frames
      if (line.includes('node_modules') || line.includes('(native)')) continue;
      // Patterns:
      // at func (https://host/path/file.js:LINE:COL)
      // at https://host/path/file.js:LINE:COL
      const match = line.match(/at\s+(?:(?<fn>[^\s(]+)\s+\()?(?<file>https?:\/\/[^):]+?):(?<line>\d+):(?<col>\d+)\)?/);
      if (match && match.groups) {
        return {
          file: match.groups.file,
          line: Number(match.groups.line),
          column: Number(match.groups.col),
          functionName: match.groups.fn,
          raw: line,
        };
      }
    }
  } catch {
    // ignore parse failures
  }
  return undefined;
}

