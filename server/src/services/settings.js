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
        indicatorPanePercent: 30,
        defaultMultiTickerSymbols: 'SPY,QQQ,IWM'
    };
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
                cachedSettings = { ...getDefaultSettings(), ...stored };
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
 */
async function writeSettings(settings) {
    return await settingsMutex.runExclusive(async () => {
        try {
            await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
            cachedSettings = { ...settings };
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
