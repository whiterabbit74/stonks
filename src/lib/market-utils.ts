/**
 * Single source of truth for "is the NYSE currently open" — used by the
 * "Рынок открыт/закрыт" badge on every page. Without a trading calendar it
 * falls back to regular hours (9:30–16:00 ET, weekdays). With a calendar it
 * also honours holidays and short (half) days.
 */

export type TradingCalendarData = {
  metadata?: { years?: Array<string | number> };
  holidays?: Record<string, unknown>;
  shortDays?: Record<string, unknown>;
  tradingHours?: {
    normal?: { start?: string; end?: string };
    short?: { start?: string; end?: string };
  };
};

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Looks up a Y/M/D entry in a calendar map that may be keyed either by
 * year → "MM-DD", or flat by "YYYY-MM-DD".
 */
export function hasCalendarDateEntry(
  map: Record<string, unknown> | undefined,
  y: number,
  m: number,
  d: number
): boolean {
  if (!map || typeof map !== 'object') return false;

  const yearKey = String(y);
  const monthDayKey = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fullDateKey = `${yearKey}-${monthDayKey}`;
  const root = map as Record<string, unknown>;

  const byYear = root[yearKey];
  if (byYear && typeof byYear === 'object' && !Array.isArray(byYear)) {
    return Boolean((byYear as Record<string, unknown>)[monthDayKey]);
  }

  return Boolean(root[fullDateKey]);
}

function parseHmToMinutes(hm: string | undefined | null): number | null {
  if (!hm || typeof hm !== 'string' || hm.indexOf(':') < 0) return null;
  const [h, m] = hm.split(':');
  const hours = parseInt(h, 10);
  const minutes = parseInt(m, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Returns true if NYSE is currently in regular trading hours.
 * Pass the trading calendar to also account for holidays / short days.
 */
export function getIsMarketOpen(calendar?: TradingCalendarData | null): boolean {
  const parts = ET_FMT.formatToParts(new Date());
  const map: Record<string, string> = {};
  parts.forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });

  const weekday = WEEKDAY_INDEX[map.weekday] ?? 0;
  if (weekday === 0 || weekday === 6) return false;

  const y = Number(map.year);
  const mo = Number(map.month);
  const d = Number(map.day);
  const minutes = (parseInt(map.hour || '0', 10) % 24) * 60 + parseInt(map.minute || '0', 10);

  if (calendar && hasCalendarDateEntry(calendar.holidays, y, mo, d)) return false;

  const short = calendar ? hasCalendarDateEntry(calendar.shortDays, y, mo, d) : false;
  const openMin = parseHmToMinutes(calendar?.tradingHours?.normal?.start) ?? (9 * 60 + 30);
  const closeMin = short
    ? (parseHmToMinutes(calendar?.tradingHours?.short?.end) ?? (13 * 60))
    : (parseHmToMinutes(calendar?.tradingHours?.normal?.end) ?? (16 * 60));

  return minutes >= openMin && minutes < closeMin;
}
