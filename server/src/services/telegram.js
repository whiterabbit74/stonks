/**
 * Telegram messaging and watches service
 */
const https = require('https');
const fs = require('fs-extra');
const { WATCHES_FILE, getApiConfig } = require('../config');

// In-memory watch list
const telegramWatches = new Map();

// Aggregate send state per chat
const aggregateSendState = new Map();

let saveWatchesTimer = null;

function getAggregateState(chatId, dateKey) {
    let st = aggregateSendState.get(chatId);
    if (!st || st.dateKey !== dateKey) {
        st = { dateKey, t11Sent: false, t1Sent: false };
        aggregateSendState.set(chatId, st);
    }
    return st;
}

function scheduleSaveWatches() {
    if (saveWatchesTimer) clearTimeout(saveWatchesTimer);
    saveWatchesTimer = setTimeout(async () => {
        try {
            const list = Array.from(telegramWatches.values());
            await fs.writeJson(WATCHES_FILE, list, { spaces: 2 });
            console.log(`Saved ${list.length} telegram watches`);
        } catch (e) {
            console.warn('Failed to save telegram watches:', e.message);
        }
    }, 200);
}

async function loadWatches(synchronizeWatchesWithTradeHistory, loadTradeHistory, tradeHistoryLoaded) {
    try {
        const exists = await fs.pathExists(WATCHES_FILE);
        if (!exists) return;
        const arr = await fs.readJson(WATCHES_FILE);
        if (Array.isArray(arr)) {
            telegramWatches.clear();
            arr.forEach(w => {
                if (!w || !w.symbol) return;
                const symbol = w.symbol.toUpperCase();
                const entryPrice = typeof w.entryPrice === 'number' ? w.entryPrice : null;
                telegramWatches.set(symbol, {
                    ...w,
                    symbol,
                    entryPrice,
                    entryDate: typeof w.entryDate === 'string' ? w.entryDate : null,
                    entryIBS: typeof w.entryIBS === 'number' ? w.entryIBS : null,
                    entryDecisionTime: typeof w.entryDecisionTime === 'string' ? w.entryDecisionTime : null,
                    currentTradeId: typeof w.currentTradeId === 'string' ? w.currentTradeId : null,
                    isOpenPosition: entryPrice != null,
                    sent: w.sent || { dateKey: null, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false }
                });
            });
            console.log(`Loaded ${telegramWatches.size} telegram watches from disk`);
        }
        if (!tradeHistoryLoaded) {
            await loadTradeHistory().catch(err => {
                console.warn('Failed to load trade history during watch load:', err && err.message ? err.message : err);
            });
        }
        const syncResult = synchronizeWatchesWithTradeHistory();
        if (syncResult.changes.length) {
            console.log(`Synchronized ${syncResult.changes.length} monitoring entries with trade history on load`);
            scheduleSaveWatches();
        }
    } catch (e) {
        console.warn('Failed to load telegram watches:', e.message);
    }
}

async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
    const telegramBotToken = getApiConfig().TELEGRAM_BOT_TOKEN;
    const tokenLength = typeof telegramBotToken === 'string' ? telegramBotToken.length : 0;
    console.log(`Telegram bot token configured: ${tokenLength > 0 ? 'yes' : 'no'}${tokenLength > 0 ? ` (length: ${tokenLength})` : ''}`);

    if (!telegramBotToken) {
        console.warn('Telegram Token is MISSING or EMPTY');
    }

    if (!telegramBotToken || !chatId) {
        console.warn('Telegram is not configured (missing TELEGRAM_BOT_TOKEN or chatId).');
        return { ok: false, reason: 'not_configured', error: 'Telegram not configured (missing token or chat_id)' };
    }

    let parsedChatId = chatId;
    if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
        parsedChatId = parseInt(chatId, 10);
        console.log(`Converted chat_id from string "${chatId}" to number ${parsedChatId}`);
    }

    const payload = JSON.stringify({
        chat_id: parsedChatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
    });

    const path = `/bot${telegramBotToken}/sendMessage`;
    console.log(`Telegram API request - chat_id: ${parsedChatId}, text length: ${text.length}, parse_mode: ${parseMode}`);

    const options = {
        hostname: 'api.telegram.org',
        path: path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                console.log(`Telegram API response: statusCode=${res.statusCode}`);
                console.log(`Telegram API response body: ${data}`);

                try {
                    const parsed = JSON.parse(data);
                    const isSuccess = res.statusCode >= 200 && res.statusCode < 300;

                    if (!isSuccess) {
                        const errorMsg = parsed.description || 'Unknown error';
                        console.error(`❌ Telegram API error [${res.statusCode}]: ${errorMsg}`, parsed);
                        resolve({
                            ok: false,
                            statusCode: res.statusCode,
                            error: errorMsg,
                            errorCode: parsed.error_code,
                            fullResponse: parsed
                        });
                    } else {
                        console.log(`✅ Telegram message sent successfully`);
                        resolve({ ok: true, statusCode: res.statusCode, result: parsed.result });
                    }
                } catch (parseError) {
                    console.error('Failed to parse Telegram response as JSON:', data);
                    resolve({
                        ok: false,
                        statusCode: res.statusCode,
                        error: 'Invalid JSON response from Telegram API',
                        rawResponse: data
                    });
                }
            });
        });

        req.on('error', (e) => {
            console.error('Telegram request error:', e.message);
            resolve({ ok: false, reason: e.message });
        });

        req.write(payload);
        req.end();
    });
}

function getTelegramWatches() {
    return telegramWatches;
}

module.exports = {
    telegramWatches,
    aggregateSendState,
    getAggregateState,
    scheduleSaveWatches,
    loadWatches,
    sendTelegramMessage,
    getTelegramWatches,
};
