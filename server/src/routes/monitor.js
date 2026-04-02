const express = require('express');
const router = express.Router();
const { loadTradeHistory, isTradeHistoryLoaded } = require('../services/trades');
const { getMonitorConsistencySnapshot, reconcileMonitorState } = require('../services/monitorConsistency');

async function ensureMonitorStateLoaded() {
    if (!isTradeHistoryLoaded()) {
        await loadTradeHistory();
        return;
    }
    await loadTradeHistory();
}

router.get('/monitor/consistency', async (req, res) => {
    try {
        await ensureMonitorStateLoaded();
        const snapshot = getMonitorConsistencySnapshot();
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ error: error && error.message ? error.message : 'Failed to read monitor consistency state' });
    }
});

router.post('/monitor/reconcile', async (req, res) => {
    try {
        await ensureMonitorStateLoaded();
        const requestedMode = typeof req.body?.mode === 'string' ? req.body.mode : 'preview';
        const mode = requestedMode === 'apply' ? 'apply' : 'preview';
        const result = reconcileMonitorState({ apply: mode === 'apply' });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error && error.message ? error.message : 'Failed to reconcile monitor state' });
    }
});

module.exports = router;
