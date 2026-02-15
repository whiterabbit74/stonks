import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { OHLCData, Trade } from '../types';
import { toChartTimestamp } from '../lib/date-utils';

interface MiniQuoteChartProps {
  history: OHLCData[];
  today: { open: number | null; high: number | null; low: number | null; current: number | null } | null;
  trades: Trade[];
  highIBS: number;
  isOpenPosition: boolean;
  entryPrice?: number | null;
}

export function MiniQuoteChart({ history, today, trades, highIBS, isOpenPosition, entryPrice }: MiniQuoteChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const targetLineRef = useRef<IPriceLine | null>(null);
  const entryLineRef = useRef<IPriceLine | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  const candles = useMemo(() => {
    const hasToday = !!(today && today.low != null && today.high != null && today.open != null && today.current != null);
    if (!history.length && !hasToday) return [];

    const sorted = [...history].sort((a, b) => {
      const ta = toChartTimestamp(a.date) as number;
      const tb = toChartTimestamp(b.date) as number;
      return ta - tb;
    });

    const historyCount = hasToday ? 20 : 21;
    const lastHistory = sorted.slice(-historyCount);

    const data = lastHistory.map((bar) => ({
      time: toChartTimestamp(bar.date),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    }));

    if (hasToday && today) {
      data.push({
        time: toChartTimestamp(new Date()),
        open: today.open as number,
        high: today.high as number,
        low: today.low as number,
        close: today.current as number,
      });
    }

    return data;
  }, [history, today]);

  const markers = useMemo(() => {
    if (!candles.length) return [] as SeriesMarker<Time>[];

    const minTime = candles[0].time as number;
    const maxTime = candles[candles.length - 1].time as number;
    const output: SeriesMarker<Time>[] = [];

    trades.forEach((trade) => {
      const entryTime = toChartTimestamp(trade.entryDate) as number;
      const exitTime = toChartTimestamp(trade.exitDate) as number;

      if (entryTime >= minTime && entryTime <= maxTime) {
        output.push({
          time: entryTime as UTCTimestamp,
          position: 'belowBar',
          color: 'rgba(5,150,105,0.65)',
          shape: 'arrowUp',
          text: '',
        });
      }

      if (trade.exitReason !== 'end_of_data' && exitTime >= minTime && exitTime <= maxTime) {
        output.push({
          time: exitTime as UTCTimestamp,
          position: 'aboveBar',
          color: 'rgba(239,68,68,0.75)',
          shape: 'arrowDown',
          text: '',
        });
      }
    });

    return output;
  }, [candles, trades]);

  useEffect(() => {
    const onTheme = (e: Event) => {
      const dark = !!((e as CustomEvent<{ effectiveDark?: boolean }>).detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const darkNow = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false;
    const bg = darkNow ? '#0b1220' : '#ffffff';
    const text = darkNow ? '#e5e7eb' : '#374151';
    const grid = darkNow ? '#1f2937' : '#f5f5f5';
    const border = darkNow ? '#374151' : '#e5e7eb';

    const chart = createChart(containerRef.current, {
      autoSize: true,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 140,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 0,
        fixLeftEdge: true,
        barSpacing: 10,
      },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      borderVisible: false,
    });
    seriesRef.current = series;
    markersApiRef.current = createSeriesMarkers(series, []);

    try {
      chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.15, bottom: 0.15 },
      });
    } catch {
      // ignore
    }

    return () => {
      markersApiRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      seriesRef.current = null;
      targetLineRef.current = null;
      entryLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !containerRef.current) return;

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

    if (candles.length > 0) {
      series.setData(candles);
      const width = containerRef.current.clientWidth || 300;
      const spacing = Math.max(4, Math.min(24, Math.floor((width * 0.7) / candles.length)));
      const rightOffset = Math.max(1, Math.round(candles.length * 0.05));
      chart.timeScale().applyOptions({ rightOffset, barSpacing: spacing });
    }
  }, [candles, isDark]);

  useEffect(() => {
    markersApiRef.current?.setMarkers(markers);

    const series = seriesRef.current;
    if (!series) return;

    if (targetLineRef.current) {
      series.removePriceLine(targetLineRef.current);
      targetLineRef.current = null;
    }

    if (entryLineRef.current) {
      series.removePriceLine(entryLineRef.current);
      entryLineRef.current = null;
    }

    const hasToday = !!(today && today.low != null && today.high != null && today.open != null && today.current != null);

    if (isOpenPosition && hasToday && (today!.high as number) > (today!.low as number)) {
      const target = (today!.low as number) + highIBS * ((today!.high as number) - (today!.low as number));
      targetLineRef.current = series.createPriceLine({
        price: target,
        color: '#8B5CF6',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Цель IBS',
      });
    }

    if (isOpenPosition && typeof entryPrice === 'number') {
      entryLineRef.current = series.createPriceLine({
        price: entryPrice,
        color: '#9CA3AF',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Вход',
      });
    }
  }, [markers, isOpenPosition, highIBS, entryPrice, today]);

  return <div ref={containerRef} className="w-full h-full min-h-[120px] overflow-hidden" />;
}
