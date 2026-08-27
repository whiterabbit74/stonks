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

async function runT11WithEma({
  sendCalls,
  emaAlert,
  openTrade = null,
  consistencySnapshot = { issues: [] },
  quote = { current: 105, low: 100, high: 110, open: 102, prevClose: 101 },
  range = { low: 100, high: 110 },
}) {
  purgeServerCache();
  const telegramWatches = new Map([
    ['AAPL', {
      symbol: 'AAPL',
      highIBS: 0.75,
      lowIBS: 0.1,
      thresholdPct: 0.3,
      chatId: 'chat-1',
      sent: {
        dateKey: null,
        warn10: false,
        confirm1: false,
        entryWarn10: false,
        entryConfirm1: false,
      },
    }],
  ]);

  stubModule('src/config/index.js', {
    getApiConfig: () => ({ TELEGRAM_CHAT_ID: 'chat-1' }),
    DATASETS_DIR: repoRoot,
  });
  stubModule('src/services/settings.js', {
    readSettings: async () => ({ resultsRefreshProvider: 'twelve_data' }),
  });
  stubModule('src/services/datasets.js', {
    getDataset: () => ({ data: [{ date: '2026-03-30' }] }),
  });
  stubModule('src/utils/helpers.js', {
    toSafeTicker: (value) => String(value || '').toUpperCase(),
  });
  stubModule('src/providers/quote.js', {
    fetchTodayRangeAndQuote: async () => ({
      range,
      quote,
      source: 'twelve_data',
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
    syncWatchesWithTradeState: () => ({ openTrade, changes: [] }),
    getCurrentOpenTrade: () => openTrade,
  });
  stubModule('src/services/autotrade.js', {
    executeWebullSignal: async () => {
      throw new Error('executeWebullSignal should not be called from T-11 overview');
    },
    appendAutotradeEvent: async () => {},
  });
  stubModule('src/services/dates.js', {
    getETParts: () => ({ hh: 15, mm: 49, ss: 0 }),
    etKeyYMD: (value) => value?.key || '2026-03-31',
    previousTradingDayET: () => ({ key: '2026-03-30' }),
    getTradingSessionForDateET: () => ({ closeMin: 16 * 60, short: false }),
    isTradingDayByCalendarET: () => true,
    getCachedTradingCalendar: () => ({}),
  });
  stubModule('src/services/priceActualization.js', {
    refreshTickerAndCheckFreshness: async () => ({ fresh: true }),
    appendMonitorLog: async () => {},
  });
  stubModule('src/services/monitorConsistency.js', {
    reconcileMonitorState: () => consistencySnapshot,
    getBlockingMonitorMismatch: () => null,
  });
  stubModule('src/services/splits.js', {
    getTickerSplits: () => [],
  });
  stubModule('src/services/emaAlerts.js', {
    listEmaAlerts: () => [{ symbol: emaAlert.symbol, emaPeriod: emaAlert.emaPeriod, enabled: true }],
    evaluateEmaAlerts: async () => [emaAlert],
    markEmaAlertsTriggered: () => [],
    recordEmaInfoSide: () => null,
    recordEmaInfoSides: () => [],
  });

  const { runTelegramAggregation } = require(path.join(serverRoot, 'src/services/telegramAggregation.js'));
  return runTelegramAggregation(11, { test: true, forceSend: true, updateState: false });
}

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
      severity: 'warn',
      message: 'Monitor trade V is open while broker is flat. Monitor state remains active independently from broker execution.',
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
    stubModule('src/providers/quote.js', {
      fetchTodayRangeAndQuote: async () => ({
        range: { low: 295, high: 305 },
        quote: { current: 302.16, low: 295, high: 305, open: 299.5, prevClose: 298.7 },
        source: 'finnhub',
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
        throw new Error('executeWebullSignal should not be called without a confirmed signal');
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
    expect(sendCalls[0].text).toContain('Состояние брокера');
    expect(sendCalls[0].text).toContain('Monitor продолжает считать позиции независимо от брокера');
    expect(sendCalls[0].text).not.toContain('Действий нет');
    expect(monitorLogs.flat().join('\n')).toContain('monitor_mismatch');
    expect(autotradeEvents.map((item) => item.eventName)).toContain('t1_monitor_mismatch');
    expect(autotradeEvents.map((item) => item.eventName)).not.toContain('t1_signal_confirmed');
  });

  it('adds a data integrity block and suppresses IBS signals on split-like price jumps', async () => {
    purgeServerCache();

    const sendCalls = [];
    const telegramWatches = new Map([
      ['TQQQ', {
        symbol: 'TQQQ',
        highIBS: 0.75,
        lowIBS: 0.1,
        thresholdPct: 0.3,
        chatId: 'chat-1',
        sent: {
          dateKey: null,
          warn10: false,
          confirm1: false,
          entryWarn10: false,
          entryConfirm1: false,
        },
      }],
    ]);

    stubModule('src/config/index.js', {
      getApiConfig: () => ({ TELEGRAM_CHAT_ID: 'chat-1' }),
      DATASETS_DIR: repoRoot,
    });
    stubModule('src/services/settings.js', {
      readSettings: async () => ({ resultsRefreshProvider: 'finnhub' }),
    });
    stubModule('src/services/datasets.js', {
      getDataset: () => ({
        adjustedForSplits: false,
        data: [
          { date: '2025-08-27', close: 91.04 },
          { date: '2025-08-28', close: 92.7 },
        ],
      }),
    });
    stubModule('src/services/splits.js', {
      getTickerSplits: () => [],
    });
    stubModule('src/providers/quote.js', {
      fetchTodayRangeAndQuote: async () => ({
        range: { low: 44, high: 50 },
        quote: { current: 44.68, low: 44, high: 50, open: 45.71, prevClose: 92.7 },
        source: 'finnhub',
      }),
    });
    stubModule('src/services/telegram.js', {
      telegramWatches,
      aggregateSendState: new Map(),
      getAggregateState: () => ({ dateKey: '2025-08-29', t11Sent: false, t1Sent: false }),
      sendTelegramMessage: async (chatId, text) => {
        sendCalls.push({ chatId, text });
        return { ok: true };
      },
    });
    stubModule('src/services/trades.js', {
      syncWatchesWithTradeState: () => ({ openTrade: null, changes: [] }),
      getCurrentOpenTrade: () => null,
    });
    stubModule('src/services/autotrade.js', {
      executeWebullSignal: async () => {
        throw new Error('executeWebullSignal should not be called from T-11 overview');
      },
      appendAutotradeEvent: async () => {},
    });
    stubModule('src/services/dates.js', {
      getETParts: () => ({ hh: 15, mm: 49, ss: 0 }),
      etKeyYMD: (value) => value?.key || '2025-08-29',
      previousTradingDayET: () => ({ key: '2025-08-28' }),
      getTradingSessionForDateET: () => ({ closeMin: 16 * 60, short: false }),
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
    stubModule('src/services/emaAlerts.js', {
      listEmaAlerts: () => [],
      evaluateEmaAlerts: async () => [],
      markEmaAlertsTriggered: () => [],
    });

    const { runTelegramAggregation } = require(path.join(serverRoot, 'src/services/telegramAggregation.js'));
    const result = await runTelegramAggregation(11, { test: true, forceSend: true, updateState: false });

    expect(result.sent).toBe(true);
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].text).toContain('ПРОВЕРКА ДАННЫХ');
    expect(sendCalls[0].text).toContain('EMA/IBS сигналы заблокированы');
    expect(sendCalls[0].text).not.toContain('На вход: TQQQ');
  });

  it('refreshes EMA ticker history before evaluate, even when the ticker is not a watch', async () => {
    purgeServerCache();

    const order = [];
    const telegramWatches = new Map([
      ['AAPL', {
        symbol: 'AAPL',
        highIBS: 0.75,
        lowIBS: 0.1,
        thresholdPct: 0.3,
        chatId: 'chat-1',
        sent: {
          dateKey: null,
          warn10: false,
          confirm1: false,
          entryWarn10: false,
          entryConfirm1: false,
        },
      }],
    ]);

    stubModule('src/config/index.js', {
      getApiConfig: () => ({ TELEGRAM_CHAT_ID: 'chat-1' }),
      DATASETS_DIR: repoRoot,
    });
    stubModule('src/services/settings.js', {
      readSettings: async () => ({ resultsRefreshProvider: 'finnhub' }),
    });
    stubModule('src/services/datasets.js', {
      getDataset: (symbol) => {
        if (symbol === 'TQQQ') return { data: [{ date: '2026-03-28' }] };
        return { data: [{ date: '2026-03-30' }] };
      },
    });
    stubModule('src/utils/helpers.js', {
      toSafeTicker: (value) => String(value || '').toUpperCase(),
    });
    stubModule('src/providers/quote.js', {
      fetchTodayRangeAndQuote: async () => ({
        range: { low: 100, high: 110 },
        quote: { current: 105, low: 100, high: 110, open: 102, prevClose: 101 },
        source: 'finnhub',
      }),
    });
    stubModule('src/services/telegram.js', {
      telegramWatches,
      aggregateSendState: new Map(),
      getAggregateState: () => ({ dateKey: '2026-03-31', t11Sent: false, t1Sent: false }),
      sendTelegramMessage: async () => ({ ok: true }),
    });
    stubModule('src/services/trades.js', {
      syncWatchesWithTradeState: () => ({ openTrade: null, changes: [] }),
      getCurrentOpenTrade: () => null,
    });
    stubModule('src/services/autotrade.js', {
      executeWebullSignal: async () => {
        throw new Error('executeWebullSignal should not be called from T-11 overview');
      },
      appendAutotradeEvent: async () => {},
    });
    stubModule('src/services/dates.js', {
      getETParts: () => ({ hh: 15, mm: 49, ss: 0 }),
      etKeyYMD: (value) => value?.key || '2026-03-31',
      previousTradingDayET: () => ({ key: '2026-03-30' }),
      getTradingSessionForDateET: () => ({ closeMin: 16 * 60, short: false }),
      isTradingDayByCalendarET: () => true,
      getCachedTradingCalendar: () => ({}),
    });
    stubModule('src/services/priceActualization.js', {
      refreshTickerAndCheckFreshness: async (symbol) => {
        order.push(`refresh:${symbol}`);
        return { fresh: true };
      },
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
      listEmaAlerts: () => [
        { symbol: 'TQQQ', emaPeriod: 200, enabled: true },
        { symbol: 'tqqq', emaPeriod: 20, enabled: true },
      ],
      evaluateEmaAlerts: async () => {
        order.push('evaluate');
        return [{
          symbol: 'TQQQ',
          emaPeriod: 200,
          buyLevelPct: 15,
          sellLevelPct: 40,
          dataOk: true,
          near: false,
          reached: false,
          infoCrossing: null,
          deviationPct: -5,
          action: 'buy',
          activeLevelPct: 15,
        }];
      },
      markEmaAlertsTriggered: () => [],
      recordEmaInfoSide: () => null,
      recordEmaInfoSides: () => [],
    });

    const { runTelegramAggregation } = require(path.join(serverRoot, 'src/services/telegramAggregation.js'));
    const result = await runTelegramAggregation(11, { test: true, forceSend: true, updateState: false });

    expect(result.sent).toBe(true);
    expect(order).toEqual(['refresh:TQQQ', 'evaluate']);
  });

  it('puts a short EMA block into the T-11 overview and skips a separate message when far from the level', async () => {
    const sendCalls = [];
    await runT11WithEma({
      sendCalls,
      emaAlert: {
        symbol: 'TQQQ',
        emaPeriod: 200,
        buyLevelPct: 15,
        sellLevelPct: 40,
        dataOk: true,
        near: false,
        reached: false,
        infoCrossing: null,
        deviationPct: 17.07,
        action: 'sell',
        activeLevelPct: 40,
      },
    });

    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].text).toContain('<b>11m</b> → close');
    expect(sendCalls[0].text).toContain('ENTRY: —');
    expect(sendCalls[0].text).toContain('EXIT: —');
    expect(sendCalls[0].text).toContain('TD✓ RT✓');
    expect(sendCalls[0].text).toContain('<b>AAPL</b> <b>$105.00</b> · FLAT · IBS <b>.50</b>');
    expect(sendCalls[0].text).not.toContain('✅');
    expect(sendCalls[0].text).toContain('EMA: <b>TQQQ</b> <b>17.07%</b> → sell ≥40% · far');
    expect(sendCalls[0].text).not.toContain('Близко: нет');
    expect(sendCalls[0].text).not.toContain('ждём: продажа');
  });

  it('sends a separate T-11 EMA ping only when the level is near', async () => {
    const sendCalls = [];
    await runT11WithEma({
      sendCalls,
      emaAlert: {
        symbol: 'TQQQ',
        emaPeriod: 200,
        buyLevelPct: 15,
        sellLevelPct: 40,
        dataOk: true,
        near: true,
        reached: false,
        infoCrossing: null,
        deviationPct: 39.6,
        action: 'sell',
        activeLevelPct: 40,
      },
    });

    expect(sendCalls).toHaveLength(2);
    expect(sendCalls[0].text).toContain('EMA: <b>TQQQ</b> <b>39.60%</b> → sell ≥40% · near');
    expect(sendCalls[1].text).toContain('📐 EMA сигналы');
    expect(sendCalls[1].text).toContain('Близко:');
    expect(sendCalls[1].text).toContain('TQQQ EMA200: продавай при ≥ 40% (сейчас 39.60%)');
  });

  it('compacts T-11 exit + consistency into the short layout', async () => {
    const sendCalls = [];
    await runT11WithEma({
      sendCalls,
      quote: { current: 109.2, low: 100, high: 110, open: 102, prevClose: 101 },
      range: { low: 100, high: 110 },
      openTrade: { id: 't1', symbol: 'AAPL', entryDate: '2026-03-18', entryPrice: 300 },
      consistencySnapshot: {
        openMonitorTrade: { symbol: 'AAPL' },
        openBrokerTrade: { symbol: 'AAPL' },
        issues: [{ symbol: 'AAPL', autoFixable: false }],
      },
      emaAlert: {
        symbol: 'TQQQ',
        emaPeriod: 200,
        dataOk: true,
        near: false,
        deviationPct: 17.07,
        action: 'sell',
        activeLevelPct: 40,
      },
    });

    const text = sendCalls[0].text;
    expect(sendCalls).toHaveLength(1);
    expect(text).toContain('ENTRY: —');
    expect(text).toContain('🔔 EXIT: <b>AAPL</b> · IBS <b>.920</b>');
    expect(text).toContain('⚠️ <b>AAPL</b>: monitor OPEN · broker OPEN · auto-reconcile unsafe');
    expect(text).toContain('<b>AAPL</b> <b>$109.20</b> · OPEN · IBS <b>.92</b>');
    expect(text).toContain('TD✓ RT✓ · EXIT');
  });
});
