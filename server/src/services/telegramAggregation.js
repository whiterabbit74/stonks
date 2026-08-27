/**
 * Telegram Aggregation Service
 * Handles T-11 (overview) and T-1 (confirmations) message scheduling
 * 
 * ИСПРАВЛЕНО: Использует настраиваемый провайдер вместо захардкоженного Alpha Vantage
 * Сообщение теперь показывает "Hist✅/❌" вместо "AV✅/❌" и реальное имя провайдера
 */
const crypto = require('crypto');
const fs = require('fs-extra');
const { getApiConfig, DATASETS_DIR } = require('../config');
const { readSettings } = require('./settings');
const { getDataset } = require('./datasets');
const { toSafeTicker } = require('../utils/helpers');
const { fetchTodayRangeAndQuote } = require('../providers/quote');
const { telegramWatches, sendTelegramMessage, aggregateSendState, getAggregateState } = require('./telegram');
const {
    syncWatchesWithTradeState,
    getCurrentOpenTrade,
    recordTradeEntry,
    recordTradeExit,
} = require('./trades');
const { executeWebullSignal, appendAutotradeEvent } = require('./autotrade');
const { getETParts, etKeyYMD, previousTradingDayET, getTradingSessionForDateET, isTradingDayByCalendarET, getCachedTradingCalendar } = require('./dates');
const { refreshTickerAndCheckFreshness, appendMonitorLog } = require('./priceActualization');
const { reconcileMonitorState, getBlockingMonitorMismatch } = require('./monitorConsistency');
const { evaluateEmaAlerts, listEmaAlerts, markEmaAlertsTriggered, recordEmaInfoSide, recordEmaInfoSides } = require('./emaAlerts');
const { getTickerSplits } = require('./splits');
const { evaluatePriceIntegrity, formatIntegrityWarningBlock, integrityWarningKey } = require('./marketDataIntegrity');

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

function formatEmaAlertLine(alert, detailed = false) {
    const action = alert.action === 'sell' ? 'продажа' : 'покупка';
    const actionText = alert.action === 'sell' ? 'продавай' : 'покупай';
    const comparator = alert.action === 'sell' ? '≥' : '≤';
    const current = Number.isFinite(alert.deviationPct) ? `${alert.deviationPct.toFixed(2)}%` : '—';
    const range = `${alert.buyLevelPct}%–${alert.sellLevelPct}%`;
    if (detailed) {
        return `${alert.symbol} EMA${alert.emaPeriod} ${range} • ждём: ${action} (${comparator} ${alert.activeLevelPct}%) • сейчас ${current} • ${alert.near ? 'близко ✅' : 'далеко'}`;
    }
    return `${alert.symbol} EMA${alert.emaPeriod}: ${actionText} при ${comparator} ${alert.activeLevelPct}% (сейчас ${current})`;
}

function formatEmaInfoCrossingLine(alert) {
    const dev = Number.isFinite(alert.deviationPct) ? `${alert.deviationPct.toFixed(2)}%` : '—';
    const levelStr = `${alert.infoLevelPct}%`;
    if (alert.infoCrossing === 'down') {
        return `⚠️ ${alert.symbol} пересёк ${levelStr} от EMA${alert.emaPeriod} вниз (отклонение ${dev})`;
    }
    return `${alert.symbol} вернулся выше ${levelStr} от EMA${alert.emaPeriod} (отклонение ${dev})`;
}

/**
 * Builds the standalone T-11 "EMA сигналы" message body: near buy/sell signals, the full
 * configured-alert detail listing (same content the old inline "📈 EMA" block had), plus
 * any info-level (-20% default) crossing notices. Returns null when there is nothing to report.
 */
function buildEmaOverviewMessageText(emaAlerts) {
    if (!Array.isArray(emaAlerts) || emaAlerts.length === 0) return null;

    const nearSignals = emaAlerts.filter((alert) => alert.dataOk && alert.near);
    const crossingAlerts = emaAlerts.filter((alert) => alert.dataOk && alert.infoCrossing);

    const lines = ['📐 EMA сигналы', ''];
    lines.push(nearSignals.length > 0
        ? `Близко: ${nearSignals.map((alert) => formatEmaAlertLine(alert)).join(', ')}`
        : 'Близко: нет');

    lines.push('');
    lines.push(...emaAlerts.map((alert) => {
        const range = `${alert.buyLevelPct ?? alert.levelPct}%–${alert.sellLevelPct ?? alert.levelPct}%`;
        if (!alert.dataOk) return `${alert.symbol} EMA${alert.emaPeriod} ${range} • нет данных (${alert.reason || 'ошибка'})`;
        return formatEmaAlertLine(alert, true);
    }));

    if (crossingAlerts.length > 0) {
        lines.push('');
        lines.push('Инфо-уровень:');
        lines.push(...crossingAlerts.map((alert) => formatEmaInfoCrossingLine(alert)));
    }

    return `<pre>${lines.join('\n')}</pre>`;
}

/**
 * Builds the standalone T-1 "EMA сигналы" message body: only reached buy/sell levels and/or
 * info-level crossings — nothing to report otherwise, so returns null in that case.
 */
function buildEmaDecisionMessageText(reachedEmaAlerts, emaAlerts) {
    const crossingAlerts = (Array.isArray(emaAlerts) ? emaAlerts : []).filter((alert) => alert.dataOk && alert.infoCrossing);
    const reached = Array.isArray(reachedEmaAlerts) ? reachedEmaAlerts : [];
    if (reached.length === 0 && crossingAlerts.length === 0) return null;

    const lines = ['📐 EMA сигналы', ''];

    if (reached.length > 0) {
        lines.push('Достигнутые уровни:');
        for (const alert of reached) {
            const actionText = alert.action === 'sell' ? 'ПРОДАВАЙ' : 'ПОКУПАЙ';
            const comparator = alert.action === 'sell' ? '≥' : '≤';
            lines.push(`  ${actionText}: ${alert.symbol} EMA${alert.emaPeriod} ${alert.buyLevelPct}%–${alert.sellLevelPct}% • сейчас ${alert.deviationPct.toFixed(2)}% (${comparator} ${alert.activeLevelPct}%)`);
        }
    }

    if (crossingAlerts.length > 0) {
        if (reached.length > 0) lines.push('');
        lines.push('Инфо-уровень:');
        lines.push(...crossingAlerts.map((alert) => formatEmaInfoCrossingLine(alert)));
    }

    return `<pre>${lines.join('\n')}</pre>`;
}

function collectIntegrityWarnings(records = [], emaAlerts = []) {
    const warnings = new Map();
    for (const rec of Array.isArray(records) ? records : []) {
        if (rec && rec.integrityWarning && rec.integrityWarning.blockSignals) {
            warnings.set(integrityWarningKey(rec.integrityWarning), rec.integrityWarning);
        }
    }
    for (const alert of Array.isArray(emaAlerts) ? emaAlerts : []) {
        if (alert && alert.integrityWarning && alert.integrityWarning.blockSignals) {
            warnings.set(integrityWarningKey(alert.integrityWarning), alert.integrityWarning);
        }
    }
    return Array.from(warnings.values());
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

function uniqueEmaSymbols(alerts) {
    const symbols = [];
    const seen = new Set();
    for (const alert of Array.isArray(alerts) ? alerts : []) {
        const symbol = toSafeTicker(alert && alert.symbol);
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        symbols.push(symbol);
    }
    return symbols;
}

async function refreshHistIfMissingYesterday(symbol, nowEt, histProvider) {
    const prevKey = etKeyYMD(previousTradingDayET(nowEt));
    const dataset = getDataset(symbol);
    const hasYesterday = dataset && Array.isArray(dataset.data) && dataset.data.some((d) => d && d.date === prevKey);
    if (hasYesterday) {
        return { dataset, histFresh: true, fetched: false };
    }
    const histStatus = await refreshTickerAndCheckFreshness(symbol, nowEt, histProvider);
    return {
        dataset: getDataset(symbol) || dataset || null,
        histFresh: !!(histStatus && histStatus.fresh),
        fetched: true,
    };
}

/**
 * Main Telegram aggregation function
 * Sends messages at T-11 (overview) and T-1 (confirmations)
 */
async function runTelegramAggregation(minutesOverride = null, options = {}) {
    try {
        let configuredEmaAlerts = [];
        try {
            configuredEmaAlerts = listEmaAlerts({ enabledOnly: true });
        } catch {
            configuredEmaAlerts = [];
        }
        if (telegramWatches.size === 0 && configuredEmaAlerts.length === 0) return { sent: false };

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
        const consistencySnapshot = reconcileMonitorState({ apply: !(options && options.test) });

        let apiCallsMade = 0;
        let apiCallsSkipped = 0;
        for (const symbol of uniqueEmaSymbols(configuredEmaAlerts)) {
            try {
                const hist = await refreshHistIfMissingYesterday(symbol, nowEt, histProvider);
                if (hist.fetched) apiCallsMade++;
                else apiCallsSkipped++;
            } catch {
                // same as watch loop: keep going so EMA eval still uses whatever history we have
            }
        }

        let emaAlerts = [];
        if (configuredEmaAlerts.length > 0) {
            try {
                emaAlerts = await evaluateEmaAlerts();
            } catch {
                emaAlerts = [];
            }
        }

        // Info-level (-20% by default) first observation: record the current side immediately,
        // no Telegram notification involved — there's nothing to compare against yet.
        // Skipped for dry runs (updateState: false) so tests never seed a production baseline.
        try {
            for (const alert of (!options || options.updateState !== false) ? emaAlerts : []) {
                if (alert.dataOk && alert.infoPrevSide == null && alert.infoSide) {
                    recordEmaInfoSide(alert.id, alert.infoSide);
                }
            }
        } catch { /* non-fatal */ }

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
        if (byChat.size === 0 && emaAlerts.length > 0) {
            const defaultChatId = getApiConfig().TELEGRAM_CHAT_ID;
            if (defaultChatId) byChat.set(defaultChatId, []);
        }

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
                rec.dataset = null;
                rec.integrityWarning = null;
                rec.closeEnoughToExit = false;
                rec.closeEnoughToEntry = false;
                rec.confirmExit = false;
                rec.confirmEntry = false;

                // 1) Check historical data freshness
                try {
                    const hist = await refreshHistIfMissingYesterday(w.symbol, nowEt, histProvider);
                    rec.dataset = hist.dataset || null;
                    rec.histFresh = hist.histFresh;
                    if (hist.fetched) apiCallsMade++;
                    else apiCallsSkipped++;
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

                    let knownSplits = [];
                    try {
                        knownSplits = getTickerSplits(w.symbol);
                    } catch {
                        knownSplits = [];
                    }
                    const integrity = evaluatePriceIntegrity({
                        symbol: w.symbol,
                        dataset: rec.dataset || getDataset(w.symbol),
                        currentPrice,
                        currentDate: todayKey,
                        quote,
                        knownSplits,
                    });
                    if (integrity.blockSignals) {
                        rec.integrityWarning = integrity;
                        rec.quote = { ...quote, current: currentPrice };
                        rec.range = { ...range, low: normalizedRange.low, high: normalizedRange.high };
                        rec.fetchError = 'integrity_blocked';
                        rec.dataOk = false;
                        rec.rtFresh = true;
                        continue;
                    }

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
                const integrityWarnings = collectIntegrityWarnings(sorted, emaAlerts);
                const integritySummary = formatIntegrityWarningBlock(integrityWarnings);
                const blocks = [];
                const logLines = [`T-11 overview → chat ${chatId}`];
                const openTradeForOverview = getCurrentOpenTrade();

                for (const rec of sorted) {
                    const { w } = rec;
                    const positionOpen = !!openTradeForOverview && openTradeForOverview.symbol === w.symbol;
                    const type = positionOpen ? 'выход' : 'вход';
                    const near = positionOpen ? rec.closeEnoughToExit : rec.closeEnoughToEntry;
                    const nearStr = rec.dataOk ? (near ? 'да' : 'нет') : '—';
                    const priceStr = rec.quote ? formatMoney(rec.quote.current) : '-';
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
                    const line4 = rec.integrityWarning
                        ? 'Сигнал: заблокирован проверкой данных'
                        : `Сигнал (${type}): ${nearStr}`;
                    blocks.push([line1, line2, line3, line4].join('\n'));

                    logLines.push(rec.dataOk
                        ? `${w.symbol} pos=${positionOpen ? 'open' : 'none'} IBS=${ibsStr} near=${nearStr}`
                        : `${w.symbol} pos=${positionOpen ? 'open' : 'none'} data=NA err=${rec.fetchError}`);
                }

                // Build signals summary (EMA content lives in a separate message now — see below)
                let signalsSummary = '🔔 СИГНАЛЫ:\n';
                signalsSummary += entrySignals.length > 0
                    ? `• На вход: ${entrySignals.join(', ')}\n`
                    : '• На вход: нет\n';
                signalsSummary += exitSignals.length > 0
                    ? `• На выход: ${exitSignals.join(', ')}`
                    : '• На выход: нет';

                const consistencySummary = consistencySnapshot.issues.length > 0
                    ? `\n\n⚠️ СОСТОЯНИЕ:\n${consistencySnapshot.issues.map((issue) => `• ${issue.message}`).join('\n')}`
                    : '';
                const integrityBlock = integritySummary ? `\n\n${integritySummary}` : '';
                const text = `<pre>${header}\n\n${signalsSummary}${integrityBlock}${consistencySummary}\n\n📊 ПОДРОБНО:\n\n${blocks.join('\n\n')}</pre>`;
                const resp = await sendTelegramMessage(chatId, text);

                if (resp.ok) {
                    if (!options || options.updateState !== false) {
                        state.t11Sent = true;
                        aggregateSendState.set(chatId, state);
                    }
                    await appendMonitorLog([...logLines, options && options.test ? '→ sent ok [TEST]' : '→ sent ok']);

                    // Separate EMA message (buy/sell near info + info-level -20% crossing), sent
                    // only after the standard overview lands successfully, and only if there's content.
                    const emaText = buildEmaOverviewMessageText(emaAlerts);
                    if (emaText) {
                        const emaResp = await sendTelegramMessage(chatId, emaText);
                        if (emaResp.ok) {
                            const shouldPersistEma = !options || options.updateState !== false;
                            if (shouldPersistEma) {
                                try {
                                    recordEmaInfoSides(emaAlerts, new Date().toISOString());
                                } catch { /* non-fatal */ }
                            }
                            await appendMonitorLog([`T-11 EMA message → chat ${chatId}`, '→ sent ok']);
                        } else {
                            await appendMonitorLog([`T-11 EMA message → chat ${chatId}`, '→ send failed']);
                        }
                    }
                } else {
                    await appendMonitorLog([...logLines, '→ send failed']);
                }
            }

            // T-1 confirmations message
            if (minutesUntilClose === 1 && (!state.t1Sent || (options && options.forceSend))) {
                const nowIso = new Date().toISOString();
                const shouldPersistState = !options || options.updateState !== false;
                const entryCandidates = [];
                const potentialExitDetails = [];
                const potentialEntryDetails = [];
                const executionLogLines = [`T-1 execution start → chat ${chatId} date=${todayKey}`];
                await appendAutotradeEvent('t1_execution_started', {
                    source: 'telegram_t1',
                    chat_id: String(chatId),
                    date_key: todayKey,
                    mode: options && options.test ? 'dry_run' : 'live',
                });

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
                const blockingMismatch = getBlockingMonitorMismatch(consistencySnapshot);
                let exitAction = null;
                let exitBlockedAction = null;
                let entryAction = null;
                let entryBlockedAction = null;

                if (blockingMismatch) {
                    executionLogLines.push(`monitor_mismatch code=${blockingMismatch.code} message=${blockingMismatch.message}`);
                    await appendAutotradeEvent('t1_monitor_mismatch', {
                        source: 'telegram_t1',
                        chat_id: String(chatId),
                        date_key: todayKey,
                        symbol: openTradeBefore ? openTradeBefore.symbol : null,
                        monitor_trade_id: openTradeBefore ? openTradeBefore.id : null,
                        mismatch_code: blockingMismatch.code,
                        error: blockingMismatch.message,
                        mode: options && options.test ? 'dry_run' : 'live',
                    }, 'warn');
                }

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
                            const exitCorrelationId = crypto.randomUUID().replace(/-/g, '');
                            const brokerExit = await executeWebullSignal({
                                action: 'exit',
                                symbol: w.symbol,
                                currentPrice: rec.quote?.current ?? null,
                                ibs: rec.ibs,
                                decisionTime: nowIso,
                                dateKey: todayKey,
                                source: 'telegram_t1_exit',
                                forceDryRun: !!(options && options.test),
                                correlationId: exitCorrelationId,
                            });
                            await appendAutotradeEvent('t1_signal_confirmed', {
                                source: 'telegram_t1_exit',
                                correlation_id: brokerExit.correlationId || exitCorrelationId,
                                symbol: w.symbol,
                                action: 'exit',
                                status: brokerExit.submitted ? 'submitted' : 'blocked',
                                mode: brokerExit.mode,
                                quantity: brokerExit.quantity ?? null,
                                price: typeof rec.quote?.current === 'number' ? Number(rec.quote.current.toFixed(4)) : null,
                                ibs: typeof rec.ibs === 'number' ? Number(rec.ibs.toFixed(4)) : null,
                                decision_time: nowIso,
                                date_key: todayKey,
                                error: brokerExit.error || null,
                                simulated: !!brokerExit.simulated,
                                client_order_id: brokerExit.clientOrderId || null,
                                chat_id: String(chatId),
                            }, brokerExit.submitted ? 'info' : 'warn');
                            executionLogLines.push(`exit symbol=${w.symbol} broker_mode=${brokerExit.mode} submitted=${brokerExit.submitted ? 'yes' : 'no'} simulated=${brokerExit.simulated ? 'yes' : 'no'}${brokerExit.error ? ` error=${brokerExit.error}` : ''}`);
                            const monitorExit = shouldPersistState
                                ? recordTradeExit({
                                    symbol: w.symbol,
                                    price: rec.quote?.current ?? null,
                                    ibs: rec.ibs,
                                    decisionTime: nowIso,
                                    dateKey: todayKey,
                                    clientOrderId: brokerExit.clientOrderId || null,
                                    filledQty: brokerExit.quantity ?? null,
                                })
                                : null;
                            exitAction = {
                                symbol: w.symbol,
                                price: rec.quote?.current ?? null,
                                ibs: rec.ibs,
                                broker: brokerExit,
                                monitorTrade: monitorExit,
                            };
                            if (shouldPersistState) {
                                w.sent.confirm1 = true;
                            }
                        }
                    }

                    // Check for entry
                    const hasOpenMonitorPosition = !!openTradeBefore && openTradeBefore.symbol === w.symbol;
                    if (rec.confirmEntry && !hasOpenMonitorPosition) {
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
                    if (shouldPersistState) {
                        syncWatchesWithTradeState();
                    }
                }

                const waitingForExitFill = false;
                const openTradeAfterExit = getCurrentOpenTrade();
                if (waitingForExitFill) {
                    executionLogLines.push(`entry blocked: waiting for exit fill confirmation for ${exitAction.symbol}`);
                    await appendAutotradeEvent('t1_entry_blocked_waiting_exit_fill', {
                        source: 'telegram_t1_entry',
                        chat_id: String(chatId),
                        date_key: todayKey,
                        symbol: exitAction.symbol,
                        exit_client_order_id: exitAction.broker.clientOrderId || null,
                        mode: exitAction.broker.mode,
                    }, 'warn');
                }
                if (!waitingForExitFill && !openTradeAfterExit && entryCandidates.length > 0) {
                    const available = entryCandidates.filter(r => r.confirmEntry && r.dataOk);
                    if (available.length > 0) {
                        const best = available.reduce((best, rec) => {
                            if (!best) return rec;
                            if (rec.ibs == null) return best;
                            if (best.ibs == null) return rec;
                            return rec.ibs < best.ibs ? rec : best;
                        }, null);

                        if (best) {
                            const entryCorrelationId = crypto.randomUUID().replace(/-/g, '');
                            const brokerEntry = await executeWebullSignal({
                                action: 'entry',
                                symbol: best.w.symbol,
                                currentPrice: best.quote?.current ?? null,
                                ibs: best.ibs,
                                decisionTime: nowIso,
                                dateKey: todayKey,
                                source: 'telegram_t1_entry',
                                forceDryRun: !!(options && options.test),
                                correlationId: entryCorrelationId,
                            });
                            await appendAutotradeEvent('t1_signal_confirmed', {
                                source: 'telegram_t1_entry',
                                correlation_id: brokerEntry.correlationId || entryCorrelationId,
                                symbol: best.w.symbol,
                                action: 'entry',
                                status: brokerEntry.submitted ? 'submitted' : 'blocked',
                                mode: brokerEntry.mode,
                                quantity: brokerEntry.quantity ?? null,
                                price: typeof best.quote?.current === 'number' ? Number(best.quote.current.toFixed(4)) : null,
                                ibs: typeof best.ibs === 'number' ? Number(best.ibs.toFixed(4)) : null,
                                decision_time: nowIso,
                                date_key: todayKey,
                                error: brokerEntry.error || null,
                                simulated: !!brokerEntry.simulated,
                                client_order_id: brokerEntry.clientOrderId || null,
                                chat_id: String(chatId),
                            }, brokerEntry.submitted ? 'info' : 'warn');
                            executionLogLines.push(`entry symbol=${best.w.symbol} broker_mode=${brokerEntry.mode} submitted=${brokerEntry.submitted ? 'yes' : 'no'} simulated=${brokerEntry.simulated ? 'yes' : 'no'}${brokerEntry.error ? ` error=${brokerEntry.error}` : ''}`);
                            const monitorEntry = shouldPersistState
                                ? recordTradeEntry({
                                    symbol: best.w.symbol,
                                    price: best.quote?.current ?? null,
                                    ibs: best.ibs,
                                    decisionTime: nowIso,
                                    dateKey: todayKey,
                                    source: brokerEntry.submitted ? 'telegram_t1_entry' : 'telegram_t1_entry_monitor_only',
                                    clientOrderId: brokerEntry.clientOrderId || null,
                                    filledQty: brokerEntry.quantity ?? null,
                                    quantity: brokerEntry.quantity ?? null,
                                })
                                : null;
                            entryAction = {
                                symbol: best.w.symbol,
                                price: best.quote?.current ?? null,
                                ibs: best.ibs,
                                broker: brokerEntry,
                                monitorTrade: monitorEntry,
                            };
                        }
                    }
                }

                // Final sync
                if (shouldPersistState) {
                    syncWatchesWithTradeState();
                }

                // Build T-1 message
                const openTradeNow = getCurrentOpenTrade();
                const decisionLines = [];
                const reachedEmaAlerts = emaAlerts.filter((alert) => alert.dataOk && alert.reached);
                const integrityWarnings = collectIntegrityWarnings(list, emaAlerts);
                const integritySummary = formatIntegrityWarningBlock(integrityWarnings);
                if (blockingMismatch) {
                    decisionLines.push(`• Состояние брокера: ${blockingMismatch.message}`);
                    decisionLines.push('• Monitor продолжает считать позиции независимо от брокера');
                }
                if (exitAction) {
                    const price = typeof exitAction.price === 'number' ? `$${exitAction.price.toFixed(2)}` : '—';
                    const ibs = exitAction.ibs != null ? `${(exitAction.ibs * 100).toFixed(1)}%` : '—';
                    decisionLines.push(`• Закрываем ${exitAction.symbol} по ${price} (IBS ${ibs})`);
                    if (exitAction.broker) {
                        if (exitAction.broker.submitted) {
                            decisionLines.push(`• Webull: SELL MARKET отправлен (${exitAction.broker.quantity ?? '—'} шт.)`);
                        } else {
                            decisionLines.push(`• Webull ошибка: ${exitAction.broker.error || 'ордер не отправлен'}`);
                        }
                    }
                } else if (exitBlockedAction) {
                    const price = typeof exitBlockedAction.price === 'number' ? `$${exitBlockedAction.price.toFixed(2)}` : '—';
                    const ibs = exitBlockedAction.ibs != null ? `${(exitBlockedAction.ibs * 100).toFixed(1)}%` : '—';
                    decisionLines.push(`• Выход ${exitBlockedAction.symbol} подтвержден по ${price} (IBS ${ibs}), но не отправлен`);
                    decisionLines.push(`• Webull: ${exitBlockedAction.broker.error || 'ордер не отправлен'}`);
                }
                if (entryAction) {
                    const price = typeof entryAction.price === 'number' ? `$${entryAction.price.toFixed(2)}` : '—';
                    const ibs = entryAction.ibs != null ? `${(entryAction.ibs * 100).toFixed(1)}%` : '—';
                    decisionLines.push(`• Открываем ${entryAction.symbol} по ${price} (IBS ${ibs})`);
                    if (entryAction.broker) {
                        if (entryAction.broker.submitted) {
                            decisionLines.push(`• Webull: BUY MARKET отправлен (${entryAction.broker.quantity ?? '—'} шт.)`);
                        } else {
                            decisionLines.push(`• Webull ошибка: ${entryAction.broker.error || 'ордер не отправлен'}`);
                        }
                    }
                } else if (entryBlockedAction) {
                    const price = typeof entryBlockedAction.price === 'number' ? `$${entryBlockedAction.price.toFixed(2)}` : '—';
                    const ibs = entryBlockedAction.ibs != null ? `${(entryBlockedAction.ibs * 100).toFixed(1)}%` : '—';
                    decisionLines.push(`• Вход ${entryBlockedAction.symbol} подтвержден по ${price} (IBS ${ibs}), но не отправлен`);
                    decisionLines.push(`• Webull: ${entryBlockedAction.broker.error || 'ордер не отправлен'}`);
                }
                // EMA reached/info-crossing content now lives in a separate message (see below),
                // sent only after this standard decision message lands successfully.
                if (integrityWarnings.length > 0) {
                    decisionLines.push(`• Проверка данных: сигналы заблокированы по ${integrityWarnings.map((warning) => warning.symbol).join(', ')}`);
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
                    ...(integritySummary ? [integritySummary, ''] : []),
                    '<b>🎯 РЕШЕНИЕ:</b>',
                    ...decisionLines,
                    '',
                    `${freshnessLine}`,
                    positionLine,
                ];

                const text = messageParts.join('\n');
                const resp = await sendTelegramMessage(chatId, text);

                if (resp.ok) {
                    if (shouldPersistState) {
                        state.t1Sent = true;
                        aggregateSendState.set(chatId, state);
                    }
                    await appendMonitorLog([`T-1 report → chat ${chatId}`, ...decisionLines, ...executionLogLines]);
                    await appendAutotradeEvent('t1_report_sent', {
                        source: 'telegram_t1',
                        chat_id: String(chatId),
                        date_key: todayKey,
                        decisions: decisionLines,
                    });

                    // Separate EMA message (reached buy/sell levels + info-level -20% crossings).
                    // The buy/sell alternation flip (markEmaAlertsTriggered) is tied to THIS
                    // message's successful send — if it fails, next_action must NOT flip, since
                    // the trader never actually saw the reached-level notification.
                    const emaText = buildEmaDecisionMessageText(reachedEmaAlerts, emaAlerts);
                    if (emaText) {
                        const emaResp = await sendTelegramMessage(chatId, emaText);
                        if (emaResp.ok) {
                            if (shouldPersistState) {
                                markEmaAlertsTriggered(reachedEmaAlerts, nowIso);
                                try {
                                    recordEmaInfoSides(emaAlerts, nowIso);
                                } catch { /* non-fatal */ }
                            }
                            await appendMonitorLog([`T-1 EMA message → chat ${chatId}`, '→ sent ok']);
                        } else {
                            await appendMonitorLog([`T-1 EMA message send failed → chat ${chatId}`]);
                        }
                    }
                } else {
                    await appendMonitorLog([`T-1 report send failed → chat ${chatId}`, ...decisionLines, ...executionLogLines]);
                    await appendAutotradeEvent('t1_report_failed', {
                        source: 'telegram_t1',
                        chat_id: String(chatId),
                        date_key: todayKey,
                        decisions: decisionLines,
                    }, 'warn');
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
    getProviderAbbrev,
};
