import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number as currency
 */
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format number as percentage
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date, format: 'short' | 'long' = 'short'): string {
  if (format === 'long') {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString('en-US');
}

/**
 * Parse OHLC date from YYYY-MM-DD in a timezone-safe way.
 * Stores as Date at 12:00:00 UTC for stability across timezones.
 */
export function parseOHLCDate(value: string | Date): Date {
  if (value instanceof Date) {
    // Normalize existing Date to midday UTC (use its yyyy-mm-dd)
    const ymd = value.toISOString().slice(0, 10);
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  if (typeof value === 'string') {
    // If pure YYYY-MM-DD, parse as midday UTC; otherwise fallback to native Date
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map((v) => parseInt(v, 10));
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }
    const dt = new Date(value);
    if (!isNaN(dt.getTime())) return parseOHLCDate(dt);
  }
  // Fallback to now (should not happen for valid inputs)
  return new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
}

/**
 * Format Date back to YYYY-MM-DD using its UTC day parts (stable with midday UTC storage).
 */
export function formatOHLCYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

import type { OHLCData, SplitEvent } from '../types';

/**
 * Back-adjust OHLC series for stock splits. Price fields are divided by cumulative factors,
 * volume is multiplied. Events format: { date: 'YYYY-MM-DD', factor: number }.
 */
export function adjustOHLCForSplits(ohlc: OHLCData[], splits: SplitEvent[] | undefined): OHLCData[] {
  if (!Array.isArray(ohlc) || ohlc.length === 0 || !Array.isArray(splits) || splits.length === 0) return ohlc;
  const data = [...ohlc].sort((a, b) => a.date.getTime() - b.date.getTime());
  const events = [...splits]
    .filter(s => s && s.date && s.factor && s.factor !== 1)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (events.length === 0) return ohlc;
  // For each bar, compute cumulative factor of all future splits (bar.date < split.date)
  const result: OHLCData[] = data.map(bar => ({ ...bar }));
  for (let i = 0; i < result.length; i++) {
    const t = result[i].date.getTime();
    let cumulative = 1;
    for (let k = 0; k < events.length; k++) {
      const et = new Date(events[k].date).getTime();
      if (t < et) cumulative *= events[k].factor;
    }
    if (cumulative !== 1) {
      result[i] = {
        ...result[i],
        open: result[i].open / cumulative,
        high: result[i].high / cumulative,
        low: result[i].low / cumulative,
        close: result[i].close / cumulative,
        adjClose: (result[i].adjClose ?? result[i].close) / cumulative,
        volume: Math.round(result[i].volume * cumulative),
      };
    }
  }
  return result;
}

/**
 * Deduplicate OHLC array by trading day (YYYY-MM-DD), combining duplicates into a single daily bar.
 * - open: first bar's open
 * - high: max of highs
 * - low: min of lows
 * - close: last bar's close
 * - volume: sum
 * - adjClose: last non-null adjClose if any, else derived from close
 */
export function dedupeDailyOHLC(ohlc: OHLCData[]): OHLCData[] {
  if (!Array.isArray(ohlc) || ohlc.length === 0) return ohlc;
  // Ensure stable chronological order first
  const sorted = [...ohlc].sort((a, b) => a.date.getTime() - b.date.getTime());
  const byDay = new Map<string, OHLCData>();
  for (const bar of sorted) {
    const dayKey = formatOHLCYMD(bar.date);
    const existing = byDay.get(dayKey);
    if (!existing) {
      // Normalize date to stable midday UTC for the day key
      const dayDate = parseOHLCDate(dayKey);
      byDay.set(dayKey, { ...bar, date: dayDate });
    } else {
      const high = Math.max(existing.high, bar.high);
      const low = Math.min(existing.low, bar.low);
      const close = bar.close; // last close wins in chronological order
      const volume = (existing.volume || 0) + (bar.volume || 0);
      const adjClose = (typeof bar.adjClose === 'number' && isFinite(bar.adjClose))
        ? bar.adjClose
        : existing.adjClose;
      byDay.set(dayKey, {
        ...existing,
        high,
        low,
        close,
        volume,
        adjClose,
      });
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Calculate days between two dates
 */
export function daysBetween(startDate: Date, endDate: Date): number {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Debounce function for performance optimization
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for performance optimization
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if device is mobile based on screen width
 */
export function isMobile(): boolean {
  return window.innerWidth < 768;
}

/**
 * Check if device is tablet based on screen width
 */
export function isTablet(): boolean {
  return window.innerWidth >= 768 && window.innerWidth < 1440;
}

/**
 * Get device type based on screen width
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1440) return 'tablet';
  return 'desktop';
}

/**
 * Check if device supports touch
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Get optimal chart height based on device type
 */
export function getOptimalChartHeight(deviceType: 'mobile' | 'tablet' | 'desktop'): number {
  switch (deviceType) {
    case 'mobile':
      return Math.min(window.innerHeight * 0.4, 300);
    case 'tablet':
      return Math.min(window.innerHeight * 0.5, 400);
    case 'desktop':
    default:
      return Math.min(window.innerHeight * 0.6, 500);
  }
}

/**
 * Check if device is in landscape mode
 */
export function isLandscape(): boolean {
  return window.innerWidth > window.innerHeight;
}

/**
 * Get safe area insets for mobile devices
 */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0'),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0'),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0'),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0'),
  };
}

/**
 * Detect if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Safe number parsing with fallback
 */
export function safeParseFloat(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  const parsed = parseFloat(String(value));
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Safe integer parsing with fallback
 */
export function safeParseInt(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Check if a value is a valid number
 */
export function isValidNumber(value: unknown): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Round number to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Convert string to title case
 */
export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  const cloned = {} as T;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // @ts-expect-error index signature cloning
      cloned[key] = deepClone((obj as Record<string, unknown>)[key] as unknown);
    }
  }
  
  return cloned;
}

/**
 * Check if two arrays are equal (shallow comparison)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
}

/**
 * Remove duplicates from array
 */
export function removeDuplicates<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Group array items by a key function
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}