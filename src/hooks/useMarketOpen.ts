import { useEffect, useState } from 'react';
import { DatasetAPI } from '../lib/api';
import { getIsMarketOpen, type TradingCalendarData } from '../lib/market-utils';

// The trading calendar is identical for every page/ticker, so fetch it once
// and share it across all useMarketOpen() consumers.
let cachedCalendar: TradingCalendarData | null = null;
let calendarPromise: Promise<TradingCalendarData | null> | null = null;

function loadCalendarOnce(): Promise<TradingCalendarData | null> {
  if (cachedCalendar) return Promise.resolve(cachedCalendar);
  if (!calendarPromise) {
    calendarPromise = DatasetAPI.getTradingCalendar()
      .then((cal) => {
        cachedCalendar = (cal ?? null) as TradingCalendarData | null;
        return cachedCalendar;
      })
      .catch(() => {
        calendarPromise = null; // allow a later retry
        return null;
      });
  }
  return calendarPromise;
}

/**
 * Calendar-aware "is the market open right now" for the "Рынок открыт/закрыт"
 * badge. Re-evaluates on an interval so the badge flips at the open/close.
 */
export function useMarketOpen(pollMs = 60_000): boolean {
  const [calendar, setCalendar] = useState<TradingCalendarData | null>(cachedCalendar);
  const [open, setOpen] = useState<boolean>(() => getIsMarketOpen(cachedCalendar));

  useEffect(() => {
    if (calendar) return;
    let active = true;
    void loadCalendarOnce().then((cal) => {
      if (active && cal) setCalendar(cal);
    });
    return () => { active = false; };
  }, [calendar]);

  useEffect(() => {
    setOpen(getIsMarketOpen(calendar));
    const id = setInterval(() => setOpen(getIsMarketOpen(calendar)), pollMs);
    return () => clearInterval(id);
  }, [calendar, pollMs]);

  return open;
}
