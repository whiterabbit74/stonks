/**
 * Status route
 */
const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Trading Backtester API is running',
        timestamp: new Date().toISOString(),
        buildId: process.env.BUILD_ID || null
    });
});

module.exports = router;
