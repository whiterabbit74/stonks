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
const { getInstruments, getCorpActions } = require('../services/webullClient');

// Raw Webull corp-action data for a symbol — for analysis only
router.get('/splits/webull-raw', async (req, res) => {
    try {
        const symbol = toSafeTicker((req.query.symbol || '').toString());
        if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

        const startDate = (req.query.startDate || req.query.start_date || '').toString().slice(0, 10) || undefined;
        const endDate = (req.query.endDate || req.query.end_date || '').toString().slice(0, 10) || undefined;
        const eventTypes = (req.query.eventTypes || req.query.event_types || '').toString() || undefined;

        // Step 1: resolve instrument_id
        const instrumentsResp = await getInstruments(symbol, 'US_STOCK');
        const rows = Array.isArray(instrumentsResp?.data)
            ? instrumentsResp.data
            : (Array.isArray(instrumentsResp?.data?.data) ? instrumentsResp.data.data : []);
        const first = rows.find(r => r && typeof r === 'object') || null;
        const instrumentId = first && (first.instrument_id || first.instrumentId || first.id || first.security_id);

        if (!instrumentId) {
            return res.json({
                symbol,
                instrumentId: null,
                instrumentsRaw: instrumentsResp?.data ?? null,
                corpActionsRaw: null,
                error: 'Could not resolve instrument_id from Webull'
            });
        }

        // Step 2: fetch corp actions
        const corpResp = await getCorpActions(String(instrumentId), { startDate, endDate, eventTypes, pageSize: 200 });

        return res.json({
            symbol,
            instrumentId: String(instrumentId),
            instrumentsRaw: instrumentsResp?.data ?? null,
            corpActionsRaw: corpResp?.data ?? null,
        });
    } catch (e) {
        console.error('Webull raw splits error:', e?.message || e);
        return res.status(500).json({ error: e?.message || 'Webull request failed', detail: e?.response ?? null });
    }
});

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
