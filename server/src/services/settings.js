/**
 * Settings service
 */
const fs = require('fs-extra');
const { SETTINGS_FILE } = require('../config');

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

async function readSettings() {
    try {
        if (await fs.pathExists(SETTINGS_FILE)) {
            const stored = await fs.readJson(SETTINGS_FILE);
            return { ...getDefaultSettings(), ...stored };
        }
    } catch (e) {
        console.warn('Failed to read settings:', e.message);
    }
    return getDefaultSettings();
}

async function writeSettings(settings) {
    await fs.writeJson(SETTINGS_FILE, settings, { spaces: 2 });
    return settings;
}

module.exports = {
    getDefaultSettings,
    readSettings,
    writeSettings,
};
