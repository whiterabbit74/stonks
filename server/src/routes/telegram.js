/**
 * Telegram routes
 */
const express = require('express');
const router = express.Router();
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const { sendTelegramMessage, telegramWatches, scheduleSaveWatches } = require('../services/telegram');
const { buildTradeHistoryMessage } = require('../services/trades');

router.post('/telegram/watch', (req, res) => {
    try {
        const { symbol, highIBS, lowIBS = 0.1, thresholdPct = 0.3, chatId, entryPrice = null, isOpenPosition = true } = req.body || {};
        const safeSymbol = toSafeTicker(symbol);
        if (!safeSymbol || typeof highIBS !== 'number') {
            return res.status(400).json({ error: 'symbol and highIBS are required' });
        }
        const useChatId = chatId || getApiConfig().TELEGRAM_CHAT_ID;
        if (!useChatId) return res.status(400).json({ error: 'No Telegram chat id configured' });
        telegramWatches.set(safeSymbol, {
            symbol: safeSymbol,
            highIBS,
            lowIBS,
            thresholdPct,
            chatId: useChatId,
            entryPrice,
            entryDate: null,
            entryIBS: null,
            entryDecisionTime: null,
            currentTradeId: null,
            isOpenPosition,
            sent: { dateKey: null, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false }
        });
        scheduleSaveWatches();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to register watch' });
    }
});

router.delete('/telegram/watch/:symbol', (req, res) => {
    const sym = toSafeTicker(req.params.symbol || '');
    if (!sym) return res.status(400).json({ success: false, error: 'Invalid symbol' });
    telegramWatches.delete(sym);
    scheduleSaveWatches();
    res.json({ success: true });
});

router.patch('/telegram/watch/:symbol', (req, res) => {
    const sym = toSafeTicker(req.params.symbol || '');
    if (!sym) return res.status(400).json({ error: 'Invalid symbol' });
    const w = telegramWatches.get(sym);
    if (!w) return res.status(404).json({ error: 'Watch not found' });
    const { isOpenPosition, entryPrice } = req.body || {};
    if (typeof isOpenPosition === 'boolean') w.isOpenPosition = isOpenPosition;
    if (typeof entryPrice === 'number') w.entryPrice = entryPrice;
    scheduleSaveWatches();
    res.json({ success: true });
});

router.get('/telegram/watches', (req, res) => {
    const list = Array.from(telegramWatches.values());
    res.json({ watches: list, total: list.length });
});

router.post('/telegram/send', async (req, res) => {
    try {
        const { message, chatId } = req.body || {};
        const useChatId = chatId || getApiConfig().TELEGRAM_CHAT_ID;
        if (!useChatId) return res.status(400).json({ error: 'No chat id configured' });
        if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Message is required' });
        const result = await sendTelegramMessage(useChatId, message);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to send message' });
    }
});

router.post('/telegram/test', async (req, res) => {
    try {
        const chatId = getApiConfig().TELEGRAM_CHAT_ID;
        if (!chatId) return res.status(400).json({ error: 'TELEGRAM_CHAT_ID not configured' });
        const result = await sendTelegramMessage(chatId, '🧪 Test message from Trading Backtester');
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to send test message' });
    }
});

router.get('/telegram/trades', async (req, res) => {
    try {
        const message = buildTradeHistoryMessage(10);
        res.json({ message, html: message });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to build trade history message' });
    }
});

module.exports = router;
