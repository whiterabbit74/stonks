
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  log,
  logError,
  logWarn,
  logInfo,
  captureException,
  subscribe,
  getEvents,
  clearEvents,
  initErrorLogger,
  destroyErrorLogger,
  ErrorLevel,
  ErrorCategory
} from '../error-logger';

describe('Error Logger', () => {
  beforeEach(() => {
    clearEvents();
    destroyErrorLogger();
  });

  afterEach(() => {
    destroyErrorLogger();
    clearEvents();
    vi.restoreAllMocks();
  });

  describe('Basic Logging', () => {
    it('should log error events', () => {
      logError('unknown', 'Test error message', { key: 'value' }, 'TestComponent');

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.level).toBe('error');
      expect(event.category).toBe('unknown');
      expect(event.message).toBe('Test error message');
      expect(event.source).toBe('TestComponent');
      expect(event.context).toEqual({ key: 'value' });
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should log warning events', () => {
      logWarn('unknown', 'Test warning message');

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.level).toBe('warn');
      expect(event.category).toBe('unknown');
      expect(event.message).toBe('Test warning message');
    });

    it('should log info events', () => {
      logInfo('network', 'Test info message');

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.level).toBe('info');
      expect(event.category).toBe('network');
      expect(event.message).toBe('Test info message');
    });
  });

  describe('Event Management', () => {
    it('should maintain event order', () => {
      logError('unknown', 'First error');
      logWarn('unknown', 'Second warning');
      logInfo('unknown', 'Third info');

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events).toHaveLength(3);
      expect(events[0].message).toBe('First error');
      expect(events[1].message).toBe('Second warning');
      expect(events[2].message).toBe('Third info');
    });

    it('should clear all events', () => {
      logError('unknown', 'Test error');
      logWarn('unknown', 'Test warning');

      expect(getEvents().filter(e => e.category !== 'ui')).toHaveLength(2);

      clearEvents();

      expect(getEvents().filter(e => e.category !== 'ui')).toHaveLength(0);
    });

    it('should limit maximum events (ring buffer)', () => {
      // Log more than MAX_EVENTS (500)
      for (let i = 0; i < 600; i++) {
        logError('unknown', `Error ${i}`);
      }

      const events = getEvents();
      expect(events.length).toBeLessThanOrEqual(500);

      // Should keep most recent events
      const lastEvent = events[events.length - 1];
      expect(lastEvent.message).toBe('Error 599');
    });
  });

  describe('Subscriptions', () => {
    it('should notify subscribers of new events', () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribe(subscriber);
      subscriber.mockClear(); // Clear initial call

      logError('unknown', 'Test error');

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Test error'
        }),
        expect.arrayContaining([expect.any(Object)])
      );

      unsubscribe();
    });

    it('should handle multiple subscribers', () => {
      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      subscribe(subscriber1);
      subscribe(subscriber2);
      subscriber1.mockClear();
      subscriber2.mockClear();

      logWarn('unknown', 'Test warning');

      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribe(subscriber);
      subscriber.mockClear();

      logError('unknown', 'Test error 1');
      expect(subscriber).toHaveBeenCalledTimes(1);

      unsubscribe();

      logError('unknown', 'Test error 2');
      expect(subscriber).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('Global Error Handling', () => {
    // Polyfill PromiseRejectionEvent
    class MockPromiseRejectionEvent extends Event {
      promise: Promise<any>;
      reason: any;
      constructor(type: string, options: PromiseRejectionEventInit) {
        super(type, options);
        this.promise = options.promise;
        this.reason = options.reason;
      }
    }
    global.PromiseRejectionEvent = MockPromiseRejectionEvent as any;

    it('should initialize and cleanup global handlers', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      initErrorLogger();

      expect(addEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

      destroyErrorLogger();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('error', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('should capture global errors', () => {
      initErrorLogger();

      // Simulate a global error
      const errorEvent = new ErrorEvent('error', {
        message: 'Global error',
        filename: 'test.js',
        lineno: 42,
        error: new Error('Global error')
      });

      window.dispatchEvent(errorEvent);

      const events = getEvents();
      const errorEvents = events.filter(e => e.level === 'error' && e.message === 'Global error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should capture unhandled promise rejections', () => {
      initErrorLogger();

      // Simulate an unhandled promise rejection
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.resolve(), // Use resolve to avoid Vitest failing the test
        reason: new Error('Unhandled rejection')
      });

      window.dispatchEvent(rejectionEvent);


      const events = getEvents();
      const errorEvents = events.filter(e => e.level === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize network errors', () => {
      const networkError = new Error('Failed to fetch');
      logError('network', 'Network request failed', {}, 'API', networkError.stack);

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events[0].category).toBe('network');
    });

    it('should categorize chart errors', () => {
      const chartError = new Error('Series error');
      chartError.stack = 'Error at lightweight-charts';
      logError('chart', 'Chart rendering failed', {}, 'EquityChart', chartError.stack);

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events[0].category).toBe('chart');
    });

    it('should handle "unknown" error types', () => {
      logError('unknown', 'Unknown error', {}, 'Unknown');

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events[0].category).toBe('unknown');
    });
  });

  describe('Context and Stack Traces', () => {
    it('should include stack traces when provided', () => {
      const error = new Error('Test error');
      logError('unknown', 'Error with stack', {}, 'Component', error.stack);

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events[0].stack).toBeDefined();
      expect(events[0].stack).toContain('Error: Test error');
    });

    it('should include context data', () => {
      const context = {
        userId: '123',
        action: 'save',
        data: { value: 42 }
      };

      logError('unknown', 'Error with context', context);

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events[0].context).toEqual(context);
    });

    it('should handle complex context objects', () => {
      const complexContext = {
        nested: { deep: { value: 'unknown' } },
        array: [1, 2, 3],
        date: '2024-01-01',
        func: () => 'unknown' // Functions should be handled gracefully
      };

      logError('unknown', 'Complex context', complexContext);

      const events = getEvents().filter(e => e.category !== 'ui');
      expect(events[0].context).toBeDefined();
      expect(events[0].context).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle rapid logging without blocking', () => {
      const start = performance.now();

      // Log many events rapidly
      for (let i = 0; i < 100; i++) {
        logError('unknown', `Rapid error ${i} `);
      }

      const end = performance.now();
      const duration = end - start;

      // Should complete quickly (less than 100ms for 100 logs)
      expect(duration).toBeLessThan(100);

      const events = getEvents();
      // 100 logged events + 1 clear event from beforeEach
      expect(events.length).toBeGreaterThanOrEqual(100);
    });
  });
});