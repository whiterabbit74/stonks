/**
 * Stock splits management service
 */
const fs = require('fs-extra');
const { Mutex } = require('async-mutex');
const { SPLITS_FILE } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const { ensureRegularFile } = require('../utils/files');

// In-memory cache for splits data
let splitsCache = null;

// Mutex to ensure thread-safe (in terms of event loop race conditions) writes
const fileMutex = new Mutex();

async function ensureSplitsFile() {
    try {
        await ensureRegularFile(SPLITS_FILE, {});
    } catch { }
}

async function readSplitsMap() {
    // Return cached data if available
    if (splitsCache) {
        return splitsCache;
    }

    try {
        await ensureSplitsFile();
        if (await fs.pathExists(SPLITS_FILE)) {
            const json = await fs.readJson(SPLITS_FILE);
            splitsCache = (json && typeof json === 'object') ? json : {};
            return splitsCache;
        }
    } catch (e) {
        console.warn('Failed to load splits:', e.message);
    }

    // Fallback to empty object if file read fails, but don't cache it as valid
    // unless we want to cache failures too. For now, let's just return empty.
    return {};
}

// Load splits from JSON file (alias for readSplitsMap for compatibility)
async function loadSplits() {
    return await readSplitsMap();
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

// Internal helper to update map safely
async function updateSplitsMap(updateFn) {
    return await fileMutex.runExclusive(async () => {
        // Ensure cache is populated
        const currentMap = await readSplitsMap();

        // Create a deep clone to work on, ensuring we don't mutate the cache/current state
        // until we successfully write to disk.
        // Using JSON serialization for deep clone as the data structure is simple (JSON-serializable).
        const workingMap = JSON.parse(JSON.stringify(currentMap));

        // Apply update to the working copy
        const result = updateFn(workingMap);

        // Write to disk
        await fs.writeJson(SPLITS_FILE, workingMap, { spaces: 2 });

        // Update cache only after successful write
        splitsCache = workingMap;

        return result;
    });
}

async function upsertTickerSplits(ticker, events) {
    const key = toSafeTicker(ticker);

    return await updateSplitsMap((map) => {
        const existing = normalizeSplitEvents(map[key] || []);
        const incoming = normalizeSplitEvents(events || []);
        const byDate = new Map();
        for (const e of existing) byDate.set(e.date, e);
        for (const e of incoming) byDate.set(e.date, e);
        const merged = Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
        map[key] = merged;
        return merged;
    });
}

async function setTickerSplits(ticker, events) {
    const key = toSafeTicker(ticker);

    return await updateSplitsMap((map) => {
        const normalized = normalizeSplitEvents(events || []);
        if (normalized.length > 0) {
            map[key] = normalized;
        } else {
            delete map[key];
        }
        return map[key] || [];
    });
}

async function deleteTickerSplitByDate(ticker, date) {
    const key = toSafeTicker(ticker);

    return await updateSplitsMap((map) => {
        const existing = normalizeSplitEvents(map[key] || []);
        const safeDate = (date || '').toString().slice(0, 10);
        const filtered = existing.filter(e => e.date !== safeDate);
        if (filtered.length > 0) {
            map[key] = filtered;
        } else {
            delete map[key];
        }
        return map[key] || [];
    });
}

async function deleteTickerSplits(ticker) {
    const key = toSafeTicker(ticker);

    return await updateSplitsMap((map) => {
        if (map[key]) delete map[key];
        return true;
    });
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
