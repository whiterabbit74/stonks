import { useEffect, useRef, useState, useMemo, memo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { formatOHLCYMD } from '../lib/utils';
import { toChartTimestamp } from '../lib/date-utils';
import type { OHLCData, Trade, SplitEvent } from '../types';
import { useAppStore } from '../stores';
import { logError } from '../lib/error-logger';

// Функция для расчета EMA (вынесена из компонента для предотвращения пересоздания)
const calculateEMA = (data: OHLCData[], period: number): number[] => {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // Первое значение - это SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i].close;
  }
  ema[period - 1] = sum / period;

  // Остальные значения - EMA
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i].close - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
};

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  splits?: SplitEvent[];
}

export const TradingChart = memo(function TradingChart({ data, trades, splits = [] }: TradingChartProps) {
  const MIN_CHART_HEIGHT = 520;
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ibsSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  const [chartReady, setChartReady] = useState(false);

  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  // По умолчанию оба скрыты
  const [showIBS, setShowIBS] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  // Refs to track current state for callbacks without triggering re-renders
  const showIBSRef = useRef(showIBS);
  const showVolumeRef = useRef(showVolume);

  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);
  const indicatorPanePercent = useAppStore(s => s.indicatorPanePercent);

  // Update refs when state changes
  useEffect(() => {
    showIBSRef.current = showIBS;
    showVolumeRef.current = showVolume;
  }, [showIBS, showVolume]);

  // Handle theme changes
  useEffect(() => {
    const onTheme = (e: any) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange' as any, onTheme as any);
    return () => {
      window.removeEventListener('themechange' as any, onTheme as any);
    };
  }, []);

  // 1. Initialize Chart (only when container is available and theme changes)
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Destroy existing chart if any (e.g. theme change)
    if (chartRef.current) {
        if (unsubscribeRef.current) unsubscribeRef.current();
        if (resizeHandlerRef.current) window.removeEventListener('resize', resizeHandlerRef.current);
        chartRef.current.remove();
        chartRef.current = null;

        // IMPORTANT: Clear series refs to avoid using disposed series
        candlestickSeriesRef.current = null;
        ibsSeriesRef.current = null;
        volumeSeriesRef.current = null;
        ema20SeriesRef.current = null;
        ema200SeriesRef.current = null;

        setChartReady(false);
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    }

    try {
      // Theme colors
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#1f2937';
      const grid = isDark ? '#1f2937' : '#eef2ff';
      const border = isDark ? '#374151' : '#e5e7eb';

      const el = chartContainerRef.current;
      const totalH = Math.max(el.clientHeight || 0, MIN_CHART_HEIGHT);
      const chart = createChart(el, {
        width: el.clientWidth,
        height: totalH,
        layout: { background: { color: bg }, textColor: text },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: border },
        timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 8 },
      });

      chartRef.current = chart;

      // Add Series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderUpColor: '#10B981',
        borderDownColor: '#EF4444',
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
        borderVisible: true,
      });
      candlestickSeriesRef.current = candlestickSeries;

      const volumeSeries = chart.addHistogramSeries({
        color: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)',
        priceFormat: { type: 'volume' as const },
        priceScaleId: '',
        base: 0,
        visible: false,
        title: 'Объём',
      });
      volumeSeriesRef.current = volumeSeries;

      const ibsHist = chart.addHistogramSeries({
        priceScaleId: '',
        base: 0,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        visible: false,
        title: 'IBS',
      });
      ibsSeriesRef.current = ibsHist;

      const ema20Series = chart.addLineSeries({
        color: isDark ? '#60a5fa' : '#2196F3',
        lineWidth: 2,
        title: 'EMA 20',
        visible: false,
      });
      ema20SeriesRef.current = ema20Series;

      const ema200Series = chart.addLineSeries({
        color: isDark ? '#fbbf24' : '#FF9800',
        lineWidth: 2,
        title: 'EMA 200',
        visible: false,
      });
      ema200SeriesRef.current = ema200Series;

      // Tooltip
      if (!tooltipRef.current) {
          const tooltipEl = document.createElement('div');
          tooltipEl.style.position = 'absolute';
          tooltipEl.style.left = '12px';
          tooltipEl.style.top = '8px';
          tooltipEl.style.zIndex = '10';
          tooltipEl.style.pointerEvents = 'none';
          tooltipEl.style.background = isDark ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
          tooltipEl.style.color = 'white';
          tooltipEl.style.padding = '6px 8px';
          tooltipEl.style.borderRadius = '6px';
          tooltipEl.style.fontSize = '12px';
          tooltipEl.style.backdropFilter = 'blur(4px)';
          tooltipEl.style.display = 'none';
          el.appendChild(tooltipEl);
          tooltipRef.current = tooltipEl;
      } else {
        // Update tooltip style for theme
        tooltipRef.current.style.background = isDark ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
      }

      const crosshairHandler = (param: any) => {
        if (!tooltipRef.current || !param || !param.time) {
          if (tooltipRef.current) tooltipRef.current.style.display = 'none';
          return;
        }
        const paramWithData = param as { seriesPrices?: Map<unknown, unknown>; seriesData?: Map<unknown, unknown> };
        const priceMap = paramWithData.seriesPrices;
        const seriesData = paramWithData.seriesData;
        if (!priceMap || !seriesData) {
          tooltipRef.current.style.display = 'none';
          return;
        }
        const price = priceMap.get(candlestickSeries as unknown as object);
        if (!price) {
          tooltipRef.current.style.display = 'none';
          return;
        }
        const bar = seriesData.get(candlestickSeries as unknown as object) as { open?: number; high?: number; low?: number; close?: number } | undefined;


        const vol = (showVolumeRef.current && volumeSeries) ? (seriesData.get(volumeSeries as any) as { value?: number } | undefined)?.value : undefined;

        const ibsVal = (showIBSRef.current && ibsHist) ? (seriesData.get(ibsHist as any) as { value?: number } | undefined)?.value : undefined;

        const o = bar?.open, h = bar?.high, l = bar?.low, c = bar?.close;
        const pct = o ? (((c! - o) / o) * 100) : 0;
        const ibsStr = (typeof ibsVal === 'number') ? ` · IBS ${(ibsVal * 100).toFixed(0)}%` : '';
        tooltipRef.current.textContent = `О ${o?.toFixed?.(2) ?? '-'} В ${h?.toFixed?.(2) ?? '-'} Н ${l?.toFixed?.(2) ?? '-'} З ${c?.toFixed?.(2) ?? '-'} · ${pct ? pct.toFixed(2) + '%' : ''}${ibsStr}${vol ? ' · Объём ' + vol.toLocaleString() : ''}`;
        tooltipRef.current.style.display = 'block';
      };

      unsubscribeRef.current = chart.subscribeCrosshairMove(crosshairHandler);

      // Resize Handler
      const handleResize = () => {
        if (!chartContainerRef.current || !chartRef.current) return;
        try {
          const w = chartContainerRef.current.clientWidth;
          const total = Math.max(chartContainerRef.current.clientHeight || 0, MIN_CHART_HEIGHT);

          if (chartRef.current && typeof (chartRef.current as any).applyOptions === 'function') {
             (chartRef.current as any).applyOptions({ width: w, height: total });
          }
        } catch {
           // ignore
        }
      };
      resizeHandlerRef.current = handleResize;
      window.addEventListener('resize', handleResize);

      setChartReady(true);

    } catch (error) {
      console.error('Error creating chart', error);
    }

    return () => {
      if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
      if (resizeHandlerRef.current) { window.removeEventListener('resize', resizeHandlerRef.current); resizeHandlerRef.current = null; }

      if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
      }

      // Cleanup series refs on unmount
      candlestickSeriesRef.current = null;
      ibsSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema200SeriesRef.current = null;

      if (tooltipRef.current && tooltipRef.current.parentElement) {
        try {
          tooltipRef.current.parentElement.removeChild(tooltipRef.current);
        } catch { /* ignore */ }
        tooltipRef.current = null;
      }
    };
  }, [isDark]); // Recreate chart only on theme change

  // Pre-calculate timestamps (Optimization: reduces parsing by 5x)
  const times = useMemo(() => {
    return data.map(d => {
        try {
            return toChartTimestamp(d.date);
        } catch {
            return 0 as UTCTimestamp;
        }
    });
  }, [data]);

  // Memoize data preparations to avoid recalculation on theme change or re-renders
  const chartData = useMemo(() => {
    if (!data.length) return [];
    return data.map((bar, i) => {
        const t = times[i];
        if (t === 0) return { time: 0 as UTCTimestamp, open: 0, high: 0, low: 0, close: 0 };
        return {
            time: t,
            open: Number(bar.open),
            high: Number(bar.high),
            low: Number(bar.low),
            close: Number(bar.close)
        };
    });
  }, [data, times]);

  const ema20Values = useMemo(() => calculateEMA(data, 20), [data]);
  const ema20Data = useMemo(() => {
    if (!data.length) return [];
    return data.map((_, index) => {
        const v = ema20Values[index];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        return { time: times[index], value: v };
    }).filter((p): p is {time: UTCTimestamp, value: number} => p !== null && p.time !== 0);
  }, [data, ema20Values, times]);

  const ema200Values = useMemo(() => calculateEMA(data, 200), [data]);
  const ema200Data = useMemo(() => {
    if (!data.length) return [];
    return data.map((_, index) => {
        const v = ema200Values[index];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        return { time: times[index], value: v };
    }).filter((p): p is {time: UTCTimestamp, value: number} => p !== null && p.time !== 0);
  }, [data, ema200Values, times]);

  const volumeData = useMemo(() => {
    if (!data.length) return [];
    return data.map((bar, i) => ({
        time: times[i],
        value: Number(bar.volume),
        color: bar.close >= bar.open ? (isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.6)') : (isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.6)')
    }));
  }, [data, isDark, times]);

  const ibsData = useMemo(() => {
     if (!data.length) return [];
     return data.map((bar, i) => {
        const range = Math.max(1e-9, bar.high - bar.low);
        const ibs = (bar.close - bar.low) / range;
        const color = ibs <= 0.10
            ? (isDark ? 'rgba(5,150,105,1)' : 'rgba(5,150,105,1)')
            : (ibs >= 0.75 ? (isDark ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.9)') : (isDark ? 'rgba(156,163,175,0.5)' : 'rgba(107,114,128,0.5)'));
        return { time: times[i], value: ibs, color };
     });
  }, [data, isDark, times]);

  // 2. Update Data
  useEffect(() => {
    if (!chartReady || !data.length || !candlestickSeriesRef.current) return;

    try {
        if (candlestickSeriesRef.current) candlestickSeriesRef.current.setData(chartData);

        // Initial time scale

        try { if (chartRef.current?.timeScale) (chartRef.current.timeScale() as any).applyOptions({ rightOffset: 8 }); } catch { /* ignore */ }

        if (volumeSeriesRef.current) {
            volumeSeriesRef.current.setData(volumeData);
        }

        if (ibsSeriesRef.current) {
             ibsSeriesRef.current.setData(ibsData);
        }

        if (ema20SeriesRef.current) {
            ema20SeriesRef.current.setData(ema20Data);
        }

        if (ema200SeriesRef.current) {
            ema200SeriesRef.current.setData(ema200Data);
        }

    } catch (e) {
        logError('chart', 'Error updating chart data', { error: (e as Error).message }, 'TradingChart.updateData');
    }

  }, [chartReady, data.length, chartData, volumeData, ibsData, ema20Data, ema200Data]);

  // 3. Update Markers
  useEffect(() => {
    if (!chartReady || !candlestickSeriesRef.current) return;

    const allMarkers: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }> = [];
      if (trades.length > 0) {
        allMarkers.push(
          ...trades.flatMap(trade => {
            const markers: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }> = [
              {
                time: toChartTimestamp(trade.entryDate),
                position: 'belowBar' as const,
                color: '#2196F3',
                shape: 'arrowUp' as const,
                text: '',
              },
            ];
            if (trade.exitReason !== 'end_of_data') {
              markers.push({
                time: toChartTimestamp(trade.exitDate),
                position: 'aboveBar' as const,
                color: '#2196F3',
                shape: 'arrowDown' as const,
                text: '',
              });
            }
            return markers;
          })
        );
      }
      if (splits.length > 0) {
        const ymdToTime = new Map<string, number>();
        for (const bar of data) {
          const ymd = formatOHLCYMD(bar.date);
          if (!ymdToTime.has(ymd)) ymdToTime.set(ymd, toChartTimestamp(bar.date));
        }
        const splitMarkers = splits.map(s => {
          const ymd = typeof s.date === 'string' ? s.date.slice(0, 10) : formatOHLCYMD(s.date);
          const t = ymdToTime.get(ymd) ?? toChartTimestamp(ymd);
          return {
            time: t as UTCTimestamp,
            position: 'belowBar' as const,
            color: '#9C27B0',
            shape: 'circle' as const,
            text: 'S',
          };
        });
        allMarkers.push(...splitMarkers);
      }
      try {
        if (candlestickSeriesRef.current && typeof candlestickSeriesRef.current.setMarkers === 'function') {
           candlestickSeriesRef.current.setMarkers(allMarkers);
        }
      } catch { /* ignore */ }
  }, [chartReady, trades, splits, data]); // Data needed for split date matching? Yes.

  // 4. Update Layout
  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    const indicatorFraction = Math.max(0.05, Math.min(0.4, indicatorPanePercent / 100));
    const priceBottomMargin = indicatorFraction + 0.1;
    const volumeTopMargin = 1 - indicatorFraction;

    try {

      const candlePriceScale = candlestickSeriesRef.current.priceScale() as any;
      if (candlePriceScale && typeof candlePriceScale.applyOptions === 'function') {
        candlePriceScale.applyOptions({
          scaleMargins: {
            top: 0.1,
            bottom: priceBottomMargin,
          },
        });
      }

      if (volumeSeriesRef.current) {

        const volPriceScale = volumeSeriesRef.current.priceScale() as any;
        if (volPriceScale && typeof volPriceScale.applyOptions === 'function') {
          volPriceScale.applyOptions({
            scaleMargins: {
              top: volumeTopMargin,
              bottom: 0,
            },
          });
        }
      }

      if (ibsSeriesRef.current) {

        const ibsPriceScale = ibsSeriesRef.current.priceScale() as any;
        if (ibsPriceScale && typeof ibsPriceScale.applyOptions === 'function') {
          ibsPriceScale.applyOptions({
            scaleMargins: {
              top: volumeTopMargin,
              bottom: 0,
            },
          });
        }
      }
    } catch {
      // ignore
    }
  }, [indicatorPanePercent, chartReady]);

  // 5. Update Visibility
  useEffect(() => {
    // Взаимоисключаемые индикаторы
    if (showIBS && showVolume) setShowVolume(false);
  }, [showIBS, showVolume]);

  useEffect(() => {

    const sIBS = ibsSeriesRef.current as any;
    if (sIBS && typeof sIBS.applyOptions === 'function') {
      try { sIBS.applyOptions({ visible: showIBS }); } catch { /* ignore */ }
    }


    const sVol = volumeSeriesRef.current as any;
    if (sVol && typeof sVol.applyOptions === 'function') {
      try { sVol.applyOptions({ visible: showVolume }); } catch { /* ignore */ }
    }


    const sEma20 = ema20SeriesRef.current as any;
    if (sEma20 && typeof sEma20.applyOptions === 'function') {
      try { sEma20.applyOptions({ visible: showEMA20 }); } catch { /* ignore */ }
    }


    const sEma200 = ema200SeriesRef.current as any;
    if (sEma200 && typeof sEma200.applyOptions === 'function') {
      try { sEma200.applyOptions({ visible: showEMA200 }); } catch { /* ignore */ }
    }
  }, [showIBS, showVolume, showEMA20, showEMA200, chartReady]);


  return (
    <div className="w-full grid grid-rows-[auto,1fr] gap-4 relative">
      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowEMA20(!showEMA20)}
          className={`px-3 py-1 text-sm rounded ${showEMA20
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          EMA 20
        </button>
        <button
          onClick={() => setShowEMA200(!showEMA200)}
          className={`px-3 py-1 text-sm rounded ${showEMA200
            ? 'bg-orange-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          EMA 200
        </button>
        <button
          onClick={() => { const next = !showIBS; setShowIBS(next); if (next) setShowVolume(false); }}
          className={`px-3 py-1 text-sm rounded ${showIBS
            ? 'bg-gray-700 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          title="Показать IBS"
          aria-label="Показать IBS"
        >
          IBS
        </button>
        <button
          onClick={() => { const next = !showVolume; setShowVolume(next); if (next) setShowIBS(false); }}
          className={`px-3 py-1 text-sm rounded ${showVolume
            ? 'bg-gray-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          title="Показать объём"
          aria-label="Показать объём"
        >
          Объём
        </button>
      </div>

      {/* Single Chart Container */}
      <div className="relative w-full h-full min-h-0">
         <div ref={chartContainerRef} className="w-full h-full overflow-hidden" />
         {!data.length && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900 z-10 text-gray-500">
               Нет данных для графика
            </div>
         )}
      </div>
    </div>
  );
});
