/**
 * Twelve Data API provider
 */
const https = require('https');
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

function fetchOnePage(safeSymbol, startDateStr, endDateStr, apiKey) {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(safeSymbol)}&interval=1day&start_date=${startDateStr}&end_date=${endDateStr}&outputsize=5000&apikey=${apiKey}`;

    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => {
                try {
                    if (data && data.trim().startsWith('<')) {
                        const err = new Error('Провайдер вернул HTML вместо JSON (возможен лимит/блокировка).');
                        err.status = 502;
                        return reject(err);
                    }

                    const jsonData = JSON.parse(data);

                    if (jsonData.status === 'error') {
                        const err = new Error(`Twelve Data: ${jsonData.message || 'Unknown error'}`);
                        err.status = (jsonData.code === 429 || (jsonData.message && jsonData.message.includes('limit'))) ? 429 : 400;
                        return reject(err);
                    }

                    if (!jsonData.values || !Array.isArray(jsonData.values)) {
                        return resolve([]);
                    }

                    resolve(jsonData.values.map(item => ({
                        date: item.datetime,
                        open: parseFloat(item.open),
                        high: parseFloat(item.high),
                        low: parseFloat(item.low),
                        close: parseFloat(item.close),
                        adjClose: parseFloat(item.close),
                        volume: parseInt(item.volume || '0')
                    })));
                } catch (error) {
                    const err = new Error(`Не удалось обработать ответ Twelve Data: ${error.message}`);
                    err.status = 502;
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Fetch OHLC data from Twelve Data.
 * Splits into 2 sequential requests to cover ranges > 5000 trading days (~20 years).
 */
async function fetchFromTwelveData(symbol, startDate, endDate) {
    if (!getApiConfig().TWELVE_DATA_API_KEY) {
        throw new Error('Twelve Data API key not configured');
    }

    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) throw new Error('Invalid symbol');

    const apiKey = getApiConfig().TWELVE_DATA_API_KEY;
    const midTs = Math.floor((startDate + endDate) / 2);
    const midDateStr = new Date(midTs * 1000).toISOString().split('T')[0];
    const startDateStr = new Date(startDate * 1000).toISOString().split('T')[0];
    const endDateStr = new Date(endDate * 1000).toISOString().split('T')[0];

    // First half, then second half (sequential to respect 8 req/min rate limit)
    const part1 = await fetchOnePage(safeSymbol, startDateStr, midDateStr, apiKey);
    const part2 = await fetchOnePage(safeSymbol, midDateStr, endDateStr, apiKey);

    // Merge, deduplicate by date, sort ascending
    const seen = new Set();
    const merged = [];
    for (const row of [...part1, ...part2]) {
        if (!seen.has(row.date)) {
            seen.add(row.date);
            merged.push(row);
        }
    }
    merged.sort((a, b) => a.date.localeCompare(b.date));

    if (merged.length === 0) {
        const err = new Error('Twelve Data: No data found for this symbol/period');
        err.status = 404;
        throw err;
    }

    return merged;
}

module.exports = {
    fetchFromTwelveData,
};
