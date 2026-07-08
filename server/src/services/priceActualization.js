/**
 * Price Actualization Service
 * Handles refreshing historical OHLC data and checking freshness
 * 
 * ВАЖНО: Использует настраиваемый провайдер вместо захардкоженного Alpha Vantage
 */
const fs = require('fs-extra');
const { getApiConfig, PRICE_ACTUALIZATION_REQUEST_DELAY_MS, PRICE_ACTUALIZATION_DELAY_JITTER_MS, DATASETS_DIR } = require('../config');
const { readSettings } = require('./settings');
const { getDataset, getDatasetMetadata, saveDataset } = require('./datasets');
const { toSafeTicker } = require('../utils/helpers');
const { telegramWatches, sendTelegramMessage } = require('./telegram');
const { getTickerSplits, upsertTickerSplits } = require('./splits');
const { formatIntegrityWarningBlock } = require('./marketDataIntegrity');
const {
    evaluateOhlcMergeIntegrity,
    sendDataIntegrityAlert,
    fetchHistoricalMarketData,
    normalizeSplitEvents,
} = require('./dataIngestion');
const {
    loadTradeHistory,
    syncWatchesWithTradeState,
    getCurrentOpenTrade,
    isTradeHistoryLoaded
} = require('./trades');
const { getETParts, etKeyYMD, previousTradingDayET, getTradingSessionForDateET, isTradingDayByCalendarET, getCachedTradingCalendar } = require('./dates');
const { reconcileMonitorState } = require('./monitorConsistency');

// Price actualization state
const priceActualizationState = {
    lastRunDateKey: null,
    status: 'idle',
    startedAt: null,
    completedAt: null,
    source: null,
    error: null,
};

// Monitoring log helper
async function appendMonitorLog(lines) {
    try {
        const MONITOR_LOG_FILE = process.env.MONITOR_LOG_PATH || require('path').join(DATASETS_DIR, 'monitoring.log');
        await fs.ensureFile(MONITOR_LOG_FILE);
        const ts = new Date().toISOString();
        const formatted = lines.map(line => `[${ts}] ${line}`).join('\n') + '\n';
        await fs.appendFile(MONITOR_LOG_FILE, formatted);
    } catch (e) {
        console.warn('Failed to append to monitor log:', e.message);
    }
}

function computePriceActualizationDelayMs() {
    const base = PRICE_ACTUALIZATION_REQUEST_DELAY_MS || 15000;
    const jitterMax = PRICE_ACTUALIZATION_DELAY_JITTER_MS || 2000;
    if (base <= 0 && jitterMax <= 0) {
        return 0;
    }
    const jitter = jitterMax > 0 ? Math.floor(Math.random() * (jitterMax + 1)) : 0;
    return base + jitter;
}

async function waitForPriceActualizationThrottle({ symbol, index, total }) {
    const delayMs = computePriceActualizationDelayMs();
    if (delayMs <= 0) {
        return;
    }
    const seconds = (delayMs / 1000).toFixed(1);
    console.log(
        `⏳ Throttling requests: waiting ${seconds}s before next ticker (processed ${index + 1}/${total}, last ${symbol})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Refresh ticker data and check freshness
 * ИСПРАВЛЕНО: Использует настраиваемый провайдер из settings.resultsRefreshProvider
 * 
 * @param {string} symbol - Ticker symbol
 * @param {object} nowEtParts - Current ET time parts
 * @param {string} provider - Provider to use ('alpha_vantage', 'finnhub', 'twelve_data')
 * @returns {object} { fresh: boolean, provider: string }
 */
async function refreshTickerAndCheckFreshness(symbol, nowEtParts, provider = 'finnhub') {
    const ticker = toSafeTicker(symbol);
    if (!ticker) return { fresh: false, provider };

    const toDateKey = (d) => {
        try {
            if (typeof d === 'string') return d.slice(0, 10);
            return new Date(d).toISOString().slice(0, 10);
        } catch { return ''; }
    };

    const prev = previousTradingDayET(nowEtParts);
    const prevKey = etKeyYMD(prev);

    let dataset = getDataset(ticker);
    if (!dataset) {
        dataset = {
            name: ticker,
            ticker,
            data: [],
            dataPoints: 0,
            dateRange: { from: null, to: null },
            uploadDate: new Date().toISOString(),
        };
    }

    const lastExistingDate = (() => {
        if (dataset && Array.isArray(dataset.data) && dataset.data.length) {
            const lastBar = dataset.data[dataset.data.length - 1];
            return toDateKey(lastBar && lastBar.date);
        }
        const drTo = dataset && dataset.dateRange && dataset.dateRange.to;
        return toDateKey(drTo);
    })();

    const endTs = Math.floor(Date.now() / 1000);
    let startTs;
    if (lastExistingDate) {
        const last = new Date(`${lastExistingDate}T00:00:00.000Z`);
        const start = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - 7, 0, 0, 0));
        startTs = Math.floor(start.getTime() / 1000);
    } else {
        startTs = endTs - 120 * 24 * 60 * 60; // 120 days back for initial seed
    }

    try {
        const fetched = await fetchHistoricalMarketData(ticker, startTs, endTs, provider, { adjustment: 'none' });
        const rows = fetched.rows;

        let knownSplits = [];
        try {
            knownSplits = getTickerSplits(ticker);
        } catch {
            knownSplits = [];
        }
        const fetchedSplits = normalizeSplitEvents(fetched.splits);
        const integrity = evaluateOhlcMergeIntegrity({
            symbol: ticker,
            existingRows: dataset.data || [],
            incomingRows: rows,
            knownSplits: [...knownSplits, ...fetchedSplits],
            adjustedForSplits: Boolean(dataset.adjustedForSplits),
        });

        saveDataset({ ...dataset, data: integrity.mergedRows, uploadDate: new Date().toISOString(), name: ticker });
        if (fetchedSplits.length > 0) {
            upsertTickerSplits(ticker, fetchedSplits);
        }
        if (integrity.warnings.length > 0) {
            await sendDataIntegrityAlert({ symbol: ticker, action: `актуализация цен (${provider})`, warnings: integrity.warnings });
        }

        const fresh = integrity.mergedRows.some((row) => row.date === prevKey);
        const updatedMeta = getDatasetMetadata(ticker);
        return { fresh, provider, lastDate: updatedMeta?.dateRange?.to };
    } catch (e) {
        console.warn(`Failed to refresh ${ticker} via ${provider}:`, e.message);
        return {
            fresh: false,
            provider,
            error: e.message,
            integrityWarnings: Array.isArray(e.integrity?.warnings) ? e.integrity.warnings : [],
        };
    }
}

/**
 * Main price actualization function
 * Runs 16 minutes AFTER market close to update final prices
 */
async function runPriceActualization(options = {}) {
    const { force = false, source = 'unknown' } = options;

    const nowEt = getETParts(new Date());
    const todayKey = etKeyYMD(nowEt);

    // Get configured provider
    const settings = await readSettings();
    const provider = settings.resultsRefreshProvider || 'finnhub';
    const autoActualizationEnabled = settings.enablePostClosePriceActualization === true;

    if (!force && !autoActualizationEnabled) {
        return {
            updated: false,
            reason: 'disabled_by_settings',
            todayKey,
            provider
        };
    }

    // Check if we should run
    const cal = getCachedTradingCalendar();
    if (!isTradingDayByCalendarET(nowEt, cal) && !force) {
        return {
            updated: false,
            reason: 'not_trading_day',
            todayKey
        };
    }

    const session = getTradingSessionForDateET(nowEt, cal);
    const minutesAfterClose = nowEt.hh * 60 + nowEt.mm - session.closeMin;

    // Target run window: 16-30 minutes after close
    const targetMinutesAfterClose = 16;
    if (!force && (minutesAfterClose < targetMinutesAfterClose || minutesAfterClose > 30)) {
        return {
            updated: false,
            reason: 'wrong_timing',
            todayKey,
            currentTime: `${String(nowEt.hh).padStart(2, '0')}:${String(nowEt.mm).padStart(2, '0')}`,
            targetRunTime: `${Math.floor((session.closeMin + targetMinutesAfterClose) / 60)}:${String((session.closeMin + targetMinutesAfterClose) % 60).padStart(2, '0')} ET`,
            minutesAfterClose
        };
    }

    // Check if already ran today
    if (!force && priceActualizationState.lastRunDateKey === todayKey && priceActualizationState.status === 'completed') {
        return {
            updated: false,
            reason: 'already_ran_today',
            todayKey
        };
    }

    // Start actualization
    priceActualizationState.lastRunDateKey = todayKey;
    priceActualizationState.status = 'running';
    priceActualizationState.startedAt = Date.now();
    priceActualizationState.source = source;
    priceActualizationState.error = null;

    console.log(`📊 Starting price actualization for ${todayKey} using ${provider}...`);
    await appendMonitorLog([`T+16min: начало актуализации цен (${provider})`]);

    try {
        const watchList = Array.from(telegramWatches.values());
        const totalTickers = watchList.length;

        if (totalTickers === 0) {
            priceActualizationState.status = 'completed';
            priceActualizationState.completedAt = Date.now();
            return {
                updated: false,
                reason: 'no_tickers',
                todayKey
            };
        }

        const updatedTickers = [];
        const failedTickers = [];
        const tickersWithoutTodayData = [];

        for (let i = 0; i < watchList.length; i++) {
            const watch = watchList[i];
            const symbol = watch.symbol;

            try {
                const result = await refreshTickerAndCheckFreshness(symbol, nowEt, provider);

                if (result.error) {
                    failedTickers.push({
                        symbol,
                        reason: result.error,
                        integrityWarnings: result.integrityWarnings || [],
                    });
                } else if (result.fresh) {
                    updatedTickers.push(symbol);
                } else {
                    tickersWithoutTodayData.push({ symbol, lastDate: result.lastDate || 'unknown' });
                }
            } catch (e) {
                failedTickers.push({ symbol, reason: e.message });
            }

            // Throttle between requests
            if (i < watchList.length - 1) {
                await waitForPriceActualizationThrottle({ symbol, index: i, total: totalTickers });
            }
        }

        const actuallyUpdated = updatedTickers.length;
        const hasProblems = failedTickers.length > 0 || tickersWithoutTodayData.length > 0;

        // Synchronize positions
        if (!isTradeHistoryLoaded()) {
            await loadTradeHistory().catch(err => {
                console.warn('Failed to load trade history:', err.message);
            });
        }

        reconcileMonitorState({ apply: true });
        syncWatchesWithTradeState();

        const openTradeAfterSync = getCurrentOpenTrade();

        // Send Telegram notification if there are problems
        const chatId = getApiConfig().TELEGRAM_CHAT_ID;
        if (hasProblems && chatId) {
            let telegramMsg = `⚠️ Актуализация цен (${todayKey}) [${provider.toUpperCase()}]\n\n`;
            telegramMsg += `🚨 ПРОБЛЕМЫ:\n`;

            if (tickersWithoutTodayData.length > 0) {
                telegramMsg += `• Без данных за сегодня: ${tickersWithoutTodayData.map(t => t.symbol).join(', ')}\n`;
            }
            if (failedTickers.length > 0) {
                telegramMsg += `• Ошибки: ${failedTickers.map(t => t.symbol).join(', ')}\n`;
            }

            const integrityWarnings = failedTickers.flatMap((ticker) => ticker.integrityWarnings || []);
            const integrityBlock = formatIntegrityWarningBlock(integrityWarnings);
            if (integrityBlock) {
                telegramMsg += `\n${integrityBlock}\n`;
            }

            telegramMsg += `\n📊 Успешно: ${actuallyUpdated}/${totalTickers}`;

            try {
                await sendTelegramMessage(chatId, telegramMsg);
            } catch (e) {
                console.warn('Failed to send Telegram notification:', e.message);
            }
        }

        priceActualizationState.status = 'completed';
        priceActualizationState.completedAt = Date.now();

        console.log(`✅ Price actualization completed: ${actuallyUpdated}/${totalTickers} updated`);

        return {
            updated: true,
            count: actuallyUpdated,
            tickers: updatedTickers,
            totalTickers,
            failedTickers,
            tickersWithoutTodayData,
            hasProblems,
            todayKey,
            provider
        };

    } catch (error) {
        console.error('💥 Price actualization error:', error.message);
        priceActualizationState.status = 'failed';
        priceActualizationState.completedAt = Date.now();
        priceActualizationState.error = error.message;

        try {
            await sendTelegramMessage(getApiConfig().TELEGRAM_CHAT_ID,
                `❌ КРИТИЧЕСКАЯ ОШИБКА актуализации цен\n\nОшибка: ${error.message}`);
        } catch { }

        return { updated: false, error: error.message };
    }
}

/**
 * Update all positions - synchronizes with trade history
 */
async function updateAllPositions() {
    console.log('🔄 Synchronizing monitored positions with trade history...');

    if (!isTradeHistoryLoaded()) {
        await loadTradeHistory().catch(err => {
            console.warn('Failed to load trade history during manual sync:', err.message);
        });
    }

    const reconcileSummary = reconcileMonitorState({ apply: true });
    const syncResult = syncWatchesWithTradeState();

    const openTrade = getCurrentOpenTrade();
    console.log(`✅ Position sync completed. Changes: ${syncResult.changes.length}`);

    return {
        changes: syncResult.changes,
        openTrade,
        consistency: reconcileSummary,
    };
}

function getPriceActualizationState() {
    return { ...priceActualizationState };
}

module.exports = {
    priceActualizationState,
    getPriceActualizationState,
    appendMonitorLog,
    refreshTickerAndCheckFreshness,
    runPriceActualization,
    updateAllPositions,
    waitForPriceActualizationThrottle,
};
