'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, 'charts.js'), 'utf8');
const sandbox = {
  console, Date, Math, String, Number, Boolean, Array, Object, JSON,
  module: { exports: {} },
  exports: {},
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const Charts = sandbox.module.exports;
if (!Charts || typeof Charts.toUtcTs !== 'function') {
  throw new Error('failed to load shipped Charts from charts.js');
}

const bars = [
  { date: '2024-11-15', open: 10, high: 11, low: 9, close: 10.5, volume: 1 },
  { date: '2024-11-18', open: 10.5, high: 12, low: 10, close: 11.5, volume: 1 },
  { date: '2024-11-19', open: 11.5, high: 13, low: 11, close: 12, volume: 1 },
];

test('toBusinessDay keeps YYYY-MM-DD parts without a Date shift', () => {
  const d = Charts.toBusinessDay('2024-11-17');
  assert.equal(d.year, 2024);
  assert.equal(d.month, 11);
  assert.equal(d.day, 17);
  const iso = Charts.toBusinessDay('2024-11-17T12:00:00.000Z');
  assert.equal(iso.year, 2024);
  assert.equal(iso.month, 11);
  assert.equal(iso.day, 17);
});

test('toUtcTs is noon UTC of the trading date string', () => {
  const ts = Charts.toUtcTs('2024-11-17');
  assert.equal(ts, Math.floor(Date.UTC(2024, 10, 17, 12, 0, 0) / 1000));
  const aucklandDay = new Date(ts * 1000).toLocaleString('en-US', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'numeric', year: 'numeric' });
  assert.equal(aucklandDay.includes('2024'), true);
});

test('mapOHLC values equal input closes and business-day times', () => {
  const mapped = Charts.mapOHLC(bars);
  assert.equal(mapped.length, 3);
  mapped.forEach((c, i) => {
    const day = Charts.toBusinessDay(bars[i].date);
    assert.equal(c.time.year, day.year);
    assert.equal(c.time.month, day.month);
    assert.equal(c.time.day, day.day);
    assert.equal(c.open, bars[i].open);
    assert.equal(c.high, bars[i].high);
    assert.equal(c.low, bars[i].low);
    assert.equal(c.close, bars[i].close);
  });
});

test('mapLinePoints uses equity dates and values', () => {
  const eq = [
    { date: '2024-11-15', value: 10000 },
    { date: '2024-11-19', value: 10100, drawdown: 0 },
  ];
  const mapped = Charts.mapLinePoints(eq);
  assert.equal(mapped[0].value, 10000);
  assert.equal(mapped[1].value, 10100);
  assert.equal(mapped[1].time.year, 2024);
  assert.equal(mapped[1].time.month, 11);
  assert.equal(mapped[1].time.day, 19);
});

test('mapHeroSeries daily markers sit on entry/exit session timestamps', () => {
  const trades = [
    { entryDate: '2024-11-15', exitDate: '2024-11-19', exitReason: 'ibs_signal' },
  ];
  const mapped = Charts.mapHeroSeries(bars, { showTrades: true, trades, kind: 'line' });
  assert.equal(mapped.candles.length, 3);
  assert.equal(mapped.candles[0].close, 10.5);
  assert.equal(mapped.candles[2].close, 12);
  const times = mapped.candles.map((c) => c.time);
  assert.equal(mapped.lineMarks[0].time, Charts.toUtcTs('2024-11-15'));
  assert.equal(mapped.lineMarks[1].time, Charts.toUtcTs('2024-11-19'));
  assert.ok(times.includes(mapped.lineMarks[0].time));
  assert.ok(times.includes(mapped.lineMarks[1].time));
  assert.equal(mapped.candleMarks[0].time, mapped.lineMarks[0].time);
});

test('mapHeroSeries ignores a missing or zero live quote so the last bar does not drop to 0', () => {
  const lastClose = bars[bars.length - 1].close;
  for (const currentPrice of [null, undefined, 0, Number.NaN, '']) {
    const mapped = Charts.mapHeroSeries(bars, {
      currentPrice,
      isTrading: false,
      todayISO: '2024-11-19',
      todayQuote: { open: null, high: null, low: null, current: null },
      showTrades: false,
    });
    assert.equal(mapped.candles.length, 3, 'price=' + currentPrice);
    assert.equal(mapped.line[mapped.line.length - 1].value, lastClose);
  }
});

test('mapHeroSeries adds a today bar when the tape is stale and the market is open', () => {
  const mapped = Charts.mapHeroSeries(bars, {
    currentPrice: 12.5,
    isTrading: true,
    todayISO: '2024-11-20',
    todayQuote: { open: 12, high: 13, low: 11.5 },
    showTrades: false,
  });
  assert.equal(mapped.candles.length, 4);
  assert.equal(mapped.candles[mapped.candles.length - 1].close, 12.5);
  assert.equal(mapped.candles[mapped.candles.length - 1].time, Charts.toUtcTs('2024-11-20'));
  assert.equal(mapped.candles[2].close, 12);
});

test('mapHeroSeries weekly markers snap onto the weekly bar time', () => {
  const weekBars = [
    { date: '2024-11-11', open: 10, high: 11, low: 9, close: 10, volume: 1 },
    { date: '2024-11-12', open: 10, high: 12, low: 10, close: 11, volume: 1 },
    { date: '2024-11-13', open: 11, high: 13, low: 11, close: 12, volume: 1 },
    { date: '2024-11-18', open: 12, high: 14, low: 12, close: 13, volume: 1 },
  ];
  const trades = [{ entryDate: '2024-11-12', exitDate: '2024-11-18', exitReason: 'ibs_signal' }];
  const mapped = Charts.mapHeroSeries(weekBars, { showTrades: true, trades, timeframe: 'weekly' });
  const times = new Set(mapped.candles.map((c) => c.time));
  assert.ok(mapped.candles.length >= 1);
  mapped.lineMarks.forEach((m) => {
    assert.ok(times.has(m.time), 'weekly marker ' + m.time + ' must match a candle');
  });
});

test('mapOpenDayDrawdown is (open-low)/open as a negative percent', () => {
  const trades = [{ entryDate: '2024-11-15', entryPrice: 50 }];
  const rows = Charts.mapOpenDayDrawdown(trades, bars);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2024-11-15');
  const want = -((10 - 9) / 10) * 100;
  assert.ok(Math.abs(rows[0].value - want) < 1e-9, 'got ' + rows[0].value + ' want ' + want);
  assert.ok(rows[0].value < 0);
});

test('emaLineData scales EMA values for deviation bands', () => {
  const ema = Charts.emaValues(bars, 2, 'from_start');
  const base = Charts.emaLineData(ema, 1);
  const up = Charts.emaLineData(ema, 1.15);
  const down = Charts.emaLineData(ema, 0.8);
  assert.equal(base.length, bars.length);
  assert.equal(up.length, base.length);
  assert.ok(Math.abs(up[0].value - base[0].value * 1.15) < 1e-9);
  assert.ok(Math.abs(down[0].value - base[0].value * 0.8) < 1e-9);
  assert.equal(up[0].time.year, 2024);
  assert.equal(up[0].time.month, 11);
  assert.equal(up[0].time.day, 15);
});

test('simulateLeverage amplifies bar-to-bar returns', () => {
  const eq = [
    { date: '2024-11-15', value: 10000 },
    { date: '2024-11-19', value: 11000 },
  ];
  const got = Charts.simulateLeverage(eq, 2);
  assert.equal(got.equity.length, 2);
  assert.equal(got.equity[0].value, 10000);
  assert.equal(got.equity[1].value, 12000);
  assert.equal(got.finalValue, 12000);
});
