const fs = require('fs');
const path = require('path');
const { fetchFromAlphaVantage } = require('../providers/alphaVantage');
const { fetchFromFinnhub } = require('../providers/finnhub');
const { fetchFromTwelveData } = require('../providers/twelveData');
const { fetchFromPolygon } = require('../providers/polygon');
const {
    createOhlcIntegrityError,
    validateOhlcMergeIntegrity,
    validateOhlcSeriesIntegrity,
} = require('./marketDataIntegrity');

const ALLOWLIST_PATH = path.join(__dirname, '..', '..', 'config', 'data-integrity-allowlist.json');

function toDateKey(value) {
    try {
        if (typeof value === 'string') return value.slice(0, 10);
        return new Date(value).toISOString().slice(0, 10);
    } catch {
        return '';
    }
}

function toFiniteNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function normalizeFetchedRows(rows) {
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
        const date = toDateKey(row && row.date);
        const open = toFiniteNumber(row && row.open);
        const high = toFiniteNumber(row && row.high);
        const low = toFiniteNumber(row && row.low);
        const close = toFiniteNumber(row && row.close);
        if (!date || open == null || high == null || low == null || close == null) return [];
        const adjClose = toFiniteNumber(row && (row.adjClose ?? row.adj_close)) ?? close;
        const volume = toFiniteNumber(row && row.volume) ?? 0;
        return [{ date, open, high, low, close, adjClose, volume }];
    }).sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeSplitEvents(events) {
    const byDate = new Map();
    for (const event of Array.isArray(events) ? events : []) {
        const date = toDateKey(event && event.date);
        const factor = toFiniteNumber(event && event.factor);
        if (!date || factor == null || factor <= 0 || factor === 1) continue;
        byDate.set(date, { date, factor });
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function loadDataIntegrityAllowlist(filePath = ALLOWLIST_PATH) {
    try {
        if (!filePath || !fs.existsSync(filePath)) return {};
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return {};
    }
}

function isAllowedWarning(warning, allowlist) {
    const events = allowlist[String(warning && warning.symbol || '').toUpperCase()] || [];
    return events.some((event) => (
        event.previousDate === warning.previousDate
        && event.currentDate === warning.currentDate
    ));
}

function filterAllowedWarnings(validation, allowlist) {
    if (!validation || !Array.isArray(validation.warnings)) return validation;
    const blockedWarnings = validation.warnings.filter((warning) => !isAllowedWarning(warning, allowlist));
    return {
        ...validation,
        ok: blockedWarnings.length === 0,
        blockWrite: blockedWarnings.length > 0,
        warnings: blockedWarnings,
        allowedWarningCount: validation.warnings.length - blockedWarnings.length,
    };
}

function assertDatasetPayloadIntegrity(input = {}) {
    const symbol = String(input.symbol || input.payload?.ticker || input.payload?.name || 'UNKNOWN').toUpperCase();
    const rows = normalizeFetchedRows(input.payload?.data);
    const knownSplits = normalizeSplitEvents(input.knownSplits);
    const allowlist = input.allowlist || loadDataIntegrityAllowlist();
    const validation = filterAllowedWarnings(validateOhlcSeriesIntegrity({
        symbol,
        rows,
        knownSplits,
        adjustedForSplits: Boolean(input.payload?.adjustedForSplits),
    }), allowlist);

    if (validation.blockWrite) {
        throw createOhlcIntegrityError(validation, { symbol });
    }
    return validation;
}

function assertOhlcMergeIntegrity(input = {}) {
    const symbol = String(input.symbol || 'UNKNOWN').toUpperCase();
    const allowlist = input.allowlist || loadDataIntegrityAllowlist();
    const validation = filterAllowedWarnings(validateOhlcMergeIntegrity(input), allowlist);
    if (validation.blockWrite) {
        throw createOhlcIntegrityError(validation, { symbol });
    }
    return validation;
}

async function fetchHistoricalMarketData(symbol, startTs, endTs, provider, options = {}) {
    let data;
    let splits = [];
    const adjustment = options.adjustment === 'split_only' ? 'split_only' : 'none';

    switch (provider) {
        case 'finnhub':
            data = await fetchFromFinnhub(symbol, startTs, endTs);
            break;
        case 'twelve_data':
            data = await fetchFromTwelveData(symbol, startTs, endTs);
            break;
        case 'polygon':
            data = await fetchFromPolygon(symbol, startTs, endTs, options.polygonApiKey || null);
            break;
        case 'alpha_vantage':
        default: {
            const av = await fetchFromAlphaVantage(symbol, startTs, endTs, { adjustment });
            data = Array.isArray(av) ? av : (av?.data || []);
            splits = normalizeSplitEvents(av?.splits || []);
            break;
        }
    }

    return {
        rows: normalizeFetchedRows(data),
        splits,
    };
}

module.exports = {
    assertDatasetPayloadIntegrity,
    assertOhlcMergeIntegrity,
    fetchHistoricalMarketData,
    filterAllowedWarnings,
    isAllowedWarning,
    loadDataIntegrityAllowlist,
    normalizeFetchedRows,
    normalizeSplitEvents,
};
