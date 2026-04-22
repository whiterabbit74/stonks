/**
 * Trades routes
 */
const express = require('express');
const router = express.Router();
const { getETParts, etKeyYMD } = require('../services/dates');
const {
    loadTradeHistory,
    getSortedTradeHistory,
    getCurrentOpenTrade,
    getTradeById,
    serializeTradeForResponse,
    getTradeHistory,
    isTradeHistoryLoaded,
    createManualTrade,
    updateTrade,
    closeMonitorTradeById,
    deleteTrade,
} = require('../services/trades');

// GET /api/trades — list all trades (includeHidden=1 to include hidden)
router.get('/trades', async (req, res) => {
    try {
        if (!isTradeHistoryLoaded()) {
            await loadTradeHistory();
        }
        const sorted = getSortedTradeHistory();
        const includeHidden = req.query.includeHidden === '1';
        const filtered = includeHidden ? sorted : sorted.filter(t => !t.isHidden);
        const openTrade = getCurrentOpenTrade();
        res.json({
            trades: filtered.map(serializeTradeForResponse),
            openTrade: openTrade ? serializeTradeForResponse(openTrade) : null,
            total: getTradeHistory().length,
            lastUpdated: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to load trade history' });
    }
});

// POST /api/trades — create manual trade
router.post('/trades', (req, res) => {
    try {
        const { symbol, entryDate, exitDate, entryPrice, exitPrice, entryIBS, exitIBS, notes, quantity } = req.body;
        if (!symbol) return res.status(400).json({ error: 'symbol is required' });
        const trade = createManualTrade({ symbol, entryDate, exitDate, entryPrice, exitPrice, entryIBS, exitIBS, notes, quantity });
        if (!trade) return res.status(500).json({ error: 'Failed to create trade' });
        res.status(201).json(serializeTradeForResponse(trade));
    } catch (e) {
        res.status(e && Number.isInteger(e.status) ? e.status : 500).json({ error: e && e.message ? e.message : 'Failed to create trade' });
    }
});

// PATCH /api/trades/:id — update notes, isHidden, isTest, exitDate, exitPrice
router.patch('/trades/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { notes, isHidden, isTest, exitDate, exitPrice, exitIBS } = req.body;
        const updated = updateTrade(id, { notes, isHidden, isTest, exitDate, exitPrice, exitIBS });
        if (!updated) return res.status(404).json({ error: 'Trade not found' });
        res.json(serializeTradeForResponse(updated));
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to update trade' });
    }
});

// POST /api/trades/:id/close-monitor — manual close for monitor-only / legacy trades
router.post('/trades/:id/close-monitor', (req, res) => {
    try {
        const { id } = req.params;
        const existing = getTradeById(id);
        if (!existing) return res.status(404).json({ error: 'Trade not found' });
        if (existing.status !== 'open') return res.status(409).json({ error: 'Trade is already closed' });
        if (existing.linkedBrokerTradeId) {
            return res.status(409).json({ error: 'Linked broker-backed monitor trades must be reconciled automatically' });
        }

        const { exitDate, exitPrice, exitIBS, note } = req.body || {};
        const numericExitPrice = typeof exitPrice === 'number' ? exitPrice : Number(exitPrice);
        if (!Number.isFinite(numericExitPrice) || numericExitPrice <= 0) {
            return res.status(400).json({ error: 'exitPrice must be a positive number' });
        }

        const nowEt = getETParts(new Date());
        const resolvedExitDate = typeof exitDate === 'string' && exitDate.trim() ? exitDate.trim() : etKeyYMD(nowEt);
        const updated = closeMonitorTradeById(id, {
            exitDate: resolvedExitDate,
            exitPrice: numericExitPrice,
            exitIBS: typeof exitIBS === 'number' ? exitIBS : null,
            exitDecisionTime: new Date().toISOString(),
            note: typeof note === 'string' && note.trim() ? note.trim() : 'manual_monitor_close_from_ui',
        });

        res.json(serializeTradeForResponse(updated));
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to close monitor trade' });
    }
});

// DELETE /api/trades/:id
router.delete('/trades/:id', (req, res) => {
    try {
        const { id } = req.params;
        const deleted = deleteTrade(id);
        if (!deleted) return res.status(404).json({ error: 'Trade not found' });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to delete trade' });
    }
});

module.exports = router;
