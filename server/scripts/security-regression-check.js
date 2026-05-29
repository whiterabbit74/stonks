#!/usr/bin/env node
const assert = require('assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
}

const serverDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(serverDir, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tradingibs-security-'));
const dataDir = path.join(tempDir, 'datasets');
const stateDir = path.join(tempDir, 'state');
const dbDir = path.join(tempDir, 'db');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(dbDir, { recursive: true });

const port = 32100 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}/api`;
const child = spawn(process.execPath, ['server.js'], {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        ADMIN_USERNAME: 'admin@example.com',
        ADMIN_PASSWORD: 'secret',
        DATASETS_DIR: dataDir,
        DB_DIR: dbDir,
        SETTINGS_FILE: path.join(stateDir, 'settings.json'),
        SPLITS_FILE: path.join(stateDir, 'splits.json'),
        WATCHES_FILE: path.join(stateDir, 'watches.json'),
        TRADE_HISTORY_FILE: path.join(stateDir, 'trade-history.json'),
        MONITOR_LOG_PATH: path.join(dataDir, 'monitoring.log'),
        LOGIN_LOG_PATH: path.join(dataDir, 'login-attempts.log'),
        AUTOTRADE_LOG_PATH: path.join(dataDir, 'autotrade.log'),
        AUTOTRADE_STATE_PATH: path.join(dataDir, 'autotrade-state.json'),
        WEBULL_RAW_LOG_PATH: path.join(dataDir, 'webull-raw.log'),
        WEBULL_ENABLE_LIVE_TEST_BUY: '',
    },
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function request(pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, {
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.cookie ? { Cookie: options.cookie } : {}),
            ...(options.headers || {}),
        },
    });
    const text = await response.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    return { response, body, text };
}

async function waitForServer() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        try {
            const { response } = await request('/status');
            if (response.ok) return;
        } catch {
            // Retry until the process opens the port.
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`server did not start:\n${output}`);
}

function currentEtMonthKey() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === 'year').value;
    const month = parts.find((part) => part.type === 'month').value;
    return `${year}-${month}`;
}

function assertSourceContains(file, expected) {
    const source = fs.readFileSync(path.join(repoDir, file), 'utf8');
    assert(source.includes(expected), `${file} does not contain expected guard: ${expected}`);
}

(async () => {
    try {
        await waitForServer();

        const publicCalendar = await request('/trading-calendar');
        assert.equal(publicCalendar.response.status, 200, 'public calendar read should remain available');

        const unauthPatch = await request('/trading-calendar/day', {
            method: 'PATCH',
            body: JSON.stringify({ year: '2099', mmdd: '01-02', type: 'holiday' }),
        });
        assert.equal(unauthPatch.response.status, 401, 'unauthenticated calendar mutation must be rejected');

        const login = await request('/login', {
            method: 'POST',
            body: JSON.stringify({ username: 'admin@example.com', password: 'secret', remember: false }),
        });
        assert.equal(login.response.status, 200, 'login should succeed');
        const cookie = login.response.headers.get('set-cookie').split(';')[0];

        const protoPatch = await request('/trading-calendar/day', {
            method: 'PATCH',
            cookie,
            body: JSON.stringify({ year: '__proto__', mmdd: 'toString', type: 'holiday' }),
        });
        assert.equal(protoPatch.response.status, 400, 'prototype calendar keys must be rejected');

        const validPatch = await request('/trading-calendar/day', {
            method: 'PATCH',
            cookie,
            body: JSON.stringify({ year: '2099', mmdd: '01-02', type: 'holiday', name: 'Security Regression' }),
        });
        assert.equal(validPatch.response.status, 200, 'authenticated valid calendar mutation should work');

        const putSettings = await request('/settings', {
            method: 'PUT',
            cookie,
            body: JSON.stringify({ polygonApiKey: 'POLYGON_SETTINGS_SENTINEL', watchThresholdPct: 0.3 }),
        });
        assert.equal(putSettings.response.status, 200, 'settings PUT should work');
        assert(!putSettings.text.includes('POLYGON_SETTINGS_SENTINEL'), 'settings PUT must not echo provider key');

        const getSettings = await request('/settings', { cookie });
        assert.equal(getSettings.response.status, 200, 'settings GET should work');
        assert(!getSettings.text.includes('POLYGON_SETTINGS_SENTINEL'), 'settings GET must not echo provider key');
        assert.equal(getSettings.body.polygonApiKeyConfigured, true, 'settings GET should expose key presence only');

        const unsafeSettingsPatch = await request('/settings', {
            method: 'PATCH',
            cookie,
            body: JSON.stringify({ autoTrading: { fixedQuantity: 999999, maxSlippageBps: 999999 } }),
        });
        assert.equal(unsafeSettingsPatch.response.status, 400, 'generic settings PATCH must reject autoTrading');

        const testBuy = await request('/autotrade/webull/test-buy', {
            method: 'POST',
            cookie,
            body: JSON.stringify({ symbol: 'AAL', quantity: 1000000000 }),
        });
        assert.equal(testBuy.response.status, 403, 'live test-buy must be disabled by default before broker calls');

        const rawLogPath = path.join(dataDir, `webull-raw-${currentEtMonthKey()}.log`);
        fs.writeFileSync(rawLogPath, `${JSON.stringify({
            event: 'request_ok',
            body: { token: 'BODY_ACCESS_TOKEN_SENTINEL', account_id: 'ACCOUNT_SENTINEL' },
            responseBody: { access_token: 'RESPONSE_ACCESS_TOKEN_SENTINEL' },
        })}\n`);
        const logs = await request('/autotrade/logs?limit=5', { cookie });
        assert.equal(logs.response.status, 200, 'autotrade logs should load');
        assert(!logs.text.includes('BODY_ACCESS_TOKEN_SENTINEL'), 'broker raw logs must redact request tokens');
        assert(!logs.text.includes('RESPONSE_ACCESS_TOKEN_SENTINEL'), 'broker raw logs must redact response tokens');
        assert(!logs.text.includes('ACCOUNT_SENTINEL'), 'broker raw logs must redact account ids');

        const { buildPolygonPageUrl } = require('../src/providers/polygon');
        assert.throws(
            () => buildPolygonPageUrl('https://attacker.example/collect', 'POLYGON_SECRET_SENTINEL'),
            /unsafe pagination URL/,
            'Polygon pagination must reject cross-host next_url values'
        );
        assert(
            buildPolygonPageUrl('/v2/aggs/ticker/AAPL/range/1/day/2025-01-01/2025-01-02', 'POLYGON_SECRET_SENTINEL')
                .startsWith('https://api.polygon.io/v2/'),
            'Polygon pagination should allow same-host relative paths'
        );

        assertSourceContains('server/src/services/autotrade.js', 'reserveOrderSubmission({');
        assertSourceContains('server/src/services/autotrade.js', 'await trackSubmittedOrder({');
        assertSourceContains('server/src/services/telegramAggregation.js', 'waitingForExitFill');

        console.log('security regression checks passed');
    } finally {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000).unref();
    }
})().catch((error) => {
    console.error(error);
    console.error(output);
    child.kill('SIGTERM');
    process.exitCode = 1;
});
