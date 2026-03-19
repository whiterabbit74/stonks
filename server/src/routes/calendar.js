/**
 * Trading calendar routes
 */
const express = require('express');
const router = express.Router();
const { getETParts, etKeyYMD, previousTradingDayET, loadTradingCalendarJSON } = require('../services/dates');

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

module.exports = router;
