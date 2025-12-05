/**
 * Date and trading calendar utilities
 * Handles ET timezone, NYSE holidays, trading day calculations
 */
const fs = require('fs-extra');
const { TRADING_CALENDAR_FILE } = require('../config');

// Cache for trading calendar
let _tradingCalendarCache = { data: null, loadedAt: 0 };
const TRADING_CALENDAR_TTL_MS = 5 * 60 * 1000;

// Helpers for ET (America/New_York)
function getETParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        weekday: 'short'
    });
    const parts = fmt.formatToParts(date);
    const map = {};
    parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
    const y = Number(map.year), m = Number(map.month), d = Number(map.day), hh = Number(map.hour), mm = Number(map.minute);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[map.weekday] ?? 0;
    return { y, m, d, hh, mm, weekday };
}

function etKeyYMD(p) {
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function isWeekendET(p) {
    return p.weekday === 0 || p.weekday === 6;
}

function nthWeekdayOfMonthET(year, monthIndex0, weekday, n) {
    let cursor = new Date(Date.UTC(year, monthIndex0, 1, 12, 0, 0));
    while (getETParts(cursor).weekday !== weekday) { cursor.setUTCDate(cursor.getUTCDate() + 1); }
    for (let i = 1; i < n; i++) { cursor.setUTCDate(cursor.getUTCDate() + 7); }
    return getETParts(cursor);
}

function lastWeekdayOfMonthET(year, monthIndex0, weekday) {
    let cursor = new Date(Date.UTC(year, monthIndex0 + 1, 0, 12, 0, 0));
    while (getETParts(cursor).weekday !== weekday) { cursor.setUTCDate(cursor.getUTCDate() - 1); }
    return getETParts(cursor);
}

function observedFixedET(year, monthIndex0, day) {
    const base = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
    const p = getETParts(base);
    if (p.weekday === 0) { base.setUTCDate(base.getUTCDate() + 1); return getETParts(base); }
    if (p.weekday === 6) { base.setUTCDate(base.getUTCDate() - 1); return getETParts(base); }
    return p;
}

function easterUTC(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function goodFridayET(year) {
    const e = easterUTC(year);
    e.setUTCDate(e.getUTCDate() - 2);
    return getETParts(e);
}

function nyseHolidaysET(year) {
    const set = new Set();
    set.add(etKeyYMD(observedFixedET(year, 0, 1))); // New Year
    set.add(etKeyYMD(observedFixedET(year, 5, 19))); // Juneteenth
    set.add(etKeyYMD(observedFixedET(year, 6, 4)));  // Independence Day
    set.add(etKeyYMD(observedFixedET(year, 11, 25))); // Christmas
    set.add(etKeyYMD(nthWeekdayOfMonthET(year, 0, 1, 3))); // MLK Mon
    set.add(etKeyYMD(nthWeekdayOfMonthET(year, 1, 1, 3))); // Presidents Mon
    set.add(etKeyYMD(goodFridayET(year))); // Good Friday
    set.add(etKeyYMD(lastWeekdayOfMonthET(year, 4, 1))); // Memorial Mon
    set.add(etKeyYMD(nthWeekdayOfMonthET(year, 8, 1, 1))); // Labor Mon
    set.add(etKeyYMD(nthWeekdayOfMonthET(year, 10, 4, 4))); // Thanksgiving Thu
    return set;
}

function isTradingDayET(p) {
    return !isWeekendET(p) && !nyseHolidaysET(p.y).has(etKeyYMD(p));
}

// Calendar JSON helpers
async function loadTradingCalendarJSON() {
    try {
        const nowTs = Date.now();
        if (_tradingCalendarCache.data && (nowTs - _tradingCalendarCache.loadedAt) < TRADING_CALENDAR_TTL_MS) {
            return _tradingCalendarCache.data;
        }
        if (await fs.pathExists(TRADING_CALENDAR_FILE)) {
            const json = await fs.readJson(TRADING_CALENDAR_FILE);
            _tradingCalendarCache = { data: json, loadedAt: nowTs };
            return json;
        }
    } catch { }
    return null;
}

function getCachedTradingCalendar() {
    return _tradingCalendarCache.data || null;
}

function parseHmToMinutes(hm) {
    try {
        if (!hm || typeof hm !== 'string' || hm.indexOf(':') < 0) return null;
        const [h, m] = hm.split(':');
        const hh = parseInt(h, 10);
        const mm = parseInt(m, 10);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return hh * 60 + mm;
    } catch { return null; }
}

function isHolidayByCalendarET(p, cal) {
    try {
        if (!cal || !cal.holidays) return false;
        const y = String(p.y);
        const key = `${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
        return !!(cal.holidays[y] && cal.holidays[y][key]);
    } catch { return false; }
}

function isShortDayByCalendarET(p, cal) {
    try {
        if (!cal || !cal.shortDays) return false;
        const y = String(p.y);
        const key = `${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
        return !!(cal.shortDays[y] && cal.shortDays[y][key]);
    } catch { return false; }
}

function isTradingDayByCalendarET(p, cal) {
    if (isWeekendET(p)) return false;
    if (cal) return !isHolidayByCalendarET(p, cal);
    return isTradingDayET(p);
}

function getTradingSessionForDateET(p, cal) {
    const normalEnd = parseHmToMinutes(cal?.tradingHours?.normal?.end || '16:00') ?? (16 * 60);
    const shortEnd = parseHmToMinutes(cal?.tradingHours?.short?.end || '13:00') ?? (13 * 60);
    const startMin = parseHmToMinutes(cal?.tradingHours?.normal?.start || '09:30') ?? (9 * 60 + 30);
    const short = !!(cal && isShortDayByCalendarET(p, cal));
    const closeMin = short ? shortEnd : normalEnd;
    return { openMin: startMin, closeMin, short };
}

function previousTradingDayET(fromParts) {
    let cursor = new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d, 12, 0, 0));
    cursor.setUTCDate(cursor.getUTCDate() - 1);

    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
        const p = getETParts(cursor);
        const cal = getCachedTradingCalendar();
        if (isTradingDayByCalendarET(p, cal)) return p;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
        attempts++;
    }

    console.warn('Could not find previous trading day within 30 days, using fallback');
    const fallbackDate = new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d - 1, 12, 0, 0));
    return getETParts(fallbackDate);
}

function buildFreshnessLine(ohlc, nowEtParts) {
    try {
        if (!Array.isArray(ohlc) || ohlc.length === 0) return 'Data: unknown';
        const prev = previousTradingDayET(nowEtParts);
        const expected = `${prev.y}-${String(prev.m).padStart(2, '0')}-${String(prev.d).padStart(2, '0')}`;
        const hasPrev = ohlc.some(r => r && r.date === expected);
        return hasPrev ? 'Data: fresh' : `Data: STALE (missing ${expected})`;
    } catch {
        return 'Data: unknown';
    }
}

module.exports = {
    getETParts,
    etKeyYMD,
    isWeekendET,
    nthWeekdayOfMonthET,
    lastWeekdayOfMonthET,
    observedFixedET,
    easterUTC,
    goodFridayET,
    nyseHolidaysET,
    isTradingDayET,
    loadTradingCalendarJSON,
    getCachedTradingCalendar,
    parseHmToMinutes,
    isHolidayByCalendarET,
    isShortDayByCalendarET,
    isTradingDayByCalendarET,
    getTradingSessionForDateET,
    previousTradingDayET,
    buildFreshnessLine,
};
