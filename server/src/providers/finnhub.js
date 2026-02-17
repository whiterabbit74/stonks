/**
 * Finnhub API provider
 */
const https = require('https');
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const { getETParts, etKeyYMD } = require('../services/dates');

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

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);

                    if (response.statusCode && response.statusCode !== 200) {
                        const reason = jsonData?.error || jsonData?.message || jsonData?.s || `HTTP ${response.statusCode}`;
                        const err = new Error(`Finnhub: ${reason}`);
                        err.status = response.statusCode;
                        return reject(err);
                    }

                    if (jsonData?.s !== 'ok') {
                        const reason = jsonData?.error || jsonData?.message || jsonData?.s || 'Unknown error';
                        const err = new Error(`Finnhub: ${reason}`);
                        if (jsonData?.s === 'no_data') err.status = 404;
                        return reject(err);
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

                    resolve(result);

                } catch (error) {
                    const err = new Error(`Failed to parse Finnhub response: ${error.message}`);
                    err.status = 502;
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Fetch today's quote from Finnhub
 */
async function fetchTodayRangeAndQuote(symbol) {
    const quote = await new Promise((resolve, reject) => {
        const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${getApiConfig().FINNHUB_API_KEY}`;
        https.get(url, (response) => {
            let data = '';
            response.on('data', c => data += c);
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (response.statusCode && response.statusCode !== 200) {
                        const reason = json?.error || json?.message || `HTTP ${response.statusCode}`;
                        const err = new Error(`Finnhub quote: ${reason}`);
                        err.status = response.statusCode;
                        return reject(err);
                    }
                    resolve(json);
                }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });

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
        ohlc: null
    };
}

module.exports = {
    fetchFromFinnhub,
    fetchTodayRangeAndQuote,
};
