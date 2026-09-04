const Charts = {
  live: [],
  RIGHT_OFFSET: 8,
  IBS_LOW: 0.1,
  IBS_HIGH: 0.75,
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
  livePrice(v) {
    if (typeof v !== 'number' && (v == null || v === '')) return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
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
    const live = this.livePrice(opts.currentPrice);
    if (live != null && data.length) {
      const last = data[data.length - 1];
      const today = this.isoDate(opts.todayISO);
      data = data.slice();
      if (opts.isTrading && today && this.isoDate(last.date) < today) {
        const q = opts.todayQuote || {};
        const open = this.livePrice(q.open);
        const high = this.livePrice(q.high);
        const low = this.livePrice(q.low);
        data.push({
          date: today,
          open: open != null ? open : last.close,
          high: high != null ? Math.max(high, live) : live,
          low: low != null ? Math.min(low, live) : live,
          close: live,
          volume: 0,
        });
      } else {
        data[data.length - 1] = {
          ...last,
          close: live,
          high: Math.max(Number(last.high), live),
          low: Math.min(Number(last.low), live),
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
  setWatermark(container, text, opts) {
    opts = opts || {};
    const prev = container && container.querySelector(':scope > .chart-watermark');
    if (prev) prev.remove();
    const label = String(text || '').trim();
    if (!container || !label) return null;
    const el = document.createElement('div');
    el.className = 'chart-watermark';
    el.textContent = label;
    el.setAttribute('aria-hidden', 'true');
    const extraPanes = Number(opts.extraPanes) || 0;
    const panePct = Math.max(8, Math.min(40, Number(opts.indicatorPanePercent) || 18)) / 100;
    const main = extraPanes > 0 ? Math.max(0.5, 1 - extraPanes * panePct) : 1;
    el.style.top = (main * 50) + '%';
    container.appendChild(el);
    return el;
  },
  create(container, isDark, extra) {
    const c = this.colors(isDark);
    const x = extra || {};
    return this.track(LightweightCharts.createChart(container, {
      autoSize: true,
      layout: { background: { color: c.bg }, textColor: c.text, fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: !!x.timeVisible, secondsVisible: false, rightOffset: this.rightOffsetOf(x) },
      crosshair: x.crosshair || {},
      handleScroll: x.handleScroll,
      handleScale: x.handleScale,
    }));
  },
  rightOffsetOf(extra) {
    const n = extra && extra.rightOffset != null ? Number(extra.rightOffset) : this.RIGHT_OFFSET;
    return Number.isFinite(n) && n >= 0 ? n : this.RIGHT_OFFSET;
  },
  timeOf(t) {
    if (t == null) return 0;
    if (typeof t === 'number' && Number.isFinite(t)) return t;
    if (typeof t === 'object' && t.year) {
      return this.toUtcTs(`${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`);
    }
    return 0;
  },
  applyRange(chart, candles, range) {
    if (!chart || !candles || !candles.length) return;
    const ts = chart.timeScale();
    const offset = this.RIGHT_OFFSET;
    try { ts.applyOptions({ rightOffset: offset }); } catch (_) { /* older builds */ }
    if (!range || range === 'MAX' || range === 'ALL') {
      ts.fitContent();
      return;
    }
    const days = this.RANGE_DAYS[range] || 90;
    const lastIdx = candles.length - 1;
    const right = this.timeOf(candles[lastIdx].time);
    const cutoff = right - days * 24 * 60 * 60;
    let fromIdx = 0;
    for (let i = 0; i < candles.length; i++) {
      if (this.timeOf(candles[i].time) >= cutoff) { fromIdx = i; break; }
    }
    try {
      ts.setVisibleLogicalRange({ from: fromIdx, to: lastIdx + offset });
    } catch (_) {
      try {
        ts.setVisibleRange({ from: Math.max(this.timeOf(candles[0].time), cutoff), to: right });
      } catch (__) {
        ts.fitContent();
      }
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
  emaValues(bars, period, startMode) {
    const data = (bars || []).filter((b) => b && b.date && Number.isFinite(Number(b.close)));
    const n = Number(period) || 20;
    const out = new Array(data.length);
    if (!data.length || n < 1) return { bars: data, values: out };
    const k = 2 / (n + 1);
    if (startMode === 'from_start') {
      out[0] = Number(data[0].close);
      for (let i = 1; i < data.length; i++) out[i] = (Number(data[i].close) - out[i - 1]) * k + out[i - 1];
      return { bars: data, values: out };
    }
    if (data.length < n) return { bars: data, values: out };
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(data[i].close);
    out[n - 1] = sum / n;
    for (let i = n; i < data.length; i++) out[i] = (Number(data[i].close) - out[i - 1]) * k + out[i - 1];
    return { bars: data, values: out };
  },
  emaLineData(ema, scale) {
    const k = scale == null ? 1 : Number(scale);
    if (!Number.isFinite(k) || !ema || !Array.isArray(ema.values)) return [];
    const out = [];
    for (let i = 0; i < ema.values.length; i++) {
      const v = ema.values[i];
      const bar = ema.bars && ema.bars[i];
      if (v == null || !Number.isFinite(Number(v)) || !bar || !bar.date) continue;
      out.push({ time: this.toBusinessDay(bar.date), value: Number(v) * k });
    }
    return out;
  },
  lineWidth(v, fallback) {
    const n = Number(v);
    return n === 1 || n === 2 || n === 3 || n === 4 ? n : (fallback || 2);
  },
  lineStyle(v, fallback) {
    const n = Number(v);
    return n === 0 || n === 1 || n === 2 || n === 3 || n === 4 ? n : (fallback == null ? 0 : fallback);
  },
  ibsValues(bars) {
    return (bars || []).filter((b) => b && b.date).map((b) => {
      const high = Number(b.high), low = Number(b.low), close = Number(b.close);
      const range = high - low;
      const ibs = range > 0 ? (close - low) / range : 0.5;
      return { date: b.date, value: ibs };
    });
  },
  ibsThresholds(opts) {
    opts = opts || {};
    let low = Number(opts.lowIBS);
    let high = Number(opts.highIBS);
    if (!Number.isFinite(low) || low <= 0 || low >= 1) low = this.IBS_LOW;
    if (!Number.isFinite(high) || high <= 0 || high >= 1) high = this.IBS_HIGH;
    if (low >= high) {
      low = this.IBS_LOW;
      high = this.IBS_HIGH;
    }
    return { low, high };
  },
  ibsColoredLineData(points, low, high) {
    const mid = [], lo = [], hi = [];
    (points || []).forEach((p) => {
      if (!p || p.date == null || !Number.isFinite(Number(p.value))) return;
      const time = this.toBusinessDay(p.date);
      const v = Number(p.value);
      const gap = { time };
      if (v < low) {
        lo.push({ time, value: v });
        mid.push(gap);
        hi.push(gap);
      } else if (v > high) {
        hi.push({ time, value: v });
        mid.push(gap);
        lo.push(gap);
      } else {
        mid.push({ time, value: v });
        lo.push(gap);
        hi.push(gap);
      }
    });
    return { mid, lo, hi };
  },
  ibsBandData(times, value) {
    if (!times || !times.length) return [];
    const t0 = times[0];
    const t1 = times[times.length - 1];
    if (t0.year === t1.year && t0.month === t1.month && t0.day === t1.day) {
      return [{ time: t0, value }];
    }
    return [{ time: t0, value }, { time: t1, value }];
  },
  addIbsPane(chart, points, paneIdx, opts) {
    const { low, high } = this.ibsThresholds(opts);
    const lowPct = low * 100;
    const highPct = high * 100;
    const scaled = [];
    const times = [];
    (points || []).forEach((p) => {
      if (!p || p.date == null || !Number.isFinite(Number(p.value))) return;
      scaled.push({ date: p.date, value: Number(p.value) * 100 });
      times.push(this.toBusinessDay(p.date));
    });
    if (!times.length) return { low, high };
    const colored = this.ibsColoredLineData(scaled, lowPct, highPct);
    const shared = {
      priceScaleId: 'ibs',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    };
    const lowFill = chart.addSeries(LightweightCharts.AreaSeries, {
      ...shared,
      lineVisible: false,
      lineWidth: 0,
      lineColor: 'rgba(16,185,129,0)',
      topColor: 'rgba(16,185,129,0.20)',
      bottomColor: 'rgba(16,185,129,0.06)',
      baseValue: { type: 'price', price: 0 },
    }, paneIdx);
    lowFill.setData(this.ibsBandData(times, lowPct));
    const highFill = chart.addSeries(LightweightCharts.AreaSeries, {
      ...shared,
      lineVisible: false,
      lineWidth: 0,
      lineColor: 'rgba(239,68,68,0)',
      topColor: 'rgba(239,68,68,0.20)',
      bottomColor: 'rgba(239,68,68,0.06)',
      baseValue: { type: 'price', price: highPct },
    }, paneIdx);
    highFill.setData(this.ibsBandData(times, 100));
    if (typeof lowFill.createPriceLine === 'function') {
      lowFill.createPriceLine({ price: lowPct, color: '#10B981', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: '' });
      lowFill.createPriceLine({ price: highPct, color: '#EF4444', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: '' });
    }
    const lineOpts = (color) => Object.assign({
      color, lineWidth: 1,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    }, shared);
    const mid = chart.addSeries(LightweightCharts.LineSeries, lineOpts('#7c3aed'), paneIdx);
    mid.setData(colored.mid);
    const lo = chart.addSeries(LightweightCharts.LineSeries, lineOpts('#10B981'), paneIdx);
    lo.setData(colored.lo);
    const hi = chart.addSeries(LightweightCharts.LineSeries, lineOpts('#EF4444'), paneIdx);
    hi.setData(colored.hi);
    return { low, high };
  },
  csvCell(value) {
    const s = String(value == null ? '' : value);
    return /["\n,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  },
  csvNum(value, digits) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
    return Number(value).toFixed(digits);
  },
  csvFromBars(bars) {
    const data = (bars || []).filter((b) => b && b.date && Number.isFinite(Number(b.close)));
    const ema20 = this.emaValues(data, 20);
    const ema200 = this.emaValues(data, 200);
    const head = ['date', 'price', 'open', 'high', 'low', 'close', 'adj_close', 'volume', 'ibs', 'ema20', 'ema200'];
    const rows = [head.join(',')];
    data.forEach((b, i) => {
      const high = Number(b.high), low = Number(b.low), close = Number(b.close);
      const range = high - low;
      const ibs = range > 0 ? (close - low) / range : null;
      rows.push([
        this.isoDate(b.date),
        this.csvNum(close, 4),
        this.csvNum(b.open, 4),
        this.csvNum(high, 4),
        this.csvNum(low, 4),
        this.csvNum(close, 4),
        this.csvNum(b.adjClose, 4),
        this.csvNum(b.volume, 0),
        this.csvNum(ibs, 6),
        this.csvNum(ema20.values[i], 6),
        this.csvNum(ema200.values[i], 6),
      ].map((c) => this.csvCell(c)).join(','));
    });
    return rows.join('\n');
  },
  downloadCsv(filename, text) {
    const body = String(text || '');
    const csv = body.charCodeAt(0) === 0xFEFF ? body : ('\uFEFF' + body);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'chart.csv';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  },
  area(container, points, isDark, color, opts) {
    opts = opts || {};
    const chart = this.create(container, isDark);
    const col = color || '#4f46e5';
    const series = chart.addSeries(LightweightCharts.AreaSeries, {
      lineColor: col,
      topColor: opts.topColor || (col + '55'),
      bottomColor: opts.bottomColor || (col + '08'),
      lineWidth: 2,
      priceLineVisible: !!opts.priceLine,
    });
    series.setData(this.mapLinePoints(points));
    if (opts.refValue != null && typeof series.createPriceLine === 'function') {
      series.createPriceLine({ price: Number(opts.refValue), color: opts.refColor || '#94a3b8', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: opts.refTitle || '' });
    }
    this.applyRange(chart, this.mapLinePoints(points).map((p) => ({ time: this.toUtcTs(p.time && p.time.year ? `${p.time.year}-${String(p.time.month).padStart(2, '0')}-${String(p.time.day).padStart(2, '0')}` : p.time), })), opts.range);
    if (!opts.range || opts.range === 'MAX') chart.timeScale().fitContent();
    return chart;
  },
  histogram(container, points, isDark, opts) {
    opts = opts || {};
    const chart = this.create(container, isDark);
    const series = chart.addSeries(LightweightCharts.HistogramSeries, {
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    const data = (points || []).filter((p) => p && p.date != null).map((p) => ({
      time: this.toBusinessDay(p.date),
      value: Number(p.value) || 0,
      color: p.color || ((Number(p.value) || 0) >= 0 ? '#16a34a' : '#dc2626'),
    }));
    series.setData(data);
    if (opts.refValue != null && typeof series.createPriceLine === 'function') {
      series.createPriceLine({ price: Number(opts.refValue), color: '#94a3b8', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: opts.refTitle || '' });
    }
    chart.timeScale().fitContent();
    return chart;
  },
  richLine(container, points, isDark, opts) {
    opts = opts || {};
    const mapped = this.mapLinePoints(points);
    const chart = this.create(container, isDark, { timeVisible: true });
    const col = opts.color || '#4f46e5';
    const series = opts.area
      ? chart.addSeries(LightweightCharts.AreaSeries, {
        lineColor: col, topColor: (opts.topColor || col + '44'), bottomColor: (opts.bottomColor || col + '0A'), lineWidth: 2,
      })
      : chart.addSeries(LightweightCharts.LineSeries, { color: col, lineWidth: 2 });
    series.setData(mapped);
    if (opts.compare && opts.compare.length) {
      const cmp = chart.addSeries(LightweightCharts.LineSeries, { color: opts.compareColor || '#94a3b8', lineWidth: 2, lineStyle: 2 });
      cmp.setData(this.mapLinePoints(opts.compare));
    }
    if (opts.refValue != null && typeof series.createPriceLine === 'function') {
      series.createPriceLine({ price: Number(opts.refValue), color: opts.refColor || '#94a3b8', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: opts.refTitle || '' });
    }
    const asTs = mapped.map((p) => ({ time: this.toUtcTs(`${p.time.year}-${String(p.time.month).padStart(2, '0')}-${String(p.time.day).padStart(2, '0')}`) }));
    this.applyRange(chart, asTs, opts.range || 'MAX');
    if (!opts.range || opts.range === 'MAX') chart.timeScale().fitContent();
    return chart;
  },
  priceChart(container, bars, opts) {
    opts = opts || {};
    const dark = !!opts.dark;
    const sorted = (bars || []).filter((b) => b && b.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const candles = this.mapOHLC(sorted);
    const panePct = Math.max(8, Math.min(40, Number(opts.indicatorPanePercent) || 18)) / 100;
    const showVol = opts.volume !== false;
    const showIbs = opts.ibs !== false;
    const extraPanes = (showVol ? 1 : 0) + (showIbs ? 1 : 0);
    const chart = this.create(container, dark, { timeVisible: true });
    const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626',
    });
    candleSeries.setData(candles);
    const emaStart = opts.emaStartMode || 'full_history';
    if (opts.ema20 !== false) {
      const ema20 = this.emaValues(sorted, 20, emaStart);
      const s20 = chart.addSeries(LightweightCharts.LineSeries, {
        color: opts.ema20Color || '#2563EB',
        lineWidth: this.lineWidth(opts.ema20Width, 2),
        lineStyle: this.lineStyle(opts.ema20Style, 0),
        priceLineVisible: false, lastValueVisible: false,
      });
      s20.setData(this.emaLineData(ema20, 1));
    }
    const bands = (opts.emaBands || []).filter((b) => b && b.enabled && Number.isFinite(Number(b.pct)));
    const zoneOn = (zs) => (zs || []).some((z) => z && z.enabled !== false && Number.isFinite(Number(z.levelPct)));
    const needEma200 = opts.ema200 !== false || bands.length > 0 || zoneOn(opts.buyZones) || zoneOn(opts.sellZones);
    if (needEma200) {
      const ema200 = this.emaValues(sorted, Number(opts.emaPeriod) || 200, emaStart);
      if (opts.ema200 !== false) {
        const s200 = chart.addSeries(LightweightCharts.LineSeries, {
          color: opts.ema200Color || '#F59E0B',
          lineWidth: this.lineWidth(opts.ema200Width, 2),
          lineStyle: this.lineStyle(opts.ema200Style, 0),
          priceLineVisible: false, lastValueVisible: false,
        });
        s200.setData(this.emaLineData(ema200, 1));
      }
      bands.forEach((b) => {
        const line = chart.addSeries(LightweightCharts.LineSeries, {
          color: b.color || '#64748B',
          lineWidth: this.lineWidth(b.width, 1),
          lineStyle: this.lineStyle(b.style, 2),
          priceLineVisible: false, lastValueVisible: false,
        });
        line.setData(this.emaLineData(ema200, 1 + Number(b.pct) / 100));
      });
      (opts.buyZones || []).filter((z) => z && z.enabled !== false).forEach((z) => {
        const lvl = Number(z.levelPct);
        if (!Number.isFinite(lvl)) return;
        const line = chart.addSeries(LightweightCharts.LineSeries, { color: '#10B981', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
        line.setData(this.emaLineData(ema200, 1 + lvl / 100));
      });
      (opts.sellZones || []).filter((z) => z && z.enabled !== false).forEach((z) => {
        const lvl = Number(z.levelPct);
        if (!Number.isFinite(lvl)) return;
        const line = chart.addSeries(LightweightCharts.LineSeries, { color: '#EF4444', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
        line.setData(this.emaLineData(ema200, 1 + lvl / 100));
      });
    }
    let pane = 1;
    if (showVol && LightweightCharts.HistogramSeries) {
      const vol = chart.addSeries(LightweightCharts.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'vol',
      }, extraPanes ? pane : undefined);
      vol.setData(sorted.map((b, i) => ({
        time: this.toBusinessDay(b.date),
        value: Number(b.volume) || 0,
        color: i > 0 && Number(b.close) < Number(sorted[i - 1].close) ? '#fca5a5' : '#86efac',
      })));
      try { chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); } catch (_) {}
      pane += 1;
    }
    if (showIbs) {
      const ibs = this.ibsValues(sorted);
      if (ibs.length) this.addIbsPane(chart, ibs, extraPanes ? pane : undefined, opts);
      try { chart.priceScale('ibs').applyOptions({ scaleMargins: { top: extraPanes > 1 ? 0.05 : (1 - panePct), bottom: 0 } }); } catch (_) {}
    }
    const markers = [];
    if (opts.showTrades !== false) {
      (opts.trades || []).forEach((t) => {
        if (!t || !t.entryDate) return;
        markers.push({ time: this.toBusinessDay(t.entryDate), position: 'belowBar', color: '#16a34a', shape: 'arrowUp', text: '' });
        if (t.exitDate && t.exitReason !== 'end_of_data') {
          markers.push({ time: this.toBusinessDay(t.exitDate), position: 'aboveBar', color: '#dc2626', shape: 'arrowDown', text: '' });
        }
      });
    }
    (opts.splits || []).forEach((ev) => {
      if (!ev || !ev.date) return;
      markers.push({ time: this.toBusinessDay(ev.date), position: 'inBar', color: '#f59e0b', shape: 'square', text: '×' + (ev.factor == null ? '' : ev.factor) });
    });
    this.mark(candleSeries, markers);
    this.applyRange(chart, candles.map((c) => ({ time: this.toUtcTs(`${c.time.year}-${String(c.time.month).padStart(2, '0')}-${String(c.time.day).padStart(2, '0')}`) })), opts.range || 'MAX');
    if (!opts.range || opts.range === 'MAX' || opts.range === 'ALL') chart.timeScale().fitContent();
    this.setWatermark(container, opts.ticker, { extraPanes, indicatorPanePercent: opts.indicatorPanePercent });
    return { chart, candles: sorted };
  },
  deviationChart(container, points, isDark, opts) {
    opts = opts || {};
    const chart = this.create(container, isDark, { timeVisible: true });
    const series = chart.addSeries(LightweightCharts.LineSeries, { color: opts.color || '#7c3aed', lineWidth: 2 });
    const mapped = this.mapLinePoints(points);
    series.setData(mapped);
    if (typeof series.createPriceLine === 'function') {
      series.createPriceLine({ price: 0, color: '#94a3b8', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '0' });
      (opts.buyZones || []).filter((z) => z && z.enabled !== false).forEach((z) => {
        series.createPriceLine({ price: Number(z.levelPct), color: '#10B981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(z.levelPct) });
      });
      (opts.sellZones || []).filter((z) => z && z.enabled !== false).forEach((z) => {
        series.createPriceLine({ price: Number(z.levelPct), color: '#EF4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(z.levelPct) });
      });
    }
    const markers = [];
    (opts.trades || []).forEach((t) => {
      if (!t || !t.entryDate) return;
      markers.push({ time: this.toBusinessDay(t.entryDate), position: 'belowBar', color: '#16a34a', shape: 'arrowUp', text: '' });
      if (t.exitDate && t.exitReason !== 'end_of_data') {
        markers.push({ time: this.toBusinessDay(t.exitDate), position: 'aboveBar', color: '#dc2626', shape: 'arrowDown', text: '' });
      }
    });
    this.mark(series, markers);
    chart.timeScale().fitContent();
    return chart;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Charts;
}
