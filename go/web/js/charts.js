const Charts = {
  live: [],
  RANGE_DAYS: { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 365 * 3, '5Y': 365 * 5 },
  colors(isDark) {
    return {
      bg: isDark ? '#0b1220' : '#ffffff',
      text: isDark ? '#e5e7eb' : '#1f2937',
      grid: isDark ? '#1f2937' : '#eef2ff',
      border: isDark ? '#374151' : '#e5e7eb',
    };
  },
  toBusinessDay(date) {
    const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
    return { year: y, month: m, day: d };
  },
  toUtcTs(date) {
    const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d, 12, 0, 0) / 1000);
  },
  isoDate(date) {
    return String(date || '').slice(0, 10);
  },
  mapOHLC(bars) {
    return (bars || []).filter((b) => b && b.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((b) => ({
      time: this.toBusinessDay(b.date),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
    }));
  },
  mapLinePoints(points) {
    return (points || []).filter((p) => p && p.date && p.value != null).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((p) => ({
      time: this.toBusinessDay(p.date),
      value: Number(p.value),
    }));
  },
  mapOpenDayDrawdown(trades, bars) {
    const byDate = {};
    (bars || []).forEach((b) => {
      if (b && b.date) byDate[this.isoDate(b.date)] = b;
    });
    return (trades || []).map((t) => {
      const bar = byDate[this.isoDate(t.entryDate)];
      if (!bar || !(Number(bar.open) > 0)) return { date: t.entryDate, value: 0 };
      const dropPct = ((Number(bar.open) - Number(bar.low)) / Number(bar.open)) * 100;
      return { date: t.entryDate, value: -dropPct };
    });
  },
  simulateLeverage(equity, leverage) {
    if (!equity || !equity.length || !(leverage > 0)) return { equity: [], finalValue: 0, maxDrawdown: 0 };
    const result = [];
    let currentValue = Number(equity[0].value);
    let peakValue = currentValue;
    let maxDD = 0;
    result.push({ date: equity[0].date, value: currentValue, drawdown: 0 });
    for (let i = 1; i < equity.length; i++) {
      const basePrev = Number(equity[i - 1].value);
      const baseCurr = Number(equity[i].value);
      if (basePrev <= 0) continue;
      currentValue = currentValue * (1 + ((baseCurr - basePrev) / basePrev) * leverage);
      if (currentValue < 0) currentValue = 0;
      if (currentValue > peakValue) peakValue = currentValue;
      const dd = peakValue > 0 ? ((peakValue - currentValue) / peakValue) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
      result.push({ date: equity[i].date, value: currentValue, drawdown: dd });
    }
    return { equity: result, finalValue: result[result.length - 1]?.value ?? currentValue, maxDrawdown: maxDD };
  },
  snapTime(date, data, tf) {
    const iso = this.isoDate(date);
    if (tf !== 'weekly') return this.toUtcTs(iso);
    const wk = this.weekKey(iso);
    let found = null;
    for (const b of data || []) {
      if (this.weekKey(b.date) === wk) found = b;
    }
    return this.toUtcTs(this.isoDate((found && found.date) || iso));
  },
  mapHeroSeries(bars, opts) {
    opts = opts || {};
    const kind = opts.kind === 'candles' ? 'candles' : 'line';
    const tf = opts.timeframe === 'weekly' ? 'weekly' : 'daily';
    let data = (bars || []).filter((b) => b && b.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const price = Number(opts.currentPrice);
    if (Number.isFinite(price) && data.length) {
      const last = data[data.length - 1];
      const today = this.isoDate(opts.todayISO);
      data = data.slice();
      if (opts.isTrading && today && this.isoDate(last.date) < today) {
        const q = opts.todayQuote || {};
        data.push({
          date: today,
          open: Number(q.open != null ? q.open : last.close),
          high: Math.max(Number(q.high != null ? q.high : price), price),
          low: Math.min(Number(q.low != null ? q.low : price), price),
          close: price,
          volume: 0,
        });
      } else {
        data[data.length - 1] = {
          ...last,
          close: price,
          high: Math.max(Number(last.high), price),
          low: Math.min(Number(last.low), price),
        };
      }
    }
    if (tf === 'weekly') data = this.aggregateWeekly(data);
    const candles = data.map((b) => ({
      time: this.toUtcTs(b.date),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
    }));
    const line = candles.map((c) => ({ time: c.time, value: c.close }));
    const trades = opts.showTrades ? (opts.trades || []) : [];
    const lineMarks = [];
    const candleMarks = [];
    trades.forEach((t) => {
      if (!t || !t.entryDate) return;
      const entry = this.snapTime(t.entryDate, data, tf);
      const exit = t.exitDate ? this.snapTime(t.exitDate, data, tf) : null;
      lineMarks.push({ time: entry, position: 'inBar', color: '#16a34a', shape: 'circle', text: '' });
      candleMarks.push({ time: entry, position: 'belowBar', color: '#16a34a', shape: 'arrowUp', text: '' });
      if (exit && t.exitReason !== 'end_of_data') {
        lineMarks.push({ time: exit, position: 'inBar', color: '#dc2626', shape: 'circle', text: '' });
        candleMarks.push({ time: exit, position: 'aboveBar', color: '#dc2626', shape: 'arrowDown', text: '' });
      }
    });
    return { kind, candles, line, lineMarks, candleMarks, data };
  },
  weekKey(date) {
    const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
    const parsed = new Date(Date.UTC(y, m - 1, d));
    const day = parsed.getUTCDay() || 7;
    parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((parsed.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${parsed.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
  },
  aggregateWeekly(bars) {
    const sorted = (bars || []).filter((b) => b && b.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const weekly = [];
    let key = '';
    let cur = null;
    for (const bar of sorted) {
      const wk = this.weekKey(bar.date);
      const iso = String(bar.date).slice(0, 10);
      if (!cur || wk !== key) {
        if (cur) weekly.push(cur);
        key = wk;
        cur = {
          date: iso,
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
          volume: Number(bar.volume || 0),
        };
        continue;
      }
      cur.high = Math.max(cur.high, Number(bar.high));
      cur.low = Math.min(cur.low, Number(bar.low));
      cur.close = Number(bar.close);
      cur.volume += Number(bar.volume || 0);
      cur.date = iso;
    }
    if (cur) weekly.push(cur);
    return weekly;
  },
  destroy() {
    this.live.splice(0).forEach((chart) => {
      try { chart.remove(); } catch (_) { /* already gone */ }
    });
  },
  track(chart) {
    this.live.push(chart);
    return chart;
  },
  create(container, isDark, extra) {
    const c = this.colors(isDark);
    const x = extra || {};
    return this.track(LightweightCharts.createChart(container, {
      autoSize: true,
      layout: { background: { color: c.bg }, textColor: c.text, fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: !!x.timeVisible, secondsVisible: false, rightOffset: x.rightOffset || 0 },
      crosshair: x.crosshair || {},
      handleScroll: x.handleScroll,
      handleScale: x.handleScale,
    }));
  },
  applyRange(chart, candles, range) {
    if (!chart || !candles || !candles.length) return;
    if (!range || range === 'MAX') {
      chart.timeScale().fitContent();
      return;
    }
    const days = this.RANGE_DAYS[range] || 90;
    const right = candles[candles.length - 1].time;
    const left = candles[0].time;
    const from = Math.max(left, right - days * 24 * 60 * 60);
    try {
      chart.timeScale().setVisibleRange({ from, to: right });
    } catch (_) {
      chart.timeScale().fitContent();
    }
  },
  mark(series, markers) {
    if (!series || !markers || !markers.length) return;
    try {
      if (typeof LightweightCharts.createSeriesMarkers === 'function') {
        LightweightCharts.createSeriesMarkers(series, markers);
      }
    } catch (_) { /* plugin unavailable */ }
  },
  hero(container, bars, opts) {
    opts = opts || {};
    const mapped = this.mapHeroSeries(bars, opts);
    const kind = mapped.kind;
    const candles = mapped.candles;
    const line = mapped.line;
    const trendUp = line.length < 2 || line[line.length - 1].value >= line[0].value;
    const lineColor = trendUp ? '#16a34a' : '#ea580c';
    const chart = this.create(container, opts.dark, {
      timeVisible: true,
      rightOffset: 2,
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, pinch: true, mouseWheel: false },
    });
    const lineSeries = chart.addSeries(LightweightCharts.LineSeries, {
      color: lineColor, lineWidth: 2, visible: kind === 'line', priceLineVisible: false, lastValueVisible: true,
    });
    const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#10B981', downColor: '#EF4444',
      borderUpColor: '#10B981', borderDownColor: '#EF4444',
      wickUpColor: '#10B981', wickDownColor: '#EF4444',
      borderVisible: true, visible: kind === 'candles',
    });
    lineSeries.setData(line);
    candleSeries.setData(candles);
    this.mark(lineSeries, mapped.lineMarks);
    this.mark(candleSeries, mapped.candleMarks);
    this.applyRange(chart, candles, opts.range || '3M');
    return { chart, lineColor };
  },
  candles(container, bars, isDark) {
    const chart = this.create(container, isDark);
    const series = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626',
    });
    series.setData(this.mapOHLC(bars));
    chart.timeScale().fitContent();
    return chart;
  },
  line(container, points, isDark, color) {
    const chart = this.create(container, isDark);
    const series = chart.addSeries(LightweightCharts.LineSeries, { color: color || '#4f46e5', lineWidth: 2 });
    series.setData(this.mapLinePoints(points));
    chart.timeScale().fitContent();
    return chart;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Charts;
}
