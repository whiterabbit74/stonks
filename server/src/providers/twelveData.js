/**
 * Twelve Data API provider
 */
const https = require('https');
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

/**
 * Fetch OHLC data from Twelve Data
 */
async function fetchFromTwelveData(symbol, startDate, endDate) {
    if (!getApiConfig().TWELVE_DATA_API_KEY) {
        throw new Error('Twelve Data API key not configured');
    }

    const startDateStr = new Date(startDate * 1000).toISOString().split('T')[0];
    const endDateStr = new Date(endDate * 1000).toISOString().split('T')[0];
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Invalid symbol');
    }

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(safeSymbol)}&interval=1day&start_date=${startDateStr}&end_date=${endDateStr}&outputsize=5000&apikey=${getApiConfig().TWELVE_DATA_API_KEY}`;

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
                        if (jsonData.code === 429 || (jsonData.message && jsonData.message.includes('limit'))) {
                            err.status = 429;
                        } else {
                            err.status = 400;
                        }
                        return reject(err);
                    }

                    if (!jsonData.values || !Array.isArray(jsonData.values)) {
                        const err = new Error('Twelve Data: No data found for this symbol/period');
                        err.status = 404;
                        return reject(err);
                    }

                    const result = jsonData.values.map(item => ({
                        date: item.datetime,
                        open: parseFloat(item.open),
                        high: parseFloat(item.high),
                        low: parseFloat(item.low),
                        close: parseFloat(item.close),
                        adjClose: parseFloat(item.close),
                        volume: parseInt(item.volume || '0')
                    }));

                    result.sort((a, b) => new Date(a.date) - new Date(b.date));
                    resolve(result);

                } catch (error) {
                    const err = new Error(`Не удалось обработать ответ Twelve Data: ${error.message}`);
                    err.status = 502;
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}

module.exports = {
    fetchFromTwelveData,
};
