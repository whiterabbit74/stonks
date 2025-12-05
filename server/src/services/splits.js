/**
 * Stock splits management service
 */
const fs = require('fs-extra');
const { SPLITS_FILE } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const { ensureRegularFileSync } = require('../utils/files');

// Load splits from JSON file
function loadSplits() {
    try {
        if (fs.existsSync(SPLITS_FILE)) {
            return fs.readJsonSync(SPLITS_FILE);
        }
    } catch (e) {
        console.warn('Failed to load splits:', e.message);
    }
    return {};
}

async function ensureSplitsFile() {
    try {
        ensureRegularFileSync(SPLITS_FILE, {});
    } catch { }
}

async function readSplitsMap() {
    try {
        await ensureSplitsFile();
        const json = await fs.readJson(SPLITS_FILE);
        return (json && typeof json === 'object') ? json : {};
    } catch {
        return {};
    }
}

function normalizeSplitEvents(events) {
    const list = Array.isArray(events) ? events : [];
    const valid = list
        .filter(e => e && typeof e.date === 'string' && e.date.length >= 10 && typeof e.factor === 'number' && isFinite(e.factor) && e.factor > 0)
        .map(e => ({ date: e.date.slice(0, 10), factor: Number(e.factor) }))
        .filter(e => e.factor !== 1);
    const byDate = new Map();
    for (const e of valid) byDate.set(e.date, e);
    return Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function getTickerSplits(ticker) {
    const map = await readSplitsMap();
    const key = toSafeTicker(ticker);
    const arr = normalizeSplitEvents(map[key] || []);
    return arr;
}

async function upsertTickerSplits(ticker, events) {
    const key = toSafeTicker(ticker);
    const map = await readSplitsMap();
    const existing = normalizeSplitEvents(map[key] || []);
    const incoming = normalizeSplitEvents(events || []);
    const byDate = new Map();
    for (const e of existing) byDate.set(e.date, e);
    for (const e of incoming) byDate.set(e.date, e);
    const merged = Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
    map[key] = merged;
    await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
    return merged;
}

async function setTickerSplits(ticker, events) {
    const key = toSafeTicker(ticker);
    const map = await readSplitsMap();
    const normalized = normalizeSplitEvents(events || []);
    if (normalized.length > 0) {
        map[key] = normalized;
    } else {
        delete map[key];
    }
    await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
    return map[key] || [];
}

async function deleteTickerSplitByDate(ticker, date) {
    const key = toSafeTicker(ticker);
    const map = await readSplitsMap();
    const existing = normalizeSplitEvents(map[key] || []);
    const safeDate = (date || '').toString().slice(0, 10);
    const filtered = existing.filter(e => e.date !== safeDate);
    if (filtered.length > 0) {
        map[key] = filtered;
    } else {
        delete map[key];
    }
    await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
    return map[key] || [];
}

async function deleteTickerSplits(ticker) {
    const key = toSafeTicker(ticker);
    const map = await readSplitsMap();
    if (map[key]) delete map[key];
    await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
    return true;
}

// Detect splits from OHLC data heuristics
function detectSplitsFromOHLC(ohlc) {
    const factors = [2, 3, 4, 5, 10, 0.5, 0.333, 0.25, 0.2, 0.1];
    const splits = [];
    if (!Array.isArray(ohlc) || ohlc.length < 2) return splits;
    for (let i = 1; i < ohlc.length; i++) {
        const prev = ohlc[i - 1];
        const curr = ohlc[i];
        if (!prev || !curr || !prev.close || !curr.open) continue;
        const ratio = prev.close / curr.open;
        for (const f of factors) {
            if (Math.abs(ratio - f) < 0.05) {
                splits.push({ date: curr.date, factor: f });
                break;
            }
        }
    }
    return splits;
}

module.exports = {
    loadSplits,
    ensureSplitsFile,
    readSplitsMap,
    normalizeSplitEvents,
    getTickerSplits,
    upsertTickerSplits,
    setTickerSplits,
    deleteTickerSplitByDate,
    deleteTickerSplits,
    detectSplitsFromOHLC,
};
