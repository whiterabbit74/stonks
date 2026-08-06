const crypto = require('crypto');
const { getDb } = require('../db');
const { getDataset } = require('./datasets');
const { getTickerSplits } = require('./splits');
const { evaluatePriceIntegrity } = require('./marketDataIntegrity');
const { toSafeTicker } = require('../utils/helpers');
const { fetchTodayRangeAndQuote } = require('../providers/quote');

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
    // INFO-ONLY level: never affects next_action / buy-sell alternation / validation.
    const infoLevelPct = Number.isFinite(row.info_level_pct) ? row.info_level_pct : -20;
    const infoLastSide = row.info_last_side === 'above' || row.info_last_side === 'below'
        ? row.info_last_side
        : null;
    const infoLastNotifiedAt = row.info_last_notified_at || null;

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
        infoLevelPct,
        infoLastSide,
        infoLastNotifiedAt,
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
    // INFO-ONLY level (default -20%). Does not participate in buy/sell alternation.
    const infoLevelPct = toNumber(payload.infoLevelPct, -20);
    const enabled = payload.enabled !== false;
    const id = payload.id || crypto.randomUUID();
    const now = new Date().toISOString();

    getDb().prepare(`
        INSERT INTO telegram_ema_alerts
        (id, symbol, ema_period, level_pct, direction, buy_level_pct, sell_level_pct, next_action, threshold_pct, info_level_pct, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, symbol, emaPeriod, levelPct, direction, range.buyLevelPct, range.sellLevelPct, nextAction, thresholdPct, infoLevelPct, enabled ? 1 : 0, now, now);

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
        // INFO-ONLY level, independent of buy/sell alternation.
        infoLevelPct: payload.infoLevelPct == null ? current.infoLevelPct : toNumber(payload.infoLevelPct, current.infoLevelPct),
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : current.enabled,
    };

    getDb().prepare(`
        UPDATE telegram_ema_alerts
        SET symbol = ?, ema_period = ?, level_pct = ?, direction = ?, buy_level_pct = ?, sell_level_pct = ?, next_action = ?, threshold_pct = ?, info_level_pct = ?, enabled = ?, updated_at = ?
        WHERE id = ?
    `).run(next.symbol, next.emaPeriod, next.levelPct, next.direction, next.buyLevelPct, next.sellLevelPct, next.nextAction, next.thresholdPct, next.infoLevelPct, next.enabled ? 1 : 0, new Date().toISOString(), id);

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

    // INFO-ONLY level tracking: does NOT affect next_action / buy-sell alternation.
    // Uses the same raw comparison convention as buy/sell levels (deviationPct vs level).
    const infoLevelPct = Number.isFinite(alert.infoLevelPct) ? alert.infoLevelPct : -20;
    const infoSide = deviationPct >= infoLevelPct ? 'above' : 'below';
    const infoPrevSide = alert.infoLastSide || null;
    const infoCrossing = infoPrevSide && infoPrevSide !== infoSide
        ? (infoSide === 'below' ? 'down' : 'up')
        : null;

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
        infoLevelPct,
        infoDeviationPct: deviationPct,
        infoSide,
        infoPrevSide,
        infoCrossing,
    };
}

async function evaluateEmaAlerts() {
    const alerts = listEmaAlerts({ enabledOnly: true });
    const results = [];
    for (const alert of alerts) {
        try {
            results.push(await evaluateEmaAlert(alert));
        } catch (error) {
            const raw = error && error.message ? String(error.message) : 'failed';
            // Keep Telegram reasons short and readable (no raw JSON parse dumps).
            let reason = raw;
            const cdnMatch = raw.match(/CDN error\s+(\d+)/i);
            if (cdnMatch) {
                reason = `котировка временно недоступна (CDN ${cdnMatch[1]})`;
            } else if (/Unexpected token|not valid JSON|invalid JSON|non-JSON|quote unavailable/i.test(raw)) {
                reason = 'котировка временно недоступна';
            } else if (raw.length > 80) {
                reason = `${raw.slice(0, 77)}…`;
            }
            results.push({ ...alert, dataOk: false, reason });
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

/**
 * Persist the info-level side (and optionally the notification timestamp) for a single alert.
 * This is INFO-ONLY: it never touches next_action / buy-sell alternation.
 * Mirrors the style of markEmaAlertTriggered.
 */
function recordEmaInfoSide(id, side, notifiedAt = null) {
    const normalizedSide = side === 'above' || side === 'below' ? side : null;
    if (!normalizedSide) return null;
    getDb().prepare(`
        UPDATE telegram_ema_alerts
        SET info_last_side = ?,
            info_last_notified_at = COALESCE(?, info_last_notified_at),
            updated_at = ?
        WHERE id = ?
    `).run(normalizedSide, notifiedAt, new Date().toISOString(), id);
    return getEmaAlert(id);
}

/**
 * Batch-persist info-level sides for alerts that had a crossing, marking them notified.
 * Only call this after a successful Telegram send of the info-level content.
 */
function recordEmaInfoSides(alerts, notifiedAt = new Date().toISOString()) {
    const updated = [];
    for (const alert of Array.isArray(alerts) ? alerts : []) {
        if (!alert || !alert.id || !alert.dataOk || !alert.infoCrossing || !alert.infoSide) continue;
        const next = recordEmaInfoSide(alert.id, alert.infoSide, notifiedAt);
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
    recordEmaInfoSide,
    recordEmaInfoSides,
};
