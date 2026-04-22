import { useEffect, useMemo, useRef, useState, memo, type ReactNode } from 'react';
import { Download, RotateCcw, Settings2 } from 'lucide-react';
import { useIsDark } from '../hooks/useIsDark';
import { useClickOutside } from '../hooks/useClickOutside';
import { LS } from '../constants';
import { getChartColors } from '../lib/chart-theme';
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
type LineWidth = 1 | 2 | 3 | 4;
type LineStyleValue = 0 | 1 | 2;
type MarkerVariant = 'arrow' | 'circle' | 'square' | 'circleSquare' | 'squareCircle';

const EMA20_DEFAULT_COLOR = '#2563EB';
const EMA200_DEFAULT_COLOR = '#F59E0B';
const TRADE_MARKER_DEFAULT_COLOR = '#2563EB';
const EMA_DEFAULT_OPACITY = 85;
const TRADE_MARKER_DEFAULT_OPACITY = 90;
const TRADE_MARKER_DEFAULT_SIZE = 100;

const COLOR_SWATCHES = [
  '#2563EB',
  '#0EA5E9',
  '#14B8A6',
  '#10B981',
  '#84CC16',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#F43F5E',
  '#A855F7',
  '#8B5CF6',
  '#64748B',
] as const;
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

const CHART_PREFS_KEY = LS.CHART_PREFS;

interface ChartPrefs {
  range?: RangeKey;
  ema20?: boolean;
  ema200?: boolean;
  ibs?: boolean;
  volume?: boolean;
  ema20Width?: LineWidth;
  ema20Style?: LineStyleValue;
  ema20Color?: string;
  ema20Opacity?: number;
  ema200Width?: LineWidth;
  ema200Style?: LineStyleValue;
  ema200Color?: string;
  ema200Opacity?: number;
  showTradeMarkers?: boolean;
  tradeMarkerColor?: string;
  tradeMarkerShape?: MarkerVariant;
  tradeMarkerOpacity?: number;
  tradeMarkerSize?: number;
}

function loadChartPrefs(): ChartPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CHART_PREFS_KEY);
    return raw ? (JSON.parse(raw) as ChartPrefs) : null;
  } catch {
    return null;
  }
}

function saveChartPrefs(prefs: ChartPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePercent(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(clamp(value, 5, 100));
}

function normalizeMarkerSize(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(clamp(value, 40, 180));
}

function withAlpha(color: string, opacityPercent: number): string {
  const alpha = clamp(opacityPercent, 0, 100) / 100;
  const hex = color.trim();

  if (/^#([a-f0-9]{3}){1,2}$/i.test(hex)) {
    const normalized = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const int = Number.parseInt(normalized.slice(1), 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
  }

  const rgb = hex.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha.toFixed(2)})`;
    }
  }

  return color;
}

function markerVariantToShapes(variant: MarkerVariant): { entry: 'arrowUp' | 'circle' | 'square'; exit: 'arrowDown' | 'circle' | 'square' } {
  switch (variant) {
    case 'circle':
      return { entry: 'circle', exit: 'circle' };
    case 'square':
      return { entry: 'square', exit: 'square' };
    case 'circleSquare':
      return { entry: 'circle', exit: 'square' };
    case 'squareCircle':
      return { entry: 'square', exit: 'circle' };
    case 'arrow':
    default:
      return { entry: 'arrowUp', exit: 'arrowDown' };
  }
}

function formatExportValue(value: number | null | undefined, digits = 6): string {
  if (value == null || !Number.isFinite(value)) return '';
  return Number(value).toFixed(digits);
}

function escapeCsvCell(value: string): string {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(rows: string[][], prefix: string) {
  const csvContent = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
  link.href = url;
  link.download = `${prefix}-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const EMA_STYLE_OPTIONS: Array<{ label: string; value: LineStyleValue }> = [
  { label: 'Сплошная', value: 0 },
  { label: 'Точки', value: 1 },
  { label: 'Пунктир', value: 2 },
];

const MARKER_VARIANT_OPTIONS: Array<{ label: string; value: MarkerVariant; preview: string }> = [
  { label: 'Стрелки', value: 'arrow', preview: '↑ ↓' },
  { label: 'Круги', value: 'circle', preview: '● ●' },
  { label: 'Квадраты', value: 'square', preview: '■ ■' },
  { label: 'Вход ● / выход ■', value: 'circleSquare', preview: '● ■' },
  { label: 'Вход ■ / выход ●', value: 'squareCircle', preview: '■ ●' },
];

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  splits?: SplitEvent[];
  isVisible?: boolean;
  toolbarPrefix?: ReactNode;
  exportFileNamePrefix?: string;
}

export const TradingChart = memo(function TradingChart({
  data,
  trades,
  splits = [],
  isVisible = true,
  toolbarPrefix,
  exportFileNamePrefix = 'chart-data',
}: TradingChartProps) {
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
  const storedPrefs = useMemo(() => loadChartPrefs(), []);

  const [chartReady, setChartReady] = useState(false);
  const [activeRange, setActiveRange] = useState<RangeKey>(() => storedPrefs?.range ?? '3Y');

  const [showEMA20, setShowEMA20] = useState(() => storedPrefs?.ema20 ?? false);
  const [showEMA200, setShowEMA200] = useState(() => storedPrefs?.ema200 ?? false);
  const [showIBS, setShowIBS] = useState(() => storedPrefs?.ibs ?? false);
  const [showVolume, setShowVolume] = useState(() => storedPrefs?.volume ?? false);

  const [ema20Width, setEma20Width] = useState<LineWidth>(() => storedPrefs?.ema20Width ?? 2);
  const [ema20LineStyle, setEma20LineStyle] = useState<LineStyleValue>(() => storedPrefs?.ema20Style ?? 0);
  const [ema20Color, setEma20Color] = useState<string>(() => storedPrefs?.ema20Color ?? EMA20_DEFAULT_COLOR);
  const [ema20Opacity, setEma20Opacity] = useState<number>(() => normalizePercent(storedPrefs?.ema20Opacity, EMA_DEFAULT_OPACITY));
  const [ema200Width, setEma200Width] = useState<LineWidth>(() => storedPrefs?.ema200Width ?? 2);
  const [ema200LineStyle, setEma200LineStyle] = useState<LineStyleValue>(() => storedPrefs?.ema200Style ?? 0);
  const [ema200Color, setEma200Color] = useState<string>(() => storedPrefs?.ema200Color ?? EMA200_DEFAULT_COLOR);
  const [ema200Opacity, setEma200Opacity] = useState<number>(() => normalizePercent(storedPrefs?.ema200Opacity, EMA_DEFAULT_OPACITY));
  const [showTradeMarkers, setShowTradeMarkers] = useState<boolean>(() => storedPrefs?.showTradeMarkers ?? true);
  const [tradeMarkerColor, setTradeMarkerColor] = useState<string>(() => storedPrefs?.tradeMarkerColor ?? TRADE_MARKER_DEFAULT_COLOR);
  const [tradeMarkerShape, setTradeMarkerShape] = useState<MarkerVariant>(() => storedPrefs?.tradeMarkerShape ?? 'arrow');
  const [tradeMarkerOpacity, setTradeMarkerOpacity] = useState<number>(() => normalizePercent(storedPrefs?.tradeMarkerOpacity, TRADE_MARKER_DEFAULT_OPACITY));
  const [tradeMarkerSize, setTradeMarkerSize] = useState<number>(() => normalizeMarkerSize(storedPrefs?.tradeMarkerSize, TRADE_MARKER_DEFAULT_SIZE));
  const [showChartSettings, setShowChartSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  const showIBSRef = useRef(showIBS);
  const showVolumeRef = useRef(showVolume);

  const isDark = useIsDark();
  const indicatorPanePercent = useAppStore((s) => s.indicatorPanePercent);

  useEffect(() => {
    showIBSRef.current = showIBS;
    showVolumeRef.current = showVolume;
  }, [showIBS, showVolume]);

  useEffect(() => {
    saveChartPrefs({
      range: activeRange,
      ema20: showEMA20,
      ema200: showEMA200,
      ibs: showIBS,
      volume: showVolume,
      ema20Width,
      ema20Style: ema20LineStyle,
      ema20Color,
      ema20Opacity,
      ema200Width,
      ema200Style: ema200LineStyle,
      ema200Color,
      ema200Opacity,
      showTradeMarkers,
      tradeMarkerColor,
      tradeMarkerShape,
      tradeMarkerOpacity,
      tradeMarkerSize,
    });
  }, [
    activeRange,
    showEMA20,
    showEMA200,
    showIBS,
    showVolume,
    ema20Width,
    ema20LineStyle,
    ema20Color,
    ema20Opacity,
    ema200Width,
    ema200LineStyle,
    ema200Color,
    ema200Opacity,
    showTradeMarkers,
    tradeMarkerColor,
    tradeMarkerShape,
    tradeMarkerOpacity,
    tradeMarkerSize,
  ]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const el = chartContainerRef.current;
    const darkNow = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false;
    const { bg, text, grid, border } = getChartColors(darkNow);

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
      color: withAlpha(EMA20_DEFAULT_COLOR, EMA_DEFAULT_OPACITY),
      lineWidth: 2,
      lineStyle: 0,
      title: 'EMA 20',
      visible: false,
    });
    ema20SeriesRef.current = ema20Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: withAlpha(EMA200_DEFAULT_COLOR, EMA_DEFAULT_OPACITY),
      lineWidth: 2,
      lineStyle: 0,
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

    const { bg, text, grid, border } = getChartColors(isDark);

    chartRef.current.applyOptions({
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    });

    if (tooltipRef.current) {
      tooltipRef.current.style.background = isDark ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
    }

    volumeSeriesRef.current?.applyOptions({ color: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)' });
  }, [isDark]);

  const normalizedBars = useMemo(() => {
    if (!data.length) {
      return [] as Array<{
        date: string;
        time: UTCTimestamp;
        open: number;
        high: number;
        low: number;
        close: number;
        adjClose: number | null;
        volume: number;
      }>;
    }

    const dedup = new Map<number, {
      date: string;
      time: UTCTimestamp;
      open: number;
      high: number;
      low: number;
      close: number;
      adjClose: number | null;
      volume: number;
    }>();

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
      const adjCloseRaw = Number(bar.adjClose);
      const volumeRaw = Number(bar.volume);

      if (![openRaw, highRaw, lowRaw, closeRaw].every((v) => Number.isFinite(v))) continue;

      const high = Math.max(highRaw, openRaw, lowRaw, closeRaw);
      const low = Math.min(lowRaw, openRaw, highRaw, closeRaw);
      const volume = Number.isFinite(volumeRaw) && volumeRaw > 0 ? volumeRaw : 0;

      dedup.set(Number(t), {
        date: formatOHLCYMD(bar.date),
        time: t,
        open: openRaw,
        high,
        low,
        close: closeRaw,
        adjClose: Number.isFinite(adjCloseRaw) ? adjCloseRaw : null,
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

  const exportRows = useMemo(
    () =>
      normalizedBars.map((bar, index) => {
        const range = bar.high - bar.low;
        const ibs = range > 0 ? (bar.close - bar.low) / range : null;
        return [
          bar.date,
          formatExportValue(bar.close, 4),
          formatExportValue(bar.open, 4),
          formatExportValue(bar.high, 4),
          formatExportValue(bar.low, 4),
          formatExportValue(bar.close, 4),
          formatExportValue(bar.adjClose, 4),
          formatExportValue(bar.volume, 0),
          formatExportValue(ibs, 6),
          formatExportValue(ema20Values[index], 6),
          formatExportValue(ema200Values[index], 6),
        ];
      }),
    [normalizedBars, ema20Values, ema200Values]
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
    const { entry, exit } = markerVariantToShapes(tradeMarkerShape);
    const markerColor = withAlpha(tradeMarkerColor, tradeMarkerOpacity);
    const markerSize = tradeMarkerSize / 100;

    const getMarkerTimeIfExists = (dateLike: unknown): UTCTimestamp | null => {
      try {
        const ts = toChartTimestamp(dateLike as string | Date);
        return existingTimes.has(Number(ts)) ? ts : null;
      } catch {
        return null;
      }
    };

    if (trades.length > 0 && showTradeMarkers) {
      for (const trade of trades) {
        const entryTime = getMarkerTimeIfExists(trade.entryDate);
        if (entryTime != null) {
          allMarkers.push({
            time: entryTime,
            position: 'belowBar',
            color: markerColor,
            shape: entry,
            text: '',
            size: markerSize,
          });
        }

        if (trade.exitReason !== 'end_of_data') {
          const exitTime = getMarkerTimeIfExists(trade.exitDate);
          if (exitTime != null) {
            allMarkers.push({
              time: exitTime,
              position: 'aboveBar',
              color: markerColor,
              shape: exit,
              text: '',
              size: markerSize,
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
  }, [chartReady, trades, splits, data, chartData, showTradeMarkers, tradeMarkerColor, tradeMarkerShape, tradeMarkerOpacity, tradeMarkerSize]);

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
    ema20SeriesRef.current?.applyOptions({
      lineWidth: ema20Width,
      lineStyle: ema20LineStyle as LineStyle,
      color: withAlpha(ema20Color, ema20Opacity),
    });
    ema200SeriesRef.current?.applyOptions({
      lineWidth: ema200Width,
      lineStyle: ema200LineStyle as LineStyle,
      color: withAlpha(ema200Color, ema200Opacity),
    });
  }, [chartReady, ema20Width, ema20LineStyle, ema20Color, ema20Opacity, ema200Width, ema200LineStyle, ema200Color, ema200Opacity]);

  useClickOutside(settingsRef, showChartSettings, () => setShowChartSettings(false), false);

  const handleExportChartData = () => {
    if (exportRows.length === 0) return;
    downloadCsv([
      ['date', 'price', 'open', 'high', 'low', 'close', 'adj_close', 'volume', 'ibs', 'ema20', 'ema200'],
      ...exportRows,
    ], exportFileNamePrefix);
  };

  const handleResetChartSettings = () => {
    setShowEMA20(false);
    setShowEMA200(false);
    setShowIBS(false);
    setShowVolume(false);
    setEma20Width(2);
    setEma20LineStyle(0);
    setEma20Color(EMA20_DEFAULT_COLOR);
    setEma20Opacity(EMA_DEFAULT_OPACITY);
    setEma200Width(2);
    setEma200LineStyle(0);
    setEma200Color(EMA200_DEFAULT_COLOR);
    setEma200Opacity(EMA_DEFAULT_OPACITY);
    setShowTradeMarkers(true);
    setTradeMarkerColor(TRADE_MARKER_DEFAULT_COLOR);
    setTradeMarkerShape('arrow');
    setTradeMarkerOpacity(TRADE_MARKER_DEFAULT_OPACITY);
    setTradeMarkerSize(TRADE_MARKER_DEFAULT_SIZE);
  };

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

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportChartData}
            disabled={exportRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Экспортировать данные графика в CSV"
            aria-label="Экспортировать данные графика в CSV"
          >
            <Download className="h-4 w-4" />
            <span>Экспорт CSV</span>
          </button>

          <div ref={settingsRef} className="relative">
            <button
              type="button"
              onClick={() => setShowChartSettings(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showChartSettings
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-800'
              }`}
              title="Настройки графика"
              aria-label="Настройки графика"
            >
              <Settings2 className="w-4 h-4" />
              <span>Вид</span>
            </button>

            {showChartSettings && (
              <div className="absolute right-0 top-full z-30 mt-2 w-[22rem] max-w-[calc(100vw-1rem)] rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Настройки графика</div>
                    <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
                      Цвета, прозрачность и размер маркеров теперь можно настроить без тесной сетки.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetChartSettings}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    aria-label="Сбросить настройки графика"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Сброс</span>
                  </button>
                </div>

                <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
                  <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">EMA 20</div>
                        <div className="mt-1 h-1.5 w-20 rounded-full" style={{ backgroundColor: withAlpha(ema20Color, ema20Opacity) }} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEMA20(v => !v)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          showEMA20
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700'
                        }`}
                      >
                        {showEMA20 ? 'Вкл' : 'Выкл'}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Цвет</div>
                      <div className="grid grid-cols-6 gap-1.5">
                        {COLOR_SWATCHES.map((color) => (
                          <button
                            key={`ema20-${color}`}
                            type="button"
                            onClick={() => setEma20Color(color)}
                            className={`h-4 w-4 rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-gray-900 ${
                              ema20Color === color ? 'ring-gray-700 dark:ring-gray-100' : 'ring-transparent'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                            aria-label={`Цвет EMA 20 ${color}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[11px] text-gray-500 dark:text-gray-400">Непрозр.</span>
                      <input
                        aria-label="Непрозрачность EMA 20"
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={ema20Opacity}
                        onChange={(event) => setEma20Opacity(Number(event.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <span className="w-10 text-right text-[11px] font-medium text-gray-700 dark:text-gray-200">{ema20Opacity}%</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[11px] text-gray-500 dark:text-gray-400">Толщина</span>
                      <div className="flex flex-1 items-center">
                        {([1, 2, 3, 4] as const).map((w, i) => (
                          <button
                            key={`ema20-width-${w}`}
                            type="button"
                            onClick={() => setEma20Width(w)}
                            className={`flex-1 border px-2 py-1 text-xs font-medium transition-colors ${
                              i === 0 ? 'rounded-l-md' : ''
                            } ${
                              i === 3 ? 'rounded-r-md' : ''
                            } ${
                              i > 0 ? '-ml-px' : ''
                            } ${
                              ema20Width === w
                                ? 'relative z-10 border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Стиль линии</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {EMA_STYLE_OPTIONS.map((opt) => (
                          <button
                            key={`ema20-style-${opt.value}`}
                            type="button"
                            onClick={() => setEma20LineStyle(opt.value)}
                            className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                              ema20LineStyle === opt.value
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">EMA 200</div>
                        <div className="mt-1 h-1.5 w-20 rounded-full" style={{ backgroundColor: withAlpha(ema200Color, ema200Opacity) }} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEMA200(v => !v)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          showEMA200
                            ? 'bg-amber-500 text-white'
                            : 'bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700'
                        }`}
                      >
                        {showEMA200 ? 'Вкл' : 'Выкл'}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Цвет</div>
                      <div className="grid grid-cols-6 gap-1.5">
                        {COLOR_SWATCHES.map((color) => (
                          <button
                            key={`ema200-${color}`}
                            type="button"
                            onClick={() => setEma200Color(color)}
                            className={`h-4 w-4 rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-gray-900 ${
                              ema200Color === color ? 'ring-gray-700 dark:ring-gray-100' : 'ring-transparent'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                            aria-label={`Цвет EMA 200 ${color}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[11px] text-gray-500 dark:text-gray-400">Непрозр.</span>
                      <input
                        aria-label="Непрозрачность EMA 200"
                        type="range"
                        min="10"
                        max="100"
                        step="5"
                        value={ema200Opacity}
                        onChange={(event) => setEma200Opacity(Number(event.target.value))}
                        className="w-full accent-amber-500"
                      />
                      <span className="w-10 text-right text-[11px] font-medium text-gray-700 dark:text-gray-200">{ema200Opacity}%</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[11px] text-gray-500 dark:text-gray-400">Толщина</span>
                      <div className="flex flex-1 items-center">
                        {([1, 2, 3, 4] as const).map((w, i) => (
                          <button
                            key={`ema200-width-${w}`}
                            type="button"
                            onClick={() => setEma200Width(w)}
                            className={`flex-1 border px-2 py-1 text-xs font-medium transition-colors ${
                              i === 0 ? 'rounded-l-md' : ''
                            } ${
                              i === 3 ? 'rounded-r-md' : ''
                            } ${
                              i > 0 ? '-ml-px' : ''
                            } ${
                              ema200Width === w
                                ? 'relative z-10 border-amber-500 bg-amber-500 text-white'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Стиль линии</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {EMA_STYLE_OPTIONS.map((opt) => (
                          <button
                            key={`ema200-style-${opt.value}`}
                            type="button"
                            onClick={() => setEma200LineStyle(opt.value)}
                            className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                              ema200LineStyle === opt.value
                                ? 'border-amber-500 bg-amber-500 text-white'
                                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">Маркеры сделок</div>
                        <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Вход и выход теперь можно сделать компактнее.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTradeMarkers(v => !v)}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          showTradeMarkers
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700'
                        }`}
                      >
                        {showTradeMarkers ? 'Вкл' : 'Выкл'}
                      </button>
                    </div>

                    {showTradeMarkers && (
                      <>
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Цвет</div>
                          <div className="grid grid-cols-6 gap-1.5">
                            {COLOR_SWATCHES.map((color) => (
                              <button
                                key={`marker-${color}`}
                                type="button"
                                onClick={() => setTradeMarkerColor(color)}
                                className={`h-4 w-4 rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-gray-900 ${
                                  tradeMarkerColor === color ? 'ring-gray-700 dark:ring-gray-100' : 'ring-transparent'
                                }`}
                                style={{ backgroundColor: color }}
                                title={color}
                                aria-label={`Цвет маркеров ${color}`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-[11px] text-gray-500 dark:text-gray-400">Непрозр.</span>
                          <input
                            aria-label="Непрозрачность маркеров"
                            type="range"
                            min="10"
                            max="100"
                            step="5"
                            value={tradeMarkerOpacity}
                            onChange={(event) => setTradeMarkerOpacity(Number(event.target.value))}
                            className="w-full accent-blue-600"
                          />
                          <span className="w-10 text-right text-[11px] font-medium text-gray-700 dark:text-gray-200">{tradeMarkerOpacity}%</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="w-20 shrink-0 text-[11px] text-gray-500 dark:text-gray-400">Размер</span>
                          <input
                            aria-label="Размер маркеров"
                            type="range"
                            min="40"
                            max="180"
                            step="10"
                            value={tradeMarkerSize}
                            onChange={(event) => setTradeMarkerSize(Number(event.target.value))}
                            className="w-full accent-blue-600"
                          />
                          <span className="w-10 text-right text-[11px] font-medium text-gray-700 dark:text-gray-200">{tradeMarkerSize}%</span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Вариант маркеров</div>
                          <div className="grid gap-1.5">
                            {MARKER_VARIANT_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTradeMarkerShape(opt.value)}
                                className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors ${
                                  tradeMarkerShape === opt.value
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                              >
                                <span>{opt.label}</span>
                                <span className="font-semibold tracking-wide">{opt.preview}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>
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
