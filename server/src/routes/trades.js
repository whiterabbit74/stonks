/**
 * Trades routes
 */
const express = require('express');
const router = express.Router();
const {
    loadTradeHistory,
    getSortedTradeHistory,
    getCurrentOpenTrade,
    serializeTradeForResponse,
    getTradeHistory,
    isTradeHistoryLoaded
} = require('../services/trades');

router.get('/trades', async (req, res) => {
    try {
        if (!isTradeHistoryLoaded()) {
            await loadTradeHistory();
        }
        const sorted = getSortedTradeHistory();
        const openTrade = getCurrentOpenTrade();
        res.json({
            trades: sorted.map(serializeTradeForResponse),
            openTrade: openTrade ? serializeTradeForResponse(openTrade) : null,
            total: getTradeHistory().length,
            lastUpdated: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to load trade history' });
    }
});

module.exports = router;
