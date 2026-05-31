const crypto = require('crypto');
const { getDb } = require('../db');
const { getDataset } = require('./datasets');
const { getTickerSplits } = require('./splits');
const { evaluatePriceIntegrity } = require('./marketDataIntegrity');
const { toSafeTicker } = require('../utils/helpers');
const { fetchTodayRangeAndQuote } = require('../providers/finnhub');

function toNumber(value, fallback) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeNextAction(value, fallback = 'buy') {
    return value === 'sell' ? 'sell' : fallback === 'sell' ? 'sell' : 'buy';
}

function normalizeRange(payload, current = {}) {
    const legacyLevel = toNumber(payload.levelPct, null);
    const legacyDirection = payload.direction === 'below' ? 'below' : 'above';
    const buyFallback = current.buyLevelPct ?? (legacyDirection === 'below' ? legacyLevel : 15);
    const sellFallback = current.sellLevelPct ?? (legacyDirection === 'above' ? legacyLevel : 40);
    const buyLevelPct = toNumber(payload.buyLevelPct, buyFallback);
    const sellLevelPct = toNumber(payload.sellLevelPct, sellFallback);

    if (!Number.isFinite(buyLevelPct)) throw new Error('buyLevelPct is required');
    if (!Number.isFinite(sellLevelPct)) throw new Error('sellLevelPct is required');
    if (buyLevelPct >= sellLevelPct) {
        throw new Error('buyLevelPct must be lower than sellLevelPct');
    }

    return { buyLevelPct, sellLevelPct };
}

function rowToAlert(row) {
    const direction = row.direction === 'below' ? 'below' : 'above';
    const buyLevelPct = Number.isFinite(row.buy_level_pct)
        ? row.buy_level_pct
        : direction === 'below' ? row.level_pct : 15;
    const sellLevelPct = Number.isFinite(row.sell_level_pct)
        ? row.sell_level_pct
        : direction === 'above' ? row.level_pct : 40;
    const nextAction = row.next_action === 'sell' ? 'sell' : 'buy';
    const activeLevelPct = nextAction === 'buy' ? buyLevelPct : sellLevelPct;

    return {
        id: row.id,
        symbol: row.symbol,
        emaPeriod: row.ema_period,
        levelPct: row.level_pct,
        direction,
        buyLevelPct,
        sellLevelPct,
        nextAction,
        activeLevelPct,
        lastTriggeredAction: row.last_triggered_action || null,
        lastTriggeredAt: row.last_triggered_at || null,
        lastTriggeredDeviationPct: row.last_triggered_deviation_pct,
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
    const range = normalizeRange(payload || {});
    const nextAction = normalizeNextAction(payload.nextAction, 'buy');
    const levelPct = nextAction === 'buy' ? range.buyLevelPct : range.sellLevelPct;
    const direction = nextAction === 'buy' ? 'below' : 'above';
    const thresholdPct = Math.max(0, toNumber(payload.thresholdPct, 0.5));
    const enabled = payload.enabled !== false;
    const id = payload.id || crypto.randomUUID();
    const now = new Date().toISOString();

    getDb().prepare(`
        INSERT INTO telegram_ema_alerts
        (id, symbol, ema_period, level_pct, direction, buy_level_pct, sell_level_pct, next_action, threshold_pct, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, symbol, emaPeriod, levelPct, direction, range.buyLevelPct, range.sellLevelPct, nextAction, thresholdPct, enabled ? 1 : 0, now, now);

    return getEmaAlert(id);
}

function getEmaAlert(id) {
    const row = getDb().prepare('SELECT * FROM telegram_ema_alerts WHERE id = ?').get(id);
    return row ? rowToAlert(row) : null;
}

function updateEmaAlert(id, payload) {
    const current = getEmaAlert(id);
    if (!current) return null;
    const range = normalizeRange(payload || {}, current);
    const nextAction = normalizeNextAction(payload.nextAction, current.nextAction);
    const levelPct = nextAction === 'buy' ? range.buyLevelPct : range.sellLevelPct;
    const direction = nextAction === 'buy' ? 'below' : 'above';

    const next = {
        symbol: payload.symbol ? toSafeTicker(payload.symbol) : current.symbol,
        emaPeriod: [20, 200].includes(Number(payload.emaPeriod)) ? Number(payload.emaPeriod) : current.emaPeriod,
        levelPct,
        direction,
        buyLevelPct: range.buyLevelPct,
        sellLevelPct: range.sellLevelPct,
        nextAction,
        thresholdPct: payload.thresholdPct == null ? current.thresholdPct : Math.max(0, toNumber(payload.thresholdPct, current.thresholdPct)),
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : current.enabled,
    };

    getDb().prepare(`
        UPDATE telegram_ema_alerts
        SET symbol = ?, ema_period = ?, level_pct = ?, direction = ?, buy_level_pct = ?, sell_level_pct = ?, next_action = ?, threshold_pct = ?, enabled = ?, updated_at = ?
        WHERE id = ?
    `).run(next.symbol, next.emaPeriod, next.levelPct, next.direction, next.buyLevelPct, next.sellLevelPct, next.nextAction, next.thresholdPct, next.enabled ? 1 : 0, new Date().toISOString(), id);

    return getEmaAlert(id);
}

function deleteEmaAlert(id) {
    getDb().prepare('DELETE FROM telegram_ema_alerts WHERE id = ?').run(id);
    return { success: true };
}

function calculateEma(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = 0;
    for (let i = 0; i < period; i++) {
        ema += values[i];
    }
    ema /= period;
    for (let i = period; i < values.length; i++) {
        ema = values[i] * multiplier + ema * (1 - multiplier);
    }
    return ema;
}

function normalizeSplitEvents(events) {
    const byDate = new Map();
    for (const event of Array.isArray(events) ? events : []) {
        const factor = Number(event && event.factor);
        const date = event && typeof event.date === 'string' ? event.date.slice(0, 10) : '';
        if (!date || !Number.isFinite(factor) || factor <= 0 || factor === 1) continue;
        byDate.set(date, { date, factor });
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildContinuousPrices(symbol, dataset, history, currentPrice, knownSplits = null) {
    if (dataset && dataset.adjustedForSplits) {
        return {
            closes: history.map((bar) => Number(bar.close)).filter((value) => Number.isFinite(value)),
            currentPrice,
            basis: 'split_adjusted',
        };
    }

    let splits = [];
    if (Array.isArray(knownSplits)) {
        splits = knownSplits;
    } else {
        try {
            splits = getTickerSplits(symbol);
        } catch {
            splits = [];
        }
    }
    const events = normalizeSplitEvents(splits);
    let splitIndex = 0;
    let cumulativeFactor = 1;
    const closes = [];

    for (const bar of history.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
        const barDate = String(bar.date || '').slice(0, 10);
        while (splitIndex < events.length && events[splitIndex].date <= barDate) {
            cumulativeFactor *= events[splitIndex].factor;
            splitIndex += 1;
        }
        const close = Number(bar.close);
        if (Number.isFinite(close)) closes.push(close * cumulativeFactor);
    }

    while (splitIndex < events.length) {
        cumulativeFactor *= events[splitIndex].factor;
        splitIndex += 1;
    }

    return {
        closes,
        currentPrice: currentPrice * cumulativeFactor,
        rawCurrentPrice: currentPrice,
        splitFactor: cumulativeFactor,
        basis: events.length > 0 ? 'holder_value' : 'raw',
    };
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

    let knownSplits = [];
    try {
        knownSplits = getTickerSplits(alert.symbol);
    } catch {
        knownSplits = [];
    }
    const integrity = evaluatePriceIntegrity({
        symbol: alert.symbol,
        dataset,
        currentPrice,
        quote: quoteResult && quoteResult.quote,
        knownSplits,
        adjustedForSplits: !!(dataset && dataset.adjustedForSplits),
    });
    if (integrity.blockSignals) {
        return {
            ...alert,
            dataOk: false,
            reason: 'integrity_blocked',
            currentPrice,
            near: false,
            reached: false,
            integrityWarning: integrity,
        };
    }

    const continuous = buildContinuousPrices(alert.symbol, dataset, history, currentPrice, knownSplits);
    const ema = calculateEma([...continuous.closes, continuous.currentPrice], alert.emaPeriod);
    if (!Number.isFinite(ema) || ema === 0) {
        return { ...alert, dataOk: false, reason: 'no_ema' };
    }

    const deviationPct = ((continuous.currentPrice / ema) - 1) * 100;
    const action = alert.nextAction === 'sell' ? 'sell' : 'buy';
    const activeLevelPct = action === 'buy' ? alert.buyLevelPct : alert.sellLevelPct;
    const near = Math.abs(deviationPct - activeLevelPct) <= alert.thresholdPct;
    const reached = action === 'buy'
        ? deviationPct <= activeLevelPct
        : deviationPct >= activeLevelPct;

    return {
        ...alert,
        dataOk: true,
        currentPrice,
        indexPrice: continuous.currentPrice,
        priceBasis: continuous.basis,
        splitFactor: continuous.splitFactor,
        ema,
        deviationPct,
        action,
        activeLevelPct,
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

function markEmaAlertTriggered(id, action, deviationPct, triggeredAt = new Date().toISOString()) {
    const current = getEmaAlert(id);
    if (!current) return null;
    const triggeredAction = action === 'sell' ? 'sell' : 'buy';
    const nextAction = triggeredAction === 'buy' ? 'sell' : 'buy';
    const levelPct = nextAction === 'buy' ? current.buyLevelPct : current.sellLevelPct;
    const direction = nextAction === 'buy' ? 'below' : 'above';
    getDb().prepare(`
        UPDATE telegram_ema_alerts
        SET next_action = ?,
            level_pct = ?,
            direction = ?,
            last_triggered_action = ?,
            last_triggered_at = ?,
            last_triggered_deviation_pct = ?,
            updated_at = ?
        WHERE id = ?
    `).run(nextAction, levelPct, direction, triggeredAction, triggeredAt, Number.isFinite(deviationPct) ? deviationPct : null, new Date().toISOString(), id);
    return getEmaAlert(id);
}

function markEmaAlertsTriggered(alerts, triggeredAt = new Date().toISOString()) {
    const updated = [];
    for (const alert of Array.isArray(alerts) ? alerts : []) {
        if (!alert || !alert.id || !alert.reached) continue;
        const next = markEmaAlertTriggered(alert.id, alert.action, alert.deviationPct, triggeredAt);
        if (next) updated.push(next);
    }
    return updated;
}

module.exports = {
    listEmaAlerts,
    createEmaAlert,
    getEmaAlert,
    updateEmaAlert,
    deleteEmaAlert,
    evaluateEmaAlerts,
    markEmaAlertTriggered,
    markEmaAlertsTriggered,
};
