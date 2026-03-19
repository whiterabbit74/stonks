/**
 * Polygon.io API provider
 */
const https = require('https');
const { getApiConfig, IS_PROD } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

/**
 * Fetch OHLC data from Polygon.io
 */
async function fetchFromPolygon(symbol, startDate, endDate, apiKeyOverride = null) {
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Symbol is required');
    }

    const endDateObj = endDate ? new Date(endDate * 1000) : new Date();
    const startDateObj = startDate ? new Date(startDate * 1000) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const fromDate = startDateObj.toISOString().split('T')[0];
    const toDate = endDateObj.toISOString().split('T')[0];

    const apiKey = apiKeyOverride || getApiConfig().POLYGON_API_KEY || (IS_PROD ? '' : 'demo');
    if (!apiKey) {
        throw new Error('Polygon API key not configured');
    }

    const firstUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(safeSymbol)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apikey=${encodeURIComponent(apiKey)}`;

    console.log(`Fetching real data for ${safeSymbol} from Polygon.io...`);

    function fetchPage(url) {
        return new Promise((resolve, reject) => {
            const request = https.get(url, (response) => {
                let data = '';
                response.on('data', (chunk) => { data += chunk; });
                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`Polygon API returned status ${response.statusCode}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        reject(new Error('Failed to parse Polygon API response'));
                    }
                });
            });
            request.on('error', reject);
            request.setTimeout(30000, () => { request.destroy(); reject(new Error('Request timeout')); });
        });
    }

    const allResults = [];
    let nextUrl = firstUrl;
    let pages = 0;

    while (nextUrl && pages < 20) {
        // Polygon's next_url omits apikey — append it
        const pageUrl = nextUrl.includes('apikey=')
            ? nextUrl
            : `${nextUrl}${nextUrl.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(apiKey)}`;

        const data = await fetchPage(pageUrl);

        if (data.status === 'ERROR') {
            throw new Error(data.error || 'Polygon API error');
        }

        if (Array.isArray(data.results)) {
            allResults.push(...data.results);
        }

        nextUrl = data.next_url || null;
        pages++;

        if (nextUrl) {
            console.log(`Polygon: got ${allResults.length} bars so far, fetching next page...`);
        }
    }

    if (allResults.length === 0) {
        throw new Error('No data available for this symbol and date range');
    }

    const result = allResults.map(item => ({
        date: new Date(item.t).toISOString().split('T')[0],
        open: item.o,
        high: item.h,
        low: item.l,
        close: item.c,
        adjClose: item.c,
        volume: item.v
    }));

    console.log(`Retrieved ${result.length} data points for ${safeSymbol} from Polygon (${pages} page(s))`);
    return result;
}

module.exports = {
    fetchFromPolygon,
};
