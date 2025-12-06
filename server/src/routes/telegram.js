/**
 * Telegram routes
 */
const express = require('express');
const router = express.Router();
const { getApiConfig } = require('../config');
const { toSafeTicker } = require('../utils/helpers');
const { sendTelegramMessage, telegramWatches, scheduleSaveWatches } = require('../services/telegram');
const {
    buildTradeHistoryMessage,
    synchronizeWatchesWithTradeHistory,
    getCurrentOpenTrade,
    loadTradeHistory,
    isTradeHistoryLoaded,
    serializeTradeForResponse
} = require('../services/trades');
const { runTelegramAggregation } = require('../services/telegramAggregation');
const { runPriceActualization, updateAllPositions } = require('../services/priceActualization');

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

// Extended watches list with trade history sync
router.get('/telegram/watches', async (req, res) => {
    try {
        if (!isTradeHistoryLoaded()) {
            await loadTradeHistory();
        }

        const syncResult = synchronizeWatchesWithTradeHistory();
        if (syncResult.changes.length) {
            scheduleSaveWatches();
        }

        const openTrade = syncResult.openTrade || getCurrentOpenTrade();
        const openSymbol = openTrade ? openTrade.symbol : null;
        const openId = openTrade ? openTrade.id : null;

        const list = Array.from(telegramWatches.values()).map(w => {
            const matchesOpenTrade = !!openSymbol && w.symbol.toUpperCase() === openSymbol;
            const fallbackEntryPrice = typeof w.entryPrice === 'number' ? w.entryPrice : null;
            const fallbackEntryDate = typeof w.entryDate === 'string' ? w.entryDate : null;
            const fallbackEntryIBS = typeof w.entryIBS === 'number' ? w.entryIBS : null;
            const fallbackDecisionTime = typeof w.entryDecisionTime === 'string' ? w.entryDecisionTime : null;

            const entryPrice = matchesOpenTrade
                ? (typeof openTrade.entryPrice === 'number' ? openTrade.entryPrice : fallbackEntryPrice)
                : null;
            const entryDate = matchesOpenTrade ? (openTrade.entryDate ?? fallbackEntryDate) : null;
            const entryIBS = matchesOpenTrade
                ? (typeof openTrade.entryIBS === 'number' ? openTrade.entryIBS : fallbackEntryIBS)
                : null;
            const entryDecisionTime = matchesOpenTrade
                ? (openTrade.entryDecisionTime ?? fallbackDecisionTime)
                : null;

            return {
                symbol: w.symbol,
                highIBS: w.highIBS,
                lowIBS: w.lowIBS,
                thresholdPct: w.thresholdPct,
                entryPrice,
                entryDate,
                entryIBS,
                entryDecisionTime,
                currentTradeId: matchesOpenTrade ? openId : null,
                isOpenPosition: matchesOpenTrade,
                chatId: w.chatId ? 'configured' : null,
            };
        });

        res.json(list);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить список';
        res.status(500).json({ error: message });
    }
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

// ============================================
// ВОССТАНОВЛЕННЫЕ ЭНДПОИНТЫ (были потеряны при рефакторинге)
// ============================================

// Simulate T-11 or T-1 message
router.post('/telegram/simulate', async (req, res) => {
    try {
        const stage = (req.body && req.body.stage) || 'overview';
        const minutes = stage === 'confirmations' ? 1 : 11;
        const result = await runTelegramAggregation(minutes, { test: true, forceSend: true, updateState: false });
        res.json({ success: !!(result && result.sent), stage });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to simulate telegram aggregation' });
    }
});

// Actualize prices via API
router.post('/telegram/actualize-prices', async (req, res) => {
    try {
        const forceRun = !!(req.body && req.body.force);
        const result = await runPriceActualization({ force: forceRun, source: 'manual_endpoint' });
        res.json({
            success: result.updated,
            count: result.count || 0,
            tickers: result.tickers || [],
            reason: result.reason || null,
            todayKey: result.todayKey || null,
            provider: result.provider || null
        });
    } catch (e) {
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to run price actualization' });
    }
});

// Update positions (sync with trade history)
router.post('/telegram/update-positions', async (req, res) => {
    try {
        const summary = await updateAllPositions();
        res.json({
            success: true,
            updated: summary.changes.length,
            changes: summary.changes,
            openTrade: summary.openTrade ? serializeTradeForResponse(summary.openTrade) : null
        });
    } catch (error) {
        console.error('Error updating positions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Combined endpoint: actualize prices and update positions
router.post('/telegram/update-all', async (req, res) => {
    try {
        const forceActualization = !!(req.body && (req.body.forceActualization || req.body.forcePrices || req.body.force));
        const priceResult = await runPriceActualization({ force: forceActualization, source: 'update-all-endpoint' });

        const positionResults = await updateAllPositions();

        res.json({
            success: true,
            prices: {
                updated: priceResult.updated,
                count: priceResult.count || 0,
                tickers: priceResult.tickers || [],
                totalTickers: priceResult.totalTickers || 0,
                hasProblems: priceResult.hasProblems || false,
                failedTickers: priceResult.failedTickers || [],
                tickersWithoutTodayData: priceResult.tickersWithoutTodayData || [],
                todayKey: priceResult.todayKey,
                reason: priceResult.reason,
                targetRunTime: priceResult.targetRunTime,
                currentTime: priceResult.currentTime,
                minutesAfterClose: priceResult.minutesAfterClose,
                provider: priceResult.provider
            },
            positions: {
                updated: positionResults.changes.length,
                changes: positionResults.changes,
                openTrade: positionResults.openTrade ? serializeTradeForResponse(positionResults.openTrade) : null
            }
        });
    } catch (error) {
        console.error('Error updating prices and positions:', error);
        res.status(500).json({ error: error.message });
    }
});

// Telegram command handler (e.g. /trades)
router.post('/telegram/command', async (req, res) => {
    try {
        const { command, chatId: overrideChatId, limit } = req.body || {};
        if (!command || typeof command !== 'string') {
            return res.status(400).json({ error: 'command_required' });
        }

        const normalized = command.trim().toLowerCase();
        const targetChatId = overrideChatId || getApiConfig().TELEGRAM_CHAT_ID;

        if (normalized === '/trades' || normalized === 'trades') {
            if (!targetChatId) {
                return res.status(400).json({ error: 'telegram_not_configured' });
            }
            if (!isTradeHistoryLoaded()) {
                await loadTradeHistory();
            }
            const maxItems = typeof limit === 'number' && limit > 0 ? Math.min(50, Math.floor(limit)) : 5;
            const text = buildTradeHistoryMessage(maxItems);
            const resp = await sendTelegramMessage(targetChatId, text);
            if (resp.ok) {
                return res.json({ success: true, command: normalized, sent: true });
            }
            return res.status(502).json({ error: 'send_failed', command: normalized });
        }

        return res.status(400).json({ error: 'unknown_command', command: normalized });
    } catch (e) {
        console.error('Telegram command error:', e);
        res.status(500).json({ error: e && e.message ? e.message : 'Failed to process command' });
    }
});

module.exports = router;


