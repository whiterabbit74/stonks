import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
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

function stubModule(relativePathFromServerRoot, exports) {
  const fullPath = path.join(serverRoot, relativePathFromServerRoot);
  require.cache[fullPath] = {
    id: fullPath,
    filename: fullPath,
    loaded: true,
    exports,
  };
}

function withTempDb() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ema-alerts-'));
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    DB_DIR: process.env.DB_DIR,
    DB_FILE: process.env.DB_FILE,
  };
  process.env.NODE_ENV = 'test';
  process.env.DB_DIR = tempDir;
  process.env.DB_FILE = path.join(tempDir, 'trading.db');
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

function loadEmaAlerts({ currentPrice }) {
  purgeServerCache();
  const history = Array.from({ length: 20 }, (_, index) => ({
    date: `2024-01-${String(index + 1).padStart(2, '0')}`,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1000,
  }));

  stubModule('src/services/datasets.js', {
    getDataset: () => ({
      adjustedForSplits: true,
      data: history,
    }),
  });
  stubModule('src/providers/finnhub.js', {
    fetchTodayRangeAndQuote: async () => ({
      quote: { current: currentPrice },
    }),
  });
  stubModule('src/utils/helpers.js', {
    parseNonNegativeNumber: (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
    },
    toSafeTicker: (value) => String(value || '').trim().toUpperCase(),
  });

  return require(path.join(serverRoot, 'src/services/emaAlerts.js'));
}

afterEach(() => {
  try {
    require(path.join(serverRoot, 'src/db/index.js')).closeDb();
  } catch {
    // ignore
  }
  purgeServerCache();
});

describe('EMA cycle alerts', () => {
  it('stores a 15-40 range as a buy/sell cycle instead of a direction-only alert', () => {
    const env = withTempDb();
    try {
      const emaAlerts = loadEmaAlerts({ currentPrice: 115 });
      const alert = emaAlerts.createEmaAlert({
        symbol: 'tqqq',
        emaPeriod: 20,
        buyLevelPct: 15,
        sellLevelPct: 40,
        nextAction: 'buy',
        thresholdPct: 0.5,
      });

      expect(alert).toMatchObject({
        symbol: 'TQQQ',
        emaPeriod: 20,
        buyLevelPct: 15,
        sellLevelPct: 40,
        nextAction: 'buy',
        direction: 'below',
        levelPct: 15,
      });
    } finally {
      env.restore();
    }
  });

  it('fires buy once, flips to sell, and does not repeat buy while waiting for sell', async () => {
    const env = withTempDb();
    try {
      let emaAlerts = loadEmaAlerts({ currentPrice: 115 });
      const alert = emaAlerts.createEmaAlert({
        symbol: 'TQQQ',
        emaPeriod: 20,
        buyLevelPct: 15,
        sellLevelPct: 40,
        nextAction: 'buy',
        thresholdPct: 0.5,
      });

      let [buySignal] = await emaAlerts.evaluateEmaAlerts();
      expect(buySignal).toMatchObject({
        id: alert.id,
        reached: true,
        action: 'buy',
        activeLevelPct: 15,
        nextAction: 'buy',
      });

      emaAlerts.markEmaAlertsTriggered([buySignal], '2024-02-01T20:59:00.000Z');
      expect(emaAlerts.getEmaAlert(alert.id)).toMatchObject({
        nextAction: 'sell',
        lastTriggeredAction: 'buy',
      });

      emaAlerts = loadEmaAlerts({ currentPrice: 115 });
      const [waitingForSell] = await emaAlerts.evaluateEmaAlerts();
      expect(waitingForSell).toMatchObject({
        reached: false,
        action: 'sell',
        activeLevelPct: 40,
        nextAction: 'sell',
      });
    } finally {
      env.restore();
    }
  });
});
