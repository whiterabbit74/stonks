/**
 * Dataset service — SQLite backed
 */
const path = require('path');
const fs = require('fs-extra');
const { getDb } = require('../db');
const { DATASETS_DIR, KEEP_DATASETS_DIR } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

// ─── read ────────────────────────────────────────────────────────────────────

function listDatasets() {
    const db = getDb();
    return db.prepare(`
        SELECT ticker, name, company_name, upload_date, tag,
               data_points, date_from, date_to, adjusted_for_splits
        FROM dataset_meta ORDER BY ticker
    `).all().map(rowToMeta);
}

function getDatasetMetadata(id) {
    const ticker = toSafeTicker(id);
    if (!ticker) return null;
    const row = getDb().prepare('SELECT * FROM dataset_meta WHERE ticker = ?').get(ticker);
    return row ? rowToMeta(row) : null;
}

function getDataset(id) {
    const ticker = toSafeTicker(id);
    if (!ticker) return null;
    const meta = getDatasetMetadata(ticker);
    if (!meta) return null;
    const rows = getDb()
        .prepare('SELECT date, open, high, low, close, adj_close, volume FROM ohlc WHERE ticker = ? ORDER BY date')
        .all(ticker);
    return {
        ...meta,
        data: rows.map(r => ({
            date: r.date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            adjClose: r.adj_close,
            volume: r.volume,
        })),
    };
}

function datasetExists(id) {
    const ticker = toSafeTicker(id);
    if (!ticker) return false;
    return !!getDb().prepare('SELECT 1 FROM dataset_meta WHERE ticker = ?').get(ticker);
}

// ─── write ───────────────────────────────────────────────────────────────────

function saveDataset(dataset) {
    const ticker = toSafeTicker(dataset.ticker || dataset.name);
    if (!ticker) throw new Error('Invalid ticker');

    const db = getDb();
    const rows = Array.isArray(dataset.data) ? dataset.data : [];
    const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const dateFrom = sorted.length ? String(sorted[0].date).slice(0, 10) : null;
    const dateTo = sorted.length ? String(sorted[sorted.length - 1].date).slice(0, 10) : null;

    const upsertMeta = db.prepare(`
        INSERT INTO dataset_meta
            (ticker, name, company_name, upload_date, tag, data_points, date_from, date_to, adjusted_for_splits, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ticker) DO UPDATE SET
            name                = excluded.name,
            company_name        = excluded.company_name,
            upload_date         = excluded.upload_date,
            tag                 = excluded.tag,
            data_points         = excluded.data_points,
            date_from           = excluded.date_from,
            date_to             = excluded.date_to,
            adjusted_for_splits = excluded.adjusted_for_splits,
            updated_at          = datetime('now')
    `);

    const upsertOhlc = db.prepare(`
        INSERT INTO ohlc (ticker, date, open, high, low, close, adj_close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, date) DO UPDATE SET
            open = excluded.open, high = excluded.high, low = excluded.low,
            close = excluded.close, adj_close = excluded.adj_close, volume = excluded.volume
    `);

    db.transaction(() => {
        upsertMeta.run(
            ticker,
            dataset.name || ticker,
            dataset.companyName || dataset.company_name || null,
            dataset.uploadDate || new Date().toISOString(),
            dataset.tag || null,
            sorted.length,
            dateFrom,
            dateTo,
            dataset.adjustedForSplits ? 1 : 0,
        );
        // Full replace: delete existing rows and re-insert
        db.prepare('DELETE FROM ohlc WHERE ticker = ?').run(ticker);
        for (const row of sorted) {
            const date = String(row.date).slice(0, 10);
            if (!date) continue;
            upsertOhlc.run(
                ticker, date,
                row.open != null ? Number(row.open) : null,
                row.high != null ? Number(row.high) : null,
                row.low != null ? Number(row.low) : null,
                row.close != null ? Number(row.close) : null,
                (row.adjClose ?? row.adj_close) != null ? Number(row.adjClose ?? row.adj_close) : null,
                row.volume != null ? Number(row.volume) : null,
            );
        }
    })();

    return { ticker };
}

function mergeOhlcRows(id, newRows) {
    const ticker = toSafeTicker(id);
    if (!ticker) throw new Error('Invalid ticker');

    const db = getDb();
    const upsert = db.prepare(`
        INSERT INTO ohlc (ticker, date, open, high, low, close, adj_close, volume)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, date) DO UPDATE SET
            open = excluded.open, high = excluded.high, low = excluded.low,
            close = excluded.close, adj_close = excluded.adj_close, volume = excluded.volume
    `);
    const updateMeta = db.prepare(`
        UPDATE dataset_meta
        SET data_points = (SELECT COUNT(*) FROM ohlc WHERE ticker = ?),
            date_from   = (SELECT MIN(date) FROM ohlc WHERE ticker = ?),
            date_to     = (SELECT MAX(date) FROM ohlc WHERE ticker = ?),
            upload_date = ?,
            updated_at  = datetime('now')
        WHERE ticker = ?
    `);

    const added = db.transaction(() => {
        const before = db.prepare('SELECT COUNT(*) as c FROM ohlc WHERE ticker = ?').get(ticker).c;
        for (const row of newRows) {
            const date = String(row.date).slice(0, 10);
            if (!date) continue;
            upsert.run(
                ticker, date,
                row.open != null ? Number(row.open) : null,
                row.high != null ? Number(row.high) : null,
                row.low != null ? Number(row.low) : null,
                row.close != null ? Number(row.close) : null,
                (row.adjClose ?? row.adj_close) != null ? Number(row.adjClose ?? row.adj_close) : null,
                row.volume != null ? Number(row.volume) : null,
            );
        }
        updateMeta.run(ticker, ticker, ticker, new Date().toISOString(), ticker);
        const after = db.prepare('SELECT COUNT(*) as c FROM ohlc WHERE ticker = ?').get(ticker).c;
        return after - before;
    })();

    return added;
}

function deleteDataset(id) {
    const ticker = toSafeTicker(id);
    if (!ticker) return false;
    const db = getDb();
    db.transaction(() => {
        db.prepare('DELETE FROM ohlc WHERE ticker = ?').run(ticker);
        db.prepare('DELETE FROM dataset_meta WHERE ticker = ?').run(ticker);
    })();
    return true;
}

function updateDatasetMetadata(id, updates) {
    const ticker = toSafeTicker(id);
    if (!ticker) return false;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM dataset_meta WHERE ticker = ?').get(ticker);
    if (!existing) return false;
    const tag = updates.tag !== undefined ? (updates.tag || null) : existing.tag;
    const companyName = updates.companyName !== undefined ? (updates.companyName || null) : existing.company_name;
    db.prepare(`
        UPDATE dataset_meta SET tag = ?, company_name = ?, updated_at = datetime('now') WHERE ticker = ?
    `).run(tag, companyName, ticker);
    return true;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function rowToMeta(r) {
    return {
        id: r.ticker,
        name: r.name || r.ticker,
        ticker: r.ticker,
        companyName: r.company_name || null,
        dataPoints: r.data_points || 0,
        dateRange: { from: r.date_from || null, to: r.date_to || null },
        uploadDate: r.upload_date || null,
        tag: r.tag || null,
        adjustedForSplits: r.adjusted_for_splits === 1,
    };
}

function getLastDateFromDataset(dataset) {
    if (!dataset || !Array.isArray(dataset.data) || !dataset.data.length) {
        return dataset?.dateRange?.to ? dataset.dateRange.to.slice(0, 10) : null;
    }
    const lastBar = dataset.data[dataset.data.length - 1];
    if (!lastBar || !lastBar.date) return null;
    if (typeof lastBar.date === 'string') return lastBar.date.slice(0, 10);
    try { return new Date(lastBar.date).toISOString().slice(0, 10); } catch { return null; }
}

// ─── migration from JSON files ────────────────────────────────────────────────

async function migrateJsonFilesToDb() {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM dataset_meta').get().c;
    if (count > 0) return; // already done

    // Always include the local server/datasets dir as fallback (handles Docker path mismatch)
    const { SERVER_DIR } = require('../config');
    const localDatasetsDir = path.join(SERVER_DIR, 'datasets');
    const localKeepDir = path.join(SERVER_DIR, '_keep', 'datasets');
    const dirs = [...new Set([localKeepDir, KEEP_DATASETS_DIR, localDatasetsDir, DATASETS_DIR])];
    const seen = new Set();

    for (const dir of dirs) {
        let files;
        try { files = await fs.readdir(dir); } catch { continue; }

        for (const f of files) {
            if (!f.endsWith('.json') || f.startsWith('._')) continue;
            const ticker = toSafeTicker(path.basename(f, '.json').split('_')[0]);
            if (!ticker || seen.has(ticker)) continue;
            seen.add(ticker);
            try {
                const payload = await fs.readJson(path.join(dir, f));
                if (!Array.isArray(payload.data) || payload.data.length === 0) continue;
                payload.ticker = ticker;
                payload.name = ticker;
                saveDataset(payload);
                console.log(`DB: migrated ${ticker} (${payload.data.length} rows)`);
            } catch (e) {
                console.warn(`DB: failed to migrate ${f}: ${e.message}`);
            }
        }
    }
}

// Called on startup — runs migration, then no-ops on subsequent starts
async function normalizeStableDatasets() {
    await migrateJsonFilesToDb();
}

// ─── exports ─────────────────────────────────────────────────────────────────

module.exports = {
    listDatasets,
    getDataset,
    getDatasetMetadata,
    saveDataset,
    mergeOhlcRows,
    deleteDataset,
    datasetExists,
    updateDatasetMetadata,
    getLastDateFromDataset,
    normalizeStableDatasets,
    migrateJsonFilesToDb,
};
