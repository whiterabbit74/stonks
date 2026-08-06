/**
 * Finnhub API provider
 */
const https = require('https');
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const { getETParts, etKeyYMD } = require('../services/dates');

function summarizeBody(data, maxLen = 160) {
    const text = String(data || '').replace(/\s+/g, ' ').trim();
    if (!text) return '(empty)';
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function parseJsonResponse(data, label, statusCode) {
    const raw = typeof data === 'string' ? data : String(data || '');
    const trimmed = raw.trim();
    if (!trimmed) {
        const err = new Error(`${label}: empty response (HTTP ${statusCode || '?'})`);
        err.status = statusCode || 502;
        throw err;
    }

    // Cloudflare / CDN plain-text failures (e.g. "error code: 1200")
    const cdnMatch = trimmed.match(/^error code:\s*(\d+)/i);
    if (cdnMatch) {
        const err = new Error(`${label}: temporary CDN error ${cdnMatch[1]} (HTTP ${statusCode || 503})`);
        err.status = statusCode || 503;
        err.transient = true;
        throw err;
    }

    if (trimmed[0] !== '{' && trimmed[0] !== '[') {
        const err = new Error(`${label}: non-JSON response (HTTP ${statusCode || '?'}): ${summarizeBody(trimmed)}`);
        err.status = statusCode || 502;
        err.transient = statusCode >= 500;
        throw err;
    }

    try {
        return JSON.parse(trimmed);
    } catch (error) {
        const err = new Error(`${label}: invalid JSON (HTTP ${statusCode || '?'}): ${summarizeBody(trimmed)}`);
        err.status = statusCode || 502;
        err.transient = true;
        throw err;
    }
}

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => { data += chunk; });
            response.on('end', () => {
                resolve({
                    statusCode: response.statusCode || 0,
                    body: data,
                });
            });
        });
        req.setTimeout(15000, () => {
            req.destroy(new Error('Finnhub request timeout'));
        });
        req.on('error', reject);
    });
}

/**
 * Fetch OHLC candles from Finnhub
 */
async function fetchFromFinnhub(symbol, startDate, endDate) {
    if (!getApiConfig().FINNHUB_API_KEY) {
        throw new Error('Finnhub API key not configured');
    }

    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Invalid symbol');
    }

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(safeSymbol)}&resolution=D&from=${startDate}&to=${endDate}&token=${getApiConfig().FINNHUB_API_KEY}`;
    const { statusCode, body } = await httpsGet(url);
    const jsonData = parseJsonResponse(body, 'Finnhub', statusCode);

    if (statusCode && statusCode !== 200) {
        const reason = jsonData?.error || jsonData?.message || jsonData?.s || `HTTP ${statusCode}`;
        const err = new Error(`Finnhub: ${reason}`);
        err.status = statusCode;
        throw err;
    }

    if (jsonData?.s !== 'ok') {
        const reason = jsonData?.error || jsonData?.message || jsonData?.s || 'Unknown error';
        const err = new Error(`Finnhub: ${reason}`);
        if (jsonData?.s === 'no_data') err.status = 404;
        throw err;
    }

    const result = [];
    for (let i = 0; i < jsonData.t.length; i++) {
        const date = new Date(jsonData.t[i] * 1000).toISOString().split('T')[0];
        result.push({
            date: date,
            open: jsonData.o[i],
            high: jsonData.h[i],
            low: jsonData.l[i],
            close: jsonData.c[i],
            adjClose: jsonData.c[i],
            volume: jsonData.v[i]
        });
    }

    return result;
}

/**
 * Fetch today's quote from Finnhub
 */
async function fetchTodayRangeAndQuote(symbol) {
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Invalid symbol');
    }
    if (!getApiConfig().FINNHUB_API_KEY) {
        throw new Error('Finnhub API key not configured');
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(safeSymbol)}&token=${getApiConfig().FINNHUB_API_KEY}`;
    const { statusCode, body } = await httpsGet(url);
    const quote = parseJsonResponse(body, 'Finnhub quote', statusCode);

    if (statusCode && statusCode !== 200) {
        const reason = quote?.error || quote?.message || `HTTP ${statusCode}`;
        const err = new Error(`Finnhub quote: ${reason}`);
        err.status = statusCode;
        err.transient = statusCode >= 500 || statusCode === 429;
        throw err;
    }

    // Finnhub returns all zeros when symbol is unknown / no session data
    const current = quote && quote.c != null ? Number(quote.c) : null;
    if (!Number.isFinite(current) || current === 0) {
        const err = new Error(`Finnhub quote: no price for ${safeSymbol}`);
        err.status = 404;
        throw err;
    }

    const todayEt = getETParts(new Date());
    const todayKey = etKeyYMD(todayEt);
    const todayRange = {
        open: (quote && quote.o != null ? quote.o : null),
        high: (quote && quote.h != null ? quote.h : null),
        low: (quote && quote.l != null ? quote.l : null),
    };

    return {
        range: todayRange,
        quote: {
            open: quote.o ?? null,
            high: quote.h ?? null,
            low: quote.l ?? null,
            current: quote.c ?? null,
            prevClose: quote.pc ?? null
        },
        dateKey: todayKey,
        ohlc: null,
        source: 'finnhub',
    };
}

module.exports = {
    fetchFromFinnhub,
    fetchTodayRangeAndQuote,
    parseJsonResponse,
};
