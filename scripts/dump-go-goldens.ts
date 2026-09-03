/**
 * Dump goldens from the current shipped TypeScript/JS engines.
 * Do not hand-edit the output — regenerate this file instead.
 *
 *   npx vite-node scripts/dump-go-goldens.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import GOOGLData from '../src/data/GOOGL.json';
import testData from '../src/data/test-data.json';
import { CleanBacktestEngine } from '../src/lib/clean-backtest';
import { runBacktest } from '../src/lib/backtest';
import { IndicatorEngine } from '../src/lib/indicators';
import { MetricsCalculator } from '../src/lib/metrics';
import { optimizeTickerData, runSinglePositionBacktest } from '../src/lib/singlePositionBacktest';
import { runOptionsBacktest, runMultiTickerOptionsBacktest } from '../src/lib/optionsBacktest';
import { runEmaZoneBacktest } from '../src/lib/ema-zone-strategy';
import { blackScholes, calculateVolatility, getExpirationDate, getYearsToMaturity } from '../src/lib/optionsMath';
import { RISK_FREE_RATES } from '../src/lib/riskFreeRates';
import { adjustOHLCForSplits, detectSplitsFromOHLC, applyOHLCForHolderValue } from '../src/lib/utils';
import { simulateMarginByTrades } from '../src/lib/margin-simulation';
import { calculateBacktestMetrics } from '../src/lib/backtest-statistics';
import { parseDate } from '../src/lib/validation';
import { runMultiTickerBacktest } from '../src/components/BuyAtClose4Simulator';
import type { OHLCData, Strategy, Trade } from '../src/types';

const require = createRequire(import.meta.url);
const { isIbsEntrySignal, isIbsExitSignal, DEFAULT_LOW_IBS, DEFAULT_HIGH_IBS } = require(
  path.join(process.cwd(), 'server/src/utils/ibsSignals.js')
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'go', 'testdata', 'goldens');

function dumpJSON(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        return { $num: String(v) };
      }
      return v;
    },
    2
  ) + '\n';
}

function write(name: string, value: unknown) {
  const dest = path.join(OUT, name);
  writeFileSync(dest, dumpJSON(value));
  console.log('wrote', path.relative(ROOT, dest));
}

function normalizeBars(raw: Array<Record<string, unknown>>): OHLCData[] {
  return raw.map((item) => {
    const dateRaw = String(item.date);
    const date = dateRaw.length >= 10 ? dateRaw.slice(0, 10) : dateRaw;
    return {
      date,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      adjClose: item.adjClose == null ? undefined : Number(item.adjClose),
      volume: Number(item.volume || 0),
    };
  });
}

function defaultStrategy(): Strategy {
  return {
    id: 'ibs-mean-reversion',
    name: 'IBS Mean Reversion',
    description: 'IBS',
    type: 'ibs-mean-reversion',
    parameters: { lowIBS: 0.1, highIBS: 0.75, maxHoldDays: 30 },
    entryConditions: [{ type: 'indicator', indicator: 'IBS', operator: '<', value: 0.1 }],
    exitConditions: [{ type: 'indicator', indicator: 'IBS', operator: '>', value: 0.75 }],
    riskManagement: {
      initialCapital: 10000,
      capitalUsage: 100,
      leverage: 1,
      maxPositionSize: 1,
      stopLoss: 2,
      takeProfit: 4,
      useStopLoss: false,
      useTakeProfit: false,
      maxPositions: 1,
      maxHoldDays: 30,
      commission: { type: 'percentage', percentage: 0 },
      slippage: 0,
    },
    positionSizing: { type: 'percentage', value: 100 },
  };
}

function compactTrades(trades: Trade[]) {
  return trades.map((t) => ({
    id: t.id,
    entryDate: t.entryDate,
    exitDate: t.exitDate,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    pnl: t.pnl,
    pnlPercent: t.pnlPercent,
    duration: t.duration,
    exitReason: t.exitReason,
    ticker: t.context?.ticker ?? null,
    entryIBS: t.context?.indicatorValues?.IBS ?? null,
    exitIBS: t.context?.indicatorValues?.exitIBS ?? null,
  }));
}

function compactEquity(equity: Array<{ date: string; value: number; drawdown: number }>) {
  return {
    length: equity.length,
    first: equity[0] ?? null,
    last: equity[equity.length - 1] ?? null,
    maxDrawdown: equity.reduce((m, p) => (p.drawdown > m ? p.drawdown : m), 0),
  };
}

mkdirSync(OUT, { recursive: true });

const googl = normalizeBars((GOOGLData as { data: Array<Record<string, unknown>> }).data);
const sample = normalizeBars((testData as { data: Array<Record<string, unknown>> }).data);
const strategy = defaultStrategy();

write('googl-bars-meta.json', {
  count: googl.length,
  first: googl[0],
  last: googl[googl.length - 1],
});
write('googl-bars.json', googl);
write('sample-bars.json', sample);

const clean = new CleanBacktestEngine(googl, strategy).runBacktest();
const viaRunBacktest = runBacktest(googl, strategy);
write('googl-clean-trades.json', compactTrades(clean.trades));
write('googl-clean-metrics.json', clean.metrics);
write('googl-clean-equity.json', compactEquity(clean.equity));
write('googl-runbacktest-trades.json', compactTrades(viaRunBacktest.trades));

const buyAtClose = new CleanBacktestEngine(googl, strategy, {
  entryExecution: 'nextOpen',
  ignoreMaxHoldDaysExit: false,
  ibsExitRequireAboveEntry: false,
}).runBacktest();
write('googl-buy-at-close-trades.json', compactTrades(buyAtClose.trades));
write('googl-buy-at-close-equity.json', compactEquity(buyAtClose.equity));

const noStopNever = new CleanBacktestEngine(googl, {
  ...strategy,
  parameters: { ...strategy.parameters, maxHoldDays: 9999 },
}, {
  entryExecution: 'nextOpen',
  ignoreMaxHoldDaysExit: true,
  ibsExitRequireAboveEntry: false,
}).runBacktest();
write('googl-nostoploss-never-trades.json', compactTrades(noStopNever.trades));

const noStopIbsOnly = new CleanBacktestEngine(googl, {
  ...strategy,
  parameters: { ...strategy.parameters, maxHoldDays: 9999 },
}, {
  entryExecution: 'nextOpen',
  ignoreMaxHoldDaysExit: true,
  ibsExitRequireAboveEntry: true,
}).runBacktest();
write('googl-nostoploss-ibs-profit-trades.json', compactTrades(noStopIbsOnly.trades));

const ibsValues = IndicatorEngine.calculateIBS(googl);
const single = runSinglePositionBacktest(
  optimizeTickerData([{ ticker: 'GOOGL', data: googl, ibsValues }]),
  strategy,
  1,
  {}
);
write('googl-single-position-trades.json', compactTrades(single.trades));
write('googl-single-position-metrics.json', single.metrics);
write('googl-single-position-equity.json', compactEquity(single.equity));

const bac4 = runMultiTickerBacktest([{ ticker: 'GOOGL', data: googl, ibsValues }], strategy, 1);
write('googl-bac4-trades.json', compactTrades(bac4.trades));
write('googl-bac4-final.json', {
  finalValue: bac4.finalValue,
  tradeCount: bac4.trades.length,
  maxDrawdown: bac4.maxDrawdown,
});

const options = runOptionsBacktest(clean.trades, googl, {
  strikePct: 10,
  volAdjPct: 20,
  capitalPct: 10,
  riskFreeRate: 0.05,
  expirationWeeks: 4,
  maxHoldingDays: 30,
});
write('googl-options-trades.json', options.trades.map((t) => ({
  id: t.id,
  entryDate: t.entryDate,
  exitDate: t.exitDate,
  entryPrice: t.entryPrice,
  exitPrice: t.exitPrice,
  quantity: t.quantity,
  pnl: t.pnl,
  pnlPercent: t.pnlPercent,
  duration: t.duration,
  exitReason: t.exitReason,
  optionType: t.optionType,
  strike: t.strike,
  expirationDate: t.expirationDate,
  optionEntryPrice: t.optionEntryPrice,
  optionExitPrice: t.optionExitPrice,
  contracts: t.contracts,
  impliedVolAtEntry: t.impliedVolAtEntry,
  impliedVolAtExit: t.impliedVolAtExit,
})));
write('googl-options-equity.json', compactEquity(options.equity));
write('googl-options-final.json', { finalValue: options.finalValue, tradeCount: options.trades.length });

const optionsMulti = runMultiTickerOptionsBacktest(
  single.trades,
  [{ ticker: 'GOOGL', data: googl }],
  {
    strikePct: 10,
    volAdjPct: 20,
    capitalPct: 10,
    riskFreeRate: 0.05,
    expirationWeeks: 4,
    maxHoldingDays: 30,
  }
);
write('googl-options-multi-trades.json', compactTrades(optionsMulti.trades));
write('googl-options-multi-final.json', {
  finalValue: optionsMulti.finalValue,
  tradeCount: optionsMulti.trades.length,
});

const ema = runEmaZoneBacktest(
  [{ ticker: 'GOOGL', data: googl }],
  {
    initialCapital: 10000,
    leverage: 1,
    emaPeriod: 200,
    buyZones: [{ id: 'buy-20', levelPct: -20, enabled: true }],
    sellZones: [{ id: 'sell-40', levelPct: 40, enabled: true }],
    takeProfitPercent: null,
    noSellAtLoss: false,
    signalSource: 'close',
    emaStartMode: 'full_history',
  }
);
write('googl-ema-trades.json', compactTrades(ema.trades));
write('googl-ema-equity.json', compactEquity(ema.equity));
write('googl-ema-final.json', { finalValue: ema.finalValue, tradeCount: ema.trades.length, maxDrawdown: ema.maxDrawdown });

const emaBar = (date: string, close: number): OHLCData => ({
  date, open: close, high: close, low: close, close, volume: 1000,
});
const emaMulti = runEmaZoneBacktest(
  [{ ticker: 'TQQQ', data: [
    emaBar('2024-01-01', 100),
    emaBar('2024-01-02', 100),
    emaBar('2024-01-03', 100),
    emaBar('2024-01-04', 80),
    emaBar('2024-01-05', 130),
  ] }],
  {
    initialCapital: 10000,
    leverage: 1,
    emaPeriod: 3,
    buyZones: [
      { id: 'buy-5', levelPct: -5, enabled: true },
      { id: 'buy-10', levelPct: -10, enabled: true },
    ],
    sellZones: [{ id: 'sell-15', levelPct: 15, enabled: true }],
    takeProfitPercent: null,
    noSellAtLoss: false,
    signalSource: 'close',
    emaStartMode: 'full_history',
  }
);
write('ema-multi-lot-trades.json', compactTrades(emaMulti.trades));
write('ema-multi-lot-final.json', {
  finalValue: emaMulti.finalValue,
  tradeCount: emaMulti.trades.length,
  maxDrawdown: emaMulti.maxDrawdown,
});

const sampleCloses = sample.map((b) => b.close);
write('indicators-sample.json', {
  sma5: IndicatorEngine.calculateSMA(sampleCloses, 5),
  ema5: IndicatorEngine.calculateEMA(sampleCloses, 5),
  emaFromStart5: IndicatorEngine.calculateEMAFromStart(sampleCloses, 5),
  rsi14: IndicatorEngine.calculateRSI(sampleCloses, 14),
  ibs: IndicatorEngine.calculateIBS(sample),
});

write('blackscholes-samples.json', {
  atmCall: blackScholes('call', 100, 100, 1, 0.05, 0.2),
  atmPut: blackScholes('put', 100, 100, 1, 0.05, 0.2),
  deepOtmCall: blackScholes('call', 50, 100, 0.1, 0.05, 0.2),
  deepItmCall: blackScholes('call', 150, 100, 0.0001, 0.05, 0.2),
  expiredCall: blackScholes('call', 110, 100, 0, 0.05, 0.2),
  expiredPut: blackScholes('put', 90, 100, 0, 0.05, 0.2),
  volFlat: calculateVolatility(Array(30).fill(100)),
  volShort: calculateVolatility([100]),
  expirationFriday: getExpirationDate('2023-01-01'),
  expirationOnFriday: getExpirationDate('2023-01-27'),
  expiration2000: getExpirationDate('2000-01-03'),
  expiration1w: getExpirationDate('2024-12-31', 1),
  yearsToMaturity: getYearsToMaturity('2023-01-01', '2024-01-01'),
  yearsZero: getYearsToMaturity('2024-03-15', '2024-03-15'),
});

write('ibs-signals.json', {
  defaults: { DEFAULT_LOW_IBS, DEFAULT_HIGH_IBS },
  cases: [
    { fn: 'entry', ibs: 0.1, threshold: 0.1, result: isIbsEntrySignal(0.1, 0.1) },
    { fn: 'entry', ibs: 0.0999, threshold: 0.1, result: isIbsEntrySignal(0.0999, 0.1) },
    { fn: 'entry', ibs: 0.05, threshold: undefined, result: isIbsEntrySignal(0.05, undefined) },
    { fn: 'entry', ibs: 0.15, threshold: null, result: isIbsEntrySignal(0.15, null) },
    { fn: 'exit', ibs: 0.75, threshold: 0.75, result: isIbsExitSignal(0.75, 0.75) },
    { fn: 'exit', ibs: 0.7501, threshold: 0.75, result: isIbsExitSignal(0.7501, 0.75) },
    { fn: 'exit', ibs: 0.8, threshold: undefined, result: isIbsExitSignal(0.8, undefined) },
    { fn: 'entry', ibs: null, threshold: 0.1, result: isIbsEntrySignal(null, 0.1) },
    { fn: 'entry', ibs: Number.NaN, threshold: 0.1, result: isIbsEntrySignal(Number.NaN, 0.1) },
    { fn: 'exit', ibs: '0.9', threshold: 0.75, result: isIbsExitSignal('0.9', 0.75) },
  ],
});

const splitBars: OHLCData[] = [
  { date: '2024-01-01', open: 100, high: 110, low: 90, close: 100, volume: 1000 },
  { date: '2024-01-02', open: 100, high: 110, low: 90, close: 100, volume: 1000 },
  { date: '2024-01-03', open: 50, high: 55, low: 45, close: 50, volume: 2000 },
];
const splits = [{ date: '2024-01-03', factor: 2 }];
write('splits-adjust.json', {
  input: splitBars,
  splits,
  adjusted: adjustOHLCForSplits(splitBars, splits),
  detected: detectSplitsFromOHLC(splitBars),
  holder: applyOHLCForHolderValue(splitBars, splits),
});

const marginMarket: OHLCData[] = [
  { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
  { date: '2024-01-02', open: 100, high: 101, low: 60, close: 62, volume: 1000 },
  { date: '2024-01-03', open: 62, high: 64, low: 58, close: 60, volume: 1000 },
  { date: '2024-01-04', open: 60, high: 63, low: 59, close: 61, volume: 1000 },
];
const marginTrades: Trade[] = [
  {
    id: 't1',
    entryDate: '2024-01-01',
    exitDate: '2024-01-03',
    entryPrice: 100,
    exitPrice: 110,
    quantity: 1,
    pnl: 0,
    pnlPercent: 0,
    duration: 0,
    exitReason: 'ibs_signal',
  },
  {
    id: 't2',
    entryDate: '2024-01-03',
    exitDate: '2024-01-04',
    entryPrice: 60,
    exitPrice: 61,
    quantity: 1,
    pnl: 0,
    pnlPercent: 0,
    duration: 0,
    exitReason: 'ibs_signal',
  },
];
const margin = simulateMarginByTrades({
  marketData: marginMarket,
  trades: marginTrades,
  initialCapital: 10000,
  leverage: 2,
  maintenanceMarginPct: 25,
  capitalUsagePct: 100,
});
write('margin-simulation.json', {
  trades: compactTrades(margin.trades),
  finalValue: margin.finalValue,
  maxDrawdown: margin.maxDrawdown,
  liquidationEvent: margin.liquidationEvent,
  maintenanceCount: margin.maintenanceLiquidationEvents.length,
});

function bar(date: string, open: number, high: number, low: number, close: number): OHLCData {
  return { date, open, high, low, close, volume: 1000 };
}
const tpData = [
  bar('2024-01-01', 101, 112, 99, 100),
  bar('2024-01-02', 100, 103, 98, 98.2),
  bar('2024-01-03', 99, 101, 98, 99),
];
const tpIbs = tpData.map((item) => {
  const range = item.high - item.low;
  return range > 0 ? (item.close - item.low) / range : 0.5;
});
const tp = runSinglePositionBacktest(
  optimizeTickerData([{ ticker: 'AAPL', data: tpData, ibsValues: tpIbs }]),
  strategy,
  1,
  { allowSameDayReentry: true, takeProfitPercent: 2 }
);
write('single-position-takeprofit.json', compactTrades(tp.trades));

const metricsFromClean = new MetricsCalculator(clean.trades, clean.equity, 10000).calculateAllMetrics();
write('googl-metrics-calculator.json', metricsFromClean);
write('googl-backtest-statistics.json', calculateBacktestMetrics(clean.trades, clean.equity, 10000));

write('parse-date.json', {
  iso: parseDate('2024-11-17'),
  isoImpossible: parseDate('2024-02-30'),
  us: parseDate('11/17/2024'),
  eu: parseDate('17.11.2024'),
  empty: parseDate(''),
});

write('risk-free-rates.json', RISK_FREE_RATES);

const sampleClean = new CleanBacktestEngine(sample, strategy).runBacktest();
write('sample-clean-trades.json', compactTrades(sampleClean.trades));
write('sample-clean-metrics.json', sampleClean.metrics);

write('manifest.json', {
  generatedAt: new Date().toISOString(),
  source: 'scripts/dump-go-goldens.ts — shipped TS/JS engines',
  googlBars: googl.length,
  googlCleanTrades: clean.trades.length,
  googlRunBacktestTrades: viaRunBacktest.trades.length,
  googlBuyAtCloseTrades: buyAtClose.trades.length,
  googlSingleTrades: single.trades.length,
  googlOptionsTrades: options.trades.length,
  googlEmaTrades: ema.trades.length,
  tz: process.env.TZ || '(unset)',
});

console.log('goldens complete');
