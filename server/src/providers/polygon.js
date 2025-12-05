/**
 * Polygon.io API provider
 */
const https = require('https');
const { getApiConfig, IS_PROD } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

/**
 * Fetch OHLC data from Polygon.io
 */
async function fetchFromPolygon(symbol, startDate, endDate) {
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Symbol is required');
    }

    const endDateObj = endDate ? new Date(endDate * 1000) : new Date();
    const startDateObj = startDate ? new Date(startDate * 1000) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const fromDate = startDateObj.toISOString().split('T')[0];
    const toDate = endDateObj.toISOString().split('T')[0];

    const apiKey = getApiConfig().POLYGON_API_KEY || (IS_PROD ? '' : 'demo');
    if (!apiKey) {
        throw new Error('Polygon API key not configured');
    }

    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(safeSymbol)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apikey=${encodeURIComponent(apiKey)}`;

    console.log(`Fetching real data for ${safeSymbol} from Polygon.io...`);

    const data = await new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Polygon API returned status ${response.statusCode}`));
                    return;
                }

                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData);
                } catch (parseError) {
                    reject(new Error('Failed to parse API response'));
                }
            });
        });

        request.on('error', (error) => {
            console.error('HTTPS request error:', error);
            reject(error);
        });

        request.setTimeout(15000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });

    if (data.status === 'ERROR') {
        throw new Error(data.error || 'API error occurred');
    }

    if (!data.results || data.results.length === 0) {
        throw new Error('No data available for this symbol and date range');
    }

    const result = data.results.map(item => {
        const date = new Date(item.t).toISOString().split('T')[0];
        return {
            date: date,
            open: item.o,
            high: item.h,
            low: item.l,
            close: item.c,
            adjClose: item.c,
            volume: item.v
        };
    });

    console.log(`Retrieved ${result.length} real data points for ${safeSymbol} from Polygon`);
    return result;
}

module.exports = {
    fetchFromPolygon,
};
