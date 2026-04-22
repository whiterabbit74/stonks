const crypto = require('crypto');
const fs = require('fs-extra');
const fsp = require('fs/promises');
const path = require('path');
const { Mutex } = require('async-mutex');
const { readSettings, writeSettings } = require('./settings');
const { telegramWatches, sendTelegramMessage } = require('./telegram');
const { fetchTodayRangeAndQuote } = require('../providers/finnhub');
const { toFiniteNumber, toSafeTicker } = require('../utils/helpers');
const { AUTOTRADE_LOG_FILE, AUTOTRADE_STATE_FILE, MONITOR_LOG_FILE, WEBULL_RAW_LOG_FILE, getApiConfig } = require('../config');
const { getETParts, etKeyYMD, getCachedTradingCalendar, isTradingDayByCalendarET, getTradingSessionForDateET } = require('./dates');
const {
    loadTradeHistory,
    isTradeHistoryLoaded,
    syncWatchesWithTradeState,
    upsertMonitorTradeFromBrokerTrade,
    closeMonitorTradeFromBrokerTrade,
} = require('./trades');
const {
    getCurrentOpenBrokerTrade,
    recordBrokerEntry,
    recordBrokerExit,
    serializeBrokerTradeForResponse,
} = require('./brokerTrades');
const { reconcileMonitorState } = require('./monitorConsistency');
const {
    buildWebullRuntimeConfig,
    getAccountBalance,
    getAccountPositions,
    createAccessToken,
    checkAccessToken,
    placeOrder,
    cancelOrder,
    getOpenOrders,
    getOrderHistory,
    getOrderHistoryByDateRange,
    getOrderDetail,
    resolveInstrumentId,
    fetchTodayRangeAndQuoteViaWebull,
} = require('./webullClient');

const autoTradeState = {
    lastSchedulerAttemptKey: null,
    lastRunAt: null,
    lastResult: null,
};
const pendingOrderTrackers = new Map();
const recentTrackedOrders = [];
const trackerTimers = new Map();
const autotradeStateMutex = new Mutex();
const TRACKING_DELAYS_MS = [1500, 3000, 5000, 8000, 12000, 30000, 60000];
const DEFAULT_ENTRY_CAPITAL_MODE = 'standard_safe';
const ENTRY_CAPITAL_MODE_CONFIG = Object.freeze({
    standard_safe: { multiplier: 1, reservePct: 0.022 },
    cash_100: { multiplier: 1, reservePct: 0 },
    margin_125: { multiplier: 1.25, reservePct: 0 },
    margin_150: { multiplier: 1.5, reservePct: 0 },
    margin_175: { multiplier: 1.75, reservePct: 0 },
    margin_200: { multiplier: 2, reservePct: 0 },
});
const DASHBOARD_CACHE_TTL_MS = 2000;
const dashboardSnapshotCache = {
    value: null,
    fetchedAtMs: 0,
    inFlight: null,
};
let autotradeRuntimeInitPromise = null;

function pushRecentTrackedOrder(item) {
    recentTrackedOrders.unshift(item);
    if (recentTrackedOrders.length > 20) {
        recentTrackedOrders.length = 20;
    }
}

function trackerKeyFor({ clientOrderId, action }) {
    return `${clientOrderId}:${action}`;
}

function findPendingTracker(symbol, action) {
    const normalizedSymbol = toSafeTicker(symbol);
    for (const tracker of pendingOrderTrackers.values()) {
        if (tracker.symbol === normalizedSymbol && tracker.action === action) {
            return tracker;
        }
    }
    return null;
}

function summarizeBrokerPayload(payload) {
    const root = payload && typeof payload === 'object' ? payload : null;
    if (!root) return 'payload=NA';
    const code = root.code ?? root.error_code ?? root.errorCode ?? root.status ?? root.status_code;
    const message = root.message ?? root.msg ?? root.error ?? root.error_message;
    const requestId = root.request_id ?? root.requestId;
    const summaryParts = [];
    if (code != null && code !== '') summaryParts.push(`code=${code}`);
    if (message) summaryParts.push(`message=${String(message).replace(/\s+/g, ' ').slice(0, 180)}`);
    if (requestId) summaryParts.push(`request_id=${requestId}`);
    return summaryParts.length > 0 ? summaryParts.join(' ') : 'payload=present';
}

function buildTrackerSnapshot(tracker) {
    return {
        clientOrderId: tracker.clientOrderId,
        symbol: tracker.symbol,
        action: tracker.action,
        correlationId: tracker.correlationId || null,
        accountId: tracker.accountId || null,
        decisionTime: tracker.decisionTime || null,
        dateKey: tracker.dateKey || null,
        ibs: typeof tracker.ibs === 'number' ? tracker.ibs : null,
        status: tracker.status,
        quantity: tracker.quantity ?? null,
        startedAt: tracker.startedAt || null,
        lastCheckedAt: tracker.lastCheckedAt || null,
        fillPrice: tracker.fillPrice ?? null,
        filledQty: tracker.filledQty ?? null,
        source: tracker.source || null,
        nextCheckAt: tracker.nextCheckAt || null,
        attempts: tracker.attempts ?? 0,
        notifyOnResult: tracker.notifyOnResult !== false,
        lastError: tracker.lastError || null,
    };
}

async function persistAutotradeState() {
    await autotradeStateMutex.runExclusive(async () => {
        const data = {
            updatedAt: new Date().toISOString(),
            pending: Array.from(pendingOrderTrackers.values()).map(buildTrackerSnapshot),
            recent: recentTrackedOrders.slice(0, 20),
        };
        // Atomic write: write to tmp then rename — prevents corrupt file on crash
        const tmpFile = AUTOTRADE_STATE_FILE + '.tmp';
        await fs.ensureFile(tmpFile);
        await fs.writeJson(tmpFile, data, { spaces: 2 });
        await fs.move(tmpFile, AUTOTRADE_STATE_FILE, { overwrite: true });
    });
}

async function loadAutotradeStateFromDisk() {
    try {
        const exists = await fs.pathExists(AUTOTRADE_STATE_FILE);
        if (!exists) return;
        const stored = await fs.readJson(AUTOTRADE_STATE_FILE).catch(() => null);
        if (!stored || typeof stored !== 'object') return;

        pendingOrderTrackers.clear();
        recentTrackedOrders.length = 0;

        const pending = Array.isArray(stored.pending) ? stored.pending : [];
        for (const item of pending) {
            if (!item || typeof item !== 'object' || !item.clientOrderId || !item.action) continue;
            const tracker = {
                correlationId: item.correlationId || generateCorrelationId(),
                accountId: item.accountId || buildWebullRuntimeConfig().accountId,
                clientOrderId: String(item.clientOrderId),
                symbol: toSafeTicker(item.symbol || ''),
                action: item.action,
                decisionTime: item.decisionTime || item.startedAt || null,
                dateKey: item.dateKey || null,
                ibs: typeof item.ibs === 'number' ? item.ibs : null,
                source: item.source || 'restored_pending_tracker',
                quantity: item.quantity ?? null,
                notifyOnResult: item.notifyOnResult !== false,
                startedAt: item.startedAt || new Date().toISOString(),
                lastCheckedAt: item.lastCheckedAt || null,
                fillPrice: item.fillPrice ?? null,
                filledQty: item.filledQty ?? null,
                status: item.status || 'submitted',
                attempts: Number.isFinite(item.attempts) ? item.attempts : 0,
                nextCheckAt: item.nextCheckAt || null,
            };
            if (!tracker.symbol) continue;
            pendingOrderTrackers.set(trackerKeyFor(tracker), tracker);
        }

        const recent = Array.isArray(stored.recent) ? stored.recent : [];
        for (const item of recent.slice(0, 20)) {
            if (!item || typeof item !== 'object') continue;
            recentTrackedOrders.push(item);
        }
    } catch (error) {
        console.warn('Failed to load autotrade state:', error && error.message ? error.message : error);
    }
}

function getNextTrackingDelayMs(attempts) {
    const index = Math.max(0, Math.min(TRACKING_DELAYS_MS.length - 1, attempts));
    return TRACKING_DELAYS_MS[index];
}

function invalidateDashboardSnapshotCache() {
    dashboardSnapshotCache.value = null;
    dashboardSnapshotCache.fetchedAtMs = 0;
    dashboardSnapshotCache.inFlight = null;
}

function getAutotradeLogBaseParts() {
    const ext = path.extname(AUTOTRADE_LOG_FILE) || '.log';
    const dir = path.dirname(AUTOTRADE_LOG_FILE);
    const base = path.basename(AUTOTRADE_LOG_FILE, ext);
    return { dir, base, ext };
}

function getAutotradeLogMonthKey(date = new Date()) {
    const et = getETParts(date);
    return `${et.y}-${String(et.m).padStart(2, '0')}`;
}

function getAutotradeLogPathForMonth(monthKey) {
    const { dir, base, ext } = getAutotradeLogBaseParts();
    return path.join(dir, `${base}-${monthKey}${ext}`);
}

function getCurrentAutotradeLogPath() {
    return getAutotradeLogPathForMonth(getAutotradeLogMonthKey(new Date()));
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

async function listWebullRawLogFilesDesc() {
    try {
        const { dir, base, ext } = getWebullRawLogBaseParts();
        const files = await fs.readdir(dir);
        const pattern = new RegExp(`^${escapeRegExp(base)}-\\d{4}-\\d{2}${escapeRegExp(ext)}$`);
        return files
            .filter((file) => pattern.test(file))
            .sort()
            .reverse()
            .map((file) => path.join(dir, file));
    } catch {
        return [];
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEntryCapitalMode(value) {
    const mode = typeof value === 'string' ? value : '';
    return ENTRY_CAPITAL_MODE_CONFIG[mode] ? mode : DEFAULT_ENTRY_CAPITAL_MODE;
}

function getEntryCapitalModeConfig(autoTrading = {}) {
    const mode = normalizeEntryCapitalMode(autoTrading.entryCapitalMode);
    return {
        mode,
        ...ENTRY_CAPITAL_MODE_CONFIG[mode],
    };
}

async function listAutotradeLogFilesDesc() {
    try {
        const { dir, base, ext } = getAutotradeLogBaseParts();
        const files = await fs.readdir(dir);
        const pattern = new RegExp(`^${escapeRegExp(base)}-\\d{4}-\\d{2}${escapeRegExp(ext)}$`);
        return files
            .filter((file) => pattern.test(file))
            .sort()
            .reverse()
            .map((file) => path.join(dir, file));
    } catch {
        return [];
    }
}

function normalizeAutotradeLogEntry(entry) {
    if (typeof entry === 'string') {
        return {
            ts: new Date().toISOString(),
            level: 'info',
            event: 'message',
            message: entry,
        };
    }

    if (entry && typeof entry === 'object') {
        const normalized = { ...entry };
        normalized.ts = normalized.ts || new Date().toISOString();
        normalized.level = normalized.level || 'info';
        normalized.event = normalized.event || 'message';
        return normalized;
    }

    return {
        ts: new Date().toISOString(),
        level: 'info',
        event: 'message',
        message: String(entry),
    };
}

async function appendAutotradeLog(lines) {
    try {
        const logPath = getCurrentAutotradeLogPath();
        await fs.ensureFile(logPath);
        const formatted = lines.map((line) => JSON.stringify(normalizeAutotradeLogEntry(line))).join('\n') + '\n';
        await fs.appendFile(logPath, formatted);
    } catch (error) {
        console.warn('Failed to append autotrade log:', error && error.message ? error.message : error);
    }
}

async function appendAutotradeEvent(event, payload = {}, level = 'info') {
    return appendAutotradeLog([{ ...payload, level, event }]);
}

async function readLogTail(filePath, limit = 200) {
    try {
        const stat = await fsp.stat(filePath).catch(() => null);
        if (!stat || !stat.isFile()) return [];
        const bytesToRead = Math.min(stat.size, Math.max(16 * 1024, Math.min(256 * 1024, limit * 512)));
        const handle = await fsp.open(filePath, 'r');
        const buffer = Buffer.alloc(bytesToRead);
        try {
            await handle.read(buffer, 0, bytesToRead, Math.max(0, stat.size - bytesToRead));
        } finally {
            await handle.close();
        }
        return buffer.toString('utf8')
            .split('\n')
            .map((line) => line.trimEnd())
            .filter(Boolean)
            .slice(-Math.max(1, Math.min(2000, limit)));
    } catch (error) {
        return [`Failed to read log ${filePath}: ${error && error.message ? error.message : error}`];
    }
}

async function readAutotradeLogTail(limit = 200) {
    const files = await listAutotradeLogFilesDesc();
    if (files.length === 0) return [];

    let remaining = Math.max(1, Math.min(2000, limit));
    const segments = [];

    for (const file of files) {
        if (remaining <= 0) break;
        const lines = await readLogTail(file, remaining);
        if (lines.length === 0) continue;
        segments.unshift(lines);
        remaining = Math.max(0, remaining - lines.length);
    }

    return segments.flat().slice(-Math.max(1, Math.min(2000, limit)));
}

async function readWebullRawLogTail(limit = 200) {
    const files = await listWebullRawLogFilesDesc();
    if (files.length === 0) return [];

    let remaining = Math.max(1, Math.min(2000, limit));
    const segments = [];

    for (const file of files) {
        if (remaining <= 0) break;
        const lines = await readLogTail(file, remaining);
        if (lines.length === 0) continue;
        segments.unshift(lines);
        remaining = Math.max(0, remaining - lines.length);
    }

    return segments.flat().slice(-Math.max(1, Math.min(2000, limit)));
}

async function initializeAutotradeRuntime() {
    if (autotradeRuntimeInitPromise) {
        return autotradeRuntimeInitPromise;
    }

    autotradeRuntimeInitPromise = (async () => {
        await loadAutotradeStateFromDisk();
        for (const trackerKey of pendingOrderTrackers.keys()) {
            scheduleTrackerPoll(trackerKey, 1000);
        }
    })().catch((error) => {
        autotradeRuntimeInitPromise = null;
        throw error;
    });

    return autotradeRuntimeInitPromise;
}

function scheduleTrackerPoll(trackerId, delayMs) {
    const existing = trackerTimers.get(trackerId);
    if (existing) {
        clearTimeout(existing);
    }

    const tracker = pendingOrderTrackers.get(trackerId);
    if (!tracker) return;

    tracker.nextCheckAt = new Date(Date.now() + delayMs).toISOString();
    const timer = setTimeout(() => {
        trackerTimers.delete(trackerId);
        void pollTrackedOrder(trackerId);
    }, delayMs);
    trackerTimers.set(trackerId, timer);
}

function normalizeIntradayRange(range, quote) {
    const low = toFiniteNumber(range && range.low);
    const high = toFiniteNumber(range && range.high);
    if (low != null && high != null && high > low) {
        return { low, high };
    }
    const values = [range?.low, range?.high, quote?.current, quote?.open, quote?.high, quote?.low, quote?.prevClose]
        .map(toFiniteNumber)
        .filter((value) => value != null);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { low: min, high: max };
}

function splitSymbols(raw) {
    if (typeof raw !== 'string') return [];
    return raw
        .split(',')
        .map((item) => toSafeTicker(item.trim()))
        .filter(Boolean);
}

function sanitizeAutoTradingConfig(input, current = {}) {
    const next = { ...current };
    const booleanFields = ['enabled', 'allowNewEntries', 'allowExits', 'onlyFromTelegramWatches', 'allowFractionalShares', 'previewBeforeSend', 'cancelOpenOrdersBeforeEntry'];
    for (const field of booleanFields) {
        if (typeof input[field] === 'boolean') next[field] = input[field];
    }
    delete next.dryRun;

    const numberFields = ['lowIBS', 'highIBS', 'executionWindowSeconds', 'fixedQuantity', 'fixedNotionalUsd', 'maxPositionUsd', 'maxSlippageBps'];
    for (const field of numberFields) {
        if (typeof input[field] === 'number' && Number.isFinite(input[field])) next[field] = input[field];
    }

    if (typeof next.lowIBS === 'number') next.lowIBS = Math.min(1, Math.max(0, next.lowIBS));
    if (typeof next.highIBS === 'number') next.highIBS = Math.min(1, Math.max(0, next.highIBS));
    if (typeof next.executionWindowSeconds === 'number') next.executionWindowSeconds = Math.max(15, Math.round(next.executionWindowSeconds));
    if (typeof next.fixedQuantity === 'number') next.fixedQuantity = Math.max(0.00001, next.fixedQuantity);
    if (typeof next.fixedNotionalUsd === 'number') next.fixedNotionalUsd = Math.max(1, next.fixedNotionalUsd);
    if (typeof next.maxPositionUsd === 'number') next.maxPositionUsd = Math.max(1, next.maxPositionUsd);
    if (typeof next.maxSlippageBps === 'number') next.maxSlippageBps = Math.max(0, Math.min(1000, next.maxSlippageBps));

    if (typeof input.provider === 'string' && ['finnhub', 'webull'].includes(input.provider)) next.provider = input.provider;
    if (typeof input.entrySizingMode === 'string' && ['balance', 'quantity', 'notional'].includes(input.entrySizingMode)) next.entrySizingMode = input.entrySizingMode;
    if (typeof input.entryCapitalMode === 'string' && ENTRY_CAPITAL_MODE_CONFIG[input.entryCapitalMode]) next.entryCapitalMode = input.entryCapitalMode;
    if (typeof input.sizingMode === 'string' && ['quantity', 'notional'].includes(input.sizingMode)) next.sizingMode = input.sizingMode;
    if (typeof input.orderType === 'string' && ['MARKET', 'LIMIT'].includes(input.orderType)) next.orderType = input.orderType;
    if (typeof input.timeInForce === 'string' && ['DAY', 'GTC'].includes(input.timeInForce)) next.timeInForce = input.timeInForce;
    if (typeof input.supportTradingSession === 'string' && ['CORE', 'ALL', 'N'].includes(input.supportTradingSession)) next.supportTradingSession = input.supportTradingSession;
    if (typeof input.symbols === 'string') next.symbols = input.symbols;
    if (typeof input.notes === 'string') next.notes = input.notes;

    next.lastModifiedAt = new Date().toISOString();
    return next;
}

function getConfiguredSymbols(autoTrading) {
    const explicitSymbols = splitSymbols(autoTrading.symbols);
    if (!autoTrading.onlyFromTelegramWatches && explicitSymbols.length > 0) {
        return explicitSymbols;
    }
    const watchSymbols = [...telegramWatches.keys()];
    if (watchSymbols.length > 0) {
        return explicitSymbols.length > 0
            ? watchSymbols.filter((symbol) => explicitSymbols.includes(symbol))
            : watchSymbols;
    }
    return explicitSymbols;
}

function getThresholdsForSymbol(symbol, autoTrading) {
    const watch = telegramWatches.get(symbol);
    return {
        lowIBS: typeof watch?.lowIBS === 'number' ? watch.lowIBS : autoTrading.lowIBS,
        highIBS: typeof watch?.highIBS === 'number' ? watch.highIBS : autoTrading.highIBS,
    };
}

function resolveQuoteProvider(autoTrading) {
    const p = autoTrading && autoTrading.provider;
    return p === 'webull' ? 'webull' : 'finnhub';
}

async function fetchQuoteWithProvider(symbol, provider) {
    if (provider === 'webull') {
        return fetchTodayRangeAndQuoteViaWebull(symbol);
    }
    return fetchTodayRangeAndQuote(symbol);
}

async function evaluateMarketSnapshotForSymbols(symbols, autoTrading) {
    const rows = [];
    const quoteProvider = resolveQuoteProvider(autoTrading);
    for (const symbol of symbols) {
        const thresholds = getThresholdsForSymbol(symbol, autoTrading);
        try {
            const { range, quote } = await fetchQuoteWithProvider(symbol, quoteProvider);
            const normalizedRange = normalizeIntradayRange(range, quote);
            const currentPrice = toFiniteNumber(quote && quote.current);
            if (!normalizedRange || currentPrice == null) {
                rows.push({ symbol, ok: false, reason: 'missing_range_or_quote', thresholds });
                continue;
            }
            const ibs = Math.max(0, Math.min(1, (currentPrice - normalizedRange.low) / (normalizedRange.high - normalizedRange.low)));
            rows.push({
                symbol,
                ok: true,
                ibs,
                currentPrice,
                range: normalizedRange,
                quote,
                thresholds,
            });
        } catch (error) {
            rows.push({
                symbol,
                ok: false,
                reason: error && error.message ? error.message : 'quote_fetch_failed',
                thresholds,
            });
        }
    }
    return rows;
}

function extractEntryFundsFromBalance(balancePayload, autoTrading = {}) {
    const root = balancePayload && typeof balancePayload === 'object' && balancePayload.data && typeof balancePayload.data === 'object'
        ? balancePayload.data
        : balancePayload;
    if (!root || typeof root !== 'object') return null;

    const assets = Array.isArray(root.account_currency_assets)
        ? root.account_currency_assets.filter((item) => item && typeof item === 'object')
        : [];
    const preferredAsset = assets.find((item) => String(item.currency || '').toUpperCase() === 'USD') || assets[0] || null;
    const session = String(autoTrading.supportTradingSession || 'CORE').toUpperCase();
    const candidates = [];

    if (preferredAsset) {
        if (session === 'N') {
            candidates.push(
                preferredAsset.night_trading_buying_power,
                preferredAsset.overnight_buying_power,
                preferredAsset.day_buying_power,
                preferredAsset.option_buying_power,
                preferredAsset.cash_balance,
                preferredAsset.net_liquidation_value,
            );
        } else {
            candidates.push(
                preferredAsset.day_buying_power,
                preferredAsset.overnight_buying_power,
                preferredAsset.night_trading_buying_power,
                preferredAsset.option_buying_power,
                preferredAsset.cash_balance,
                preferredAsset.net_liquidation_value,
            );
        }
    }

    candidates.push(
        root.total_cash_balance,
        root.cash_balance,
        root.total_net_liquidation_value,
        root.net_liquidation_value,
    );

    for (const value of candidates) {
        const numeric = toFiniteNumber(value);
        if (numeric != null && numeric > 0) {
            return numeric;
        }
    }
    return null;
}

function extractEntryBaseCapitalFromBalance(balancePayload) {
    const root = balancePayload && typeof balancePayload === 'object' && balancePayload.data && typeof balancePayload.data === 'object'
        ? balancePayload.data
        : balancePayload;
    if (!root || typeof root !== 'object') return null;

    const assets = Array.isArray(root.account_currency_assets)
        ? root.account_currency_assets.filter((item) => item && typeof item === 'object')
        : [];
    const preferredAsset = assets.find((item) => String(item.currency || '').toUpperCase() === 'USD') || assets[0] || null;
    const candidates = [
        preferredAsset?.cash_balance,
        root.total_cash_balance,
        root.cash_balance,
        preferredAsset?.net_liquidation_value,
        root.total_net_liquidation_value,
        root.net_liquidation_value,
    ];

    for (const value of candidates) {
        const numeric = toFiniteNumber(value);
        if (numeric != null && numeric > 0) {
            return numeric;
        }
    }
    return null;
}

function resolveEntryBalanceSizing(balancePayload, autoTrading = {}) {
    const buyingPower = extractEntryFundsFromBalance(balancePayload, autoTrading);
    const baseCapital = extractEntryBaseCapitalFromBalance(balancePayload);
    const modeConfig = getEntryCapitalModeConfig(autoTrading);
    const multiplierBase = Number.isFinite(baseCapital) && baseCapital > 0 ? baseCapital : buyingPower;
    let entryFunds = Number.isFinite(multiplierBase) && multiplierBase > 0
        ? multiplierBase * modeConfig.multiplier
        : buyingPower;

    if (Number.isFinite(buyingPower) && buyingPower > 0 && Number.isFinite(entryFunds) && entryFunds > 0) {
        entryFunds = Math.min(entryFunds, buyingPower);
    }

    return {
        entryFunds: Number.isFinite(entryFunds) && entryFunds > 0 ? entryFunds : null,
        buyingPower: Number.isFinite(buyingPower) && buyingPower > 0 ? buyingPower : null,
        baseCapital: Number.isFinite(baseCapital) && baseCapital > 0 ? baseCapital : null,
        capitalMode: modeConfig.mode,
        multiplier: modeConfig.multiplier,
        reservePct: modeConfig.reservePct,
    };
}

function getEntryBuyingPowerHeadroomFactor(autoTrading = {}) {
    const modeConfig = getEntryCapitalModeConfig(autoTrading);
    return 1 + modeConfig.reservePct;
}

function computeOrderQuantity(currentPrice, autoTrading, availableFunds = null, options = {}) {
    if (!(currentPrice > 0)) {
        throw new Error('Invalid market price for quantity calculation');
    }

    const sizingMode = String(autoTrading.entrySizingMode || autoTrading.sizingMode || 'balance').toLowerCase();
    const buyingPowerHeadroomFactor = Number.isFinite(options.buyingPowerHeadroomFactor) && options.buyingPowerHeadroomFactor > 0
        ? options.buyingPowerHeadroomFactor
        : 1;
    let quantity;
    if (sizingMode === 'quantity') {
        quantity = autoTrading.fixedQuantity;
    } else if (sizingMode === 'notional') {
        quantity = autoTrading.fixedNotionalUsd / currentPrice;
        const notionalCapQty = autoTrading.maxPositionUsd > 0 ? autoTrading.maxPositionUsd / currentPrice : null;
        if (notionalCapQty != null) {
            quantity = Math.min(quantity, notionalCapQty);
        }
    } else {
        if (!(Number.isFinite(availableFunds) && availableFunds > 0)) {
            throw new Error('Unable to read available funds for balance sizing');
        }
        const funds = availableFunds / buyingPowerHeadroomFactor;
        quantity = funds / currentPrice;
    }

    if (!autoTrading.allowFractionalShares) {
        quantity = Math.floor(quantity);
    } else {
        quantity = Math.floor(quantity * 100000) / 100000;
    }

    if (!(quantity > 0)) {
        throw new Error('Calculated order quantity is zero; increase funds or reduce price');
    }
    return quantity;
}

function buildOrderPrice(side, currentPrice, autoTrading) {
    if (autoTrading.orderType !== 'LIMIT') return null;
    const slippageFactor = autoTrading.maxSlippageBps / 10000;
    const raw = side === 'BUY'
        ? currentPrice * (1 + slippageFactor)
        : currentPrice * Math.max(0.0001, 1 - slippageFactor);
    return Number(raw.toFixed(4));
}

function buildEquityOrderItem({ symbol, instrumentId, side, currentPrice, autoTrading, availableFunds = null }) {
    const buyingPowerHeadroomFactor = side === 'BUY'
        ? getEntryBuyingPowerHeadroomFactor(autoTrading)
        : 1;
    const quantity = computeOrderQuantity(currentPrice, autoTrading, availableFunds, { buyingPowerHeadroomFactor });
    const limitPrice = buildOrderPrice(side, currentPrice, autoTrading);
    const item = {
        combo_type: 'NORMAL',
        client_order_id: crypto.randomUUID().replace(/-/g, ''),
        symbol,
        instrument_id: instrumentId,
        instrument_type: 'EQUITY',
        market: 'US',
        side,
        order_type: autoTrading.orderType || 'MARKET',
        quantity: autoTrading.allowFractionalShares ? quantity.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') : String(quantity),
        time_in_force: autoTrading.timeInForce || 'DAY',
        support_trading_session: autoTrading.supportTradingSession || 'CORE',
        entrust_type: 'QTY',
        extended_hours_trading: false,
    };
    if (limitPrice != null) {
        item.limit_price = String(limitPrice);
    }
    return { item, quantity, limitPrice };
}

function normalizePositionQuantity(rawPosition, allowFractionalShares) {
    const candidateKeys = ['quantity', 'qty', 'position', 'holding', 'total_qty', 'totalQuantity'];
    for (const key of candidateKeys) {
        const value = Number(rawPosition && rawPosition[key]);
        if (Number.isFinite(value) && value > 0) {
            if (allowFractionalShares) {
                return Math.floor(value * 100000) / 100000;
            }
            return Math.floor(value);
        }
    }
    return 0;
}

function extractOrderDetailPayload(payload) {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    if (Array.isArray(data.orders) && data.orders.length > 0) return data.orders[0];
    if (Array.isArray(data.list) && data.list.length > 0) return data.list[0];
    if (Array.isArray(data.items) && data.items.length > 0) return data.items[0];
    return data;
}

function normalizeWebullOrderStatus(raw) {
    const source = String(raw || '').trim().toUpperCase();
    if (!source) return 'unknown';
    if (['FILLED', 'FULL_FILLED', 'FINAL_FILLED', 'EXECUTED', 'DONE'].includes(source)) return 'filled';
    if (['PARTIAL_FILLED', 'PARTIALLY_FILLED', 'PARTIALFILLED'].includes(source)) return 'partially_filled';
    if (['CANCELLED', 'CANCELED', 'VOIDED', 'CANCEL_SUCCESS'].includes(source)) return 'cancelled';
    if (['REJECTED', 'FAILED', 'DENIED', 'PLACE_FAILED'].includes(source)) return 'rejected';
    if (['MODIFY_SUCCESS'].includes(source)) return 'working';
    if (['EXPIRED'].includes(source)) return 'expired';
    if (['NEW', 'SUBMITTED', 'PENDING', 'ACCEPTED', 'WORKING', 'OPEN', 'LIVE'].includes(source)) return 'working';
    return source.toLowerCase();
}

function isFinalOrderStatus(status) {
    return ['filled', 'cancelled', 'rejected', 'expired'].includes(status);
}

async function maybeSendExecutionTelegram(text, context = {}) {
    try {
        const chatId = getApiConfig().TELEGRAM_CHAT_ID;
        if (!chatId || !text) {
            const result = { ok: false, reason: 'telegram_not_configured' };
            await appendAutotradeEvent('telegram_skipped', {
                ...buildExecutionLogContext(context),
                telegram_status: 'skipped',
                message: result.reason,
            });
            return result;
        }
        const result = await sendTelegramMessage(chatId, text);
        await appendAutotradeEvent(result && result.ok ? 'telegram_sent' : 'telegram_failed', {
            ...buildExecutionLogContext(context),
            telegram_status: result && result.ok ? 'ok' : 'failed',
        }, result && result.ok ? 'info' : 'warn');
        return result;
    } catch (error) {
        const reason = error && error.message ? error.message : 'telegram_send_failed';
        await appendAutotradeEvent('telegram_failed', {
            ...buildExecutionLogContext(context),
            telegram_status: 'failed',
            error: reason,
        }, 'warn');
        return { ok: false, reason };
    }
}

async function finalizeTrackedTrade({ action, symbol, price, ibs, decisionTime, dateKey, source, clientOrderId, brokerOrderId, filledQty, quantity }) {
    // Test buys should not create persistent trade records
    if (source === 'test') {
        syncWatchesWithTradeState();
        return { skipped: true, reason: 'test_source' };
    }

    let brokerTrade = null;
    let monitorTrade = null;
    if (action === 'entry') {
        brokerTrade = recordBrokerEntry({
            symbol,
            price: typeof price === 'number' ? price : null,
            ibs: typeof ibs === 'number' ? ibs : null,
            decisionTime,
            dateKey,
            source: source || 'auto',
            clientOrderId: clientOrderId || null,
            brokerOrderId: brokerOrderId || null,
            filledQty: filledQty ?? null,
            quantity: quantity ?? null,
        });
        if (brokerTrade) {
            monitorTrade = upsertMonitorTradeFromBrokerTrade(brokerTrade);
        }
    } else if (action === 'exit') {
        brokerTrade = recordBrokerExit({
            symbol,
            price: typeof price === 'number' ? price : null,
            ibs: typeof ibs === 'number' ? ibs : null,
            decisionTime,
            dateKey,
            clientOrderId: clientOrderId || null,
            brokerOrderId: brokerOrderId || null,
            filledQty: filledQty ?? null,
        });
        if (brokerTrade) {
            monitorTrade = closeMonitorTradeFromBrokerTrade(brokerTrade, {
                allowLegacyMatch: true,
                note: 'closed_from_broker_fill',
            });
        }
    }

    const reconcileSummary = reconcileMonitorState({ apply: true });
    if (!monitorTrade && reconcileSummary.appliedActions.length > 0) {
        monitorTrade = reconcileSummary.openMonitorTrade;
    }

    syncWatchesWithTradeState();
    return brokerTrade;
}

function extractOrdersArray(payload) {
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.data?.orders)) return payload.data.orders;
    if (Array.isArray(payload.data?.items)) return payload.data.items;
    if (Array.isArray(payload.orders)) return payload.orders;
    if (Array.isArray(payload.items)) return payload.items;
    return [];
}

function buildRecentTrackerEntry(tracker) {
    return {
        clientOrderId: tracker.clientOrderId,
        symbol: tracker.symbol,
        action: tracker.action,
        status: tracker.status,
        quantity: tracker.quantity ?? null,
        source: tracker.source || null,
        startedAt: tracker.startedAt || null,
        lastCheckedAt: tracker.lastCheckedAt || null,
        fillPrice: tracker.fillPrice ?? null,
        filledQty: tracker.filledQty ?? null,
    };
}

function generateCorrelationId() {
    return crypto.randomUUID().replace(/-/g, '');
}

function buildExecutionLogContext(base = {}) {
    return {
        source: base.source || 'unknown',
        correlation_id: base.correlationId || null,
        symbol: base.symbol || null,
        action: base.action || null,
        client_order_id: base.clientOrderId || null,
        mode: base.mode || null,
        status: base.status || null,
        quantity: base.quantity ?? null,
        price: typeof base.price === 'number' ? Number(base.price.toFixed(4)) : null,
        ibs: typeof base.ibs === 'number' ? Number(base.ibs.toFixed(4)) : null,
        entry_funds: typeof base.entryFunds === 'number' ? Number(base.entryFunds.toFixed(4)) : null,
        decision_time: base.decisionTime || null,
        date_key: base.dateKey || null,
        attempt: base.attempt ?? null,
        stage: base.stage || null,
    };
}

async function finalizeTracker(trackerId, statusOverride = null) {
    const tracker = pendingOrderTrackers.get(trackerId);
    if (!tracker) return;

    const status = statusOverride || tracker.status || 'unknown';
    const timer = trackerTimers.get(trackerId);
    if (timer) {
        clearTimeout(timer);
        trackerTimers.delete(trackerId);
    }

    if (status === 'filled') {
        const localTrade = await finalizeTrackedTrade({
            action: tracker.action,
            symbol: tracker.symbol,
            price: tracker.fillPrice,
            ibs: tracker.ibs,
            decisionTime: tracker.decisionTime,
            dateKey: tracker.dateKey,
            source: tracker.source,
            clientOrderId: tracker.clientOrderId,
            brokerOrderId: tracker.orderId ?? null,
            filledQty: tracker.filledQty ?? null,
            quantity: tracker.quantity ?? null,
        });
        await appendAutotradeEvent('local_trade_recorded', {
            ...buildExecutionLogContext({
                source: tracker.source,
                correlationId: tracker.correlationId,
                symbol: tracker.symbol,
                action: tracker.action,
                clientOrderId: tracker.clientOrderId,
                status: 'filled',
                quantity: tracker.filledQty ?? tracker.quantity,
                price: tracker.fillPrice,
                ibs: tracker.ibs,
                decisionTime: tracker.decisionTime,
                dateKey: tracker.dateKey,
            }),
            local_record: localTrade ? 'ok' : 'failed',
        }, localTrade ? 'info' : 'error');
        if (tracker.notifyOnResult) {
            const sideLabel = tracker.action === 'entry' ? 'BUY' : 'SELL';
            const priceLabel = tracker.fillPrice != null ? `$${tracker.fillPrice.toFixed(2)}` : '—';
            await maybeSendExecutionTelegram(
                `<b>Webull исполнено</b>\n${tracker.symbol} • ${sideLabel} • ${priceLabel}\nqty: ${tracker.filledQty ?? tracker.quantity ?? '—'}\nsource: ${tracker.source}`,
                {
                    source: tracker.source,
                    correlationId: tracker.correlationId,
                    symbol: tracker.symbol,
                    action: tracker.action,
                    clientOrderId: tracker.clientOrderId,
                    status: 'filled',
                    quantity: tracker.filledQty ?? tracker.quantity,
                    price: tracker.fillPrice,
                    ibs: tracker.ibs,
                    decisionTime: tracker.decisionTime,
                    dateKey: tracker.dateKey,
                }
            );
        }
    } else if (tracker.notifyOnResult) {
        await maybeSendExecutionTelegram(
            `<b>Webull статус заявки</b>\n${tracker.symbol} • ${tracker.action === 'entry' ? 'BUY' : 'SELL'}\nstatus: ${status}\nsource: ${tracker.source}`,
            {
                source: tracker.source,
                correlationId: tracker.correlationId,
                symbol: tracker.symbol,
                action: tracker.action,
                clientOrderId: tracker.clientOrderId,
                status,
                quantity: tracker.filledQty ?? tracker.quantity,
                price: tracker.fillPrice,
                ibs: tracker.ibs,
                decisionTime: tracker.decisionTime,
                dateKey: tracker.dateKey,
            }
        );
    }

    tracker.status = status;
    tracker.lastCheckedAt = new Date().toISOString();
    pushRecentTrackedOrder(buildRecentTrackerEntry(tracker));
    await appendAutotradeEvent('order_tracking_finished', {
        ...buildExecutionLogContext({
            source: tracker.source,
            correlationId: tracker.correlationId,
            symbol: tracker.symbol,
            action: tracker.action,
            clientOrderId: tracker.clientOrderId,
            status,
            quantity: tracker.filledQty ?? tracker.quantity,
            price: tracker.fillPrice,
            ibs: tracker.ibs,
            decisionTime: tracker.decisionTime,
            dateKey: tracker.dateKey,
            attempt: tracker.attempts,
        }),
    }, isFinalOrderStatus(status) ? 'info' : 'warn');
    pendingOrderTrackers.delete(trackerId);
    invalidateDashboardSnapshotCache();
    await persistAutotradeState();
}

async function pollTrackedOrder(trackerId) {
    const tracker = pendingOrderTrackers.get(trackerId);
    if (!tracker) return;
    if (tracker.inFlight) return;
    tracker.inFlight = true;

    try {
        const detail = await getOrderDetail(tracker.accountId, tracker.clientOrderId);
        let snapshot = extractOrderDetailPayload(detail);
        const previousStatus = tracker.status;
        let normalizedStatus = normalizeWebullOrderStatus(
            snapshot?.status ||
            snapshot?.order_status ||
            snapshot?.orderStatus ||
            snapshot?.scene_type
        );
        if (!snapshot || normalizedStatus === 'unknown') {
            const fallbackSnapshot = await findOrderSnapshotByClientOrderId(tracker.accountId, tracker.clientOrderId);
            if (fallbackSnapshot) {
                snapshot = fallbackSnapshot;
                normalizedStatus = normalizeWebullOrderStatus(
                    snapshot?.status ||
                    snapshot?.order_status ||
                    snapshot?.orderStatus ||
                    snapshot?.scene_type
                );
            }
        }
        const fillPrice = Number(
            snapshot?.filled_price ??
            snapshot?.avg_price ??
            snapshot?.average_price ??
            snapshot?.filled_avg_price ??
            snapshot?.deal_price
        );
        const filledQty = Number(
            snapshot?.filled_qty ??
            snapshot?.filled_quantity ??
            snapshot?.deal_quantity ??
            snapshot?.qty ??
            snapshot?.quantity
        );

        tracker.status = normalizedStatus;
        tracker.lastCheckedAt = new Date().toISOString();
        tracker.fillPrice = Number.isFinite(fillPrice) ? fillPrice : null;
        tracker.filledQty = Number.isFinite(filledQty) ? filledQty : null;
        tracker.attempts = (tracker.attempts || 0) + 1;
        tracker.lastError = null;

        if (previousStatus !== normalizedStatus || isFinalOrderStatus(normalizedStatus)) {
            pushRecentTrackedOrder(buildRecentTrackerEntry(tracker));
        }

        await appendAutotradeEvent('order_poll', {
            ...buildExecutionLogContext({
                source: tracker.source,
                correlationId: tracker.correlationId,
                symbol: tracker.symbol,
                action: tracker.action,
                clientOrderId: tracker.clientOrderId,
                status: normalizedStatus,
                quantity: tracker.quantity,
                price: tracker.fillPrice,
                ibs: tracker.ibs,
                decisionTime: tracker.decisionTime,
                dateKey: tracker.dateKey,
                attempt: tracker.attempts,
            }),
            filled_qty: tracker.filledQty,
            previous_status: previousStatus || null,
        });

        if (isFinalOrderStatus(normalizedStatus)) {
            tracker.inFlight = false;
            await finalizeTracker(trackerId, normalizedStatus);
            return;
        }

        const delayMs = getNextTrackingDelayMs(tracker.attempts);
        scheduleTrackerPoll(trackerId, delayMs);
        tracker.inFlight = false;
        await persistAutotradeState();
    } catch (error) {
        tracker.lastCheckedAt = new Date().toISOString();
        tracker.attempts = (tracker.attempts || 0) + 1;
        tracker.lastError = error && error.message ? error.message : 'unknown_error';
        await appendAutotradeEvent('order_poll_failed', {
            ...buildExecutionLogContext({
                source: tracker.source,
                correlationId: tracker.correlationId,
                symbol: tracker.symbol,
                action: tracker.action,
                clientOrderId: tracker.clientOrderId,
                status: tracker.status,
                quantity: tracker.quantity,
                price: tracker.fillPrice,
                ibs: tracker.ibs,
                decisionTime: tracker.decisionTime,
                dateKey: tracker.dateKey,
                attempt: tracker.attempts,
            }),
            error: tracker.lastError,
        }, 'warn');
        const delayMs = getNextTrackingDelayMs(tracker.attempts);
        scheduleTrackerPoll(trackerId, delayMs);
        tracker.inFlight = false;
        await persistAutotradeState();
    }
}

async function trackSubmittedOrder({
    accountId,
    clientOrderId,
    symbol,
    action,
    decisionTime,
    dateKey,
    ibs,
    source,
    quantity,
    notifyOnResult = true,
    correlationId = null,
}) {
    await initializeAutotradeRuntime();
    const tracker = {
        accountId,
        clientOrderId,
        symbol,
        action,
        decisionTime,
        dateKey,
        ibs,
        source,
        quantity,
        notifyOnResult,
        correlationId: correlationId || generateCorrelationId(),
        startedAt: new Date().toISOString(),
        lastCheckedAt: null,
        fillPrice: null,
        filledQty: null,
        status: 'submitted',
        attempts: 0,
        nextCheckAt: null,
    };
    const trackerId = trackerKeyFor(tracker);
    pendingOrderTrackers.set(trackerId, tracker);
    pushRecentTrackedOrder(buildRecentTrackerEntry(tracker));
    await appendAutotradeEvent('order_tracking_started', {
        ...buildExecutionLogContext({
            source: tracker.source,
            correlationId: tracker.correlationId,
            symbol: tracker.symbol,
            action: tracker.action,
            clientOrderId: tracker.clientOrderId,
            status: tracker.status,
            quantity: tracker.quantity,
            ibs: tracker.ibs,
            decisionTime: tracker.decisionTime,
            dateKey: tracker.dateKey,
            attempt: tracker.attempts,
        }),
    });
    scheduleTrackerPoll(trackerId, TRACKING_DELAYS_MS[0]);
    await persistAutotradeState();
}

async function cancelOpenOrdersBeforeEntry(accountId, symbol) {
    const openOrdersResp = await getOpenOrders(accountId, { pageSize: 50 });
    const openOrders = extractOrdersArray(openOrdersResp);
    const normalizedSymbol = toSafeTicker(symbol);
    const candidateOrders = openOrders.filter((order) => {
        const orderSymbol = toSafeTicker(order?.symbol || order?.ticker || order?.display_symbol || '');
        const orderStatus = normalizeWebullOrderStatus(order?.status || order?.order_status || order?.orderStatus);
        return orderSymbol === normalizedSymbol && !isFinalOrderStatus(orderStatus);
    });

    const cancelled = [];
    for (const order of candidateOrders) {
        const clientOrderId = order?.client_order_id || order?.clientOrderId;
        if (!clientOrderId) continue;
        await cancelOrder(accountId, clientOrderId);
        cancelled.push(String(clientOrderId));
    }

    if (cancelled.length > 0) {
        invalidateDashboardSnapshotCache();
    }

    return cancelled;
}

async function findOrderSnapshotByClientOrderId(accountId, clientOrderId) {
    const openOrdersResp = await getOpenOrders(accountId, { pageSize: 50 });
    const openMatch = extractOrdersArray(openOrdersResp).find((order) => {
        return String(order?.client_order_id || order?.clientOrderId || '') === String(clientOrderId);
    });
    if (openMatch) return openMatch;

    const historyResp = await getOrderHistory(accountId, { pageSize: 100 });
    return extractOrdersArray(historyResp).find((order) => {
        return String(order?.client_order_id || order?.clientOrderId || '') === String(clientOrderId);
    }) || null;
}

async function executeWebullSignal({ action, symbol, currentPrice, ibs, decisionTime, dateKey, source = 'unknown', forceDryRun = false, forceLive = false, notifyOnResult = true, correlationId = null, quantityOverride = null }) {
    await initializeAutotradeRuntime();
    const settings = await readSettings();
    const autoTrading = settings.autoTrading || {};
    const runtime = buildWebullRuntimeConfig();
    const liveEnabled = forceLive || autoTrading.enabled === true;
    const normalizedSymbol = toSafeTicker(symbol);
    const resolvedCorrelationId = correlationId || generateCorrelationId();

    const pendingTracker = findPendingTracker(normalizedSymbol, action);
    if (pendingTracker) {
        await appendAutotradeEvent('order_guarded', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                clientOrderId: pendingTracker.clientOrderId,
                status: pendingTracker.status,
                quantity: pendingTracker.quantity,
                price: currentPrice,
                ibs,
                decisionTime,
                dateKey,
                mode: 'live',
            }),
            reason: `pending_${action}_tracker_exists`,
        }, 'warn');
        return {
            mode: 'live',
            submitted: false,
            simulated: false,
            shouldRecordLocalTrade: false,
            error: `Pending ${action} order already exists for ${normalizedSymbol}`,
            clientOrderId: pendingTracker.clientOrderId,
            correlationId: resolvedCorrelationId,
        };
    }

    if (forceDryRun) {
        const simulatedQuantity = Number.isFinite(quantityOverride) && quantityOverride > 0
            ? quantityOverride
            : null;
        await appendAutotradeEvent('execution_dry_run', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                quantity: simulatedQuantity,
                price: currentPrice,
                ibs,
                decisionTime,
                dateKey,
                mode: 'dry_run',
            }),
            reason: 'force_dry_run',
        });
        return {
            mode: 'dry_run',
            submitted: false,
            simulated: true,
            shouldRecordLocalTrade: false,
            quantity: simulatedQuantity,
            error: 'Dry run mode: order not sent',
            clientOrderId: null,
            correlationId: resolvedCorrelationId,
        };
    }

    if (!liveEnabled) {
        await appendAutotradeEvent('execution_skipped', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                price: currentPrice,
                ibs,
                decisionTime,
                dateKey,
                mode: 'off',
            }),
            reason: 'autotrading_disabled',
        });
        return { mode: 'off', submitted: false, shouldRecordLocalTrade: false, clientOrderId: null, correlationId: resolvedCorrelationId, error: 'Autotrading is disabled' };
    }

    if (!runtime.appKey || !runtime.appSecret || !runtime.accountId) {
        await appendAutotradeEvent('execution_blocked', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                price: currentPrice,
                ibs,
                decisionTime,
                dateKey,
                mode: 'off',
            }),
            reason: 'missing_webull_credentials',
        }, 'error');
        return { mode: 'off', submitted: false, shouldRecordLocalTrade: false, error: 'Webull credentials are missing', clientOrderId: null, correlationId: resolvedCorrelationId };
    }

    const side = action === 'entry' ? 'BUY' : 'SELL';
    let orderBuild;
    let quantity;
    let entryFunds = null;
    let instrumentId = null;

    try {
        if (action === 'entry') {
            const entryBalanceResp = await getAccountBalance(runtime.accountId);
            const entryBalanceSizing = resolveEntryBalanceSizing(entryBalanceResp, autoTrading);
            entryFunds = entryBalanceSizing.entryFunds;
            {
                const root = entryBalanceResp?.data && typeof entryBalanceResp.data === 'object' ? entryBalanceResp.data : entryBalanceResp;
                const assets = Array.isArray(root?.account_currency_assets) ? root.account_currency_assets : [];
                const usdAsset = assets.find((a) => String(a?.currency || '').toUpperCase() === 'USD') || assets[0] || null;
                await appendAutotradeEvent('balance_snapshot', {
                    ...buildExecutionLogContext({
                        source,
                        correlationId: resolvedCorrelationId,
                        symbol: normalizedSymbol,
                        action,
                        price: currentPrice,
                        ibs,
                        decisionTime,
                        dateKey,
                        mode: 'live',
                    }),
                    entryFunds,
                    entryCapitalMode: entryBalanceSizing.capitalMode,
                    entryCapitalMultiplier: entryBalanceSizing.multiplier,
                    entryCapitalReservePct: entryBalanceSizing.reservePct,
                    entryBaseCapital: entryBalanceSizing.baseCapital,
                    entryBuyingPower: entryBalanceSizing.buyingPower,
                    sizingMode: autoTrading.entrySizingMode || 'balance',
                    day_buying_power: usdAsset?.day_buying_power ?? null,
                    overnight_buying_power: usdAsset?.overnight_buying_power ?? null,
                    cash_balance: usdAsset?.cash_balance ?? null,
                    net_liquidation_value: usdAsset?.net_liquidation_value ?? null,
                    currency: usdAsset?.currency ?? null,
                }, 'info');
            }
            const needsBalance = !(quantityOverride > 0) && (autoTrading.entrySizingMode || 'balance') === 'balance';
            if (entryFunds == null && needsBalance) {
                const root = entryBalanceResp?.data && typeof entryBalanceResp.data === 'object' ? entryBalanceResp.data : entryBalanceResp;
                const rootKeys = root && typeof root === 'object' ? Object.keys(root).join(',') : 'null';
                const assets = Array.isArray(root?.account_currency_assets) ? root.account_currency_assets : [];
                const assetKeys = assets[0] ? Object.keys(assets[0]).join(',') : 'no_assets';
                throw new Error(`Unable to read available funds for balance sizing (rootKeys=${rootKeys}; assetKeys=${assetKeys})`);
            }
            instrumentId = await resolveInstrumentId(normalizedSymbol);
            orderBuild = buildEquityOrderItem({
                symbol: normalizedSymbol,
                instrumentId,
                side,
                currentPrice,
                autoTrading: { ...autoTrading, orderType: 'MARKET', ...(quantityOverride > 0 ? { entrySizingMode: 'quantity', fixedQuantity: quantityOverride } : { entrySizingMode: autoTrading.entrySizingMode || 'balance' }) },
                availableFunds: entryFunds,
            });
            quantity = orderBuild.quantity;
        } else {
            const positionsResp = await getAccountPositions(runtime.accountId);
            const posData = positionsResp?.data;
            // Webull returns { has_next, holdings: [...] } — check all known array keys
            const positions = Array.isArray(posData)
                ? posData
                : (Array.isArray(posData?.holdings) ? posData.holdings
                : (Array.isArray(posData?.positions) ? posData.positions
                : []));
            const brokerPosition = positions.find((position) => {
                const candidate = toSafeTicker(position?.symbol || position?.ticker || position?.display_symbol || '');
                return candidate === normalizedSymbol;
            });
            quantity = normalizePositionQuantity(brokerPosition, autoTrading.allowFractionalShares === true);
            instrumentId = await resolveInstrumentId(normalizedSymbol);
            if (!(quantity > 0)) {
                await appendAutotradeEvent('execution_blocked', {
                    ...buildExecutionLogContext({
                        source,
                        correlationId: resolvedCorrelationId,
                        symbol: normalizedSymbol,
                        action,
                        price: currentPrice,
                        ibs,
                        decisionTime,
                        dateKey,
                        mode: 'live',
                    }),
                    reason: 'no_broker_position_for_exit',
                }, 'warn');
                return { mode: 'live', submitted: false, shouldRecordLocalTrade: false, error: `No broker position found for ${normalizedSymbol}`, clientOrderId: null, correlationId: resolvedCorrelationId };
            }
            orderBuild = {
                item: {
                    combo_type: 'NORMAL',
                    client_order_id: crypto.randomUUID().replace(/-/g, ''),
                    symbol: normalizedSymbol,
                    instrument_id: instrumentId,
                    instrument_type: 'EQUITY',
                    market: 'US',
                    side,
                    order_type: 'MARKET',
                    quantity: autoTrading.allowFractionalShares ? quantity.toFixed(5).replace(/0+$/, '').replace(/\.$/, '') : String(quantity),
                    time_in_force: autoTrading.timeInForce || 'DAY',
                    support_trading_session: autoTrading.supportTradingSession || 'CORE',
                    entrust_type: 'QTY',
                    extended_hours_trading: false,
                },
                quantity,
                limitPrice: null,
            };
        }
    } catch (error) {
        const message = error && error.message ? error.message : 'order_build_failed';
        await appendAutotradeEvent('execution_blocked', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                price: currentPrice,
                ibs,
                decisionTime,
                dateKey,
                mode: 'live',
            }),
            reason: message,
        }, 'error');
        return {
            mode: 'live',
            submitted: false,
            simulated: false,
            shouldRecordLocalTrade: false,
            error: message,
            clientOrderId: null,
            correlationId: resolvedCorrelationId,
        };
    }

    const order = orderBuild.item;
    let stage = 'place_order';
    try {
        if (action === 'entry' && autoTrading.cancelOpenOrdersBeforeEntry) {
            stage = 'cancel_open_orders_before_entry';
            const cancelledOrderIds = await cancelOpenOrdersBeforeEntry(runtime.accountId, normalizedSymbol);
            if (cancelledOrderIds.length > 0) {
                await appendAutotradeEvent('open_orders_cancelled', {
                    ...buildExecutionLogContext({
                        source,
                        correlationId: resolvedCorrelationId,
                        symbol: normalizedSymbol,
                        action,
                        quantity,
                        price: currentPrice,
                        ibs,
                        decisionTime,
                        dateKey,
                        mode: 'live',
                        stage,
                    }),
                    cancelled_order_ids: cancelledOrderIds,
                    cancelled_count: cancelledOrderIds.length,
                });
            }
        }

        if (autoTrading.previewBeforeSend) {
            stage = 'preview_order';
            await appendAutotradeEvent('order_preview_skipped', {
                ...buildExecutionLogContext({
                    source,
                    correlationId: resolvedCorrelationId,
                    symbol: normalizedSymbol,
                    action,
                    clientOrderId: order.client_order_id,
                    quantity,
                    price: currentPrice,
                    ibs,
                    decisionTime,
                    dateKey,
                    mode: 'live',
                    stage,
                }),
                side,
                order_type: 'MARKET',
                broker_summary: 'preview_unsupported_for_webull_us',
            }, 'warn');
        }

        stage = 'place_order';
        const placed = await placeOrder(runtime.accountId, order);
        invalidateDashboardSnapshotCache();
        await appendAutotradeEvent('order_submit_ok', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                clientOrderId: order.client_order_id,
                status: 'submitted',
                quantity,
                price: currentPrice,
                ibs,
                entryFunds,
                decisionTime,
                dateKey,
                mode: 'live',
                stage,
            }),
            side,
            order_type: 'MARKET',
            http_status: placed?.statusCode || null,
            broker_summary: summarizeBrokerPayload(placed?.data),
        });
        void trackSubmittedOrder({
            accountId: runtime.accountId,
            clientOrderId: order.client_order_id,
            symbol: normalizedSymbol,
            action,
            decisionTime,
            dateKey,
            ibs,
            source,
            quantity,
            notifyOnResult,
            correlationId: resolvedCorrelationId,
        });
        return {
            mode: 'live',
            submitted: true,
            simulated: false,
            shouldRecordLocalTrade: false,
            order,
            quantity,
            response: placed?.data || null,
            clientOrderId: order.client_order_id,
            correlationId: resolvedCorrelationId,
        };
    } catch (error) {
        await appendAutotradeEvent('order_submit_failed', {
            ...buildExecutionLogContext({
                source,
                correlationId: resolvedCorrelationId,
                symbol: normalizedSymbol,
                action,
                clientOrderId: order.client_order_id,
                quantity,
                price: currentPrice,
                ibs,
                entryFunds,
                decisionTime,
                dateKey,
                mode: 'live',
                stage,
            }),
            side,
            order_type: 'MARKET',
            error: error && error.message ? error.message : 'unknown_error',
            broker_summary: error && error.response ? summarizeBrokerPayload(error.response) : null,
        }, 'error');
        return {
            mode: 'live',
            submitted: false,
            simulated: false,
            shouldRecordLocalTrade: false,
            order,
            quantity,
            error: error && error.message ? error.message : 'Webull order failed',
            response: error && error.response ? error.response : null,
            clientOrderId: order.client_order_id,
            correlationId: resolvedCorrelationId,
        };
    }
}

async function closeWebullPositionMarket(symbol, options = {}) {
    const runtime = buildWebullRuntimeConfig();
    if (!runtime.appKey || !runtime.appSecret || !runtime.accountId) {
        throw new Error('Webull credentials are missing');
    }
    const normalizedSymbol = toSafeTicker(symbol);
    if (!normalizedSymbol) {
        throw new Error('Invalid symbol');
    }

    const now = options.now || new Date();
    const nowEt = getETParts(now);
    const correlationId = options.correlationId || generateCorrelationId();
    await appendAutotradeEvent('manual_close_requested', {
        ...buildExecutionLogContext({
            source: options.source || 'manual_close_position',
            correlationId,
            symbol: normalizedSymbol,
            action: 'exit',
            decisionTime: now.toISOString(),
            dateKey: etKeyYMD(nowEt),
            mode: 'live',
        }),
    });
    const result = await executeWebullSignal({
        action: 'exit',
        symbol: normalizedSymbol,
        currentPrice: null,
        ibs: null,
        decisionTime: now.toISOString(),
        dateKey: etKeyYMD(nowEt),
        source: options.source || 'manual_close_position',
        forceDryRun: false,
        forceLive: true,
        notifyOnResult: true,
        correlationId,
    });

    await maybeSendExecutionTelegram(
        `<b>Ручное закрытие через сайт</b>\n${normalizedSymbol} • SELL MARKET\nstatus: ${result.submitted ? 'submitted' : 'failed'}${result.error ? `\nerror: ${result.error}` : ''}`,
        {
            source: options.source || 'manual_close_position',
            correlationId,
            symbol: normalizedSymbol,
            action: 'exit',
            clientOrderId: result.clientOrderId,
            status: result.submitted ? 'submitted' : 'failed',
            decisionTime: now.toISOString(),
            dateKey: etKeyYMD(nowEt),
            mode: 'live',
        }
    );

    if (!result.submitted) {
        throw new Error(result.error || `Failed to close position for ${normalizedSymbol}`);
    }

    return result;
}

async function buyWebullTestMarket(symbol = 'AAL', quantity = 1, options = {}) {
    await initializeAutotradeRuntime();
    const runtime = buildWebullRuntimeConfig();
    if (!runtime.appKey || !runtime.appSecret || !runtime.accountId) {
        throw new Error('Webull credentials are missing');
    }

    const normalizedSymbol = toSafeTicker(symbol);
    if (!normalizedSymbol) {
        throw new Error('Invalid symbol');
    }

    const numericQuantity = Number(quantity);
    if (!(Number.isInteger(numericQuantity) && numericQuantity > 0)) {
        throw new Error('Test buy quantity must be a positive integer');
    }

    const now = options.now || new Date();
    const nowEt = getETParts(now);
    const correlationId = options.correlationId || generateCorrelationId();

    // Fetch current price — same as real autotrade, use configured provider
    const settings = await readSettings();
    const quoteProvider = resolveQuoteProvider(settings.autoTrading);
    const { range, quote } = await fetchQuoteWithProvider(normalizedSymbol, quoteProvider);
    const currentPrice = toFiniteNumber(quote && quote.current);
    if (!currentPrice) {
        throw new Error(`Unable to fetch current price for ${normalizedSymbol}`);
    }

    // Go through executeWebullSignal — same code path as real autotrade
    const result = await executeWebullSignal({
        action: 'entry',
        symbol: normalizedSymbol,
        currentPrice,
        ibs: range && range.high > range.low
            ? Math.max(0, Math.min(1, (currentPrice - range.low) / (range.high - range.low)))
            : null,
        decisionTime: now.toISOString(),
        dateKey: etKeyYMD(nowEt),
        source: options.source || 'manual_test_buy',
        forceLive: true,
        notifyOnResult: true,
        quantityOverride: numericQuantity,
        correlationId,
    });

    return result;
}

async function evaluateAutoTradeCycle(options = {}) {
    if (!isTradeHistoryLoaded()) {
        await loadTradeHistory();
    }
    const settings = await readSettings();
    const autoTrading = settings.autoTrading || {};
    const now = options.now || new Date();
    const nowEt = getETParts(now);
    const todayKey = etKeyYMD(nowEt);
    const symbols = getConfiguredSymbols(autoTrading);
    const quotes = await evaluateMarketSnapshotForSymbols(symbols, autoTrading);
    const openTrade = getCurrentOpenBrokerTrade();

    let decision = {
        action: 'none',
        reason: 'no_signal',
        symbol: null,
        candidate: null,
    };

    if (openTrade && autoTrading.allowExits) {
        const row = quotes.find((item) => item.symbol === openTrade.symbol && item.ok);
        const highIBS = getThresholdsForSymbol(openTrade.symbol, autoTrading).highIBS;
        if (row && typeof row.ibs === 'number' && row.ibs >= highIBS) {
            decision = {
                action: 'exit',
                reason: 'ibs_exit',
                symbol: openTrade.symbol,
                candidate: row,
            };
        } else {
            decision = {
                action: 'none',
                reason: row ? 'exit_threshold_not_reached' : 'open_position_quote_unavailable',
                symbol: openTrade.symbol,
                candidate: row || null,
            };
        }
    } else if (!openTrade && autoTrading.allowNewEntries) {
        const eligible = quotes
            .filter((item) => item.ok && typeof item.ibs === 'number' && item.ibs <= item.thresholds.lowIBS)
            .sort((a, b) => a.ibs - b.ibs);
        if (eligible.length > 0) {
            decision = {
                action: 'entry',
                reason: 'lowest_ibs_signal',
                symbol: eligible[0].symbol,
                candidate: eligible[0],
            };
        }
    }

    return {
        evaluatedAt: now.toISOString(),
        todayKey,
        autoTrading,
        symbols,
        quotes,
        openTrade: openTrade ? serializeBrokerTradeForResponse(openTrade) : null,
        decision,
    };
}

async function executeAutoTradeCycle(options = {}) {
    const evaluation = await evaluateAutoTradeCycle(options);
    const autoTrading = evaluation.autoTrading;
    const decision = evaluation.decision;

    if (decision.action === 'none') {
        autoTradeState.lastRunAt = new Date().toISOString();
        autoTradeState.lastResult = evaluation;
        return { ...evaluation, executed: false, live: !!autoTrading.enabled };
    }

    if (!decision.candidate || !decision.candidate.ok) {
        throw new Error('Trading decision exists but quote candidate is invalid');
    }

    const result = {
        ...evaluation,
        executed: false,
        live: !!autoTrading.enabled,
        broker: null
    };

    const brokerResult = await executeWebullSignal({
        action: decision.action,
        symbol: decision.symbol,
        currentPrice: decision.candidate.currentPrice,
        ibs: decision.candidate.ibs,
        decisionTime: evaluation.evaluatedAt,
        dateKey: evaluation.todayKey,
            source: options.trigger || 'execute_autotrade_cycle',
        notifyOnResult: true,
    });
    result.broker = brokerResult;

    result.executed = !!brokerResult.submitted;
    result.simulated = !!brokerResult.simulated;
    autoTradeState.lastRunAt = new Date().toISOString();
    autoTradeState.lastResult = result;
    return result;
}

async function getAutoTradeConfig() {
    await initializeAutotradeRuntime();
    const settings = await readSettings();
    return settings.autoTrading || {};
}

async function updateAutoTradeConfig(updates) {
    await initializeAutotradeRuntime();
    const settings = await readSettings();
    const nextAutoTrading = sanitizeAutoTradingConfig(updates || {}, settings.autoTrading || {});
    const nextSettings = { ...settings, autoTrading: nextAutoTrading };
    await writeSettings(nextSettings);
    return nextAutoTrading;
}

async function getWebullConnectionSummary(configOverrides = {}) {
    await initializeAutotradeRuntime();
    const runtime = buildWebullRuntimeConfig(configOverrides);
    return {
        configured: !!(runtime.appKey && runtime.appSecret),
        hasAccessToken: !!runtime.accessToken,
        hasAccountId: !!runtime.accountId,
        host: runtime.hostname,
        protocol: runtime.protocol,
        port: runtime.port || null,
    };
}

async function getWebullAccountSnapshot(configOverrides = {}) {
    await initializeAutotradeRuntime();
    const runtime = buildWebullRuntimeConfig(configOverrides);
    if (!runtime.appKey || !runtime.appSecret) {
        throw new Error('Webull credentials are not configured');
    }
    const accountId = runtime.accountId;
    const [balance, positions] = await Promise.allSettled([
        accountId ? getAccountBalance(accountId, configOverrides) : Promise.resolve(null),
        accountId ? getAccountPositions(accountId, configOverrides) : Promise.resolve(null),
    ]);

    const errors = [];
    const accountBalance = balance.status === 'fulfilled' ? balance.value : null;
    const accountPositions = positions.status === 'fulfilled' ? positions.value : null;
    for (const item of [balance, positions]) {
        if (item.status === 'rejected') {
            errors.push(item.reason && item.reason.message ? item.reason.message : String(item.reason));
        }
    }
    return {
        connection: await getWebullConnectionSummary(configOverrides),
        accounts: [{
            account_id: accountId || null,
            account_number: accountId ? `${accountId.slice(0, 4)}...` : null,
            account_type: 'MARGIN',
            account_label: 'Configured Webull US account',
            account_class: 'WEBULL_US',
            user_id: null,
        }],
        balance: accountBalance ? accountBalance.data : null,
        positions: accountPositions ? accountPositions.data : null,
        errors,
    };
}

async function getWebullDashboardSnapshot(configOverrides = {}, options = {}) {
    await initializeAutotradeRuntime();
    const canUseCache = Object.keys(configOverrides || {}).length === 0 && options.forceRefresh !== true;
    const cacheAgeMs = Date.now() - dashboardSnapshotCache.fetchedAtMs;
    if (canUseCache && dashboardSnapshotCache.value && cacheAgeMs <= DASHBOARD_CACHE_TTL_MS) {
        return dashboardSnapshotCache.value;
    }
    if (canUseCache && dashboardSnapshotCache.inFlight) {
        return dashboardSnapshotCache.inFlight;
    }

    const loadPromise = (async () => {
    const runtime = buildWebullRuntimeConfig(configOverrides);
    if (!runtime.appKey || !runtime.appSecret) {
        throw new Error('Webull credentials are not configured');
    }
    const accountId = runtime.accountId;

    // Build 30-day date range for order history (ET date)
    const endDateStr = etKeyYMD(getETParts(new Date()));
    const startDateStr = etKeyYMD(getETParts(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));

    const [balance, positions, openOrders, orderHistory] = await Promise.allSettled([
        accountId ? getAccountBalance(accountId, configOverrides) : Promise.resolve(null),
        accountId ? getAccountPositions(accountId, configOverrides) : Promise.resolve(null),
        accountId ? getOpenOrders(accountId, { pageSize: 50 }, configOverrides) : Promise.resolve(null),
        accountId ? getOrderHistoryByDateRange(accountId, { startDate: startDateStr, endDate: endDateStr, pageSize: 100 }, configOverrides) : Promise.resolve(null),
    ]);

    const errors = [];
    const balanceValue = balance.status === 'fulfilled' ? balance.value : null;
    const positionsValue = positions.status === 'fulfilled' ? positions.value : null;
    const openOrdersValue = openOrders.status === 'fulfilled' ? openOrders.value : null;
    const orderHistoryValue = orderHistory.status === 'fulfilled' ? orderHistory.value : null;
    for (const item of [balance, positions, openOrders, orderHistory]) {
        if (item.status === 'rejected') {
            errors.push(item.reason && item.reason.message ? item.reason.message : String(item.reason));
        }
    }

        const snapshot = {
        connection: await getWebullConnectionSummary(configOverrides),
        accounts: [{
            account_id: accountId || null,
            account_number: accountId ? `${accountId.slice(0, 4)}...` : null,
            account_type: 'MARGIN',
            account_label: 'Configured Webull US account',
            account_class: 'WEBULL_US',
            user_id: null,
        }],
        balance: balanceValue ? balanceValue.data : null,
        positions: positionsValue ? positionsValue.data : null,
        openOrders: openOrdersValue ? openOrdersValue.data : null,
        orderHistory: orderHistoryValue ? orderHistoryValue.data : null,
        errors,
        fetchedAt: new Date().toISOString(),
        };

        if (canUseCache) {
            dashboardSnapshotCache.value = snapshot;
            dashboardSnapshotCache.fetchedAtMs = Date.now();
        }
        return snapshot;
    })();

    if (canUseCache) {
        dashboardSnapshotCache.inFlight = loadPromise;
        return loadPromise.finally(() => {
            if (dashboardSnapshotCache.inFlight === loadPromise) {
                dashboardSnapshotCache.inFlight = null;
            }
        });
    }

    return loadPromise;
}

async function getExecutionLogs(limit = 200) {
    await initializeAutotradeRuntime();
    const [autotrade, monitor, brokerRaw] = await Promise.all([
        readAutotradeLogTail(limit),
        readLogTail(MONITOR_LOG_FILE, limit),
        readWebullRawLogTail(limit),
    ]);
    return {
        fetchedAt: new Date().toISOString(),
        autotrade,
        monitor,
        brokerRaw,
        pending: Array.from(pendingOrderTrackers.values()).map(buildTrackerSnapshot),
        recent: recentTrackedOrders.slice(0, 20),
    };
}

async function runAutoTradingSchedulerTick() {
    const settings = await readSettings();
    const autoTrading = settings.autoTrading || {};
    if (!autoTrading.enabled) {
        return { executed: false, reason: 'disabled' };
    }

    const now = new Date();
    const nowEt = getETParts(now);
    const cal = getCachedTradingCalendar();
    if (!isTradingDayByCalendarET(nowEt, cal)) {
        return { executed: false, reason: 'not_trading_day' };
    }

    const session = getTradingSessionForDateET(nowEt, cal);
    const nowSeconds = nowEt.hh * 3600 + nowEt.mm * 60 + now.getUTCSeconds();
    const closeSeconds = session.closeMin * 60;
    const secondsUntilClose = closeSeconds - nowSeconds;

    if (secondsUntilClose < 0 || secondsUntilClose > autoTrading.executionWindowSeconds) {
        return { executed: false, reason: 'outside_execution_window', secondsUntilClose };
    }

    const schedulerKey = `${etKeyYMD(nowEt)}:${Math.floor(secondsUntilClose / 20)}:${getCurrentOpenBrokerTrade() ? 'open' : 'flat'}`;
    if (autoTradeState.lastSchedulerAttemptKey === schedulerKey) {
        return { executed: false, reason: 'already_attempted_bucket', secondsUntilClose };
    }
    autoTradeState.lastSchedulerAttemptKey = schedulerKey;

    return executeAutoTradeCycle({ now, trigger: 'scheduler' });
}

module.exports = {
    autoTradeState,
    pendingOrderTrackers,
    initializeAutotradeRuntime,
    appendAutotradeLog,
    appendAutotradeEvent,
    sanitizeAutoTradingConfig,
    executeWebullSignal,
    closeWebullPositionMarket,
    buyWebullTestMarket,
    evaluateAutoTradeCycle,
    executeAutoTradeCycle,
    getAutoTradeConfig,
    updateAutoTradeConfig,
    getWebullConnectionSummary,
    getWebullAccountSnapshot,
    getWebullDashboardSnapshot,
    getExecutionLogs,
    runAutoTradingSchedulerTick,
    createAccessToken,
    checkAccessToken,
    __testables: {
        computeOrderQuantity,
        getEntryBuyingPowerHeadroomFactor,
        getEntryCapitalModeConfig,
        resolveEntryBalanceSizing,
        DEFAULT_ENTRY_CAPITAL_MODE,
        ENTRY_CAPITAL_MODE_CONFIG,
    },
};
