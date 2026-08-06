/**
 * Quote fetch with Finnhub primary + Webull fallback.
 * Finnhub sits behind Cloudflare and intermittently returns plain-text
 * "error code: 1200" (HTTP 503) instead of JSON — retries absorb most of that,
 * Webull covers the rest so monitor/EMA still get a price.
 */
const { fetchTodayRangeAndQuote: fetchFinnhubQuote } = require('./finnhub');
const { fetchTodayRangeAndQuote: fetchWebullQuote } = require('./webull');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientQuoteError(error) {
    if (!error) return false;
    const status = Number(error.status);
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
    const msg = String(error.message || error);
    return /error code:\s*\d+/i.test(msg)
        || /Unexpected token/i.test(msg)
        || /not valid JSON/i.test(msg)
        || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(msg)
        || /Finnhub quote: temporary/i.test(msg);
}

/**
 * @param {string} symbol
 * @param {{ retries?: number, retryDelayMs?: number, allowWebullFallback?: boolean }} [options]
 */
async function fetchTodayRangeAndQuote(symbol, options = {}) {
    const retries = Number.isFinite(options.retries) ? Math.max(0, options.retries) : 2;
    const retryDelayMs = Number.isFinite(options.retryDelayMs) ? Math.max(0, options.retryDelayMs) : 350;
    const allowWebullFallback = options.allowWebullFallback !== false;

    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const result = await fetchFinnhubQuote(symbol);
            if (result && !result.source) result.source = 'finnhub';
            return result;
        } catch (error) {
            lastError = error;
            if (!isTransientQuoteError(error) || attempt === retries) break;
            await sleep(retryDelayMs * (attempt + 1));
        }
    }

    if (allowWebullFallback) {
        try {
            const result = await fetchWebullQuote(symbol);
            if (result && !result.source) result.source = 'webull';
            return result;
        } catch (webullError) {
            const primary = lastError && lastError.message ? lastError.message : 'finnhub failed';
            const secondary = webullError && webullError.message ? webullError.message : 'webull failed';
            const err = new Error(`quote unavailable: ${primary}; fallback: ${secondary}`);
            if (lastError && lastError.status) err.status = lastError.status;
            throw err;
        }
    }

    throw lastError || new Error('quote unavailable');
}

module.exports = {
    fetchTodayRangeAndQuote,
    isTransientQuoteError,
};
