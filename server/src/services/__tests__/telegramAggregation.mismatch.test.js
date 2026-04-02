import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
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

describe('telegramAggregation mismatch handling', () => {
  it('reports monitor mismatch at T-1 instead of sending "Действий нет"', async () => {
    purgeServerCache();

    const sendCalls = [];
    const monitorLogs = [];
    const autotradeEvents = [];
    const telegramWatches = new Map([
      ['V', {
        symbol: 'V',
        highIBS: 0.75,
        lowIBS: 0.1,
        thresholdPct: 0.3,
        chatId: 'chat-1',
        entryPrice: 298.96,
        entryDate: '2026-03-18',
        entryIBS: 0.12,
        entryDecisionTime: '2026-03-18T19:59:00.000Z',
        currentTradeId: 'monitor-v',
        isOpenPosition: true,
        sent: {
          dateKey: null,
          warn10: false,
          confirm1: false,
          entryWarn10: false,
          entryConfirm1: false,
        },
      }],
    ]);

    const mismatchIssue = {
      code: 'monitor_trade_without_broker_position',
      severity: 'error',
      message: 'Monitor trade V is open while broker is flat. Manual monitor close is required.',
      symbol: 'V',
      monitorTradeId: 'monitor-v',
      brokerTradeId: null,
      autoFixable: false,
    };

    stubModule('src/config/index.js', {
      getApiConfig: () => ({ TELEGRAM_CHAT_ID: 'chat-1' }),
      DATASETS_DIR: repoRoot,
    });
    stubModule('src/services/settings.js', {
      readSettings: async () => ({ resultsRefreshProvider: 'finnhub' }),
    });
    stubModule('src/services/datasets.js', {
      getDataset: () => ({
        data: [{ date: '2026-03-30' }],
      }),
    });
    stubModule('src/utils/helpers.js', {
      toSafeTicker: (value) => String(value || '').toUpperCase(),
    });
    stubModule('src/providers/finnhub.js', {
      fetchTodayRangeAndQuote: async () => ({
        range: { low: 295, high: 305 },
        quote: { current: 302.16, low: 295, high: 305, open: 299.5, prevClose: 298.7 },
      }),
    });
    stubModule('src/services/telegram.js', {
      telegramWatches,
      aggregateSendState: new Map(),
      getAggregateState: () => ({ dateKey: '2026-03-31', t11Sent: false, t1Sent: false }),
      sendTelegramMessage: async (chatId, text) => {
        sendCalls.push({ chatId, text });
        return { ok: true };
      },
    });
    stubModule('src/services/trades.js', {
      syncWatchesWithTradeState: () => ({ openTrade: null, changes: [] }),
      getCurrentOpenTrade: () => ({
        id: 'monitor-v',
        symbol: 'V',
        entryDate: '2026-03-18',
        entryPrice: 298.96,
      }),
    });
    stubModule('src/services/autotrade.js', {
      executeWebullSignal: async () => {
        throw new Error('executeWebullSignal must not be called when mismatch blocks T-1');
      },
      appendAutotradeEvent: async (eventName, payload) => {
        autotradeEvents.push({ eventName, payload });
      },
    });
    stubModule('src/services/dates.js', {
      getETParts: () => ({ hh: 15, mm: 59, ss: 0 }),
      etKeyYMD: (value) => value?.key || '2026-03-31',
      previousTradingDayET: () => ({ key: '2026-03-30' }),
      getTradingSessionForDateET: () => ({ closeMin: 16 * 60, short: false }),
      isTradingDayByCalendarET: () => true,
      getCachedTradingCalendar: () => ({}),
    });
    stubModule('src/services/priceActualization.js', {
      refreshTickerAndCheckFreshness: async () => ({ fresh: true }),
      appendMonitorLog: async (lines) => {
        monitorLogs.push(lines);
      },
    });
    stubModule('src/services/monitorConsistency.js', {
      reconcileMonitorState: () => ({
        fetchedAt: '2026-03-31T19:59:00.000Z',
        openMonitorTrade: {
          id: 'monitor-v',
          symbol: 'V',
          status: 'open',
          entryDate: '2026-03-18',
          entryPrice: 298.96,
        },
        openBrokerTrade: null,
        issues: [mismatchIssue],
        proposedActions: [],
      }),
      getBlockingMonitorMismatch: () => mismatchIssue,
    });

    const { runTelegramAggregation } = require(path.join(serverRoot, 'src/services/telegramAggregation.js'));
    const result = await runTelegramAggregation(1, { test: true, forceSend: true, updateState: false });

    expect(result.sent).toBe(true);
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].text).toContain('Рассинхрон состояния');
    expect(sendCalls[0].text).toContain('Автозакрытие пропущено');
    expect(sendCalls[0].text).not.toContain('Действий нет');
    expect(monitorLogs.flat().join('\n')).toContain('monitor_mismatch');
    expect(autotradeEvents.map((item) => item.eventName)).toContain('t1_monitor_mismatch');
    expect(autotradeEvents.map((item) => item.eventName)).not.toContain('t1_signal_confirmed');
  });
});
