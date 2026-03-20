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

// Webull allows max 30 days per request — split a year into monthly chunks.
function monthChunksForYear(year) {
    const chunks = [];
    for (let month = 0; month < 12; month++) {
        const start = new Date(Date.UTC(year, month, 1));
        const end = new Date(Date.UTC(year, month + 1, 0)); // last day of month
        const pad = (n) => String(n).padStart(2, '0');
        chunks.push({
            start: `${year}-${pad(month + 1)}-01`,
            end: `${year}-${pad(month + 1)}-${pad(end.getUTCDate())}`,
        });
    }
    return chunks;
}

// POST /api/trading-calendar/sync-webull
// Returns raw Webull trade calendar response for analysis (no file writes).
// Fetches month-by-month because Webull limits queries to 30 days.
// Body: { years: [2026], market: 'US' } — all optional, defaults to current + next year, US market.
router.post('/trading-calendar/sync-webull', async (req, res) => {
    try {
        const nowEt = getETParts(new Date());
        const years = req.body && Array.isArray(req.body.years)
            ? req.body.years.map(Number)
            : [nowEt.y, nowEt.y + 1];
        const market = (req.body && req.body.market) || 'US';

        const raw = {};
        for (const year of years) {
            const months = {};
            for (const { start, end } of monthChunksForYear(year)) {
                const monthKey = start.slice(0, 7); // "YYYY-MM"
                try {
                    months[monthKey] = await getTradeCalendar(market, start, end);
                } catch (err) {
                    months[monthKey] = { error: err && err.message ? err.message : String(err), errorCode: err && err.errorCode };
                }
            }
            raw[year] = months;
        }

        res.json({ ok: true, market, years, raw });
    } catch (e) {
        console.error('Webull calendar fetch error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Webull calendar fetch failed' });
    }
});

module.exports = router;
