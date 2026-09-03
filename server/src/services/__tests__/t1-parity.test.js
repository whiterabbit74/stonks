import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, 'server');
const require = createRequire(import.meta.url);

function purgeServerCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverRoot)) {
      delete require.cache[key];
    }
  }
}

function createTempEnv() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stonks-t1-parity-'));
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

const { isIbsEntrySignal, isIbsExitSignal } = require(path.join(serverRoot, 'src/utils/ibsSignals.js'));

// Same watches/quotes as go/internal/live.TestT1DryRunSameWatchesAsNode.
const quotes = [
  { symbol: 'AAPL', ibs: 0.05, price: 8.2 },
  { symbol: 'AMZN', ibs: 0.5, price: 10 },
  { symbol: 'MSFT', ibs: 0.5, price: 10 },
  { symbol: 'V', ibs: 0.5, price: 10 },
];

let cleanupEnv = null;
afterEach(() => {
  purgeServerCache();
  if (cleanupEnv) {
    cleanupEnv.restore();
    cleanupEnv = null;
  }
});

describe('T-1 dry-run oracle vs Go same watches', () => {
  it('picks the lowest IBS strictly below 0.10 as the entry', () => {
    const low = 0.1;
    const high = 0.75;
    let best = null;
    for (const q of quotes) {
      expect(isIbsExitSignal(q.ibs, high)).toBe(false);
      if (isIbsEntrySignal(q.ibs, low) && (!best || q.ibs < best.ibs)) {
        best = q;
      }
    }
    expect(best?.symbol).toBe('AAPL');
    expect(best?.ibs).toBe(0.05);
  });

  it('sizes the AAPL entry to 1 share in quantity mode', () => {
    cleanupEnv = createTempEnv();
    purgeServerCache();
    const autotrade = require(path.join(serverRoot, 'src/services/autotrade.js'));
    const quantity = autotrade.__testables.computeOrderQuantity(
      8.2,
      { entrySizingMode: 'quantity', fixedQuantity: 1, allowFractionalShares: false },
      null,
      {},
    );
    expect(quantity).toBe(1);
  });
});
