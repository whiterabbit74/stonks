import { useEffect, useMemo, useRef, useState, memo, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
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
type LineWidth = 1 | 2 | 3;
type MarkerShape = 'arrow' | 'circle' | 'square';

const MARKER_COLORS = ['#2196F3', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6'] as const;
const RANGE_OPTIONS: Array<{ value: RangeKey; label: string; short: string }> = [
  { value: '1M', label: '1 месяц', short: '1М' },
  { value: '3M', label: '3 месяца', short: '3М' },
  { value: '6M', label: '6 месяцев', short: '6М' },
  { value: '1Y', label: '1 год', short: '1Y' },
  { value: '3Y', label: '3 года', short: '3Y' },
  { value: '5Y', label: '5 лет', short: '5Y' },
  { value: 'YTD', label: 'С начала года', short: 'YTD' },
  { value: 'ALL', label: 'Весь период', short: 'Всё' },
];

const CHART_PREFS_KEY = 'chart-prefs';

interface ChartPrefs {
  range?: RangeKey;
  ema20?: boolean;
  ema200?: boolean;
  ibs?: boolean;
  volume?: boolean;
  ema20Width?: LineWidth;
  ema20Style?: 0 | 2;
  ema200Width?: LineWidth;
  ema200Style?: 0 | 2;
  showTradeMarkers?: boolean;
  tradeMarkerColor?: string;
  tradeMarkerShape?: MarkerShape;
}

function loadChartPrefs(): ChartPrefs | null {
  try {
    const raw = localStorage.getItem(CHART_PREFS_KEY);
    return raw ? (JSON.parse(raw) as ChartPrefs) : null;
  } catch {
    return null;
  }
}

function saveChartPrefs(prefs: ChartPrefs) {
  try { localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

const calculateEMA = (data: Array<{ close: number }>, period: number): number[] => {
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
  toolbarPrefix?: ReactNode;
}

export const TradingChart = memo(function TradingChart({ data, trades, splits = [], isVisible = true, toolbarPrefix }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
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
  const [activeRange, setActiveRange] = useState<RangeKey>(() => loadChartPrefs()?.range ?? '3Y');

  const [showEMA20, setShowEMA20] = useState(() => loadChartPrefs()?.ema20 ?? false);
  const [showEMA200, setShowEMA200] = useState(() => loadChartPrefs()?.ema200 ?? false);
  const [showIBS, setShowIBS] = useState(() => loadChartPrefs()?.ibs ?? false);
  const [showVolume, setShowVolume] = useState(() => loadChartPrefs()?.volume ?? false);

  const [ema20Width, setEma20Width] = useState<LineWidth>(() => (loadChartPrefs()?.ema20Width as LineWidth) ?? 2);
  const [ema20LineStyle, setEma20LineStyle] = useState<0 | 2>(() => (loadChartPrefs()?.ema20Style as 0 | 2) ?? 0);
  const [ema200Width, setEma200Width] = useState<LineWidth>(() => (loadChartPrefs()?.ema200Width as LineWidth) ?? 2);
  const [ema200LineStyle, setEma200LineStyle] = useState<0 | 2>(() => (loadChartPrefs()?.ema200Style as 0 | 2) ?? 0);
  const [showTradeMarkers, setShowTradeMarkers] = useState<boolean>(() => loadChartPrefs()?.showTradeMarkers ?? true);
  const [tradeMarkerColor, setTradeMarkerColor] = useState<string>(() => loadChartPrefs()?.tradeMarkerColor ?? '#2196F3');
  const [tradeMarkerShape, setTradeMarkerShape] = useState<MarkerShape>(() => (loadChartPrefs()?.tradeMarkerShape as MarkerShape) ?? 'arrow');
  const [showChartSettings, setShowChartSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

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
    saveChartPrefs({ range: activeRange, ema20: showEMA20, ema200: showEMA200, ibs: showIBS, volume: showVolume, ema20Width, ema20Style: ema20LineStyle, ema200Width, ema200Style: ema200LineStyle, showTradeMarkers, tradeMarkerColor, tradeMarkerShape });
  }, [activeRange, showEMA20, showEMA200, showIBS, showVolume, ema20Width, ema20LineStyle, ema200Width, ema200LineStyle, showTradeMarkers, tradeMarkerColor, tradeMarkerShape]);

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

  const normalizedBars = useMemo(() => {
    if (!data.length) return [] as Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }>;

    const dedup = new Map<number, { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number }>();

    for (const bar of data) {
      let t: UTCTimestamp;
      try {
        t = toChartTimestamp(bar.date);
      } catch {
        continue;
      }

      const openRaw = Number(bar.open);
      const highRaw = Number(bar.high);
      const lowRaw = Number(bar.low);
      const closeRaw = Number(bar.close);
      const volumeRaw = Number(bar.volume);

      if (![openRaw, highRaw, lowRaw, closeRaw].every((v) => Number.isFinite(v))) continue;

      const high = Math.max(highRaw, openRaw, lowRaw, closeRaw);
      const low = Math.min(lowRaw, openRaw, highRaw, closeRaw);
      const volume = Number.isFinite(volumeRaw) && volumeRaw > 0 ? volumeRaw : 0;

      dedup.set(Number(t), {
        time: t,
        open: openRaw,
        high,
        low,
        close: closeRaw,
        volume,
      });
    }

    return Array.from(dedup.values()).sort((a, b) => Number(a.time) - Number(b.time));
  }, [data]);

  const chartData = useMemo(
    () =>
      normalizedBars.map((bar) => ({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    [normalizedBars]
  );

  const ema20Values = useMemo(() => calculateEMA(normalizedBars, 20), [normalizedBars]);
  const ema20Data = useMemo(
    () => normalizedBars
      .map((bar, index) => {
        const v = ema20Values[index];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        return { time: bar.time, value: v };
      })
      .filter((p): p is { time: UTCTimestamp; value: number } => p !== null),
    [normalizedBars, ema20Values]
  );

  const ema200Values = useMemo(() => calculateEMA(normalizedBars, 200), [normalizedBars]);
  const ema200Data = useMemo(
    () => normalizedBars
      .map((bar, index) => {
        const v = ema200Values[index];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        return { time: bar.time, value: v };
      })
      .filter((p): p is { time: UTCTimestamp; value: number } => p !== null),
    [normalizedBars, ema200Values]
  );

  const volumeData = useMemo(
    () => normalizedBars.map((bar) => ({
      time: bar.time,
      value: bar.volume,
      color:
        bar.close >= bar.open
          ? isDark
            ? 'rgba(16, 185, 129, 0.45)'
            : 'rgba(16, 185, 129, 0.6)'
          : isDark
            ? 'rgba(239, 68, 68, 0.45)'
            : 'rgba(239, 68, 68, 0.6)',
    })),
    [normalizedBars, isDark]
  );

  const ibsData = useMemo(
    () => normalizedBars.map((bar) => {
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

      return { time: bar.time, value: ibs, color };
    }),
    [normalizedBars, isDark]
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
    const existingTimes = new Set<number>(chartData.map((bar) => Number(bar.time)).filter((value) => Number.isFinite(value)));

    const getMarkerTimeIfExists = (dateLike: unknown): UTCTimestamp | null => {
      try {
        const ts = toChartTimestamp(dateLike as string | Date);
        return existingTimes.has(Number(ts)) ? ts : null;
      } catch {
        return null;
      }
    };

    if (trades.length > 0 && showTradeMarkers) {
      const entryShape = tradeMarkerShape === 'arrow' ? 'arrowUp' : tradeMarkerShape;
      const exitShape = tradeMarkerShape === 'arrow' ? 'arrowDown' : tradeMarkerShape;
      for (const trade of trades) {
        const entryTime = getMarkerTimeIfExists(trade.entryDate);
        if (entryTime != null) {
          allMarkers.push({
            time: entryTime,
            position: 'belowBar',
            color: tradeMarkerColor,
            shape: entryShape,
            text: '',
          });
        }

        if (trade.exitReason !== 'end_of_data') {
          const exitTime = getMarkerTimeIfExists(trade.exitDate);
          if (exitTime != null) {
            allMarkers.push({
              time: exitTime,
              position: 'aboveBar',
              color: tradeMarkerColor,
              shape: exitShape,
              text: '',
            });
          }
        }
      }
    }

    if (splits.length > 0) {
      const ymdToTime = new Map<string, UTCTimestamp>();
      for (const bar of data) {
        const ymd = formatOHLCYMD(bar.date);
        if (!ymdToTime.has(ymd)) ymdToTime.set(ymd, toChartTimestamp(bar.date));
      }

      for (const split of splits) {
        const ymd = typeof split.date === 'string' ? split.date.slice(0, 10) : formatOHLCYMD(split.date);
        const splitTime = ymdToTime.get(ymd);
        if (splitTime == null || !existingTimes.has(Number(splitTime))) continue;

        allMarkers.push({
          time: splitTime,
          position: 'belowBar',
          color: '#9C27B0',
          shape: 'circle',
          text: 'S',
        });
      }
    }

    allMarkers.sort((a, b) => Number(a.time) - Number(b.time));

    try {
      markersApiRef.current.setMarkers(allMarkers);
    } catch (e) {
      logError('chart', 'Error applying chart markers', { error: (e as Error).message }, 'TradingChart.setMarkers');
    }
  }, [chartReady, trades, splits, data, chartData, showTradeMarkers, tradeMarkerColor, tradeMarkerShape]);

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
    if (!chartReady) return;
    ema20SeriesRef.current?.applyOptions({ lineWidth: ema20Width, lineStyle: ema20LineStyle as LineStyle });
    ema200SeriesRef.current?.applyOptions({ lineWidth: ema200Width, lineStyle: ema200LineStyle as LineStyle });
  }, [chartReady, ema20Width, ema20LineStyle, ema200Width, ema200LineStyle]);

  useEffect(() => {
    if (!showChartSettings) return;
    const onPointerDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowChartSettings(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showChartSettings]);

  useEffect(() => {
    if (!chartRef.current || !chartReady || !chartData.length) return;

    const chart = chartRef.current;
    const rightEdgeTs = Number(chartData[chartData.length - 1].time);
    const leftEdgeTs = Number(chartData[0].time);

    const applyRange = () => {
      if (activeRange === 'ALL') {
        chart.timeScale().fitContent();
        return;
      }

      let fromTs = leftEdgeTs;
      if (activeRange === 'YTD') {
        const rightEdgeDate = new Date(rightEdgeTs * 1000);
        const ytdStart = Math.floor(Date.UTC(rightEdgeDate.getUTCFullYear(), 0, 1) / 1000);
        fromTs = Math.max(leftEdgeTs, ytdStart);
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
        fromTs = Math.max(leftEdgeTs, rightEdgeTs - days * 24 * 60 * 60);
      }

      let leftIndex = 0;
      for (let i = 0; i < chartData.length; i++) {
        if (Number(chartData[i].time) >= fromTs) {
          leftIndex = i;
          break;
        }
        if (i === chartData.length - 1) {
          leftIndex = chartData.length - 1;
        }
      }

      const rightIndex = chartData.length - 1;
      const visibleBars = Math.max(1, rightIndex - leftIndex + 1);
      const padding = Math.max(1, Math.round(visibleBars * 0.02));

      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(-0.5, leftIndex - padding),
        to: rightIndex + padding,
      });
    };

    const raf = requestAnimationFrame(() => {
      try {
        applyRange();
      } catch {
        try {
          chart.timeScale().fitContent();
        } catch {
          // ignore
        }
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [activeRange, chartData, chartReady]);

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

  return (
    <div className="w-full grid grid-rows-[auto,1fr] gap-2 relative">
      <div className="flex flex-wrap items-center gap-2">
        {toolbarPrefix}

        {/* Period selector */}
        <div className="flex items-center" role="group" aria-label="Период">
          {RANGE_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setActiveRange(opt.value)}
              title={opt.label}
              className={`px-2.5 py-1.5 text-xs font-medium border transition-colors
                ${i === 0 ? 'rounded-l-lg' : ''}
                ${i === RANGE_OPTIONS.length - 1 ? 'rounded-r-lg' : ''}
                ${i > 0 ? '-ml-px' : ''}
                ${activeRange === opt.value
                  ? 'relative z-10 bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800'
                }`}
            >
              {opt.short}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Индикаторы">
          {([
            { label: 'EMA 20', active: showEMA20, toggle: () => setShowEMA20(v => !v) },
            { label: 'EMA 200', active: showEMA200, toggle: () => setShowEMA200(v => !v) },
            { label: 'IBS', active: showIBS, toggle: () => setShowIBS(v => !v) },
            { label: 'Объём', active: showVolume, toggle: () => setShowVolume(v => !v) },
          ] as const).map(ind => (
            <button
              key={ind.label}
              type="button"
              onClick={ind.toggle}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                ind.active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800'
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>

        {/* Chart visual settings */}
        <div ref={settingsRef} className="relative ml-auto">
          <button
            type="button"
            onClick={() => setShowChartSettings(v => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${showChartSettings ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800'}`}
            title="Настройки графика"
            aria-label="Настройки графика"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {showChartSettings && (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-900 space-y-3">
              {/* EMA 20 */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">EMA 20</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-14 shrink-0">Толщина</span>
                    <div className="flex items-center">
                      {([1, 2, 3] as const).map((w, i) => (
                        <button key={w} type="button" onClick={() => setEma20Width(w)}
                          className={`px-2.5 py-1 text-xs font-medium border transition-colors ${i === 0 ? 'rounded-l-md' : ''} ${i === 2 ? 'rounded-r-md' : ''} ${i > 0 ? '-ml-px' : ''} ${ema20Width === w ? 'relative z-10 bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700'}`}
                        >{w}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-14 shrink-0">Стиль</span>
                    <div className="flex items-center">
                      {([{ label: '——', value: 0 }, { label: '- -', value: 2 }] as const).map((opt, i) => (
                        <button key={opt.value} type="button" onClick={() => setEma20LineStyle(opt.value)}
                          className={`px-2.5 py-1 text-xs font-medium border transition-colors ${i === 0 ? 'rounded-l-md' : 'rounded-r-md -ml-px'} ${ema20LineStyle === opt.value ? 'relative z-10 bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700'}`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800" />

              {/* EMA 200 */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">EMA 200</div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-14 shrink-0">Толщина</span>
                    <div className="flex items-center">
                      {([1, 2, 3] as const).map((w, i) => (
                        <button key={w} type="button" onClick={() => setEma200Width(w)}
                          className={`px-2.5 py-1 text-xs font-medium border transition-colors ${i === 0 ? 'rounded-l-md' : ''} ${i === 2 ? 'rounded-r-md' : ''} ${i > 0 ? '-ml-px' : ''} ${ema200Width === w ? 'relative z-10 bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700'}`}
                        >{w}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 w-14 shrink-0">Стиль</span>
                    <div className="flex items-center">
                      {([{ label: '——', value: 0 }, { label: '- -', value: 2 }] as const).map((opt, i) => (
                        <button key={opt.value} type="button" onClick={() => setEma200LineStyle(opt.value)}
                          className={`px-2.5 py-1 text-xs font-medium border transition-colors ${i === 0 ? 'rounded-l-md' : 'rounded-r-md -ml-px'} ${ema200LineStyle === opt.value ? 'relative z-10 bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700'}`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800" />

              {/* Trade markers */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Сделки на графике</div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setShowTradeMarkers(v => !v)}
                    className={`w-full flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${showTradeMarkers ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900/60' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700'}`}
                  >
                    <span>Показывать</span>
                    <span className="font-medium">{showTradeMarkers ? 'Вкл' : 'Выкл'}</span>
                  </button>
                  {showTradeMarkers && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 w-14 shrink-0">Цвет</span>
                        <div className="flex items-center gap-1.5">
                          {MARKER_COLORS.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setTradeMarkerColor(color)}
                              className={`w-5 h-5 rounded-full border-2 transition-transform ${tradeMarkerColor === color ? 'border-gray-700 scale-125 dark:border-gray-200' : 'border-transparent hover:scale-110'}`}
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 dark:text-gray-400 w-14 shrink-0">Маркер</span>
                        <div className="flex items-center">
                          {([{ label: '↑↓', value: 'arrow' }, { label: '●', value: 'circle' }, { label: '■', value: 'square' }] as const).map((opt, i) => (
                            <button key={opt.value} type="button" onClick={() => setTradeMarkerShape(opt.value)}
                              className={`px-2.5 py-1 text-xs font-medium border transition-colors ${i === 0 ? 'rounded-l-md' : ''} ${i === 2 ? 'rounded-r-md' : ''} ${i > 0 ? '-ml-px' : ''} ${tradeMarkerShape === opt.value ? 'relative z-10 bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700'}`}
                            >{opt.label}</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
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
