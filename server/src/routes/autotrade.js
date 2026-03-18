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

function formatWebullError(error, fallbackMessage) {
    const response = error && error.response ? error.response : null;
    const errorCode = error && (error.errorCode || (response && (response.error_code || response.errorCode || response.code)) || null);
    const errorMsg = error && (error.errorMsg || (response && (response.message || response.msg || response.error_msg || response.error)) || null);
    const requestId = error && (error.requestId || (response && (response.request_id || response.requestId)) || null);
    const message = errorCode && errorMsg
        ? `${errorCode}: ${errorMsg}`
        : (errorMsg || (error && error.message) || fallbackMessage);
    return { message, errorCode, errorMsg, requestId, response };
}

function resolveWebullHttpStatus(error, message, defaultStatus = 502) {
    if (error && error.status) {
        if ([400, 401, 403, 404, 409, 422, 429].includes(error.status)) {
            return error.status;
        }
        if (error.status >= 500) {
            return 502;
        }
    }
    if (/invalid symbol|quantity must be|missing|credentials|account id/i.test(message)) {
        return 400;
    }
    if (/market|session|outside|after-hours|after hours|closed/i.test(message)) {
        return 409;
    }
    if (error && error.response) {
        return 502;
    }
    return defaultStatus;
}

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
        const formatted = formatWebullError(error, 'Failed to close Webull position');
        const status = resolveWebullHttpStatus(error, formatted.message, 502);
        res.status(status).json({
            error: formatted.message,
            errorCode: formatted.errorCode,
            errorMsg: formatted.errorMsg,
            requestId: formatted.requestId,
            response: formatted.response,
            status,
        });
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
        const formatted = formatWebullError(error, 'Failed to submit Webull test buy');
        const status = resolveWebullHttpStatus(error, formatted.message, 502);
        res.status(status).json({
            error: formatted.message,
            errorCode: formatted.errorCode,
            errorMsg: formatted.errorMsg,
            requestId: formatted.requestId,
            response: formatted.response,
            status,
        });
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
