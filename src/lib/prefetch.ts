type IdleCallback = () => void;

export function scheduleIdleTask(task: IdleCallback, timeout = 1500): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let cancelled = false;
  let timeoutId: number | null = null;
  let idleId: number | null = null;

  const run = () => {
    if (!cancelled) {
      task();
    }
  };

  const requestIdle = (window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  }).requestIdleCallback;

  if (typeof requestIdle === 'function') {
    idleId = requestIdle(run, { timeout });
  } else {
    timeoutId = window.setTimeout(run, 120);
  }

  return () => {
    cancelled = true;

    if (idleId !== null) {
      const cancelIdle = (window as Window & {
        cancelIdleCallback?: (id: number) => void;
      }).cancelIdleCallback;
      if (typeof cancelIdle === 'function') {
        cancelIdle(idleId);
      }
    }

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}
