/**
 * Authentication middleware and session management
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const {
    IS_PROD,
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    SESSION_TTL_MS,
    LOGIN_WINDOW_MS,
    LOGIN_MAX_ATTEMPTS,
    LOGIN_LOG_FILE
} = require('../config');
const { appendSafe } = require('../utils/files');

// Session storage
const sessions = new Map(); // token -> { createdAt, expiresAt }
const loginRate = new Map(); // ip -> { count, resetAt }

// Telegram message sender (will be set by telegram service)
let sendTelegramMessageFn = null;
let getApiConfigFn = null;

function setTelegramSender(fn) {
    sendTelegramMessageFn = fn;
}

function setApiConfigGetter(fn) {
    getApiConfigFn = fn;
}

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

function getClientIp(req) {
    try {
        if (req.ip) return req.ip;
        if (Array.isArray(req.ips) && req.ips.length) return req.ips[0];
    } catch { }
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

async function logLoginAttempt({ ip, success, reason, username }) {
    const line = `${new Date().toISOString()}\t${ip}\t${username || '-'}\t${success ? 'SUCCESS' : 'FAIL'}\t${reason || ''}\n`;
    await appendSafe(LOGIN_LOG_FILE, line);
    try {
        if (sendTelegramMessageFn && getApiConfigFn) {
            const note = success ? '✅ Успешный вход' : '⚠️ Неуспешная попытка входа';
            const text = `${note}\nIP: ${ip}\nUser: ${username || '-'}` + (success ? '' : (reason ? `\nПричина: ${reason}` : ''));
            await sendTelegramMessageFn(getApiConfigFn().TELEGRAM_CHAT_ID, text);
        }
    } catch { }
}

function requireAuth(req, res, next) {
    if (!ADMIN_PASSWORD) {
        if (IS_PROD) {
            return res.status(503).json({ error: 'Auth not configured' });
        }
        return next();
    }
    if (req.method === 'OPTIONS') return next();

    // Public routes
    if (
        req.path === '/api/status' ||
        req.path === '/api/login' ||
        req.path === '/api/logout' ||
        req.path === '/api/auth/check' ||
        req.path === '/api/trading-calendar'
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

async function handleLogin(req, res) {
    try {
        if (!ADMIN_PASSWORD) return res.json({ success: true, disabled: true });
        const { username, password, remember } = req.body || {};

        if (!username || typeof username !== 'string' || username.length > 254) {
            return res.status(400).json({ error: 'Invalid username format' });
        }
        if (!password || typeof password !== 'string' || password.length > 1024) {
            return res.status(400).json({ error: 'Invalid password format' });
        }

        const ip = getClientIp(req);
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
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        let passwordValid = false;
        try {
            if (ADMIN_PASSWORD.startsWith('$2b$') || ADMIN_PASSWORD.startsWith('$2a$') || ADMIN_PASSWORD.startsWith('$2y$')) {
                passwordValid = await bcrypt.compare(password, ADMIN_PASSWORD);
            } else {
                passwordValid = password === ADMIN_PASSWORD;
                console.warn('WARNING: Using plain text password. Consider using a hashed password for security.');
            }
        } catch (error) {
            console.error('Password verification error:', error);
            passwordValid = false;
        }

        if (!password || !passwordValid) {
            logLoginAttempt({ ip, success: false, reason: 'INVALID_PASSWORD', username });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = createToken();
        const ts = Date.now();
        sessions.set(token, { createdAt: ts, expiresAt: ts + SESSION_TTL_MS });
        setAuthCookie(req, res, token, !!remember);
        loginRate.delete(ip);
        logLoginAttempt({ ip, success: true, username });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Login failed' });
    }
}

function handleAuthCheck(req, res) {
    if (!ADMIN_PASSWORD) return res.json({ ok: true, disabled: true });
    const cookies = parseCookies(req);
    const token = cookies.auth_token || getAuthTokenFromHeader(req);
    const sess = token && sessions.get(token);
    if (!sess || sess.expiresAt < Date.now()) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ ok: true });
}

function handleLogout(req, res) {
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
}

async function handleHashPassword(req, res) {
    try {
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
}

module.exports = {
    sessions,
    parseCookies,
    getAuthTokenFromHeader,
    createToken,
    isValidToken,
    shouldUseSecureCookie,
    setAuthCookie,
    clearAuthCookie,
    getClientIp,
    logLoginAttempt,
    requireAuth,
    handleLogin,
    handleAuthCheck,
    handleLogout,
    handleHashPassword,
    setTelegramSender,
    setApiConfigGetter,
};
