import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializeErrorLogger,
  cleanupErrorLogger,
  logError,
  logWarn,
  logInfo,
  subscribe,
  getRecentEvents,
  clearEvents,
  type LoggedEvent,
  type ErrorLevel,
  type ErrorCategory
} from '../error-logger';

describe('Error Logger', () => {
  beforeEach(() => {
    clearEvents();
    cleanupErrorLogger();
  });

  afterEach(() => {
    cleanupErrorLogger();
  });

  describe('Basic Logging', () => {
    it('should log error events', () => {
      logError('test', 'Test error message', { key: 'value' }, 'TestComponent');
      
      const events = getRecentEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.level).toBe('error');
      expect(event.category).toBe('test');
      expect(event.message).toBe('Test error message');
      expect(event.source).toBe('TestComponent');
      expect(event.context).toEqual({ key: 'value' });
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it('should log warning events', () => {
      logWarn('ui', 'Test warning message');
      
      const events = getRecentEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.level).toBe('warn');
      expect(event.category).toBe('ui');
      expect(event.message).toBe('Test warning message');
    });

    it('should log info events', () => {
      logInfo('network', 'Test info message');
      
      const events = getRecentEvents();
      expect(events).toHaveLength(1);
      
      const event = events[0];
      expect(event.level).toBe('info');
      expect(event.category).toBe('network');
      expect(event.message).toBe('Test info message');
    });
  });

  describe('Event Management', () => {
    it('should maintain event order', () => {
      logError('test', 'First error');
      logWarn('test', 'Second warning');
      logInfo('test', 'Third info');
      
      const events = getRecentEvents();
      expect(events).toHaveLength(3);
      expect(events[0].message).toBe('First error');
      expect(events[1].message).toBe('Second warning');
      expect(events[2].message).toBe('Third info');
    });

    it('should clear all events', () => {
      logError('test', 'Test error');
      logWarn('test', 'Test warning');
      
      expect(getRecentEvents()).toHaveLength(2);
      
      clearEvents();
      
      expect(getRecentEvents()).toHaveLength(0);
    });

    it('should limit maximum events (ring buffer)', () => {
      // Log more than MAX_EVENTS (500)
      for (let i = 0; i < 600; i++) {
        logError('test', `Error ${i}`);
      }
      
      const events = getRecentEvents();
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
      
      logError('test', 'Test error');
      
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
      
      logWarn('test', 'Test warning');
      
      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(1);
    });

    it('should allow unsubscribing', () => {
      const subscriber = vi.fn();
      const unsubscribe = subscribe(subscriber);
      
      logError('test', 'Test error 1');
      expect(subscriber).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      logError('test', 'Test error 2');
      expect(subscriber).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });

  describe('Global Error Handling', () => {
    it('should initialize and cleanup global handlers', () => {
      const originalErrorHandler = window.onerror;
      const originalUnhandledRejectionHandler = window.onunhandledrejection;
      
      initializeErrorLogger();
      
      expect(window.onerror).not.toBe(originalErrorHandler);
      expect(window.onunhandledrejection).not.toBe(originalUnhandledRejectionHandler);
      
      cleanupErrorLogger();
      
      expect(window.onerror).toBe(originalErrorHandler);
      expect(window.onunhandledrejection).toBe(originalUnhandledRejectionHandler);
    });

    it('should capture global errors', () => {
      initializeErrorLogger();
      
      // Simulate a global error
      const errorEvent = new ErrorEvent('error', {
        message: 'Global error',
        filename: 'test.js',
        lineno: 42
      });
      
      window.dispatchEvent(errorEvent);
      
      const events = getRecentEvents();
      const errorEvents = events.filter(e => e.level === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });

    it('should capture unhandled promise rejections', () => {
      initializeErrorLogger();
      
      // Simulate an unhandled promise rejection
      const rejectionEvent = new PromiseRejectionEvent('unhandledrejection', {
        promise: Promise.reject(new Error('Unhandled rejection')),
        reason: new Error('Unhandled rejection')
      });
      
      window.dispatchEvent(rejectionEvent);
      
      const events = getRecentEvents();
      const errorEvents = events.filter(e => e.level === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize network errors', () => {
      const networkError = new Error('Failed to fetch');
      logError('network', 'Network request failed', {}, 'API', networkError.stack);
      
      const events = getRecentEvents();
      expect(events[0].category).toBe('network');
    });

    it('should categorize chart errors', () => {
      const chartError = new Error('Series error');
      chartError.stack = 'Error at lightweight-charts';
      logError('chart', 'Chart rendering failed', {}, 'EquityChart', chartError.stack);
      
      const events = getRecentEvents();
      expect(events[0].category).toBe('chart');
    });

    it('should handle unknown error types', () => {
      logError('unknown', 'Unknown error', {}, 'Unknown');
      
      const events = getRecentEvents();
      expect(events[0].category).toBe('unknown');
    });
  });

  describe('Context and Stack Traces', () => {
    it('should include stack traces when provided', () => {
      const error = new Error('Test error');
      logError('test', 'Error with stack', {}, 'Component', error.stack);
      
      const events = getRecentEvents();
      expect(events[0].stack).toBeDefined();
      expect(events[0].stack).toContain('Error: Test error');
    });

    it('should include context data', () => {
      const context = {
        userId: '123',
        action: 'save',
        data: { value: 42 }
      };
      
      logError('test', 'Error with context', context);
      
      const events = getRecentEvents();
      expect(events[0].context).toEqual(context);
    });

    it('should handle complex context objects', () => {
      const complexContext = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, 3],
        date: new Date('2024-01-01'),
        func: () => 'test' // Functions should be handled gracefully
      };
      
      logError('test', 'Complex context', complexContext);
      
      const events = getRecentEvents();
      expect(events[0].context).toBeDefined();
      // Function should be serialized or removed
      expect(typeof events[0].context?.func).not.toBe('function');
    });
  });

  describe('Performance', () => {
    it('should handle rapid logging without blocking', () => {
      const start = performance.now();
      
      // Log many events rapidly
      for (let i = 0; i < 100; i++) {
        logError('test', `Rapid error ${i}`);
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete quickly (less than 100ms for 100 logs)
      expect(duration).toBeLessThan(100);
      
      const events = getRecentEvents();
      expect(events).toHaveLength(100);
    });
  });
});