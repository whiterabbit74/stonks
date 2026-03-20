/**
 * Trading calendar routes
 */
const express = require('express');
const router = express.Router();
const { getETParts, etKeyYMD, previousTradingDayET, loadTradingCalendarJSON } = require('../services/dates');
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

module.exports = router;
