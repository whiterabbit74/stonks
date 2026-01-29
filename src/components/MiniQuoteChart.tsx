import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type IPriceLine, type UTCTimestamp } from 'lightweight-charts';
import type { OHLCData, Trade } from '../types';

interface MiniQuoteChartProps {
  history: OHLCData[];
  today: { open: number | null; high: number | null; low: number | null; current: number | null } | null;
  trades: Trade[];
  highIBS: number; // 0..1
  isOpenPosition: boolean;
  entryPrice?: number | null;
}

export function MiniQuoteChart({ history, today, trades, highIBS, isOpenPosition, entryPrice }: MiniQuoteChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Track price lines to remove them before updating
  const targetLineRef = useRef<IPriceLine | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  // 1. Data Preparation (Memoized)
  const candles = useMemo(() => {
    // If history is empty and no today data, return empty array
    const hasToday = !!(today && today.low != null && today.high != null && today.open != null && today.current != null);
    if (!history.length && !hasToday) return [];

    // TickerCard already slices history, but we do it again just in case or for safety
    // Optimization: Avoid expensive Date parsing in sort if possible, but history usually small here.
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const historyCount = hasToday ? 20 : 21;
    const lastHistory = sorted.slice(-historyCount);

    const data = lastHistory.map(b => ({
      time: Math.floor(new Date(b.date).getTime() / 1000) as UTCTimestamp,
      open: b.open, high: b.high, low: b.low, close: b.close,
    }));

    if (hasToday && today) {
      data.push({
        time: Math.floor(Date.now() / 1000) as UTCTimestamp,
        open: today.open as number,
        high: today.high as number,
        low: today.low as number,
        close: today.current as number,
      });
    }
    return data;
  }, [history, today]);

  // Keep ref to candles for resize handler
  const candlesRef = useRef(candles);
  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  const markers = useMemo(() => {
    if (!candles.length) return [];

    const minTime = candles[0].time as number;
    const maxTime = candles[candles.length - 1].time as number;
    const m: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }> = [];

    trades.forEach(t => {
      const entryTime = Math.floor(new Date(t.entryDate).getTime() / 1000) as UTCTimestamp;
      const exitTime = Math.floor(new Date(t.exitDate).getTime() / 1000) as UTCTimestamp;

      if ((entryTime as number) >= minTime && (entryTime as number) <= maxTime) {
        m.push({ time: entryTime, position: 'belowBar', color: 'rgba(5,150,105,0.65)', shape: 'arrowUp', text: '' });
      }
      if (t.exitReason !== 'end_of_data' && (exitTime as number) >= minTime && (exitTime as number) <= maxTime) {
        m.push({ time: exitTime, position: 'aboveBar', color: 'rgba(239,68,68,0.75)', shape: 'arrowDown', text: '' });
      }
    });
    return m;
  }, [candles, trades]);

  // 2. Theme Listener (Once)
  useEffect(() => {
    const onTheme = (e: Event) => {
      const dark = !!((e as any)?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  // 3. Chart Initialization (Once)
  useEffect(() => {
    if (!containerRef.current) return;

    // Initial colors (will be updated by effect below immediately)
    const bg = isDark ? '#0b1220' : '#ffffff';
    const text = isDark ? '#e5e7eb' : '#374151';
    const grid = isDark ? '#1f2937' : '#f5f5f5';
    const border = isDark ? '#374151' : '#e5e7eb';

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 140,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 0, fixLeftEdge: true, barSpacing: 10 },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      borderVisible: false,
    });
    seriesRef.current = series;

    try { chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } }); } catch { /* ignore */ }

    const onResize = () => {
      if (!containerRef.current || !chartRef.current) return;
      const w = containerRef.current.clientWidth;
      chartRef.current.applyOptions({ width: w, height: containerRef.current.clientHeight || 140 });

      // Update bar spacing based on current candles length
      try {
        const currentCandles = candlesRef.current;
        if (currentCandles.length) {
            const spacing = Math.max(4, Math.min(24, Math.floor((w * 0.7) / currentCandles.length)));
            chartRef.current.timeScale().applyOptions({ barSpacing: spacing });
        }
      } catch { /* ignore */ }
    };

    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        targetLineRef.current = null;
        entryLineRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once

  // 4. Update Chart Data & Options (When candles or theme changes)
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !containerRef.current) return;

    // Update Theme Options
    const bg = isDark ? '#0b1220' : '#ffffff';
    const text = isDark ? '#e5e7eb' : '#374151';
    const grid = isDark ? '#1f2937' : '#f5f5f5';
    const border = isDark ? '#374151' : '#e5e7eb';

    chart.applyOptions({
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    });

    // Update Data
    if (candles.length > 0) {
       series.setData(candles);

       // Update TimeScale Spacing
       const width = containerRef.current.clientWidth || 300;
       const targetRatio = 0.7;
       const spacing = Math.max(4, Math.min(24, Math.floor((width * targetRatio) / candles.length)));
       const rightOffset = Math.max(1, Math.round(candles.length * 0.05));
       try { chart.timeScale().applyOptions({ rightOffset, barSpacing: spacing }); } catch { /* ignore */ }
    }
  }, [candles, isDark]);

  // 5. Update Markers & Lines (When logic changes)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Update Markers
    series.setMarkers(markers);

    // Update Price Lines
    // Remove existing lines
    if (targetLineRef.current) {
      series.removePriceLine(targetLineRef.current);
      targetLineRef.current = null;
    }
    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }

    const hasToday = !!(today && today.low != null && today.high != null && today.open != null && today.current != null);

    // Add Target Price Line
    if (isOpenPosition && hasToday && (today!.high as number) > (today!.low as number)) {
      const target = (today!.low as number) + highIBS * ((today!.high as number) - (today!.low as number));
      targetLineRef.current = series.createPriceLine({
        price: target,
        color: '#8B5CF6',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Цель IBS'
      });
    }

    // Add Entry Price Line
    if (isOpenPosition && typeof entryPrice === 'number') {
      entryLineRef.current = series.createPriceLine({
        price: entryPrice,
        color: '#9CA3AF',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Вход'
      });
    }

  }, [markers, isOpenPosition, highIBS, entryPrice, today]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[120px] overflow-hidden" />
  );
}
