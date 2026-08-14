import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const require = createRequire(import.meta.url);

function purgeServerCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverRoot)) delete require.cache[key];
  }
}

function createTempEnv() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stonks-webull-token-'));
  const dataDir = path.join(tempDir, 'datasets');
  const dbDir = path.join(tempDir, 'db');
  const stateDir = path.join(tempDir, 'state');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(dbDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  for (const name of ['settings.json', 'splits.json', 'telegram-watches.json', 'trade-history.json']) {
    writeFileSync(path.join(stateDir, name), name === 'telegram-watches.json' || name === 'trade-history.json' ? '[]' : '{}');
  }

  const nextEnv = {
    NODE_ENV: 'test',
    DATASETS_DIR: dataDir,
    DB_DIR: dbDir,
    DB_FILE: path.join(dbDir, 'trading.db'),
    SETTINGS_FILE: path.join(stateDir, 'settings.json'),
    SPLITS_FILE: path.join(stateDir, 'splits.json'),
    WATCHES_FILE: path.join(stateDir, 'telegram-watches.json'),
    TRADE_HISTORY_FILE: path.join(stateDir, 'trade-history.json'),
    WEBULL_RAW_LOG_PATH: path.join(dataDir, 'webull-raw.log'),
    WEBULL_APP_KEY: 'test-app-key',
    WEBULL_APP_SECRET: 'test-app-secret',
    WEBULL_ACCESS_TOKEN: '',
    WEBULL_ACCOUNT_ID: 'test-account',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
  };
  const previous = Object.fromEntries(Object.keys(nextEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, nextEnv);

  return {
    restore() {
      for (const [key, value] of Object.entries(previous)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function installWebullClientStub(stub) {
  const modulePath = require.resolve(path.join(serverRoot, 'src/services/webullClient.js'));
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: stub,
  };
}

let cleanupEnv = null;
let cleanupDb = null;

afterEach(() => {
  vi.useRealTimers();
  if (cleanupDb) cleanupDb.closeDb();
  cleanupDb = null;
  purgeServerCache();
  if (cleanupEnv) cleanupEnv.restore();
  cleanupEnv = null;
});

describe('Webull token lifecycle', () => {
  it('uses a verified SQLite token even when its old expiry metadata has passed', () => {
    cleanupEnv = createTempEnv();
    const tokens = require(path.join(serverRoot, 'src/services/webullToken.js'));
    cleanupDb = require(path.join(serverRoot, 'src/db/index.js'));
    const client = require(path.join(serverRoot, 'src/services/webullClient.js'));

    tokens.saveToken({
      token: 'verified-token',
      expiresAt: Date.parse('2020-01-01T00:00:00.000Z'),
      status: 'NORMAL',
    });

    expect(client.buildWebullRuntimeConfig().accessToken).toBe('verified-token');

    tokens.saveToken({ token: 'unknown-token', status: 'UNKNOWN' });
    expect(client.buildWebullRuntimeConfig().accessToken).toBe('');
  });

  it('does not invent a 15-day expiry and atomically stores the refreshed token metadata', () => {
    cleanupEnv = createTempEnv();
    const tokens = require(path.join(serverRoot, 'src/services/webullToken.js'));
    cleanupDb = require(path.join(serverRoot, 'src/db/index.js'));
    tokens.saveToken({ token: 'pending-token', status: 'PENDING' });
    expect(tokens.getStoredToken().expires_at).toBeNull();

    const expires = Date.parse('2030-01-01T00:00:00.000Z');
    tokens.updateCheckStatus('NORMAL', expires, 'rotated-token');
    expect(tokens.getStoredToken()).toMatchObject({
      token: 'rotated-token',
      last_check_status: 'NORMAL',
      expires_at: '2030-01-01T00:00:00.000Z',
    });
  });

  it('keeps a PENDING token out of authenticated requests but allows it to be checked', async () => {
    cleanupEnv = createTempEnv();
    const tokens = require(path.join(serverRoot, 'src/services/webullToken.js'));
    cleanupDb = require(path.join(serverRoot, 'src/db/index.js'));
    tokens.saveToken({ token: 'pending-token', status: 'PENDING' });

    const checkAccessToken = vi.fn(async () => ({ data: { token: 'rotated-token', status: 'NORMAL', expires: Date.parse('2030-01-01T00:00:00.000Z') } }));
    const getAccountBalance = vi.fn(async () => ({ data: {} }));
    installWebullClientStub({
      checkAccessToken,
      getAccountBalance,
      getAccountList: vi.fn(),
      buildWebullRuntimeConfig: () => ({ accountId: 'test-account' }),
    });

    const result = await tokens.runDailyTokenHealthCheck();
    expect(result.status).toBe('NORMAL');
    expect(checkAccessToken).toHaveBeenCalledWith('pending-token');
    expect(getAccountBalance).toHaveBeenCalledWith('test-account');

    const stored = tokens.getStoredToken();
    expect(stored.last_check_status).toBe('NORMAL');
    expect(stored.token).toBe('rotated-token');
    expect(stored.expires_at).toBe('2030-01-01T00:00:00.000Z');
    expect(stored.last_health_check_date).toBeTruthy();
  });

  it('keeps the valid environment token alive when SQLite contains an unverified token', async () => {
    cleanupEnv = createTempEnv();
    process.env.WEBULL_ACCESS_TOKEN = 'environment-token';
    const tokens = require(path.join(serverRoot, 'src/services/webullToken.js'));
    cleanupDb = require(path.join(serverRoot, 'src/db/index.js'));
    tokens.saveToken({ token: 'pending-token', status: 'PENDING' });

    const checkAccessToken = vi.fn(async () => ({ data: { status: 'NORMAL' } }));
    const getAccountBalance = vi.fn(async () => ({ data: {} }));
    installWebullClientStub({
      checkAccessToken,
      getAccountBalance,
      getAccountList: vi.fn(),
      buildWebullRuntimeConfig: () => ({ accountId: 'test-account' }),
    });

    await expect(tokens.runDailyTokenHealthCheck()).resolves.toMatchObject({ status: 'NORMAL' });
    expect(checkAccessToken).toHaveBeenCalledWith('environment-token');
    expect(getAccountBalance).toHaveBeenCalledWith('test-account');
    expect(tokens.getStoredToken().last_check_status).toBe('PENDING');
  });

  it('retries failed authenticated keep-alive after a bounded delay instead of marking the day complete', async () => {
    cleanupEnv = createTempEnv();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T16:00:00.000Z'));
    const tokens = require(path.join(serverRoot, 'src/services/webullToken.js'));
    cleanupDb = require(path.join(serverRoot, 'src/db/index.js'));
    tokens.saveToken({ token: 'verified-token', status: 'NORMAL' });

    installWebullClientStub({
      checkAccessToken: vi.fn(async () => ({ data: { status: 'NORMAL' } })),
      getAccountBalance: vi.fn(async () => { throw new Error('temporary Webull outage'); }),
      getAccountList: vi.fn(),
      buildWebullRuntimeConfig: () => ({ accountId: 'test-account' }),
    });

    await expect(tokens.runDailyTokenHealthCheck()).resolves.toEqual({ error: true });
    expect(tokens.getStoredToken().last_health_check_date).toBeNull();
    await expect(tokens.runDailyTokenHealthCheck()).resolves.toEqual({ skipped: true, reason: 'retry_backoff' });

    vi.advanceTimersByTime(15 * 60 * 1000);
    await expect(tokens.runDailyTokenHealthCheck()).resolves.toEqual({ error: true });
  });
});
