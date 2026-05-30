const crypto = require('crypto');
const { getDb } = require('../db');
const { getDataset } = require('./datasets');
const { toSafeTicker } = require('../utils/helpers');
const { fetchTodayRangeAndQuote } = require('../providers/finnhub');

function toNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function rowToAlert(row) {
    return {
        id: row.id,
        symbol: row.symbol,
        emaPeriod: row.ema_period,
        levelPct: row.level_pct,
        direction: row.direction === 'below' ? 'below' : 'above',
        thresholdPct: row.threshold_pct,
        enabled: !!row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function listEmaAlerts({ enabledOnly = false } = {}) {
    const db = getDb();
    const rows = enabledOnly
        ? db.prepare('SELECT * FROM telegram_ema_alerts WHERE enabled = 1 ORDER BY symbol, ema_period, level_pct').all()
        : db.prepare('SELECT * FROM telegram_ema_alerts ORDER BY symbol, ema_period, level_pct').all();
    return rows.map(rowToAlert);
}

function createEmaAlert(payload) {
    const symbol = toSafeTicker(payload && payload.symbol);
    if (!symbol) throw new Error('symbol is required');
    const emaPeriod = [20, 200].includes(Number(payload.emaPeriod)) ? Number(payload.emaPeriod) : 200;
    const levelPct = toNumber(payload.levelPct, null);
    if (levelPct == null) throw new Error('levelPct is required');
    const direction = payload.direction === 'below' ? 'below' : 'above';
    const thresholdPct = Math.max(0, toNumber(payload.thresholdPct, 0.5));
    const enabled = payload.enabled !== false;
    const id = payload.id || crypto.randomUUID();
    const now = new Date().toISOString();

    getDb().prepare(`
        INSERT INTO telegram_ema_alerts
        (id, symbol, ema_period, level_pct, direction, threshold_pct, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, symbol, emaPeriod, levelPct, direction, thresholdPct, enabled ? 1 : 0, now, now);

    return getEmaAlert(id);
}

function getEmaAlert(id) {
    const row = getDb().prepare('SELECT * FROM telegram_ema_alerts WHERE id = ?').get(id);
    return row ? rowToAlert(row) : null;
}

function updateEmaAlert(id, payload) {
    const current = getEmaAlert(id);
    if (!current) return null;

    const next = {
        symbol: payload.symbol ? toSafeTicker(payload.symbol) : current.symbol,
        emaPeriod: [20, 200].includes(Number(payload.emaPeriod)) ? Number(payload.emaPeriod) : current.emaPeriod,
        levelPct: payload.levelPct == null ? current.levelPct : toNumber(payload.levelPct, current.levelPct),
        direction: payload.direction === 'below' || payload.direction === 'above' ? payload.direction : current.direction,
        thresholdPct: payload.thresholdPct == null ? current.thresholdPct : Math.max(0, toNumber(payload.thresholdPct, current.thresholdPct)),
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : current.enabled,
    };

    getDb().prepare(`
        UPDATE telegram_ema_alerts
        SET symbol = ?, ema_period = ?, level_pct = ?, direction = ?, threshold_pct = ?, enabled = ?, updated_at = ?
        WHERE id = ?
    `).run(next.symbol, next.emaPeriod, next.levelPct, next.direction, next.thresholdPct, next.enabled ? 1 : 0, new Date().toISOString(), id);

    return getEmaAlert(id);
}

function deleteEmaAlert(id) {
    getDb().prepare('DELETE FROM telegram_ema_alerts WHERE id = ?').run(id);
    return { success: true };
}

function calculateEma(values, period) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const multiplier = 2 / (period + 1);
    let ema = values[0];
    for (let i = 1; i < values.length; i++) {
        ema = values[i] * multiplier + ema * (1 - multiplier);
    }
    return ema;
}

async function evaluateEmaAlert(alert) {
    const dataset = getDataset(alert.symbol);
    const history = dataset && Array.isArray(dataset.data) ? dataset.data : [];
    if (history.length < alert.emaPeriod) {
        return { ...alert, dataOk: false, reason: 'not_enough_history' };
    }

    const quoteResult = await fetchTodayRangeAndQuote(alert.symbol);
    const currentPrice = Number(quoteResult && quoteResult.quote && quoteResult.quote.current);
    if (!Number.isFinite(currentPrice)) {
        return { ...alert, dataOk: false, reason: 'no_quote' };
    }

    const closes = history
        .map((bar) => Number(bar.close))
        .filter((value) => Number.isFinite(value));
    const ema = calculateEma([...closes, currentPrice], alert.emaPeriod);
    if (!Number.isFinite(ema) || ema === 0) {
        return { ...alert, dataOk: false, reason: 'no_ema' };
    }

    const deviationPct = ((currentPrice / ema) - 1) * 100;
    const near = Math.abs(deviationPct - alert.levelPct) <= alert.thresholdPct;
    const reached = alert.direction === 'below'
        ? deviationPct <= alert.levelPct
        : deviationPct >= alert.levelPct;

    return {
        ...alert,
        dataOk: true,
        currentPrice,
        ema,
        deviationPct,
        near,
        reached,
    };
}

async function evaluateEmaAlerts() {
    const alerts = listEmaAlerts({ enabledOnly: true });
    const results = [];
    for (const alert of alerts) {
        try {
            results.push(await evaluateEmaAlert(alert));
        } catch (error) {
            results.push({ ...alert, dataOk: false, reason: error && error.message ? error.message : 'failed' });
        }
    }
    return results;
}

module.exports = {
    listEmaAlerts,
    createEmaAlert,
    updateEmaAlert,
    deleteEmaAlert,
    evaluateEmaAlerts,
};
