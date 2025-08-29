import React, { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { OHLCData, Trade } from '../types';

interface OpenDayDrawdownChartProps {
  trades: Trade[];
  data: OHLCData[];
}

export function OpenDayDrawdownChart({ trades, data }: OpenDayDrawdownChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  useEffect(() => {
    const onTheme = (e: any) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  // Map OHLC by YYYY-MM-DD for fast lookup
  const dateKey = (d: Date) => {
    try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d).slice(0, 10); }
  };
  const ohlcByDay = new Map<string, OHLCData>();
  for (const bar of data) {
    ohlcByDay.set(dateKey(bar.date), bar);
  }

  const rows = trades.map((t) => {
    const bar = ohlcByDay.get(dateKey(t.entryDate));
    if (!bar) return { time: Math.floor(t.entryDate.getTime() / 1000) as UTCTimestamp, value: 0, open: 0, low: 0 };
    const dropPct = bar.open > 0 ? ((bar.open - bar.low) / bar.open) * 100 : 0; // % drop from open to low
    return {
      time: Math.floor(t.entryDate.getTime() / 1000) as UTCTimestamp,
      value: -dropPct, // negative to show drawdown below zero
      open: bar.open,
      low: bar.low,
    };
  });

  const avgDrop = rows.reduce((s, r) => s + Math.abs(r.value), 0) / Math.max(1, rows.length);
  const maxDrop = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0);

  useEffect(() => {
    if (!containerRef.current || rows.length === 0) return;

    if (chartRef.current) {
      try { chartRef.current.remove(); } catch {}
      chartRef.current = null;
    }

    const bg = isDark ? '#0b1220' : '#ffffff';
    const text = isDark ? '#e5e7eb' : '#1f2937';
    const grid = isDark ? '#1f2937' : '#eef2ff';
    const border = isDark ? '#374151' : '#e5e7eb';

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: Math.max(containerRef.current.clientHeight || 0, 360),
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    const series: ISeriesApi<'Histogram'> = chart.addHistogramSeries({
      color: isDark ? 'rgba(239,68,68,0.85)' : 'rgba(239,68,68,0.9)',
      base: 0,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: 'Просадка от открытия, %',
    });

    series.setData(rows.map(r => ({ time: r.time, value: r.value })));

    try {
      series.createPriceLine({ price: 0, color: '#9CA3AF', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '0%' });
      series.createPriceLine({ price: -avgDrop, color: '#9CA3AF', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Средняя' });
    } catch {}

    const handleResize = () => {
      if (!containerRef.current || !chart) return;
      chart.applyOptions({ width: containerRef.current.clientWidth, height: Math.max(containerRef.current.clientHeight || 0, 360) });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      try { chart.remove(); } catch {}
    };
  }, [isDark, rows]);

  if (!rows.length) {
    return <div className="text-gray-500">Нет данных для графика просадки в день открытия</div>;
  }

  return (
    <div className="w-full h-full">
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <div className="bg-red-50 px-3 py-2 rounded border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300">
          Средняя просадка в день открытия: {avgDrop.toFixed(2)}%
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
          Максимальная просадка: {maxDrop.toFixed(2)}%
        </div>
      </div>
      <div ref={containerRef} className="w-full h-[600px] min-h-0 overflow-hidden" />
    </div>
  );
}