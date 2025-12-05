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

module.exports = router;
