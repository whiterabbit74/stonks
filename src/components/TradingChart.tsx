import { useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatOHLCYMD } from '../lib/utils';
import { toChartTimestamp } from '../lib/date-utils';
import type { OHLCData, Trade, SplitEvent } from '../types';
import { useAppStore } from '../stores';
import { logError } from '../lib/error-logger';

const MIN_CHART_HEIGHT = 680;

type RangeKey = 'ALL' | 'YTD' | '5Y' | '3Y' | '1Y' | '6M' | '3M' | '1M';
const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '1M', label: '1 месяц' },
  { value: '3M', label: '3 месяца' },
  { value: '6M', label: '6 месяцев' },
  { value: '1Y', label: '1 год' },
  { value: '3Y', label: '3 года' },
  { value: '5Y', label: '5 лет' },
  { value: 'YTD', label: 'С начала года' },
  { value: 'ALL', label: 'Весь период' },
];

const calculateEMA = (data: OHLCData[], period: number): number[] => {
  if (data.length < period) return [];

  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i].close - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
};

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  splits?: SplitEvent[];
  isVisible?: boolean;
}

export const TradingChart = memo(function TradingChart({ data, trades, splits = [], isVisible = true }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const indicatorMenuRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ibsSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const crosshairHandlerRef = useRef<((param: MouseEventParams<Time>) => void) | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const [chartReady, setChartReady] = useState(false);
  const [activeRange, setActiveRange] = useState<RangeKey>('3Y');

  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  const [showIBS, setShowIBS] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);

  const showIBSRef = useRef(showIBS);
  const showVolumeRef = useRef(showVolume);

  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );
  const indicatorPanePercent = useAppStore((s) => s.indicatorPanePercent);

  useEffect(() => {
    showIBSRef.current = showIBS;
    showVolumeRef.current = showVolume;
  }, [showIBS, showVolume]);

  useEffect(() => {
    if (!showIndicatorsMenu) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!indicatorMenuRef.current) return;
      if (!indicatorMenuRef.current.contains(event.target as Node)) {
        setShowIndicatorsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showIndicatorsMenu]);

  useEffect(() => {
    const onTheme = (e: Event) => {
      const dark = !!((e as CustomEvent<{ effectiveDark?: boolean }>).detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const el = chartContainerRef.current;
    const darkNow = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false;
    const bg = darkNow ? '#0b1220' : '#ffffff';
    const text = darkNow ? '#e5e7eb' : '#1f2937';
    const grid = darkNow ? '#1f2937' : '#eef2ff';
    const border = darkNow ? '#374151' : '#e5e7eb';

    const chart = createChart(el, {
      autoSize: true,
      width: el.clientWidth,
      height: Math.max(el.clientHeight || 0, MIN_CHART_HEIGHT),
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 8 },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      borderVisible: true,
    });
    candlestickSeriesRef.current = candlestickSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: darkNow ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      base: 0,
      visible: false,
      title: 'Объём',
    });
    volumeSeriesRef.current = volumeSeries;

    const ibsHist = chart.addSeries(HistogramSeries, {
      priceScaleId: '',
      base: 0,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      visible: false,
      title: 'IBS',
    });
    ibsSeriesRef.current = ibsHist;

    const ema20Series = chart.addSeries(LineSeries, {
      color: darkNow ? '#60a5fa' : '#2196F3',
      lineWidth: 2,
      title: 'EMA 20',
      visible: false,
    });
    ema20SeriesRef.current = ema20Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: darkNow ? '#fbbf24' : '#FF9800',
      lineWidth: 2,
      title: 'EMA 200',
      visible: false,
    });
    ema200SeriesRef.current = ema200Series;

    markersApiRef.current = createSeriesMarkers(candlestickSeries, []);

    const tooltipEl = document.createElement('div');
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.left = '12px';
    tooltipEl.style.top = '8px';
    tooltipEl.style.zIndex = '10';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.background = darkNow ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
    tooltipEl.style.color = 'white';
    tooltipEl.style.padding = '6px 8px';
    tooltipEl.style.borderRadius = '6px';
    tooltipEl.style.fontSize = '12px';
    tooltipEl.style.backdropFilter = 'blur(4px)';
    tooltipEl.style.display = 'none';
    el.appendChild(tooltipEl);
    tooltipRef.current = tooltipEl;

    const crosshairHandler = (param: MouseEventParams<Time>) => {
      if (!tooltipRef.current || !param.time || !param.seriesData) {
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        return;
      }

      const candleData = param.seriesData.get(candlestickSeries) as { open?: number; high?: number; low?: number; close?: number } | undefined;
      if (!candleData) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const vol = showVolumeRef.current ? (param.seriesData.get(volumeSeries) as { value?: number } | undefined)?.value : undefined;
      const ibsVal = showIBSRef.current ? (param.seriesData.get(ibsHist) as { value?: number } | undefined)?.value : undefined;

      const o = candleData.open;
      const h = candleData.high;
      const l = candleData.low;
      const c = candleData.close;
      const pct = typeof o === 'number' && typeof c === 'number' && o !== 0 ? ((c - o) / o) * 100 : null;
      const ibsStr = typeof ibsVal === 'number' ? ` · IBS ${(ibsVal * 100).toFixed(0)}%` : '';
      const volStr = typeof vol === 'number' ? ` · Объём ${vol.toLocaleString()}` : '';
      const pctStr = typeof pct === 'number' ? ` · ${pct.toFixed(2)}%` : '';

      tooltipRef.current.textContent = `О ${o?.toFixed?.(2) ?? '-'} В ${h?.toFixed?.(2) ?? '-'} Н ${l?.toFixed?.(2) ?? '-'} З ${c?.toFixed?.(2) ?? '-'}${pctStr}${ibsStr}${volStr}`;
      tooltipRef.current.style.display = 'block';
    };

    crosshairHandlerRef.current = crosshairHandler;
    chart.subscribeCrosshairMove(crosshairHandler);

    setChartReady(true);

    return () => {
      if (crosshairHandlerRef.current && chartRef.current) {
        try {
          chartRef.current.unsubscribeCrosshairMove(crosshairHandlerRef.current);
        } catch {
          // ignore
        }
      }
      crosshairHandlerRef.current = null;
      markersApiRef.current = null;

      if (tooltipRef.current && tooltipRef.current.parentElement) {
        try {
          tooltipRef.current.parentElement.removeChild(tooltipRef.current);
        } catch {
          // ignore
        }
      }
      tooltipRef.current = null;

      candlestickSeriesRef.current = null;
      ibsSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema200SeriesRef.current = null;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    const bg = isDark ? '#0b1220' : '#ffffff';
    const text = isDark ? '#e5e7eb' : '#1f2937';
    const grid = isDark ? '#1f2937' : '#eef2ff';
    const border = isDark ? '#374151' : '#e5e7eb';

    chartRef.current.applyOptions({
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    });

    if (tooltipRef.current) {
      tooltipRef.current.style.background = isDark ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
    }

    ema20SeriesRef.current?.applyOptions({ color: isDark ? '#60a5fa' : '#2196F3' });
    ema200SeriesRef.current?.applyOptions({ color: isDark ? '#fbbf24' : '#FF9800' });
    volumeSeriesRef.current?.applyOptions({ color: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)' });
  }, [isDark]);

  const times = useMemo(
    () =>
      data.map((d) => {
        try {
          return toChartTimestamp(d.date);
        } catch {
          return 0 as UTCTimestamp;
        }
      }),
    [data]
  );

  const chartData = useMemo(() => {
    if (!data.length) return [];
    return data
      .map((bar, i) => {
        const t = times[i];
        if (t === 0) return null;
        return {
          time: t,
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
        };
      })
      .filter((point): point is { time: UTCTimestamp; open: number; high: number; low: number; close: number } => point !== null);
  }, [data, times]);

  const ema20Values = useMemo(() => calculateEMA(data, 20), [data]);
  const ema20Data = useMemo(
    () =>
      data
        .map((_, index) => {
          const v = ema20Values[index];
          const t = times[index];
          if (typeof v !== 'number' || !Number.isFinite(v) || t === 0) return null;
          return { time: t, value: v };
        })
        .filter((p): p is { time: UTCTimestamp; value: number } => p !== null),
    [data, ema20Values, times]
  );

  const ema200Values = useMemo(() => calculateEMA(data, 200), [data]);
  const ema200Data = useMemo(
    () =>
      data
        .map((_, index) => {
          const v = ema200Values[index];
          const t = times[index];
          if (typeof v !== 'number' || !Number.isFinite(v) || t === 0) return null;
          return { time: t, value: v };
        })
        .filter((p): p is { time: UTCTimestamp; value: number } => p !== null),
    [data, ema200Values, times]
  );

  const volumeData = useMemo(
    () =>
      data
        .map((bar, i) => {
          const t = times[i];
          if (t === 0) return null;
          return {
            time: t,
            value: Number(bar.volume),
            color:
              bar.close >= bar.open
                ? isDark
                  ? 'rgba(16, 185, 129, 0.45)'
                  : 'rgba(16, 185, 129, 0.6)'
                : isDark
                  ? 'rgba(239, 68, 68, 0.45)'
                  : 'rgba(239, 68, 68, 0.6)',
          };
        })
        .filter((point): point is { time: UTCTimestamp; value: number; color: string } => point !== null),
    [data, isDark, times]
  );

  const ibsData = useMemo(
    () =>
      data
        .map((bar, i) => {
          const t = times[i];
          if (t === 0) return null;

          const range = Math.max(1e-9, bar.high - bar.low);
          const ibs = (bar.close - bar.low) / range;
          const color =
            ibs <= 0.1
              ? 'rgba(5,150,105,1)'
              : ibs >= 0.75
                ? 'rgba(239,68,68,0.9)'
                : isDark
                  ? 'rgba(156,163,175,0.5)'
                  : 'rgba(107,114,128,0.5)';

          return { time: t, value: ibs, color };
        })
        .filter((point): point is { time: UTCTimestamp; value: number; color: string } => point !== null),
    [data, isDark, times]
  );

  useEffect(() => {
    if (!chartReady || !candlestickSeriesRef.current) return;

    try {
      candlestickSeriesRef.current.setData(chartData);
      volumeSeriesRef.current?.setData(volumeData);
      ibsSeriesRef.current?.setData(ibsData);
      ema20SeriesRef.current?.setData(ema20Data);
      ema200SeriesRef.current?.setData(ema200Data);
    } catch (e) {
      logError('chart', 'Error updating chart data', { error: (e as Error).message }, 'TradingChart.updateData');
    }
  }, [chartReady, chartData, volumeData, ibsData, ema20Data, ema200Data]);

  useEffect(() => {
    if (!chartReady || !markersApiRef.current) return;

    const allMarkers: SeriesMarker<Time>[] = [];

    if (trades.length > 0) {
      allMarkers.push(
        ...trades.flatMap((trade) => {
          const markers: SeriesMarker<Time>[] = [
            {
              time: toChartTimestamp(trade.entryDate),
              position: 'belowBar',
              color: '#2196F3',
              shape: 'arrowUp',
              text: '',
            },
          ];

          if (trade.exitReason !== 'end_of_data') {
            markers.push({
              time: toChartTimestamp(trade.exitDate),
              position: 'aboveBar',
              color: '#2196F3',
              shape: 'arrowDown',
              text: '',
            });
          }

          return markers;
        })
      );
    }

    if (splits.length > 0) {
      const ymdToTime = new Map<string, UTCTimestamp>();
      for (const bar of data) {
        const ymd = formatOHLCYMD(bar.date);
        if (!ymdToTime.has(ymd)) ymdToTime.set(ymd, toChartTimestamp(bar.date));
      }

      const splitMarkers: SeriesMarker<Time>[] = splits.map((split) => {
        const ymd = typeof split.date === 'string' ? split.date.slice(0, 10) : formatOHLCYMD(split.date);
        return {
          time: ymdToTime.get(ymd) ?? toChartTimestamp(ymd),
          position: 'belowBar',
          color: '#9C27B0',
          shape: 'circle',
          text: 'S',
        };
      });

      allMarkers.push(...splitMarkers);
    }

    markersApiRef.current.setMarkers(allMarkers);
  }, [chartReady, trades, splits, data]);

  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    const hasIndicatorPane = showIBS || showVolume;

    if (hasIndicatorPane) {
      const indicatorFraction = Math.max(0.05, Math.min(0.4, indicatorPanePercent / 100));
      const priceBottomMargin = indicatorFraction + 0.1;
      const indicatorTopMargin = 1 - indicatorFraction;

      candlestickSeriesRef.current.priceScale().applyOptions({
        scaleMargins: {
          top: 0.08,
          bottom: priceBottomMargin,
        },
      });

      volumeSeriesRef.current?.priceScale().applyOptions({
        scaleMargins: {
          top: indicatorTopMargin,
          bottom: 0,
        },
      });

      ibsSeriesRef.current?.priceScale().applyOptions({
        scaleMargins: {
          top: indicatorTopMargin,
          bottom: 0,
        },
      });
      return;
    }

    // Do not reserve indicator space when indicator panes are hidden.
    candlestickSeriesRef.current.priceScale().applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.06,
      },
    });

    volumeSeriesRef.current?.priceScale().applyOptions({
      scaleMargins: {
        top: 0.88,
        bottom: 0,
      },
    });

    ibsSeriesRef.current?.priceScale().applyOptions({
      scaleMargins: {
        top: 0.88,
        bottom: 0,
      },
    });
  }, [indicatorPanePercent, chartReady, showIBS, showVolume]);

  useEffect(() => {
    ibsSeriesRef.current?.applyOptions({ visible: showIBS });
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
    ema20SeriesRef.current?.applyOptions({ visible: showEMA20 });
    ema200SeriesRef.current?.applyOptions({ visible: showEMA200 });
  }, [showIBS, showVolume, showEMA20, showEMA200, chartReady]);

  useEffect(() => {
    if (!chartRef.current || !chartData.length) return;

    const rightEdge = chartData[chartData.length - 1].time as number;
    const leftEdge = chartData[0].time as number;

    if (activeRange === 'ALL') {
      chartRef.current.timeScale().fitContent();
      return;
    }

    let from = leftEdge;
    if (activeRange === 'YTD') {
      const rightEdgeDate = new Date(rightEdge * 1000);
      const ytdStart = Math.floor(Date.UTC(rightEdgeDate.getUTCFullYear(), 0, 1) / 1000);
      from = Math.max(leftEdge, ytdStart);
    } else {
      const daysByRange: Record<Exclude<RangeKey, 'ALL' | 'YTD'>, number> = {
        '5Y': 365 * 5,
        '3Y': 365 * 3,
        '1Y': 365,
        '6M': 180,
        '3M': 90,
        '1M': 30,
      };

      const days = daysByRange[activeRange];
      from = Math.max(leftEdge, rightEdge - days * 24 * 60 * 60);
    }

    chartRef.current.timeScale().setVisibleRange({
      from: from as UTCTimestamp,
      to: rightEdge as UTCTimestamp,
    });
  }, [activeRange, chartData]);

  // The chart can receive zero size while parent tab is hidden (`display: none`).
  // Force a resize when the tab becomes visible again to restore rendering.
  useEffect(() => {
    if (!isVisible || !chartRef.current || !chartContainerRef.current) return;

    const resizeWhenVisible = () => {
      const el = chartContainerRef.current;
      const chart = chartRef.current;
      if (!el || !chart) return;

      const width = el.clientWidth;
      const height = Math.max(el.clientHeight || 0, MIN_CHART_HEIGHT);
      if (width <= 0 || height <= 0) return;

      chart.resize(width, height);
      if (activeRange === 'ALL') {
        chart.timeScale().fitContent();
      }
    };

    const raf1 = requestAnimationFrame(() => {
      resizeWhenVisible();
      requestAnimationFrame(resizeWhenVisible);
    });

    return () => cancelAnimationFrame(raf1);
  }, [isVisible, activeRange, chartData.length]);

  const indicatorsCount = Number(showEMA20) + Number(showEMA200) + Number(showIBS) + Number(showVolume);

  return (
    <div className="w-full grid grid-rows-[auto,1fr] gap-2 relative">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
          <span className="font-medium">Период</span>
          <select
            value={activeRange}
            onChange={(event) => setActiveRange(event.target.value as RangeKey)}
            className="min-w-[180px] rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            aria-label="Период отображения"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div ref={indicatorMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowIndicatorsMenu((prev) => !prev)}
            className="inline-flex h-[38px] items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
            aria-haspopup="menu"
            aria-expanded={showIndicatorsMenu}
            title="Выбор индикаторов"
          >
            Индикаторы{indicatorsCount > 0 ? ` (${indicatorsCount})` : ''}
          </button>

          {showIndicatorsMenu && (
            <div className="absolute left-0 top-full z-20 mt-1.5 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                <input type="checkbox" checked={showEMA20} onChange={() => setShowEMA20((prev) => !prev)} />
                <span>EMA 20</span>
              </label>
              <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                <input type="checkbox" checked={showEMA200} onChange={() => setShowEMA200((prev) => !prev)} />
                <span>EMA 200</span>
              </label>
              <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                <input type="checkbox" checked={showIBS} onChange={() => setShowIBS((prev) => !prev)} />
                <span>IBS</span>
              </label>
              <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                <input type="checkbox" checked={showVolume} onChange={() => setShowVolume((prev) => !prev)} />
                <span>Объём</span>
              </label>
            </div>
          )}
        </div>
      </div>

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
