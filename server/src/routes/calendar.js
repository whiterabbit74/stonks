/**
 * Trading calendar routes
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { TRADING_CALENDAR_FILE, SERVER_DIR } = require('../config');
const { getETParts, etKeyYMD, previousTradingDayET, loadTradingCalendarJSON } = require('../services/dates');

router.get('/trading-calendar', async (req, res) => {
    try {
        const calendarPath = path.join(SERVER_DIR, 'trading-calendar.json');
        let calendarData;

        if (await fs.pathExists(calendarPath)) {
            calendarData = await fs.readJson(calendarPath);
        } else {
            calendarData = {
                metadata: { version: "1.0", years: [2024, 2025] },
                holidays: {
                    "2024-01-01": "Новый год",
                    "2024-02-23": "День защитника Отечества",
                    "2024-03-08": "Международный женский день",
                    "2024-05-01": "Праздник Весны и Труда",
                    "2024-05-09": "День Победы",
                    "2024-06-12": "День России",
                    "2024-11-04": "День народного единства",
                    "2025-01-01": "Новый год",
                    "2025-02-23": "День защитника Отечества",
                    "2025-03-08": "Международный женский день",
                    "2025-05-01": "Праздник Весны и Труда",
                    "2025-05-09": "День Победы",
                    "2025-06-12": "День России",
                    "2025-11-04": "День народного единства"
                },
                shortDays: {
                    "2024-02-22": "Короткий день перед праздником",
                    "2024-03-07": "Короткий день перед праздником",
                    "2024-04-30": "Короткий день перед праздником",
                    "2024-06-11": "Короткий день перед праздником",
                    "2024-11-03": "Короткий день перед праздником",
                    "2025-02-22": "Короткий день перед праздником",
                    "2025-03-07": "Короткий день перед праздником",
                    "2025-04-30": "Короткий день перед праздником",
                    "2025-06-11": "Короткий день перед праздником",
                    "2025-11-03": "Короткий день перед праздником"
                },
                weekends: { description: "Выходные дни автоматически определяются" },
                tradingHours: {
                    normal: { start: "10:00", end: "18:40" },
                    short: { start: "10:00", end: "14:00" }
                }
            };
        }

        res.json(calendarData);
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
