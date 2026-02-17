/**
 * Quotes and price data routes
 */
const express = require('express');
const router = express.Router();
const { getApiConfig } = require('../config');
const { toSafeTicker, toFiniteNumber } = require('../utils/helpers');
const { fetchFromAlphaVantage } = require('../providers/alphaVantage');
const { fetchFromFinnhub, fetchTodayRangeAndQuote } = require('../providers/finnhub');
const { fetchFromTwelveData } = require('../providers/twelveData');
const { fetchFromPolygon } = require('../providers/polygon');

function normalizeIntradayRange(range, quote) {
    const low = toFiniteNumber(range && range.low);
    const high = toFiniteNumber(range && range.high);
    if (low != null && high != null && high > low) {
        return { low, high };
    }
    const candidates = [];
    const inputs = [
        range && range.low,
        range && range.high,
        quote && quote.current,
        quote && quote.high,
        quote && quote.low,
        quote && quote.open,
        quote && quote.prevClose,
    ];
    for (const value of inputs) {
        const num = toFiniteNumber(value);
        if (num != null) candidates.push(num);
    }
    if (candidates.length < 2) return null;
    const min = Math.min(...candidates);
    const max = Math.max(...candidates);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { low: min, high: max };
}

function parseUnixTs(value, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function getLastCloseFromRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const last = rows[rows.length - 1];
    const value = Number(last && last.close);
    return Number.isFinite(value) ? value : null;
}

router.get('/quote/:symbol', async (req, res) => {
    try {
        const symbol = toSafeTicker(req.params.symbol);
        if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
        const { range, quote, dateKey } = await fetchTodayRangeAndQuote(symbol);
        const normRange = normalizeIntradayRange(range, quote);
        res.json({ symbol, dateKey, range: normRange, quote });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch quote' });
    }
});

// Backward-compatible endpoint used by "Новые данные" page.
router.get('/yahoo-finance/:symbol', async (req, res) => {
    try {
        const symbol = toSafeTicker(req.params.symbol);
        if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });

        const nowTs = Math.floor(Date.now() / 1000);
        const endTs = parseUnixTs(req.query && req.query.end, nowTs);
        const defaultStart = endTs - 40 * 365 * 24 * 60 * 60;
        const startTs = parseUnixTs(req.query && req.query.start, defaultStart);
        if (startTs >= endTs) return res.status(400).json({ error: 'Invalid time range' });

        const requestedProvider = typeof req.query?.provider === 'string' ? req.query.provider : 'alpha_vantage';
        const provider = ['alpha_vantage', 'finnhub', 'twelve_data', 'polygon'].includes(requestedProvider)
            ? requestedProvider
            : 'alpha_vantage';
        const adjustment = req.query?.adjustment === 'split_only' ? 'split_only' : 'none';

        let data;
        switch (provider) {
            case 'alpha_vantage': {
                const avResult = await fetchFromAlphaVantage(symbol, startTs, endTs, { adjustment });
                data = Array.isArray(avResult) ? avResult : (Array.isArray(avResult?.data) ? avResult.data : []);
                break;
            }
            case 'finnhub':
                data = await fetchFromFinnhub(symbol, startTs, endTs);
                break;
            case 'twelve_data':
                data = await fetchFromTwelveData(symbol, startTs, endTs);
                break;
            case 'polygon':
                data = await fetchFromPolygon(symbol, startTs, endTs);
                break;
            default:
                return res.status(400).json({ error: 'Unknown provider' });
        }

        const rows = Array.isArray(data) ? data : [];
        return res.json({ symbol, provider, dataPoints: rows.length, data: rows });
    } catch (e) {
        const status = e.status || 500;
        return res.status(status).json({ error: e.message || 'Failed to fetch data' });
    }
});

router.get('/fetch/:provider/:symbol', async (req, res) => {
    try {
        const provider = req.params.provider;
        const symbol = toSafeTicker(req.params.symbol);
        if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });

        const endTs = Math.floor(Date.now() / 1000);
        const startTs = endTs - 365 * 24 * 60 * 60; // 1 year

        let data;
        switch (provider) {
            case 'alpha_vantage':
                const avResult = await fetchFromAlphaVantage(symbol, startTs, endTs);
                data = avResult.data;
                break;
            case 'finnhub':
                data = await fetchFromFinnhub(symbol, startTs, endTs);
                break;
            case 'twelve_data':
                data = await fetchFromTwelveData(symbol, startTs, endTs);
                break;
            case 'polygon':
                data = await fetchFromPolygon(symbol, startTs, endTs);
                break;
            default:
                return res.status(400).json({ error: 'Unknown provider' });
        }

        res.json({ symbol, provider, dataPoints: data.length, data });
    } catch (e) {
        const status = e.status || 500;
        res.status(status).json({ error: e.message || 'Failed to fetch data' });
    }
});

router.get('/test/alpha-vantage', async (req, res) => {
    try {
        const key = getApiConfig().ALPHA_VANTAGE_API_KEY;
        if (!key) return res.json({ success: false, error: 'API key not configured' });
        const endTs = Math.floor(Date.now() / 1000);
        const startTs = endTs - 7 * 24 * 60 * 60;
        const result = await fetchFromAlphaVantage('AAPL', startTs, endTs);
        res.json({ success: true, dataPoints: result.data.length });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.get('/test/finnhub', async (req, res) => {
    try {
        const key = getApiConfig().FINNHUB_API_KEY;
        if (!key) return res.json({ success: false, error: 'API key not configured' });
        const endTs = Math.floor(Date.now() / 1000);
        const startTs = endTs - 7 * 24 * 60 * 60;
        const result = await fetchFromFinnhub('AAPL', startTs, endTs);
        res.json({ success: true, dataPoints: result.length });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

router.get('/test/twelve-data', async (req, res) => {
    try {
        const key = getApiConfig().TWELVE_DATA_API_KEY;
        if (!key) return res.json({ success: false, error: 'API key not configured' });
        const endTs = Math.floor(Date.now() / 1000);
        const startTs = endTs - 7 * 24 * 60 * 60;
        const result = await fetchFromTwelveData('AAPL', startTs, endTs);
        res.json({ success: true, dataPoints: result.length });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// Backward-compatible endpoint used by Settings -> API tests in frontend.
router.post('/test-provider', async (req, res) => {
    try {
        const provider = typeof req.body?.provider === 'string' ? req.body.provider : '';
        const endTs = Math.floor(Date.now() / 1000);
        const startTs = endTs - 7 * 24 * 60 * 60;
        const symbol = 'AAPL';

        if (provider === 'alpha_vantage') {
            if (!getApiConfig().ALPHA_VANTAGE_API_KEY) {
                return res.json({ success: false, error: 'API key not configured' });
            }
            const result = await fetchFromAlphaVantage(symbol, startTs, endTs);
            const rows = Array.isArray(result?.data) ? result.data : [];
            const price = getLastCloseFromRows(rows);
            if (price == null) return res.json({ success: false, error: 'No data returned from provider' });
            return res.json({ success: true, symbol, price: price.toFixed(2) });
        }

        if (provider === 'finnhub') {
            if (!getApiConfig().FINNHUB_API_KEY) {
                return res.json({ success: false, error: 'API key not configured' });
            }
            const rows = await fetchFromFinnhub(symbol, startTs, endTs);
            const price = getLastCloseFromRows(rows);
            if (price == null) return res.json({ success: false, error: 'No data returned from provider' });
            return res.json({ success: true, symbol, price: price.toFixed(2) });
        }

        if (provider === 'twelve_data') {
            if (!getApiConfig().TWELVE_DATA_API_KEY) {
                return res.json({ success: false, error: 'API key not configured' });
            }
            const rows = await fetchFromTwelveData(symbol, startTs, endTs);
            const price = getLastCloseFromRows(rows);
            if (price == null) return res.json({ success: false, error: 'No data returned from provider' });
            return res.json({ success: true, symbol, price: price.toFixed(2) });
        }

        if (provider === 'polygon') {
            if (!getApiConfig().POLYGON_API_KEY) {
                return res.json({ success: false, error: 'API key not configured' });
            }
            const rows = await fetchFromPolygon(symbol, startTs, endTs);
            const price = getLastCloseFromRows(rows);
            if (price == null) return res.json({ success: false, error: 'No data returned from provider' });
            return res.json({ success: true, symbol, price: price.toFixed(2) });
        }

        return res.status(400).json({ success: false, error: 'Unknown provider' });
    } catch (e) {
        return res.json({ success: false, error: e.message || 'Failed to test provider' });
    }
});

module.exports = router;
