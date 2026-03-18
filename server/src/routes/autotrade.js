const express = require('express');
const router = express.Router();
const {
    autoTradeState,
    evaluateAutoTradeCycle,
    executeAutoTradeCycle,
    getAutoTradeConfig,
    updateAutoTradeConfig,
    getWebullConnectionSummary,
    getWebullAccountSnapshot,
    getWebullDashboardSnapshot,
    getExecutionLogs,
    closeWebullPositionMarket,
    buyWebullTestMarket,
    createAccessToken,
    checkAccessToken,
} = require('../services/autotrade');

router.get('/autotrade/config', async (req, res) => {
    try {
        const [config, webull] = await Promise.all([
            getAutoTradeConfig(),
            getWebullConnectionSummary()
        ]);
        res.json({ config, webull, state: autoTradeState });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to read autotrade config' });
    }
});

router.patch('/autotrade/config', async (req, res) => {
    try {
        const config = await updateAutoTradeConfig(req.body || {});
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to update autotrade config' });
    }
});

router.get('/autotrade/status', async (req, res) => {
    try {
        const evaluation = await evaluateAutoTradeCycle({ trigger: 'status' });
        const webull = await getWebullConnectionSummary();
        res.json({ evaluation, webull, state: autoTradeState });
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to evaluate autotrade status' });
    }
});

router.post('/autotrade/evaluate', async (req, res) => {
    try {
        const evaluation = await evaluateAutoTradeCycle({ trigger: 'manual_evaluate' });
        res.json(evaluation);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to evaluate autotrade cycle' });
    }
});

router.post('/autotrade/execute', async (req, res) => {
    try {
        const result = await executeAutoTradeCycle({ trigger: 'manual_execute' });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to execute autotrade cycle' });
    }
});

router.get('/autotrade/webull/account', async (req, res) => {
    try {
        const snapshot = await getWebullAccountSnapshot();
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to fetch Webull account snapshot' });
    }
});

router.get('/autotrade/webull/dashboard', async (req, res) => {
    try {
        const forceRefresh = String(req.query?.refresh || '') === '1';
        const snapshot = await getWebullDashboardSnapshot({}, { forceRefresh });
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to fetch Webull dashboard snapshot' });
    }
});

router.get('/autotrade/logs', async (req, res) => {
    try {
        const requestedLimit = Number(req.query?.limit);
        const limit = Number.isFinite(requestedLimit) ? requestedLimit : 200;
        const snapshot = await getExecutionLogs(limit);
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to fetch autotrade logs' });
    }
});

router.post('/autotrade/webull/close-position', async (req, res) => {
    try {
        const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol : '';
        const result = await closeWebullPositionMarket(symbol, { source: 'api_manual_close_position' });
        res.json({ success: true, clientOrderId: result.clientOrderId || result.order?.client_order_id || null, result });
    } catch (error) {
        const message = error && error.message ? error.message : 'Failed to close Webull position';
        const status = /invalid symbol|no broker position|pending exit order/i.test(message) ? 400 : 500;
        res.status(status).json({ error: message });
    }
});

router.post('/autotrade/webull/test-buy', async (req, res) => {
    try {
        const symbol = typeof req.body?.symbol === 'string' && req.body.symbol.trim() ? req.body.symbol.trim() : 'AAPL';
        const requestedQuantity = req.body?.quantity;
        const quantity = Number.isFinite(Number(requestedQuantity)) ? Number(requestedQuantity) : 1;
        const result = await buyWebullTestMarket(symbol, quantity, { source: 'api_manual_test_buy' });
        res.json({ success: true, clientOrderId: result.clientOrderId || result.order?.client_order_id || null, result });
    } catch (error) {
        const message = error && error.message ? error.message : 'Failed to submit Webull test buy';
        const response = error && error.response ? error.response : null;
        const status = /market|session|outside|after-hours|after hours/i.test(message) ? 409 : 500;
        res.status(status).json({ error: message, response });
    }
});

router.post('/autotrade/webull/token/create', async (req, res) => {
    try {
        const token = await createAccessToken();
        res.json(token.data);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to create Webull token' });
    }
});

router.post('/autotrade/webull/token/check', async (req, res) => {
    try {
        const token = typeof req.body?.token === 'string' ? req.body.token : '';
        const result = await checkAccessToken(token);
        res.json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Failed to check Webull token' });
    }
});

module.exports = router;
