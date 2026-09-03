import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const fixture = JSON.parse(
  readFileSync(path.join(repoRoot, 'go/internal/live/testdata/t1-parity-quotes.json'), 'utf8'),
);

function ibsOf(q) {
  return (q.current - q.low) / (q.high - q.low);
}

let cleanupEnv = null;
afterEach(() => {
  purgeServerCache();
  if (cleanupEnv) {
    cleanupEnv.restore();
    cleanupEnv = null;
  }
});

describe('T-1 dry-run oracle vs Go same watches/quotes', () => {
  it('picks the lowest IBS strictly below lowIBS as the entry', () => {
    const low = fixture.lowIBS;
    const high = fixture.highIBS;
    let best = null;
    for (const q of fixture.quotes) {
      const ibs = ibsOf(q);
      expect(isIbsExitSignal(ibs, high)).toBe(false);
      if (isIbsEntrySignal(ibs, low) && (!best || ibs < best.ibs)) {
        best = { symbol: q.symbol, ibs, price: q.current };
      }
    }
    expect(best?.symbol).toBe('AAPL');
    expect(best?.ibs).toBeCloseTo((250.23 - 247.5) / (297.5 - 247.5), 6);
  });

  it('sizes the AAPL entry to fixedQuantity shares', () => {
    cleanupEnv = createTempEnv();
    purgeServerCache();
    const autotrade = require(path.join(serverRoot, 'src/services/autotrade.js'));
    const aapl = fixture.quotes.find((q) => q.symbol === 'AAPL');
    const quantity = autotrade.__testables.computeOrderQuantity(
      aapl.current,
      {
        entrySizingMode: fixture.entrySizingMode,
        fixedQuantity: fixture.fixedQuantity,
        allowFractionalShares: false,
      },
      null,
      {},
    );
    expect(quantity).toBe(fixture.fixedQuantity);
  });
});

