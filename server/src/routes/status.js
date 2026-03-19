/**
 * Status route
 */
const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
    let db = null;
    try {
        db = require('../db').getDb();
    } catch { }

    const datasets = db
        ? db.prepare('SELECT COUNT(*) as c FROM dataset_meta').get().c
        : null;
    const ohlcRows = db
        ? db.prepare('SELECT COUNT(*) as c FROM ohlc').get().c
        : null;

    res.json({
        status: 'ok',
        message: 'Trading Backtester API is running',
        timestamp: new Date().toISOString(),
        buildId: process.env.BUILD_ID || null,
        db: {
            connected: db !== null,
            datasets,
            ohlcRows,
        },
    });
});

module.exports = router;
