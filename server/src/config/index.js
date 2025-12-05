/**
 * Central configuration module
 * Loads environment variables and provides paths/settings
 */
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Load environment variables from multiple sources
const userConfigPath = path.join(os.homedir(), 'stonks-config', '.env');

if (process.env.NODE_ENV === 'production') {
    console.log('Production mode: Relying on environment variables (e.g. from Docker env_file). Skipping local .env files.');
} else {
    // DEVELOPMENT MODE: Flexible loading
    if (fs.existsSync(userConfigPath)) {
        console.log(`Loading config from ${userConfigPath}`);
        require('dotenv').config({ path: userConfigPath });
    }

    const serverEnvPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(serverEnvPath)) {
        console.log(`Loading config from ${serverEnvPath}`);
        require('dotenv').config({ path: serverEnvPath });
    }

    const rootEnvPath = path.join(__dirname, '../../../.env');
    if (fs.existsSync(rootEnvPath)) {
        console.log(`Loading config from ${rootEnvPath}`);
        require('dotenv').config({ path: rootEnvPath });
    }

    require('dotenv').config();
}

const { parseNonNegativeNumber } = require('../utils/helpers');

// Directory paths
const SERVER_DIR = path.join(__dirname, '../..');
const PORT = process.env.PORT || 3001;
const DATASETS_DIR = process.env.DATASETS_DIR || path.join(SERVER_DIR, 'datasets');
const KEEP_DATASETS_DIR = path.join(SERVER_DIR, '_keep', 'datasets');
const SETTINGS_FILE = process.env.SETTINGS_FILE || path.join(SERVER_DIR, 'settings.json');
const SPLITS_FILE = process.env.SPLITS_FILE || path.join(SERVER_DIR, 'splits.json');
const WATCHES_FILE = process.env.WATCHES_FILE || path.join(SERVER_DIR, 'telegram-watches.json');
const TRADE_HISTORY_FILE = process.env.TRADE_HISTORY_FILE || path.join(SERVER_DIR, 'trade-history.json');
const MONITOR_LOG_FILE = process.env.MONITOR_LOG_PATH || path.join(DATASETS_DIR, 'monitoring.log');
const LOGIN_LOG_FILE = process.env.LOGIN_LOG_PATH || path.join(DATASETS_DIR, 'login-attempts.log');
const TRADING_CALENDAR_FILE = path.join(SERVER_DIR, 'trading-calendar.json');

// Timing constants
const PRICE_ACTUALIZATION_REQUEST_DELAY_MS = parseNonNegativeNumber(
    process.env.PRICE_ACTUALIZATION_REQUEST_DELAY_MS,
    15000
);
const PRICE_ACTUALIZATION_DELAY_JITTER_MS = parseNonNegativeNumber(
    process.env.PRICE_ACTUALIZATION_DELAY_JITTER_MS,
    2000
);

// Environment
const IS_PROD = process.env.NODE_ENV === 'production';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// Auth constants
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin@example.com').toLowerCase();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOGIN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOGIN_MAX_ATTEMPTS = 3;

// API Configuration - loaded from environment variables only
function getApiConfig() {
    return {
        ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY || '',
        FINNHUB_API_KEY: process.env.FINNHUB_API_KEY || '',
        TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY || '',
        POLYGON_API_KEY: process.env.POLYGON_API_KEY || '',
        PREFERRED_API_PROVIDER: process.env.PREFERRED_API_PROVIDER || 'alpha_vantage',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''
    };
}

// Settings from JSON file
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return fs.readJsonSync(SETTINGS_FILE);
        }
    } catch (e) {
        console.warn('Failed to load settings:', e.message);
    }
    return {};
}

module.exports = {
    // Paths
    SERVER_DIR,
    PORT,
    DATASETS_DIR,
    KEEP_DATASETS_DIR,
    SETTINGS_FILE,
    SPLITS_FILE,
    WATCHES_FILE,
    TRADE_HISTORY_FILE,
    MONITOR_LOG_FILE,
    LOGIN_LOG_FILE,
    TRADING_CALENDAR_FILE,

    // Timing
    PRICE_ACTUALIZATION_REQUEST_DELAY_MS,
    PRICE_ACTUALIZATION_DELAY_JITTER_MS,

    // Environment
    IS_PROD,
    FRONTEND_ORIGIN,

    // Auth
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    SESSION_TTL_MS,
    LOGIN_WINDOW_MS,
    LOGIN_MAX_ATTEMPTS,

    // Functions
    getApiConfig,
    loadSettings,
};
