/**
 * TradingDate utilities for NYSE trading dates
 * 
 * TradingDate is a string in 'YYYY-MM-DD' format representing a NYSE trading day.
 * This is NOT a moment in time, but an identifier for a trading session.
 * It should never be converted between timezones.
 */

import type { UTCTimestamp } from 'lightweight-charts';

/**
 * TradingDate - string in 'YYYY-MM-DD' format
 * Represents a NYSE trading day identifier, not a moment in time
 */
export type TradingDate = string;

/**
 * Validate that a string is a valid TradingDate format
 */
export function isValidTradingDate(value: unknown): value is TradingDate {
    if (typeof value !== 'string') return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Parse any date-like value to TradingDate
 * Accepts: 'YYYY-MM-DD', Date objects, ISO strings
 */
export function toTradingDate(value: string | Date | unknown): TradingDate {
    if (typeof value === 'string') {
        // Already YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value as TradingDate;
        }
        // ISO string or other parseable format
        if (value.length >= 10) {
            return value.slice(0, 10) as TradingDate;
        }
    }
    if (value instanceof Date && !isNaN(value.getTime())) {
        // Use UTC parts to avoid timezone shift
        const y = value.getUTCFullYear();
        const m = String(value.getUTCMonth() + 1).padStart(2, '0');
        const d = String(value.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}` as TradingDate;
    }
    throw new Error(`Unable to parse TradingDate from: ${String(value)}`);
}

/**
 * Format TradingDate for display to user
 * @param date TradingDate in YYYY-MM-DD format
 * @param locale 'ru' for DD.MM.YYYY, 'en' for MM/DD/YYYY
 */
export function formatTradingDateDisplay(date: TradingDate, locale: 'ru' | 'en' = 'ru'): string {
    if (!isValidTradingDate(date)) {
        return date; // Return as-is if invalid
    }
    const [y, m, d] = date.split('-');
    if (locale === 'ru') {
        return `${d}.${m}.${y}`;
    }
    return `${m}/${d}/${y}`;
}

/**
 * Convert TradingDate (or any date-like value) to UTCTimestamp for lightweight-charts
 * Uses midday UTC (12:00) for stability across timezones
 */
export function toChartTimestamp(date: TradingDate | string | Date): UTCTimestamp {
    // First normalize to TradingDate format
    let tradingDate: TradingDate;
    try {
        tradingDate = toTradingDate(date);
    } catch {
        throw new Error(`Invalid TradingDate for chart: ${date}`);
    }
    const [y, m, d] = tradingDate.split('-').map(Number);
    // Midday UTC ensures consistent display regardless of user's timezone
    return Math.floor(Date.UTC(y, m - 1, d, 12, 0, 0) / 1000) as UTCTimestamp;
}

/**
 * Compare two TradingDates
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareTradingDates(a: TradingDate, b: TradingDate): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/**
 * Check if date a is before date b
 */
export function isBefore(a: TradingDate, b: TradingDate): boolean {
    return a < b;
}

/**
 * Check if date a is after date b
 */
export function isAfter(a: TradingDate, b: TradingDate): boolean {
    return a > b;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: TradingDate, b: TradingDate): boolean {
    return a === b;
}

/**
 * Check if date a is on or before date b
 */
export function isOnOrBefore(a: TradingDate, b: TradingDate): boolean {
    return a <= b;
}

/**
 * Check if date a is on or after date b
 */
export function isOnOrAfter(a: TradingDate, b: TradingDate): boolean {
    return a >= b;
}

/**
 * Calculate the number of calendar days between two TradingDates
 * (Not trading days - just calendar days for approximation)
 */
export function daysBetweenTradingDates(from: TradingDate, to: TradingDate): number {
    const [y1, m1, d1] = from.split('-').map(Number);
    const [y2, m2, d2] = to.split('-').map(Number);
    const date1 = Date.UTC(y1, m1 - 1, d1);
    const date2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
}

/**
 * Add calendar days to a TradingDate
 * (Not trading days - just calendar days)
 */
export function addDaysToTradingDate(date: TradingDate, days: number): TradingDate {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return toTradingDate(dt);
}

/**
 * Get today's date in NYSE timezone (America/New_York) as TradingDate
 */
export function getTodayNYSE(): TradingDate {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return fmt.format(now) as TradingDate;
}

/**
 * Get current time parts in NYSE timezone
 */
export function getCurrentTimeNYSE(): { year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number } {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const map: Record<string, string> = {};
    parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });

    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    return {
        year: Number(map.year),
        month: Number(map.month),
        day: Number(map.day),
        hour: Number(map.hour),
        minute: Number(map.minute),
        dayOfWeek: weekdayMap[map.weekday] ?? 0,
    };
}

/**
 * Parse TradingDate to a Date object set to midday UTC
 * Use this ONLY when you need a Date object for legacy compatibility
 * @deprecated Prefer using TradingDate directly
 */
export function tradingDateToMiddayUTC(date: TradingDate): Date {
    if (!isValidTradingDate(date)) {
        throw new Error(`Invalid TradingDate: ${date}`);
    }
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Sort an array of objects by their TradingDate field
 */
export function sortByTradingDate<T extends { date: TradingDate }>(
    items: T[],
    order: 'asc' | 'desc' = 'asc'
): T[] {
    return [...items].sort((a, b) => {
        const cmp = compareTradingDates(a.date, b.date);
        return order === 'asc' ? cmp : -cmp;
    });
}

/**
 * Get earliest and latest dates from an array of TradingDates
 */
export function getDateRange(dates: TradingDate[]): { from: TradingDate; to: TradingDate } | null {
    if (!dates.length) return null;
    const sorted = [...dates].sort();
    return { from: sorted[0], to: sorted[sorted.length - 1] };
}
