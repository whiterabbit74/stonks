require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;
const DATASETS_DIR = path.join(__dirname, 'datasets');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const WATCHES_FILE = path.join(__dirname, 'telegram-watches.json');
const avCache = new Map(); // кэш ответов Alpha Vantage

// API Configuration
const API_CONFIG = {
  ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
  PREFERRED_API_PROVIDER: 'alpha_vantage'
};

// Apply global middleware early (so it affects ALL routes)
// CORS with credentials (to support cookie-based auth)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
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
    if (i > 0) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}
function getAuthTokenFromHeader(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h || typeof h !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}
function createToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
}
function setAuthCookie(res, token, remember) {
  const maxAge = remember ? SESSION_TTL_MS : undefined;
  const parts = [
    `auth_token=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (maxAge) parts.push(`Max-Age=${Math.floor(maxAge/1000)}`);
  // HttpOnly is preferable, but fetch from different origin still sends cookie; keep HttpOnly off to allow dev tools reading if needed
  // parts.push('HttpOnly');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function requireAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // auth disabled
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/api/status' || req.path === '/api/login' || req.path === '/api/auth/check') return next();
  const cookies = parseCookies(req);
  const token = cookies.auth_token || getAuthTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const sess = sessions.get(token);
  if (!sess || sess.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}
app.use(requireAuth);

// Auth endpoints
// Rate limiting: max 3 attempts per 24h per IP
const LOGIN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOGIN_MAX_ATTEMPTS = 3;
const loginRate = new Map(); // ip -> { count, resetAt }
const LOGIN_LOG_FILE = path.join(__dirname, 'login-attempts.log');
function getClientIp(req) {
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
    setAuthCookie(res, token, !!remember);
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

// In-memory watch list for Telegram notifications (persisted to disk)
// { symbol, highIBS, lowIBS, thresholdPct, chatId, entryPrice, isOpenPosition, sent: { dateKey, warn10, confirm1, entryWarn10, entryConfirm1 } }
const telegramWatches = new Map();

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

async function fetchTodayRangeAndQuote(symbol) {
  // pull last 10 days from Finnhub and current quote
  const endTs = Math.floor(Date.now()/1000);
  const startTs = endTs - 15*24*60*60;
  const ohlc = await fetchFromFinnhub(symbol, startTs, endTs); // array
  const quote = await new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${API_CONFIG.FINNHUB_API_KEY}`;
    https.get(url, (response) => {
      let data=''; response.on('data', c=>data+=c); response.on('end', ()=>{ try{ resolve(JSON.parse(data)); } catch(e){ reject(e); } });
    }).on('error', reject);
  });
  // find latest daily candle (today if available)
  const todayEt = getETParts(new Date());
  const todayKey = etKeyYMD(todayEt);
  const lastCandle = [...ohlc].reverse().find(r => r && r.date);
  const range = lastCandle ? { open: lastCandle.open, high: lastCandle.high, low: lastCandle.low } : { open: null, high: null, low: null };
  return { range, quote: { open: quote.o ?? null, high: quote.h ?? null, low: quote.l ?? null, current: quote.c ?? null, prevClose: quote.pc ?? null }, dateKey: todayKey, ohlc };
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

function formatMoney(n){ return (typeof n === 'number' && isFinite(n)) ? `$${n.toFixed(2)}` : '-'; }


// Register/unregister Telegram watch
app.post('/api/telegram/watch', (req, res) => {
  try {
    const { symbol, highIBS, lowIBS = 0.1, thresholdPct = 0.3, chatId, entryPrice = null, isOpenPosition = true } = req.body || {};
    if (!symbol || typeof highIBS !== 'number') {
      return res.status(400).json({ error: 'symbol and highIBS are required' });
    }
    const useChatId = chatId || TELEGRAM_CHAT_ID;
    if (!useChatId) return res.status(400).json({ error: 'No Telegram chat id configured' });
    telegramWatches.set(symbol.toUpperCase(), { symbol: symbol.toUpperCase(), highIBS, lowIBS, thresholdPct, chatId: useChatId, entryPrice, isOpenPosition, sent: { dateKey: null, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false } });
    scheduleSaveWatches();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to register watch' });
  }
});

app.delete('/api/telegram/watch/:symbol', (req, res) => {
  const sym = (req.params.symbol || '').toUpperCase();
  telegramWatches.delete(sym);
  scheduleSaveWatches();
  res.json({ success: true });
});

// Optional endpoint to update open position flag / entry price
app.patch('/api/telegram/watch/:symbol', (req, res) => {
  const sym = (req.params.symbol || '').toUpperCase();
  const w = telegramWatches.get(sym);
  if (!w) return res.status(404).json({ error: 'Watch not found' });
  const { isOpenPosition, entryPrice } = req.body || {};
  if (typeof isOpenPosition === 'boolean') w.isOpenPosition = isOpenPosition;
  if (typeof entryPrice === 'number') w.entryPrice = entryPrice;
  scheduleSaveWatches();
  res.json({ success: true });
});

// Scheduler: check every 30s and notify at T-10 and T-1 minutes (both entry and exit signals)
setInterval(async () => {
  try {
    if (telegramWatches.size === 0) return;
    const nowEt = getETParts(new Date());
    if (!isTradingDayET(nowEt)) return;
    // minutes until 16:00 ET
    const minutesUntilClose = (16 * 60) - (nowEt.hh * 60 + nowEt.mm);
    const triggers = [10, 1];
    if (!triggers.includes(minutesUntilClose)) return;
    for (const w of telegramWatches.values()) {
      // ENTRY notifications (position opening) — when not in position
      if (!w.isOpenPosition) {
        let rangeQuote;
        try { rangeQuote = await fetchTodayRangeAndQuote(w.symbol); } catch { continue; }
        const { range, quote, ohlc } = rangeQuote;
        if (range.low == null || range.high == null || quote.current == null) continue;
        if (range.high <= range.low) continue;
        const ibs = (quote.current - range.low) / (range.high - range.low);
        const closeEnoughToEntry = ibs <= (w.lowIBS ?? 0.1) * (1 + (w.thresholdPct || 0.3) / 100);
        const todayKey = etKeyYMD(nowEt);
        if (w.sent.dateKey !== todayKey) w.sent = { dateKey: todayKey, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false };
        if (minutesUntilClose === 10 && closeEnoughToEntry && !w.sent.entryWarn10) {
          const fresh = buildFreshnessLine(ohlc, nowEt);
          const header = `⚪ Entry Signal for ${w.symbol}`;
          const core = [
            `IBS Value: ${(ibs).toFixed(3)}`,
            `Current Price: ${formatMoney(quote.current)}`,
            `Date: ${todayKey}`,
            fresh
          ].join('\n');
          const details = [
            `Rule: IBS ≤ ${w.lowIBS} (buy at tomorrow's open if condition holds)`,
            `Trigger range today: price ≤ ${formatMoney(range.low + (w.lowIBS * (range.high - range.low)))}`
          ].join('\n');
          const text = `<b>${header}</b>\n\n${core}\n\n${details}`;
          const resp = await sendTelegramMessage(w.chatId, text);
          if (resp.ok) w.sent.entryWarn10 = true;
        }
        if (minutesUntilClose === 1 && closeEnoughToEntry && !w.sent.entryConfirm1) {
          const fresh = buildFreshnessLine(ohlc, nowEt);
          const header = `⚪ Entry Confirm for ${w.symbol}`;
          const core = [
            `IBS Value: ${(ibs).toFixed(3)}`,
            `Current Price: ${formatMoney(quote.current)}`,
            `Date: ${todayKey}`,
            fresh
          ].join('\n');
          const details = [
            `Action: BUY at next open if condition persists`,
            `Rule: IBS ≤ ${w.lowIBS}`,
            `Trigger range today: price ≤ ${formatMoney(range.low + (w.lowIBS * (range.high - range.low)))}`
          ].join('\n');
          const text = `<b>${header}</b>\n\n${core}\n\n${details}`;
          const resp = await sendTelegramMessage(w.chatId, text);
          if (resp.ok) w.sent.entryConfirm1 = true;
        }
        continue; // skip exit logic when not in position
      }
      // EXIT notifications (position closing) — when in position
      // Ensure per-day flags
      const todayKey = etKeyYMD(nowEt);
      if (w.sent.dateKey !== todayKey) w.sent = { dateKey: todayKey, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false };
      if (minutesUntilClose === 1 && !w.sent.warn10) continue; // send confirm only if warned before

      // Refresh data before notify
      let rangeQuote;
      try {
        rangeQuote = await fetchTodayRangeAndQuote(w.symbol);
      } catch (e) {
        console.warn('Failed to refresh before notify:', e.message);
        continue;
      }
      const { range, quote, ohlc } = rangeQuote;
      if (range.low == null || range.high == null || quote.current == null) continue;
      if (range.high <= range.low) continue;
      const target = range.low + w.highIBS * (range.high - range.low);
      const diffPct = ((quote.current - target) / target) * 100;
      const closeEnough = Math.abs(diffPct) <= w.thresholdPct;
      if (!closeEnough && minutesUntilClose === 10) continue; // only warn if close
      if (minutesUntilClose === 1 && !closeEnough) {
        // still confirm but mark not-close
      }
      const fresh = buildFreshnessLine(ohlc, nowEt);
      const header = minutesUntilClose === 10 ? `⚪ Exit Signal for ${w.symbol}` : `⚪ Exit Confirm for ${w.symbol}`;
      const lines = [
        `IBS Target: ${formatMoney(target)} (IBS=${w.highIBS})`,
        `Current Price: ${formatMoney(quote.current)} (Δ ${(diffPct>=0?'+':'')}${diffPct.toFixed(2)}%)`,
        `Date: ${etKeyYMD(nowEt)}`,
        fresh,
        `Trigger range today: price ≥ ${formatMoney(target)}`
      ];
      if (typeof w.entryPrice === 'number') lines.push(`Цена входа: ${w.entryPrice.toFixed(2)}`);
      if (!closeEnough) lines.push('Note: not within threshold, check manually.');
      const text = `<b>${header}</b>\n\n${lines.join('\n')}`;
      const resp = await sendTelegramMessage(w.chatId, text);
      if (resp.ok) {
        if (minutesUntilClose === 10) w.sent.warn10 = true; else w.sent.confirm1 = true;
      }
    }
  } catch (e) {
    console.warn('Scheduler error:', e.message);
  }
}, 30000);

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
  const url = `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}&apikey=${API_CONFIG.ALPHA_VANTAGE_API_KEY}&outputsize=full`;
  
  const cacheKey = `av:${symbol}:${startDate}:${endDate}:${options.adjustment}`;
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
  
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${startDate}&to=${endDate}&token=${API_CONFIG.FINNHUB_API_KEY}`;
  
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
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=1day&start_date=${startDateStr}&end_date=${endDateStr}&apikey=${API_CONFIG.TWELVE_DATA_API_KEY}`;
  
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

// Finnhub: получить сплиты отдельно
async function fetchSplitsFromFinnhub(symbol, startDate, endDate) {
  if (!API_CONFIG.FINNHUB_API_KEY) {
    const err = new Error('Finnhub API key not configured');
    err.status = 500;
    throw err;
  }
  const fromStr = new Date(startDate * 1000).toISOString().split('T')[0];
  const toStr = new Date(endDate * 1000).toISOString().split('T')[0];
  const url = `https://finnhub.io/api/v1/stock/split?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}&token=${API_CONFIG.FINNHUB_API_KEY}`;
  return new Promise((resolve, reject) => {
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
          const jsonData = JSON.parse(data);
          if (jsonData.error) {
            const err = new Error(`Finnhub: ${jsonData.error}`);
            err.status = /access/i.test(jsonData.error) ? 403 : 400;
            return reject(err);
          }
          if (!Array.isArray(jsonData)) {
            const err = new Error('Finnhub: неожиданный формат ответа на сплиты');
            err.status = 502;
            return reject(err);
          }
          // Формат Finnhub: [{ symbol, date, fromFactor, toFactor, ... }]
          const splits = jsonData
            .filter(item => item && item.date && (item.fromFactor || item.toFactor || item.ratio))
            .map(item => {
              const fromF = Number(item.fromFactor || 1);
              const toF = Number(item.toFactor || 1);
              let factor = 1;
              if (fromF && toF) {
                factor = fromF / toF; // 4:1 → 4
              } else if (item.ratio) {
                factor = Number(item.ratio) || 1;
              }
              return { date: item.date, factor };
            })
            .filter(s => s.factor && s.factor !== 1);
          // Отсортируем по дате возрастанию
          splits.sort((a, b) => new Date(a.date) - new Date(b.date));
          resolve(splits);
        } catch (error) {
          const err = new Error(`Не удалось обработать ответ Finnhub: ${error.message}`);
          err.status = 502;
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

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
  try {
    const files = await fs.readdir(DATASETS_DIR);
    const datasets = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(DATASETS_DIR, file);
        const data = await fs.readJson(filePath);
        
        // Возвращаем только метаданные без самих данных для списка
        const { data: _, ...metadata } = data;
        datasets.push({
          id: file.replace('.json', ''),
          ...metadata
        });
      }
    }
    
    res.json(datasets);
  } catch (error) {
    console.error('Error reading datasets:', error);
    res.status(500).json({ error: 'Failed to read datasets' });
  }
});

// Получить конкретный датасет
app.get('/api/datasets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(DATASETS_DIR, `${id}.json`);
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    const dataset = await fs.readJson(filePath);
    res.json(dataset);
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
    const lastYmd = new Date(lastTs).toISOString().split('T')[0];
    const safeTicker = String(dataset.ticker || '').toUpperCase().replace(/[^A-Z0-9._-]/g, '');
    const computedName = `${safeTicker}_${lastYmd}`;
    const safeId = computedName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(DATASETS_DIR, `${safeId}.json`);
    // Обновляем name внутри файла на вычисленное
    const payload = { ...dataset, name: computedName };
    await fs.writeJson(filePath, payload, { spaces: 2 });
    console.log(`Dataset saved: ${computedName} (${safeTicker})`);
    res.json({ success: true, id: safeId, message: `Dataset "${computedName}" saved successfully` });
  } catch (error) {
    console.error('Error saving dataset:', error);
    res.status(500).json({ error: 'Failed to save dataset' });
  }
});

// Удалить датасет
app.delete('/api/datasets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const filePath = path.join(DATASETS_DIR, `${id}.json`);
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
    }
    
    await fs.remove(filePath);
    
    console.log(`Dataset deleted: ${id}`);
    res.json({ success: true, message: `Dataset "${id}" deleted successfully` });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    res.status(500).json({ error: 'Failed to delete dataset' });
  }
});

// Обновить датасет
app.put('/api/datasets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dataset = req.body;
    const filePath = path.join(DATASETS_DIR, `${id}.json`);
    
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'Dataset not found' });
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
    const lastYmd = new Date(lastTs).toISOString().split('T')[0];
    const safeTicker = String(dataset.ticker || '').toUpperCase().replace(/[^A-Z0-9._-]/g, '');
    const computedName = `${safeTicker}_${lastYmd}`;
    const safeNewId = computedName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const newPath = path.join(DATASETS_DIR, `${safeNewId}.json`);
    const payload = { ...dataset, name: computedName };
    let renamed = false;
    if (safeNewId !== id) {
      // Переименовать файл
      await fs.writeJson(newPath, payload, { spaces: 2 });
      await fs.remove(filePath);
      renamed = true;
      console.log(`Dataset renamed & updated: ${id} → ${safeNewId}`);
      return res.json({ success: true, id: safeNewId, renamed: true, message: `Dataset "${id}" renamed to "${safeNewId}" and updated` });
    } else {
      await fs.writeJson(filePath, payload, { spaces: 2 });
      console.log(`Dataset updated: ${id}`);
      return res.json({ success: true, id: safeNewId, renamed: false, message: `Dataset "${id}" updated successfully` });
    }
  } catch (error) {
    console.error('Error updating dataset:', error);
    res.status(500).json({ error: 'Failed to update dataset' });
  }
});

// Financial Data API proxy (supports multiple providers)
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.get('/api/yahoo-finance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { start, end, provider, adjustment } = req.query;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const defaultStartDate = Math.floor(Date.now() / 1000) - (10 * 365 * 24 * 60 * 60);
    const startDate = start ? parseInt(start) : defaultStartDate;
    const endDate = end ? parseInt(end) : Math.floor(Date.now() / 1000);

    const chosenProvider = (provider || API_CONFIG.PREFERRED_API_PROVIDER).toString().toLowerCase();
    let payload;
    if (chosenProvider === 'finnhub') {
      if (!API_CONFIG.FINNHUB_API_KEY) {
        return res.status(500).json({ error: 'Finnhub API key not configured' });
      }
      console.log(`Fetching data for ${symbol} from Finnhub...`);
      const fhData = await fetchFromFinnhub(symbol, startDate, endDate);
      payload = { data: fhData, splits: [] };
    } else {
      if (!API_CONFIG.ALPHA_VANTAGE_API_KEY) {
        return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
      }
      const mode = (adjustment || 'none').toString();
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
      const base = Array.isArray(avResponse) ? { data: avResponse } : { data: avResponse.data };
      payload = { ...base, splits: [] };
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
    const { symbol } = req.params;
    const { provider } = req.query;
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

// Splits-only endpoint: fetch split events separately
app.get('/api/splits/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { start, end, provider, allowHeuristic } = req.query;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const defaultStartDate = Math.floor(Date.now() / 1000) - (40 * 365 * 24 * 60 * 60);
    const startDate = start ? parseInt(start) : defaultStartDate;
    const endDate = end ? parseInt(end) : Math.floor(Date.now() / 1000);
    const chosenProvider = (provider || API_CONFIG.PREFERRED_API_PROVIDER).toString().toLowerCase();
    let result = [];

    // 0) Авторитетный источник: если в локальном датасете уже есть сплиты — вернём их
    try {
      const files = await fs.readdir(DATASETS_DIR);
      // Находим последний файл по шаблону SYMBOL_YYYY-MM-DD.json
      const re = new RegExp(`^${symbol.replace(/[^A-Za-z0-9._-]/g,'').toUpperCase()}_\\d{4}-\\d{2}-\\d{2}\\.json$`);
      const matched = files.filter(f => re.test(f)).sort().reverse();
      if (matched.length > 0) {
        const latestPath = path.join(DATASETS_DIR, matched[0]);
        const ds = await fs.readJson(latestPath);
        if (ds && Array.isArray(ds.splits) && ds.splits.length > 0) {
          // Сортируем по дате возрастанию и возвращаем
          const sorted = [...ds.splits].sort((a,b)=> new Date(a.date) - new Date(b.date));
          return res.json(sorted);
        }
      }
    } catch {}
    if (chosenProvider === 'finnhub') {
      if (!API_CONFIG.FINNHUB_API_KEY) {
        return res.status(500).json({ error: 'Finnhub API key not configured' });
      }
      console.log(`Fetching splits for ${symbol} from Finnhub...`);
      try {
        result = await fetchSplitsFromFinnhub(symbol, startDate, endDate);
      } catch (e) {
        // Если нет доступа к сплитам, попытаемся определить сплиты эвристикой по OHLC Finnhub
        if (e && e.status === 403 && String(allowHeuristic) === '1') {
          console.warn('Finnhub splits not accessible on this plan. Falling back to heuristic detection from OHLC.');
          const ohlc = await fetchFromFinnhub(symbol, startDate, endDate);
          result = detectSplitsFromOHLC(ohlc);
        } else {
          throw e;
        }
      }
    } else {
      if (!API_CONFIG.ALPHA_VANTAGE_API_KEY) {
        return res.status(500).json({ error: 'Alpha Vantage API key not configured' });
      }
      console.log(`Fetching splits for ${symbol} from Alpha Vantage...`);
      let payload;
      try {
        // Для сплитов обязательно используем ADJUSTED, иначе коэффициентов нет
        payload = await fetchFromAlphaVantage(symbol, startDate, endDate, { adjustment: 'split_only' });
      } catch (e) {
        if (e && e.status === 429) {
          await sleep(1200);
          payload = await fetchFromAlphaVantage(symbol, startDate, endDate, { adjustment: 'split_only' });
        } else {
          throw e;
        }
      }
      result = Array.isArray(payload) ? [] : (payload.splits || []);
      // Fallback: если AV вернул пустые сплиты (или DAILY без коэффициента), можем попробовать эвристику по OHLC
      if (String(allowHeuristic) === '1' && (!result || result.length === 0) && payload && payload.data && Array.isArray(payload.data)) {
        try {
          result = detectSplitsFromOHLC(payload.data);
        } catch {}
      }
    }
    console.log(`Splits found: ${result.length}`);
    return res.json(result);
  } catch (error) {
    console.error('Error fetching splits:', error);
    const status = error.status || 500;
    let code = 'UPSTREAM_ERROR';
    let hint = 'Попробуйте повторить запрос позже.';
    if (status === 429) {
      code = 'RATE_LIMIT';
      hint = 'Достигнут лимит Alpha Vantage. Подождите 60–90 секунд и повторите.';
    } else if (status === 400) {
      code = 'BAD_REQUEST';
      hint = 'Проверьте тикер и корректность API ключа.';
    } else if (status === 403) {
      code = 'FORBIDDEN';
      hint = 'Недостаточные права на сплиты у текущего тарифа Finnhub. Использован fallback-алгоритм (если возможен)';
    } else if (status === 502) {
      code = 'UPSTREAM_HTML';
      hint = 'Провайдер вернул некорректный ответ. Повторите позже.';
    }
    res.status(status).json({ error: error.message || 'Ошибка провайдера', code, hint, provider: 'Alpha Vantage' });
  }
});

// Alternative real data API using Polygon.io (free tier: 5 requests/minute)
app.get('/api/polygon-finance/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { start, end } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    // Calculate date range (default to last 30 days)
    const endDate = end ? new Date(parseInt(end) * 1000) : new Date();
    const startDate = start ? new Date(parseInt(start) * 1000) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const fromDate = startDate.toISOString().split('T')[0];
    const toDate = endDate.toISOString().split('T')[0];
    
    // Using Polygon.io API for real data
    // Free API key - you can get your own at https://polygon.io/
    const API_KEY = 'demo'; // Replace with real API key for production
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apikey=${API_KEY}`;
    
    console.log(`Fetching real data for ${symbol} from Polygon.io...`);
    console.log(`URL: ${url}`);
    
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
    
    console.log(`Retrieved ${result.length} real data points for ${symbol} from Polygon`);
    
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
    const url = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=1640995200&period2=1672531200&interval=1d&events=history&includeAdjustedClose=true`;
    
    console.log(`Testing Yahoo Finance API with URL: ${url}`);
    
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
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Trading Backtester API running on http://localhost:${PORT}`);
  console.log(`📁 Datasets stored in: ${DATASETS_DIR}`);
  // Load persisted telegram watches
  loadWatches();
});