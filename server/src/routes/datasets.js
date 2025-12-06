/**
 * Datasets routes
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const multer = require('multer');
const { DATASETS_DIR, KEEP_DATASETS_DIR } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const {
    listDatasetFilesSync,
    resolveDatasetFilePathById,
    writeDatasetToTickerFile,
    getLastDateFromDataset
} = require('../services/datasets');
const { getTickerSplits } = require('../services/splits');
const { readSettings } = require('../services/settings');
const { fetchFromAlphaVantage } = require('../providers/alphaVantage');
const { fetchFromFinnhub } = require('../providers/finnhub');
const { fetchFromTwelveData } = require('../providers/twelveData');

// Multer upload config
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

// List all datasets
router.get('/datasets', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        const datasets = [];
        const mainFiles = await fs.readdir(DATASETS_DIR).catch(() => []);
        const mainPaths = mainFiles
            .filter(f => f.endsWith('.json') && !f.startsWith('._'))
            .map(f => path.join(DATASETS_DIR, f));
        const keepFiles = await fs.readdir(KEEP_DATASETS_DIR).catch(() => []);
        const keepPaths = keepFiles
            .filter(f => f.endsWith('.json') && !f.startsWith('._'))
            .map(f => path.join(KEEP_DATASETS_DIR, f));

        const seen = new Set();
        const allPaths = [...mainPaths, ...keepPaths];

        for (const fullPath of allPaths) {
            const baseName = path.basename(fullPath, '.json').toUpperCase();
            if (seen.has(baseName)) continue;
            seen.add(baseName);

            try {
                const data = await fs.readJson(fullPath);
                datasets.push({
                    id: toSafeTicker(data.ticker || data.name || baseName),
                    name: data.name || baseName,
                    ticker: data.ticker || baseName,
                    dataPoints: data.dataPoints || (data.data ? data.data.length : 0),
                    dateRange: data.dateRange || {},
                    uploadDate: data.uploadDate || null,
                });
            } catch (e) {
                console.warn(`Failed to read dataset ${fullPath}:`, e.message);
            }
        }

        res.json(datasets);
    } catch (e) {
        console.error('Failed to list datasets:', e);
        res.status(500).json({ error: 'Failed to list datasets' });
    }
});

// Get single dataset
router.get('/datasets/:id', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const filePath = resolveDatasetFilePathById(id);
        if (!filePath || !(await fs.pathExists(filePath))) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const data = await fs.readJson(filePath);
        const splits = await getTickerSplits(id);

        res.json({ ...data, splits });
    } catch (e) {
        console.error('Failed to get dataset:', e);
        res.status(500).json({ error: 'Failed to get dataset' });
    }
});

// Get dataset metadata only
router.get('/datasets/:id/metadata', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const filePath = resolveDatasetFilePathById(id);
        if (!filePath || !(await fs.pathExists(filePath))) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const data = await fs.readJson(filePath);
        const splits = await getTickerSplits(id);

        res.json({
            id,
            name: data.name,
            ticker: data.ticker,
            dataPoints: data.dataPoints || (data.data ? data.data.length : 0),
            dateRange: data.dateRange,
            uploadDate: data.uploadDate,
            lastDate: getLastDateFromDataset(data),
            splits
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to get dataset metadata' });
    }
});

// Upload dataset
router.post('/datasets', upload.single('file'), async (req, res) => {
    try {
        let payload;

        if (req.file) {
            payload = JSON.parse(req.file.buffer.toString('utf-8'));
        } else if (req.body && (req.body.data || req.body.ticker)) {
            payload = req.body;
        } else {
            return res.status(400).json({ error: 'No data provided' });
        }

        const ticker = toSafeTicker(payload.ticker || payload.name);
        if (!ticker) return res.status(400).json({ error: 'Invalid ticker' });

        payload.ticker = ticker;
        payload.name = ticker;
        payload.uploadDate = new Date().toISOString();

        if (Array.isArray(payload.data)) {
            payload.dataPoints = payload.data.length;
            if (payload.data.length > 0) {
                const sorted = [...payload.data].sort((a, b) => new Date(a.date) - new Date(b.date));
                payload.dateRange = {
                    from: sorted[0].date,
                    to: sorted[sorted.length - 1].date
                };
            }
        }

        const { targetPath } = await writeDatasetToTickerFile(payload);

        res.json({
            success: true,
            id: ticker,
            ticker,
            dataPoints: payload.dataPoints || 0,
            path: targetPath
        });
    } catch (e) {
        console.error('Failed to upload dataset:', e);
        res.status(500).json({ error: e.message || 'Failed to upload dataset' });
    }
});

// Update dataset
router.put('/datasets/:id', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const filePath = resolveDatasetFilePathById(id);
        const existing = filePath && await fs.pathExists(filePath)
            ? await fs.readJson(filePath)
            : {};

        const payload = { ...existing, ...req.body };
        payload.ticker = id;
        payload.name = id;
        payload.uploadDate = new Date().toISOString();

        if (Array.isArray(payload.data)) {
            payload.dataPoints = payload.data.length;
            if (payload.data.length > 0) {
                const sorted = [...payload.data].sort((a, b) => new Date(a.date) - new Date(b.date));
                payload.dateRange = {
                    from: sorted[0].date,
                    to: sorted[sorted.length - 1].date
                };
            }
        }

        await writeDatasetToTickerFile(payload);

        res.json({ success: true, id, dataPoints: payload.dataPoints || 0 });
    } catch (e) {
        console.error('Failed to update dataset:', e);
        res.status(500).json({ error: 'Failed to update dataset' });
    }
});

// Delete dataset
router.delete('/datasets/:id', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const filePath = resolveDatasetFilePathById(id);
        if (filePath && await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }

        res.json({ success: true, id });
    } catch (e) {
        console.error('Failed to delete dataset:', e);
        res.status(500).json({ error: 'Failed to delete dataset' });
    }
});

// ============================================
// RESTORED ENDPOINTS (lost during refactoring)
// ============================================

// Refresh dataset from provider
router.post('/datasets/:id/refresh', async (req, res) => {
    try {
        const { id } = req.params;
        const settings = await readSettings().catch((err) => {
            console.warn('Failed to read settings, using defaults:', err.message);
            return {};
        });
        const reqProvider = (req.query && typeof req.query.provider === 'string') ? req.query.provider : null;

        const filePath = resolveDatasetFilePathById(id);
        if (!filePath || !await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Dataset not found' });
        }
        const dataset = await fs.readJson(filePath);
        const ticker = toSafeTicker(dataset.ticker || id);
        if (!ticker) return res.status(400).json({ error: 'Ticker not defined in dataset' });

        // Normalize date to YYYY-MM-DD key consistently
        const toDateKey = (d) => {
            try {
                if (typeof d === 'string') return d.slice(0, 10);
                return new Date(d).toISOString().slice(0, 10);
            } catch { return ''; }
        };

        // Determine tail window: use last date from existing data
        const lastExistingDate = (() => {
            if (dataset && Array.isArray(dataset.data) && dataset.data.length) {
                const lastBar = dataset.data[dataset.data.length - 1];
                return toDateKey(lastBar && lastBar.date);
            }
            const drTo = dataset && dataset.dateRange && dataset.dateRange.to;
            return toDateKey(drTo);
        })();
        if (!lastExistingDate) return res.status(400).json({ error: 'Dataset has no last date' });

        const last = new Date(`${lastExistingDate}T00:00:00.000Z`);
        const start = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - 7, 0, 0, 0));
        const startTs = Math.floor(start.getTime() / 1000);
        const endTs = Math.floor(Date.now() / 1000);

        let rows = [];
        const provider = (reqProvider === 'alpha_vantage' || reqProvider === 'finnhub' || reqProvider === 'twelve_data')
            ? reqProvider
            : (settings && (settings.resultsRefreshProvider === 'alpha_vantage' || settings.resultsRefreshProvider === 'finnhub' || settings.resultsRefreshProvider === 'twelve_data')
                ? settings.resultsRefreshProvider
                : 'finnhub');

        if (provider === 'finnhub') {
            const fh = await fetchFromFinnhub(ticker, startTs, endTs);
            rows = (Array.isArray(fh) ? fh : []).map(r => ({
                date: r.date,
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
                volume: Number(r.volume) || 0,
            }));
        } else if (provider === 'twelve_data') {
            const td = await fetchFromTwelveData(ticker, startTs, endTs);
            rows = (Array.isArray(td) ? td : []).map(r => ({
                date: r.date,
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
                volume: Number(r.volume) || 0,
            }));
        } else {
            const av = await fetchFromAlphaVantage(ticker, startTs, endTs, { adjustment: 'none' });
            const base = Array.isArray(av) ? av : (av && av.data) || [];
            rows = base.map(r => ({
                date: r.date,
                open: r.open,
                high: r.high,
                low: r.low,
                close: r.close,
                adjClose: r.adjClose ?? r.close,
                volume: r.volume || 0,
            }));
        }

        // Merge with de-duplication by date key
        const mergedByDate = new Map();
        for (const b of (dataset.data || [])) {
            const key = toDateKey(b && b.date);
            if (!key) continue;
            mergedByDate.set(key, {
                date: key,
                open: Number(b.open),
                high: Number(b.high),
                low: Number(b.low),
                close: Number(b.close),
                adjClose: (b.adjClose != null ? Number(b.adjClose) : Number(b.close)),
                volume: Number(b.volume) || 0,
            });
        }
        for (const r of rows) {
            const key = toDateKey(r && r.date);
            if (!key) continue;
            mergedByDate.set(key, {
                date: key,
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
                volume: Number(r.volume) || 0,
            });
        }

        const mergedArray = Array.from(mergedByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        const prevCount = (dataset.data || []).length;

        dataset.data = mergedArray;
        dataset.dataPoints = mergedArray.length;
        dataset.dateRange = {
            from: toDateKey(mergedArray[0]?.date),
            to: toDateKey(mergedArray[mergedArray.length - 1]?.date),
        };
        dataset.uploadDate = new Date().toISOString();
        dataset.name = ticker;

        const { targetPath } = await writeDatasetToTickerFile(dataset);
        const added = mergedArray.length - prevCount;
        console.log(`Dataset refreshed: ${ticker} (+${added}) -> ${targetPath}`);
        return res.json({ success: true, id: ticker, added, to: dataset.dateRange.to, provider });
    } catch (error) {
        console.error('Error refreshing dataset:', error);
        const msg = error && error.message ? error.message : 'Failed to refresh dataset';
        res.status(500).json({ error: msg });
    }
});

// Apply splits to dataset and persist adjusted data
router.post('/datasets/:id/apply-splits', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = resolveDatasetFilePathById(id);
        if (!filePath || !await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Dataset not found' });
        }
        const dataset = await fs.readJson(filePath);
        const ticker = toSafeTicker(dataset.ticker || id);
        if (!ticker) return res.status(400).json({ error: 'Ticker not defined in dataset' });

        const toDateKey = (d) => {
            try {
                if (typeof d === 'string') return d.slice(0, 10);
                return new Date(d).toISOString().slice(0, 10);
            } catch { return ''; }
        };

        const events = await getTickerSplits(ticker);
        const data = Array.isArray(dataset.data) ? dataset.data : [];
        const normalized = data.map(b => ({
            date: toDateKey(b.date),
            open: Number(b.open),
            high: Number(b.high),
            low: Number(b.low),
            close: Number(b.close),
            adjClose: (b.adjClose != null ? Number(b.adjClose) : Number(b.close)),
            volume: Number(b.volume) || 0,
        })).filter(b => !!b.date);

        if (Array.isArray(events) && events.length > 0) {
            const splits = events
                .filter(e => e && typeof e.date === 'string' && typeof e.factor === 'number' && isFinite(e.factor) && e.factor > 0 && e.factor !== 1)
                .sort((a, b) => a.date.localeCompare(b.date));

            if (splits.length > 0) {
                const adjusted = normalized.map(bar => ({ ...bar }));
                for (let i = 0; i < adjusted.length; i++) {
                    const t = new Date(`${adjusted[i].date}T00:00:00.000Z`).getTime();
                    let cumulative = 1;
                    for (let k = 0; k < splits.length; k++) {
                        const et = new Date(`${splits[k].date}T00:00:00.000Z`).getTime();
                        if (t < et) cumulative *= Number(splits[k].factor);
                    }
                    if (cumulative !== 1) {
                        adjusted[i].open = adjusted[i].open / cumulative;
                        adjusted[i].high = adjusted[i].high / cumulative;
                        adjusted[i].low = adjusted[i].low / cumulative;
                        adjusted[i].close = adjusted[i].close / cumulative;
                        adjusted[i].adjClose = (adjusted[i].adjClose != null ? adjusted[i].adjClose : adjusted[i].close) / cumulative;
                        adjusted[i].volume = Math.round(adjusted[i].volume * cumulative);
                    }
                }
                dataset.data = adjusted;
                dataset.dataPoints = adjusted.length;
                dataset.dateRange = { from: adjusted[0].date, to: adjusted[adjusted.length - 1].date };
                dataset.adjustedForSplits = true;
            } else {
                dataset.data = normalized;
                dataset.dataPoints = normalized.length;
                dataset.dateRange = normalized.length ? { from: normalized[0].date, to: normalized[normalized.length - 1].date } : { from: null, to: null };
                delete dataset.adjustedForSplits;
            }
        } else {
            dataset.data = normalized;
            dataset.dataPoints = normalized.length;
            dataset.dateRange = normalized.length ? { from: normalized[0].date, to: normalized[normalized.length - 1].date } : { from: null, to: null };
            delete dataset.adjustedForSplits;
        }

        dataset.uploadDate = new Date().toISOString();
        dataset.name = ticker;
        const { targetPath } = await writeDatasetToTickerFile(dataset);
        console.log(`Dataset adjusted for splits: ${ticker} -> ${targetPath}`);
        return res.json({ success: true, id: ticker, message: 'Датасет пересчитан с учётом сплитов' });
    } catch (e) {
        return res.status(500).json({ error: e && e.message ? e.message : 'Failed to apply splits' });
    }
});

// Update dataset metadata (tag, companyName)
router.patch('/datasets/:id/metadata', async (req, res) => {
    try {
        const { id } = req.params;
        const filePath = resolveDatasetFilePathById(id);
        if (!filePath || !await fs.pathExists(filePath)) {
            return res.status(404).json({ error: 'Dataset not found' });
        }

        const dataset = await fs.readJson(filePath);
        const { tag, companyName } = req.body || {};

        if (tag !== undefined) {
            dataset.tag = typeof tag === 'string' ? tag.trim() : undefined;
        }
        if (companyName !== undefined) {
            dataset.companyName = typeof companyName === 'string' ? companyName.trim() : undefined;
        }

        await fs.writeJson(filePath, dataset, { spaces: 2 });
        console.log(`Dataset metadata updated: ${id}`);
        return res.json({ success: true, message: 'Метаданные датасета обновлены' });
    } catch (e) {
        console.error('Failed to update dataset metadata:', e);
        return res.status(500).json({ error: e && e.message ? e.message : 'Failed to update dataset metadata' });
    }
});

module.exports = router;
