/**
 * Settings routes
 */
const express = require('express');
const router = express.Router();
const { readSettings, writeSettings, getDefaultSettings } = require('../services/settings');

router.get('/settings', async (req, res) => {
    try {
        const s = await readSettings();
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to read settings' });
    }
});

router.put('/settings', async (req, res) => {
    try {
        const {
            watchThresholdPct,
            resultsQuoteProvider,
            enhancerProvider,
            resultsRefreshProvider,
            enablePostClosePriceActualization,
            indicatorPanePercent,
            defaultMultiTickerSymbols
        } = req.body || {};
        const validProvider = (p) => ['alpha_vantage', 'finnhub', 'twelve_data'].includes(p);
        const next = getDefaultSettings();
        if (typeof watchThresholdPct === 'number') next.watchThresholdPct = watchThresholdPct;
        if (validProvider(resultsQuoteProvider)) next.resultsQuoteProvider = resultsQuoteProvider;
        if (validProvider(enhancerProvider)) next.enhancerProvider = enhancerProvider;
        if (validProvider(resultsRefreshProvider)) next.resultsRefreshProvider = resultsRefreshProvider;
        if (typeof enablePostClosePriceActualization === 'boolean') {
            next.enablePostClosePriceActualization = enablePostClosePriceActualization;
        }
        if (typeof indicatorPanePercent === 'number' && indicatorPanePercent >= 0 && indicatorPanePercent <= 100) {
            next.indicatorPanePercent = indicatorPanePercent;
        }
        if (typeof defaultMultiTickerSymbols === 'string') {
            next.defaultMultiTickerSymbols = defaultMultiTickerSymbols;
        }
        const saved = await writeSettings(next);
        res.json({ success: true, settings: saved });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to save settings' });
    }
});

router.patch('/settings', async (req, res) => {
    try {
        const updates = req.body;
        const currentSettings = await readSettings();

        // Prevent updating protected fields
        delete updates.api;
        delete updates.telegram;

        const newSettings = { ...currentSettings, ...updates };

        // Use optimized async write with caching
        await writeSettings(newSettings);

        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (e) {
        console.error('Failed to update settings:', e);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
