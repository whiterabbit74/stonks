// Load environment variables from multiple sources
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// 1. Try user's config dir (highest priority)
const userConfigPath = path.join(os.homedir(), 'stonks-config', '.env');

// STRICT MODE for Production: Only allow user config
// STRICT MODE for Production: Only allow environment variables (injected by Docker)
if (process.env.NODE_ENV === 'production') {
  console.log('Production mode: Relying on environment variables (e.g. from Docker env_file). Skipping local .env files.');
  // We do NOT load any .env files here. Docker injects the correct variables from ~/stonks-config/.env
} else {
  // DEVELOPMENT MODE: Flexible loading
  if (fs.existsSync(userConfigPath)) {
    console.log(`Loading config from ${userConfigPath}`);
    require('dotenv').config({ path: userConfigPath });
  }

  // 2. Try server/.env (if running from root)
  const serverEnvPath = path.join(__dirname, '.env');
  if (fs.existsSync(serverEnvPath)) {
    console.log(`Loading config from ${serverEnvPath}`);
    require('dotenv').config({ path: serverEnvPath });
  }

  // 3. Try project root .env
  const rootEnvPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(rootEnvPath)) {
    console.log(`Loading config from ${rootEnvPath}`);
    require('dotenv').config({ path: rootEnvPath });
  }

  // 4. Default .env (lowest priority)
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
const PORT = process.env.PORT || 3001;
const DATASETS_DIR = process.env.DATASETS_DIR || path.join(__dirname, 'datasets');
const KEEP_DATASETS_DIR = path.join(__dirname, '_keep', 'datasets');
let SETTINGS_FILE = process.env.SETTINGS_FILE || path.join(__dirname, 'settings.json');
let SPLITS_FILE = process.env.SPLITS_FILE || path.join(__dirname, 'splits.json');
let WATCHES_FILE = process.env.WATCHES_FILE || path.join(__dirname, 'telegram-watches.json');
let TRADE_HISTORY_FILE = process.env.TRADE_HISTORY_FILE || path.join(__dirname, 'trade-history.json');
const MONITOR_LOG_FILE = process.env.MONITOR_LOG_PATH || path.join(DATASETS_DIR, 'monitoring.log');

function parseNonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

const PRICE_ACTUALIZATION_REQUEST_DELAY_MS = parseNonNegativeNumber(
  process.env.PRICE_ACTUALIZATION_REQUEST_DELAY_MS,
  15000
);
const PRICE_ACTUALIZATION_DELAY_JITTER_MS = parseNonNegativeNumber(
  process.env.PRICE_ACTUALIZATION_DELAY_JITTER_MS,
  2000
);

// Load settings from JSON file
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

// Load splits from JSON file
function loadSplits() {
  try {
    if (fs.existsSync(SPLITS_FILE)) {
      return fs.readJsonSync(SPLITS_FILE);
    }
  } catch (e) {
    console.warn('Failed to load splits:', e.message);
  }
  return {};
}

let SETTINGS = loadSettings();

// API Configuration - now loaded from settings
function getApiConfig() {
  const settings = loadSettings();
  return {
    ALPHA_VANTAGE_API_KEY: settings.api?.alphaVantageKey || process.env.ALPHA_VANTAGE_API_KEY || '',
    FINNHUB_API_KEY: settings.api?.finnhubKey || process.env.FINNHUB_API_KEY || '',
    TWELVE_DATA_API_KEY: settings.api?.twelveDataKey || process.env.TWELVE_DATA_API_KEY || '',
    POLYGON_API_KEY: settings.api?.polygonKey || process.env.POLYGON_API_KEY || '',
    PREFERRED_API_PROVIDER: process.env.PREFERRED_API_PROVIDER || 'alpha_vantage',
    TELEGRAM_BOT_TOKEN: settings.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: settings.telegram?.chatId || process.env.TELEGRAM_CHAT_ID || ''
  };
}

let API_CONFIG = getApiConfig();

// Apply global middleware early (so it affects ALL routes)
// CORS with credentials (to support cookie-based auth)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true,
}));
// Handle preflight explicitly
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '5mb' }));

// Rate limiting middleware
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many API requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Configure for use behind reverse proxy
  trustProxy: true,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 uploads per windowMs
  message: 'Too many uploads from this IP, please try again later.',
  // Configure for use behind reverse proxy
  trustProxy: true,
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

app.use('/api/', apiLimiter);
app.use('/upload', uploadLimiter);

// Disable ETag to avoid 304 for dynamic JSON payloads
app.set('etag', false);

// Ensure config storage exists and not directories
function ensureRegularFileSync(filePath, defaultContent) {
  try {
    const st = fs.pathExistsSync(filePath) ? fs.statSync(filePath) : null;
    if (st && st.isDirectory()) {
      // If path is directory (bad mount), rename it away and create a file instead
      const backup = `${filePath}.bak-${Date.now()}`;
      try { fs.renameSync(filePath, backup); } catch { }
    }
    if (!fs.pathExistsSync(filePath) || (st && st.isDirectory())) {
      fs.ensureFileSync(filePath);
      fs.writeJsonSync(filePath, defaultContent, { spaces: 2 });
    }
  } catch { }
}

// Ensure splits storage exists
async function ensureSplitsFile() {
  try {
    ensureRegularFileSync(SPLITS_FILE, {});
  } catch { }
}
ensureSplitsFile().catch((err) => {
  console.warn('Failed to ensure splits file exists:', err.message);
});

// Ensure settings and watches storages exist as well (best-effort)
try { ensureRegularFileSync(SETTINGS_FILE, {}); } catch { }
try { ensureRegularFileSync(WATCHES_FILE, []); } catch { }
try { ensureRegularFileSync(TRADE_HISTORY_FILE, []); } catch { }

async function appendSafe(filePath, line) {
  try {
    await fs.ensureFile(filePath);
    await fs.appendFile(filePath, line);
  } catch (e) {
    if (e && e.code === 'EACCES') {
      if (!appendSafe._eaccesWarned) {
        console.warn(`No write permission for ${filePath}`);
        appendSafe._eaccesWarned = true;
      }
      return;
    }
    console.warn(`Append failed for ${filePath}: ${e.message}`);
  }
}

async function readSplitsMap() {
  try {
    await ensureSplitsFile();
    const json = await fs.readJson(SPLITS_FILE);
    return (json && typeof json === 'object') ? json : {};
  } catch {
    return {};
  }
}

function normalizeSplitEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const valid = list
    .filter(e => e && typeof e.date === 'string' && e.date.length >= 10 && typeof e.factor === 'number' && isFinite(e.factor) && e.factor > 0)
    .map(e => ({ date: e.date.slice(0, 10), factor: Number(e.factor) }))
    .filter(e => e.factor !== 1);
  const byDate = new Map();
  for (const e of valid) byDate.set(e.date, e);
  return Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function getTickerSplits(ticker) {
  const map = await readSplitsMap();
  const key = toSafeTicker(ticker);
  const arr = normalizeSplitEvents(map[key] || []);
  return arr;
}

async function upsertTickerSplits(ticker, events) {
  const key = toSafeTicker(ticker);
  const map = await readSplitsMap();
  const existing = normalizeSplitEvents(map[key] || []);
  const incoming = normalizeSplitEvents(events || []);
  const byDate = new Map();
  for (const e of existing) byDate.set(e.date, e);
  for (const e of incoming) byDate.set(e.date, e);
  const merged = Array.from(byDate.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
  map[key] = merged;
  await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
  return merged;
}

// New helpers to replace and delete splits for a ticker
async function setTickerSplits(ticker, events) {
  const key = toSafeTicker(ticker);
  const map = await readSplitsMap();
  const normalized = normalizeSplitEvents(events || []);
  if (normalized.length > 0) {
    map[key] = normalized;
  } else {
    delete map[key];
  }
  await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
  return map[key] || [];
}

async function deleteTickerSplitByDate(ticker, date) {
  const key = toSafeTicker(ticker);
  const map = await readSplitsMap();
  const existing = normalizeSplitEvents(map[key] || []);
  const safeDate = (date || '').toString().slice(0, 10);
  const filtered = existing.filter(e => e.date !== safeDate);
  if (filtered.length > 0) {
    map[key] = filtered;
  } else {
    delete map[key];
  }
  await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
  return map[key] || [];
}

async function deleteTickerSplits(ticker) {
  const key = toSafeTicker(ticker);
  const map = await readSplitsMap();
  if (map[key]) delete map[key];
  await fs.writeJson(SPLITS_FILE, map, { spaces: 2 });
  return true;
}

// Telegram config
// Telegram settings now loaded from getApiConfig()

// Simple username+password auth (opt-in via env)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin@example.com').toLowerCase();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const sessions = new Map(); // token -> { createdAt, expiresAt }
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').map(v => v.trim()).filter(Boolean).forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) {
      const k = p.slice(0, i);
      const v = p.slice(i + 1);
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  });
  return out;
}
function getAuthTokenFromHeader(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h || typeof h !== 'string') return null;
  const m = /^Bearer\s+([a-f0-9]{32})$/i.exec(h);
  return m ? m[1] : null;
}
function createToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
}
function isValidToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{32}$/i.test(token);
}
function shouldUseSecureCookie(req) {
  try {
    if (!IS_PROD) return false;
    if (req && req.secure) return true;
    const xfProto = (req && (req.headers['x-forwarded-proto'] || '')).toString().toLowerCase();
    return xfProto === 'https';
  } catch {
    return IS_PROD;
  }
}
function setAuthCookie(req, res, token, remember) {
  const maxAge = remember ? SESSION_TTL_MS : undefined;
  const parts = [
    `auth_token=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (maxAge) parts.push(`Max-Age=${Math.floor(maxAge / 1000)}`);
  parts.push('HttpOnly');
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function clearAuthCookie(req, res) {
  const parts = [
    'auth_token=',
    'Path=/',
    'SameSite=Lax',
    'HttpOnly',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) {
    if (IS_PROD) {
      return res.status(503).json({ error: 'Auth not configured' });
    }
    return next();
  }
  if (req.method === 'OPTIONS') return next();
  // Разрешаем только статус/логин/проверку/календарь/метаданные датасетов; всё остальное — под авторизацией
  if (
    req.path === '/api/status' ||
    req.path === '/api/login' ||
    req.path === '/api/logout' ||
    req.path === '/api/auth/check' ||
    req.path === '/api/trading-calendar' ||
    req.path.match(/^\/api\/datasets\/[^\/]+\/metadata$/)
  ) {
    return next();
  }
  const cookies = parseCookies(req);
  let token = cookies.auth_token || getAuthTokenFromHeader(req);
  if (!isValidToken(token)) token = null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const sess = sessions.get(token);
  if (!sess || sess.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

// Trading calendar endpoint: return calendar data from trading-calendar.json
app.get('/api/trading-calendar', async (req, res) => {
  try {
    const calendarPath = path.join(__dirname, 'trading-calendar.json');
    let calendarData;

    if (await fs.pathExists(calendarPath)) {
      calendarData = await fs.readJson(calendarPath);
    } else {
      calendarData = {
        metadata: { version: "1.0", years: [2024, 2025] },
        holidays: {
          "2024-01-01": "Новый год",
          "2024-02-23": "День защитника Отечества",
          "2024-03-08": "Международный женский день",
          "2024-05-01": "Праздник Весны и Труда",
          "2024-05-09": "День Победы",
          "2024-06-12": "День России",
          "2024-11-04": "День народного единства",
          "2025-01-01": "Новый год",
          "2025-02-23": "День защитника Отечества",
          "2025-03-08": "Международный женский день",
          "2025-05-01": "Праздник Весны и Труда",
          "2025-05-09": "День Победы",
          "2025-06-12": "День России",
          "2025-11-04": "День народного единства"
        },
        shortDays: {
          "2024-02-22": "Короткий день перед праздником",
          "2024-03-07": "Короткий день перед праздником",
          "2024-04-30": "Короткий день перед праздником",
          "2024-06-11": "Короткий день перед праздником",
          "2024-11-03": "Короткий день перед праздником",
          "2025-02-22": "Короткий день перед праздником",
          "2025-03-07": "Короткий день перед праздником",
          "2025-04-30": "Короткий день перед праздником",
          "2025-06-11": "Короткий день перед праздником",
          "2025-11-03": "Короткий день перед праздником"
        },
        weekends: { description: "Выходные дни автоматически определяются" },
        tradingHours: {
          normal: { start: "10:00", end: "18:40" },
          short: { start: "10:00", end: "14:00" }
        }
      };
    }

    res.json(calendarData);
  } catch (e) {
    console.error('Failed to load trading calendar:', e);
    res.status(500).json({ error: 'Failed to load trading calendar' });
  }
});

app.use(requireAuth);

// Auth endpoints
// Rate limiting: max 3 attempts per 24h per IP
const LOGIN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOGIN_MAX_ATTEMPTS = 3;
const loginRate = new Map(); // ip -> { count, resetAt }
const LOGIN_LOG_FILE = process.env.LOGIN_LOG_PATH || path.join(DATASETS_DIR, 'login-attempts.log');
function getClientIp(req) {
  try {
    if (req.ip) return req.ip;
    if (Array.isArray(req.ips) && req.ips.length) return req.ips[0];
  } catch { }
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  if (xf) return xf.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
async function logLoginAttempt({ ip, success, reason, username }) {
  const line = `${new Date().toISOString()}\t${ip}\t${username || '-'}\t${success ? 'SUCCESS' : 'FAIL'}\t${reason || ''}\n`;
  await appendSafe(LOGIN_LOG_FILE, line);
  try {
    const note = success ? '✅ Успешный вход' : '⚠️ Неуспешная попытка входа';
    const text = `${note}\nIP: ${ip}\nUser: ${username || '-'}` + (success ? '' : (reason ? `\nПричина: ${reason}` : ''));
    await sendTelegramMessage(getApiConfig().TELEGRAM_CHAT_ID, text);
  } catch { }
}

app.post('/api/login', async (req, res) => {
  try {
    if (!ADMIN_PASSWORD) return res.json({ success: true, disabled: true });
    const { username, password, remember } = req.body || {};

    // Input validation to prevent injection attacks
    if (!username || typeof username !== 'string' || username.length > 254) {
      return res.status(400).json({ error: 'Invalid username format' });
    }
    if (!password || typeof password !== 'string' || password.length > 1024) {
      return res.status(400).json({ error: 'Invalid password format' });
    }

    const ip = getClientIp(req);
    // Rate limit
    const nowTs = Date.now();
    const rec = loginRate.get(ip) || { count: 0, resetAt: nowTs + LOGIN_WINDOW_MS };
    if (rec.resetAt < nowTs) { rec.count = 0; rec.resetAt = nowTs + LOGIN_WINDOW_MS; }
    if (rec.count >= LOGIN_MAX_ATTEMPTS) {
      loginRate.set(ip, rec);
      logLoginAttempt({ ip, success: false, reason: 'RATE_LIMIT', username });
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    rec.count += 1;
    loginRate.set(ip, rec);
    const uok = !!username && String(username).toLowerCase() === ADMIN_USERNAME;
    if (!uok) {
      logLoginAttempt({ ip, success: false, reason: 'INVALID_USERNAME', username });
      return res.status(401).json({ error: 'Invalid login' });
    }
    // Support both hashed and plain text passwords for backward compatibility
    let passwordValid = false;
    try {
      if (ADMIN_PASSWORD.startsWith('$2b$') || ADMIN_PASSWORD.startsWith('$2a$') || ADMIN_PASSWORD.startsWith('$2y$')) {
        // Password is hashed, use bcrypt to compare
        passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD);
      } else {
        // Legacy plain text password comparison (less secure)
        passwordValid = password === ADMIN_PASSWORD;
        // Log a warning about using plain text passwords
        console.warn('WARNING: Using plain text password. Consider using a hashed password for security.');
      }
    } catch (error) {
      console.error('Password verification error:', error);
      passwordValid = false;
    }

    if (!password || !passwordValid) {
      logLoginAttempt({ ip, success: false, reason: 'INVALID_PASSWORD', username });
      return res.status(401).json({ error: 'Invalid password' });
    }
    const token = createToken();
    const ts = Date.now();
    sessions.set(token, { createdAt: ts, expiresAt: ts + SESSION_TTL_MS });
    setAuthCookie(req, res, token, !!remember);
    // reset rate counter on success
    loginRate.delete(ip);
    logLoginAttempt({ ip, success: true, username });
    res.json({ success: true, token });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});
app.get('/api/auth/check', (req, res) => {
  if (!ADMIN_PASSWORD) return res.json({ ok: true, disabled: true });
  const cookies = parseCookies(req);
  const token = cookies.auth_token || getAuthTokenFromHeader(req);
  const sess = token && sessions.get(token);
  if (!sess || sess.expiresAt < Date.now()) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  try {
    const cookies = parseCookies(req);
    const token = cookies.auth_token || getAuthTokenFromHeader(req);
    if (token) sessions.delete(token);
    clearAuthCookie(req, res);
    res.json({ success: true });
  } catch (e) {
    clearAuthCookie(req, res);
    res.json({ success: true });
  }
});

// Utility endpoint to generate hashed passwords for administrators
app.post('/api/auth/hash-password', async (req, res) => {
  try {
    // Only allow this in development or if no admin password is set yet
    if (IS_PROD && ADMIN_PASSWORD) {
      return res.status(403).json({ error: 'Password hashing not available in production' });
    }

    const { password } = req.body || {};
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    res.json({
      success: true,
      hashedPassword,
      message: 'Set this as your ADMIN_PASSWORD environment variable'
    });
  } catch (error) {
    console.error('Password hashing error:', error);
    res.status(500).json({ error: 'Failed to hash password' });
  }
});

// Settings API endpoints
app.get('/api/settings', requireAuth, (req, res) => {
  try {
    const settings = loadSettings();
    // Remove sensitive data from response
    const safeSettings = { ...settings };
    if (safeSettings.api) {
      // Mask API keys in response
      Object.keys(safeSettings.api).forEach(key => {
        if (key.includes('Key') && safeSettings.api[key]) {
          const value = safeSettings.api[key];
          safeSettings.api[key] = value.substring(0, 4) + '*'.repeat(Math.max(0, value.length - 8)) + value.substring(value.length - 4);
        }
      });
    }
    // Mask Telegram bot token
    if (safeSettings.telegram && safeSettings.telegram.botToken) {
      const token = safeSettings.telegram.botToken;
      safeSettings.telegram.botToken = token.substring(0, 4) + '*'.repeat(Math.max(0, token.length - 8)) + token.substring(token.length - 4);
    }
    res.json(safeSettings);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.patch('/api/settings', requireAuth, (req, res) => {
  try {
    const updates = req.body;
    const currentSettings = loadSettings();

    // Validate updates - no additional validation needed for API keys

    // Deep merge for nested objects to preserve existing values
    const newSettings = { ...currentSettings };

    // Deep merge 'api' settings - preserve existing keys when only some are updated
    if (updates.api) {
      newSettings.api = { ...(currentSettings.api || {}), ...updates.api };
      // Remove undefined values (when client sends empty string as undefined)
      Object.keys(newSettings.api).forEach(key => {
        if (newSettings.api[key] === undefined) {
          delete newSettings.api[key];
        }
      });
    }

    // Deep merge 'telegram' settings - preserve existing token/chatId when only one is updated
    if (updates.telegram) {
      newSettings.telegram = { ...(currentSettings.telegram || {}), ...updates.telegram };
      // Remove undefined values (when client sends empty string as undefined)
      Object.keys(newSettings.telegram).forEach(key => {
        if (newSettings.telegram[key] === undefined) {
          delete newSettings.telegram[key];
        }
      });
    }

    // Merge other top-level keys
    Object.keys(updates).forEach(key => {
      if (key !== 'api' && key !== 'telegram') {
        newSettings[key] = updates[key];
      }
    });

    // Save to file
    fs.writeJsonSync(SETTINGS_FILE, newSettings, { spaces: 2 });

    // Reload API config
    API_CONFIG = getApiConfig();

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (e) {
    console.error('Failed to update settings:', e);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// In-memory watch list for Telegram notifications (persisted to disk)
// { symbol, highIBS, lowIBS, thresholdPct, chatId, entryPrice, isOpenPosition, sent: { dateKey, warn10, confirm1, entryWarn10, entryConfirm1 } }
const telegramWatches = new Map();

const tradeHistory = [];
let tradeHistoryLoaded = false;
let saveTradeHistoryTimer = null;

async function loadTradeHistory() {
  try {
    const exists = await fs.pathExists(TRADE_HISTORY_FILE);
    if (!exists) {
      tradeHistory.length = 0;
      tradeHistoryLoaded = true;
      return;
    }
    const data = await fs.readJson(TRADE_HISTORY_FILE);
    if (Array.isArray(data)) {
      tradeHistory.length = 0;
      for (const rec of data) {
        tradeHistory.push(normalizeTradeRecord(rec));
      }
    }
    tradeHistoryLoaded = true;
    if (telegramWatches.size > 0) {
      const syncResult = synchronizeWatchesWithTradeHistory();
      if (syncResult.changes.length) {
        scheduleSaveWatches();
      }
    }
  } catch (e) {
    console.warn('Failed to load trade history:', e && e.message ? e.message : e);
    tradeHistory.length = 0;
    tradeHistoryLoaded = true;
  }
}

function ensureTradeHistoryLoaded() {
  if (!tradeHistoryLoaded) {
    loadTradeHistory().catch(err => {
      console.warn('Trade history load error:', err && err.message ? err.message : err);
    });
  }
}

function scheduleSaveTradeHistory() {
  if (saveTradeHistoryTimer) clearTimeout(saveTradeHistoryTimer);
  saveTradeHistoryTimer = setTimeout(async () => {
    try {
      await fs.writeJson(TRADE_HISTORY_FILE, tradeHistory, { spaces: 2 });
      console.log(`Saved ${tradeHistory.length} trade records`);
    } catch (e) {
      console.warn('Failed to save trade history:', e && e.message ? e.message : e);
    }
  }, 200);
}

function normalizeTradeRecord(rec) {
  const safe = rec && typeof rec === 'object' ? { ...rec } : {};
  const symbol = typeof safe.symbol === 'string' ? safe.symbol.toUpperCase() : null;
  let status = safe.status === 'open' ? 'open' : 'closed';
  const entryPrice = typeof safe.entryPrice === 'number' ? safe.entryPrice : (safe.entryPrice != null ? Number(safe.entryPrice) : null);
  const exitPrice = typeof safe.exitPrice === 'number' ? safe.exitPrice : (safe.exitPrice != null ? Number(safe.exitPrice) : null);

  if (safe.exitDate || safe.exitDecisionTime || (typeof exitPrice === 'number' && Number.isFinite(exitPrice))) {
    status = 'closed';
  }

  let pnlAbsolute = typeof safe.pnlAbsolute === 'number' ? safe.pnlAbsolute : null;
  let pnlPercent = typeof safe.pnlPercent === 'number' ? safe.pnlPercent : null;

  if (entryPrice != null && exitPrice != null) {
    const diff = exitPrice - entryPrice;
    pnlAbsolute = diff;
    pnlPercent = (diff / entryPrice) * 100;
  }

  let holdingDays = typeof safe.holdingDays === 'number' ? safe.holdingDays : null;
  if (!holdingDays && safe.entryDate && safe.exitDate) {
    const entryDate = new Date(safe.entryDate);
    const exitDate = new Date(safe.exitDate);
    if (!Number.isNaN(entryDate.valueOf()) && !Number.isNaN(exitDate.valueOf())) {
      const diff = Math.round((exitDate.getTime() - entryDate.getTime()) / (24 * 3600 * 1000));
      holdingDays = diff >= 0 ? Math.max(1, diff) : null;
    }
  }

  return {
    id: typeof safe.id === 'string' ? safe.id : crypto.randomUUID(),
    symbol: symbol || 'UNKNOWN',
    status,
    entryDate: typeof safe.entryDate === 'string' ? safe.entryDate : null,
    exitDate: typeof safe.exitDate === 'string' ? safe.exitDate : null,
    entryPrice,
    exitPrice,
    entryIBS: typeof safe.entryIBS === 'number' ? safe.entryIBS : (safe.entryIBS != null ? Number(safe.entryIBS) : null),
    exitIBS: typeof safe.exitIBS === 'number' ? safe.exitIBS : (safe.exitIBS != null ? Number(safe.exitIBS) : null),
    entryDecisionTime: typeof safe.entryDecisionTime === 'string' ? safe.entryDecisionTime : null,
    exitDecisionTime: typeof safe.exitDecisionTime === 'string' ? safe.exitDecisionTime : null,
    pnlPercent,
    pnlAbsolute,
    holdingDays,
    notes: typeof safe.notes === 'string' ? safe.notes : undefined,
  };
}

function getCurrentOpenTrade() {
  let latest = null;
  for (const trade of tradeHistory) {
    if (!trade || trade.status !== 'open') continue;
    if (!latest) {
      latest = trade;
      continue;
    }
    const latestKey = latest.entryDecisionTime || latest.entryDate || '';
    const tradeKey = trade.entryDecisionTime || trade.entryDate || '';
    if (tradeKey.localeCompare(latestKey) > 0) {
      latest = trade;
    }
  }
  return latest;
}

function recordTradeEntry({ symbol, price, ibs, decisionTime, dateKey }) {
  if (!symbol) return null;
  const normalizedSymbol = symbol.toUpperCase();
  const openTrade = getCurrentOpenTrade();
  if (openTrade) {
    console.warn(`Cannot open new trade for ${normalizedSymbol}: trade ${openTrade.id} is still open for ${openTrade.symbol}`);
    return null;
  }

  const trade = normalizeTradeRecord({
    id: crypto.randomUUID(),
    symbol: normalizedSymbol,
    status: 'open',
    entryDate: dateKey || null,
    entryPrice: typeof price === 'number' ? price : null,
    entryIBS: typeof ibs === 'number' ? ibs : null,
    entryDecisionTime: decisionTime || new Date().toISOString(),
  });

  tradeHistory.push(trade);
  scheduleSaveTradeHistory();
  return trade;
}

function recordTradeExit({ symbol, price, ibs, decisionTime, dateKey }) {
  if (!symbol) return null;
  const normalizedSymbol = symbol.toUpperCase();
  const openTrade = getCurrentOpenTrade();
  if (!openTrade || openTrade.symbol !== normalizedSymbol) {
    console.warn(`No matching open trade for ${normalizedSymbol} to close`);
    return null;
  }

  openTrade.status = 'closed';
  openTrade.exitDate = dateKey || null;
  openTrade.exitPrice = typeof price === 'number' ? price : null;
  openTrade.exitIBS = typeof ibs === 'number' ? ibs : null;
  openTrade.exitDecisionTime = decisionTime || new Date().toISOString();

  if (typeof openTrade.entryPrice === 'number' && typeof openTrade.exitPrice === 'number') {
    const diff = openTrade.exitPrice - openTrade.entryPrice;
    openTrade.pnlAbsolute = Number(diff.toFixed(6));
    openTrade.pnlPercent = Number(((diff / openTrade.entryPrice) * 100).toFixed(6));
  } else {
    openTrade.pnlAbsolute = null;
    openTrade.pnlPercent = null;
  }

  if (openTrade.entryDate && openTrade.exitDate) {
    const entryDate = new Date(openTrade.entryDate);
    const exitDate = new Date(openTrade.exitDate);
    if (!Number.isNaN(entryDate.valueOf()) && !Number.isNaN(exitDate.valueOf())) {
      const diff = Math.round((exitDate.getTime() - entryDate.getTime()) / (24 * 3600 * 1000));
      openTrade.holdingDays = diff >= 0 ? Math.max(1, diff) : null;
    }
  }

  scheduleSaveTradeHistory();
  return openTrade;
}

function synchronizeWatchesWithTradeHistory() {
  const openTrade = getCurrentOpenTrade();
  const openSymbol = openTrade ? openTrade.symbol : null;
  const changes = [];

  for (const watch of telegramWatches.values()) {
    const hadEntryPrice = isPositionOpen(watch);
    const shouldBeOpen = !!openSymbol && watch.symbol.toUpperCase() === openSymbol;

    if (shouldBeOpen) {
      const nextPrice = openTrade.entryPrice ?? null;
      const priceChanged = watch.entryPrice !== nextPrice;
      const idChanged = watch.currentTradeId !== openTrade.id;
      if (priceChanged || idChanged || !hadEntryPrice) {
        changes.push({ symbol: watch.symbol, action: 'sync_open', previousPrice: watch.entryPrice, nextPrice });
      }
      watch.entryPrice = nextPrice;
      watch.entryDate = openTrade.entryDate ?? null;
      watch.entryIBS = openTrade.entryIBS ?? null;
      watch.entryDecisionTime = openTrade.entryDecisionTime ?? null;
      watch.currentTradeId = openTrade.id;
      watch.isOpenPosition = true;
    } else {
      if (hadEntryPrice || watch.entryPrice != null || watch.currentTradeId) {
        changes.push({ symbol: watch.symbol, action: 'sync_close', previousPrice: watch.entryPrice });
      }
      watch.entryPrice = null;
      watch.entryDate = null;
      watch.entryIBS = null;
      watch.entryDecisionTime = null;
      watch.currentTradeId = null;
      watch.isOpenPosition = false;
    }
  }

  return { openTrade, changes };
}

function formatTradeSummary(trade) {
  if (!trade) return 'Нет сделок';
  const entryDate = trade.entryDate || '—';
  const exitDate = trade.exitDate || '—';
  const entryPrice = typeof trade.entryPrice === 'number' ? `$${trade.entryPrice.toFixed(2)}` : '—';
  const exitPrice = typeof trade.exitPrice === 'number' ? `$${trade.exitPrice.toFixed(2)}` : '—';
  const entryIbs = typeof trade.entryIBS === 'number' ? `${(trade.entryIBS * 100).toFixed(1)}%` : '—';
  const exitIbs = typeof trade.exitIBS === 'number' ? `${(trade.exitIBS * 100).toFixed(1)}%` : '—';
  const pnlPercent = typeof trade.pnlPercent === 'number' ? `${trade.pnlPercent >= 0 ? '+' : ''}${trade.pnlPercent.toFixed(2)}%` : '—';
  return `${trade.symbol} • ${entryDate} → ${exitDate} • ${entryPrice} → ${exitPrice} • IBS ${entryIbs} → ${exitIbs} • PnL ${pnlPercent}`;
}

function buildTradeHistoryMessage(limit = 5) {
  if (!tradeHistory.length) {
    return '<b>Последние сделки</b>\nСделок пока нет.';
  }

  const openTrade = getCurrentOpenTrade();
  const sorted = [...tradeHistory].sort((a, b) => {
    const aKey = a.exitDate || a.entryDate || '';
    const bKey = b.exitDate || b.entryDate || '';
    return bKey.localeCompare(aKey);
  });
  const recent = sorted.slice(0, limit);
  const lines = ['<b>Последние сделки</b>'];

  if (openTrade) {
    lines.push(`🔔 Текущая позиция: ${formatTradeSummary(openTrade)}`);
    lines.push('');
  }

  let index = 1;
  for (const trade of recent) {
    lines.push(`${index}. ${formatTradeSummary(trade)}`);
    index += 1;
  }

  return lines.join('\n');
}

function serializeTradeForResponse(trade) {
  return {
    id: trade.id,
    symbol: trade.symbol,
    status: trade.status,
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    entryIBS: trade.entryIBS,
    exitIBS: trade.exitIBS,
    entryDecisionTime: trade.entryDecisionTime,
    exitDecisionTime: trade.exitDecisionTime,
    pnlPercent: trade.pnlPercent,
    pnlAbsolute: trade.pnlAbsolute,
    holdingDays: trade.holdingDays,
  };
}

function getSortedTradeHistory() {
  return [...tradeHistory].sort((a, b) => {
    const aKey = a.exitDecisionTime || a.exitDate || a.entryDecisionTime || a.entryDate || '';
    const bKey = b.exitDecisionTime || b.exitDate || b.entryDecisionTime || b.entryDate || '';
    return bKey.localeCompare(aKey);
  });
}

/**
 * Рассчитывает текущий статус позиции по стратегии за последние 35 дней
 * @param {string} symbol - Тикер акции
 * @param {number} lowIBS - Порог для входа (0.1)  
 * @param {number} highIBS - Порог для выхода (0.75)
 * @returns {Promise<{isOpen: boolean, entryPrice: number|null, entryDate: string|null, signal: string}>}
 */
async function calculatePositionStatus(symbol, lowIBS = 0.1, highIBS = 0.75) {
  try {
    // Получаем данные через существующую функцию
    const filePath = path.join(DATASETS_DIR, `${symbol}.json`);
    const exists = await fs.pathExists(filePath);
    if (!exists) {
      return { isOpen: false, entryPrice: null, entryDate: null, signal: 'no_data' };
    }

    const dataset = await fs.readJson(filePath);
    if (!dataset || !dataset.data || dataset.data.length === 0) {
      return { isOpen: false, entryPrice: null, entryDate: null, signal: 'no_data' };
    }

    // Преобразуем данные в нужный формат и берем последние 35 дней
    const rawData = dataset.data;
    const data = rawData.slice(-35).map(d => ({
      date: new Date(d.date),
      open: parseFloat(d.open),
      high: parseFloat(d.high),
      low: parseFloat(d.low),
      close: parseFloat(d.close)
    }));

    let positionOpen = false;
    let entryPrice = null;
    let entryDate = null;

    // Прогоняем стратегию: смотрим IBS предыдущего дня для принятия решений
    for (let i = 1; i < data.length; i++) {
      const currentBar = data[i];
      const prevBar = data[i - 1];

      // Рассчитываем IBS предыдущего дня = (close - low) / (high - low)
      const range = prevBar.high - prevBar.low;
      const ibs = range > 0 ? (prevBar.close - prevBar.low) / range : 0;

      // Сигнал на ВХОД: IBS предыдущего дня <= lowIBS
      if (!positionOpen && ibs <= lowIBS) {
        positionOpen = true;
        entryPrice = currentBar.close; // Покупаем на закрытии текущего дня
        entryDate = currentBar.date.toISOString().split('T')[0];
        console.log(`[${symbol}] ENTRY: IBS=${ibs.toFixed(3)} <= ${lowIBS}, entry_price=${entryPrice}, date=${entryDate}`);
      }

      // Сигнал на ВЫХОД: IBS предыдущего дня >= highIBS
      if (positionOpen && ibs >= highIBS) {
        positionOpen = false;
        const exitPrice = currentBar.close;
        console.log(`[${symbol}] EXIT: IBS=${ibs.toFixed(3)} >= ${highIBS}, exit_price=${exitPrice}, date=${currentBar.date.toISOString().split('T')[0]}`);
        entryPrice = null;
        entryDate = null;
      }
    }

    const signal = positionOpen ? 'position_open' : 'position_closed';
    return { isOpen: positionOpen, entryPrice, entryDate, signal };

  } catch (error) {
    console.error(`Error calculating position for ${symbol}:`, error);
    return { isOpen: false, entryPrice: null, entryDate: null, signal: 'error' };
  }
}

/**
 * Определяет открыта ли позиция автоматически по данным
 */
function isPositionOpen(watch) {
  return !!(watch.entryPrice !== null && watch.entryPrice !== undefined);
}

/**
 * Aggregated send state per chat to avoid duplicate messages inside the same minute/day
 */
const aggregateSendState = new Map(); // chatId -> { dateKey: string|null, t11Sent: boolean, t1Sent: boolean }
function getAggregateState(chatId, dateKey) {
  let st = aggregateSendState.get(chatId);
  if (!st || st.dateKey !== dateKey) {
    st = { dateKey, t11Sent: false, t1Sent: false };
    aggregateSendState.set(chatId, st);
  }
  return st;
}

async function loadWatches() {
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

let saveWatchesTimer = null;
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

async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  const settings = loadSettings();
  const envToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const settingsToken = settings.telegram?.botToken || '';
  const telegramBotToken = settingsToken || envToken;

  // Debug token sources - FULL TOKEN for debugging
  console.log(`Telegram token sources - from settings.json: ${settingsToken ? 'YES' : 'NO'}, from env: ${envToken ? 'YES' : 'NO'}`);
  console.log(`FULL TOKEN FROM SETTINGS: "${settingsToken}"`);
  console.log(`FULL TOKEN FROM ENV: "${envToken}"`);
  console.log(`USING TOKEN: "${telegramBotToken}" (length: ${telegramBotToken.length})`);

  // Check for asterisks which would indicate a masked/corrupted token
  if (telegramBotToken && telegramBotToken.includes('*')) {
    console.error('ERROR: Token contains asterisks - it appears to be a masked value, not the real token!');
  }

  if (!telegramBotToken) {
    console.warn('Telegram Token is MISSING or EMPTY');
  }

  if (!telegramBotToken || !chatId) {
    console.warn('Telegram is not configured (missing TELEGRAM_BOT_TOKEN or chatId).');
    return { ok: false, reason: 'not_configured', error: 'Telegram not configured (missing token or chat_id)' };
  }

  // Convert chat_id to number if it's a numeric string (Telegram API prefers numbers for numeric IDs)
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

  // Token is used as-is in URL path - colon does not need escaping in path component
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

// Helpers for ET (America/New_York)
function getETParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const parts = fmt.formatToParts(date);
  const map = {};
  parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
  const y = Number(map.year), m = Number(map.month), d = Number(map.day), hh = Number(map.hour), mm = Number(map.minute);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdayMap[map.weekday] ?? 0;
  return { y, m, d, hh, mm, weekday };
}
function etKeyYMD(p) { return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }
function isWeekendET(p) { return p.weekday === 0 || p.weekday === 6; }
function nthWeekdayOfMonthET(year, monthIndex0, weekday, n) {
  let cursor = new Date(Date.UTC(year, monthIndex0, 1, 12, 0, 0));
  while (getETParts(cursor).weekday !== weekday) { cursor.setUTCDate(cursor.getUTCDate() + 1); }
  for (let i = 1; i < n; i++) { cursor.setUTCDate(cursor.getUTCDate() + 7); }
  return getETParts(cursor);
}
function lastWeekdayOfMonthET(year, monthIndex0, weekday) {
  let cursor = new Date(Date.UTC(year, monthIndex0 + 1, 0, 12, 0, 0));
  while (getETParts(cursor).weekday !== weekday) { cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return getETParts(cursor);
}
function observedFixedET(year, monthIndex0, day) {
  const base = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
  const p = getETParts(base);
  if (p.weekday === 0) { base.setUTCDate(base.getUTCDate() + 1); return getETParts(base); }
  if (p.weekday === 6) { base.setUTCDate(base.getUTCDate() - 1); return getETParts(base); }
  return p;
}
function easterUTC(year) { const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), month = Math.floor((h + l - 7 * m + 114) / 31) - 1, day = ((h + l - 7 * m + 114) % 31) + 1; return new Date(Date.UTC(year, month, day, 12, 0, 0)); }
function goodFridayET(year) { const e = easterUTC(year); e.setUTCDate(e.getUTCDate() - 2); return getETParts(e); }
function nyseHolidaysET(year) {
  const set = new Set();
  set.add(etKeyYMD(observedFixedET(year, 0, 1))); // New Year
  set.add(etKeyYMD(observedFixedET(year, 5, 19))); // Juneteenth
  set.add(etKeyYMD(observedFixedET(year, 6, 4)));  // Independence Day
  set.add(etKeyYMD(observedFixedET(year, 11, 25))); // Christmas
  set.add(etKeyYMD(nthWeekdayOfMonthET(year, 0, 1, 3))); // MLK Mon
  set.add(etKeyYMD(nthWeekdayOfMonthET(year, 1, 1, 3))); // Presidents Mon
  set.add(etKeyYMD(goodFridayET(year))); // Good Friday
  set.add(etKeyYMD(lastWeekdayOfMonthET(year, 4, 1))); // Memorial Mon
  set.add(etKeyYMD(nthWeekdayOfMonthET(year, 8, 1, 1))); // Labor Mon
  set.add(etKeyYMD(nthWeekdayOfMonthET(year, 10, 4, 4))); // Thanksgiving Thu
  return set;
}
function isTradingDayET(p) { return !isWeekendET(p) && !nyseHolidaysET(p.y).has(etKeyYMD(p)); }

// Calendar-aware helpers (JSON: server/trading-calendar.json)
let _tradingCalendarCache = { data: null, loadedAt: 0 };
const TRADING_CALENDAR_TTL_MS = 5 * 60 * 1000;
async function loadTradingCalendarJSON() {
  try {
    const nowTs = Date.now();
    if (_tradingCalendarCache.data && (nowTs - _tradingCalendarCache.loadedAt) < TRADING_CALENDAR_TTL_MS) {
      return _tradingCalendarCache.data;
    }
    const calendarPath = path.join(__dirname, 'trading-calendar.json');
    if (await fs.pathExists(calendarPath)) {
      const json = await fs.readJson(calendarPath);
      _tradingCalendarCache = { data: json, loadedAt: nowTs };
      return json;
    }
  } catch { }
  return null;
}
function getCachedTradingCalendar() {
  return _tradingCalendarCache.data || null;
}
function parseHmToMinutes(hm) {
  try {
    if (!hm || typeof hm !== 'string' || hm.indexOf(':') < 0) return null;
    const [h, m] = hm.split(':');
    const hh = parseInt(h, 10);
    const mm = parseInt(m, 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  } catch { return null; }
}
function isHolidayByCalendarET(p, cal) {
  try {
    if (!cal || !cal.holidays) return false;
    const y = String(p.y);
    const key = `${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    return !!(cal.holidays[y] && cal.holidays[y][key]);
  } catch { return false; }
}
function isShortDayByCalendarET(p, cal) {
  try {
    if (!cal || !cal.shortDays) return false;
    const y = String(p.y);
    const key = `${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    return !!(cal.shortDays[y] && cal.shortDays[y][key]);
  } catch { return false; }
}
function isTradingDayByCalendarET(p, cal) {
  if (isWeekendET(p)) return false;
  if (cal) return !isHolidayByCalendarET(p, cal);
  // Fallback to built-in rules if no calendar
  return isTradingDayET(p);
}
function getTradingSessionForDateET(p, cal) {
  const normalEnd = parseHmToMinutes(cal && cal.tradingHours && cal.tradingHours.normal && cal.tradingHours.normal.end || '16:00') ?? (16 * 60);
  const shortEnd = parseHmToMinutes(cal && cal.tradingHours && cal.tradingHours.short && cal.tradingHours.short.end || '13:00') ?? (13 * 60);
  const startMin = parseHmToMinutes(cal && cal.tradingHours && cal.tradingHours.normal && cal.tradingHours.normal.start || '09:30') ?? (9 * 60 + 30);
  const short = !!(cal && isShortDayByCalendarET(p, cal));
  const closeMin = short ? shortEnd : normalEnd;
  return { openMin: startMin, closeMin, short };
}

// Replace: fetch only today's quote from Finnhub (no multi-day candles)
async function fetchTodayRangeAndQuote(symbol) {
  const quote = await new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${getApiConfig().FINNHUB_API_KEY}`;
    https.get(url, (response) => {
      let data = ''; response.on('data', c => data += c); response.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
  const todayEt = getETParts(new Date());
  const todayKey = etKeyYMD(todayEt);
  const todayRange = {
    open: (quote && quote.o != null ? quote.o : null),
    high: (quote && quote.h != null ? quote.h : null),
    low: (quote && quote.l != null ? quote.l : null),
  };
  return { range: todayRange, quote: { open: quote.o ?? null, high: quote.h ?? null, low: quote.l ?? null, current: quote.c ?? null, prevClose: quote.pc ?? null }, dateKey: todayKey, ohlc: null };
}

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
// Previous trading day helper (based on ET calendar)
function previousTradingDayET(fromParts) {
  let cursor = new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d, 12, 0, 0));
  cursor.setUTCDate(cursor.getUTCDate() - 1);

  // Add safety limit to prevent infinite loop (max 30 days back)
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    const p = getETParts(cursor);
    const cal = getCachedTradingCalendar();
    if (isTradingDayByCalendarET(p, cal)) return p;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    attempts++;
  }

  // Fallback: return parts from 1 day back if no trading day found
  console.warn('Could not find previous trading day within 30 days, using fallback');
  const fallbackDate = new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d - 1, 12, 0, 0));
  return getETParts(fallbackDate);
}

function buildFreshnessLine(ohlc, nowEtParts) {
  try {
    if (!Array.isArray(ohlc) || ohlc.length === 0) return 'Data: unknown';
    const prev = previousTradingDayET(nowEtParts);
    const expected = `${prev.y}-${String(prev.m).padStart(2, '0')}-${String(prev.d).padStart(2, '0')}`;
    const hasPrev = ohlc.some(r => r && r.date === expected);
    return hasPrev ? 'Data: fresh' : `Data: STALE (missing ${expected})`;
  } catch {
    return 'Data: unknown';
  }
}

// Centralized endpoint: expected previous trading day in ET
app.get('/api/trading/expected-prev-day', async (req, res) => {
  try {
    await loadTradingCalendarJSON().catch(() => null);
    const nowEt = getETParts(new Date());
    const prev = previousTradingDayET(nowEt);
    return res.json({ date: etKeyYMD(prev) });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed to compute previous trading day' });
  }
});

function formatMoney(n) { return (typeof n === 'number' && isFinite(n)) ? `$${n.toFixed(2)}` : '-'; }

// Register/unregister Telegram watch
app.post('/api/telegram/watch', (req, res) => {
  try {
    const { symbol, highIBS, lowIBS = 0.1, thresholdPct = 0.3, chatId, entryPrice = null, isOpenPosition = true } = req.body || {};
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol || typeof highIBS !== 'number') {
      return res.status(400).json({ error: 'symbol and highIBS are required' });
    }
    const useChatId = chatId || getApiConfig().TELEGRAM_CHAT_ID;
    if (!useChatId) return res.status(400).json({ error: 'No Telegram chat id configured' });
    // thresholdPct сохраняем для обратной совместимости, но в расчётах используем глобальную настройку
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

app.delete('/api/telegram/watch/:symbol', (req, res) => {
  const sym = toSafeTicker(req.params.symbol || '');
  if (!sym) return res.status(400).json({ success: false, error: 'Invalid symbol' });
  telegramWatches.delete(sym);
  scheduleSaveWatches();
  res.json({ success: true });
});

// Optional endpoint to update open position flag / entry price
app.patch('/api/telegram/watch/:symbol', (req, res) => {
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

// Helper functions for dataset date checking
async function getDatasetBeforeUpdate(symbol) {
  const ticker = toSafeTicker(symbol);
  if (!ticker) return null;
  const filePath = resolveDatasetFilePathById(ticker);
  if (filePath && await fs.pathExists(filePath)) {
    return await fs.readJson(filePath).catch(() => null);
  }
  return null;
}

async function getDatasetAfterUpdate(symbol) {
  return await getDatasetBeforeUpdate(symbol); // Same logic, just called after update
}

function getLastDateFromDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.data) || !dataset.data.length) {
    // Try dateRange as fallback
    return dataset?.dateRange?.to ? dataset.dateRange.to.slice(0, 10) : null;
  }
  const lastBar = dataset.data[dataset.data.length - 1];
  if (!lastBar || !lastBar.date) return null;

  // Handle different date formats
  if (typeof lastBar.date === 'string') {
    return lastBar.date.slice(0, 10); // YYYY-MM-DD
  }
  try {
    return new Date(lastBar.date).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

// Ensure AV refresh for each watched symbol and check dataset freshness (prev trading day exists)
async function refreshTickerViaAlphaVantageAndCheckFreshness(symbol, nowEtParts) {
  const ticker = toSafeTicker(symbol);
  if (!ticker) return { avFresh: false };
  const toDateKey = (d) => {
    try {
      if (typeof d === 'string') return d.slice(0, 10);
      return new Date(d).toISOString().slice(0, 10);
    } catch { return ''; }
  };
  const prev = previousTradingDayET(nowEtParts);
  const prevKey = etKeyYMD(prev);
  let dataset;
  let filePath = resolveDatasetFilePathById(ticker);
  if (filePath && await fs.pathExists(filePath)) {
    dataset = await fs.readJson(filePath).catch(() => null);
  }
  if (!dataset) {
    dataset = { name: ticker, ticker, data: [], dataPoints: 0, dateRange: { from: null, to: null }, uploadDate: new Date().toISOString() };
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
    const av = await fetchFromAlphaVantage(ticker, startTs, endTs, { adjustment: 'none' });
    const base = Array.isArray(av) ? av : (av && av.data) || [];
    const rows = base.map(r => ({
      date: r.date,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
      volume: Number(r.volume) || 0,
    }));
    // Merge
    const mergedByDate = new Map();
    for (const b of (dataset.data || [])) {
      const key = toDateKey(b && b.date);
      if (!key) continue;
      mergedByDate.set(key, {
        date: key,
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        adjClose: (b.adjClose != null ? Number(b.adjClose) : Number(b.close)),
        volume: Number(b.volume) || 0,
      });
    }
    for (const r of rows) {
      const key = toDateKey(r && r.date);
      if (!key) continue;
      mergedByDate.set(key, {
        date: key,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
        volume: Number(r.volume) || 0,
      });
    }
    const mergedArray = Array.from(mergedByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    dataset.data = mergedArray;
    dataset.dataPoints = mergedArray.length;
    if (mergedArray.length) {
      dataset.dateRange = { from: mergedArray[0].date, to: mergedArray[mergedArray.length - 1].date };
    }
    dataset.uploadDate = new Date().toISOString();
    dataset.name = ticker;
    await writeDatasetToTickerFile(dataset);
    const avFresh = mergedByDate.has(prevKey);
    return { avFresh };
  } catch (e) {
    return { avFresh: false };
  }
}

// Scheduler: send aggregated messages at T-11 (overview) and T-1 (confirmations)
async function runTelegramAggregation(minutesOverride = null, options = {}) {
  try {
    if (telegramWatches.size === 0) return { sent: false };
    // Load calendar (cached) and compute trading session for today
    const cal = await loadTradingCalendarJSON().catch(() => null);
    const nowEt = getETParts(new Date());
    if (!isTradingDayByCalendarET(nowEt, cal) && !(options && options.test)) return { sent: false };
    const session = getTradingSessionForDateET(nowEt, cal);
    const nowMinutes = (nowEt.hh * 60 + nowEt.mm);
    const minutesUntilClose = minutesOverride != null ? minutesOverride : (session.closeMin - nowMinutes);
    if (minutesUntilClose !== 11 && minutesUntilClose !== 1) return { sent: false };

    const todayKey = etKeyYMD(nowEt);

    // Load global threshold and convert to IBS points
    const settings = await readSettings();
    const pct = typeof settings.watchThresholdPct === 'number' ? settings.watchThresholdPct : 5;
    const delta = Math.max(0, Math.min(20, pct)) / 100; // 0..0.20 IBS

    await appendMonitorLog([`T-${minutesUntilClose}min: scan ${telegramWatches.size} watches; thresholdPct=${pct}% (deltaIBS=${delta})${options && options.test ? ' [TEST]' : ''}`]);

    if (!tradeHistoryLoaded) {
      await loadTradeHistory().catch(err => {
        console.warn('Failed to load trade history before aggregation:', err && err.message ? err.message : err);
      });
    }

    const preSync = synchronizeWatchesWithTradeHistory();
    if (preSync.changes.length && (!options || options.updateState !== false)) {
      scheduleSaveWatches();
    }

    let apiCallsSkipped = 0;
    let apiCallsMade = 0;

    // Collect fresh data for all watches and group by chatId (always include all tickers)
    const byChat = new Map(); // chatId -> Array<{ w, ibs, quote, range, ohlc, closeEnoughToExit, closeEnoughToEntry, confirmExit, confirmEntry, dataOk, fetchError, avFresh, rtFresh }>
    for (const w of telegramWatches.values()) {
      const chatId = w.chatId || getApiConfig().TELEGRAM_CHAT_ID;
      if (!chatId) continue;
      if (!byChat.has(chatId)) byChat.set(chatId, []);
      const rec = { w, ibs: null, quote: null, range: null, ohlc: null, closeEnoughToExit: null, closeEnoughToEntry: null, confirmExit: null, confirmEntry: null, dataOk: false, fetchError: null, avFresh: false, rtFresh: false };
      byChat.get(chatId).push(rec);
      // ensure per-day flags
      if (w.sent.dateKey !== todayKey) w.sent = { dateKey: todayKey, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false };
      // 1) Check dataset freshness first, then refresh via Alpha Vantage only if needed
      try {
        // Предварительная проверка: есть ли уже данные за предыдущий торговый день?
        const prev = previousTradingDayET(nowEt);
        const prevKey = etKeyYMD(prev);
        let needsUpdate = false;

        const filePath = resolveDatasetFilePathById(w.symbol);
        if (filePath && await fs.pathExists(filePath)) {
          const dataset = await fs.readJson(filePath).catch(() => null);
          if (dataset && dataset.data && Array.isArray(dataset.data)) {
            const hasYesterday = dataset.data.some(d => d && d.date === prevKey);
            if (hasYesterday) {
              rec.avFresh = true; // Данные актуальны, API не нужен
              apiCallsSkipped++;
            } else {
              needsUpdate = true; // Нет данных за вчера, нужно обновить
            }
          } else {
            needsUpdate = true; // Нет датасета, нужно создать
          }
        } else {
          needsUpdate = true; // Нет файла, нужно создать
        }

        // Обновляем через API только если данные устарели
        if (needsUpdate) {
          apiCallsMade++;
          const avStatus = await refreshTickerViaAlphaVantageAndCheckFreshness(w.symbol, nowEt);
          rec.avFresh = !!(avStatus && avStatus.avFresh);
        }
      } catch { }
      // 2) Fetch today's range/quote via Finnhub (today only)
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
        // Абсолютный порог: вход ≤ lowIBS + delta; выход ≥ highIBS − delta
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

    // Send messages per chat
    for (const [chatId, list] of byChat.entries()) {
      const state = getAggregateState(chatId, todayKey);

      // T-11 overview — always send once
      if (minutesUntilClose === 11 && (!state.t11Sent || (options && options.forceSend))) {
        const closeH = String(Math.floor(session.closeMin / 60)).padStart(2, '0');
        const closeM = String(session.closeMin % 60).padStart(2, '0');
        const header = `⏱ До закрытия: ${String(Math.floor(minutesUntilClose / 60)).padStart(2, '0')}:${String(minutesUntilClose % 60).padStart(2, '0')} • ${closeH}:${closeM} ET${session.short ? ' (сокр.)' : ''} • ${todayKey}`;
        const sorted = list.slice().sort((a, b) => a.w.symbol.localeCompare(b.w.symbol));

        // Collect signals summary
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
          const thresholdStr = positionOpen ? `≥ ${(w.highIBS - delta).toFixed(2)} (цель ${w.highIBS})` : `≤ ${((w.lowIBS ?? 0.1) + delta).toFixed(2)} (цель ${w.lowIBS ?? 0.1})`;
          const statusLabel = positionOpen ? 'Открыта' : 'Нет позиции';

          // Collect signals for summary
          if (rec.dataOk && near) {
            if (positionOpen) {
              exitSignals.push(`${w.symbol} (IBS ${(rec.ibs * 100).toFixed(1)}%)`);
            } else {
              entrySignals.push(`${w.symbol} (IBS ${(rec.ibs * 100).toFixed(1)}%)`);
            }
          }

          // Progress bar for IBS: 10 slots — map using ceil(ibs*11) to better match examples and clamp to 10
          const fillCount = rec.dataOk && Number.isFinite(rec.ibs) ? Math.max(0, Math.min(10, Math.ceil(rec.ibs * 11))) : 0;
          const bar = '█'.repeat(fillCount) + '░'.repeat(10 - fillCount);
          const line1 = `${w.symbol} • ${statusLabel} • ${priceStr}`;
          const line2 = `IBS ${ibsStr}  [${bar}]`;
          const line3 = `AV${rec.avFresh ? '✅' : '❌'}  RT${rec.rtFresh ? '✅' : '❌'}`;
          const line4 = `Сигнал (${type}): ${nearStr}`;
          blocks.push([line1, line2, line3, line4].join('\n'));
          const logOne = rec.dataOk
            ? `${w.symbol} pos=${positionOpen ? 'open' : 'none'} IBS=${ibsStr} near=${nearStr} thr=${thresholdStr}`
            : `${w.symbol} pos=${positionOpen ? 'open' : 'none'} data=NA err=${rec.fetchError}`;
          logLines.push(logOne);
        }

        // Build signals summary
        let signalsSummary = '🔔 СИГНАЛЫ:\n';
        if (entrySignals.length > 0) {
          signalsSummary += `• На вход: ${entrySignals.join(', ')}\n`;
        } else {
          signalsSummary += '• На вход: нет\n';
        }
        if (exitSignals.length > 0) {
          signalsSummary += `• На выход: ${exitSignals.join(', ')}`;
        } else {
          signalsSummary += '• На выход: нет';
        }

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

      // T-1 confirmations — send once if any signals exist
      if (minutesUntilClose === 1 && (!state.t1Sent || (options && options.forceSend))) {
        const nowIso = new Date().toISOString();
        const entryCandidates = [];
        const potentialExitDetails = [];
        const potentialEntryDetails = [];
        const sortedByIBS = list.slice().sort((a, b) => {
          if (a.ibs == null && b.ibs == null) return a.w.symbol.localeCompare(b.w.symbol);
          if (a.ibs == null) return 1;
          if (b.ibs == null) return -1;
          if (a.ibs === b.ibs) return a.w.symbol.localeCompare(b.w.symbol);
          return a.ibs - b.ibs;
        });

        const openTradeBefore = getCurrentOpenTrade();
        const openSymbolBefore = openTradeBefore ? openTradeBefore.symbol : null;
        let exitCandidate = null;

        for (const rec of sortedByIBS) {
          if (!rec.dataOk) continue;
          const { w } = rec;
          const ibsPercent = typeof rec.ibs === 'number' ? (rec.ibs * 100).toFixed(1) : '—';
          const lowThreshold = (w.lowIBS ?? 0.1) * 100;
          const highThreshold = (w.highIBS ?? 0.75) * 100;

          if (openSymbolBefore && w.symbol === openSymbolBefore) {
            potentialExitDetails.push({
              symbol: w.symbol,
              ibsPercent,
              highThreshold: highThreshold.toFixed(1),
              confirm: rec.confirmExit,
            });
            if (rec.confirmExit) {
              exitCandidate = rec;
            }
          }

          if (rec.confirmEntry) {
            potentialEntryDetails.push({
              symbol: w.symbol,
              ibsPercent,
              lowThreshold: lowThreshold.toFixed(1),
            });
            entryCandidates.push(rec);
          }
        }

        let exitAction = null;
        if (exitCandidate && !openSymbolBefore) {
          exitCandidate = null; // safety: no open trade
        }

        if (exitCandidate && openSymbolBefore) {
          const exitTrade = recordTradeExit({
            symbol: exitCandidate.w.symbol,
            price: exitCandidate.quote?.current ?? null,
            ibs: exitCandidate.ibs,
            decisionTime: nowIso,
            dateKey: todayKey,
          });
          if (exitTrade) {
            exitAction = {
              symbol: exitCandidate.w.symbol,
              price: exitCandidate.quote?.current ?? null,
              ibs: exitCandidate.ibs,
            };
            if (!options || options.updateState !== false) {
              exitCandidate.w.sent.confirm1 = true;
            }
            await appendMonitorLog([`T-1 exit executed for ${exitCandidate.w.symbol} @ ${exitCandidate.quote?.current ?? '—'} IBS=${exitCandidate.ibs != null ? exitCandidate.ibs.toFixed(3) : '—'}`]);
          }
        }

        const syncAfterExit = synchronizeWatchesWithTradeHistory();
        if (syncAfterExit.changes.length && (!options || options.updateState !== false)) {
          scheduleSaveWatches();
        }

        let entryAction = null;
        const openTradeAfterExit = getCurrentOpenTrade();
        if (!openTradeAfterExit && entryCandidates.length > 0) {
          const availableEntries = entryCandidates.filter(rec => rec.confirmEntry && rec.dataOk);
          if (availableEntries.length > 0) {
            const bestEntry = availableEntries.reduce((best, rec) => {
              if (!best) return rec;
              if (rec.ibs == null) return best;
              if (best.ibs == null) return rec;
              if (rec.ibs === best.ibs) return rec.w.symbol.localeCompare(best.w.symbol) < 0 ? rec : best;
              return rec.ibs < best.ibs ? rec : best;
            }, null);

            if (bestEntry) {
              const trade = recordTradeEntry({
                symbol: bestEntry.w.symbol,
                price: bestEntry.quote?.current ?? null,
                ibs: bestEntry.ibs,
                decisionTime: nowIso,
                dateKey: todayKey,
              });
              if (trade) {
                entryAction = {
                  symbol: bestEntry.w.symbol,
                  price: bestEntry.quote?.current ?? null,
                  ibs: bestEntry.ibs,
                };
                if (!options || options.updateState !== false) {
                  bestEntry.w.sent.entryConfirm1 = true;
                }
                await appendMonitorLog([`T-1 entry executed for ${bestEntry.w.symbol} @ ${bestEntry.quote?.current ?? '—'} IBS=${bestEntry.ibs != null ? bestEntry.ibs.toFixed(3) : '—'}`]);
              }
            }
          }
        }

        const syncResult = synchronizeWatchesWithTradeHistory();
        if (syncResult.changes.length && (!options || options.updateState !== false)) {
          scheduleSaveWatches();
        }

        const openTradeNow = getCurrentOpenTrade();
        const potentialExitLines = [];
        if (potentialExitDetails.length === 0) {
          potentialExitLines.push('• Сигналов на выход нет');
        } else {
          for (const detail of potentialExitDetails) {
            if (detail.confirm) {
              potentialExitLines.push(`• ${detail.symbol}: IBS ${detail.ibsPercent}% ≥ ${detail.highThreshold}% (сигнал выхода)`);
            } else {
              potentialExitLines.push(`• ${detail.symbol}: IBS ${detail.ibsPercent}% (порог ${detail.highThreshold}%)`);
            }
          }
        }

        const potentialEntryLines = [];
        if (potentialEntryDetails.length === 0) {
          potentialEntryLines.push('• Сигналов на вход нет');
        } else {
          const finalOpenSymbol = openTradeNow ? openTradeNow.symbol : null;
          for (const detail of potentialEntryDetails) {
            let note = '';
            if (entryAction && entryAction.symbol === detail.symbol) {
              note = ' (выбран)';
            } else if (finalOpenSymbol && finalOpenSymbol !== detail.symbol) {
              note = ' (позиция занята)';
            }
            potentialEntryLines.push(`• ${detail.symbol}: IBS ${detail.ibsPercent}% ≤ ${detail.lowThreshold}%${note}`);
          }
        }

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

        const header = '<b>⏱️ 1 минута до закрытия — мониторинг IBS</b>';
        const timestampLine = `Дата: ${todayKey}, Время: ${String(nowEt.hh).padStart(2, '0')}:${String(nowEt.mm).padStart(2, '0')}`;
        const totalTickers = list.length;
        const freshRealtime = list.filter(item => item.rtFresh).length;
        let freshnessLine;
        if (totalTickers === 0) {
          freshnessLine = 'Актуальные котировки: тикеры не отслеживаются';
        } else if (freshRealtime === totalTickers) {
          freshnessLine = 'Актуальные котировки: получены по всем тикерам ✅';
        } else if (freshRealtime === 0) {
          freshnessLine = 'Актуальные котировки: нет обновлённых цен ❌';
        } else {
          freshnessLine = `Актуальные котировки: ${freshRealtime}/${totalTickers} тикера с обновлёнными данными ⚠️`;
        }
        const positionLine = openTradeNow
          ? `Текущая позиция: ${openTradeNow.symbol} (вход ${openTradeNow.entryDate || '—'} по ${typeof openTradeNow.entryPrice === 'number' ? `$${openTradeNow.entryPrice.toFixed(2)}` : '—'})`
          : 'Текущая позиция: нет';

        const messageParts = [
          header,
          '',
          '<b>🎯 РЕШЕНИЕ:</b>',
          ...decisionLines,
          '',
          '<b>📊 ПОДРОБНО:</b>',
          timestampLine,
          freshnessLine,
          positionLine,
          '',
          '<b>Потенциальные сигналы на выход:</b>',
          ...potentialExitLines,
          '',
          '<b>Потенциальные сигналы на вход:</b>',
          ...potentialEntryLines,
        ];

        const text = messageParts.join('\n');
        const resp = await sendTelegramMessage(chatId, text);
        if (resp.ok) {
          if (!options || options.updateState !== false) {
            state.t1Sent = true;
            aggregateSendState.set(chatId, state);
          }
          await appendMonitorLog([`T-1 report → chat ${chatId}`, ...decisionLines, freshnessLine]);
        } else {
          await appendMonitorLog([`T-1 report → chat ${chatId}`, 'send failed']);
        }
      }
    }

    // Логируем статистику API вызовов
    await appendMonitorLog([`T-${minutesUntilClose}min завершён. API вызовов: ${apiCallsMade}, пропущено: ${apiCallsSkipped}, экономия: ${Math.round(apiCallsSkipped / (apiCallsSkipped + apiCallsMade) * 100) || 0}%`]);

    return { sent: true };
  } catch (e) {
    console.warn('Scheduler error:', e.message);
    try { await appendMonitorLog([`Scheduler error: ${e && e.message ? e.message : e}`]); } catch { }
    return { sent: false };
  }
}

const priceActualizationState = {
  lastRunDateKey: null,
  status: 'idle',
  startedAt: null,
  completedAt: null,
  source: null,
  error: null,
};

function computePriceActualizationDelayMs() {
  const base = PRICE_ACTUALIZATION_REQUEST_DELAY_MS;
  const jitterMax = PRICE_ACTUALIZATION_DELAY_JITTER_MS;
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
    `⏳ Throttling AlphaVantage requests: waiting ${seconds}s before next ticker (processed ${index + 1}/${total}, last ${symbol})`
  );
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

// Price actualization script - runs 16 minutes AFTER market close to update final prices
async function runPriceActualization(options = {}) {
  const { force = false, source = 'unknown' } = options;

  const nowEt = getETParts(new Date());
  const cal = await loadTradingCalendarJSON().catch(() => null);

  try {
    console.log(`🕐 runPriceActualization called at ${String(nowEt.hh).padStart(2, '0')}:${String(nowEt.mm).padStart(2, '0')}:${String(nowEt.ss).padStart(2, '0')} ET`);

    // Only run on trading days
    if (!isTradingDayByCalendarET(nowEt, cal)) {
      console.log('📅 Not a trading day, skipping price actualization');
      return { updated: false, reason: 'not_trading_day' };
    }

    const session = getTradingSessionForDateET(nowEt, cal);
    const nowMinutes = (nowEt.hh * 60 + nowEt.mm);
    const minutesAfterClose = nowMinutes - session.closeMin;

    console.log(`⏰ Market closed at ${Math.floor(session.closeMin / 60)}:${String(session.closeMin % 60).padStart(2, '0')} ET, now ${minutesAfterClose} minutes after close`);

    // Run exactly 16 minutes after close
    if (minutesAfterClose !== 16) {
      const nextRunTime = new Date();
      const targetMinutes = session.closeMin + 16;
      nextRunTime.setHours(Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0);

      console.log(`⏳ Not time yet (need exactly 16 min after close, currently ${minutesAfterClose} min after)`);
      console.log(`⏰ Target run time: ${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:${String(targetMinutes % 60).padStart(2, '0')} ET`);

      return {
        updated: false,
        reason: 'wrong_timing',
        minutesAfterClose,
        targetRunTime: `${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:${String(targetMinutes % 60).padStart(2, '0')} ET`,
        currentTime: `${String(nowEt.hh).padStart(2, '0')}:${String(nowEt.mm).padStart(2, '0')} ET`
      };
    }

    const todayKey = etKeyYMD(nowEt);

    if (priceActualizationState.lastRunDateKey !== todayKey) {
      priceActualizationState.lastRunDateKey = null;
      priceActualizationState.status = 'idle';
      priceActualizationState.startedAt = null;
      priceActualizationState.completedAt = null;
      priceActualizationState.source = null;
      priceActualizationState.error = null;
    }

    if (!force && priceActualizationState.lastRunDateKey === todayKey) {
      if (priceActualizationState.status === 'running') {
        console.log(`🔁 Price actualization already running for ${todayKey}, skipping duplicate trigger from ${source}`);
        return { updated: false, reason: 'already_running', todayKey };
      }
      if (priceActualizationState.status === 'completed') {
        console.log(`✅ Price actualization already completed for ${todayKey}, skipping duplicate trigger from ${source}`);
        return { updated: false, reason: 'already_completed', todayKey };
      }
    }

    priceActualizationState.lastRunDateKey = todayKey;
    priceActualizationState.status = 'running';
    priceActualizationState.startedAt = Date.now();
    priceActualizationState.completedAt = null;
    priceActualizationState.source = source;
    priceActualizationState.error = null;

    console.log(`📊 T+16min: Starting price actualization for ${todayKey}`);
    await appendMonitorLog([`T+16min: начинаем актуализацию цен закрытия для ${todayKey}`]);

    let updatedTickers = [];
    let failedTickers = [];
    let tickersWithoutTodayData = [];

    const watchList = Array.from(telegramWatches.values());
    if (watchList.length > 0) {
      const jitterInfo = PRICE_ACTUALIZATION_DELAY_JITTER_MS > 0
        ? ` + джиттер до ${PRICE_ACTUALIZATION_DELAY_JITTER_MS}мс`
        : '';
      console.log(
        `⏳ Using AlphaVantage inter-request delay: база ${PRICE_ACTUALIZATION_REQUEST_DELAY_MS}мс${jitterInfo}`
      );
      await appendMonitorLog([
        `Задержка между запросами AlphaVantage: база ${PRICE_ACTUALIZATION_REQUEST_DELAY_MS}мс${jitterInfo}`
      ]);
    }

    // Update all watched tickers
    for (let idx = 0; idx < watchList.length; idx++) {
      const w = watchList[idx];
      try {
        console.log(`🔄 Processing ticker: ${w.symbol}`);
        await appendMonitorLog([`Обновляем ${w.symbol} через AlphaVantage...`]);

        // Get dataset before update to check last date
        const beforeDataset = await getDatasetBeforeUpdate(w.symbol);
        const beforeLastDate = beforeDataset ? getLastDateFromDataset(beforeDataset) : null;
        console.log(`📅 ${w.symbol}: last date before update = ${beforeLastDate || 'none'}`);

        const result = await refreshTickerViaAlphaVantageAndCheckFreshness(w.symbol, nowEt);

        if (result.avFresh) {
          // Check if we actually got today's data
          const afterDataset = await getDatasetAfterUpdate(w.symbol);
          const afterLastDate = afterDataset ? getLastDateFromDataset(afterDataset) : null;
          console.log(`📅 ${w.symbol}: last date after update = ${afterLastDate || 'none'}`);

          if (afterLastDate === todayKey) {
            updatedTickers.push(w.symbol);
            console.log(`✅ ${w.symbol}: successfully updated with today's data (${todayKey})`);
            await appendMonitorLog([`${w.symbol} - обновлён успешно с данными за ${todayKey}`]);
          } else {
            tickersWithoutTodayData.push({
              symbol: w.symbol,
              lastDate: afterLastDate,
              expectedDate: todayKey
            });
            console.log(`⚠️ ${w.symbol}: API call successful but no data for ${todayKey}, last date: ${afterLastDate}`);
            await appendMonitorLog([`${w.symbol} - API успешно, но нет данных за ${todayKey} (последняя дата: ${afterLastDate})`]);
          }
        } else {
          failedTickers.push({
            symbol: w.symbol,
            reason: result.reason || 'API call failed'
          });
          console.log(`❌ ${w.symbol}: API call failed - ${result.reason || 'unknown reason'}`);
          await appendMonitorLog([`${w.symbol} - не удалось обновить: ${result.reason || 'неизвестная ошибка'}`]);
        }

        if (idx < watchList.length - 1) {
          await waitForPriceActualizationThrottle({ symbol: w.symbol, index: idx, total: watchList.length });
        }
      } catch (error) {
        failedTickers.push({
          symbol: w.symbol,
          reason: error.message
        });
        console.log(`❌ ${w.symbol}: Exception - ${error.message}`);
        await appendMonitorLog([`${w.symbol} - ошибка: ${error.message}`]);
      }
    }

    // Create comprehensive summary
    const totalTickers = telegramWatches.size;
    const actuallyUpdated = updatedTickers.length;
    const hasProblems = failedTickers.length > 0 || tickersWithoutTodayData.length > 0;

    let logMsg = `📊 Актуализация цен завершена (${todayKey}):\n`;
    logMsg += `• Всего тикеров: ${totalTickers}\n`;
    logMsg += `• Успешно обновлено с данными за сегодня: ${actuallyUpdated}`;
    if (actuallyUpdated > 0) logMsg += ` (${updatedTickers.join(', ')})`;
    logMsg += `\n`;

    if (tickersWithoutTodayData.length > 0) {
      logMsg += `• Обновлено, но без данных за сегодня: ${tickersWithoutTodayData.length} `;
      logMsg += `(${tickersWithoutTodayData.map(t => `${t.symbol}:${t.lastDate}`).join(', ')})\n`;
    }

    if (failedTickers.length > 0) {
      logMsg += `• Не удалось обновить: ${failedTickers.length} `;
      logMsg += `(${failedTickers.map(t => `${t.symbol}:${t.reason}`).join(', ')})\n`;
    }

    console.log(logMsg);
    await appendMonitorLog([logMsg]);

    await appendMonitorLog([`T+16min: синхронизация позиций с журналом сделок...`]);

    if (!tradeHistoryLoaded) {
      await loadTradeHistory().catch(err => {
        console.warn('Failed to load trade history before sync:', err && err.message ? err.message : err);
      });
    }

    const syncResult = synchronizeWatchesWithTradeHistory();
    if (syncResult.changes.length) {
      await appendMonitorLog([`Синхронизировано позиций: ${syncResult.changes.length}`]);
      for (const change of syncResult.changes) {
        if (change.action === 'sync_open') {
          await appendMonitorLog([`${change.symbol} → открыта позиция по ${change.nextPrice != null ? change.nextPrice : '—'}`]);
        } else if (change.action === 'sync_close') {
          await appendMonitorLog([`${change.symbol} → позиция закрыта`]);
        }
      }
      scheduleSaveWatches();
    } else {
      await appendMonitorLog(['Позиции без изменений']);
    }

    const openTradeAfterSync = getCurrentOpenTrade();

    const chatId = getApiConfig().TELEGRAM_CHAT_ID;
    let shouldSendDailyReport = false;
    let dailyReportMessage = '';

    if (chatId && (updatedTickers.length > 0 || syncResult.changes.length > 0)) {
      shouldSendDailyReport = true;
      let message = `📊 Ежедневный отчёт (${todayKey})\n\n`;

      if (updatedTickers.length > 0) {
        message += `📈 Обновлено цен: ${updatedTickers.length}\n${updatedTickers.join(', ')}\n\n`;
      }

      if (syncResult.changes.length > 0) {
        message += `🔄 Изменения позиций:\n`;
        for (const change of syncResult.changes) {
          if (change.action === 'sync_open') {
            const price = change.nextPrice != null ? `$${Number(change.nextPrice).toFixed(2)}` : '—';
            message += `• ${change.symbol}: открыта по ${price}\n`;
          } else if (change.action === 'sync_close') {
            const price = change.previousPrice != null ? `$${Number(change.previousPrice).toFixed(2)}` : '—';
            message += `• ${change.symbol}: закрыта (было ${price})\n`;
          }
        }
      } else {
        message += `✅ Позиции без изменений\n`;
      }

      message += '\n';
      if (openTradeAfterSync) {
        const entryPrice = typeof openTradeAfterSync.entryPrice === 'number' ? `$${openTradeAfterSync.entryPrice.toFixed(2)}` : '—';
        const entryIbs = typeof openTradeAfterSync.entryIBS === 'number' ? `${(openTradeAfterSync.entryIBS * 100).toFixed(1)}%` : '—';
        message += `🔔 Текущая позиция: ${openTradeAfterSync.symbol} • вход ${openTradeAfterSync.entryDate || '—'} • ${entryPrice} • IBS ${entryIbs}`;
      } else {
        message += `🔔 Текущая позиция: нет`;
      }

      dailyReportMessage = message;
    }

    // Send Telegram notification about actualization results (with optional daily report appended)
    if (hasProblems && chatId) {
      let telegramMsg = `⚠️ Актуализация цен (${todayKey})\n\n`;

      // PROBLEMS SUMMARY FIRST
      telegramMsg += `🚨 ПРОБЛЕМЫ:\n`;
      const problemLines = [];
      if (tickersWithoutTodayData.length > 0) {
        const symbols = tickersWithoutTodayData.map(t => t.symbol).join(', ');
        problemLines.push(`• Без данных за сегодня: ${tickersWithoutTodayData.length} ${tickersWithoutTodayData.length === 1 ? 'тикер' : 'тикера'} (${symbols})`);
      }
      if (failedTickers.length > 0) {
        const symbols = failedTickers.map(t => t.symbol).join(', ');
        problemLines.push(`• Ошибки обновления: ${failedTickers.length} ${failedTickers.length === 1 ? 'тикер' : 'тикера'} (${symbols})`);
      }
      telegramMsg += problemLines.join('\n');

      // DETAILS SECOND
      telegramMsg += `\n\n📊 ПОДРОБНО:\n`;
      telegramMsg += `✅ Обновлено с данными за сегодня: ${actuallyUpdated}/${totalTickers}\n`;
      if (actuallyUpdated > 0) telegramMsg += `${updatedTickers.join(', ')}\n\n`;

      if (tickersWithoutTodayData.length > 0) {
        telegramMsg += `⚠️ Без данных за сегодня (${tickersWithoutTodayData.length}):\n`;
        tickersWithoutTodayData.forEach(t => {
          telegramMsg += `• ${t.symbol}: последняя дата ${t.lastDate || 'неизвестно'}\n`;
        });
        telegramMsg += `\n`;
      }

      if (failedTickers.length > 0) {
        telegramMsg += `❌ Ошибки обновления (${failedTickers.length}):\n`;
        failedTickers.forEach(t => {
          telegramMsg += `• ${t.symbol}: ${t.reason}\n`;
        });
      }

      if (shouldSendDailyReport && dailyReportMessage) {
        telegramMsg += `\n\n${dailyReportMessage}`;
        shouldSendDailyReport = false;
      }

      try {
        await sendTelegramMessage(chatId, telegramMsg);
        console.log('📱 Problem notification sent to Telegram');
      } catch (teleError) {
        console.log(`📱 Failed to send Telegram notification: ${teleError.message}`);
      }
    }

    if (shouldSendDailyReport && dailyReportMessage && chatId) {
      await sendTelegramMessage(chatId, dailyReportMessage);
    }

    priceActualizationState.status = 'completed';
    priceActualizationState.completedAt = Date.now();

    return {
      updated: true,
      count: actuallyUpdated,
      tickers: updatedTickers,
      totalTickers: totalTickers,
      failedTickers: failedTickers,
      tickersWithoutTodayData: tickersWithoutTodayData,
      hasProblems: hasProblems,
      todayKey: todayKey
    };
  } catch (error) {
    console.error('💥 Price actualization error:', error.message);
    console.error(error.stack);

    priceActualizationState.status = 'failed';
    priceActualizationState.completedAt = Date.now();
    priceActualizationState.error = error.message;

    // Send error notification to Telegram
    try {
      let errorMsg = `❌ КРИТИЧЕСКАЯ ОШИБКА актуализации цен\n\n`;
      errorMsg += `Время: ${new Date().toISOString()}\n`;
      errorMsg += `Ошибка: ${error.message}\n`;
      errorMsg += `\nПроверьте логи сервера!`;

      await sendTelegramMessage(getApiConfig().TELEGRAM_CHAT_ID, errorMsg);
      console.log('📱 Critical error notification sent to Telegram');
    } catch (teleError) {
      console.log(`📱 Failed to send critical error notification: ${teleError.message}`);
    }

    try { await appendMonitorLog([`❌ КРИТИЧЕСКАЯ ОШИБКА актуализации цен: ${error.message}`]); } catch { }
    return { updated: false, error: error.message };
  }
}

setInterval(async () => {
  await runTelegramAggregation(null, {});
  await runPriceActualization({ source: 'scheduler' });
}, 15000);

// Test simulation endpoint to reproduce the logic as if at T-11 or T-1
app.post('/api/telegram/simulate', async (req, res) => {
  try {
    const stage = (req.body && req.body.stage) || 'overview';
    const minutes = stage === 'confirmations' ? 1 : 11;
    const result = await runTelegramAggregation(minutes, { test: true, forceSend: true, updateState: false });
    res.json({ success: !!(result && result.sent), stage });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Failed to simulate telegram aggregation' });
  }
});

// Test price actualization endpoint 
app.post('/api/telegram/actualize-prices', async (req, res) => {
  try {
    const forceRun = !!(req.body && req.body.force);
    const result = await runPriceActualization({ force: forceRun, source: 'manual_endpoint' });
    res.json({
      success: result.updated,
      count: result.count || 0,
      tickers: result.tickers || [],
      reason: result.reason || null,
      todayKey: result.todayKey || null
    });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Failed to run price actualization' });
  }
});

// List current telegram watches
app.get('/api/telegram/watches', async (req, res) => {
  try {
    if (!tradeHistoryLoaded) {
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

app.get('/api/trades', async (req, res) => {
  try {
    if (!tradeHistoryLoaded) {
      await loadTradeHistory();
    }
    const sorted = getSortedTradeHistory();
    const openTrade = getCurrentOpenTrade();
    res.json({
      trades: sorted.map(serializeTradeForResponse),
      openTrade: openTrade ? serializeTradeForResponse(openTrade) : null,
      total: tradeHistory.length,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Failed to load trade history' });
  }
});

/**
 * Обновляет статус позиций для всех акций в мониторинге 
 */
async function updateAllPositions() {
  console.log('🔄 Synchronizing monitored positions with trade history...');
  if (!tradeHistoryLoaded) {
    await loadTradeHistory().catch(err => {
      console.warn('Failed to load trade history during manual sync:', err && err.message ? err.message : err);
    });
  }

  const syncResult = synchronizeWatchesWithTradeHistory();
  if (syncResult.changes.length) {
    scheduleSaveWatches();
  }

  const openTrade = getCurrentOpenTrade();
  console.log(`✅ Position sync completed. Changes: ${syncResult.changes.length}`);
  return {
    changes: syncResult.changes,
    openTrade,
  };
}

// API для ручного обновления позиций
app.post('/api/telegram/update-positions', async (req, res) => {
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
app.post('/api/telegram/update-all', async (req, res) => {
  try {
    // First, actualize prices
    const forceActualization = !!(req.body && (req.body.forceActualization || req.body.forcePrices || req.body.force));
    const priceResult = await runPriceActualization({ force: forceActualization, source: 'update-all-endpoint' });

    // Then, update positions based on new prices
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
        minutesAfterClose: priceResult.minutesAfterClose
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

// Send test telegram message
app.post('/api/telegram/test', async (req, res) => {
  try {
    const chatId = (req.body && req.body.chatId) || getApiConfig().TELEGRAM_CHAT_ID;
    const msg = (req.body && req.body.message) || 'Test message from Trading Backtester ✅';

    console.log(`Testing Telegram with chat_id: ${chatId}, message: "${msg.substring(0, 50)}..."`);

    const resp = await sendTelegramMessage(chatId, msg);

    if (!resp.ok) {
      const errorDetails = resp.error || resp.reason || 'Failed to send test message';
      console.error(`Test message failed:`, resp);

      // If reason is not_configured, return 400, otherwise 500
      const status = resp.reason === 'not_configured' ? 400 : 500;

      return res.status(status).json({
        error: errorDetails,
        statusCode: resp.statusCode,
        errorCode: resp.errorCode,
        details: resp.fullResponse || resp.rawResponse
      });
    }

    console.log(`Test message sent successfully`);
    res.json({ success: true, result: resp.result });
  } catch (e) {
    console.error('Exception in /api/telegram/test:', e);
    res.status(500).json({ error: e.message || 'Failed to send test message' });
  }
});

// Test API provider endpoint
app.post('/api/test-provider', async (req, res) => {
  try {
    const provider = (req.body && req.body.provider) || 'alpha_vantage';
    const testSymbol = 'AAPL'; // Use AAPL for testing

    console.log(`Testing ${provider} API with symbol ${testSymbol}...`);

    let result;
    if (provider === 'alpha_vantage') {
      if (!getApiConfig().ALPHA_VANTAGE_API_KEY) {
        return res.status(400).json({ error: 'Alpha Vantage API key not configured' });
      }
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${testSymbol}&apikey=${getApiConfig().ALPHA_VANTAGE_API_KEY}`;
      const response = await new Promise((resolve, reject) => {
        https.get(url, (resp) => {
          let data = '';
          resp.on('data', (chunk) => data += chunk);
          resp.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json['Note'] || json['Information']) {
                return reject(new Error(json['Note'] || json['Information']));
              }
              if (json['Error Message']) {
                return reject(new Error(json['Error Message']));
              }
              const quote = json['Global Quote'];
              if (quote && quote['05. price']) {
                resolve({ success: true, price: quote['05. price'], symbol: testSymbol });
              } else {
                reject(new Error('No data returned'));
              }
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      result = response;
    } else if (provider === 'finnhub') {
      if (!getApiConfig().FINNHUB_API_KEY) {
        return res.status(400).json({ error: 'Finnhub API key not configured' });
      }
      const url = `https://finnhub.io/api/v1/quote?symbol=${testSymbol}&token=${getApiConfig().FINNHUB_API_KEY}`;
      const response = await new Promise((resolve, reject) => {
        https.get(url, (resp) => {
          let data = '';
          resp.on('data', (chunk) => data += chunk);
          resp.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                return reject(new Error(json.error));
              }
              if (json.c) {
                resolve({ success: true, price: json.c, symbol: testSymbol });
              } else {
                reject(new Error('No data returned'));
              }
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      result = response;
    } else if (provider === 'twelve_data') {
      if (!getApiConfig().TWELVE_DATA_API_KEY) {
        return res.status(400).json({ error: 'Twelve Data API key not configured' });
      }
      const url = `https://api.twelvedata.com/quote?symbol=${testSymbol}&apikey=${getApiConfig().TWELVE_DATA_API_KEY}`;
      const response = await new Promise((resolve, reject) => {
        https.get(url, (resp) => {
          let data = '';
          resp.on('data', (chunk) => data += chunk);
          resp.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.status === 'error' || json.code) {
                return reject(new Error(json.message || 'Twelve Data API error'));
              }
              if (json.close) {
                resolve({ success: true, price: json.close, symbol: testSymbol });
              } else {
                reject(new Error('No data returned'));
              }
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });
      result = response;
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }

    res.json(result);
  } catch (e) {
    console.error('Provider test error:', e);
    res.status(500).json({ error: e.message || 'Failed to test provider' });
  }
});

app.post('/api/telegram/command', async (req, res) => {
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
      if (!tradeHistoryLoaded) {
        await loadTradeHistory();
      }
      const maxItems = typeof limit === 'number' && limit > 0 ? Math.min(50, Math.floor(limit)) : 5;
      const text = buildTradeHistoryMessage(maxItems);
      const resp = await sendTelegramMessage(targetChatId, text);
      if (resp.ok) {
        return res.json({ success: true, command: normalized, sent: true, items: Math.min(maxItems, tradeHistory.length) });
      }
      return res.status(502).json({ error: 'send_failed', command: normalized });
    }

    return res.status(400).json({ error: 'unknown_command', command: normalized });
  } catch (e) {
    console.error('Telegram command error:', e);
    res.status(500).json({ error: e && e.message ? e.message : 'Failed to process command' });
  }
});

// Middleware already applied at the top

// Создаем папки для датасетов если их нет (основная и бэкап)
fs.ensureDirSync(DATASETS_DIR);
try { fs.ensureDirSync(KEEP_DATASETS_DIR); } catch { }

// Жёсткая нормализация: оставляем только TICKER.json на диске
function normalizeStableDatasetsSync() {
  try {
    const files = fs.readdirSync(DATASETS_DIR);
    // 0) Удалим мусорные AppleDouble файлы
    for (const f of files) {
      if (f.startsWith('._')) {
        try { fs.removeSync(path.join(DATASETS_DIR, f)); } catch { }
      }
    }
    const left = fs.readdirSync(DATASETS_DIR).filter(f => f.endsWith('.json'));
    // 1) Сгруппировать по тикеру
    const byTicker = new Map();
    for (const f of left) {
      const base = path.basename(f, '.json');
      const ticker = toSafeTicker(base.split('_')[0]);
      if (!ticker) continue;
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker).push(f);
    }
    // 2) Для каждого тикера обеспечить только один стабильный файл TICKER.json
    for (const [ticker, arr] of byTicker.entries()) {
      const stablePath = path.join(DATASETS_DIR, `${ticker}.json`);
      const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
      const hasStable = arr.some(f => f.toUpperCase() === `${ticker}.JSON`);
      if (!hasStable) {
        // Создаём стабильный файл из самого свежего legacy; если в main нет — попробуем _keep
        const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
        const sourceMain = path.join(DATASETS_DIR, chosen);
        const sourceKeep = path.join(KEEP_DATASETS_DIR, chosen);
        const source = (fs.existsSync(sourceMain) ? sourceMain : (fs.existsSync(sourceKeep) ? sourceKeep : sourceMain));
        try {
          const payload = fs.readJsonSync(source);
          if (payload) {
            payload.name = ticker;
            payload.ticker = ticker;
            fs.writeJsonSync(stablePath, payload, { spaces: 2 });
          } else {
            fs.copySync(source, stablePath, { overwrite: true });
          }
          console.log(`Normalized dataset for ${ticker} → ${path.basename(stablePath)}`);
        } catch (e) {
          console.warn(`Failed to normalize ${ticker}: ${e.message}`);
        }
      } else {
        // Убедимся, что в стабильном корректные поля
        try {
          const payload = fs.readJsonSync(stablePath);
          let mutated = false;
          if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
          if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
          if (mutated) fs.writeJsonSync(stablePath, payload, { spaces: 2 });
        } catch { }
      }
      // 3) Удаляем все legacy файлы (с датой в имени) в основной папке; в _keep не трогаем
      for (const f of arr) {
        const full = path.join(DATASETS_DIR, f);
        if (full === stablePath) continue;
        try { fs.removeSync(full); } catch { }
      }
    }
  } catch (e) {
    console.warn('Normalization skipped:', e.message);
  }
}

// One-time migration: consolidate legacy files like TICKER_YYYY-MM-DD.json → TICKER.json
function migrateLegacyDatasetsSync() {
  try {
    const files = listDatasetFilesSync();
    if (!files || files.length === 0) return;
    const byTicker = new Map();
    for (const f of files) {
      const base = path.basename(f, '.json');
      const ticker = toSafeTicker(base.split('_')[0]);
      if (!ticker) continue;
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker).push(f);
    }
    for (const [ticker, arr] of byTicker.entries()) {
      const target = path.join(DATASETS_DIR, `${ticker}.json`);
      if (fs.pathExistsSync(target)) {
        // Clean up legacy suffixed files and normalize payload
        for (const f of arr) {
          if (f.toUpperCase() === `${ticker}.JSON`) continue;
          try { fs.removeSync(path.join(DATASETS_DIR, f)); } catch { }
        }
        try {
          const payload = fs.readJsonSync(target);
          let mutated = false;
          if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
          if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
          if (mutated) fs.writeJsonSync(target, payload, { spaces: 2 });
        } catch { }
        continue;
      }
      // Choose latest legacy by filename order (YYYY-MM-DD suffix sorts lexicographically)
      const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
      const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
      // Prefer from main datasets dir, fallback to keep dir
      const sourceMain = path.join(DATASETS_DIR, chosen);
      const sourceKeep = path.join(KEEP_DATASETS_DIR, chosen);
      const source = (fs.existsSync(sourceMain) ? sourceMain : (fs.existsSync(sourceKeep) ? sourceKeep : sourceMain));
      try {
        const payload = fs.readJsonSync(source);
        if (payload) {
          payload.name = ticker;
          payload.ticker = ticker;
          fs.writeJsonSync(target, payload, { spaces: 2 });
        } else {
          fs.copySync(source, target, { overwrite: true });
        }
      } catch {
        try { fs.copySync(source, target, { overwrite: true }); } catch { }
      }
      // Remove all legacy files after migration in main dir only (do not touch keep dir)
      for (const f of arr) {
        const p = path.join(DATASETS_DIR, f);
        if (p === target) continue;
        try { fs.removeSync(p); } catch { }
      }
      console.log(`Migrated dataset files for ${ticker} → ${path.basename(target)}`);
    }
  } catch (e) {
    console.warn('Dataset migration skipped:', e.message);
  }
}

// Run migration on startup to ensure stable IDs
normalizeStableDatasetsSync();

// Helpers for dataset file name resolution (migrate away from date-suffixed names)
function toSafeTicker(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '');
}

function listDatasetFilesSync() {
  try {
    const main = fs
      .readdirSync(DATASETS_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('._'));
    let keep = [];
    try {
      keep = fs.readdirSync(KEEP_DATASETS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('._'));
    } catch { }
    // Deduplicate by filename, prefer main dir
    const byUpper = new Map();
    for (const f of keep) byUpper.set(f.toUpperCase(), path.join(KEEP_DATASETS_DIR, f));
    for (const f of main) byUpper.set(f.toUpperCase(), path.join(DATASETS_DIR, f));
    return Array.from(byUpper.values()).map(p => path.basename(p));
  } catch {
    return [];
  }
}

function resolveDatasetFilePathById(id) {
  // Unified ID policy: ID == TICKER (uppercase), file == TICKER.json
  const ticker = toSafeTicker((id || '').toString());
  if (!ticker) return null;
  const stableMain = path.join(DATASETS_DIR, `${ticker}.json`);
  const stableKeep = path.join(KEEP_DATASETS_DIR, `${ticker}.json`);
  try { if (fs.existsSync(stableMain)) return stableMain; } catch { }
  try { if (fs.existsSync(stableKeep)) return stableKeep; } catch { }
  // Fallback: support legacy suffixed filenames like TICKER_YYYY-MM-DD.json in either dir
  try {
    const files = listDatasetFilesSync();
    const legacy = files
      .filter(f => f.toUpperCase().startsWith(`${ticker}_`) && !f.startsWith('._'))
      .sort();
    if (legacy.length > 0) {
      const chosen = legacy[legacy.length - 1];
      // Choose from main if exists, else keep
      const mainPath = path.join(DATASETS_DIR, chosen);
      const keepPath = path.join(KEEP_DATASETS_DIR, chosen);
      try { if (fs.existsSync(mainPath)) return mainPath; } catch { }
      try { if (fs.existsSync(keepPath)) return keepPath; } catch { }
    }
  } catch { }
  return stableMain; // default target for writes
}

async function writeDatasetToTickerFile(dataset) {
  const ticker = toSafeTicker(dataset.ticker);
  const targetPath = path.join(DATASETS_DIR, `${ticker}.json`);
  // Remove legacy files for this ticker to avoid confusion (best-effort) from main dir only
  try {
    const files = await fs.readdir(DATASETS_DIR);
    await Promise.all(files
      .filter(f => f.toUpperCase().startsWith(`${ticker}_`))
      .map(f => fs.remove(path.join(DATASETS_DIR, f)).catch((err) => {
        console.warn(`Failed to delete file ${f}:`, err.message);
      }))
    );
  } catch { }
  // Strip embedded splits to enforce single source of truth (server/splits.json)
  const { splits: _dropSplits, ...clean } = (dataset || {});
  await fs.writeJson(targetPath, clean, { spaces: 2 });
  return { ticker, targetPath };
}

// Settings helpers
function getDefaultSettings() {
  return {
    watchThresholdPct: 5,
    resultsQuoteProvider: 'finnhub',
    enhancerProvider: 'alpha_vantage',
    resultsRefreshProvider: 'finnhub',
    // Процент высоты панели индикаторов (IBS/объём) от общей высоты графика
    indicatorPanePercent: 7,
    // Тикеры по умолчанию для страницы "Несколько тикеров"
    defaultMultiTickerSymbols: 'AAPL,MSFT,AMZN,MAGS'
  };
}

async function readSettings() {
  try {
    const exists = await fs.pathExists(SETTINGS_FILE);
    if (!exists) return getDefaultSettings();
    const json = await fs.readJson(SETTINGS_FILE);
    return { ...getDefaultSettings(), ...json };
  } catch (e) {
    console.warn('Failed to read settings, using defaults:', e.message);
    return getDefaultSettings();
  }
}

async function writeSettings(settings) {
  const payload = { ...getDefaultSettings(), ...settings };
  await fs.writeJson(SETTINGS_FILE, payload, { spaces: 2 });
  return payload;
}

// Settings endpoints
app.get('/api/settings', async (req, res) => {
  try {
    const s = await readSettings();
    res.json(s);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to read settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { watchThresholdPct, resultsQuoteProvider, enhancerProvider, resultsRefreshProvider, indicatorPanePercent, defaultMultiTickerSymbols } = req.body || {};
    const validProvider = (p) => p === 'alpha_vantage' || p === 'finnhub' || p === 'twelve_data';
    const next = getDefaultSettings();
    if (typeof watchThresholdPct === 'number') next.watchThresholdPct = watchThresholdPct;
    if (validProvider(resultsQuoteProvider)) next.resultsQuoteProvider = resultsQuoteProvider;
    if (validProvider(enhancerProvider)) next.enhancerProvider = enhancerProvider;
    if (validProvider(resultsRefreshProvider)) next.resultsRefreshProvider = resultsRefreshProvider;
    if (typeof indicatorPanePercent === 'number') {
      // Ограничим разумными пределами 0–40%
      const clamped = Math.max(0, Math.min(40, indicatorPanePercent));
      next.indicatorPanePercent = clamped;
    }
    if (typeof defaultMultiTickerSymbols === 'string') {
      next.defaultMultiTickerSymbols = defaultMultiTickerSymbols.trim();
    }
    const saved = await writeSettings(next);
    res.json({ success: true, settings: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to save settings' });
  }
});

// Financial Data API Functions
// options.adjustment: 'split_only' | 'none'
async function fetchFromAlphaVantage(symbol, startDate, endDate, options = { adjustment: 'none' }) {
  if (!getApiConfig().ALPHA_VANTAGE_API_KEY) {
    throw new Error('Alpha Vantage API key not configured');
  }
  // На бесплатном тарифе AV DAILY_ADJUSTED может считаться премиальным.
  // Поэтому:
  //  - при adjustment === 'split_only' используем TIME_SERIES_DAILY_ADJUSTED
  //  - иначе (adjustment === 'none') используем TIME_SERIES_DAILY
  const useAdjusted = options && options.adjustment === 'split_only';
  const func = useAdjusted ? 'TIME_SERIES_DAILY_ADJUSTED' : 'TIME_SERIES_DAILY';
  const safeSymbol = toSafeTicker(symbol);
  if (!safeSymbol) {
    throw new Error('Invalid symbol');
  }
  const url = `https://www.alphavantage.co/query?function=${func}&symbol=${encodeURIComponent(safeSymbol)}&apikey=${getApiConfig().ALPHA_VANTAGE_API_KEY}&outputsize=full`;
  const requestUrl = new URL(url);
  requestUrl.searchParams.append('random', Date.now().toString());
  const requestOptions = {
    headers: {
      'User-Agent': 'stonks-bot/1.0',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  };

  return new Promise((resolve, reject) => {
    https.get(requestUrl, requestOptions, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          // Если пришёл HTML (например, страница ошибки лимитов), вернём понятную 502
          if (data && data.trim().startsWith('<')) {
            const err = new Error('Провайдер вернул HTML вместо JSON (возможен лимит/блокировка).');
            err.status = 502;
            return reject(err);
          }
          const jsonData = JSON.parse(data);

          if (jsonData['Error Message']) {
            const err = new Error(`Alpha Vantage: ${jsonData['Error Message']}`);
            err.status = 400; // неверный тикер/параметры
            return reject(err);
          }

          if (jsonData['Note'] || jsonData['Information']) {
            const note = jsonData['Note'] || jsonData['Information'];
            const err = new Error(`Достигнут лимит API Alpha Vantage: ${note}`);
            err.status = 429; // лимит запросов
            return reject(err);
          }

          const timeSeries = jsonData['Time Series (Daily)'];
          if (!timeSeries) {
            const err = new Error('Отсутствует секция "Time Series (Daily)" в ответе Alpha Vantage');
            err.status = 502;
            return reject(err);
          }
          // Собираем ряды с коэффициентами сплитов
          const rows = [];
          const start = new Date(startDate * 1000);
          const end = new Date(endDate * 1000);

          for (const [date, values] of Object.entries(timeSeries)) {
            const currentDate = new Date(date);
            if (currentDate >= start && currentDate <= end) {
              rows.push({
                date: date,
                open: parseFloat(values['1. open']),
                high: parseFloat(values['2. high']),
                low: parseFloat(values['3. low']),
                close: parseFloat(values['4. close']),
                // Для DAILY_ADJUSTED берём split coefficient; для DAILY он отсутствует → 1
                splitCoeff: parseFloat(values['8. split coefficient'] || '1'),
                volume: parseInt(values['6. volume'] || values['5. volume'] || '0')
              });
            }
          }
          // Сортируем по дате по возрастанию
          rows.sort((a, b) => new Date(a.date) - new Date(b.date));
          // Соберём события сплитов (дата, фактор)
          const splitEvents = [];
          const doAdjust = options && options.adjustment === 'split_only';
          if (doAdjust) {
            // Back-adjust только по сплитам: cumulative factor применяем к прошедшей истории
            let cumulativeFactor = 1;
            for (let i = rows.length - 1; i >= 0; i--) {
              const r = rows[i];
              // Применяем текущий накопленный фактор к цене и объёму
              r.open = r.open / cumulativeFactor;
              r.high = r.high / cumulativeFactor;
              r.low = r.low / cumulativeFactor;
              r.close = r.close / cumulativeFactor;
              r.volume = Math.round(r.volume * cumulativeFactor);
              // После обработки бара обновляем cumulativeFactor на сплит текущего дня,
              // чтобы он применился только к более ранним датам
              if (!isNaN(r.splitCoeff) && r.splitCoeff && r.splitCoeff !== 1) {
                splitEvents.push({ date: r.date, factor: r.splitCoeff });
                cumulativeFactor *= r.splitCoeff;
              }
            }
          } else {
            // Без бэк-аджастмента, но всё равно собираем события сплитов, если они есть (только в adjusted)
            for (let i = 0; i < rows.length; i++) {
              const r = rows[i];
              if (!isNaN(r.splitCoeff) && r.splitCoeff && r.splitCoeff !== 1) {
                splitEvents.push({ date: r.date, factor: r.splitCoeff });
              }
            }
          }
          // Возвращаем в формате клиента, adjClose приравниваем к скорректированному close
          const result = rows.map(r => ({
            date: r.date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            adjClose: r.close,
            volume: r.volume
          }));
          const payload = { data: result, splits: splitEvents.reverse() };
          resolve(payload);

        } catch (error) {
          const err = new Error(`Не удалось обработать ответ Alpha Vantage: ${error.message}`);
          err.status = 502;
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

async function fetchFromFinnhub(symbol, startDate, endDate) {
  if (!getApiConfig().FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }

  const safeSymbol = toSafeTicker(symbol);
  if (!safeSymbol) {
    throw new Error('Invalid symbol');
  }
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(safeSymbol)}&resolution=D&from=${startDate}&to=${endDate}&token=${getApiConfig().FINNHUB_API_KEY}`;

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);

          if (jsonData.s !== 'ok') {
            reject(new Error(`Finnhub: ${jsonData.s}`));
            return;
          }

          const result = [];
          for (let i = 0; i < jsonData.t.length; i++) {
            const date = new Date(jsonData.t[i] * 1000).toISOString().split('T')[0];
            result.push({
              date: date,
              open: jsonData.o[i],
              high: jsonData.h[i],
              low: jsonData.l[i],
              close: jsonData.c[i],
              adjClose: jsonData.c[i], // Finnhub doesn't provide adjusted close
              volume: jsonData.v[i]
            });
          }

          resolve(result);

        } catch (error) {
          reject(new Error(`Failed to parse Finnhub response: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchFromTwelveData(symbol, startDate, endDate) {
  if (!getApiConfig().TWELVE_DATA_API_KEY) {
    throw new Error('Twelve Data API key not configured');
  }

  const startDateStr = new Date(startDate * 1000).toISOString().split('T')[0];
  const endDateStr = new Date(endDate * 1000).toISOString().split('T')[0];
  const safeSymbol = toSafeTicker(symbol);
  if (!safeSymbol) {
    throw new Error('Invalid symbol');
  }
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(safeSymbol)}&interval=1day&start_date=${startDateStr}&end_date=${endDateStr}&outputsize=5000&apikey=${getApiConfig().TWELVE_DATA_API_KEY}`;

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          // Check for HTML response (rate limit or error page)
          if (data && data.trim().startsWith('<')) {
            const err = new Error('Провайдер вернул HTML вместо JSON (возможен лимит/блокировка).');
            err.status = 502;
            return reject(err);
          }

          const jsonData = JSON.parse(data);

          // Check for error status
          if (jsonData.status === 'error') {
            const err = new Error(`Twelve Data: ${jsonData.message || 'Unknown error'}`);
            // Check for rate limit
            if (jsonData.code === 429 || (jsonData.message && jsonData.message.includes('limit'))) {
              err.status = 429;
            } else {
              err.status = 400;
            }
            return reject(err);
          }

          // Check for values array
          if (!jsonData.values || !Array.isArray(jsonData.values)) {
            const err = new Error('Twelve Data: No data found for this symbol/period');
            err.status = 404;
            return reject(err);
          }

          const result = jsonData.values.map(item => ({
            date: item.datetime,
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            adjClose: parseFloat(item.close), // Twelve Data doesn't provide adjusted close in free plan
            volume: parseInt(item.volume || '0')
          }));

          // Sort by date ascending
          result.sort((a, b) => new Date(a.date) - new Date(b.date));
          resolve(result);

        } catch (error) {
          const err = new Error(`Не удалось обработать ответ Twelve Data: ${error.message}`);
          err.status = 502;
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// Удалено: внешнее получение сплитов через API (используем только локальный splits.json)

// Эвристика: определить сплиты по скачкам цены (2x/3x/4x/5x/10x)
function detectSplitsFromOHLC(ohlc) {
  if (!Array.isArray(ohlc) || ohlc.length < 2) return [];
  const candidates = [2, 3, 4, 5, 10];
  const tolerance = 0.03; // 3%
  const sorted = [...ohlc].sort((a, b) => new Date(a.date) - new Date(b.date));
  const events = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const ratio = prev.close && curr.close ? prev.close / curr.close : 1;
    for (const f of candidates) {
      if (Math.abs(ratio - f) / f <= tolerance) {
        events.push({ date: curr.date, factor: f });
        break;
      }
    }
  }
  // Удалим дубликаты по датам
  const uniq = new Map();
  for (const e of events) {
    uniq.set(e.date, e);
  }
  return Array.from(uniq.values());
}

// Получить список всех датасетов
app.get('/api/datasets', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const datasets = [];
    // Собираем файлы из основной папки и бэкапа (_keep) и дедуплицируем по имени файла, предпочитая основную папку
    const mainFiles = await fs.readdir(DATASETS_DIR).catch(() => []);
    const mainPaths = mainFiles
      .filter(f => f.endsWith('.json') && !f.startsWith('._'))
      .map(f => path.join(DATASETS_DIR, f));
    const keepFiles = await fs.readdir(KEEP_DATASETS_DIR).catch(() => []);
    const keepPaths = keepFiles
      .filter(f => f.endsWith('.json') && !f.startsWith('._'))
      .map(f => path.join(KEEP_DATASETS_DIR, f));
    const byBase = new Map();
    for (const p of keepPaths) byBase.set(path.basename(p).toUpperCase(), p);
    for (const p of mainPaths) byBase.set(path.basename(p).toUpperCase(), p);

    for (const filePath of byBase.values()) {
      const file = path.basename(filePath);
      try {
        const data = await fs.readJson(filePath);
        if (!data || typeof data !== 'object') continue;
        // Возвращаем только метаданные без самих данных для списка
        const { data: _dropData, splits: _dropSplits, ...metadata } = data;
        const id = toSafeTicker(metadata.ticker || file.replace('.json', '').split('_')[0]);
        if (!id) continue;
        datasets.push({ id, ...metadata });
      } catch (e) {
        console.warn(`Skip dataset file ${file}: ${e && e.message ? e.message : 'read error'}`);
        continue;
      }
    }
    return res.json(datasets);
  } catch (error) {
    console.error('Error reading datasets:', error);
    // Даже при ошибке чтения каталога возвращаем пустой массив, чтобы UI работал оффлайн
    return res.json([]);
  }
});

// Получить конкретный датасет
app.get('/api/datasets/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { id } = req.params;
    const filePath = resolveDatasetFilePathById(id);

    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const dataset = await fs.readJson(filePath);
    // Strip embedded splits before returning
    const { splits: _dropSplits, ...clean } = (dataset || {});
    res.json(clean);
  } catch (error) {
    console.error('Error reading dataset:', error);
    res.status(500).json({ error: 'Failed to read dataset' });
  }
});

// Сохранить датасет
app.post('/api/datasets', async (req, res) => {
  try {
    const dataset = req.body;
    if (!dataset || !dataset.ticker || !Array.isArray(dataset.data) || dataset.data.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: ticker, data' });
    }
    // Определяем последнюю дату по массиву данных
    const getTime = (d) => {
      try { return new Date(d).getTime(); } catch { return 0; }
    };
    const lastTs = dataset.data.reduce((acc, bar) => {
      const t = bar && bar.date ? getTime(bar.date) : 0;
      return t > acc ? t : acc;
    }, 0);
    if (!lastTs) {
      return res.status(400).json({ error: 'Invalid data: cannot determine last date' });
    }
    const safeTicker = toSafeTicker(dataset.ticker);
    const computedName = safeTicker; // без даты
    const payload = { ...dataset, name: computedName };
    const { targetPath } = await writeDatasetToTickerFile(payload);
    console.log(`Dataset saved: ${computedName} (${safeTicker}) -> ${path.basename(targetPath)}`);
    res.json({ success: true, id: safeTicker, message: `Dataset "${computedName}" saved successfully` });
  } catch (error) {
    console.error('Error saving dataset:', error);
    res.status(500).json({ error: 'Failed to save dataset' });
  }
});

// Удалить датасет
app.delete('/api/datasets/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    const ticker = toSafeTicker(rawId);

    // Resolve actual file path (supports stable and legacy filenames)
    const filePath = resolveDatasetFilePathById(ticker);

    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    // Remove the resolved file
    await fs.remove(filePath);

    // Best-effort: remove any legacy suffixed files like TICKER_YYYY-MM-DD.json
    try {
      const files = await fs.readdir(DATASETS_DIR);
      await Promise.all(
        files
          .filter(f => f.toUpperCase().startsWith(`${ticker}_`) && f.endsWith('.json'))
          .map(f => fs.remove(path.join(DATASETS_DIR, f)).catch((err) => {
            console.warn(`Failed to delete file ${f}:`, err.message);
          }))
      );
    } catch { }

    console.log(`Dataset deleted: ${ticker}`);
    res.json({ success: true, message: `Dataset "${ticker}" deleted successfully` });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    res.status(500).json({ error: error && error.message ? error.message : 'Failed to delete dataset' });
  }
});

// Обновить датасет
app.put('/api/datasets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dataset = req.body;
    const legacyPath = resolveDatasetFilePathById(id);

    if (!legacyPath || !await fs.pathExists(legacyPath)) {
      // Если нет legacy/прямого файла — будем создавать новый по тикеру
      if (!dataset || !dataset.ticker) return res.status(404).json({ error: 'Dataset not found' });
    }
    // Рассчитать целевое имя файла на основе последней даты
    if (!dataset || !dataset.ticker || !Array.isArray(dataset.data) || dataset.data.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: ticker, data' });
    }
    const getTime = (d) => { try { return new Date(d).getTime(); } catch { return 0; } };
    const lastTs = dataset.data.reduce((acc, bar) => {
      const t = bar && bar.date ? getTime(bar.date) : 0;
      return t > acc ? t : acc;
    }, 0);
    if (!lastTs) {
      return res.status(400).json({ error: 'Invalid data: cannot determine last date' });
    }
    const safeTicker = toSafeTicker(dataset.ticker);
    const computedName = safeTicker; // без даты в названии
    const payload = { ...dataset, name: computedName };
    const { targetPath } = await writeDatasetToTickerFile(payload);
    // Удалим legacy файл, если он отличался
    try { if (legacyPath && legacyPath !== targetPath) await fs.remove(legacyPath); } catch { }
    console.log(`Dataset updated (stable id): ${safeTicker}`);
    return res.json({ success: true, id: safeTicker, renamed: true, message: `Dataset "${safeTicker}" updated` });
  } catch (error) {
    console.error('Error updating dataset:', error);
    res.status(500).json({ error: 'Failed to update dataset' });
  }
});

// Refresh dataset on the server (fetch only missing tail and persist)
app.post('/api/datasets/:id/refresh', async (req, res) => {
  try {
    const { id } = req.params;
    const settings = await readSettings().catch((err) => {
      console.warn('Failed to read settings, using defaults:', err.message);
      return {};
    });
    const reqProvider = (req.query && typeof req.query.provider === 'string') ? req.query.provider : null;

    const filePath = resolveDatasetFilePathById(id);
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    const dataset = await fs.readJson(filePath);
    const ticker = toSafeTicker(dataset.ticker || id);
    if (!ticker) return res.status(400).json({ error: 'Ticker not defined in dataset' });

    // Normalize date to YYYY-MM-DD key consistently
    const toDateKey = (d) => {
      try {
        if (typeof d === 'string') {
          // 'YYYY-MM-DD' or ISO -> take first 10 chars
          return d.slice(0, 10);
        }
        return new Date(d).toISOString().slice(0, 10);
      } catch {
        return '';
      }
    };

    // Determine tail window: use last date from existing data, then fetch a safe overlap window
    const lastExistingDate = (() => {
      if (dataset && Array.isArray(dataset.data) && dataset.data.length) {
        const lastBar = dataset.data[dataset.data.length - 1];
        return toDateKey(lastBar && lastBar.date);
      }
      const drTo = dataset && dataset.dateRange && dataset.dateRange.to;
      return toDateKey(drTo);
    })();
    if (!lastExistingDate) return res.status(400).json({ error: 'Dataset has no last date' });
    const last = new Date(`${lastExistingDate}T00:00:00.000Z`);
    // Safe overlap window: 7 days back, 00:00 UTC
    const start = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate() - 7, 0, 0, 0));
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(Date.now() / 1000);

    let rows = [];
    let splits = [];
    const provider = (reqProvider === 'alpha_vantage' || reqProvider === 'finnhub' || reqProvider === 'twelve_data')
      ? reqProvider
      : (settings && (settings.resultsRefreshProvider === 'alpha_vantage' || settings.resultsRefreshProvider === 'finnhub' || settings.resultsRefreshProvider === 'twelve_data')
        ? settings.resultsRefreshProvider
        : 'finnhub');

    if (provider === 'finnhub') {
      const fh = await fetchFromFinnhub(ticker, startTs, endTs);
      const base = Array.isArray(fh) ? fh : [];
      rows = base.map(r => ({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
        volume: Number(r.volume) || 0,
      }));
    } else if (provider === 'twelve_data') {
      const td = await fetchFromTwelveData(ticker, startTs, endTs);
      const base = Array.isArray(td) ? td : [];
      rows = base.map(r => ({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
        volume: Number(r.volume) || 0,
      }));
    } else {
      const av = await fetchFromAlphaVantage(ticker, startTs, endTs, { adjustment: 'none' });
      const base = Array.isArray(av) ? av : (av && av.data) || [];
      rows = base.map(r => ({
        date: r.date,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        adjClose: r.adjClose ?? r.close,
        volume: r.volume || 0,
      }));
      if (av && !Array.isArray(av) && Array.isArray(av.splits)) {
        splits = av.splits;
      }
    }

    // Merge with de-duplication by date key, normalizing all dates to YYYY-MM-DD
    const mergedByDate = new Map();
    // 1) Seed with existing data (normalized)
    for (const b of (dataset.data || [])) {
      const key = toDateKey(b && b.date);
      if (!key) continue;
      mergedByDate.set(key, {
        date: key,
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        adjClose: (b.adjClose != null ? Number(b.adjClose) : Number(b.close)),
        volume: Number(b.volume) || 0,
      });
    }
    // 2) Overlay incoming rows (normalized) to avoid duplicates and ensure newest values win
    for (const r of rows) {
      const key = toDateKey(r && r.date);
      if (!key) continue;
      mergedByDate.set(key, {
        date: key,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        adjClose: (r.adjClose != null ? Number(r.adjClose) : Number(r.close)),
        volume: Number(r.volume) || 0,
      });
    }

    // Keep raw data without applying back-adjustment by splits
    const mergedArray = Array.from(mergedByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const adjustedMerged = mergedArray;

    const lastMerged = adjustedMerged[adjustedMerged.length - 1];
    const firstMerged = adjustedMerged[0];
    dataset.data = adjustedMerged;
    dataset.dataPoints = adjustedMerged.length;
    dataset.dateRange = {
      from: toDateKey(firstMerged.date),
      to: toDateKey(lastMerged.date),
    };
    dataset.uploadDate = new Date().toISOString();
    dataset.name = ticker;

    const prevCount = (dataset.data || []).length;
    const { targetPath } = await writeDatasetToTickerFile(dataset);
    const added = adjustedMerged.length - prevCount;
    console.log(`Dataset refreshed: ${ticker} (+${added}) -> ${targetPath}`);
    return res.json({ success: true, id: ticker, added, to: dataset.dateRange.to });
  } catch (error) {
    console.error('Error refreshing dataset:', error);
    const msg = error && error.message ? error.message : 'Failed to refresh dataset';
    res.status(500).json({ error: msg });
  }
});

// Apply splits to dataset and persist adjusted data
app.post('/api/datasets/:id/apply-splits', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = resolveDatasetFilePathById(id);
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    const dataset = await fs.readJson(filePath);
    const ticker = toSafeTicker(dataset.ticker || id);
    if (!ticker) return res.status(400).json({ error: 'Ticker not defined in dataset' });

    const toDateKey = (d) => {
      try {
        if (typeof d === 'string') return d.slice(0, 10);
        return new Date(d).toISOString().slice(0, 10);
      } catch { return ''; }
    };

    // Load splits events for ticker (single source of truth)
    const events = await getTickerSplits(ticker);

    // If no events, still rewrite file clearing any previous adjusted flag
    const data = Array.isArray(dataset.data) ? dataset.data : [];
    const normalized = data.map(b => ({
      date: toDateKey(b.date),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      adjClose: (b.adjClose != null ? Number(b.adjClose) : Number(b.close)),
      volume: Number(b.volume) || 0,
    })).filter(b => !!b.date);

    // Back-adjust for splits: divide prices by cumulative future factors; multiply volume
    if (Array.isArray(events) && events.length > 0) {
      const splits = events
        .filter(e => e && typeof e.date === 'string' && typeof e.factor === 'number' && isFinite(e.factor) && e.factor > 0 && e.factor !== 1)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (splits.length > 0) {
        const adjusted = normalized.map(bar => ({ ...bar }));
        for (let i = 0; i < adjusted.length; i++) {
          const t = new Date(`${adjusted[i].date}T00:00:00.000Z`).getTime();
          let cumulative = 1;
          for (let k = 0; k < splits.length; k++) {
            const et = new Date(`${splits[k].date}T00:00:00.000Z`).getTime();
            if (t < et) cumulative *= Number(splits[k].factor);
          }
          if (cumulative !== 1) {
            adjusted[i].open = adjusted[i].open / cumulative;
            adjusted[i].high = adjusted[i].high / cumulative;
            adjusted[i].low = adjusted[i].low / cumulative;
            adjusted[i].close = adjusted[i].close / cumulative;
            adjusted[i].adjClose = (adjusted[i].adjClose != null ? adjusted[i].adjClose : adjusted[i].close) / cumulative;
            adjusted[i].volume = Math.round(adjusted[i].volume * cumulative);
          }
        }
        dataset.data = adjusted;
        dataset.dataPoints = adjusted.length;
        dataset.dateRange = {
          from: adjusted[0].date,
          to: adjusted[adjusted.length - 1].date,
        };
        dataset.uploadDate = new Date().toISOString();
        dataset.name = ticker;
        dataset.adjustedForSplits = true;
      } else {
        dataset.data = normalized;
        dataset.dataPoints = normalized.length;
        dataset.dateRange = normalized.length ? { from: normalized[0].date, to: normalized[normalized.length - 1].date } : { from: null, to: null };
        dataset.uploadDate = new Date().toISOString();
        dataset.name = ticker;
        delete dataset.adjustedForSplits;
      }
    } else {
      dataset.data = normalized;
      dataset.dataPoints = normalized.length;
      dataset.dateRange = normalized.length ? { from: normalized[0].date, to: normalized[normalized.length - 1].date } : { from: null, to: null };
      dataset.uploadDate = new Date().toISOString();
      dataset.name = ticker;
      delete dataset.adjustedForSplits;
    }

    // Persist without embedded splits (single source of truth is splits.json)
    const { targetPath } = await writeDatasetToTickerFile(dataset);
    console.log(`Dataset adjusted for splits: ${ticker} -> ${targetPath}`);
    return res.json({ success: true, id: ticker, message: 'Датасет пересчитан с учётом сплитов' });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed to apply splits' });
  }
});

// Update dataset metadata (tag, companyName)
app.patch('/api/datasets/:id/metadata', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = resolveDatasetFilePathById(id);
    if (!filePath || !await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    // Read current dataset
    const dataset = await fs.readJson(filePath);

    // Update metadata fields
    const { tag, companyName } = req.body || {};
    if (tag !== undefined) {
      dataset.tag = typeof tag === 'string' ? tag.trim() : undefined;
    }
    if (companyName !== undefined) {
      dataset.companyName = typeof companyName === 'string' ? companyName.trim() : undefined;
    }

    // Write updated dataset back to file
    await fs.writeJson(filePath, dataset, { spaces: 2 });

    console.log(`Dataset metadata updated: ${id}`);
    return res.json({ success: true, message: 'Метаданные датасета обновлены' });
  } catch (e) {
    console.error('Failed to update dataset metadata:', e);
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed to update dataset metadata' });
  }
});

// Financial Data API proxy (supports multiple providers)
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.get('/api/yahoo-finance/:symbol', async (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    const { start, end } = req.query;
    const symbol = toSafeTicker(rawSymbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const defaultStartDate = Math.floor(Date.now() / 1000) - (10 * 365 * 24 * 60 * 60);
    const startDate = start ? parseInt(start) : defaultStartDate;
    const endDate = end ? parseInt(end) : Math.floor(Date.now() / 1000);

    let payload;
    if (!getApiConfig().ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }
    const adjParam = (req.query.adjustment || 'none').toString();
    const mode = (adjParam === 'split_only') ? 'split_only' : 'none';
    console.log(`Fetching ${mode} data for ${symbol} from Alpha Vantage...`);
    let avResponse;
    try {
      avResponse = await fetchFromAlphaVantage(symbol, startDate, endDate, { adjustment: mode }); // returns { data, splits }
    } catch (e) {
      if (e && e.status === 429) {
        await sleep(1200);
        avResponse = await fetchFromAlphaVantage(symbol, startDate, endDate, { adjustment: mode });
      } else {
        throw e;
      }
    }
    if (Array.isArray(avResponse)) {
      payload = { data: avResponse, splits: [] };
    } else {
      payload = { data: avResponse.data, splits: avResponse.splits || [] };
    }

    if (!payload.data || payload.data.length === 0) {
      return res.status(404).json({ error: 'No data found for this symbol' });
    }

    console.log(`Retrieved ${payload.data.length} points (splits returned separately)`);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching financial data:', error);
    const status = error.status || 500;
    let code = 'UPSTREAM_ERROR';
    let hint = 'Попробуйте повторить запрос позже.';
    if (status === 429) {
      code = 'RATE_LIMIT';
      hint = 'Достигнут лимит Alpha Vantage. Подождите 60–90 секунд и повторите.';
    } else if (status === 400) {
      code = 'BAD_REQUEST';
      hint = 'Проверьте тикер и корректность API ключа.';
    } else if (status === 502) {
      code = 'UPSTREAM_HTML';
      hint = 'Провайдер вернул некорректный ответ. Повторите позже.';
    }
    res.status(status).json({ error: error.message || 'Ошибка провайдера', code, hint, provider: 'Alpha Vantage' });
  }
});

// Realtime quote endpoint
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    const { provider } = req.query;
    const symbol = toSafeTicker(req.params.symbol);
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const chosenProvider = (provider || getApiConfig().PREFERRED_API_PROVIDER).toString().toLowerCase();

    if (chosenProvider === 'finnhub') {
      if (!getApiConfig().FINNHUB_API_KEY) {
        return res.status(500).json({ error: 'Finnhub API key not configured' });
      }
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${getApiConfig().FINNHUB_API_KEY}`;
      const payload = await new Promise((resolve, reject) => {
        https.get(url, (response) => {
          let data = '';
          response.on('data', (chunk) => data += chunk);
          response.on('end', () => {
            try {
              if (data && data.trim().startsWith('<')) {
                const err = new Error('Провайдер вернул HTML вместо JSON (возможен лимит/блокировка).');
                err.status = 502;
                return reject(err);
              }
              const json = JSON.parse(data);
              if (json.error) {
                const err = new Error(`Finnhub: ${json.error}`);
                err.status = 400;
                return reject(err);
              }
              const result = {
                open: json.o ?? null,
                high: json.h ?? null,
                low: json.l ?? null,
                current: json.c ?? null,
                prevClose: json.pc ?? null
              };
              resolve(result);
            } catch (e) {
              const err = new Error(`Не удалось обработать ответ Finnhub: ${e.message}`);
              err.status = 502;
              reject(err);
            }
          });
        }).on('error', reject);
      });
      return res.json(payload);
    }

    // Twelve Data Quote
    if (chosenProvider === 'twelve_data') {
      if (!getApiConfig().TWELVE_DATA_API_KEY) {
        return res.status(500).json({ error: 'Twelve Data API key not configured' });
      }
      const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${getApiConfig().TWELVE_DATA_API_KEY}`;
      const payload = await new Promise((resolve, reject) => {
        https.get(url, (response) => {
          let data = '';
          response.on('data', (chunk) => data += chunk);
          response.on('end', () => {
            try {
              if (data && data.trim().startsWith('<')) {
                const err = new Error('Провайдер вернул HTML вместо JSON (возможен лимит/блокировка).');
                err.status = 502;
                return reject(err);
              }
              const json = JSON.parse(data);
              // Check for error response
              if (json.status === 'error' || json.code) {
                const msg = json.message || 'Twelve Data API error';
                const err = new Error(`Twelve Data: ${msg}`);
                // Rate limit code is 429
                if (json.code === 429) {
                  err.status = 429;
                } else {
                  err.status = 400;
                }
                return reject(err);
              }
              const result = {
                open: json.open ? parseFloat(json.open) : null,
                high: json.high ? parseFloat(json.high) : null,
                low: json.low ? parseFloat(json.low) : null,
                current: json.close ? parseFloat(json.close) : null,
                prevClose: json.previous_close ? parseFloat(json.previous_close) : null
              };
              resolve(result);
            } catch (e) {
              const err = new Error(`Не удалось обработать ответ Twelve Data: ${e.message}`);
              err.status = 502;
              reject(err);
            }
          });
        }).on('error', reject);
      });
      return res.json(payload);
    }

    // Alpha Vantage GLOBAL_QUOTE
    if (!getApiConfig().ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${getApiConfig().ALPHA_VANTAGE_API_KEY}`;
    const payload = await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => {
          try {
            if (data && data.trim().startsWith('<')) {
              const err = new Error('Провайдер вернул HTML вместо JSON (возможен лимит/блокировка).');
              err.status = 502;
              return reject(err);
            }
            const json = JSON.parse(data);
            if (json['Note'] || json['Information']) {
              const note = json['Note'] || json['Information'];
              const err = new Error(`Достигнут лимит API Alpha Vantage: ${note}`);
              err.status = 429;
              return reject(err);
            }
            const q = json['Global Quote'] || {};
            const result = {
              open: q['02. open'] ? parseFloat(q['02. open']) : null,
              high: q['03. high'] ? parseFloat(q['03. high']) : null,
              low: q['04. low'] ? parseFloat(q['04. low']) : null,
              current: q['05. price'] ? parseFloat(q['05. price']) : null,
              prevClose: q['08. previous close'] ? parseFloat(q['08. previous close']) : null
            };
            resolve(result);
          } catch (e) {
            const err = new Error(`Не удалось обработать ответ Alpha Vantage: ${e.message}`);
            err.status = 502;
            reject(err);
          }
        });
      }).on('error', reject);
    });
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching quote:', error);
    const status = error.status || 500;
    let code = 'UPSTREAM_ERROR';
    if (status === 429) code = 'RATE_LIMIT';
    if (status === 502) code = 'UPSTREAM_HTML';
    res.status(status).json({ error: error.message || 'Ошибка провайдера', code });
  }
});

// Splits endpoints
// Read-only endpoints are public (guarded in middleware). Mutations require auth.

// Get all splits map (for compatibility with getSplitsMap)
app.get('/api/splits', async (req, res) => {
  try {
    const splits = await loadSplits();
    const map = {};

    // Group splits by ticker
    for (const [ticker, events] of Object.entries(splits)) {
      if (Array.isArray(events)) {
        map[ticker] = events.map(e => ({
          date: e.date,
          factor: e.factor
        }));
      }
    }

    return res.json(map);
  } catch (e) {
    console.error('Failed to load splits map:', e);
    return res.status(500).json({ error: 'Failed to load splits map' });
  }
});

app.get('/api/splits/:symbol', async (req, res) => {
  try {
    const raw = (req.params.symbol || '').toString();
    const symbol = toSafeTicker(raw);
    if (!symbol) return res.json([]);
    const arr = await getTickerSplits(symbol);
    return res.json(arr || []);
  } catch {
    return res.json([]);
  }
});

// Replace entire splits array for ticker
app.put('/api/splits/:symbol', async (req, res) => {
  try {
    const raw = (req.params.symbol || '').toString();
    const symbol = toSafeTicker(raw);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
    const events = Array.isArray(req.body) ? req.body : (req.body && req.body.events);
    if (!Array.isArray(events)) return res.status(400).json({ error: 'Body must be array of {date,factor}' });
    const updated = await setTickerSplits(symbol, events);
    return res.json({ success: true, symbol, events: updated });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save splits' });
  }
});

// Upsert one or many events
app.patch('/api/splits/:symbol', async (req, res) => {
  try {
    const raw = (req.params.symbol || '').toString();
    const symbol = toSafeTicker(raw);
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
    const events = Array.isArray(req.body) ? req.body : (req.body && req.body.events);
    if (!Array.isArray(events)) return res.status(400).json({ error: 'Body must be array of {date,factor}' });
    const updated = await upsertTickerSplits(symbol, events);
    return res.json({ success: true, symbol, events: updated });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update splits' });
  }
});

// Delete one event by date
app.delete('/api/splits/:symbol/:date', async (req, res) => {
  try {
    const symbol = toSafeTicker((req.params.symbol || '').toString());
    const date = (req.params.date || '').toString().slice(0, 10);
    if (!symbol || !date) return res.status(400).json({ error: 'Invalid symbol or date' });
    const updated = await deleteTickerSplitByDate(symbol, date);
    return res.json({ success: true, symbol, events: updated });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete split' });
  }
});

// Delete all events for ticker
app.delete('/api/splits/:symbol', async (req, res) => {
  try {
    const symbol = toSafeTicker((req.params.symbol || '').toString());
    if (!symbol) return res.status(400).json({ error: 'Invalid symbol' });
    await deleteTickerSplits(symbol);
    return res.json({ success: true, symbol });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete splits' });
  }
});

// Alternative real data API using Polygon.io (free tier: 5 requests/minute)
app.get('/api/polygon-finance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { start, end } = req.query;

    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Calculate date range (default to last 30 days)
    const endDate = end ? new Date(parseInt(end) * 1000) : new Date();
    const startDate = start ? new Date(parseInt(start) * 1000) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const fromDate = startDate.toISOString().split('T')[0];
    const toDate = endDate.toISOString().split('T')[0];

    const apiKey = getApiConfig().POLYGON_API_KEY || (IS_PROD ? '' : 'demo');
    if (!apiKey) {
      return res.status(500).json({ error: 'Polygon API key not configured' });
    }
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(safeSymbol)}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apikey=${encodeURIComponent(apiKey)}`;

    console.log(`Fetching real data for ${safeSymbol} from Polygon.io...`);

    const data = await new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Polygon API returned status ${response.statusCode}`));
            return;
          }

          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (parseError) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      request.on('error', (error) => {
        console.error('HTTPS request error:', error);
        reject(error);
      });

      request.setTimeout(15000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });

    // Check for API errors
    if (data.status === 'ERROR') {
      return res.status(400).json({ error: data.error || 'API error occurred' });
    }

    if (!data.results || data.results.length === 0) {
      return res.status(404).json({ error: 'No data available for this symbol and date range' });
    }

    // Convert Polygon format to our format
    const result = data.results.map(item => {
      const date = new Date(item.t).toISOString().split('T')[0];

      return {
        date: date,
        open: item.o,
        high: item.h,
        low: item.l,
        close: item.c,
        adjClose: item.c, // Polygon provides adjusted data by default
        volume: item.v
      };
    });

    console.log(`Retrieved ${result.length} real data points for ${safeSymbol} from Polygon`);

    res.json(result);

  } catch (error) {
    console.error('Error fetching real market data from Polygon:', error);
    res.status(500).json({
      error: `Failed to fetch real market data: ${error.message}`
    });
  }
});

// Test Yahoo Finance endpoint
app.get('/api/test-yahoo/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol) return res.status(400).json({ error: 'Invalid symbol' });
    const url = `https://query1.finance.yahoo.com/v7/finance/download/${encodeURIComponent(safeSymbol)}?period1=1640995200&period2=1672531200&interval=1d&events=history&includeAdjustedClose=true`;

    console.log(`Testing Yahoo Finance API for ${safeSymbol}`);

    const data = await new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => data += chunk);
        response.on('end', () => {
          console.log(`Test response status: ${response.statusCode}`);
          console.log(`Test response length: ${data.length}`);
          resolve({ status: response.statusCode, data: data.substring(0, 500) });
        });
      }).on('error', reject);
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate sample data for testing
app.get('/api/sample-data/:symbol', (req, res) => {
  const { symbol } = req.params;
  const { start, end } = req.query;

  const startDate = start ? new Date(parseInt(start) * 1000) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const endDate = end ? new Date(parseInt(end) * 1000) : new Date();

  const data = [];
  let currentDate = new Date(startDate);
  let price = 150; // Starting price

  while (currentDate <= endDate) {
    // Skip weekends
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      const change = (Math.random() - 0.5) * 10; // Random price change
      const open = price;
      const close = price + change;
      const high = Math.max(open, close) + Math.random() * 5;
      const low = Math.min(open, close) - Math.random() * 5;
      const volume = Math.floor(Math.random() * 1000000) + 100000;

      data.push({
        date: currentDate.toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        adjClose: parseFloat(close.toFixed(2)),
        volume: volume
      });

      price = close;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`Generated ${data.length} sample data points for ${symbol}`);
  res.json(data);
});

// Статус сервера
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Trading Backtester API is running',
    timestamp: new Date().toISOString(),
    buildId: process.env.BUILD_ID || null
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Trading Backtester API running on http://localhost:${PORT}`);
  console.log(`📁 Datasets stored in: ${DATASETS_DIR}`);
  // Load persisted telegram watches
  loadWatches().catch(err => {
    console.warn('Failed to initialize telegram watches:', err && err.message ? err.message : err);
  });
  ensureTradeHistoryLoaded();
});

async function appendMonitorLog(lines) {
  try {
    const now = new Date();
    const et = getETParts(now);
    const ts = now.toISOString();
    const etStr = `${et.y}-${String(et.m).padStart(2, '0')}-${String(et.d).padStart(2, '0')} ${String(et.hh).padStart(2, '0')}:${String(et.mm).padStart(2, '0')}`;
    const payload = Array.isArray(lines) ? lines : [String(lines)];
    const text = payload.map(l => `[${ts} ET:${etStr}] ${l}`).join('\n') + '\n';
    await appendSafe(MONITOR_LOG_FILE, text);
  } catch (e) {
    console.warn('Failed to write monitor log:', e && e.message ? e.message : e);
  }
}