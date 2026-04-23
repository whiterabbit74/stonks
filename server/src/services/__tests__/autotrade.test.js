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

function loadManualExitContext() {
  purgeServerCache();
  const telegram = require(path.join(serverRoot, 'src/services/telegram.js'));
  const trades = require(path.join(serverRoot, 'src/services/trades.js'));
  const brokerTrades = require(path.join(serverRoot, 'src/services/brokerTrades.js'));
  const autotrade = require(path.join(serverRoot, 'src/services/autotrade.js'));
  const dbModule = require(path.join(serverRoot, 'src/db/index.js'));

  telegram.telegramWatches.clear();
  trades.setTelegramWatches(telegram.telegramWatches, () => {});

  return {
    telegram,
    trades,
    brokerTrades,
    finalizeTrackedTrade: autotrade.__testables.finalizeTrackedTrade,
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

describe('autotrade execution finalization', () => {
  it('closes a manual monitor position when a Webull exit fills without a local broker entry', async () => {
    cleanupEnv = createTempEnv();
    const context = loadManualExitContext();
    cleanupDb = context.dbModule;
    createWatch(context.telegram, 'AMZN');

    const manualTrade = context.trades.createManualTrade({
      symbol: 'AMZN',
      entryDate: '2026-04-17',
      entryPrice: 250.23,
      entryIBS: 0.12,
      quantity: 2,
      notes: 'manual Webull entry',
    });

    expect(context.brokerTrades.getCurrentOpenBrokerTrade()).toBeNull();

    const finalized = await context.finalizeTrackedTrade({
      action: 'exit',
      symbol: 'AMZN',
      price: 255.32,
      ibs: 0.881,
      decisionTime: '2026-04-23T19:59:49.000Z',
      dateKey: '2026-04-23',
      source: 'telegram_t1_exit',
      clientOrderId: 'manual-exit-client',
      brokerOrderId: 'manual-exit-order',
      filledQty: 2,
      quantity: 2,
    });

    expect(finalized).toMatchObject({
      id: manualTrade.id,
      status: 'closed',
      exitPrice: 255.32,
      exitIBS: 0.881,
      clientOrderId: 'manual-exit-client',
      brokerOrderId: 'manual-exit-order',
      filledQty: 2,
    });
    expect(context.trades.getCurrentOpenTrade()).toBeNull();
    expect(context.telegram.telegramWatches.get('AMZN')).toMatchObject({
      isOpenPosition: false,
      currentTradeId: null,
      entryPrice: null,
    });
  });
});
