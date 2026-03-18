/**
 * Webull market data provider
 */
const { toSafeTicker } = require('../utils/helpers');
const { requestWebull } = require('../services/webullClient');
const { getETParts, etKeyYMD } = require('../services/dates');

function normalizeSnapshotRow(row) {
    if (!row || typeof row !== 'object') return null;
    return {
        open: row.open ?? row.o ?? null,
        high: row.high ?? row.h ?? null,
        low: row.low ?? row.l ?? null,
        current: row.price ?? row.current ?? row.c ?? null,
        prevClose: row.pre_close ?? row.prevClose ?? row.pc ?? null,
        volume: row.volume ?? row.v ?? null,
        change: row.change ?? null,
        changeRatio: row.change_ratio ?? row.changeRatio ?? null,
        symbol: row.symbol ?? row.ticker ?? null,
        timestamp: row.timestamp ?? row.time ?? null,
    };
}

async function fetchWebullSnapshot(symbol) {
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
        throw new Error('Invalid symbol');
    }

    const response = await requestWebull({
        method: 'GET',
        path: '/market-data/snapshot',
        query: {
            symbols: safeSymbol,
            category: 'US_STOCK',
        },
        includeAccessToken: false,
        version: 'v1',
    });

    const payload = response && response.data;
    const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
            ? payload.data
            : (payload && typeof payload === 'object' ? [payload] : []);
    const first = normalizeSnapshotRow(rows.find(Boolean));
    if (!first) {
        throw new Error('Webull snapshot returned no data');
    }
    return first;
}

async function fetchTodayRangeAndQuote(symbol) {
    const snapshot = await fetchWebullSnapshot(symbol);
    const todayEt = getETParts(new Date());
    const todayKey = etKeyYMD(todayEt);
    const open = snapshot.open != null ? Number(snapshot.open) : null;
    const high = snapshot.high != null ? Number(snapshot.high) : null;
    const low = snapshot.low != null ? Number(snapshot.low) : null;
    const current = snapshot.current != null ? Number(snapshot.current) : null;
    const prevClose = snapshot.prevClose != null ? Number(snapshot.prevClose) : null;
    const change = snapshot.change != null ? Number(snapshot.change) : (current != null && prevClose != null ? current - prevClose : null);
    const changeRatio = snapshot.changeRatio != null ? Number(snapshot.changeRatio) : (change != null && prevClose ? change / prevClose : null);

    return {
        range: {
            open,
            high,
            low,
        },
        quote: {
            open,
            high,
            low,
            current,
            prevClose,
            change,
            changeRatio,
        },
        dateKey: todayKey,
        ohlc: null,
        source: 'webull',
    };
}

module.exports = {
    fetchWebullSnapshot,
    fetchTodayRangeAndQuote,
};
