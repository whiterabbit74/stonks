import { useState, useEffect } from 'react';
import { getEvents, subscribe, type LoggedEvent } from '../lib/error-logger';

/**
 * Hook for tracking error events and getting real-time error count
 */
export function useErrorEvents() {
  const [errorCount, setErrorCount] = useState(0);
  const [events, setEvents] = useState<LoggedEvent[]>([]);

  useEffect(() => {
    // Initialize with current events
    const currentEvents = getEvents();
    setEvents(currentEvents);
    
    // Count only actual errors (not warnings or info)
    const errors = currentEvents.filter(event => event.level === 'error');
    setErrorCount(errors.length);

    // Subscribe to new events
    const unsubscribe = subscribe((event, allEvents) => {
      // Skip synthetic init/clear events
      if (event.id === '__init__' || event.message === 'clear') {
        setEvents(allEvents);
        const errors = allEvents.filter(e => e.level === 'error');
        setErrorCount(errors.length);
        return;
      }

      setEvents(allEvents);
      
      // Count only actual errors
      const errors = allEvents.filter(e => e.level === 'error');
      setErrorCount(errors.length);
    });

    return unsubscribe;
  }, []);

  return {
    errorCount,
    events,
    hasErrors: errorCount > 0
  };
}