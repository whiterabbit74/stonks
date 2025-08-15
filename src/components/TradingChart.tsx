import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { formatOHLCYMD, parseOHLCDate } from '../lib/utils';
import type { OHLCData, Trade, SplitEvent } from '../types';

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  splits?: SplitEvent[];
}

export function TradingChart({ data, trades, splits = [] }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const subPaneRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ibsSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [showEMA20, setShowEMA20] = useState(false);
  const [showEMA200, setShowEMA200] = useState(false);
  // По умолчанию отображаем IBS и скрываем объём
  const [showIBS, setShowIBS] = useState(true);
  const [showVolume, setShowVolume] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

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
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    try {
      // Theme colors
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#1f2937';
      const grid = isDark ? '#1f2937' : '#eef2ff';
      const border = isDark ? '#374151' : '#e5e7eb';

      // Create main chart (80% height)
      const mainEl = mainPaneRef.current || chartContainerRef.current;
      const subEl = subPaneRef.current || chartContainerRef.current;
      const totalH = chartContainerRef.current.clientHeight || 600;
      const mainH = Math.max(200, Math.round(totalH * 0.80));
      const subH = Math.max(80, totalH - mainH);
      const chart = createChart(mainEl, {
        width: mainEl.clientWidth,
        height: Math.max(mainH || 0, 360),
        layout: {
          background: { color: bg },
          textColor: text,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: border,
        },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 8,
        },
      });

      chartRef.current = chart;

      // Create sub chart (20% height) for IBS/Volume
      const subChart = createChart(subEl, {
        width: subEl.clientWidth,
        height: Math.max(subH || 0, 120),
        layout: {
          background: { color: bg },
          textColor: text,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: border },
        timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 8 },
      });
      subChartRef.current = subChart;

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

      // Convert data to chart format
      const chartData = data.map(bar => ({
        time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

      candlestickSeries.setData(chartData);
      try { chart.timeScale().applyOptions({ rightOffset: 8 }); } catch {}

      // Sub chart content: Volume and IBS (создаем один раз и управляем видимостью)
      const volumeData = data.map(bar => ({
        time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? (isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.45)') : (isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.45)')
      }));
      const volumeSeries = subChart.addHistogramSeries({
        color: isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)',
        priceFormat: { type: 'volume' as const },
        base: 0,
        visible: false,
      });
      volumeSeries.setData(volumeData);
      volumeSeriesRef.current = volumeSeries;

      const ibsLine = subChart.addLineSeries({
        color: isDark ? '#93c5fd' : '#374151',
        lineWidth: 2,
        visible: false,
      });
      const ibsData = data.map(bar => {
        const range = Math.max(1e-9, bar.high - bar.low);
        const ibs = (bar.close - bar.low) / range; // 0..1
        return { time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp, value: ibs };
      });
      ibsLine.setData(ibsData);
      try {
        ibsLine.createPriceLine({ price: 0.10, color: '#9ca3af', lineWidth: 1, lineStyle: 2, title: 'IBS 0.10' });
        ibsLine.createPriceLine({ price: 0.75, color: '#9ca3af', lineWidth: 1, lineStyle: 2, title: 'IBS 0.75' });
      } catch (e) { console.warn('Failed to create price lines', e); }
      ibsSeriesRef.current = ibsLine;

      // Sync time scales using logical range with guards
      try {
        let syncing = false;
        const syncFromMain = (range: any) => {
          if (syncing || !range || range.from == null || range.to == null) return;
          const trg = subChart.timeScale().getVisibleLogicalRange?.();
          if (trg && typeof (trg as any).from === 'number' && typeof (trg as any).to === 'number') {
            const same = Math.abs((trg as any).from - range.from) < 1e-3 && Math.abs((trg as any).to - range.to) < 1e-3;
            if (same) return;
          }
          syncing = true;
          try { subChart.timeScale().setVisibleLogicalRange(range); } catch {} finally { syncing = false; }
        };
        const syncFromSub = (range: any) => {
          if (syncing || !range || range.from == null || range.to == null) return;
          const trg = chart.timeScale().getVisibleLogicalRange?.();
          if (trg && typeof (trg as any).from === 'number' && typeof (trg as any).to === 'number') {
            const same = Math.abs((trg as any).from - range.from) < 1e-3 && Math.abs((trg as any).to - range.to) < 1e-3;
            if (same) return;
          }
          syncing = true;
          try { chart.timeScale().setVisibleLogicalRange(range); } catch {} finally { syncing = false; }
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(syncFromMain);
        subChart.timeScale().subscribeVisibleLogicalRangeChange(syncFromSub);
        // Align initial range
        try {
          const lr = chart.timeScale().getVisibleLogicalRange();
          if (lr) subChart.timeScale().setVisibleLogicalRange(lr);
        } catch {}
        // Save unsubscribers in cleanup closure
        (chart as any).__syncFromMain = syncFromMain;
        (subChart as any).__syncFromSub = syncFromSub;
      } catch (e) { console.warn('Failed to sync time scales', e); }

      // EMA series (создаем скрытыми; их видимость управляется отдельно)
      const ema20Values = calculateEMA(data, 20);
      const ema20Series = chart.addLineSeries({
        color: isDark ? '#60a5fa' : '#2196F3',
        lineWidth: 2,
        title: 'EMA 20',
        visible: false,
      });
      const ema20Data = data.map((bar, index) => ({
        time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
        value: ema20Values[index] || bar.close,
      })).filter(point => (point as any).value !== undefined);
      ema20Series.setData(ema20Data as any);
      ema20SeriesRef.current = ema20Series;

      const ema200Values = calculateEMA(data, 200);
      const ema200Series = chart.addLineSeries({
        color: isDark ? '#fbbf24' : '#FF9800',
        lineWidth: 2,
        title: 'EMA 200',
        visible: false,
      });
      const ema200Data = data.map((bar, index) => ({
        time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
        value: ema200Values[index] || bar.close,
      })).filter(point => (point as any).value !== undefined);
      ema200Series.setData(ema200Data as any);
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

      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) {
          tooltipEl.style.display = 'none';
          try {
            const tgt = (ibsSeriesRef.current || volumeSeriesRef.current) as unknown as { clearCrosshairPosition?: () => void };
            tgt?.clearCrosshairPosition?.();
          } catch (err) { console.warn('Clear crosshair for tgt failed', err as Error); }
          return;
        }
        const priceMap = (param as any).seriesPrices as Map<unknown, unknown> | undefined;
        const seriesData = (param as any).seriesData as Map<unknown, unknown> | undefined;
        if (!priceMap || !seriesData) {
          tooltipEl.style.display = 'none';
          try {
            (ibsSeriesRef.current as unknown as { clearCrosshairPosition?: () => void })?.clearCrosshairPosition?.();
            (volumeSeriesRef.current as unknown as { clearCrosshairPosition?: () => void })?.clearCrosshairPosition?.();
          } catch (err) { console.warn('Clear crosshair for series failed', err as Error); }
          return;
        }
        const price = priceMap.get(candlestickSeries as unknown as object);
        if (!price) {
          tooltipEl.style.display = 'none';
          try {
            (ibsSeriesRef.current as unknown as { clearCrosshairPosition?: () => void })?.clearCrosshairPosition?.();
            (volumeSeriesRef.current as unknown as { clearCrosshairPosition?: () => void })?.clearCrosshairPosition?.();
          } catch (err) { console.warn('Clear crosshair for series failed', err as Error); }
          return;
        }
        const bar = seriesData.get(candlestickSeries as unknown as object) as { open?: number; high?: number; low?: number; close?: number } | undefined;
        const vol = volumeSeriesRef.current ? (seriesData.get(volumeSeriesRef.current as unknown as object) as { value?: number } | undefined)?.value : undefined;
        const ibsVal = ibsSeriesRef.current ? (seriesData.get(ibsSeriesRef.current as unknown as object) as { value?: number } | undefined)?.value : undefined;
        const o = bar?.open, h = bar?.high, l = bar?.low, c = bar?.close;
        const pct = o ? (((c! - o) / o) * 100) : 0;
        const ibsStr = (typeof ibsVal === 'number') ? ` · IBS ${(ibsVal * 100).toFixed(0)}%` : '';
        tooltipEl.innerHTML = `О ${o?.toFixed?.(2) ?? '-'} В ${h?.toFixed?.(2) ?? '-'} Н ${l?.toFixed?.(2) ?? '-'} З ${c?.toFixed?.(2) ?? '-'} · ${pct ? pct.toFixed(2) + '%' : ''}${ibsStr}${vol ? ' · Объём ' + vol.toLocaleString() : ''}`;
        tooltipEl.style.display = 'block';

        // Mirror crosshair to sub chart using series API (best-effort across versions)
        try {
          const t = param.time as UTCTimestamp;
          const setPos = (s: unknown, value: number) => {
            const api = s as { setCrosshairPosition?: (v: number, t: UTCTimestamp) => void };
            api?.setCrosshairPosition?.(value, t);
          };
          if (typeof ibsVal === 'number') setPos(ibsSeriesRef.current, ibsVal);
          else if (typeof vol === 'number') setPos(volumeSeriesRef.current, vol);
        } catch (err) { console.warn('Mirror crosshair failed', err as Error); }
      });

      // Also reflect crosshair from sub-pane to main chart
      subChart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) {
          try { (candlestickSeries as unknown as { clearCrosshairPosition?: () => void })?.clearCrosshairPosition?.(); } catch (err) { console.warn('Clear crosshair failed', err as Error); }
          return;
        }
        try {
          const t = param.time as UTCTimestamp;
          const sd = (param as any).seriesData as Map<unknown, unknown> | undefined;
          const bar = sd?.get(candlestickSeries as unknown as object) as { close?: number } | undefined;
          const close = bar?.close ?? 0;
          const cs = candlestickSeries as unknown as { setCrosshairPosition?: (price: number, t: UTCTimestamp) => void };
          cs?.setCrosshairPosition?.(close, t);
        } catch (err) { console.warn('Crosshair reflect failed', err as Error); }
      });

      // Handle resize
      const handleResize = () => {
        if (!chartContainerRef.current) return;
        const w = chartContainerRef.current.clientWidth;
        const total = chartContainerRef.current.clientHeight || 600;
        const mainH2 = Math.max(360, Math.round(total * 0.80));
        const subH2 = Math.max(120, total - mainH2);
        chart.applyOptions({ width: w, height: mainH2 });
        subChart.applyOptions({ width: w, height: subH2 });
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        try {
          if ((chart as any).__syncFromMain) chart.timeScale().unsubscribeVisibleLogicalRangeChange((chart as any).__syncFromMain);
        } catch {}
        try {
          if ((subChart as any).__syncFromSub) subChart.timeScale().unsubscribeVisibleLogicalRangeChange((subChart as any).__syncFromSub);
        } catch {}
        if (chart) { try { chart.remove(); } catch (e) { console.warn('Error removing chart on cleanup:', e); } }
        if (subChart) { try { subChart.remove(); } catch (e) { console.warn('Error removing sub-chart on cleanup:', e); } }
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
    // Управляем видимостью серий без пересоздания чартов
    try { ibsSeriesRef.current?.applyOptions?.({ visible: showIBS } as any); } catch {}
    try { volumeSeriesRef.current?.applyOptions?.({ visible: showVolume } as any); } catch {}
    try { ema20SeriesRef.current?.applyOptions?.({ visible: showEMA20 } as any); } catch {}
    try { ema200SeriesRef.current?.applyOptions?.({ visible: showEMA200 } as any); } catch {}
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
      {/* EMA Controls */}
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
          onClick={() => setShowIBS(!showIBS)}
          className={`px-3 py-1 text-sm rounded ${
            showIBS
              ? 'bg-gray-700 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Показать IBS
        </button>
        <button
          onClick={() => setShowVolume(!showVolume)}
          className={`px-3 py-1 text-sm rounded ${
            showVolume
              ? 'bg-gray-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          Показать объём
        </button>
      </div>
      
      {/* Chart Container split: main (80%) + sub (20%) */}
      <div ref={chartContainerRef} className="min-h-0 overflow-hidden w-full h-full flex flex-col">
        <div ref={mainPaneRef} className="flex-1 min-h-[360px]" />
        <div ref={subPaneRef} className="h-[120px]" />
      </div>
    </div>
  );
}