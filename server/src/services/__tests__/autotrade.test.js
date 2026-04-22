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
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'stonks-autotrade-'));
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

function loadAutotradeTestables() {
  purgeServerCache();
  const autotrade = require(path.join(serverRoot, 'src/services/autotrade.js'));
  return {
    ...autotrade.__testables,
    sanitizeAutoTradingConfig: autotrade.sanitizeAutoTradingConfig,
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

describe('autotrade buying power sizing', () => {
  it('uses the standard safe mode with a 2.2% reserve by default', () => {
    cleanupEnv = createTempEnv();
    const {
      computeOrderQuantity,
      getEntryBuyingPowerHeadroomFactor,
      resolveEntryBalanceSizing,
      DEFAULT_ENTRY_CAPITAL_MODE,
    } = loadAutotradeTestables();

    const autoTrading = {
      entrySizingMode: 'balance',
      allowFractionalShares: false,
      entryCapitalMode: DEFAULT_ENTRY_CAPITAL_MODE,
    };

    const balancePayload = {
      data: {
        account_currency_assets: [
          {
            currency: 'USD',
            day_buying_power: 502.27,
            cash_balance: 502.27,
            net_liquidation_value: 502.27,
          },
        ],
      },
    };
    const sizing = resolveEntryBalanceSizing(balancePayload, autoTrading);

    const quantity = computeOrderQuantity(250.23, autoTrading, sizing.entryFunds, {
      buyingPowerHeadroomFactor: getEntryBuyingPowerHeadroomFactor(autoTrading),
    });

    expect(quantity).toBe(1);
  });

  it('supports the exact 100% mode without reserve', () => {
    cleanupEnv = createTempEnv();
    const {
      computeOrderQuantity,
      getEntryBuyingPowerHeadroomFactor,
      resolveEntryBalanceSizing,
    } = loadAutotradeTestables();

    const autoTrading = {
      entrySizingMode: 'balance',
      allowFractionalShares: false,
      entryCapitalMode: 'cash_100',
    };
    const balancePayload = {
      data: {
        account_currency_assets: [
          {
            currency: 'USD',
            day_buying_power: 502.27,
            cash_balance: 502.27,
            net_liquidation_value: 502.27,
          },
        ],
      },
    };
    const sizing = resolveEntryBalanceSizing(balancePayload, autoTrading);

    const quantity = computeOrderQuantity(250.23, autoTrading, sizing.entryFunds, {
      buyingPowerHeadroomFactor: getEntryBuyingPowerHeadroomFactor(autoTrading),
    });

    expect(quantity).toBe(2);
  });

  it('uses cash balance as the base for margin profiles and clamps to broker buying power', () => {
    cleanupEnv = createTempEnv();
    const {
      computeOrderQuantity,
      getEntryBuyingPowerHeadroomFactor,
      resolveEntryBalanceSizing,
    } = loadAutotradeTestables();

    const autoTrading = {
      entrySizingMode: 'balance',
      allowFractionalShares: false,
      entryCapitalMode: 'margin_200',
    };
    const balancePayload = {
      data: {
        account_currency_assets: [
          {
            currency: 'USD',
            day_buying_power: 1000,
            cash_balance: 500,
            net_liquidation_value: 500,
          },
        ],
      },
    };
    const sizing = resolveEntryBalanceSizing(balancePayload, autoTrading);

    const quantity = computeOrderQuantity(250, autoTrading, sizing.entryFunds, {
      buyingPowerHeadroomFactor: getEntryBuyingPowerHeadroomFactor(autoTrading),
    });

    expect(sizing.entryFunds).toBe(1000);
    expect(quantity).toBe(4);
  });

  it('accepts webull as an autotrade quote provider', () => {
    cleanupEnv = createTempEnv();
    const { sanitizeAutoTradingConfig } = loadAutotradeTestables();

    const next = sanitizeAutoTradingConfig({ provider: 'webull' }, { provider: 'finnhub' });

    expect(next.provider).toBe('webull');
  });

  it('accepts the new entry capital mode in config sanitization', () => {
    cleanupEnv = createTempEnv();
    const { sanitizeAutoTradingConfig } = loadAutotradeTestables();

    const next = sanitizeAutoTradingConfig({ entryCapitalMode: 'margin_150' }, { entryCapitalMode: 'standard_safe' });

    expect(next.entryCapitalMode).toBe('margin_150');
  });
});
