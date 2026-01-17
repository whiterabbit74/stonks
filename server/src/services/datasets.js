/**
 * Dataset file operations service
 */
const path = require('path');
const fs = require('fs-extra');
const { DATASETS_DIR, KEEP_DATASETS_DIR } = require('../config');
const { toSafeTicker } = require('../utils/helpers');

async function listDatasetFiles() {
    try {
        const [mainFiles, keepFiles] = await Promise.all([
            fs.readdir(DATASETS_DIR).catch(() => []),
            fs.readdir(KEEP_DATASETS_DIR).catch(() => [])
        ]);

        const main = mainFiles.filter(f => f.endsWith('.json') && !f.startsWith('._'));
        const keep = keepFiles.filter(f => f.endsWith('.json') && !f.startsWith('._'));

        const byUpper = new Map();
        for (const f of keep) byUpper.set(f.toUpperCase(), path.join(KEEP_DATASETS_DIR, f));
        for (const f of main) byUpper.set(f.toUpperCase(), path.join(DATASETS_DIR, f));
        return Array.from(byUpper.values()).map(p => path.basename(p));
    } catch {
        return [];
    }
}

async function resolveDatasetFilePathByIdAsync(id) {
    const ticker = toSafeTicker((id || '').toString());
    if (!ticker) return null;
    const stableMain = path.join(DATASETS_DIR, `${ticker}.json`);
    const stableKeep = path.join(KEEP_DATASETS_DIR, `${ticker}.json`);
    if (await fs.pathExists(stableMain)) return stableMain;
    if (await fs.pathExists(stableKeep)) return stableKeep;
    try {
        const files = await listDatasetFiles();
        const legacy = files
            .filter(f => f.toUpperCase().startsWith(`${ticker}_`) && !f.startsWith('._'))
            .sort();
        if (legacy.length > 0) {
            const chosen = legacy[legacy.length - 1];
            const mainPath = path.join(DATASETS_DIR, chosen);
            const keepPath = path.join(KEEP_DATASETS_DIR, chosen);
            if (await fs.pathExists(mainPath)) return mainPath;
            if (await fs.pathExists(keepPath)) return keepPath;
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

async function normalizeStableDatasets() {
    try {
        const left = (await fs.readdir(DATASETS_DIR).catch(() => []))
            .filter(f => f.endsWith('.json'));

        const byTicker = new Map();
        for (const f of left) {
            const base = path.basename(f, '.json');
            const ticker = toSafeTicker(base.split('_')[0]);
            if (!ticker) continue;
            if (!byTicker.has(ticker)) byTicker.set(ticker, []);
            byTicker.get(ticker).push(f);
        }

        const entries = Array.from(byTicker.entries());

        // Process sequentially to avoid too many open files if datasets are many
        // But for performance, we can do some parallelism or just keep it simple as it is startup.
        // Sequential is safer for fs operations on many files.
        for (const [ticker, arr] of entries) {
            const stablePath = path.join(DATASETS_DIR, `${ticker}.json`);
            const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
            const hasStable = arr.some(f => f.toUpperCase() === `${ticker}.JSON`);
            if (!hasStable) {
                const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
                const sourceMain = path.join(DATASETS_DIR, chosen);
                const sourceKeep = path.join(KEEP_DATASETS_DIR, chosen);

                let source = sourceMain;
                if (await fs.pathExists(sourceMain)) {
                    source = sourceMain;
                } else if (await fs.pathExists(sourceKeep)) {
                    source = sourceKeep;
                }

                try {
                    const payload = await fs.readJson(source).catch(() => null);
                    if (payload) {
                        payload.name = ticker;
                        payload.ticker = ticker;
                        await fs.writeJson(stablePath, payload, { spaces: 2 });
                    } else {
                        await fs.copy(source, stablePath, { overwrite: true });
                    }
                    console.log(`Normalized dataset for ${ticker} → ${path.basename(stablePath)}`);
                } catch (e) {
                    console.warn(`Failed to normalize ${ticker}: ${e.message}`);
                }
            } else {
                try {
                    const payload = await fs.readJson(stablePath).catch(() => null);
                    let mutated = false;
                    if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
                    if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
                    if (mutated) await fs.writeJson(stablePath, payload, { spaces: 2 });
                } catch { }
            }

            // Cleanup legacy files
            await Promise.all(arr.map(f => {
                const full = path.join(DATASETS_DIR, f);
                if (full === stablePath) return Promise.resolve();
                return fs.remove(full).catch(() => {});
            }));
        }
    } catch (e) {
        console.warn('Normalization skipped:', e.message);
    }
}

async function migrateLegacyDatasets() {
    try {
        const files = await listDatasetFiles();
        if (!files || files.length === 0) return;

        const byTicker = new Map();
        for (const f of files) {
            const base = path.basename(f, '.json');
            const ticker = toSafeTicker(base.split('_')[0]);
            if (!ticker) continue;
            if (!byTicker.has(ticker)) byTicker.set(ticker, []);
            byTicker.get(ticker).push(f);
        }

        const entries = Array.from(byTicker.entries());

        for (const [ticker, arr] of entries) {
            const target = path.join(DATASETS_DIR, `${ticker}.json`);
            if (await fs.pathExists(target)) {
                // If stable exists, delete legacy files
                await Promise.all(arr.map(f => {
                    if (f.toUpperCase() === `${ticker}.JSON`) return Promise.resolve();
                    return fs.remove(path.join(DATASETS_DIR, f)).catch(() => {});
                }));

                try {
                    const payload = await fs.readJson(target).catch(() => null);
                    let mutated = false;
                    if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
                    if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
                    if (mutated) await fs.writeJson(target, payload, { spaces: 2 });
                } catch { }
                continue;
            }

            const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
            const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
            const sourceMain = path.join(DATASETS_DIR, chosen);
            const sourceKeep = path.join(KEEP_DATASETS_DIR, chosen);

            let source = sourceMain;
            if (await fs.pathExists(sourceMain)) {
                source = sourceMain;
            } else if (await fs.pathExists(sourceKeep)) {
                source = sourceKeep;
            }

            try {
                const payload = await fs.readJson(source).catch(() => null);
                if (payload) {
                    payload.name = ticker;
                    payload.ticker = ticker;
                    await fs.writeJson(target, payload, { spaces: 2 });
                } else {
                    await fs.copy(source, target, { overwrite: true });
                }
            } catch {
                try { await fs.copy(source, target, { overwrite: true }); } catch { }
            }

            // Remove old files
            await Promise.all(arr.map(f => {
                const p = path.join(DATASETS_DIR, f);
                if (p === target) return Promise.resolve();
                return fs.remove(p).catch(() => {});
            }));

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
    listDatasetFiles,
    resolveDatasetFilePathByIdAsync,
    writeDatasetToTickerFile,
    normalizeStableDatasets,
    migrateLegacyDatasets,
    getLastDateFromDataset,
};
