/**
 * Telegram Aggregation Service
 * Handles T-11 (overview) and T-1 (confirmations) message scheduling
 * 
 * ИСПРАВЛЕНО: Использует настраиваемый провайдер вместо захардкоженного Alpha Vantage
 * Сообщение теперь показывает "Hist✅/❌" вместо "AV✅/❌" и реальное имя провайдера
 */
const fs = require('fs-extra');
const { getApiConfig, DATASETS_DIR } = require('../config');
const { readSettings } = require('./settings');
const { resolveDatasetFilePathById } = require('./datasets');
const { toSafeTicker } = require('../utils/helpers');
const { fetchTodayRangeAndQuote } = require('../providers/finnhub');
const { telegramWatches, scheduleSaveWatches, sendTelegramMessage, aggregateSendState, getAggregateState } = require('./telegram');
const {
    loadTradeHistory,
    synchronizeWatchesWithTradeHistory,
    getCurrentOpenTrade,
    recordTradeEntry,
    recordTradeExit,
    isTradeHistoryLoaded,
    serializeTradeForResponse
} = require('./trades');
const { getETParts, etKeyYMD, previousTradingDayET, getTradingSessionForDateET, isTradingDayByCalendarET, getCachedTradingCalendar } = require('./dates');
const { refreshTickerAndCheckFreshness, appendMonitorLog } = require('./priceActualization');

// Helper functions
function toFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeIntradayRange(range, quote) {
    const low = toFiniteNumber(range && range.low);
    const high = toFiniteNumber(range && range.high);
    if (low != null && high != null && high > low) {
        return { low, high };
    }
    const candidates = [];
    const inputs = [
        range && range.low,
        range && range.high,
        quote && quote.current,
        quote && quote.high,
        quote && quote.low,
        quote && quote.open,
        quote && quote.prevClose,
    ];
    for (const value of inputs) {
        const num = toFiniteNumber(value);
        if (num != null) candidates.push(num);
    }
    if (candidates.length < 2) return null;
    const min = Math.min(...candidates);
    const max = Math.max(...candidates);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { low: min, high: max };
}

function formatMoney(n) {
    return (typeof n === 'number' && isFinite(n)) ? `$${n.toFixed(2)}` : '-';
}

function isPositionOpen(watch) {
    return !!(watch.entryPrice !== null && watch.entryPrice !== undefined);
}

/**
 * Get provider abbreviation for display
 */
function getProviderAbbrev(provider) {
    switch (provider) {
        case 'finnhub': return 'FH';
        case 'twelve_data': return 'TD';
        case 'alpha_vantage': return 'AV';
        default: return 'Hist';
    }
}

/**
 * Main Telegram aggregation function
 * Sends messages at T-11 (overview) and T-1 (confirmations)
 */
async function runTelegramAggregation(minutesOverride = null, options = {}) {
    try {
        if (telegramWatches.size === 0) return { sent: false };

        const nowEt = getETParts(new Date());
        const todayKey = etKeyYMD(nowEt);
        const cal = getCachedTradingCalendar();

        if (!isTradingDayByCalendarET(nowEt, cal) && !options.forceSend) {
            return { sent: false, reason: 'not_trading_day' };
        }

        const session = getTradingSessionForDateET(nowEt, cal);
        const nowMinutes = nowEt.hh * 60 + nowEt.mm;
        const minutesUntilClose = minutesOverride !== null
            ? minutesOverride
            : session.closeMin - nowMinutes;

        // Only run at T-11 or T-1 (unless forced)
        if (minutesOverride === null && minutesUntilClose !== 11 && minutesUntilClose !== 1) {
            return { sent: false, reason: 'wrong_time' };
        }

        // Get configured provider
        const settings = await readSettings();
        const histProvider = settings.resultsRefreshProvider || 'finnhub';
        const providerAbbrev = getProviderAbbrev(histProvider);

        // Tolerance for IBS thresholds
        const delta = 0.02;

        // Group watches by chat
        const byChat = new Map();
        for (const watch of telegramWatches.values()) {
            const chatId = watch.chatId || getApiConfig().TELEGRAM_CHAT_ID;
            if (!chatId) continue;
            if (!byChat.has(chatId)) byChat.set(chatId, []);
            byChat.get(chatId).push({ w: watch });
        }

        // Track API calls for statistics
        let apiCallsMade = 0;
        let apiCallsSkipped = 0;

        // Fetch data for all watched symbols
        for (const list of byChat.values()) {
            for (const rec of list) {
                const { w } = rec;
                rec.avFresh = false;
                rec.rtFresh = false;
                rec.dataOk = false;
                rec.ibs = null;
                rec.quote = null;
                rec.range = null;
                rec.closeEnoughToExit = false;
                rec.closeEnoughToEntry = false;
                rec.confirmExit = false;
                rec.confirmEntry = false;

                // 1) Check historical data freshness
                try {
                    const prev = previousTradingDayET(nowEt);
                    const prevKey = etKeyYMD(prev);
                    let needsUpdate = true;

                    // Check if dataset already has previous trading day data
                    const filePath = resolveDatasetFilePathById(w.symbol);
                    if (filePath && await fs.pathExists(filePath)) {
                        const dataset = await fs.readJson(filePath).catch(() => null);
                        if (dataset && dataset.data && Array.isArray(dataset.data)) {
                            const hasYesterday = dataset.data.some(d => d && d.date === prevKey);
                            if (hasYesterday) {
                                rec.histFresh = true;
                                apiCallsSkipped++;
                                needsUpdate = false;
                            }
                        }
                    }

                    // Fetch if needed
                    if (needsUpdate) {
                        apiCallsMade++;
                        const histStatus = await refreshTickerAndCheckFreshness(w.symbol, nowEt, histProvider);
                        rec.histFresh = !!(histStatus && histStatus.fresh);
                    }
                } catch (e) {
                    rec.histFresh = false;
                }

                // 2) Fetch today's realtime quote via Finnhub
                try {
                    const rangeQuote = await fetchTodayRangeAndQuote(w.symbol);
                    const { range, quote } = rangeQuote;
                    rec.quote = quote || null;
                    const normalizedRange = normalizeIntradayRange(range, quote);
                    if (!normalizedRange) throw new Error('invalid range');

                    const currentPrice = toFiniteNumber(quote && quote.current);
                    if (currentPrice == null) throw new Error('no range/quote');

                    const span = normalizedRange.high - normalizedRange.low;
                    if (!(span > 0)) throw new Error('invalid range');

                    const rawIbs = (currentPrice - normalizedRange.low) / span;
                    const ibs = Math.max(0, Math.min(1, rawIbs));

                    // Calculate signals
                    const closeEnoughToExit = ibs >= (w.highIBS - delta);
                    const closeEnoughToEntry = ibs <= ((w.lowIBS ?? 0.1) + delta);
                    const confirmExit = ibs >= w.highIBS;
                    const confirmEntry = ibs <= (w.lowIBS ?? 0.1);

                    rec.ibs = ibs;
                    rec.quote = { ...quote, current: currentPrice };
                    rec.range = { ...range, low: normalizedRange.low, high: normalizedRange.high };
                    rec.closeEnoughToExit = closeEnoughToExit;
                    rec.closeEnoughToEntry = closeEnoughToEntry;
                    rec.confirmExit = confirmExit;
                    rec.confirmEntry = confirmEntry;
                    rec.dataOk = true;
                    rec.rtFresh = true;
                } catch (err) {
                    rec.fetchError = err && err.message ? err.message : 'fetch_failed';
                    rec.rtFresh = false;
                }
            }
        }

        // Send messages per chat
        for (const [chatId, list] of byChat.entries()) {
            const state = getAggregateState(chatId, todayKey);

            // T-11 overview message
            if (minutesUntilClose === 11 && (!state.t11Sent || (options && options.forceSend))) {
                const closeH = String(Math.floor(session.closeMin / 60)).padStart(2, '0');
                const closeM = String(session.closeMin % 60).padStart(2, '0');
                const header = `⏱ До закрытия: ${String(Math.floor(minutesUntilClose / 60)).padStart(2, '0')}:${String(minutesUntilClose % 60).padStart(2, '0')} • ${closeH}:${closeM} ET${session.short ? ' (сокр.)' : ''} • ${todayKey}`;
                const sorted = list.slice().sort((a, b) => a.w.symbol.localeCompare(b.w.symbol));

                // Collect signals
                const entrySignals = [];
                const exitSignals = [];
                const blocks = [];
                const logLines = [`T-11 overview → chat ${chatId}`];

                for (const rec of sorted) {
                    const { w } = rec;
                    const positionOpen = isPositionOpen(w);
                    const type = positionOpen ? 'выход' : 'вход';
                    const near = positionOpen ? rec.closeEnoughToExit : rec.closeEnoughToEntry;
                    const nearStr = rec.dataOk ? (near ? 'да' : 'нет') : '—';
                    const priceStr = rec.dataOk && rec.quote ? formatMoney(rec.quote.current) : '-';
                    const ibsStr = rec.dataOk && Number.isFinite(rec.ibs) ? rec.ibs.toFixed(3) : '-';
                    const thresholdStr = positionOpen
                        ? `≥ ${(w.highIBS - delta).toFixed(2)} (цель ${w.highIBS})`
                        : `≤ ${((w.lowIBS ?? 0.1) + delta).toFixed(2)} (цель ${w.lowIBS ?? 0.1})`;
                    const statusLabel = positionOpen ? 'Открыта' : 'Нет позиции';

                    // Collect signals for summary
                    if (rec.dataOk && near) {
                        if (positionOpen) {
                            exitSignals.push(`${w.symbol} (IBS ${(rec.ibs * 100).toFixed(1)}%)`);
                        } else {
                            entrySignals.push(`${w.symbol} (IBS ${(rec.ibs * 100).toFixed(1)}%)`);
                        }
                    }

                    // Progress bar for IBS
                    const fillCount = rec.dataOk && Number.isFinite(rec.ibs)
                        ? Math.max(0, Math.min(10, Math.ceil(rec.ibs * 11)))
                        : 0;
                    const bar = '█'.repeat(fillCount) + '░'.repeat(10 - fillCount);

                    const line1 = `${w.symbol} • ${statusLabel} • ${priceStr}`;
                    const line2 = `IBS ${ibsStr}  [${bar}]`;
                    // ИСПРАВЛЕНО: Показываем реальный провайдер вместо "AV"
                    const line3 = `${providerAbbrev}${rec.histFresh ? '✅' : '❌'}  RT${rec.rtFresh ? '✅' : '❌'}`;
                    const line4 = `Сигнал (${type}): ${nearStr}`;
                    blocks.push([line1, line2, line3, line4].join('\n'));

                    logLines.push(rec.dataOk
                        ? `${w.symbol} pos=${positionOpen ? 'open' : 'none'} IBS=${ibsStr} near=${nearStr}`
                        : `${w.symbol} pos=${positionOpen ? 'open' : 'none'} data=NA err=${rec.fetchError}`);
                }

                // Build signals summary
                let signalsSummary = '🔔 СИГНАЛЫ:\n';
                signalsSummary += entrySignals.length > 0
                    ? `• На вход: ${entrySignals.join(', ')}\n`
                    : '• На вход: нет\n';
                signalsSummary += exitSignals.length > 0
                    ? `• На выход: ${exitSignals.join(', ')}`
                    : '• На выход: нет';

                const text = `<pre>${header}\n\n${signalsSummary}\n\n📊 ПОДРОБНО:\n\n${blocks.join('\n\n')}</pre>`;
                const resp = await sendTelegramMessage(chatId, text);

                if (resp.ok) {
                    if (!options || options.updateState !== false) {
                        state.t11Sent = true;
                        aggregateSendState.set(chatId, state);
                    }
                    await appendMonitorLog([...logLines, options && options.test ? '→ sent ok [TEST]' : '→ sent ok']);
                } else {
                    await appendMonitorLog([...logLines, '→ send failed']);
                }
            }

            // T-1 confirmations message
            if (minutesUntilClose === 1 && (!state.t1Sent || (options && options.forceSend))) {
                const nowIso = new Date().toISOString();
                const entryCandidates = [];
                const potentialExitDetails = [];
                const potentialEntryDetails = [];

                // Sort by IBS (lowest first for entries)
                const sortedByIBS = list.slice().sort((a, b) => {
                    if (a.ibs == null && b.ibs == null) return a.w.symbol.localeCompare(b.w.symbol);
                    if (a.ibs == null) return 1;
                    if (b.ibs == null) return -1;
                    if (a.ibs === b.ibs) return a.w.symbol.localeCompare(b.w.symbol);
                    return a.ibs - b.ibs;
                });

                const openTradeBefore = getCurrentOpenTrade();
                const openSymbolBefore = openTradeBefore ? openTradeBefore.symbol : null;
                let exitAction = null;
                let entryAction = null;

                // Process each symbol
                for (const rec of sortedByIBS) {
                    if (!rec.dataOk) continue;
                    const { w } = rec;
                    const ibsPercent = typeof rec.ibs === 'number' ? (rec.ibs * 100).toFixed(1) : '—';
                    const lowThreshold = (w.lowIBS ?? 0.1) * 100;
                    const highThreshold = (w.highIBS ?? 0.75) * 100;

                    // Check for exit
                    if (openSymbolBefore && w.symbol === openSymbolBefore) {
                        potentialExitDetails.push({
                            symbol: w.symbol,
                            ibsPercent,
                            highThreshold: highThreshold.toFixed(1),
                            confirm: rec.confirmExit,
                        });

                        if (rec.confirmExit) {
                            const trade = recordTradeExit({
                                symbol: w.symbol,
                                price: rec.quote?.current ?? null,
                                ibs: rec.ibs,
                                decisionTime: nowIso,
                                dateKey: todayKey,
                            });
                            if (trade) {
                                exitAction = {
                                    symbol: w.symbol,
                                    price: rec.quote?.current ?? null,
                                    ibs: rec.ibs,
                                };
                                if (!options || options.updateState !== false) {
                                    w.sent.confirm1 = true;
                                }
                            }
                        }
                    }

                    // Check for entry
                    if (rec.confirmEntry && !isPositionOpen(w)) {
                        entryCandidates.push(rec);
                        potentialEntryDetails.push({
                            symbol: w.symbol,
                            ibsPercent,
                            lowThreshold: lowThreshold.toFixed(1),
                            confirm: true,
                        });
                    }
                }

                // Sync after potential exit
                if (exitAction) {
                    const syncResult = synchronizeWatchesWithTradeHistory();
                    if (syncResult.changes.length && (!options || options.updateState !== false)) {
                        scheduleSaveWatches();
                    }
                }

                // Execute best entry if no open position
                const openTradeAfterExit = getCurrentOpenTrade();
                if (!openTradeAfterExit && entryCandidates.length > 0) {
                    const available = entryCandidates.filter(r => r.confirmEntry && r.dataOk);
                    if (available.length > 0) {
                        const best = available.reduce((best, rec) => {
                            if (!best) return rec;
                            if (rec.ibs == null) return best;
                            if (best.ibs == null) return rec;
                            return rec.ibs < best.ibs ? rec : best;
                        }, null);

                        if (best) {
                            const trade = recordTradeEntry({
                                symbol: best.w.symbol,
                                price: best.quote?.current ?? null,
                                ibs: best.ibs,
                                decisionTime: nowIso,
                                dateKey: todayKey,
                            });
                            if (trade) {
                                entryAction = {
                                    symbol: best.w.symbol,
                                    price: best.quote?.current ?? null,
                                    ibs: best.ibs,
                                };
                            }
                        }
                    }
                }

                // Final sync
                const syncResult = synchronizeWatchesWithTradeHistory();
                if (syncResult.changes.length && (!options || options.updateState !== false)) {
                    scheduleSaveWatches();
                }

                // Build T-1 message
                const openTradeNow = getCurrentOpenTrade();
                const decisionLines = [];
                if (exitAction) {
                    const price = typeof exitAction.price === 'number' ? `$${exitAction.price.toFixed(2)}` : '—';
                    const ibs = exitAction.ibs != null ? `${(exitAction.ibs * 100).toFixed(1)}%` : '—';
                    decisionLines.push(`• Закрываем ${exitAction.symbol} по ${price} (IBS ${ibs})`);
                }
                if (entryAction) {
                    const price = typeof entryAction.price === 'number' ? `$${entryAction.price.toFixed(2)}` : '—';
                    const ibs = entryAction.ibs != null ? `${(entryAction.ibs * 100).toFixed(1)}%` : '—';
                    decisionLines.push(`• Открываем ${entryAction.symbol} по ${price} (IBS ${ibs})`);
                }
                if (!decisionLines.length) {
                    decisionLines.push('• Действий нет');
                }

                const freshnessLine = (() => {
                    const total = list.length;
                    const fresh = list.filter(r => r.rtFresh).length;
                    if (total === 0) return 'Котировки: тикеры не отслеживаются';
                    if (fresh === total) return 'Котировки: получены ✅';
                    if (fresh === 0) return 'Котировки: нет данных ❌';
                    return `Котировки: ${fresh}/${total} ⚠️`;
                })();

                const positionLine = openTradeNow
                    ? `Позиция: ${openTradeNow.symbol} (вход ${openTradeNow.entryDate || '—'} по ${typeof openTradeNow.entryPrice === 'number' ? `$${openTradeNow.entryPrice.toFixed(2)}` : '—'})`
                    : 'Позиция: нет';

                const messageParts = [
                    '<b>⏱️ 1 минута до закрытия</b>',
                    '',
                    '<b>🎯 РЕШЕНИЕ:</b>',
                    ...decisionLines,
                    '',
                    `${freshnessLine}`,
                    positionLine,
                ];

                const text = messageParts.join('\n');
                const resp = await sendTelegramMessage(chatId, text);

                if (resp.ok) {
                    if (!options || options.updateState !== false) {
                        state.t1Sent = true;
                        aggregateSendState.set(chatId, state);
                    }
                    await appendMonitorLog([`T-1 report → chat ${chatId}`, ...decisionLines]);
                }
            }
        }

        await appendMonitorLog([
            `T-${minutesUntilClose}min: API=${apiCallsMade}, skipped=${apiCallsSkipped}`
        ]);

        return { sent: true };
    } catch (e) {
        console.warn('Telegram aggregation error:', e.message);
        try {
            await appendMonitorLog([`Aggregation error: ${e.message}`]);
        } catch { }
        return { sent: false, error: e.message };
    }
}

module.exports = {
    runTelegramAggregation,
    toFiniteNumber,
    normalizeIntradayRange,
    formatMoney,
    isPositionOpen,
    getProviderAbbrev,
};
