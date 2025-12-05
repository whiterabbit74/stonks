/**
 * Trading Backtester Server
 * Modular Express.js application
 */

// Load configuration first (handles dotenv)
const config = require('./src/config');
const { PORT, DATASETS_DIR, FRONTEND_ORIGIN, IS_PROD, getApiConfig } = config;

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs-extra');

// Import middleware
const { apiLimiter, uploadLimiter } = require('./src/middleware/rateLimiter');
const auth = require('./src/middleware/auth');

// Import services
const { normalizeStableDatasetsSync } = require('./src/services/datasets');
const { ensureSplitsFile } = require('./src/services/splits');
const { loadWatches, sendTelegramMessage, telegramWatches, scheduleSaveWatches } = require('./src/services/telegram');
const {
  loadTradeHistory,
  ensureTradeHistoryLoaded,
  setTelegramWatches,
  synchronizeWatchesWithTradeHistory,
  isTradeHistoryLoaded
} = require('./src/services/trades');
const { ensureRegularFileSync } = require('./src/utils/files');

// Create Express app
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

// Apply global middleware
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
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));

// Handle preflight
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
app.use('/api/', apiLimiter);
app.use('/upload', uploadLimiter);
app.set('etag', false);

// Set up cross-service dependencies
setTelegramWatches(telegramWatches, scheduleSaveWatches);
auth.setTelegramSender(sendTelegramMessage);
auth.setApiConfigGetter(getApiConfig);

// Ensure storage files exist
ensureSplitsFile().catch((err) => {
  console.warn('Failed to ensure splits file exists:', err.message);
});
try { ensureRegularFileSync(config.SETTINGS_FILE, {}); } catch { }
try { ensureRegularFileSync(config.WATCHES_FILE, []); } catch { }
try { ensureRegularFileSync(config.TRADE_HISTORY_FILE, []); } catch { }

// Ensure dataset directories (may fail in non-Docker environment)
try { fs.ensureDirSync(DATASETS_DIR); } catch (e) {
  console.warn(`Cannot create datasets dir ${DATASETS_DIR}:`, e.message);
}
try { fs.ensureDirSync(config.KEEP_DATASETS_DIR); } catch { }

// Run dataset migration on startup
normalizeStableDatasetsSync();

// Import route handlers
const calendarRoutes = require('./src/routes/calendar');
const authRoutes = require('./src/routes/auth');
const settingsRoutes = require('./src/routes/settings');
const datasetsRoutes = require('./src/routes/datasets');
const splitsRoutes = require('./src/routes/splits');
const telegramRoutes = require('./src/routes/telegram');
const tradesRoutes = require('./src/routes/trades');
const quotesRoutes = require('./src/routes/quotes');
const statusRoutes = require('./src/routes/status');

// Public routes (before auth middleware)
app.use('/api', calendarRoutes);

// Auth middleware
app.use(auth.requireAuth);

// Protected routes
app.use('/api', authRoutes);
app.use('/api', settingsRoutes);
app.use('/api', datasetsRoutes);
app.use('/api', splitsRoutes);
app.use('/api', telegramRoutes);
app.use('/api', tradesRoutes);
app.use('/api', quotesRoutes);
app.use('/api', statusRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Trading Backtester API running on http://localhost:${PORT}`);
  console.log(`📁 Datasets stored in: ${DATASETS_DIR}`);

  // Load persisted telegram watches
  loadWatches(synchronizeWatchesWithTradeHistory, loadTradeHistory, isTradeHistoryLoaded()).catch(err => {
    console.warn('Failed to initialize telegram watches:', err && err.message ? err.message : err);
  });
  ensureTradeHistoryLoaded();
});

module.exports = app;