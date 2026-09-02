const Charts = {
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
  create(container, isDark) {
    const c = this.colors(isDark);
    return LightweightCharts.createChart(container, {
      autoSize: true,
      layout: { background: { color: c.bg }, textColor: c.text, fontFamily: 'Inter, system-ui, sans-serif' },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
  },
  candles(container, bars, isDark) {
    const chart = this.create(container, isDark);
    const series = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626',
    });
    series.setData((bars || []).map((b) => ({
      time: this.toBusinessDay(b.date), open: b.open, high: b.high, low: b.low, close: b.close,
    })));
    chart.timeScale().fitContent();
    return chart;
  },
  line(container, points, isDark, color) {
    const chart = this.create(container, isDark);
    const series = chart.addSeries(LightweightCharts.LineSeries, { color: color || '#4f46e5', lineWidth: 2 });
    series.setData((points || []).map((p) => ({ time: this.toBusinessDay(p.date), value: p.value })));
    chart.timeScale().fitContent();
    return chart;
  },
};
