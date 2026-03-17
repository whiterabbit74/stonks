const https = require('https');
const crypto = require('crypto');
const { getApiConfig } = require('../config');

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

function requestWebull({ method, path, query = {}, body, configOverrides = {}, includeAccessToken = true }) {
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
        'x-version': 'v2',
        'x-app-key': runtime.appKey,
        'x-signature-algorithm': 'HMAC-SHA1',
        'x-signature-nonce': nonce,
        'x-signature-version': '1.0',
        'x-timestamp': timestamp,
        'x-signature': signature,
    };

    if (bodyString) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(bodyString);
    }
    if (includeAccessToken && runtime.accessToken) {
        headers['x-access-token'] = runtime.accessToken;
    }

    return new Promise((resolve, reject) => {
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
                    return resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: parsed
                    });
                }
                const message = typeof parsed === 'object' && parsed
                    ? (parsed.message || parsed.msg || parsed.error || `Webull request failed with ${res.statusCode}`)
                    : `Webull request failed with ${res.statusCode}`;
                const err = new Error(message);
                err.status = res.statusCode;
                err.response = parsed;
                reject(err);
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('Webull request timeout')));
        if (bodyString) req.write(bodyString);
        req.end();
    });
}

async function getAccountList(configOverrides = {}) {
    return requestWebull({ method: 'GET', path: '/openapi/account/list', configOverrides });
}

async function getAccountBalance(accountId, configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/openapi/assets/balance',
        query: { account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId },
        configOverrides
    });
}

async function getAccountPositions(accountId, configOverrides = {}) {
    return requestWebull({
        method: 'GET',
        path: '/openapi/assets/positions',
        query: { account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId },
        configOverrides
    });
}

async function createAccessToken(configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/auth/token/create',
        body: {},
        configOverrides,
        includeAccessToken: false
    });
}

async function checkAccessToken(token, configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/auth/token/check',
        body: { token: token || buildWebullRuntimeConfig(configOverrides).accessToken },
        configOverrides,
        includeAccessToken: false
    });
}

async function previewOrder(accountId, orderItems, configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/trade/order/preview',
        body: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            new_orders: orderItems
        },
        configOverrides
    });
}

async function placeOrder(accountId, orderItems, configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/trade/order/place',
        body: {
            account_id: accountId || buildWebullRuntimeConfig(configOverrides).accountId,
            new_orders: orderItems
        },
        configOverrides
    });
}

async function cancelOrder(accountId, clientOrderId, configOverrides = {}) {
    return requestWebull({
        method: 'POST',
        path: '/openapi/trade/order/cancel',
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
        path: '/openapi/trade/order/detail',
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
        path: '/openapi/trade/order/open',
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
        path: '/openapi/trade/order/history',
        query,
        configOverrides
    });
}

module.exports = {
    buildWebullRuntimeConfig,
    buildSignature,
    requestWebull,
    getAccountList,
    getAccountBalance,
    getAccountPositions,
    createAccessToken,
    checkAccessToken,
    previewOrder,
    placeOrder,
    cancelOrder,
    getOrderDetail,
    getOpenOrders,
    getOrderHistory,
};
