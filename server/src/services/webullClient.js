const https = require('https');
const crypto = require('crypto');
const fs = require('fs-extra');
const fsp = require('fs/promises');
const path = require('path');
const { getApiConfig } = require('../config');
const { WEBULL_RAW_LOG_FILE } = require('../config');
const { getETParts, etKeyYMD } = require('./dates');

function buildWebullRuntimeConfig(overrides = {}) {
    const env = getApiConfig();
    const protocol = overrides.protocol || env.WEBULL_API_PROTOCOL || 'https:';
    const hostname = overrides.hostname || env.WEBULL_API_HOST || 'api.webull.com';
    const port = overrides.port || env.WEBULL_API_PORT || '';
    const appKey = overrides.appKey || env.WEBULL_APP_KEY || '';
    const appSecret = overrides.appSecret || env.WEBULL_APP_SECRET || '';
    const accessToken = overrides.accessToken || env.WEBULL_ACCESS_TOKEN || '';
    const accountId = overrides.accountId || env.WEBULL_ACCOUNT_ID || '';
    if (protocol !== 'https:') {
        throw new Error('Webull OpenAPI requires HTTPS');
    }
    return { protocol, hostname, port, appKey, appSecret, accessToken, accountId };
}

function buildHostHeader({ hostname, port }) {
    return port ? `${hostname}:${port}` : hostname;
}

function getWebullRawLogBaseParts() {
    const ext = path.extname(WEBULL_RAW_LOG_FILE) || '.log';
    const dir = path.dirname(WEBULL_RAW_LOG_FILE);
    const base = path.basename(WEBULL_RAW_LOG_FILE, ext);
    return { dir, base, ext };
}

function getWebullRawLogMonthKey(date = new Date()) {
    const et = getETParts(date);
    return `${et.y}-${String(et.m).padStart(2, '0')}`;
}

function getWebullRawLogPathForMonth(monthKey) {
    const { dir, base, ext } = getWebullRawLogBaseParts();
    return path.join(dir, `${base}-${monthKey}${ext}`);
}

function getCurrentWebullRawLogPath() {
    return getWebullRawLogPathForMonth(getWebullRawLogMonthKey(new Date()));
}

function maskHeaderValue(key, value) {
    const normalizedKey = String(key || '').toLowerCase();
    if (value === undefined || value === null) return value;
    if (normalizedKey.includes('secret')) return '***';
    if (normalizedKey.includes('token')) {
        const raw = String(value);
        return raw.length > 12 ? `${raw.slice(0, 6)}***${raw.slice(-4)}` : '***';
    }
    if (normalizedKey === 'authorization') return '***';
    return value;
}

function sanitizeHeaders(headers = {}) {
    const out = {};
    for (const [key, value] of Object.entries(headers || {})) {
        out[key] = maskHeaderValue(key, value);
    }
    return out;
}

function normalizeRawLogEntry(entry) {
    if (entry && typeof entry === 'object') {
        return {
            ts: entry.ts || new Date().toISOString(),
            level: entry.level || 'info',
            event: entry.event || 'webull_request',
            ...entry,
        };
    }
    return {
        ts: new Date().toISOString(),
        level: 'info',
        event: 'webull_request',
        message: String(entry),
    };
}

async function appendWebullRawLog(entry) {
    try {
        const logPath = getCurrentWebullRawLogPath();
        await fs.ensureFile(logPath);
        await fs.appendFile(logPath, `${JSON.stringify(normalizeRawLogEntry(entry))}\n`);
    } catch (error) {
        console.warn('Failed to append Webull raw log:', error && error.message ? error.message : error);
    }
}

function getEquityOrderCategory(orderItems) {
    const items = Array.isArray(orderItems) ? orderItems : [orderItems];
    const firstEquity = items.find((item) => String(item?.instrument_type || '').toUpperCase() === 'EQUITY');
    if (!firstEquity) return null;
    const market = String(firstEquity.market || 'US').toUpperCase();
    if (market === 'US') return 'US_STOCK';
    if (market === 'HK') return 'HK_STOCK';
    if (market === 'CN') return 'CN_STOCK';
    return null;
}

function normalizeWebullArrayPayload(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.result)) return payload.result;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.list)) return payload.list;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.instruments)) return payload.instruments;
    return [];
}

function normalizeStockOrderPayload(orderItems) {
    if (Array.isArray(orderItems)) {
        return orderItems[0] || null;
    }
    if (orderItems && typeof orderItems === 'object') {
        return orderItems;
    }
    return null;
}

function md5Upper(input) {
    return crypto.createHash('md5').update(input).digest('hex').toUpperCase();
}

function buildTimestamp() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildNonce() {
    return crypto.randomUUID();
}

function buildSignature({ path, query = {}, bodyString = '', headersToSign, appSecret }) {
    const merged = new Map();
    for (const [key, value] of Object.entries(query || {})) {
        if (value === undefined || value === null || value === '') continue;
        merged.set(key, String(value));
    }
    for (const [key, value] of Object.entries(headersToSign || {})) {
        if (value === undefined || value === null || value === '') continue;
        merged.set(key, String(value));
    }

    const sorted = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const str1 = sorted.map(([key, value]) => `${key}=${value}`).join('&');
    const str2 = bodyString ? md5Upper(bodyString) : '';
    const str3 = bodyString ? `${path}&${str1}&${str2}` : `${path}&${str1}`;
    const encodedString = encodeURIComponent(str3);
    return crypto
        .createHmac('sha1', `${appSecret}&`)
        .update(encodedString)
        .digest('base64');
}

function requestWebull({ method, path, query = {}, body, configOverrides = {}, includeAccessToken = true, signedHeaders = {}, requestHeaders = {}, version = 'v2' }) {
    const runtime = buildWebullRuntimeConfig(configOverrides);
    if (!runtime.appKey || !runtime.appSecret) {
        throw new Error('Webull credentials are not configured');
    }

    const timestamp = buildTimestamp();
    const nonce = buildNonce();
    const host = buildHostHeader(runtime);
    const bodyString = body == null ? '' : JSON.stringify(body);
    const headersToSign = {
        host,
        'x-app-key': runtime.appKey,
        'x-signature-algorithm': 'HMAC-SHA1',
        'x-signature-nonce': nonce,
        'x-signature-version': '1.0',
        'x-timestamp': timestamp,
        ...signedHeaders,
    };
    const signature = buildSignature({
        path,
        query,
        bodyString,
        headersToSign,
        appSecret: runtime.appSecret
    });

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
        if (value === undefined || value === null || value === '') continue;
        searchParams.set(key, String(value));
    }
    const requestPath = searchParams.toString() ? `${path}?${searchParams.toString()}` : path;
    const headers = {
        Accept: 'application/json',
        host,
        'x-version': version,
        'x-app-key': runtime.appKey,
        'x-signature-algorithm': 'HMAC-SHA1',
        'x-signature-nonce': nonce,
        'x-signature-version': '1.0',
        'x-timestamp': timestamp,
        'x-signature': signature,
        ...requestHeaders,
    };

    if (bodyString) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyString);
    }
    if (includeAccessToken && runtime.accessToken) {
        headers['x-access-token'] = runtime.accessToken;
    }

    return new Promise((resolve, reject) => {
        const startedAt = new Date().toISOString();
        const req = https.request({
            protocol: runtime.protocol,
            hostname: runtime.hostname,
            port: runtime.port || undefined,
            method,
            path: requestPath,
            headers,
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                let parsed = raw;
                try {
                    parsed = raw ? JSON.parse(raw) : null;
                } catch {
                    parsed = raw;
                }
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    void appendWebullRawLog({
                        ts: startedAt,
                        level: 'info',
                        event: 'request_ok',
                        method,
                        path,
                        query,
                        body: body || null,
                        requestHeaders: sanitizeHeaders(headers),
                        responseStatus: res.statusCode,
                        responseHeaders: sanitizeHeaders(res.headers),
                        responseBody: parsed,
                        host: runtime.hostname,
                        requestPath,
                    });
                    return resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsed
                    });
                }
                const responseObject = parsed && typeof parsed === 'object' ? parsed : null;
                const errorCode = responseObject?.error_code || responseObject?.errorCode || responseObject?.code || null;
                const errorMessage = responseObject?.message || responseObject?.msg || responseObject?.error_msg || responseObject?.error || null;
                const requestId = responseObject?.request_id || responseObject?.requestId || res.headers['x-request-id'] || res.headers['request-id'] || null;
                const message = errorCode && errorMessage
                    ? `${errorCode}: ${errorMessage}`
                    : (errorMessage || `Webull request failed with ${res.statusCode}`);
                const err = new Error(message);
                err.status = res.statusCode;
                err.response = responseObject || parsed;
                err.errorCode = errorCode;
                err.errorMsg = errorMessage;
                err.requestId = requestId;
                void appendWebullRawLog({
                    ts: startedAt,
                    level: 'error',
                    event: 'request_failed',
                    method,
                    path,
                    query,
                    body: body || null,
                    requestHeaders: sanitizeHeaders(headers),
                    responseStatus: res.statusCode,
                    responseHeaders: sanitizeHeaders(res.headers),
                    responseBody: responseObject || parsed,
                    error: message,
                    errorCode,
                    errorMsg: errorMessage,
                    requestId,
                    host: runtime.hostname,
                    requestPath,
                });
                reject(err);
            });
        });
        req.on('error', (error) => {
            void appendWebullRawLog({
                ts: startedAt,
                level: 'error',
                event: 'request_error',
                method,
                path,
                query,
                body: body || null,
                requestHeaders: sanitizeHeaders(headers),
                error: error && error.message ? error.message : String(error),
                host: runtime.hostname,
                requestPath,
            });
            reject(error);
        });
        req.setTimeout(15000, () => req.destroy(new Error('Webull request timeout')));
        if (bodyString) req.write(bodyString);
        req.end();
    });
}

async function getAccountList(configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/openapi/account/list',
        configOverrides,
    });
}

async function getAccountBalance(accountId, configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/account/balance',
        query: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            total_asset_currency: 'USD',
        },
        configOverrides
    });
}

async function getAccountPositions(accountId, configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/account/positions',
        query: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            page_size: 100,
        },
        configOverrides
    });
}

async function getInstruments(symbols, category = 'US_STOCK', configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/instrument/list',
        query: {
            symbols,
            category,
        },
        configOverrides,
    });
}

async function resolveInstrumentId(symbol, configOverrides = {}) {
    const response = await getInstruments(symbol, 'US_STOCK', configOverrides);
    const rows = normalizeWebullArrayPayload(response?.data);
    const first = rows.find((row) => row && typeof row === 'object') || null;
    const instrumentId = first && (first.instrument_id || first.instrumentId || first.id || first.security_id);
    if (!instrumentId) {
        const dataKeys = first ? Object.keys(first).join(',') : 'null';
        const rowCount = rows.length;
        throw new Error(`Unable to resolve Webull instrument_id for ${symbol} (rows=${rowCount}, keys=${dataKeys})`);
    }
    return String(instrumentId);
}

async function createAccessToken(configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/auth/token/create',
        body: {},
        configOverrides,
        includeAccessToken: false,
        version: 'v2'
    });
}

async function checkAccessToken(token, configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/auth/token/check',
        body: { token: token || buildWebullRuntimeConfig(configOverrides).accessToken },
        configOverrides,
        includeAccessToken: false,
        version: 'v2'
    });
}

async function previewOrder(accountId, orderItems, configOverrides = {}) {
    const stockOrder = normalizeStockOrderPayload(orderItems);
    if (!stockOrder) {
        throw new Error('Missing order payload');
    }
    const market = String(stockOrder.market || 'US').toUpperCase();
    if (market === 'US') {
        throw new Error('Webull US preview order is not supported');
    }
    const category = getEquityOrderCategory(orderItems);
    return requestWebull({
        method: 'POST',
        path: '/openapi/account/orders/preview',
        body: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            new_orders: Array.isArray(orderItems) ? orderItems : [orderItems]
        },
        configOverrides,
        requestHeaders: category ? { category } : {},
    });
}

async function placeOrder(accountId, orderItems, configOverrides = {}) {
    const stockOrder = normalizeStockOrderPayload(orderItems);
    if (!stockOrder) {
        throw new Error('Missing order payload');
    }
    const category = getEquityOrderCategory(stockOrder);
    return requestWebull({
        method: 'POST',
        path: '/openapi/trade/stock/order/place',
        body: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            new_orders: Array.isArray(orderItems) ? orderItems : [stockOrder],
        },
        configOverrides,
        requestHeaders: category ? { category } : {},
    });
}

async function cancelOrder(accountId, clientOrderId, configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/trade/order/cancel',
        body: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            client_order_id: clientOrderId
        },
        configOverrides
    });
}

async function getOrderDetail(accountId, clientOrderId, configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/trade/order/detail',
        query: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            client_order_id: clientOrderId
        },
        configOverrides
    });
}

async function getOpenOrders(accountId, options = {}, configOverrides = {}) {
    const query = {
        account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
    };
    if (options.pageSize != null) query.page_size = options.pageSize;
    if (options.lastClientOrderId) query.last_client_order_id = options.lastClientOrderId;
    return requestWebull({
        method: 'GET',
        path: '/trade/orders/list-open',
        query,
        configOverrides
    });
}

async function getOrderHistory(accountId, options = {}, configOverrides = {}) {
    const query = {
        account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
    };
    if (options.pageSize != null) query.page_size = options.pageSize;
    if (options.lastClientOrderId) query.last_client_order_id = options.lastClientOrderId;
    return requestWebull({
        method: 'GET',
        path: '/trade/orders/list-today',
        query,
        configOverrides
    });
}

async function getStockSnapshot(symbols, configOverrides = {}) {
    const symbolList = Array.isArray(symbols) ? symbols.join(',') : symbols;
    return requestWebull({
        method: 'GET',
        path: '/openapi/market-data/stock/snapshot',
        query: { symbols: symbolList, category: 'US_STOCK' },
        configOverrides,
        includeAccessToken: false,
    });
}

// Returns same shape as finnhub's fetchTodayRangeAndQuote: { range, quote, dateKey, ohlc }
async function fetchTodayRangeAndQuoteViaWebull(symbol, configOverrides = {}) {
    const response = await getStockSnapshot(symbol, configOverrides);
    const rows = normalizeWebullArrayPayload(response?.data);
    const row = rows.find((r) => r && (
        String(r.symbol || r.ticker || '').toUpperCase() === String(symbol).toUpperCase()
    )) || rows[0] || null;

    if (!row) throw new Error(`Webull snapshot: no data for ${symbol}`);

    // Field name candidates (Webull uses snake_case in REST responses)
    const pick = (...keys) => {
        for (const k of keys) {
            const v = row[k];
            if (v != null && v !== '') return Number(v);
        }
        return null;
    };

    const open = pick('open', 'openPrice', 'open_price');
    const high = pick('high', 'highPrice', 'high_price', 'day_high');
    const low = pick('low', 'lowPrice', 'low_price', 'day_low');
    // 'price' = current intraday price; 'close' during trading hours = prev day's close in most broker APIs
    const current = pick('price', 'lastPrice', 'last_price', 'tradePrice', 'trade_price', 'close');
    const prevClose = pick('pre_close', 'preClose', 'prev_close', 'prevClose', 'previousClose');

    const todayKey = etKeyYMD(getETParts(new Date()));
    return {
        range: { open, high, low },
        quote: { open, high, low, current, prevClose },
        dateKey: todayKey,
        ohlc: null,
    };
}

// Full date-range order history via /openapi/trade/order/history
// options: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', pageSize, lastOrderId, lastClientOrderId }
async function getOrderHistoryByDateRange(accountId, options = {}, configOverrides = {}) {
    const query = {
        account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
    };
    if (options.startDate) query.start_date = options.startDate;
    if (options.endDate) query.end_date = options.endDate;
    if (options.pageSize != null) query.page_size = options.pageSize;
    if (options.lastOrderId) query.last_order_id = options.lastOrderId;
    if (options.lastClientOrderId) query.last_client_order_id = options.lastClientOrderId;
    return requestWebull({
        method: 'GET',
        path: '/openapi/trade/order/history',
        query,
        configOverrides
    });
}

module.exports = {
    buildWebullRuntimeConfig,
    buildSignature,
    requestWebull,
    getCurrentWebullRawLogPath,
    getAccountList,
    getAccountBalance,
    getAccountPositions,
    getInstruments,
    resolveInstrumentId,
    createAccessToken,
    checkAccessToken,
    previewOrder,
    placeOrder,
    cancelOrder,
    getOrderDetail,
    getOpenOrders,
    getOrderHistory,
    getOrderHistoryByDateRange,
    getStockSnapshot,
    fetchTodayRangeAndQuoteViaWebull,
};
