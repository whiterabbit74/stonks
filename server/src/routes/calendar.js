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

// POST /api/trading-calendar/sync-webull
// Returns raw Webull trade calendar response for analysis (no file writes).
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
            try {
                const response = await getTradeCalendar(market, `${year}-01-01`, `${year}-12-31`);
                raw[year] = response;
            } catch (err) {
                raw[year] = { error: err && err.message ? err.message : String(err), errorCode: err && err.errorCode };
            }
        }

        res.json({ ok: true, market, years, raw });
    } catch (e) {
        console.error('Webull calendar fetch error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Webull calendar fetch failed' });
    }
});

module.exports = router;
