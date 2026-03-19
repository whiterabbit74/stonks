/**
 * Settings service
 */
const fs = require('fs-extra');
const { Mutex } = require('async-mutex');
const { SETTINGS_FILE } = require('../config');

// In-memory cache and synchronization
let cachedSettings = null;
const settingsMutex = new Mutex();

function getDefaultSettings() {
    return {
        watchThresholdPct: 0.3,
        resultsQuoteProvider: 'alpha_vantage',
        enhancerProvider: 'finnhub',
        resultsRefreshProvider: 'finnhub',
        enablePostClosePriceActualization: false,
        polygonApiKey: '',
        indicatorPanePercent: 30,
        defaultMultiTickerSymbols: 'SPY,QQQ,IWM',
        autoTrading: {
            enabled: false,
            provider: 'finnhub',
            lowIBS: 0.1,
            highIBS: 0.75,
            executionWindowSeconds: 90,
            allowNewEntries: true,
            allowExits: true,
            onlyFromTelegramWatches: true,
            symbols: '',
            entrySizingMode: 'balance',
            sizingMode: 'notional',
            fixedQuantity: 1,
            fixedNotionalUsd: 1000,
            maxPositionUsd: 0,
            allowFractionalShares: false,
            orderType: 'MARKET',
            timeInForce: 'DAY',
            supportTradingSession: 'CORE',
            maxSlippageBps: 25,
            previewBeforeSend: true,
            cancelOpenOrdersBeforeEntry: false,
            notes: '',
            lastModifiedAt: null
        }
    };
}

function normalizeAutoTradingSettings(autoTrading = {}) {
    const next = { ...autoTrading };
    delete next.dryRun;
    return next;
}

/**
 * Reads settings from cache or disk, ensuring thread safety.
 */
async function readSettings() {
    return await settingsMutex.runExclusive(async () => {
        if (cachedSettings) {
            return { ...cachedSettings }; // Return a copy
        }

        try {
            if (await fs.pathExists(SETTINGS_FILE)) {
                const stored = await fs.readJson(SETTINGS_FILE);
                const defaults = getDefaultSettings();
                cachedSettings = {
                    ...defaults,
                    ...stored,
                    autoTrading: {
                        ...defaults.autoTrading,
                        ...normalizeAutoTradingSettings(stored && stored.autoTrading ? stored.autoTrading : {})
                    }
                };
                if (cachedSettings.autoTrading) {
                    delete cachedSettings.autoTrading.dryRun;
                }
                return { ...cachedSettings };
            }
        } catch (e) {
            console.warn('Failed to read settings:', e.message);
        }

        // Fallback or first time default
        cachedSettings = getDefaultSettings();
        return { ...cachedSettings };
    });
}

/**
 * Writes settings to disk and updates cache, ensuring thread safety.
 * Uses asynchronous file I/O to avoid blocking the event loop.
 */
async function writeSettings(settings) {
    return await settingsMutex.runExclusive(async () => {
        try {
            const sanitized = {
                ...settings,
                autoTrading: normalizeAutoTradingSettings(settings && settings.autoTrading ? settings.autoTrading : {})
            };
            await fs.writeJson(SETTINGS_FILE, sanitized, { spaces: 2 });
            cachedSettings = { ...sanitized };
            return { ...cachedSettings };
        } catch (e) {
            console.error('Failed to write settings:', e.message);
            throw e;
        }
    });
}

module.exports = {
    getDefaultSettings,
    readSettings,
    writeSettings,
};
