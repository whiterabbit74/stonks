/**
 * Splits routes
 */
const express = require('express');
const router = express.Router();
const { toSafeTicker } = require('../utils/helpers');
const {
    loadSplits,
    getTickerSplits,
    setTickerSplits,
    upsertTickerSplits,
    deleteTickerSplitByDate,
    deleteTickerSplits
} = require('../services/splits');

router.get('/splits', async (req, res) => {
    try {
        const splits = await loadSplits();
        const map = {};

        for (const [ticker, events] of Object.entries(splits)) {
            if (Array.isArray(events)) {
                map[ticker] = events.map(e => ({
                    date: e.date,
                    factor: e.factor
                }));
            }
        }

        return res.json(map);
    } catch (e) {
        console.error('Failed to load splits map:', e);
        return res.status(500).json({ error: 'Failed to load splits map' });
    }
});

router.get('/splits/:symbol', async (req, res) => {
    try {
        const raw = (req.params.symbol || '').toString();
        const symbol = toSafeTicker(raw);
        if (!symbol) return res.json([]);
        const arr = await getTickerSplits(symbol);
        return res.json(arr || []);
    } catch {
        return res.json([]);
    }
});

router.put('/splits/:symbol', async (req, res) => {
    try {
        const raw = (req.params.symbol || '').toString();
        const symbol = toSafeTicker(raw);
        if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
        const events = Array.isArray(req.body) ? req.body : (req.body && req.body.events);
        if (!Array.isArray(events)) return res.status(400).json({ error: 'Body must be array of {date,factor}' });
        const updated = await setTickerSplits(symbol, events);
        return res.json({ success: true, symbol, events: updated });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to save splits' });
    }
});

router.patch('/splits/:symbol', async (req, res) => {
    try {
        const raw = (req.params.symbol || '').toString();
        const symbol = toSafeTicker(raw);
        if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
        const events = Array.isArray(req.body) ? req.body : (req.body && req.body.events);
        if (!Array.isArray(events)) return res.status(400).json({ error: 'Body must be array of {date,factor}' });
        const updated = await upsertTickerSplits(symbol, events);
        return res.json({ success: true, symbol, events: updated });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to update splits' });
    }
});

router.delete('/splits/:symbol/:date', async (req, res) => {
    try {
        const symbol = toSafeTicker((req.params.symbol || '').toString());
        const date = (req.params.date || '').toString().slice(0, 10);
        if (!symbol || !date) return res.status(400).json({ error: 'Invalid symbol or date' });
        const updated = await deleteTickerSplitByDate(symbol, date);
        return res.json({ success: true, symbol, events: updated });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to delete split' });
    }
});

router.delete('/splits/:symbol', async (req, res) => {
    try {
        const symbol = toSafeTicker((req.params.symbol || '').toString());
        if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
        await deleteTickerSplits(symbol);
        return res.json({ success: true, symbol });
    } catch (e) {
        return res.status(500).json({ error: 'Failed to delete splits' });
    }
});

module.exports = router;
