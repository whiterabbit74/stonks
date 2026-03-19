/**
 * Telegram messaging and watches service — watches backed by SQLite
 */
const https = require('https');
const fs = require('fs-extra');
const { WATCHES_FILE, getApiConfig } = require('../config');
const { getDb } = require('../db');

// In-memory watch list (primary runtime store, persisted to DB)
const telegramWatches = new Map();

// Aggregate send state per chat
const aggregateSendState = new Map();

let saveWatchesTimer = null;
let _watchesMigrated = false;

function getAggregateState(chatId, dateKey) {
    let st = aggregateSendState.get(chatId);
    if (!st || st.dateKey !== dateKey) {
        st = { dateKey, t11Sent: false, t1Sent: false };
        aggregateSendState.set(chatId, st);
    }
    return st;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

function rowToWatch(row) {
    return {
        symbol: row.symbol,
        highIBS: row.high_ibs,
        lowIBS: row.low_ibs,
        thresholdPct: row.threshold_pct,
        chatId: row.chat_id,
        entryPrice: row.entry_price,
        entryDate: row.entry_date,
        entryIBS: row.entry_ibs,
        entryDecisionTime: row.entry_decision_time,
        currentTradeId: row.current_trade_id,
        isOpenPosition: !!row.is_open_position,
        sent: {
            dateKey: row.sent_date_key,
            warn10: !!row.sent_warn10,
            confirm1: !!row.sent_confirm1,
            entryWarn10: !!row.sent_entry_warn10,
            entryConfirm1: !!row.sent_entry_confirm1,
        },
    };
}

function upsertWatchToDb(db, w) {
    db.prepare(`
        INSERT OR REPLACE INTO telegram_watches
        (symbol, high_ibs, low_ibs, threshold_pct, chat_id,
         entry_price, entry_date, entry_ibs, entry_decision_time, current_trade_id,
         is_open_position, sent_date_key, sent_warn10, sent_confirm1, sent_entry_warn10, sent_entry_confirm1)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        w.symbol,
        w.highIBS ?? 0.75, w.lowIBS ?? 0.1, w.thresholdPct ?? 0.3, w.chatId ?? null,
        w.entryPrice ?? null, w.entryDate ?? null, w.entryIBS ?? null,
        w.entryDecisionTime ?? null, w.currentTradeId ?? null,
        w.isOpenPosition ? 1 : 0,
        w.sent?.dateKey ?? null,
        w.sent?.warn10 ? 1 : 0, w.sent?.confirm1 ? 1 : 0,
        w.sent?.entryWarn10 ? 1 : 0, w.sent?.entryConfirm1 ? 1 : 0,
    );
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function scheduleSaveWatches() {
    if (saveWatchesTimer) clearTimeout(saveWatchesTimer);
    saveWatchesTimer = setTimeout(() => {
        try {
            const db = getDb();
            db.transaction(() => {
                for (const w of telegramWatches.values()) upsertWatchToDb(db, w);
            })();
        } catch (e) {
            console.warn('Failed to save telegram watches to DB:', e.message);
        }
    }, 200);
}

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateWatchesJsonToDb(db) {
    if (_watchesMigrated) return;
    _watchesMigrated = true;

    const count = db.prepare('SELECT COUNT(*) AS n FROM telegram_watches').get().n;
    if (count > 0) return;

    if (!fs.pathExistsSync(WATCHES_FILE)) return;

    try {
        const arr = fs.readJsonSync(WATCHES_FILE);
        if (!Array.isArray(arr) || arr.length === 0) return;
        db.transaction(() => {
            for (const w of arr) {
                if (!w || !w.symbol) continue;
                upsertWatchToDb(db, {
                    symbol: w.symbol.toUpperCase(),
                    highIBS: w.highIBS ?? 0.75,
                    lowIBS: w.lowIBS ?? 0.1,
                    thresholdPct: w.thresholdPct ?? 0.3,
                    chatId: w.chatId ?? null,
                    entryPrice: typeof w.entryPrice === 'number' ? w.entryPrice : null,
                    entryDate: w.entryDate ?? null,
                    entryIBS: typeof w.entryIBS === 'number' ? w.entryIBS : null,
                    entryDecisionTime: w.entryDecisionTime ?? null,
                    currentTradeId: w.currentTradeId ?? null,
                    isOpenPosition: w.entryPrice != null,
                    sent: w.sent || { dateKey: null, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false },
                });
            }
        })();
        console.log(`telegram watches: migrated ${arr.length} entries from JSON to SQLite`);
    } catch (e) {
        console.warn('telegram watches: migration failed:', e.message);
    }
}

// ─── Load ─────────────────────────────────────────────────────────────────────

async function loadWatches(synchronizeWatchesWithTradeHistory, loadTradeHistory, tradeHistoryLoaded) {
    try {
        const db = getDb();
        migrateWatchesJsonToDb(db);

        const rows = db.prepare('SELECT * FROM telegram_watches').all();
        telegramWatches.clear();
        for (const row of rows) {
            const w = rowToWatch(row);
            telegramWatches.set(w.symbol, w);
        }
        if (telegramWatches.size > 0) {
            console.log(`Loaded ${telegramWatches.size} telegram watches from DB`);
        }

        if (!tradeHistoryLoaded) {
            await loadTradeHistory().catch(err => {
                console.warn('Failed to load trade history during watch load:', err && err.message ? err.message : err);
            });
        }
        const syncResult = synchronizeWatchesWithTradeHistory();
        if (syncResult.changes.length) {
            scheduleSaveWatches();
        }
    } catch (e) {
        console.warn('Failed to load telegram watches:', e.message);
    }
}

function deleteWatchFromDb(symbol) {
    try {
        getDb().prepare('DELETE FROM telegram_watches WHERE symbol = ?').run(symbol);
    } catch (e) {
        console.warn('Failed to delete watch from DB:', e.message);
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
    deleteWatchFromDb,
    loadWatches,
    sendTelegramMessage,
    getTelegramWatches,
};
