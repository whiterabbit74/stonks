/**
 * Alpha Vantage API provider
 */
const https = require('https');
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

/**
 * Fetch OHLC data from Alpha Vantage
 * @param {string} symbol - Stock ticker
 * @param {number} startDate - Unix timestamp start
 * @param {number} endDate - Unix timestamp end
 * @param {object} options - { adjustment: 'split_only' | 'none' }
 */
async function fetchFromAlphaVantage(symbol, startDate, endDate, options = { adjustment: 'none' }) {
    if (!getApiConfig().ALPHA_VANTAGE_API_KEY) {
        throw new Error('Alpha Vantage API key not configured');
    }

    const useAdjusted = options && options.adjustment === 'split_only';
    const func = useAdjusted ? 'TIME_SERIES_DAILY_ADJUSTED' : 'TIME_SERIES_DAILY';
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Invalid symbol');
    }

    const url = `https://www.alphavantage.co/query?function=${func}&symbol=${encodeURIComponent(safeSymbol)}&apikey=${getApiConfig().ALPHA_VANTAGE_API_KEY}&outputsize=full`;
    const requestUrl = new URL(url);
    requestUrl.searchParams.append('random', Date.now().toString());
    const requestOptions = {
        headers: {
            'User-Agent': 'stonks-bot/1.0',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
        }
    };

    return new Promise((resolve, reject) => {
        https.get(requestUrl, requestOptions, (response) => {
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

                    if (jsonData['Error Message']) {
                        const err = new Error(`Alpha Vantage: ${jsonData['Error Message']}`);
                        err.status = 400;
                        return reject(err);
                    }

                    if (jsonData['Note'] || jsonData['Information']) {
                        const note = jsonData['Note'] || jsonData['Information'];
                        const err = new Error(`Достигнут лимит API Alpha Vantage: ${note}`);
                        err.status = 429;
                        return reject(err);
                    }

                    const timeSeries = jsonData['Time Series (Daily)'];
                    if (!timeSeries) {
                        const err = new Error('Отсутствует секция "Time Series (Daily)" в ответе Alpha Vantage');
                        err.status = 502;
                        return reject(err);
                    }

                    const rows = [];
                    const start = new Date(startDate * 1000);
                    const end = new Date(endDate * 1000);

                    for (const [date, values] of Object.entries(timeSeries)) {
                        const currentDate = new Date(date);
                        if (currentDate >= start && currentDate <= end) {
                            rows.push({
                                date: date,
                                open: parseFloat(values['1. open']),
                                high: parseFloat(values['2. high']),
                                low: parseFloat(values['3. low']),
                                close: parseFloat(values['4. close']),
                                splitCoeff: parseFloat(values['8. split coefficient'] || '1'),
                                volume: parseInt(values['6. volume'] || values['5. volume'] || '0')
                            });
                        }
                    }

                    rows.sort((a, b) => new Date(a.date) - new Date(b.date));
                    const splitEvents = [];
                    const doAdjust = options && options.adjustment === 'split_only';

                    if (doAdjust) {
                        let cumulativeFactor = 1;
                        for (let i = rows.length - 1; i >= 0; i--) {
                            const r = rows[i];
                            r.open = r.open / cumulativeFactor;
                            r.high = r.high / cumulativeFactor;
                            r.low = r.low / cumulativeFactor;
                            r.close = r.close / cumulativeFactor;
                            r.volume = Math.round(r.volume * cumulativeFactor);
                            if (!isNaN(r.splitCoeff) && r.splitCoeff && r.splitCoeff !== 1) {
                                splitEvents.push({ date: r.date, factor: r.splitCoeff });
                                cumulativeFactor *= r.splitCoeff;
                            }
                        }
                    } else {
                        for (let i = 0; i < rows.length; i++) {
                            const r = rows[i];
                            if (!isNaN(r.splitCoeff) && r.splitCoeff && r.splitCoeff !== 1) {
                                splitEvents.push({ date: r.date, factor: r.splitCoeff });
                            }
                        }
                    }

                    const result = rows.map(r => ({
                        date: r.date,
                        open: r.open,
                        high: r.high,
                        low: r.low,
                        close: r.close,
                        adjClose: r.close,
                        volume: r.volume
                    }));

                    const payload = { data: result, splits: splitEvents.reverse() };
                    resolve(payload);

                } catch (error) {
                    const err = new Error(`Не удалось обработать ответ Alpha Vantage: ${error.message}`);
                    err.status = 502;
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}

module.exports = {
    fetchFromAlphaVantage,
};
