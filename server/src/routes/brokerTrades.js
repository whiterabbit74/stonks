/**
 * Broker trades routes — /api/broker-trades
 */
const express = require('express');
const router = express.Router();
const {
    getSortedBrokerTrades,
    getCurrentOpenBrokerTrade,
    serializeBrokerTradeForResponse,
    createManualBrokerTrade,
    updateBrokerTrade,
    deleteBrokerTrade,
} = require('../services/brokerTrades');

// GET /api/broker-trades — list all broker trades (includeHidden=1 to include hidden)
router.get('/broker-trades', (req, res) => {
    try {
        const sorted = getSortedBrokerTrades();
        const includeHidden = req.query.includeHidden === '1';
        const filtered = includeHidden ? sorted : sorted.filter(t => !t.isHidden);
        const openTrade = getCurrentOpenBrokerTrade();
        res.json({
            trades: filtered.map(serializeBrokerTradeForResponse),
            openTrade: openTrade ? serializeBrokerTradeForResponse(openTrade) : null,
            total: sorted.length,
            lastUpdated: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to load broker trades' });
    }
});

// POST /api/broker-trades — create manual broker trade
router.post('/broker-trades', (req, res) => {
    try {
        const { symbol, entryDate, exitDate, entryPrice, exitPrice, entryIBS, exitIBS, notes, quantity } = req.body;
        if (!symbol) return res.status(400).json({ error: 'symbol is required' });
        const trade = createManualBrokerTrade({ symbol, entryDate, exitDate, entryPrice, exitPrice, entryIBS, exitIBS, notes, quantity });
        if (!trade) return res.status(500).json({ error: 'Failed to create broker trade' });
        res.status(201).json(serializeBrokerTradeForResponse(trade));
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to create broker trade' });
    }
});

// PATCH /api/broker-trades/:id — update notes, isHidden, isTest, exitDate, exitPrice, exitIBS
router.patch('/broker-trades/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { notes, isHidden, isTest, exitDate, exitPrice, exitIBS } = req.body;
        const updated = updateBrokerTrade(id, { notes, isHidden, isTest, exitDate, exitPrice, exitIBS });
        if (!updated) return res.status(404).json({ error: 'Broker trade not found' });
        res.json(serializeBrokerTradeForResponse(updated));
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to update broker trade' });
    }
});

// DELETE /api/broker-trades/:id
router.delete('/broker-trades/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deleted = deleteBrokerTrade(id);
        if (!deleted) return res.status(404).json({ error: 'Broker trade not found' });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to delete broker trade' });
    }
});

module.exports = router;
