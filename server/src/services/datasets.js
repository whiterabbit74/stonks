/**
 * Dataset file operations service
 */
const path = require('path');
const fs = require('fs-extra');
const { DATASETS_DIR, KEEP_DATASETS_DIR } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

function listDatasetFilesSync() {
    try {
        const main = fs
            .readdirSync(DATASETS_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('._'));
        let keep = [];
        try {
            keep = fs.readdirSync(KEEP_DATASETS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('._'));
        } catch { }
        const byUpper = new Map();
        for (const f of keep) byUpper.set(f.toUpperCase(), path.join(KEEP_DATASETS_DIR, f));
        for (const f of main) byUpper.set(f.toUpperCase(), path.join(DATASETS_DIR, f));
        return Array.from(byUpper.values()).map(p => path.basename(p));
    } catch {
        return [];
    }
}

function resolveDatasetFilePathById(id) {
    const ticker = toSafeTicker((id || '').toString());
    if (!ticker) return null;
    const stableMain = path.join(DATASETS_DIR, `${ticker}.json`);
    const stableKeep = path.join(KEEP_DATASETS_DIR, `${ticker}.json`);
    try { if (fs.existsSync(stableMain)) return stableMain; } catch { }
    try { if (fs.existsSync(stableKeep)) return stableKeep; } catch { }
    try {
        const files = listDatasetFilesSync();
        const legacy = files
            .filter(f => f.toUpperCase().startsWith(`${ticker}_`) && !f.startsWith('._'))
            .sort();
        if (legacy.length > 0) {
            const chosen = legacy[legacy.length - 1];
            const mainPath = path.join(DATASETS_DIR, chosen);
            const keepPath = path.join(KEEP_DATASETS_DIR, chosen);
            try { if (fs.existsSync(mainPath)) return mainPath; } catch { }
            try { if (fs.existsSync(keepPath)) return keepPath; } catch { }
        }
    } catch { }
    return stableMain;
}

async function writeDatasetToTickerFile(dataset) {
    const ticker = toSafeTicker(dataset.ticker);
    const targetPath = path.join(DATASETS_DIR, `${ticker}.json`);
    try {
        const files = await fs.readdir(DATASETS_DIR);
        await Promise.all(files
            .filter(f => f.toUpperCase().startsWith(`${ticker}_`))
            .map(f => fs.remove(path.join(DATASETS_DIR, f)).catch((err) => {
                console.warn(`Failed to delete file ${f}:`, err.message);
            }))
        );
    } catch { }
    const { splits: _dropSplits, ...clean } = (dataset || {});
    await fs.writeJson(targetPath, clean, { spaces: 2 });
    return { ticker, targetPath };
}

function normalizeStableDatasetsSync() {
    try {
        const left = fs.readdirSync(DATASETS_DIR).filter(f => f.endsWith('.json'));
        const byTicker = new Map();
        for (const f of left) {
            const base = path.basename(f, '.json');
            const ticker = toSafeTicker(base.split('_')[0]);
            if (!ticker) continue;
            if (!byTicker.has(ticker)) byTicker.set(ticker, []);
            byTicker.get(ticker).push(f);
        }
        for (const [ticker, arr] of byTicker.entries()) {
            const stablePath = path.join(DATASETS_DIR, `${ticker}.json`);
            const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
            const hasStable = arr.some(f => f.toUpperCase() === `${ticker}.JSON`);
            if (!hasStable) {
                const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
                const sourceMain = path.join(DATASETS_DIR, chosen);
                const sourceKeep = path.join(KEEP_DATASETS_DIR, chosen);
                const source = (fs.existsSync(sourceMain) ? sourceMain : (fs.existsSync(sourceKeep) ? sourceKeep : sourceMain));
                try {
                    const payload = fs.readJsonSync(source);
                    if (payload) {
                        payload.name = ticker;
                        payload.ticker = ticker;
                        fs.writeJsonSync(stablePath, payload, { spaces: 2 });
                    } else {
                        fs.copySync(source, stablePath, { overwrite: true });
                    }
                    console.log(`Normalized dataset for ${ticker} → ${path.basename(stablePath)}`);
                } catch (e) {
                    console.warn(`Failed to normalize ${ticker}: ${e.message}`);
                }
            } else {
                try {
                    const payload = fs.readJsonSync(stablePath);
                    let mutated = false;
                    if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
                    if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
                    if (mutated) fs.writeJsonSync(stablePath, payload, { spaces: 2 });
                } catch { }
            }
            for (const f of arr) {
                const full = path.join(DATASETS_DIR, f);
                if (full === stablePath) continue;
                try { fs.removeSync(full); } catch { }
            }
        }
    } catch (e) {
        console.warn('Normalization skipped:', e.message);
    }
}

function migrateLegacyDatasetsSync() {
    try {
        const files = listDatasetFilesSync();
        if (!files || files.length === 0) return;
        const byTicker = new Map();
        for (const f of files) {
            const base = path.basename(f, '.json');
            const ticker = toSafeTicker(base.split('_')[0]);
            if (!ticker) continue;
            if (!byTicker.has(ticker)) byTicker.set(ticker, []);
            byTicker.get(ticker).push(f);
        }
        for (const [ticker, arr] of byTicker.entries()) {
            const target = path.join(DATASETS_DIR, `${ticker}.json`);
            if (fs.pathExistsSync(target)) {
                for (const f of arr) {
                    if (f.toUpperCase() === `${ticker}.JSON`) continue;
                    try { fs.removeSync(path.join(DATASETS_DIR, f)); } catch { }
                }
                try {
                    const payload = fs.readJsonSync(target);
                    let mutated = false;
                    if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
                    if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
                    if (mutated) fs.writeJsonSync(target, payload, { spaces: 2 });
                } catch { }
                continue;
            }
            const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
            const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
            const sourceMain = path.join(DATASETS_DIR, chosen);
            const sourceKeep = path.join(KEEP_DATASETS_DIR, chosen);
            const source = (fs.existsSync(sourceMain) ? sourceMain : (fs.existsSync(sourceKeep) ? sourceKeep : sourceMain));
            try {
                const payload = fs.readJsonSync(source);
                if (payload) {
                    payload.name = ticker;
                    payload.ticker = ticker;
                    fs.writeJsonSync(target, payload, { spaces: 2 });
                } else {
                    fs.copySync(source, target, { overwrite: true });
                }
            } catch {
                try { fs.copySync(source, target, { overwrite: true }); } catch { }
            }
            for (const f of arr) {
                const p = path.join(DATASETS_DIR, f);
                if (p === target) continue;
                try { fs.removeSync(p); } catch { }
            }
            console.log(`Migrated dataset files for ${ticker} → ${path.basename(target)}`);
        }
    } catch (e) {
        console.warn('Dataset migration skipped:', e.message);
    }
}

function getLastDateFromDataset(dataset) {
    if (!dataset || !Array.isArray(dataset.data) || !dataset.data.length) {
        return dataset?.dateRange?.to ? dataset.dateRange.to.slice(0, 10) : null;
    }
    const lastBar = dataset.data[dataset.data.length - 1];
    if (!lastBar || !lastBar.date) return null;
    if (typeof lastBar.date === 'string') {
        return lastBar.date.slice(0, 10);
    }
    try {
        return new Date(lastBar.date).toISOString().slice(0, 10);
    } catch {
        return null;
    }
}

module.exports = {
    listDatasetFilesSync,
    resolveDatasetFilePathById,
    writeDatasetToTickerFile,
    normalizeStableDatasetsSync,
    migrateLegacyDatasetsSync,
    getLastDateFromDataset,
};
