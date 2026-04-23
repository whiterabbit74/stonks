import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const serverRequire = createRequire(path.join(serverRoot, 'server.js'));
const require = createRequire(import.meta.url);

function purgeServerCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverRoot)) {
      delete require.cache[key];
    }
  }
}

function createTempEnv() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stonks-monitor-'));
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
    tempDir,
    restore() {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value == null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function loadTestContext() {
  purgeServerCache();

  const telegram = require(path.join(serverRoot, 'src/services/telegram.js'));
  const trades = require(path.join(serverRoot, 'src/services/trades.js'));
  const brokerTrades = require(path.join(serverRoot, 'src/services/brokerTrades.js'));
  const monitorConsistency = require(path.join(serverRoot, 'src/services/monitorConsistency.js'));
  const monitorRoutes = require(path.join(serverRoot, 'src/routes/monitor.js'));
  const tradesRoutes = require(path.join(serverRoot, 'src/routes/trades.js'));
  const dbModule = require(path.join(serverRoot, 'src/db/index.js'));

  telegram.telegramWatches.clear();
  trades.setTelegramWatches(telegram.telegramWatches, () => {});

  return {
    telegram,
    trades,
    brokerTrades,
    monitorConsistency,
    monitorRoutes,
    tradesRoutes,
    dbModule,
  };
}

function createWatch(telegram, symbol) {
  telegram.telegramWatches.set(symbol, {
    symbol,
    highIBS: 0.75,
    lowIBS: 0.1,
    thresholdPct: 0.3,
    chatId: 'test-chat',
    entryPrice: null,
    entryDate: null,
    entryIBS: null,
    entryDecisionTime: null,
    currentTradeId: null,
    isOpenPosition: false,
    sent: {
      dateKey: null,
      warn10: false,
      confirm1: false,
      entryWarn10: false,
      entryConfirm1: false,
    },
  });
}

async function createTestServer(router) {
  const express = serverRequire('express');
  const app = express();
  app.use(express.json());
  app.use('/api', router);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    raw: server,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

async function requestJson(server, method, requestPath, body) {
  const port = server.address().port;
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: payload
        ? {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          }
        : undefined,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

let cleanupEnv = null;
let cleanupDb = null;

afterEach(() => {
  if (cleanupDb) {
    cleanupDb.closeDb();
    cleanupDb = null;
  }
  purgeServerCache();
  if (cleanupEnv) {
    cleanupEnv.restore();
    cleanupEnv = null;
  }
});

describe('monitor / broker state integration', () => {
  it('creates a broker-linked monitor trade on broker entry and closes it on broker exit', () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'AAPL');

    const brokerOpen = context.brokerTrades.recordBrokerEntry({
      symbol: 'AAPL',
      price: 100,
      ibs: 0.08,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
      clientOrderId: 'client-entry',
      brokerOrderId: 'broker-entry',
      filledQty: 1,
      quantity: 1,
    });

    const monitorOpen = context.trades.upsertMonitorTradeFromBrokerTrade(brokerOpen);
    expect(monitorOpen).toMatchObject({
      symbol: 'AAPL',
      status: 'open',
      linkedBrokerTradeId: brokerOpen.id,
      entryPrice: 100,
    });
    expect(context.telegram.telegramWatches.get('AAPL')).toMatchObject({
      isOpenPosition: true,
      currentTradeId: monitorOpen.id,
      entryPrice: 100,
    });

    const brokerClosed = context.brokerTrades.recordBrokerExit({
      symbol: 'AAPL',
      price: 101.25,
      ibs: 0.81,
      decisionTime: '2026-03-19T19:59:00.000Z',
      dateKey: '2026-03-19',
      clientOrderId: 'client-exit',
      brokerOrderId: 'broker-exit',
      filledQty: 1,
    });

    const monitorClosed = context.trades.closeMonitorTradeFromBrokerTrade(brokerClosed);
    expect(monitorClosed).toMatchObject({
      id: monitorOpen.id,
      status: 'closed',
      exitPrice: 101.25,
      linkedBrokerTradeId: brokerOpen.id,
    });
    expect(context.trades.getCurrentOpenTrade()).toBeNull();
    expect(context.telegram.telegramWatches.get('AAPL')).toMatchObject({
      isOpenPosition: false,
      currentTradeId: null,
      entryPrice: null,
    });
  });

  it('reconcile preview/apply closes a legacy auto monitor trade from broker history', () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'V');

    const legacyMonitor = context.trades.recordTradeEntry({
      symbol: 'V',
      price: 298.96,
      ibs: 0.12,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
    });

    context.brokerTrades.recordBrokerEntry({
      symbol: 'V',
      price: 298.96,
      ibs: 0.12,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
      clientOrderId: 'legacy-entry',
      brokerOrderId: 'legacy-entry-order',
      filledQty: 1,
      quantity: 1,
    });
    const closedBroker = context.brokerTrades.recordBrokerExit({
      symbol: 'V',
      price: 299.38,
      ibs: 0.825,
      decisionTime: '2026-03-30T19:59:00.000Z',
      dateKey: '2026-03-30',
      clientOrderId: 'legacy-exit',
      brokerOrderId: 'legacy-exit-order',
      filledQty: 1,
    });

    const preview = context.monitorConsistency.reconcileMonitorState();
    expect(preview.issues.map((issue) => issue.code)).toContain('legacy_monitor_trade_can_close_from_broker_history');
    expect(preview.proposedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'close_legacy_monitor_trade',
          autoApplicable: true,
          monitorTradeId: legacyMonitor.id,
          brokerTradeId: closedBroker.id,
        }),
      ]),
    );

    const applied = context.monitorConsistency.reconcileMonitorState({ apply: true });
    expect(applied.appliedActions).toHaveLength(1);
    expect(context.trades.getCurrentOpenTrade()).toBeNull();
    expect(context.trades.getTradeById(legacyMonitor.id)).toMatchObject({
      status: 'closed',
      exitPrice: 299.38,
      linkedBrokerTradeId: closedBroker.id,
    });
  });

  it('keeps a manual monitor-only open trade active without creating a blocking mismatch', () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'MSFT');

    const manualTrade = context.trades.createManualTrade({
      symbol: 'MSFT',
      entryDate: '2026-03-18',
      entryPrice: 371.86,
      notes: 'manual monitor open',
      quantity: 1,
    });

    const result = context.monitorConsistency.reconcileMonitorState({ apply: true });
    expect(result.appliedActions).toHaveLength(0);
    expect(result.issues).toEqual([]);
    expect(context.monitorConsistency.getBlockingMonitorMismatch(result)).toBeNull();
    expect(context.trades.getTradeById(manualTrade.id)).toMatchObject({
      status: 'open',
      linkedBrokerTradeId: null,
    });
    expect(context.telegram.telegramWatches.get('MSFT')).toMatchObject({
      isOpenPosition: true,
      currentTradeId: manualTrade.id,
      entryPrice: 371.86,
    });
  });
});

describe('monitor routes', () => {
  it('POST /api/trades creates a manual open monitor trade and syncs watch projection', async () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'AAPL');

    const server = await createTestServer(context.tradesRoutes);
    try {
      const response = await requestJson(server.raw, 'POST', '/api/trades', {
        symbol: 'AAPL',
        entryDate: '2026-04-01',
        entryPrice: 198.42,
        entryIBS: 0.14,
        quantity: 3,
        notes: 'manual monitor correction',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        symbol: 'AAPL',
        status: 'open',
        entryDate: '2026-04-01',
        entryPrice: 198.42,
        entryIBS: 0.14,
        quantity: 3,
        source: 'manual',
      });
      expect(context.telegram.telegramWatches.get('AAPL')).toMatchObject({
        isOpenPosition: true,
        currentTradeId: response.body.id,
        entryPrice: 198.42,
      });
    } finally {
      await server.close();
    }
  });

  it('POST /api/trades rejects manual open trades for tickers outside monitoring', async () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;

    const server = await createTestServer(context.tradesRoutes);
    try {
      const response = await requestJson(server.raw, 'POST', '/api/trades', {
        symbol: 'TSLA',
        entryDate: '2026-04-01',
        entryPrice: 250.12,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Cannot open manual trade for TSLA: add this ticker to monitoring first',
      });
    } finally {
      await server.close();
    }
  });

  it('PATCH /api/trades/:id edits an open manual monitor trade and syncs watch projection', async () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'AMZN');

    const trade = context.trades.createManualTrade({
      symbol: 'AMZN',
      entryDate: '2026-04-17',
      entryPrice: 250.23,
      entryIBS: 0.12,
      quantity: 2,
      notes: 'manual entry',
    });

    const server = await createTestServer(context.tradesRoutes);
    try {
      const response = await requestJson(server.raw, 'PATCH', `/api/trades/${trade.id}`, {
        entryDate: '2026-04-18',
        entryPrice: 251.11,
        entryIBS: 0.18,
        quantity: 3,
        notes: 'corrected entry',
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: trade.id,
        status: 'open',
        entryDate: '2026-04-18',
        entryPrice: 251.11,
        entryIBS: 0.18,
        quantity: 3,
        notes: 'corrected entry',
      });
      expect(context.telegram.telegramWatches.get('AMZN')).toMatchObject({
        isOpenPosition: true,
        currentTradeId: trade.id,
        entryPrice: 251.11,
        entryDate: '2026-04-18',
        entryIBS: 0.18,
      });
    } finally {
      await server.close();
    }
  });

  it('POST /api/trades/:id/close-monitor closes a monitor-only trade and clears watch projection', async () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'NVDA');

    const trade = context.trades.createManualTrade({
      symbol: 'NVDA',
      entryDate: '2026-04-01',
      entryPrice: 120.5,
      quantity: 1,
    });

    const server = await createTestServer(context.tradesRoutes);
    try {
      const response = await requestJson(server.raw, 'POST', `/api/trades/${trade.id}/close-monitor`, {
        exitDate: '2026-04-02',
        exitPrice: 122.75,
        exitIBS: 0.84,
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: trade.id,
        status: 'closed',
        exitPrice: 122.75,
        exitIBS: 0.84,
      });
      expect(context.telegram.telegramWatches.get('NVDA')).toMatchObject({
        isOpenPosition: false,
        currentTradeId: null,
      });
    } finally {
      await server.close();
    }
  });

  it('GET /api/monitor/consistency returns issues for legacy reconcile candidates', async () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'V');

    context.trades.recordTradeEntry({
      symbol: 'V',
      price: 298.96,
      ibs: 0.12,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
    });
    context.brokerTrades.recordBrokerEntry({
      symbol: 'V',
      price: 298.96,
      ibs: 0.12,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
      clientOrderId: 'legacy-entry',
      brokerOrderId: 'legacy-entry-order',
      filledQty: 1,
      quantity: 1,
    });
    context.brokerTrades.recordBrokerExit({
      symbol: 'V',
      price: 299.38,
      ibs: 0.825,
      decisionTime: '2026-03-30T19:59:00.000Z',
      dateKey: '2026-03-30',
      clientOrderId: 'legacy-exit',
      brokerOrderId: 'legacy-exit-order',
      filledQty: 1,
    });

    const server = await createTestServer(context.monitorRoutes);
    try {
      const response = await requestJson(server.raw, 'GET', '/api/monitor/consistency');
      expect(response.status).toBe(200);
      expect(response.body.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'legacy_monitor_trade_can_close_from_broker_history',
            autoFixable: true,
          }),
        ]),
      );
      expect(response.body.proposedActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'close_legacy_monitor_trade',
            autoApplicable: true,
          }),
        ]),
      );
    } finally {
      await server.close();
    }
  });

  it('POST /api/monitor/reconcile applies a legacy reconcile candidate', async () => {
    cleanupEnv = createTempEnv();
    const context = loadTestContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'V');

    const openTrade = context.trades.recordTradeEntry({
      symbol: 'V',
      price: 298.96,
      ibs: 0.12,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
    });
    context.brokerTrades.recordBrokerEntry({
      symbol: 'V',
      price: 298.96,
      ibs: 0.12,
      decisionTime: '2026-03-18T19:59:00.000Z',
      dateKey: '2026-03-18',
      source: 'auto',
      clientOrderId: 'legacy-entry',
      brokerOrderId: 'legacy-entry-order',
      filledQty: 1,
      quantity: 1,
    });
    context.brokerTrades.recordBrokerExit({
      symbol: 'V',
      price: 299.38,
      ibs: 0.825,
      decisionTime: '2026-03-30T19:59:00.000Z',
      dateKey: '2026-03-30',
      clientOrderId: 'legacy-exit',
      brokerOrderId: 'legacy-exit-order',
      filledQty: 1,
    });

    const server = await createTestServer(context.monitorRoutes);
    try {
      const response = await requestJson(server.raw, 'POST', '/api/monitor/reconcile', { mode: 'apply' });
      expect(response.status).toBe(200);
      expect(response.body.mode).toBe('apply');
      expect(response.body.appliedActions).toHaveLength(1);
      expect(response.body.openMonitorTrade).toBeNull();
      expect(context.trades.getTradeById(openTrade.id)).toMatchObject({
        status: 'closed',
      });
    } finally {
      await server.close();
    }
  });
});
