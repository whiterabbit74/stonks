const { getDb } = require('../db');
const { getApiConfig } = require('../config');
const { sendTelegramMessage } = require('./telegram');
const { etKeyYMD, getETParts } = require('./dates');

const TOKEN_LIFETIME_MS = 15 * 24 * 60 * 60 * 1000;
const RENEWAL_WARNING_DAYS = 3;
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
        SELECT token, created_at, expires_at, last_check_status, last_check_at, last_health_check_date, updated_at
        FROM webull_token WHERE id = 'current'
    `).get() || null;
}

function saveToken({ token, expiresAt }) {
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) throw new Error('Webull token is required');

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = toIsoDate(expiresAt, new Date(now.getTime() + TOKEN_LIFETIME_MS).toISOString());
    getDb().prepare(`
        INSERT INTO webull_token (id, token, created_at, expires_at, last_check_status, last_check_at, last_health_check_date, updated_at)
        VALUES ('current', ?, ?, ?, 'PENDING', NULL, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET
            token = excluded.token,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at,
            last_check_status = excluded.last_check_status,
            last_check_at = NULL,
            last_health_check_date = NULL,
            updated_at = excluded.updated_at
    `).run(normalizedToken, nowIso, expiresAtIso, nowIso);
    return getStoredToken();
}

function updateCheckStatus(status) {
    const normalizedStatus = String(status || 'UNKNOWN').toUpperCase();
    const nowIso = new Date().toISOString();
    getDb().prepare(`
        UPDATE webull_token
        SET last_check_status = ?, last_check_at = ?, updated_at = ?
        WHERE id = 'current'
    `).run(normalizedStatus, nowIso, nowIso);
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

async function runDailyTokenHealthCheck() {
    try {
        const stored = getStoredToken();
        const todayEt = etKeyYMD(getETParts(new Date()));
        if (stored?.last_health_check_date === todayEt) return { skipped: true };

        const runMarkedAt = new Date().toISOString();
        getDb().prepare(`
            INSERT INTO webull_token (id, last_health_check_date, updated_at)
            VALUES ('current', ?, ?)
            ON CONFLICT(id) DO UPDATE SET last_health_check_date = excluded.last_health_check_date, updated_at = excluded.updated_at
        `).run(todayEt, runMarkedAt);

        let status = 'MISSING';
        if (stored?.token || getApiConfig().WEBULL_ACCESS_TOKEN) {
            const { checkAccessToken } = require('./webullClient');
            const result = await checkAccessToken();
            status = extractCheckStatus(result?.data);
        }
        updateCheckStatus(status);

        const daysLeft = getDaysLeft(stored?.expires_at);
        if (status !== 'NORMAL' || (daysLeft != null && daysLeft <= RENEWAL_WARNING_DAYS)) {
            const reason = status !== 'NORMAL'
                ? `Статус токена Webull: ${status}.`
                : `Токен Webull истекает через ${daysLeft} дн.`;
            await sendTelegramMessage(getApiConfig().TELEGRAM_CHAT_ID, `⚠️ ${reason}\n${RENEWAL_INSTRUCTION}`);
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
};
