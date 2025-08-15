require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const helmet = require('helmet');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
const PORT = process.env.PORT || 3001;
const DATASETS_DIR = path.join(__dirname, 'datasets');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const SPLITS_FILE = path.join(__dirname, 'splits.json');
const WATCHES_FILE = path.join(__dirname, 'telegram-watches.json');
const MONITOR_LOG_FILE = path.join(__dirname, 'monitoring.log');
const avCache = new Map(); // кэш ответов Alpha Vantage

// API Configuration
const API_CONFIG = {
  ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
  TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY,
  POLYGON_API_KEY: process.env.POLYGON_API_KEY,
  PREFERRED_API_PROVIDER: 'alpha_vantage'
};

// Apply global middleware early (so it affects ALL routes)
// CORS with credentials (to support cookie-based auth)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
app.use(express.json({ limit: '50mb' }));
// Disable ETag to avoid 304 for dynamic JSON payloads
app.set('etag', false);

// Ensure splits storage exists
async function ensureSplitsFile() {
  try {
    const exists = await fs.pathExists(SPLITS_FILE);
    if (!exists) await fs.writeJson(SPLITS_FILE, {}, { spaces: 2 });
  } catch {}
}
ensureSplitsFile().catch(() => {});

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
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// Simple username+password auth (opt-in via env)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'dimazru@gmail.com').toLowerCase();
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
  if (maxAge) parts.push(`Max-Age=${Math.floor(maxAge/1000)}`);
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
  // Разрешаем только статус/логин/проверку; всё остальное — под авторизацией
  if (
    req.path === '/api/status' ||
    req.path === '/api/login' ||
    req.path === '/api/logout' ||
    req.path === '/api/auth/check'
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
app.use(requireAuth);
// Splits map endpoint: return full map from splits.json
app.get('/api/splits', async (req, res) => {
  try {
    const map = await readSplitsMap();
    res.json(map || {});
  } catch (e) {
    res.json({});
  }
});

// Auth endpoints
// Rate limiting: max 3 attempts per 24h per IP
const LOGIN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOGIN_MAX_ATTEMPTS = 3;
const loginRate = new Map(); // ip -> { count, resetAt }
const LOGIN_LOG_FILE = path.join(__dirname, 'login-attempts.log');
function getClientIp(req) {
  try {
    if (req.ip) return req.ip;
    if (Array.isArray(req.ips) && req.ips.length) return req.ips[0];
  } catch {}
  const xf = (req.headers['x-forwarded-for'] || '').toString();
  if (xf) return xf.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
async function logLoginAttempt({ ip, success, reason, username }) {
  const line = `${new Date().toISOString()}\t${ip}\t${username || '-'}\t${success ? 'SUCCESS' : 'FAIL'}\t${reason || ''}\n`;
  try { await fs.appendFile(LOGIN_LOG_FILE, line); } catch {}
  try {
    const note = success ? '✅ Успешный вход' : '⚠️ Неуспешная попытка входа';
    await sendTelegramMessage(TELEGRAM_CHAT_ID, `${note}\nIP: ${ip}\nUser: ${username || '-'}\nПричина: ${reason || '—'}`);
  } catch {}
}

app.post('/api/login', (req, res) => {
  try {
    if (!ADMIN_PASSWORD) return res.json({ success: true, disabled: true });
    const { username, password, remember } = req.body || {};
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
    if (!password || password !== ADMIN_PASSWORD) {
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

// In-memory watch list for Telegram notifications (persisted to disk)
// { symbol, highIBS, lowIBS, thresholdPct, chatId, entryPrice, isOpenPosition, sent: { dateKey, warn10, confirm1, entryWarn10, entryConfirm1 } }
const telegramWatches = new Map();

/**
 * Aggregated send state per chat to avoid duplicate messages inside the same minute/day
 */
const aggregateSendState = new Map(); // chatId -> { dateKey: string|null, t11Sent: boolean, t2Sent: boolean }
function getAggregateState(chatId, dateKey) {
  let st = aggregateSendState.get(chatId);
  if (!st || st.dateKey !== dateKey) {
    st = { dateKey, t11Sent: false, t2Sent: false };
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
        if (w && w.symbol) telegramWatches.set(w.symbol.toUpperCase(), { ...w, symbol: w.symbol.toUpperCase(), sent: w.sent || { dateKey: null, warn10: false, confirm1: false } });
      });
      console.log(`Loaded ${telegramWatches.size} telegram watches from disk`);
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
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.warn('Telegram is not configured (missing TELEGRAM_BOT_TOKEN or chatId).');
    return { ok: false, reason: 'not_configured' };
  }
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true });
  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ ok: res.statusCode === 200 }));
    });
    req.on('error', (e) => { console.warn('Telegram send error:', e.message); resolve({ ok: false, reason: e.message }); });
    req.write(payload);
    req.end();
  });
}

// Helpers for ET (America/New_York)
function getETParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour:'2-digit', minute:'2-digit', hour12: false, weekday: 'short' });
  const parts = fmt.formatToParts(date);
  const map = {};
  parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
  const y = Number(map.year), m = Number(map.month), d = Number(map.day), hh = Number(map.hour), mm = Number(map.minute);
  const weekdayMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const weekday = weekdayMap[map.weekday] ?? 0;
  return { y, m, d, hh, mm, weekday };
}
function etKeyYMD(p) { return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`; }
function isWeekendET(p) { return p.weekday === 0 || p.weekday === 6; }
function nthWeekdayOfMonthET(year, monthIndex0, weekday, n) {
  let cursor = new Date(Date.UTC(year, monthIndex0, 1, 12, 0, 0));
  while (getETParts(cursor).weekday !== weekday) { cursor.setUTCDate(cursor.getUTCDate()+1); }
  for (let i=1;i<n;i++) { cursor.setUTCDate(cursor.getUTCDate()+7); }
  return getETParts(cursor);
}
function lastWeekdayOfMonthET(year, monthIndex0, weekday) {
  let cursor = new Date(Date.UTC(year, monthIndex0+1, 0, 12, 0, 0));
  while (getETParts(cursor).weekday !== weekday) { cursor.setUTCDate(cursor.getUTCDate()-1); }
  return getETParts(cursor);
}
function observedFixedET(year, monthIndex0, day) {
  const base = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
  const p = getETParts(base);
  if (p.weekday === 0) { base.setUTCDate(base.getUTCDate()+1); return getETParts(base); }
  if (p.weekday === 6) { base.setUTCDate(base.getUTCDate()-1); return getETParts(base); }
  return p;
}
function easterUTC(year){ const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31)-1,day=((h+l-7*m+114)%31)+1;return new Date(Date.UTC(year,month,day,12,0,0)); }
function goodFridayET(year){ const e=easterUTC(year); e.setUTCDate(e.getUTCDate()-2); return getETParts(e); }
function nyseHolidaysET(year){
  const set = new Set();
  set.add(etKeyYMD(observedFixedET(year,0,1))); // New Year
  set.add(etKeyYMD(observedFixedET(year,5,19))); // Juneteenth
  set.add(etKeyYMD(observedFixedET(year,6,4)));  // Independence Day
  set.add(etKeyYMD(observedFixedET(year,11,25))); // Christmas
  set.add(etKeyYMD(nthWeekdayOfMonthET(year,0,1,3))); // MLK Mon
  set.add(etKeyYMD(nthWeekdayOfMonthET(year,1,1,3))); // Presidents Mon
  set.add(etKeyYMD(goodFridayET(year))); // Good Friday
  set.add(etKeyYMD(lastWeekdayOfMonthET(year,4,1))); // Memorial Mon
  set.add(etKeyYMD(nthWeekdayOfMonthET(year,8,1,1))); // Labor Mon
  set.add(etKeyYMD(nthWeekdayOfMonthET(year,10,4,4))); // Thanksgiving Thu
  return set;
}
function isTradingDayET(p){ return !isWeekendET(p) && !nyseHolidaysET(p.y).has(etKeyYMD(p)); }

// Replace: fetch only today's quote from Finnhub (no multi-day candles)
async function fetchTodayRangeAndQuote(symbol) {
  const quote = await new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_CONFIG.FINNHUB_API_KEY}`;
    https.get(url, (response) => {
      let data=''; response.on('data', c=>data+=c); response.on('end', ()=>{ try{ resolve(JSON.parse(data)); } catch(e){ reject(e); } });
    }).on('error', reject);
  });
  const todayEt = getETParts(new Date());
  const todayKey = etKeyYMD(todayEt);
  const todayRange = {
    open: (quote && quote.o != null ? quote.o : null),
    high: (quote && quote.h != null ? quote.h : null),
    low:  (quote && quote.l != null ? quote.l : null),
  };
  return { range: todayRange, quote: { open: quote.o ?? null, high: quote.h ?? null, low: quote.l ?? null, current: quote.c ?? null, prevClose: quote.pc ?? null }, dateKey: todayKey, ohlc: null };
}
// Previous trading day helper (based on ET calendar)
function previousTradingDayET(fromParts) {
  let cursor = new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d, 12, 0, 0));
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (true) {
    const p = getETParts(cursor);
    if (isTradingDayET(p)) return p;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
}

function buildFreshnessLine(ohlc, nowEtParts) {
  try {
    if (!Array.isArray(ohlc) || ohlc.length === 0) return 'Data: unknown';
    const prev = previousTradingDayET(nowEtParts);
    const expected = `${prev.y}-${String(prev.m).padStart(2,'0')}-${String(prev.d).padStart(2,'0')}`;
    const hasPrev = ohlc.some(r => r && r.date === expected);
    return hasPrev ? 'Data: fresh' : `Data: STALE (missing ${expected})`;
  } catch {
    return 'Data: unknown';
  }
}

// Centralized endpoint: expected previous trading day in ET
app.get('/api/trading/expected-prev-day', (req, res) => {
  try {
    const nowEt = getETParts(new Date());
    const prev = previousTradingDayET(nowEt);
    return res.json({ date: etKeyYMD(prev) });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed to compute previous trading day' });
  }
});

function formatMoney(n){ return (typeof n === 'number' && isFinite(n)) ? `$${n.toFixed(2)}` : '-'; }

// Register/unregister Telegram watch
app.post('/api/telegram/watch', (req, res) => {
  try {
    const { symbol, highIBS, lowIBS = 0.1, thresholdPct = 0.3, chatId, entryPrice = null, isOpenPosition = true } = req.body || {};
    const safeSymbol = toSafeTicker(symbol);
    if (!safeSymbol || typeof highIBS !== 'number') {
      return res.status(400).json({ error: 'symbol and highIBS are required' });
    }
    const useChatId = chatId || TELEGRAM_CHAT_ID;
    if (!useChatId) return res.status(400).json({ error: 'No Telegram chat id configured' });
    // thresholdPct сохраняем для обратной совместимости, но в расчётах используем глобальную настройку
    telegramWatches.set(safeSymbol, { symbol: safeSymbol, highIBS, lowIBS, thresholdPct, chatId: useChatId, entryPrice, isOpenPosition, sent: { dateKey: null, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false } });
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

// Scheduler: send aggregated messages at T-11 (overview) and T-2 (confirmations)
async function runTelegramAggregation(minutesOverride = null, options = {}) {
  try {
    if (telegramWatches.size === 0) return { sent: false };
    const nowEt = getETParts(new Date());
    if (!isTradingDayET(nowEt)) return { sent: false };
    const minutesUntilClose = minutesOverride != null ? minutesOverride : ((16 * 60) - (nowEt.hh * 60 + nowEt.mm));
    if (minutesUntilClose !== 11 && minutesUntilClose !== 2) return { sent: false };

    const todayKey = etKeyYMD(nowEt);

    // Load global threshold and convert to IBS points
    const settings = await readSettings();
    const pct = typeof settings.watchThresholdPct === 'number' ? settings.watchThresholdPct : 5;
    const delta = Math.max(0, Math.min(20, pct)) / 100; // 0..0.20 IBS

    await appendMonitorLog([`T-${minutesUntilClose}min: scan ${telegramWatches.size} watches; thresholdPct=${pct}% (deltaIBS=${delta})${options && options.test ? ' [TEST]' : ''}`]);

    // Collect fresh data for all watches and group by chatId (always include all tickers)
    const byChat = new Map(); // chatId -> Array<{ w, ibs, quote, range, ohlc, closeEnoughToExit, closeEnoughToEntry, confirmExit, confirmEntry, dataOk, fetchError, avFresh, rtFresh }>
    for (const w of telegramWatches.values()) {
      const chatId = w.chatId || TELEGRAM_CHAT_ID;
      if (!chatId) continue;
      if (!byChat.has(chatId)) byChat.set(chatId, []);
      const rec = { w, ibs: null, quote: null, range: null, ohlc: null, closeEnoughToExit: null, closeEnoughToEntry: null, confirmExit: null, confirmEntry: null, dataOk: false, fetchError: null, avFresh: false, rtFresh: false };
      byChat.get(chatId).push(rec);
      // ensure per-day flags
      if (w.sent.dateKey !== todayKey) w.sent = { dateKey: todayKey, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false };
      // 1) Refresh via Alpha Vantage and check dataset freshness
      try {
        const avStatus = await refreshTickerViaAlphaVantageAndCheckFreshness(w.symbol, nowEt);
        rec.avFresh = !!(avStatus && avStatus.avFresh);
      } catch {}
      // 2) Fetch today's range/quote via Finnhub (today only)
      try {
        const rangeQuote = await fetchTodayRangeAndQuote(w.symbol);
        const { range, quote } = rangeQuote;
        if (range.low == null || range.high == null || quote.current == null) throw new Error('no range/quote');
        if (range.high <= range.low) throw new Error('invalid range');
        const ibs = (quote.current - range.low) / (range.high - range.low);
        // Абсолютный порог: вход ≤ lowIBS + delta; выход ≥ highIBS − delta
        const closeEnoughToExit = ibs >= (w.highIBS - delta);
        const closeEnoughToEntry = ibs <= ((w.lowIBS ?? 0.1) + delta);
        const confirmExit = ibs >= w.highIBS;
        const confirmEntry = ibs <= (w.lowIBS ?? 0.1);
        rec.ibs = ibs; rec.quote = quote; rec.range = range;
        rec.closeEnoughToExit = closeEnoughToExit; rec.closeEnoughToEntry = closeEnoughToEntry;
        rec.confirmExit = confirmExit; rec.confirmEntry = confirmEntry;
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
        const header = '🕚 11 минут до закрытия (ET)';
        const sub = `Дата: ${todayKey}, Время: ${String(nowEt.hh).padStart(2,'0')}:${String(nowEt.mm).padStart(2,'0')}`;
        const sorted = list.slice().sort((a, b) => a.w.symbol.localeCompare(b.w.symbol));
        const lines = [];
        const logLines = [`T-11 overview → chat ${chatId}`];
        for (const rec of sorted) {
          const { w } = rec;
          const type = w.isOpenPosition ? 'выход' : 'вход';
          const near = w.isOpenPosition ? rec.closeEnoughToExit : rec.closeEnoughToEntry;
          const nearStr = rec.dataOk ? (near ? 'Да' : 'Нет') : '—';
          const priceStr = rec.dataOk && rec.quote ? formatMoney(rec.quote.current) : '-';
          const ibsStr = rec.dataOk && Number.isFinite(rec.ibs) ? rec.ibs.toFixed(3) : '-';
          const thresholdStr = w.isOpenPosition ? `≥ ${(w.highIBS - delta).toFixed(2)} (цель ${w.highIBS})` : `≤ ${((w.lowIBS ?? 0.1) + delta).toFixed(2)} (цель ${w.lowIBS ?? 0.1})`;
          const posEmoji = w.isOpenPosition ? '📦' : '🚫';
          const dirEmoji = w.isOpenPosition ? '🔴' : '🟢';
          const dirText = w.isOpenPosition ? 'продажа' : 'покупка';
          const avEmoji = rec.avFresh ? '🟢AV' : '🟠AV';
          const rtEmoji = rec.rtFresh ? '🟢RT' : '🟠RT';
          lines.push(`${w.symbol}: ${posEmoji} ${w.isOpenPosition ? 'Открыта' : 'Нет'} | ${dirEmoji} ${dirText}; цена: ${priceStr}; IBS: ${ibsStr}; ${avEmoji} ${rtEmoji}; вероятен сигнал (${type}): ${nearStr} (порог ${thresholdStr})`);
          const logOne = rec.dataOk
            ? `${w.symbol} pos=${w.isOpenPosition ? 'open' : 'none'} IBS=${ibsStr} near=${nearStr} thr=${thresholdStr}`
            : `${w.symbol} pos=${w.isOpenPosition ? 'open' : 'none'} data=NA err=${rec.fetchError}`;
          logLines.push(logOne);
        }
        const text = `<b>${header}</b>\n${sub}\n\n${lines.join('\n')}`;
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

      // T-2 confirmations — send once if any signals exist
      if (minutesUntilClose === 2 && (!state.t2Sent || (options && options.forceSend))) {
        const exits = [];
        const entries = [];
        const sorted = list.slice().sort((a, b) => a.w.symbol.localeCompare(b.w.symbol));
        for (const rec of sorted) {
          const { w } = rec;
          if (rec.dataOk && w.isOpenPosition && rec.confirmExit && !w.sent.confirm1) {
            exits.push(`${w.symbol}: IBS ${rec.ibs.toFixed(3)} (≥ ${w.highIBS}); цена: ${formatMoney(rec.quote.current)}; диапазон: ${formatMoney(rec.range.low)} - ${formatMoney(rec.range.high)}`);
            if (!options || options.updateState !== false) w.sent.confirm1 = true;
          }
          if (rec.dataOk && !w.isOpenPosition && rec.confirmEntry && !w.sent.entryConfirm1) {
            entries.push(`${w.symbol}: IBS ${rec.ibs.toFixed(3)} (≤ ${w.lowIBS ?? 0.1}); цена: ${formatMoney(rec.quote.current)}; диапазон: ${formatMoney(rec.range.low)} - ${formatMoney(rec.range.high)}`);
            if (!options || options.updateState !== false) w.sent.entryConfirm1 = true;
          }
        }
        if (exits.length || entries.length) {
          const parts = [];
          parts.push('<b>⏱️ 2 минуты до закрытия — подтвержденные сигналы</b>');
          parts.push(`Дата: ${todayKey}, Время: ${String(nowEt.hh).padStart(2,'0')}:${String(nowEt.mm).padStart(2,'0')}`);
          if (exits.length) {
            parts.push('\n<b>Выход:</b>');
            parts.push(exits.join('\n'));
          }
          if (entries.length) {
            parts.push('\n<b>Вход:</b>');
            parts.push(entries.join('\n'));
          }
          const text = parts.join('\n');
          const resp = await sendTelegramMessage(chatId, text);
          if (resp.ok) {
            if (!options || options.updateState !== false) {
              state.t2Sent = true;
              aggregateSendState.set(chatId, state);
              scheduleSaveWatches();
            }
            await appendMonitorLog([`T-2 confirms → chat ${chatId}`, ...exits.map(s => `EXIT ${s}`), ...entries.map(s => `ENTRY ${s}`), options && options.test ? '→ sent ok [TEST]' : '→ sent ok']);
          } else {
            await appendMonitorLog([`T-2 confirms → chat ${chatId}`, 'nothing sent (send failed)']);
          }
        } else {
          await appendMonitorLog([`T-2 confirms → chat ${chatId}`, 'nothing to send']);
        }
      }
    }
    return { sent: true };
  } catch (e) {
    console.warn('Scheduler error:', e.message);
    try { await appendMonitorLog([`Scheduler error: ${e && e.message ? e.message : e}`]); } catch {}
    return { sent: false };
  }
}

setInterval(async () => {
  await runTelegramAggregation(null, {});
}, 30000);

// Test simulation endpoint to reproduce the logic as if at T-11 or T-2
app.post('/api/telegram/simulate', async (req, res) => {
  try {
    const stage = (req.body && req.body.stage) || 'overview';
    const minutes = stage === 'confirmations' ? 2 : 11;
    const result = await runTelegramAggregation(minutes, { test: true, forceSend: true, updateState: false });
    res.json({ success: !!(result && result.sent), stage });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : 'Failed to simulate telegram aggregation' });
  }
});

// List current telegram watches
app.get('/api/telegram/watches', (req, res) => {
  const list = Array.from(telegramWatches.values()).map(w => ({
    symbol: w.symbol,
    highIBS: w.highIBS,
    thresholdPct: w.thresholdPct,
    entryPrice: w.entryPrice ?? null,
    isOpenPosition: !!w.isOpenPosition,
    chatId: w.chatId ? 'configured' : null,
  }));
  res.json(list);
});

// Send test telegram message
app.post('/api/telegram/test', async (req, res) => {
  try {
    const chatId = (req.body && req.body.chatId) || TELEGRAM_CHAT_ID;
    const msg = (req.body && req.body.message) || 'Test message from Trading Backtester ✅';
    const resp = await sendTelegramMessage(chatId, msg);
    if (!resp.ok) return res.status(500).json({ error: 'Failed to send test message' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to send test message' });
  }
});

// Middleware already applied at the top

// Создаем папку для датасетов если её нет
fs.ensureDirSync(DATASETS_DIR);

// Жёсткая нормализация: оставляем только TICKER.json на диске
function normalizeStableDatasetsSync() {
  try {
    const files = fs.readdirSync(DATASETS_DIR);
    // 0) Удалим мусорные AppleDouble файлы
    for (const f of files) {
      if (f.startsWith('._')) {
        try { fs.removeSync(path.join(DATASETS_DIR, f)); } catch {}
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
        // Создаём стабильный файл из самого свежего legacy
        const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
        const source = path.join(DATASETS_DIR, chosen);
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
        } catch {}
      }
      // 3) Удаляем все legacy файлы (с датой в имени)
      for (const f of arr) {
        const full = path.join(DATASETS_DIR, f);
        if (full === stablePath) continue;
        try { fs.removeSync(full); } catch {}
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
          try { fs.removeSync(path.join(DATASETS_DIR, f)); } catch {}
        }
        try {
          const payload = fs.readJsonSync(target);
          let mutated = false;
          if (payload && payload.name !== ticker) { payload.name = ticker; mutated = true; }
          if (payload && payload.ticker !== ticker) { payload.ticker = ticker; mutated = true; }
          if (mutated) fs.writeJsonSync(target, payload, { spaces: 2 });
        } catch {}
        continue;
      }
      // Choose latest legacy by filename order (YYYY-MM-DD suffix sorts lexicographically)
      const legacyCandidates = arr.filter(f => f.toUpperCase() !== `${ticker}.JSON`).sort();
      const chosen = legacyCandidates.length ? legacyCandidates[legacyCandidates.length - 1] : arr[0];
      const source = path.join(DATASETS_DIR, chosen);
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
        try { fs.copySync(source, target, { overwrite: true }); } catch {}
      }
      // Remove all legacy files after migration
      for (const f of arr) {
        const p = path.join(DATASETS_DIR, f);
        if (p === target) continue;
        try { fs.removeSync(p); } catch {}
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
    return fs
      .readdirSync(DATASETS_DIR)
      // Skip macOS AppleDouble and hidden files
      .filter(f => f.endsWith('.json') && !f.startsWith('._'));
  } catch {
    return [];
  }
}

function resolveDatasetFilePathById(id) {
  // Unified ID policy: ID == TICKER (uppercase), file == TICKER.json
  const ticker = toSafeTicker((id || '').toString());
  if (!ticker) return null;
  const stable = path.join(DATASETS_DIR, `${ticker}.json`);
  try {
    if (fs.existsSync(stable)) return stable;
  } catch {}
  // Fallback: support legacy suffixed filenames like TICKER_YYYY-MM-DD.json
  try {
    const files = listDatasetFilesSync();
    const legacy = files
      .filter(f => f.toUpperCase().startsWith(`${ticker}_`) && !f.startsWith('._'))
      .sort(); // lexicographic sort, date suffix sorts correctly
    if (legacy.length > 0) {
      return path.join(DATASETS_DIR, legacy[legacy.length - 1]);
    }
  } catch {}
  return stable;
}

async function writeDatasetToTickerFile(dataset) {
  const ticker = toSafeTicker(dataset.ticker);
  const targetPath = path.join(DATASETS_DIR, `${ticker}.json`);
  // Remove legacy files for this ticker to avoid confusion (best-effort)
  try {
    const files = await fs.readdir(DATASETS_DIR);
    await Promise.all(files
      .filter(f => f.toUpperCase().startsWith(`${ticker}_`))
      .map(f => fs.remove(path.join(DATASETS_DIR, f)).catch(() => {}))
    );
  } catch {}
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
    resultsRefreshProvider: 'finnhub'
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
    const { watchThresholdPct, resultsQuoteProvider, enhancerProvider, resultsRefreshProvider } = req.body || {};
    const validProvider = (p) => p === 'alpha_vantage' || p === 'finnhub';
    const next = getDefaultSettings();
    if (typeof watchThresholdPct === 'number') next.watchThresholdPct = watchThresholdPct;
    if (validProvider(resultsQuoteProvider)) next.resultsQuoteProvider = resultsQuoteProvider;
    if (validProvider(enhancerProvider)) next.enhancerProvider = enhancerProvider;
    if (validProvider(resultsRefreshProvider)) next.resultsRefreshProvider = resultsRefreshProvider;
    const saved = await writeSettings(next);
    res.json({ success: true, settings: saved });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to save settings' });
  }
});

// Financial Data API Functions
// options.adjustment: 'split_only' | 'none'
async function fetchFromAlphaVantage(symbol, startDate, endDate, options = { adjustment: 'none' }) {
  if (!API_CONFIG.ALPHA_VANTAGE_API_KEY) {
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
  const url = `https://www.alphavantage.co/query?function=${func}&symbol=${encodeURIComponent(safeSymbol)}&apikey=${API_CONFIG.ALPHA_VANTAGE_API_KEY}&outputsize=full`;
  
  const cacheKey = `av:${safeSymbol}:${startDate}:${endDate}:${options.adjustment}`;
  const cached = avCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < cached.ttlMs) {
    return Promise.resolve(cached.payload);
  }

  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
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
          avCache.set(cacheKey, { ts: Date.now(), ttlMs: 6 * 60 * 60 * 1000, payload });
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
  if (!API_CONFIG.FINNHUB_API_KEY) {
    throw new Error('Finnhub API key not configured');
  }
  
  const safeSymbol = toSafeTicker(symbol);
  if (!safeSymbol) {
    throw new Error('Invalid symbol');
  }
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(safeSymbol)}&resolution=D&from=${startDate}&to=${endDate}&token=${API_CONFIG.FINNHUB_API_KEY}`;
  
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
  if (!API_CONFIG.TWELVE_DATA_API_KEY) {
    throw new Error('Twelve Data API key not configured');
  }
  
  const startDateStr = new Date(startDate * 1000).toISOString().split('T')[0];
  const endDateStr = new Date(endDate * 1000).toISOString().split('T')[0];
  const safeSymbol = toSafeTicker(symbol);
  if (!safeSymbol) {
    throw new Error('Invalid symbol');
  }
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(safeSymbol)}&interval=1day&start_date=${startDateStr}&end_date=${endDateStr}&apikey=${API_CONFIG.TWELVE_DATA_API_KEY}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          if (jsonData.status === 'error') {
            reject(new Error(`Twelve Data: ${jsonData.message}`));
            return;
          }
          
          if (!jsonData.values) {
            reject(new Error('No data found'));
            return;
          }
          
          const result = jsonData.values.map(item => ({
            date: item.datetime,
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            adjClose: parseFloat(item.close), // Twelve Data doesn't provide adjusted close in basic plan
            volume: parseInt(item.volume)
          }));
          
          // Sort by date ascending
          result.sort((a, b) => new Date(a.date) - new Date(b.date));
          resolve(result);
          
        } catch (error) {
          reject(new Error(`Failed to parse Twelve Data response: ${error.message}`));
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
    const files = await fs.readdir(DATASETS_DIR);
    const datasets = [];
    for (const file of files) {
      // Игнорируем скрытые/мусорные файлы и нестандартные расширения
      if (!file.endsWith('.json')) continue;
      if (file.startsWith('._')) continue;
      const filePath = path.join(DATASETS_DIR, file);
      try {
        const data = await fs.readJson(filePath);
        if (!data || typeof data !== 'object') continue;
        // Возвращаем только метаданные без самих данных для списка
        const { data: _dropData, splits: _dropSplits, ...metadata } = data;
        const id = toSafeTicker(metadata.ticker || file.replace('.json','').split('_')[0]);
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
          .map(f => fs.remove(path.join(DATASETS_DIR, f)).catch(() => {}))
      );
    } catch {}

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
    try { if (legacyPath && legacyPath !== targetPath) await fs.remove(legacyPath); } catch {}
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
    const settings = await readSettings().catch(() => ({}));

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
    if (!API_CONFIG.ALPHA_VANTAGE_API_KEY) {
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
    const chosenProvider = (provider || API_CONFIG.PREFERRED_API_PROVIDER).toString().toLowerCase();

    // Very short cache (5s) to reduce load
    const cacheKey = `quote:${chosenProvider}:${symbol}`;
    const cached = avCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5000) {
      return res.json(cached.payload);
    }

    if (chosenProvider === 'finnhub') {
      if (!API_CONFIG.FINNHUB_API_KEY) {
        return res.status(500).json({ error: 'Finnhub API key not configured' });
      }
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_CONFIG.FINNHUB_API_KEY}`;
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
      avCache.set(cacheKey, { ts: Date.now(), ttlMs: 5000, payload });
      return res.json(payload);
    }

    // Alpha Vantage GLOBAL_QUOTE
    if (!API_CONFIG.ALPHA_VANTAGE_API_KEY) {
      return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
    }
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_CONFIG.ALPHA_VANTAGE_API_KEY}`;
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
    avCache.set(cacheKey, { ts: Date.now(), ttlMs: 5000, payload });
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
    
    const apiKey = API_CONFIG.POLYGON_API_KEY || (IS_PROD ? '' : 'demo');
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
  loadWatches();
});

async function appendMonitorLog(lines) {
  try {
    const now = new Date();
    const et = getETParts(now);
    const ts = now.toISOString();
    const etStr = `${et.y}-${String(et.m).padStart(2,'0')}-${String(et.d).padStart(2,'0')} ${String(et.hh).padStart(2,'0')}:${String(et.mm).padStart(2,'0')}`;
    const payload = Array.isArray(lines) ? lines : [String(lines)];
    const text = payload.map(l => `[${ts} ET:${etStr}] ${l}`).join('\n') + '\n';
    await fs.appendFile(MONITOR_LOG_FILE, text);
  } catch (e) {
    console.warn('Failed to write monitor log:', e && e.message ? e.message : e);
  }
}