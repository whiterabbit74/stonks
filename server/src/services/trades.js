/**
 * Trade history management service
 */
const crypto = require('crypto');
const fs = require('fs-extra');
const { TRADE_HISTORY_FILE } = require('../config');

// In-memory trade history
const tradeHistory = [];
let tradeHistoryLoaded = false;
let saveTradeHistoryTimer = null;

// External dependency (will be set by telegram service)
let telegramWatches = null;
let scheduleSaveWatchesFn = null;

function setTelegramWatches(watches, saveFn) {
    telegramWatches = watches;
    scheduleSaveWatchesFn = saveFn;
}

function normalizeTradeRecord(rec) {
    const safe = rec && typeof rec === 'object' ? { ...rec } : {};
    const symbol = typeof safe.symbol === 'string' ? safe.symbol.toUpperCase() : null;
    let status = safe.status === 'open' ? 'open' : 'closed';
    const entryPrice = typeof safe.entryPrice === 'number' ? safe.entryPrice : (safe.entryPrice != null ? Number(safe.entryPrice) : null);
    const exitPrice = typeof safe.exitPrice === 'number' ? safe.exitPrice : (safe.exitPrice != null ? Number(safe.exitPrice) : null);

    if (safe.exitDate || safe.exitDecisionTime || (typeof exitPrice === 'number' && Number.isFinite(exitPrice))) {
        status = 'closed';
    }

    let pnlAbsolute = typeof safe.pnlAbsolute === 'number' ? safe.pnlAbsolute : null;
    let pnlPercent = typeof safe.pnlPercent === 'number' ? safe.pnlPercent : null;

    if (entryPrice != null && exitPrice != null) {
        const diff = exitPrice - entryPrice;
        pnlAbsolute = diff;
        pnlPercent = (diff / entryPrice) * 100;
    }

    let holdingDays = typeof safe.holdingDays === 'number' ? safe.holdingDays : null;
    if (!holdingDays && safe.entryDate && safe.exitDate) {
        const entryDate = new Date(safe.entryDate);
        const exitDate = new Date(safe.exitDate);
        if (!Number.isNaN(entryDate.valueOf()) && !Number.isNaN(exitDate.valueOf())) {
            const diff = Math.round((exitDate.getTime() - entryDate.getTime()) / (24 * 3600 * 1000));
            holdingDays = diff >= 0 ? Math.max(1, diff) : null;
        }
    }

    return {
        id: typeof safe.id === 'string' ? safe.id : crypto.randomUUID(),
        symbol: symbol || 'UNKNOWN',
        status,
        entryDate: typeof safe.entryDate === 'string' ? safe.entryDate : null,
        exitDate: typeof safe.exitDate === 'string' ? safe.exitDate : null,
        entryPrice,
        exitPrice,
        entryIBS: typeof safe.entryIBS === 'number' ? safe.entryIBS : (safe.entryIBS != null ? Number(safe.entryIBS) : null),
        exitIBS: typeof safe.exitIBS === 'number' ? safe.exitIBS : (safe.exitIBS != null ? Number(safe.exitIBS) : null),
        entryDecisionTime: typeof safe.entryDecisionTime === 'string' ? safe.entryDecisionTime : null,
        exitDecisionTime: typeof safe.exitDecisionTime === 'string' ? safe.exitDecisionTime : null,
        pnlPercent,
        pnlAbsolute,
        holdingDays,
        notes: typeof safe.notes === 'string' ? safe.notes : undefined,
    };
}

function scheduleSaveTradeHistory() {
    if (saveTradeHistoryTimer) clearTimeout(saveTradeHistoryTimer);
    saveTradeHistoryTimer = setTimeout(async () => {
        try {
            await fs.writeJson(TRADE_HISTORY_FILE, tradeHistory, { spaces: 2 });
            console.log(`Saved ${tradeHistory.length} trade records`);
        } catch (e) {
            console.warn('Failed to save trade history:', e && e.message ? e.message : e);
        }
    }, 200);
}

async function loadTradeHistory() {
    try {
        const exists = await fs.pathExists(TRADE_HISTORY_FILE);
        if (!exists) {
            tradeHistory.length = 0;
            tradeHistoryLoaded = true;
            return;
        }
        const data = await fs.readJson(TRADE_HISTORY_FILE);
        if (Array.isArray(data)) {
            tradeHistory.length = 0;
            for (const rec of data) {
                tradeHistory.push(normalizeTradeRecord(rec));
            }
        }
        tradeHistoryLoaded = true;
        if (telegramWatches && telegramWatches.size > 0) {
            const syncResult = synchronizeWatchesWithTradeHistory();
            if (syncResult.changes.length && scheduleSaveWatchesFn) {
                scheduleSaveWatchesFn();
            }
        }
    } catch (e) {
        console.warn('Failed to load trade history:', e && e.message ? e.message : e);
        tradeHistory.length = 0;
        tradeHistoryLoaded = true;
    }
}

function ensureTradeHistoryLoaded() {
    if (!tradeHistoryLoaded) {
        loadTradeHistory().catch(err => {
            console.warn('Trade history load error:', err && err.message ? err.message : err);
        });
    }
}

function getCurrentOpenTrade() {
    let latest = null;
    for (const trade of tradeHistory) {
        if (!trade || trade.status !== 'open') continue;
        if (!latest) {
            latest = trade;
            continue;
        }
        const latestKey = latest.entryDecisionTime || latest.entryDate || '';
        const tradeKey = trade.entryDecisionTime || trade.entryDate || '';
        if (tradeKey.localeCompare(latestKey) > 0) {
            latest = trade;
        }
    }
    return latest;
}

function recordTradeEntry({ symbol, price, ibs, decisionTime, dateKey }) {
    if (!symbol) return null;
    const normalizedSymbol = symbol.toUpperCase();
    const openTrade = getCurrentOpenTrade();
    if (openTrade) {
        console.warn(`Cannot open new trade for ${normalizedSymbol}: trade ${openTrade.id} is still open for ${openTrade.symbol}`);
        return null;
    }

    const trade = normalizeTradeRecord({
        id: crypto.randomUUID(),
        symbol: normalizedSymbol,
        status: 'open',
        entryDate: dateKey || null,
        entryPrice: typeof price === 'number' ? price : null,
        entryIBS: typeof ibs === 'number' ? ibs : null,
        entryDecisionTime: decisionTime || new Date().toISOString(),
    });

    tradeHistory.push(trade);
    scheduleSaveTradeHistory();
    return trade;
}

function recordTradeExit({ symbol, price, ibs, decisionTime, dateKey }) {
    if (!symbol) return null;
    const normalizedSymbol = symbol.toUpperCase();
    const openTrade = getCurrentOpenTrade();
    if (!openTrade || openTrade.symbol !== normalizedSymbol) {
        console.warn(`No matching open trade for ${normalizedSymbol} to close`);
        return null;
    }

    openTrade.status = 'closed';
    openTrade.exitDate = dateKey || null;
    openTrade.exitPrice = typeof price === 'number' ? price : null;
    openTrade.exitIBS = typeof ibs === 'number' ? ibs : null;
    openTrade.exitDecisionTime = decisionTime || new Date().toISOString();

    if (typeof openTrade.entryPrice === 'number' && typeof openTrade.exitPrice === 'number') {
        const diff = openTrade.exitPrice - openTrade.entryPrice;
        openTrade.pnlAbsolute = Number(diff.toFixed(6));
        openTrade.pnlPercent = Number(((diff / openTrade.entryPrice) * 100).toFixed(6));
    } else {
        openTrade.pnlAbsolute = null;
        openTrade.pnlPercent = null;
    }

    if (openTrade.entryDate && openTrade.exitDate) {
        const entryDate = new Date(openTrade.entryDate);
        const exitDate = new Date(openTrade.exitDate);
        if (!Number.isNaN(entryDate.valueOf()) && !Number.isNaN(exitDate.valueOf())) {
            const diff = Math.round((exitDate.getTime() - entryDate.getTime()) / (24 * 3600 * 1000));
            openTrade.holdingDays = diff >= 0 ? Math.max(1, diff) : null;
        }
    }

    scheduleSaveTradeHistory();
    return openTrade;
}

function isPositionOpen(watch) {
    return !!(watch.entryPrice !== null && watch.entryPrice !== undefined);
}

function synchronizeWatchesWithTradeHistory() {
    const openTrade = getCurrentOpenTrade();
    const openSymbol = openTrade ? openTrade.symbol : null;
    const changes = [];

    if (!telegramWatches) return { openTrade, changes };

    for (const watch of telegramWatches.values()) {
        const hadEntryPrice = isPositionOpen(watch);
        const shouldBeOpen = !!openSymbol && watch.symbol.toUpperCase() === openSymbol;

        if (shouldBeOpen) {
            const nextPrice = openTrade.entryPrice ?? null;
            const priceChanged = watch.entryPrice !== nextPrice;
            const idChanged = watch.currentTradeId !== openTrade.id;
            if (priceChanged || idChanged || !hadEntryPrice) {
                changes.push({ symbol: watch.symbol, action: 'sync_open', previousPrice: watch.entryPrice, nextPrice });
            }
            watch.entryPrice = nextPrice;
            watch.entryDate = openTrade.entryDate ?? null;
            watch.entryIBS = openTrade.entryIBS ?? null;
            watch.entryDecisionTime = openTrade.entryDecisionTime ?? null;
            watch.currentTradeId = openTrade.id;
            watch.isOpenPosition = true;
        } else {
            if (hadEntryPrice || watch.entryPrice != null || watch.currentTradeId) {
                changes.push({ symbol: watch.symbol, action: 'sync_close', previousPrice: watch.entryPrice });
            }
            watch.entryPrice = null;
            watch.entryDate = null;
            watch.entryIBS = null;
            watch.entryDecisionTime = null;
            watch.currentTradeId = null;
            watch.isOpenPosition = false;
        }
    }

    return { openTrade, changes };
}

function formatTradeSummary(trade) {
    if (!trade) return 'Нет сделок';
    const entryDate = trade.entryDate || '—';
    const exitDate = trade.exitDate || '—';
    const entryPrice = typeof trade.entryPrice === 'number' ? `$${trade.entryPrice.toFixed(2)}` : '—';
    const exitPrice = typeof trade.exitPrice === 'number' ? `$${trade.exitPrice.toFixed(2)}` : '—';
    const entryIbs = typeof trade.entryIBS === 'number' ? `${(trade.entryIBS * 100).toFixed(1)}%` : '—';
    const exitIbs = typeof trade.exitIBS === 'number' ? `${(trade.exitIBS * 100).toFixed(1)}%` : '—';
    const pnlPercent = typeof trade.pnlPercent === 'number' ? `${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '—';
    return `${trade.symbol} • ${entryDate} → ${exitDate} • ${entryPrice} → ${exitPrice} • IBS ${entryIbs} → ${exitIbs} • PnL ${pnlPercent}`;
}

function buildTradeHistoryMessage(limit = 5) {
    if (!tradeHistory.length) {
        return '<b>Последние сделки</b>\nСделок пока нет.';
    }

    const openTrade = getCurrentOpenTrade();
    const sorted = [...tradeHistory].sort((a, b) => {
        const aKey = a.exitDate || a.entryDate || '';
        const bKey = b.exitDate || b.entryDate || '';
        return bKey.localeCompare(aKey);
    });
    const recent = sorted.slice(0, limit);
    const lines = ['<b>Последние сделки</b>'];

    if (openTrade) {
        lines.push(`🔔 Текущая позиция: ${formatTradeSummary(openTrade)}`);
        lines.push('');
    }

    let index = 1;
    for (const trade of recent) {
        lines.push(`${index}. ${formatTradeSummary(trade)}`);
        index += 1;
    }

    return lines.join('\n');
}

function serializeTradeForResponse(trade) {
    return {
        id: trade.id,
        symbol: trade.symbol,
        status: trade.status,
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        entryIBS: trade.entryIBS,
        exitIBS: trade.exitIBS,
        entryDecisionTime: trade.entryDecisionTime,
        exitDecisionTime: trade.exitDecisionTime,
        pnlPercent: trade.pnlPercent,
        pnlAbsolute: trade.pnlAbsolute,
        holdingDays: trade.holdingDays,
    };
}

function getSortedTradeHistory() {
    return [...tradeHistory].sort((a, b) => {
        const aKey = a.exitDecisionTime || a.exitDate || a.entryDecisionTime || a.entryDate || '';
        const bKey = b.exitDecisionTime || b.exitDate || b.entryDecisionTime || b.entryDate || '';
        return bKey.localeCompare(aKey);
    });
}

function getTradeHistory() {
    return tradeHistory;
}

function isTradeHistoryLoaded() {
    return tradeHistoryLoaded;
}

module.exports = {
    tradeHistory,
    setTelegramWatches,
    normalizeTradeRecord,
    scheduleSaveTradeHistory,
    loadTradeHistory,
    ensureTradeHistoryLoaded,
    getCurrentOpenTrade,
    recordTradeEntry,
    recordTradeExit,
    isPositionOpen,
    synchronizeWatchesWithTradeHistory,
    formatTradeSummary,
    buildTradeHistoryMessage,
    serializeTradeForResponse,
    getSortedTradeHistory,
    getTradeHistory,
    isTradeHistoryLoaded,
};
