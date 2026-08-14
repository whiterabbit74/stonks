const { getDb } = require('../db');
const { getApiConfig } = require('../config');
const { sendTelegramMessage } = require('./telegram');
const { etKeyYMD, getETParts } = require('./dates');

const RENEWAL_WARNING_DAYS = 3;
const HEALTH_CHECK_RETRY_MS = 15 * 60 * 1000;
const RENEWAL_INSTRUCTION = 'Создай новый токен: POST /api/autotrade/webull/token/create (или кнопка на /broker), подтверди SMS в приложении Webull, затем token/check';

function toIsoDate(value, fallback = null) {
    if (value == null || value === '') return fallback;
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
        ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
        : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function getStoredToken() {
    return getDb().prepare(`
        SELECT token, created_at, expires_at, last_check_status, last_check_at,
               last_health_check_date, last_health_check_attempt_at, updated_at
        FROM webull_token WHERE id = 'current'
    `).get() || null;
}

function saveToken({ token, expiresAt, status = 'PENDING' }) {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) throw new Error('Webull token is required');

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = toIsoDate(expiresAt);
    const normalizedStatus = String(status || 'PENDING').toUpperCase();
    getDb().prepare(`
        INSERT INTO webull_token (id, token, created_at, expires_at, last_check_status, last_check_at, last_health_check_date, last_health_check_attempt_at, updated_at)
        VALUES ('current', ?, ?, ?, ?, NULL, NULL, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET
            token = excluded.token,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at,
            last_check_status = excluded.last_check_status,
            last_check_at = NULL,
            last_health_check_date = NULL,
            last_health_check_attempt_at = NULL,
            updated_at = excluded.updated_at
    `).run(normalizedToken, nowIso, expiresAtIso, normalizedStatus, nowIso);
    return getStoredToken();
}

function updateCheckStatus(status, expiresAt, token) {
    const normalizedStatus = String(status || 'UNKNOWN').toUpperCase();
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    const nowIso = new Date().toISOString();
    const expiresAtIso = toIsoDate(expiresAt);
    getDb().prepare(`
        UPDATE webull_token
        SET last_check_status = ?, last_check_at = ?,
            token = CASE WHEN ? <> '' THEN ? ELSE token END,
            expires_at = COALESCE(?, expires_at), updated_at = ?
        WHERE id = 'current'
    `).run(normalizedStatus, nowIso, normalizedToken, normalizedToken, expiresAtIso, nowIso);
    return getStoredToken();
}

function getDaysLeft(expiresAt, now = new Date()) {
    const expiresMs = Date.parse(expiresAt || '');
    if (Number.isNaN(expiresMs)) return null;
    return Math.ceil((expiresMs - now.getTime()) / (24 * 60 * 60 * 1000));
}

function extractCheckStatus(data) {
    return String(data?.status || data?.token_status || data?.tokenStatus || data?.data?.status || 'UNKNOWN').toUpperCase();
}

function extractTokenExpiry(data) {
    return data?.expires || data?.expires_at || data?.expiresAt || data?.expiration_time || data?.expirationTime || data?.expire_time
        || data?.data?.expires || data?.data?.expires_at || data?.data?.expiresAt || null;
}

function extractTokenValue(data) {
    return data?.token || data?.access_token || data?.accessToken || data?.data?.token || data?.data?.access_token || '';
}

function hasRetryDelayElapsed(stored, now = new Date()) {
    const lastAttemptMs = Date.parse(stored?.last_health_check_attempt_at || '');
    return Number.isNaN(lastAttemptMs) || now.getTime() - lastAttemptMs >= HEALTH_CHECK_RETRY_MS;
}

function markHealthCheckAttempt(at) {
    const nowIso = at.toISOString();
    getDb().prepare(`
        INSERT INTO webull_token (id, last_health_check_attempt_at, updated_at)
        VALUES ('current', ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            last_health_check_attempt_at = excluded.last_health_check_attempt_at,
            updated_at = excluded.updated_at
    `).run(nowIso, nowIso);
}

function markHealthCheckCompleted(todayEt, at) {
    const nowIso = at.toISOString();
    getDb().prepare(`
        INSERT INTO webull_token (id, last_health_check_date, last_health_check_attempt_at, updated_at)
        VALUES ('current', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            last_health_check_date = excluded.last_health_check_date,
            last_health_check_attempt_at = excluded.last_health_check_attempt_at,
            updated_at = excluded.updated_at
    `).run(todayEt, nowIso, nowIso);
}

async function runDailyTokenHealthCheck() {
    try {
        const stored = getStoredToken();
        const now = new Date();
        const todayEt = etKeyYMD(getETParts(now));
        if (stored?.last_health_check_date === todayEt) return { skipped: true };
        if (!hasRetryDelayElapsed(stored, now)) return { skipped: true, reason: 'retry_backoff' };
        markHealthCheckAttempt(now);

        const storedToken = typeof stored?.token === 'string' ? stored.token.trim() : '';
        const storedStatus = String(stored?.last_check_status || '').toUpperCase();
        const envToken = getApiConfig().WEBULL_ACCESS_TOKEN || '';
        // Prefer the confirmed SQLite token. A pending/invalid SQLite token must never
        // prevent a valid environment fallback from receiving its daily keep-alive.
        const source = storedToken && storedStatus === 'NORMAL'
            ? 'db'
            : (envToken ? 'env' : (storedToken ? 'db' : 'none'));
        const tokenToCheck = source === 'env' ? envToken : storedToken;
        let status = 'MISSING';
        if (source !== 'none') {
            const { checkAccessToken, getAccountBalance, getAccountList, buildWebullRuntimeConfig } = require('./webullClient');
            const result = await checkAccessToken(tokenToCheck);
            status = extractCheckStatus(result?.data);
            if (source === 'db') {
                updateCheckStatus(status, extractTokenExpiry(result?.data), extractTokenValue(result?.data));
            }

            if (status === 'NORMAL') {
                // The status request carries the token in its body and does not count as active API use.
                // A successful authenticated account request is the daily keep-alive that prevents idle expiry.
                const runtime = buildWebullRuntimeConfig();
                if (runtime.accountId) {
                    await getAccountBalance(runtime.accountId);
                } else {
                    await getAccountList();
                }
            }
        } else {
            updateCheckStatus(status);
        }

        const refreshed = getStoredToken();
        const daysLeft = source === 'db' ? getDaysLeft(refreshed?.expires_at) : null;
        // The authenticated request above is the keep-alive. Do not retry it merely
        // because Telegram is temporarily unavailable for a later warning delivery.
        markHealthCheckCompleted(todayEt, new Date());
        if (status !== 'NORMAL' || (source === 'db' && daysLeft != null && daysLeft <= RENEWAL_WARNING_DAYS)) {
            const reason = status !== 'NORMAL'
                ? `Статус токена Webull: ${status}.`
                : `Токен Webull истекает через ${daysLeft} дн.`;
            const telegramResult = await sendTelegramMessage(getApiConfig().TELEGRAM_CHAT_ID, `⚠️ ${reason}\n${RENEWAL_INSTRUCTION}`);
            if (!telegramResult?.ok) throw new Error(`Failed to send Webull token warning: ${telegramResult?.error || telegramResult?.reason || 'unknown error'}`);
        }

        return { status, daysLeft };
    } catch (error) {
        console.warn('Webull token health check failed:', error && error.message ? error.message : error);
        return { error: true };
    }
}

module.exports = {
    getStoredToken,
    saveToken,
    updateCheckStatus,
    getDaysLeft,
    runDailyTokenHealthCheck,
    __testables: {
        toIsoDate,
        extractTokenExpiry,
        extractTokenValue,
        hasRetryDelayElapsed,
    },
};
