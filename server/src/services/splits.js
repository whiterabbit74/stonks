/**
 * Stock splits management service — backed by SQLite
 */
const fs = require('fs-extra');
const { getDb } = require('../db');
const { SPLITS_FILE } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

// ─── Migration ────────────────────────────────────────────────────────────────

let _migrated = false;

function migrateJsonToDb() {
    if (_migrated) return;
    _migrated = true;

    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) AS n FROM splits').get().n;
    if (count > 0) return;

    if (!fs.pathExistsSync(SPLITS_FILE)) return;

    try {
        const json = fs.readJsonSync(SPLITS_FILE);
        if (!json || typeof json !== 'object') return;

        const insert = db.prepare('INSERT OR IGNORE INTO splits (ticker, date, factor) VALUES (?, ?, ?)');
        const run = db.transaction((map) => {
            for (const [ticker, events] of Object.entries(map)) {
                const key = toSafeTicker(ticker);
                for (const e of normalizeSplitEvents(events)) {
                    insert.run(key, e.date, e.factor);
                }
            }
        });
        run(json);
        console.log('splits: migrated from JSON to SQLite');
    } catch (e) {
        console.warn('splits: migration failed:', e.message);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSplitEvents(events) {
    const list = Array.isArray(events) ? events : [];
    const valid = list
        .filter(e => e && typeof e.date === 'string' && e.date.length >= 10 && typeof e.factor === 'number' && isFinite(e.factor) && e.factor > 0)
        .map(e => ({ date: e.date.slice(0, 10), factor: Number(e.factor) }))
        .filter(e => e.factor !== 1);
    const byDate = new Map();
    for (const e of valid) byDate.set(e.date, e);
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function readSplitsMap() {
    migrateJsonToDb();
    const db = getDb();
    const rows = db.prepare('SELECT ticker, date, factor FROM splits ORDER BY ticker, date').all();
    const map = {};
    for (const row of rows) {
        if (!map[row.ticker]) map[row.ticker] = [];
        map[row.ticker].push({ date: row.date, factor: row.factor });
    }
    return map;
}

async function loadSplits() {
    return readSplitsMap();
}

function getTickerSplits(ticker) {
    migrateJsonToDb();
    const db = getDb();
    const key = toSafeTicker(ticker);
    return db.prepare('SELECT date, factor FROM splits WHERE ticker = ? ORDER BY date').all(key);
}

// ─── Write ────────────────────────────────────────────────────────────────────

function upsertTickerSplits(ticker, events) {
    migrateJsonToDb();
    const db = getDb();
    const key = toSafeTicker(ticker);
    const incoming = normalizeSplitEvents(events || []);
    const insert = db.prepare('INSERT OR REPLACE INTO splits (ticker, date, factor) VALUES (?, ?, ?)');
    db.transaction(() => { for (const e of incoming) insert.run(key, e.date, e.factor); })();
    return getTickerSplits(key);
}

function setTickerSplits(ticker, events) {
    migrateJsonToDb();
    const db = getDb();
    const key = toSafeTicker(ticker);
    const normalized = normalizeSplitEvents(events || []);
    db.transaction(() => {
        db.prepare('DELETE FROM splits WHERE ticker = ?').run(key);
        const insert = db.prepare('INSERT INTO splits (ticker, date, factor) VALUES (?, ?, ?)');
        for (const e of normalized) insert.run(key, e.date, e.factor);
    })();
    return getTickerSplits(key);
}

function deleteTickerSplitByDate(ticker, date) {
    migrateJsonToDb();
    const db = getDb();
    const key = toSafeTicker(ticker);
    const safeDate = (date || '').toString().slice(0, 10);
    db.prepare('DELETE FROM splits WHERE ticker = ? AND date = ?').run(key, safeDate);
    return getTickerSplits(key);
}

function deleteTickerSplits(ticker) {
    migrateJsonToDb();
    const db = getDb();
    db.prepare('DELETE FROM splits WHERE ticker = ?').run(toSafeTicker(ticker));
    return true;
}

// ─── Detection ────────────────────────────────────────────────────────────────

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

async function ensureSplitsFile() { /* no-op, DB handles init */ }

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
