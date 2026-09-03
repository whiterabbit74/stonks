import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const require = createRequire(import.meta.url);

const fixture = JSON.parse(
  readFileSync(path.join(repoRoot, 'go/internal/live/testdata/t1-parity-quotes.json'), 'utf8'),
);

function purgeServerCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverRoot)) {
      delete require.cache[key];
    }
  }
}

function stubModule(relativePathFromServerRoot, exports) {
  const fullPath = path.join(serverRoot, relativePathFromServerRoot);
  require.cache[fullPath] = {
    id: fullPath,
    filename: fullPath,
    loaded: true,
    exports,
  };
}

function createTempEnv() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stonks-t1-agg-'));
  const dataDir = path.join(tempDir, 'datasets');
  const dbDir = path.join(tempDir, 'db');
  const stateDir = path.join(tempDir, 'state');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(dbDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(stateDir, 'settings.json'), '{}');
  writeFileSync(path.join(stateDir, 'splits.json'), '{}');
  writeFileSync(path.join(stateDir, 'telegram-watches.json'), '[]');
  writeFileSync(path.join(stateDir, 'trade-history.json'), '[]');
  const nextEnv = {
    NODE_ENV: 'test',
    DATASETS_DIR: dataDir,
    DB_DIR: dbDir,
    DB_FILE: path.join(dbDir, 'trading.db'),
    SETTINGS_FILE: path.join(stateDir, 'settings.json'),
    SPLITS_FILE: path.join(stateDir, 'splits.json'),
    WATCHES_FILE: path.join(stateDir, 'telegram-watches.json'),
    TRADE_HISTORY_FILE: path.join(stateDir, 'trade-history.json'),
    MONITOR_LOG_PATH: path.join(dataDir, 'monitor.log'),
    AUTOTRADE_LOG_PATH: path.join(dataDir, 'autotrade.log'),
    AUTOTRADE_STATE_PATH: path.join(dataDir, 'autotrade-state.json'),
    WEBULL_RAW_LOG_PATH: path.join(dataDir, 'webull-raw.log'),
  };
  const previousEnv = {};
  for (const [key, value] of Object.entries(nextEnv)) {
    previousEnv[key] = process.env[key];
    process.env[key] = value;
  }
  return {
    restore() {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

let cleanupEnv = null;
afterEach(() => {
  purgeServerCache();
  if (cleanupEnv) {
    cleanupEnv.restore();
    cleanupEnv = null;
  }
});

describe('Node runTelegramAggregation T-1 vs shared fixture', () => {
  it('calls executeWebullSignal for the lowest-IBS watch with Node quantity', async () => {
    cleanupEnv = createTempEnv();
    purgeServerCache();
    const realAutotrade = require(path.join(serverRoot, 'src/services/autotrade.js'));
    const computeOrderQuantity = realAutotrade.__testables.computeOrderQuantity;
    purgeServerCache();

    const bySym = Object.fromEntries(fixture.quotes.map((q) => [q.symbol, q]));
    const telegramWatches = new Map(
      fixture.quotes.map((q) => [q.symbol, {
        symbol: q.symbol,
        highIBS: fixture.highIBS,
        lowIBS: fixture.lowIBS,
        thresholdPct: 0.3,
        chatId: 'chat-1',
        sent: { dateKey: null, warn10: false, confirm1: false, entryWarn10: false, entryConfirm1: false },
      }]),
    );
    const signals = [];
    const sendCalls = [];

    stubModule('src/config/index.js', {
      getApiConfig: () => ({ TELEGRAM_CHAT_ID: 'chat-1' }),
      DATASETS_DIR: repoRoot,
    });
    stubModule('src/services/settings.js', {
      readSettings: async () => ({
        resultsRefreshProvider: 'finnhub',
        autoTrading: {
          enabled: true,
          lowIBS: fixture.lowIBS,
          highIBS: fixture.highIBS,
          allowNewEntries: true,
          allowExits: true,
          entrySizingMode: fixture.entrySizingMode,
          fixedQuantity: fixture.fixedQuantity,
        },
      }),
    });
    stubModule('src/services/datasets.js', {
      getDataset: (symbol) => {
        const q = bySym[symbol];
        if (!q) return null;
        return { data: [{ date: '2026-08-31', open: q.current, high: q.high, low: q.low, close: q.current }] };
      },
    });
    stubModule('src/utils/helpers.js', {
      toSafeTicker: (value) => String(value || '').toUpperCase(),
    });
    stubModule('src/providers/quote.js', {
      fetchTodayRangeAndQuote: async (symbol) => {
        const q = bySym[String(symbol || '').toUpperCase()];
        if (!q) throw new Error('no quote for ' + symbol);
        return {
          range: { low: q.low, high: q.high },
          quote: { current: q.current, low: q.low, high: q.high, open: q.current, prevClose: q.current },
          source: 'finnhub',
        };
      },
    });
    stubModule('src/services/telegram.js', {
      telegramWatches,
      aggregateSendState: new Map(),
      getAggregateState: () => ({ dateKey: '2026-09-01', t11Sent: false, t1Sent: false }),
      sendTelegramMessage: async (chatId, text) => {
        sendCalls.push({ chatId, text });
        return { ok: true };
      },
    });
    stubModule('src/services/trades.js', {
      syncWatchesWithTradeState: () => ({ openTrade: null, changes: [] }),
      getCurrentOpenTrade: () => null,
      recordTradeEntry: () => null,
      recordTradeExit: () => null,
    });
    stubModule('src/services/autotrade.js', {
      executeWebullSignal: async (args) => {
        const quantity = computeOrderQuantity(
          args.currentPrice,
          {
            entrySizingMode: fixture.entrySizingMode,
            fixedQuantity: fixture.fixedQuantity,
            allowFractionalShares: false,
          },
          null,
          {},
        );
        signals.push({
          action: args.action,
          symbol: args.symbol,
          currentPrice: args.currentPrice,
          ibs: args.ibs,
          forceDryRun: args.forceDryRun,
          quantity,
        });
        return {
          submitted: false,
          simulated: true,
          mode: 'dry_run',
          quantity,
          clientOrderId: null,
          error: 'Dry run mode: order not sent',
        };
      },
      appendAutotradeEvent: async () => {},
    });
    stubModule('src/services/dates.js', {
      getETParts: () => ({ y: 2026, m: 9, d: 1, hh: 15, mm: 59, weekday: 2 }),
      etKeyYMD: () => '2026-09-01',
      previousTradingDayET: () => ({ y: 2026, m: 8, d: 31 }),
      getTradingSessionForDateET: () => ({ closeMin: 16 * 60, short: false, openMin: 9 * 60 + 30 }),
      isTradingDayByCalendarET: () => true,
      getCachedTradingCalendar: () => ({}),
    });
    stubModule('src/services/priceActualization.js', {
      refreshTickerAndCheckFreshness: async () => ({ fresh: true }),
      appendMonitorLog: async () => {},
    });
    stubModule('src/services/monitorConsistency.js', {
      reconcileMonitorState: () => ({ issues: [] }),
      getBlockingMonitorMismatch: () => null,
    });
    stubModule('src/services/splits.js', {
      getTickerSplits: () => [],
    });
    stubModule('src/services/emaAlerts.js', {
      listEmaAlerts: () => [],
      evaluateEmaAlerts: async () => [],
      markEmaAlertsTriggered: () => [],
      recordEmaInfoSide: () => null,
      recordEmaInfoSides: () => [],
    });
    stubModule('src/services/marketDataIntegrity.js', {
      evaluatePriceIntegrity: () => ({ blockSignals: false }),
      formatIntegrityWarningBlock: () => '',
      integrityWarningKey: (w) => (w && w.symbol) || '',
    });

    const { runTelegramAggregation } = require(path.join(serverRoot, 'src/services/telegramAggregation.js'));
    const result = await runTelegramAggregation(1, { test: true, forceSend: true, updateState: false });

    expect(signals).toHaveLength(1);
    expect(signals[0].action).toBe('entry');
    expect(signals[0].symbol).toBe('AAPL');
    expect(signals[0].forceDryRun).toBe(true);
    expect(signals[0].quantity).toBe(fixture.fixedQuantity);
    expect(signals[0].currentPrice).toBe(250.23);
    expect(sendCalls[0]?.text).toMatch(/AAPL/);
    expect(result).toBeTruthy();
    // Machine-readable line for the Go comparison log.
    console.log('NODE_T1_AGGREGATE', JSON.stringify({
      action: signals[0].action,
      symbol: signals[0].symbol,
      quantity: signals[0].quantity,
      price: signals[0].currentPrice,
      ibs: signals[0].ibs,
      forceDryRun: signals[0].forceDryRun,
    }));
  });
});
