import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
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

afterEach(() => {
  purgeServerCache();
});

function stubPriceActualizationDeps({ watches, emaAlerts, fetched }) {
  process.env.MONITOR_LOG_PATH = path.join(os.tmpdir(), 'price-actualization-test.log');
  stubModule('src/config/index.js', {
    getApiConfig: () => ({ TELEGRAM_CHAT_ID: 'chat-1' }),
    PRICE_ACTUALIZATION_REQUEST_DELAY_MS: 0,
    PRICE_ACTUALIZATION_DELAY_JITTER_MS: 0,
    DATASETS_DIR: os.tmpdir(),
  });
  stubModule('src/services/settings.js', {
    readSettings: async () => ({ resultsRefreshProvider: 'finnhub', enablePostClosePriceActualization: true }),
  });
  stubModule('src/utils/helpers.js', {
    toSafeTicker: (value) => String(value || '').toUpperCase(),
  });
  stubModule('src/services/telegram.js', {
    telegramWatches: watches,
    sendTelegramMessage: async () => ({ ok: true }),
  });
  stubModule('src/services/emaAlerts.js', {
    listEmaAlerts: () => emaAlerts,
  });
  stubModule('src/services/datasets.js', {
    getDataset: (ticker) => ({ name: ticker, ticker, data: [], dateRange: { from: null, to: null } }),
    getDatasetMetadata: () => ({ dateRange: { to: '2026-03-30' } }),
    saveDataset: () => {},
  });
  stubModule('src/services/splits.js', {
    getTickerSplits: () => [],
    upsertTickerSplits: () => {},
  });
  stubModule('src/services/marketDataIntegrity.js', {
    formatIntegrityWarningBlock: () => '',
  });
  stubModule('src/services/dataIngestion.js', {
    fetchHistoricalMarketData: async (ticker) => {
      fetched.push(ticker);
      return { rows: [{ date: '2026-03-30', close: 1 }], splits: [] };
    },
    evaluateOhlcMergeIntegrity: ({ incomingRows }) => ({ mergedRows: incomingRows, warnings: [] }),
    sendDataIntegrityAlert: async () => {},
    normalizeSplitEvents: () => [],
  });
  stubModule('src/services/trades.js', {
    loadTradeHistory: async () => {},
    syncWatchesWithTradeState: () => ({ changes: [] }),
    getCurrentOpenTrade: () => null,
    isTradeHistoryLoaded: () => true,
  });
  stubModule('src/services/dates.js', {
    getETParts: () => ({ hh: 16, mm: 16, ss: 0 }),
    etKeyYMD: (value) => value?.key || '2026-03-31',
    previousTradingDayET: () => ({ key: '2026-03-30' }),
    getTradingSessionForDateET: () => ({ closeMin: 16 * 60, short: false }),
    isTradingDayByCalendarET: () => true,
    getCachedTradingCalendar: () => ({}),
  });
  stubModule('src/services/monitorConsistency.js', {
    reconcileMonitorState: () => ({ issues: [] }),
  });
}

describe('priceActualization monitored symbols', () => {
  it('includes EMA alert tickers that are not in telegram watches', async () => {
    purgeServerCache();
    const fetched = [];
    stubPriceActualizationDeps({
      watches: new Map(),
      emaAlerts: [{ symbol: 'TQQQ' }, { symbol: 'tqqq' }],
      fetched,
    });

    const { runPriceActualization, collectActualizationSymbols } = require(path.join(serverRoot, 'src/services/priceActualization.js'));

    expect(collectActualizationSymbols()).toEqual(['TQQQ']);

    const result = await runPriceActualization({ force: true, source: 'test' });
    expect(result.updated).toBe(true);
    expect(fetched).toEqual(['TQQQ']);
    expect(result.tickers).toEqual(['TQQQ']);
  });

  it('unions watches and EMA tickers without duplicates', () => {
    purgeServerCache();
    stubPriceActualizationDeps({
      watches: new Map([['AAPL', { symbol: 'AAPL' }], ['TQQQ', { symbol: 'TQQQ' }]]),
      emaAlerts: [{ symbol: 'TQQQ' }, { symbol: 'QQQ' }],
      fetched: [],
    });

    const { collectActualizationSymbols } = require(path.join(serverRoot, 'src/services/priceActualization.js'));
    expect(collectActualizationSymbols()).toEqual(['AAPL', 'TQQQ', 'QQQ']);
  });
});
