import type { OHLCData, TradingDate } from '../types';

export type CandleTimeframe = 'daily' | 'weekly';

function toIsoDate(value: string): TradingDate {
  return value.slice(0, 10) as TradingDate;
}

function getWeekKey(date: string): string {
  const parsed = new Date(`${toIsoDate(date)}T00:00:00Z`);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((parsed.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${parsed.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

export function aggregateOhlcToWeekly(data: OHLCData[]): OHLCData[] {
  if (!Array.isArray(data) || data.length === 0) return [];

  const sorted = [...data]
    .filter((bar) => bar && typeof bar.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date));

  const weekly: OHLCData[] = [];
  let currentWeekKey = '';
  let current: OHLCData | null = null;

  for (const bar of sorted) {
    const weekKey = getWeekKey(bar.date);
    const normalized: OHLCData = {
      ...bar,
      date: toIsoDate(bar.date),
      volume: Number.isFinite(Number(bar.volume)) ? Number(bar.volume) : 0,
    };

    if (!current || weekKey !== currentWeekKey) {
      if (current) weekly.push(current);
      currentWeekKey = weekKey;
      current = { ...normalized };
      continue;
    }

    current.high = Math.max(current.high, normalized.high);
    current.low = Math.min(current.low, normalized.low);
    current.close = normalized.close;
    current.adjClose = normalized.adjClose;
    current.volume += normalized.volume;
    current.date = normalized.date;
  }

  if (current) weekly.push(current);
  return weekly;
}

export function mapDateToAggregatedBarTime(
  date: string,
  timeframe: CandleTimeframe,
  bars: OHLCData[]
): TradingDate {
  const normalizedDate = toIsoDate(date);
  if (timeframe === 'daily') return normalizedDate;

  const targetWeek = getWeekKey(normalizedDate);
  const match = bars.find((bar) => getWeekKey(bar.date) === targetWeek);
  return match?.date ?? normalizedDate;
}
