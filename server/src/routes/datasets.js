/**
 * Datasets routes
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { toSafeTicker } = require('../utils/helpers');
const {
    listDatasets,
    getDataset,
    getDatasetMetadata,
    saveDataset,
    mergeOhlcRows,
    deleteDataset,
    datasetExists,
    updateDatasetMetadata,
    getLastDateFromDataset,
} = require('../services/datasets');
const { getTickerSplits } = require('../services/splits');
const { readSettings } = require('../services/settings');
const { fetchFromAlphaVantage } = require('../providers/alphaVantage');
const { fetchFromFinnhub } = require('../providers/finnhub');
const { fetchFromTwelveData } = require('../providers/twelveData');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

const toDateKey = (d) => {
    try {
        if (typeof d === 'string') return d.slice(0, 10);
        return new Date(d).toISOString().slice(0, 10);
    } catch { return ''; }
};

// List all datasets (metadata only)
router.get('/datasets', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
        res.json(listDatasets());
    } catch (e) {
        console.error('Failed to list datasets:', e);
        res.status(500).json({ error: 'Failed to list datasets' });
    }
});

// Get single dataset with OHLC data
router.get('/datasets/:id', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const dataset = getDataset(id);
        if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

        const splits = await getTickerSplits(id);
        res.json({ ...dataset, splits });
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

        const meta = getDatasetMetadata(id);
        if (!meta) return res.status(404).json({ error: 'Dataset not found' });

        const dataset = getDataset(id);
        const splits = await getTickerSplits(id);
        res.json({ ...meta, lastDate: getLastDateFromDataset(dataset), splits });
    } catch (e) {
        res.status(500).json({ error: 'Failed to get dataset metadata' });
    }
});

// Upload / create dataset
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
                payload.dateRange = { from: sorted[0].date, to: sorted[sorted.length - 1].date };
            }
        }

        saveDataset(payload);
        res.json({ success: true, id: ticker, ticker, dataPoints: payload.dataPoints || 0 });
    } catch (e) {
        console.error('Failed to upload dataset:', e);
        res.status(500).json({ error: e.message || 'Failed to upload dataset' });
    }
});

// Replace dataset
router.put('/datasets/:id', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const existing = getDataset(id) || {};
        const payload = { ...existing, ...req.body };
        payload.ticker = id;
        payload.name = id;
        payload.uploadDate = new Date().toISOString();

        if (Array.isArray(payload.data)) {
            payload.dataPoints = payload.data.length;
            if (payload.data.length > 0) {
                const sorted = [...payload.data].sort((a, b) => new Date(a.date) - new Date(b.date));
                payload.dateRange = { from: sorted[0].date, to: sorted[sorted.length - 1].date };
            }
        }

        saveDataset(payload);
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
        deleteDataset(id);
        res.json({ success: true, id });
    } catch (e) {
        console.error('Failed to delete dataset:', e);
        res.status(500).json({ error: 'Failed to delete dataset' });
    }
});

// Refresh dataset from provider
router.post('/datasets/:id/refresh', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const meta = getDatasetMetadata(id);
        if (!meta) return res.status(404).json({ error: 'Dataset not found' });

        const ticker = meta.ticker;
        const lastExistingDate = meta.dateRange?.to || null;
        if (!lastExistingDate) return res.status(400).json({ error: 'Dataset has no last date' });

        const settings = await readSettings().catch(() => ({}));
        const reqProvider = typeof req.query?.provider === 'string' ? req.query.provider : null;
        const provider = ['alpha_vantage', 'finnhub', 'twelve_data'].includes(reqProvider)
            ? reqProvider
            : (['alpha_vantage', 'finnhub', 'twelve_data'].includes(settings.resultsRefreshProvider)
                ? settings.resultsRefreshProvider
                : 'finnhub');

        const last = new Date(`${lastExistingDate}T00:00:00.000Z`);
        const start = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - 7));
        const startTs = Math.floor(start.getTime() / 1000);
        const endTs = Math.floor(Date.now() / 1000);

        let rows = [];
        if (provider === 'finnhub') {
            const fh = await fetchFromFinnhub(ticker, startTs, endTs);
            rows = (Array.isArray(fh) ? fh : []).map(r => ({
                date: toDateKey(r.date), open: Number(r.open), high: Number(r.high),
                low: Number(r.low), close: Number(r.close),
                adjClose: r.adjClose != null ? Number(r.adjClose) : Number(r.close),
                volume: Number(r.volume) || 0,
            }));
        } else if (provider === 'twelve_data') {
            const td = await fetchFromTwelveData(ticker, startTs, endTs);
            rows = (Array.isArray(td) ? td : []).map(r => ({
                date: toDateKey(r.date), open: Number(r.open), high: Number(r.high),
                low: Number(r.low), close: Number(r.close),
                adjClose: r.adjClose != null ? Number(r.adjClose) : Number(r.close),
                volume: Number(r.volume) || 0,
            }));
        } else {
            const av = await fetchFromAlphaVantage(ticker, startTs, endTs, { adjustment: 'none' });
            const base = Array.isArray(av) ? av : (av?.data || []);
            rows = base.map(r => ({
                date: toDateKey(r.date), open: r.open, high: r.high, low: r.low,
                close: r.close, adjClose: r.adjClose ?? r.close, volume: r.volume || 0,
            }));
        }

        const added = mergeOhlcRows(ticker, rows);
        const updatedMeta = getDatasetMetadata(ticker);
        console.log(`Dataset refreshed: ${ticker} (+${added} new rows)`);
        return res.json({ success: true, id: ticker, added, to: updatedMeta?.dateRange?.to, provider });
    } catch (e) {
        console.error('Error refreshing dataset:', e);
        res.status(500).json({ error: e?.message || 'Failed to refresh dataset' });
    }
});

// Apply splits to dataset
router.post('/datasets/:id/apply-splits', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });

        const dataset = getDataset(id);
        if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

        const events = await getTickerSplits(id);
        const data = Array.isArray(dataset.data) ? dataset.data : [];

        const normalized = data.map(b => ({
            date: toDateKey(b.date), open: Number(b.open), high: Number(b.high),
            low: Number(b.low), close: Number(b.close),
            adjClose: b.adjClose != null ? Number(b.adjClose) : Number(b.close),
            volume: Number(b.volume) || 0,
        })).filter(b => !!b.date);

        if (Array.isArray(events) && events.length > 0) {
            const splits = events
                .filter(e => e && typeof e.date === 'string' && typeof e.factor === 'number'
                    && isFinite(e.factor) && e.factor > 0 && e.factor !== 1)
                .sort((a, b) => a.date.localeCompare(b.date));

            if (splits.length > 0) {
                for (let i = 0; i < normalized.length; i++) {
                    const t = new Date(`${normalized[i].date}T00:00:00.000Z`).getTime();
                    let cumulative = 1;
                    for (const sp of splits) {
                        if (t < new Date(`${sp.date}T00:00:00.000Z`).getTime()) cumulative *= Number(sp.factor);
                    }
                    if (cumulative !== 1) {
                        normalized[i].open /= cumulative;
                        normalized[i].high /= cumulative;
                        normalized[i].low /= cumulative;
                        normalized[i].close /= cumulative;
                        normalized[i].adjClose /= cumulative;
                        normalized[i].volume = Math.round(normalized[i].volume * cumulative);
                    }
                }
                dataset.adjustedForSplits = true;
            }
        }

        saveDataset({ ...dataset, data: normalized, uploadDate: new Date().toISOString() });
        console.log(`Dataset adjusted for splits: ${id}`);
        return res.json({ success: true, id, message: 'Датасет пересчитан с учётом сплитов' });
    } catch (e) {
        res.status(500).json({ error: e?.message || 'Failed to apply splits' });
    }
});

// Update dataset metadata (tag, companyName)
router.patch('/datasets/:id/metadata', async (req, res) => {
    try {
        const id = toSafeTicker(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid dataset ID' });
        if (!datasetExists(id)) return res.status(404).json({ error: 'Dataset not found' });

        const { tag, companyName } = req.body || {};
        updateDatasetMetadata(id, { tag, companyName });
        console.log(`Dataset metadata updated: ${id}`);
        return res.json({ success: true, message: 'Метаданные датасета обновлены' });
    } catch (e) {
        console.error('Failed to update dataset metadata:', e);
        res.status(500).json({ error: e?.message || 'Failed to update dataset metadata' });
    }
});

module.exports = router;
