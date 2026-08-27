import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoggedEvent } from '../../lib/error-logger';
import { useErrorEvents } from '../useErrorEvents';

type Subscriber = (event: LoggedEvent, all: LoggedEvent[]) => void;

const loggerState = vi.hoisted(() => {
  const listeners = new Set<Subscriber>();
  let buffer: LoggedEvent[] = [];

  function reset() {
    buffer = [];
    listeners.clear();
  }

  function seedEvent(level: LoggedEvent['level'], message: string): LoggedEvent {
    return {
      id: `${buffer.length}-${message}`,
      timestamp: 0,
      level,
      category: 'ui',
      message,
    };
  }

  function push(level: LoggedEvent['level'], message: string) {
    const event = seedEvent(level, message);
    buffer = [...buffer, event];
    for (const listener of listeners) listener(event, buffer);
  }

  function clearBuffer() {
    buffer = [];
    const event = seedEvent('info', 'clear');
    for (const listener of listeners) listener(event, buffer);
  }

  return {
    listeners,
    getBuffer: () => buffer,
    reset,
    push,
    clearBuffer,
    subscribe: (cb: Subscriber) => {
      listeners.add(cb);
      cb(
        { id: '__init__', timestamp: 0, level: 'info', category: 'ui', message: 'init' },
        buffer
      );
      return () => {
        listeners.delete(cb);
      };
    },
  };
});

vi.mock('../../lib/error-logger', () => ({
  getEvents: () => loggerState.getBuffer().slice(),
  subscribe: (cb: Subscriber) => loggerState.subscribe(cb),
}));

describe('useErrorEvents', () => {
  beforeEach(() => {
    loggerState.reset();
  });

  afterEach(() => {
    loggerState.reset();
  });

  it('counts only error-level events from the current buffer', () => {
    loggerState.push('error', 'boom');
    loggerState.push('warn', 'careful');
    loggerState.push('info', 'hello');

    const { result } = renderHook(() => useErrorEvents());

    expect(result.current.errorCount).toBe(1);
    expect(result.current.hasErrors).toBe(true);
    expect(result.current.events.some((event) => event.message === 'boom')).toBe(true);
    expect(result.current.events.some((event) => event.message === 'careful')).toBe(true);
  });

  it('updates the count when new errors arrive and when the log is cleared', () => {
    const { result } = renderHook(() => useErrorEvents());
    expect(result.current.errorCount).toBe(0);
    expect(result.current.hasErrors).toBe(false);

    act(() => {
      loggerState.push('error', 'failed');
    });
    expect(result.current.errorCount).toBe(1);
    expect(result.current.hasErrors).toBe(true);

    act(() => {
      loggerState.push('warn', 'slow');
    });
    expect(result.current.errorCount).toBe(1);

    act(() => {
      loggerState.clearBuffer();
    });
    expect(result.current.errorCount).toBe(0);
    expect(result.current.hasErrors).toBe(false);
  });

  it('unsubscribes when the consumer unmounts', () => {
    const { unmount } = renderHook(() => useErrorEvents());
    expect(loggerState.listeners.size).toBe(1);

    unmount();
    expect(loggerState.listeners.size).toBe(0);

    expect(() => {
      loggerState.push('error', 'after');
    }).not.toThrow();
  });
});
