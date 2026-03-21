/**
 * Trading calendar routes
 */
const express = require('express');
const router = express.Router();
const {
    getETParts, etKeyYMD, previousTradingDayET, loadTradingCalendarJSON, saveCalendarToDb,
    observedFixedET, nthWeekdayOfMonthET, lastWeekdayOfMonthET, goodFridayET,
} = require('../services/dates');
const { getTradeCalendar } = require('../services/webullClient');

const DEFAULT_CALENDAR = {
    metadata: { version: '1.0', years: [2024, 2025] },
    holidays: {},
    shortDays: {},
    weekends: { description: 'Выходные дни автоматически определяются' },
    tradingHours: { normal: { start: '09:30', end: '16:00' }, short: { start: '09:30', end: '13:00' } }
};

router.get('/trading-calendar', async (req, res) => {
    try {
        const calendarData = await loadTradingCalendarJSON();
        res.json(calendarData || DEFAULT_CALENDAR);
    } catch (e) {
        console.error('Failed to load trading calendar:', e);
        res.status(500).json({ error: 'Failed to load trading calendar' });
    }
});

router.get('/trading/expected-prev-day', async (req, res) => {
    try {
        await loadTradingCalendarJSON().catch(() => null);
        const nowEt = getETParts(new Date());
        const prev = previousTradingDayET(nowEt);
        return res.json({ date: etKeyYMD(prev) });
    } catch (e) {
        return res.status(500).json({ error: e && e.message ? e.message : 'Failed to compute previous trading day' });
    }
});

const DAY_MS = 24 * 60 * 60 * 1000;
const WEBULL_MAX_DAYS = 29; // stay under the 30-day hard limit

function dateToYMD(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Split [startDate, endDate] into chunks of at most WEBULL_MAX_DAYS days.
function buildChunks(startDate, endDate) {
    const chunks = [];
    let cursor = new Date(startDate);
    while (cursor <= endDate) {
        const chunkEnd = new Date(Math.min(cursor.getTime() + WEBULL_MAX_DAYS * DAY_MS, endDate.getTime()));
        chunks.push({ start: dateToYMD(cursor), end: dateToYMD(chunkEnd) });
        cursor = new Date(chunkEnd.getTime() + DAY_MS);
    }
    return chunks;
}

// POST /api/trading-calendar/sync-webull
// Returns raw Webull trade calendar response for analysis (no file writes).
// Fetches in ≤29-day chunks from today to +365 days (Webull hard limit: 30 days/request).
// Body: { market: 'US' } — optional, defaults to US market.
router.post('/trading-calendar/sync-webull', async (req, res) => {
    try {
        const market = (req.body && req.body.market) || 'US';

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const yearAhead = new Date(today.getTime() + 365 * DAY_MS);

        const chunks = buildChunks(today, yearAhead);
        const raw = {};
        for (const { start, end } of chunks) {
            const key = `${start}..${end}`;
            try {
                raw[key] = await getTradeCalendar(market, start, end);
            } catch (err) {
                raw[key] = { error: err && err.message ? err.message : String(err), errorCode: err && err.errorCode };
            }
        }

        res.json({ ok: true, market, from: dateToYMD(today), to: dateToYMD(yearAhead), chunks: chunks.length, raw });
    } catch (e) {
        console.error('Webull calendar fetch error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Webull calendar fetch failed' });
    }
});

// ─── Holiday name resolution ──────────────────────────────────────────────────

function resolveHolidayName(ymd) {
    const year = parseInt(ymd.slice(0, 4));
    const mmdd = ymd.slice(5);
    try {
        const names = {
            [etKeyYMD(observedFixedET(year, 0, 1)).slice(5)]: "New Year's Day",
            [etKeyYMD(nthWeekdayOfMonthET(year, 0, 1, 3)).slice(5)]: 'Martin Luther King Jr. Day',
            [etKeyYMD(nthWeekdayOfMonthET(year, 1, 1, 3)).slice(5)]: "Presidents' Day",
            [etKeyYMD(goodFridayET(year)).slice(5)]: 'Good Friday',
            [etKeyYMD(lastWeekdayOfMonthET(year, 4, 1)).slice(5)]: 'Memorial Day',
            [etKeyYMD(observedFixedET(year, 5, 19)).slice(5)]: 'Juneteenth',
            [etKeyYMD(observedFixedET(year, 6, 4)).slice(5)]: 'Independence Day',
            [etKeyYMD(nthWeekdayOfMonthET(year, 8, 1, 1)).slice(5)]: 'Labor Day',
            [etKeyYMD(nthWeekdayOfMonthET(year, 10, 4, 4)).slice(5)]: 'Thanksgiving Day',
            [etKeyYMD(observedFixedET(year, 11, 25)).slice(5)]: 'Christmas Day',
        };
        return names[mmdd] || 'Market Holiday';
    } catch {
        return 'Market Holiday';
    }
}

function resolveShortDayName(ymd) {
    const year = parseInt(ymd.slice(0, 4));
    const mmdd = ymd.slice(5);
    if (mmdd === '12-24') return 'Christmas Eve';
    if (mmdd === '07-03') return 'Independence Day Eve';
    try {
        const thanksgiving = new Date(etKeyYMD(nthWeekdayOfMonthET(year, 10, 4, 4)) + 'T12:00:00Z');
        thanksgiving.setUTCDate(thanksgiving.getUTCDate() - 1);
        if (dateToYMD(thanksgiving) === ymd) return 'Thanksgiving Eve';
    } catch { /* ignore */ }
    return 'Early Close';
}

// Known Webull trade_date_type values. Any unknown value blocks the import.
const WEBULL_KNOWN_TYPES = new Set(['FULL_DAY', 'HALF_DAY']);

// POST /api/trading-calendar/import-webull
// Fetches Webull trade calendar from last covered date → +6 months.
// Derives holidays (weekdays absent from Webull response) and short days (HALF_DAY).
// Unknown trade_date_type values abort the import — calendar data is sensitive.
// Merges into stored calendar and saves.
router.post('/trading-calendar/import-webull', async (req, res) => {
    try {
        const market = (req.body && req.body.market) || 'US';

        // Load current calendar
        const calendarData = await loadTradingCalendarJSON().catch(() => null) || { ...DEFAULT_CALENDAR };

        // Determine start date (day after last Webull coverage, or today)
        const coverageThrough = calendarData.metadata && calendarData.metadata.webullCoverageThrough;
        let startDate;
        if (coverageThrough) {
            startDate = new Date(coverageThrough + 'T00:00:00Z');
            startDate = new Date(startDate.getTime() + DAY_MS);
        } else {
            startDate = new Date();
            startDate.setUTCHours(0, 0, 0, 0);
        }

        // End date: 6 months forward
        const endDate = new Date(startDate);
        endDate.setUTCMonth(endDate.getUTCMonth() + 6);

        // Fetch from Webull in ≤29-day chunks
        const chunks = buildChunks(startDate, endDate);
        const tradingDays = new Map(); // ymd → trade_date_type
        let fetchErrors = 0;
        const unknownTypes = new Map(); // type → first date seen

        for (const { start, end } of chunks) {
            try {
                const resp = await getTradeCalendar(market, start, end);
                const items = Array.isArray(resp && resp.data) ? resp.data : [];
                for (const item of items) {
                    if (!item || !item.trade_day) continue;
                    const type = item.trade_date_type;
                    if (type && !WEBULL_KNOWN_TYPES.has(type)) {
                        if (!unknownTypes.has(type)) unknownTypes.set(type, item.trade_day);
                    }
                    tradingDays.set(item.trade_day, type || 'FULL_DAY');
                }
            } catch (err) {
                fetchErrors++;
                console.warn(`Calendar import chunk ${start}..${end} failed:`, err && err.message);
            }
        }

        if (tradingDays.size === 0 && fetchErrors > 0) {
            return res.status(502).json({ error: 'All Webull requests failed — check credentials', fetchErrors });
        }

        // Abort if Webull returned unknown day types — calendar is sensitive data
        if (unknownTypes.size > 0) {
            const details = Array.from(unknownTypes.entries())
                .map(([type, date]) => `"${type}" (first seen: ${date})`)
                .join(', ');
            const msg = `Webull вернул неизвестные типы торговых дней: ${details}. ` +
                `Известные типы: ${Array.from(WEBULL_KNOWN_TYPES).join(', ')}. ` +
                `Импорт отменён — обновите код перед продолжением.`;
            console.error('[calendar-import]', msg);
            return res.status(422).json({ error: msg, unknownTypes: Object.fromEntries(unknownTypes) });
        }

        // Build new holidays and short days from the fetched range
        const newHolidays = {};
        const newShortDays = {};

        const cursor = new Date(startDate);
        while (cursor <= endDate) {
            const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
            if (dow !== 0 && dow !== 6) {
                const ymd = dateToYMD(cursor);
                const year = ymd.slice(0, 4);
                const mmdd = ymd.slice(5);
                const existingHoliday = calendarData.holidays && calendarData.holidays[year] && calendarData.holidays[year][mmdd];
                const existingShort = calendarData.shortDays && calendarData.shortDays[year] && calendarData.shortDays[year][mmdd];

                if (!tradingDays.has(ymd)) {
                    // Weekday absent from Webull response → holiday (market closed)
                    if (!existingHoliday) {
                        if (!newHolidays[year]) newHolidays[year] = {};
                        newHolidays[year][mmdd] = {
                            name: resolveHolidayName(ymd),
                            type: 'holiday',
                            description: 'Market Closed',
                        };
                    }
                } else if (tradingDays.get(ymd) === 'HALF_DAY') {
                    // HALF_DAY → short day (early close)
                    if (!existingShort) {
                        if (!newShortDays[year]) newShortDays[year] = {};
                        newShortDays[year][mmdd] = {
                            name: resolveShortDayName(ymd),
                            type: 'short',
                            description: 'Early close at 1:00 PM',
                            hours: 3.5,
                        };
                    }
                }
                // FULL_DAY → normal trading day, nothing to store
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        // Merge into calendar
        const mergedHolidays = { ...(calendarData.holidays || {}) };
        for (const [year, days] of Object.entries(newHolidays)) {
            mergedHolidays[year] = { ...(mergedHolidays[year] || {}), ...days };
        }
        const mergedShortDays = { ...(calendarData.shortDays || {}) };
        for (const [year, days] of Object.entries(newShortDays)) {
            mergedShortDays[year] = { ...(mergedShortDays[year] || {}), ...days };
        }

        const allYears = Array.from(new Set([
            ...Object.keys(mergedHolidays),
            ...Object.keys(mergedShortDays),
            ...((calendarData.metadata && calendarData.metadata.years) || []),
        ])).sort();

        const updatedCalendar = {
            ...calendarData,
            metadata: {
                ...(calendarData.metadata || {}),
                lastUpdated: dateToYMD(new Date()),
                webullCoverageThrough: dateToYMD(endDate),
                years: allYears,
            },
            holidays: mergedHolidays,
            shortDays: mergedShortDays,
        };

        saveCalendarToDb(updatedCalendar);

        const newHolidayCount = Object.values(newHolidays).reduce((s, y) => s + Object.keys(y).length, 0);
        const newShortDayCount = Object.values(newShortDays).reduce((s, y) => s + Object.keys(y).length, 0);

        res.json({
            ok: true,
            from: dateToYMD(startDate),
            to: dateToYMD(endDate),
            coverageThrough: dateToYMD(endDate),
            tradingDaysFound: tradingDays.size,
            newHolidays: newHolidayCount,
            newShortDays: newShortDayCount,
            fetchErrors,
        });
    } catch (e) {
        console.error('Calendar import error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Import failed' });
    }
});

// PATCH /api/trading-calendar/day
// Body: { year: "2025", mmdd: "07-04", type: "normal" | "holiday" | "short", name?: string }
// Sets the day type in the calendar. "normal" removes any overrides.
router.patch('/trading-calendar/day', async (req, res) => {
    try {
        const { year, mmdd, type, name } = req.body || {};
        if (!year || !mmdd || !type) {
            return res.status(400).json({ error: 'year, mmdd and type are required' });
        }
        if (!['normal', 'holiday', 'short'].includes(type)) {
            return res.status(400).json({ error: 'type must be normal, holiday or short' });
        }

        const calendarData = await loadTradingCalendarJSON().catch(() => null) || { ...DEFAULT_CALENDAR };

        // Remove from both collections first
        if (calendarData.holidays[year]) delete calendarData.holidays[year][mmdd];
        if (calendarData.shortDays[year]) delete calendarData.shortDays[year][mmdd];

        const ymd = `${year}-${mmdd}`;

        if (type === 'holiday') {
            if (!calendarData.holidays[year]) calendarData.holidays[year] = {};
            calendarData.holidays[year][mmdd] = {
                name: name || resolveHolidayName(ymd),
                type: 'holiday',
                description: 'Market Closed',
            };
        } else if (type === 'short') {
            if (!calendarData.shortDays[year]) calendarData.shortDays[year] = {};
            calendarData.shortDays[year][mmdd] = {
                name: name || resolveShortDayName(ymd),
                type: 'short',
                description: 'Early close at 1:00 PM',
                hours: 3.5,
            };
        }

        // Ensure year is listed in metadata
        const years = Array.from(new Set([
            ...((calendarData.metadata && calendarData.metadata.years) || []),
            year,
            ...Object.keys(calendarData.holidays),
            ...Object.keys(calendarData.shortDays),
        ])).sort();
        calendarData.metadata = { ...(calendarData.metadata || {}), years, lastUpdated: dateToYMD(new Date()) };

        saveCalendarToDb(calendarData);
        res.json({ ok: true, year, mmdd, type });
    } catch (e) {
        console.error('Calendar day update error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to update day' });
    }
});

module.exports = router;
