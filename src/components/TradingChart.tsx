import React, { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { formatOHLCYMD, parseOHLCDate } from '../lib/utils';
import type { OHLCData, Trade, SplitEvent } from '../types';
import { useAppStore } from '../stores';
import { logError } from '../lib/error-logger';

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  splits?: SplitEvent[];
}

export function TradingChart({ data, trades, splits = [] }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ibsSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  // По умолчанию оба скрыты
  const [showIBS, setShowIBS] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);
  const indicatorPanePercent = useAppStore(s => s.indicatorPanePercent);

  // Функция для расчета EMA
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

  useEffect(() => {
    const onTheme = (e: any) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange' as any, onTheme as any);
    return () => window.removeEventListener('themechange' as any, onTheme as any);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    try {
      // Theme colors
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#1f2937';
      const grid = isDark ? '#1f2937' : '#eef2ff';
      const border = isDark ? '#374151' : '#e5e7eb';

      // Create single chart, bottom ~20% for indicator scale
      const el = chartContainerRef.current;
      const totalH = chartContainerRef.current.clientHeight || 400;
      const chart = createChart(el, {
        width: el.clientWidth,
        height: totalH,
        layout: { background: { color: bg }, textColor: text },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        crosshair: { mode: 1 },
        // Keep main price scale margins small; indicator will occupy its own configurable area
        rightPriceScale: { borderColor: border, scaleMargins: { top: 0.05, bottom: 0.05 } },
        timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 8 },
      });

      // Indicator price scale occupies bottom X% of the pane
      const indicatorFraction = Math.max(0.05, Math.min(0.2, (indicatorPanePercent || 10) / 100));
      const topMargin = 1 - indicatorFraction; // e.g. 0.90 when 10%
      try { 
        chart.priceScale('indicator').applyOptions({ 
          scaleMargins: { top: topMargin, bottom: 0.02 }, 
          borderColor: border 
        }); 
      } catch {
        // Ignore indicator scale options errors
      }

      chartRef.current = chart;

      // Verify chart methods exist
      if (!chart || typeof chart.addCandlestickSeries !== 'function') {
        console.error('Chart object is invalid or missing addCandlestickSeries method');
        return;
      }

      // Свечной ряд
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

      // Convert data to chart format with validation
      const chartData = data.map((bar, idx) => {
        try {
          const t = Math.floor(bar.date.getTime() / 1000) as UTCTimestamp;
          const open = Number(bar.open);
          const high = Number(bar.high);
          const low = Number(bar.low);
          const close = Number(bar.close);
          if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
            logError('chart', 'Invalid candle values', { idx, bar }, 'TradingChart.setData');
          }
          return { time: t, open, high, low, close };
        } catch (e) {
          logError('chart', 'Failed to map candle', { idx, bar }, 'TradingChart.setData', (e as any)?.stack);
          return { time: 0 as UTCTimestamp, open: 0, high: 0, low: 0, close: 0 };
        }
      });

      try {
        candlestickSeries.setData(chartData);
      } catch (e) {
        logError('chart', 'candlestickSeries.setData failed', { length: chartData.length, sample: chartData.slice(0, 3) }, 'TradingChart', (e as any)?.stack);
      }
      try { chart.timeScale().applyOptions({ rightOffset: 8 }); } catch {
        // Ignore timescale options errors
      }

      // Indicator content on main chart: Volume and IBS histograms
      const volumeData = data.map((bar, idx) => {
        const value = Number(bar.volume);
        const t = Math.floor(bar.date.getTime() / 1000) as UTCTimestamp;
        if (!Number.isFinite(value)) {
          logError('chart', 'Invalid volume value', { idx, value, bar }, 'TradingChart.volume');
        }
        return {
          time: t,
          value,
          color: bar.close >= bar.open ? (isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.6)') : (isDark ? 'rgba(239, 68, 68, 0.45)' : 'rgba(239, 68, 68, 0.6)')
        };
      });
      const volumeSeries = chart.addHistogramSeries({
        color: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)',
        priceFormat: { type: 'volume' as const },
        priceScaleId: 'indicator',
        base: 0,
        visible: false,
        title: 'Объём',
      });
      try { volumeSeries.setData(volumeData); } catch (e) {
        logError('chart', 'volumeSeries.setData failed', { length: volumeData.length, sample: volumeData.slice(0, 3) }, 'TradingChart', (e as any)?.stack);
      }
      volumeSeriesRef.current = volumeSeries;

      const ibsHist = chart.addHistogramSeries({
        priceScaleId: 'indicator',
        base: 0,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        visible: false,
        title: 'IBS',
      });
      const ibsData = data.map((bar, idx) => {
        try {
          const range = Math.max(1e-9, bar.high - bar.low);
          const ibs = (bar.close - bar.low) / range; // 0..1
          const t = Math.floor(bar.date.getTime() / 1000) as UTCTimestamp;
          const color = ibs <= 0.10
            ? (isDark ? 'rgba(5,150,105,1)' : 'rgba(5,150,105,1)')
            : (ibs >= 0.75 ? (isDark ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.9)') : (isDark ? 'rgba(156,163,175,0.5)' : 'rgba(107,114,128,0.5)'));
          if (!Number.isFinite(ibs)) {
            logError('chart', 'Invalid IBS value', { idx, bar, ibs }, 'TradingChart.ibs');
          }
          return { time: t, value: ibs, color };
        } catch (e) {
          logError('chart', 'Failed to compute IBS', { idx, bar }, 'TradingChart.ibs', (e as any)?.stack);
          return { time: 0 as UTCTimestamp, value: 0, color: 'rgba(0,0,0,0)' };
        }
      });
      try { ibsHist.setData(ibsData); } catch (e) {
        logError('chart', 'ibsHist.setData failed', { length: ibsData.length, sample: ibsData.slice(0, 3) }, 'TradingChart', (e as any)?.stack);
      }
      try {
        ibsHist.createPriceLine({ price: 0.10, color: '#9ca3af', lineWidth: 1, lineStyle: 2, title: '0.10' });
        ibsHist.createPriceLine({ price: 0.75, color: '#9ca3af', lineWidth: 1, lineStyle: 2, title: '0.75' });
      } catch (e) { console.warn('Failed to create price lines', e); }
      ibsSeriesRef.current = ibsHist;

      // Indicator already constrained via indicatorFraction above

      // No sub-chart; indicators share time scale

      // EMA series (создаем скрытыми; их видимость управляется отдельно)
      const ema20Values = calculateEMA(data, 20);
      const ema20Series = chart.addLineSeries({
        color: isDark ? '#60a5fa' : '#2196F3',
        lineWidth: 2,
        title: 'EMA 20',
        visible: false,
      });
      const ema20Data = data
        .map((bar, index) => {
          const v = ema20Values[index];
          if (typeof v !== 'number' || !Number.isFinite(v)) return null;
          return {
            time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
            value: v,
          };
        })
        .filter((point: { time: UTCTimestamp; value: number } | null): point is { time: UTCTimestamp; value: number } => point !== null);
      try { ema20Series.setData(ema20Data); } catch (e) {
        logError('chart', 'ema20Series.setData failed', { length: ema20Data.length, sample: ema20Data.slice(0, 3) }, 'TradingChart', (e as any)?.stack);
      }
      ema20SeriesRef.current = ema20Series;

      const ema200Values = calculateEMA(data, 200);
      const ema200Series = chart.addLineSeries({
        color: isDark ? '#fbbf24' : '#FF9800',
        lineWidth: 2,
        title: 'EMA 200',
        visible: false,
      });
      const ema200Data = data
        .map((bar, index) => {
          const v = ema200Values[index];
          if (typeof v !== 'number' || !Number.isFinite(v)) return null;
          return {
            time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
            value: v,
          };
        })
        .filter((point: { time: UTCTimestamp; value: number } | null): point is { time: UTCTimestamp; value: number } => point !== null);
      try { ema200Series.setData(ema200Data); } catch (e) {
        logError('chart', 'ema200Series.setData failed', { length: ema200Data.length, sample: ema200Data.slice(0, 3) }, 'TradingChart', (e as any)?.stack);
      }
      ema200SeriesRef.current = ema200Series;

      // Собираем маркеры: сделки и сплиты
      const allMarkers: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp'|'arrowDown'|'circle'; text: string } > = [];
      if (trades.length > 0) {
        allMarkers.push(
          ...trades.flatMap(trade => {
            const markers: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp'|'arrowDown'|'circle'; text: string }> = [
              {
                time: Math.floor(trade.entryDate.getTime() / 1000) as UTCTimestamp,
                position: 'belowBar' as const,
                color: '#10B981',
                shape: 'arrowUp' as const,
                text: '',
              },
            ];
            if (trade.exitReason !== 'end_of_data') {
              markers.push({
                time: Math.floor(trade.exitDate.getTime() / 1000) as UTCTimestamp,
                position: 'aboveBar' as const,
                color: '#EF4444',
                shape: 'arrowDown' as const,
                text: '',
              });
            }
            return markers;
          })
        );
      }
      if (splits.length > 0) {
        // Привяжем маркеры сплитов к времени свечи в тот же день (точное совпадение time метки)
        const ymdToTime = new Map<string, number>();
        for (const bar of data) {
          const ymd = formatOHLCYMD(bar.date);
          if (!ymdToTime.has(ymd)) ymdToTime.set(ymd, Math.floor(bar.date.getTime() / 1000));
        }
        const splitMarkers = splits.map(s => {
          const ymd = typeof s.date === 'string' ? s.date.slice(0, 10) : formatOHLCYMD(parseOHLCDate(String(s.date)));
          const t = ymdToTime.get(ymd) ?? Math.floor(parseOHLCDate(String(s.date)).getTime() / 1000);
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
      if (allMarkers.length > 0) {
        candlestickSeries.setMarkers(allMarkers);
      }

      // Тултип по кроссхэру
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
      chartContainerRef.current.appendChild(tooltipEl);

      chart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time) {
          tooltipEl.style.display = 'none';
          return;
        }
        const paramWithData = param as { seriesPrices?: Map<unknown, unknown>; seriesData?: Map<unknown, unknown> };
        const priceMap = paramWithData.seriesPrices;
        const seriesData = paramWithData.seriesData;
        if (!priceMap || !seriesData) {
          tooltipEl.style.display = 'none';
          return;
        }
        const price = priceMap.get(candlestickSeries as unknown as object);
        if (!price) {
          tooltipEl.style.display = 'none';
          return;
        }
        const bar = seriesData.get(candlestickSeries as unknown as object) as { open?: number; high?: number; low?: number; close?: number } | undefined;
        const vol = (showVolume && volumeSeriesRef.current) ? (seriesData.get(volumeSeriesRef.current as unknown as object) as { value?: number } | undefined)?.value : undefined;
        const ibsVal = (showIBS && ibsSeriesRef.current) ? (seriesData.get(ibsSeriesRef.current as unknown as object) as { value?: number } | undefined)?.value : undefined;
        const o = bar?.open, h = bar?.high, l = bar?.low, c = bar?.close;
        const pct = o ? (((c! - o) / o) * 100) : 0;
        const ibsStr = (typeof ibsVal === 'number') ? ` · IBS ${(ibsVal * 100).toFixed(0)}%` : '';
        tooltipEl.innerHTML = `О ${o?.toFixed?.(2) ?? '-'} В ${h?.toFixed?.(2) ?? '-'} Н ${l?.toFixed?.(2) ?? '-'} З ${c?.toFixed?.(2) ?? '-'} · ${pct ? pct.toFixed(2) + '%' : ''}${ibsStr}${vol ? ' · Объём ' + vol.toLocaleString() : ''}`;
        tooltipEl.style.display = 'block';
      });

      // Handle resize
      const handleResize = () => {
        if (!chartContainerRef.current) return;
        const w = chartContainerRef.current.clientWidth;
        const total = chartContainerRef.current.clientHeight || 600;
        chart.applyOptions({ width: w, height: Math.max(total, 360) });
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chart) { try { chart.remove(); } catch (e) { console.warn('Error removing chart on cleanup:', e); } }
        try {
          if (tooltipEl && tooltipEl.parentElement) tooltipEl.parentElement.removeChild(tooltipEl);
        } catch (e) { /* ignore */ }
      };
    } catch (error) {
      console.error('Error creating trading chart:', error);
      return;
    }
  }, [data, trades, splits, isDark]);

  useEffect(() => {
    // Взаимоисключаемые индикаторы
    if (showIBS && showVolume) setShowVolume(false);
  }, [showIBS, showVolume]);

  useEffect(() => {
    // Управляем видимостью серий без пересоздания чартов
    try { ibsSeriesRef.current?.applyOptions?.({ visible: showIBS }); } catch {
      // Ignore IBS series visibility errors
    }
    try { volumeSeriesRef.current?.applyOptions?.({ visible: showVolume }); } catch {
      // Ignore volume series visibility errors
    }
    try { ema20SeriesRef.current?.applyOptions?.({ visible: showEMA20 }); } catch {
      // Ignore EMA20 series visibility errors
    }
    try { ema200SeriesRef.current?.applyOptions?.({ visible: showEMA200 }); } catch {
      // Ignore EMA200 series visibility errors
    }
  }, [showIBS, showVolume, showEMA20, showEMA200]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Нет данных для графика
      </div>
    );
  }

  return (
    <div className="w-full grid grid-rows-[auto,1fr] gap-4">
      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setShowEMA20(!showEMA20)}
          className={`px-3 py-1 text-sm rounded ${
            showEMA20 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          EMA 20
        </button>
        <button
          onClick={() => setShowEMA200(!showEMA200)}
          className={`px-3 py-1 text-sm rounded ${
            showEMA200 
              ? 'bg-orange-500 text-white' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          EMA 200
        </button>
        <button
          onClick={() => { const next = !showIBS; setShowIBS(next); if (next) setShowVolume(false); }}
          className={`px-3 py-1 text-sm rounded ${
            showIBS
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
          className={`px-3 py-1 text-sm rounded ${
            showVolume
              ? 'bg-gray-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Показать объём"
          aria-label="Показать объём"
        >
          Объём
        </button>
      </div>

      {/* Single Chart Container (indicator occupies bottom 20%) */}
      <div ref={chartContainerRef} className="min-h-0 overflow-hidden w-full h-full" />
    </div>
  );
}