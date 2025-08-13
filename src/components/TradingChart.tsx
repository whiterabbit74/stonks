import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { formatOHLCYMD, parseOHLCDate } from '../lib/utils';
import type { OHLCData, Trade, SplitEvent } from '../types';

interface TradingChartProps {
  data: OHLCData[];
  trades: Trade[];
  chartData?: Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }>;
  splits?: SplitEvent[];
}

export function TradingChart({ data, trades, splits = [] }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const subPaneRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);
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

    // Clean up previous charts
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch (e) { console.warn('Error removing previous chart:', e); }
      chartRef.current = null;
    }
    if (subChartRef.current) {
      try { subChartRef.current.remove(); } catch (e) { console.warn('Error removing previous sub-chart:', e); }
      subChartRef.current = null;
    }

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
        height: mainH,
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
        },
      });

      chartRef.current = chart;

      // Create sub chart (20% height) for IBS/Volume
      const subChart = createChart(subEl, {
        width: subEl.clientWidth,
        height: subH,
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
        timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
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

      // Convert data to chart format
      const chartData = data.map(bar => ({
        time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

      candlestickSeries.setData(chartData);

      // Sub chart content: Volume and IBS
      let volumeSeries: ISeriesApi<'Histogram'> | null = null;
      if (showVolume) {
        volumeSeries = subChart.addHistogramSeries({
          color: isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)',
          priceFormat: { type: 'volume' as const },
          base: 0,
        });
        const volumeData = data.map(bar => ({
          time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
          value: bar.volume,
          color: bar.close >= bar.open ? (isDark ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.45)') : (isDark ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.45)')
        }));
        volumeSeries.setData(volumeData);
      }

      let ibsSeries: ISeriesApi<'Line'> | null = null;
      if (showIBS) {
        const ibsLine = subChart.addLineSeries({
          color: isDark ? '#93c5fd' : '#374151',
          lineWidth: 2,
        });
        const ibsData = data.map(bar => {
          const range = Math.max(1e-9, bar.high - bar.low);
          const ibs = (bar.close - bar.low) / range; // 0..1
          return { time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp, value: ibs };
        });
        ibsLine.setData(ibsData);
        try {
          ibsLine.createPriceLine({ price: 0.10, color: isDark ? '#64748b' : '#9ca3af', lineWidth: 1, lineStyle: 2, title: 'IBS 0.10' });
          ibsLine.createPriceLine({ price: 0.75, color: isDark ? '#64748b' : '#9ca3af', lineWidth: 1, lineStyle: 2, title: 'IBS 0.75' });
        } catch (e) { console.warn('Failed to create price lines', e); }
        ibsSeries = ibsLine;
      }

      // Sync time scales in both directions (avoid feedback loops)
      try {
        let syncing = false;
        const syncTo = (from: any, toChart: IChartApi) => {
          if (syncing || !from) return;
          syncing = true;
          try {
            // Prefer logical range for pixel-perfect alignment
            const logical = (from as any);
            if (typeof (toChart.timeScale() as any).setVisibleLogicalRange === 'function' && typeof (chart.timeScale() as any).getVisibleLogicalRange === 'function') {
              (toChart.timeScale() as any).setVisibleLogicalRange(logical);
            } else {
              toChart.timeScale().setVisibleRange(from);
            }
          } finally {
            syncing = false;
          }
        };
        // Initial align
        try {
          const lr = (chart.timeScale() as any).getVisibleLogicalRange?.();
          if (lr) (subChart.timeScale() as any).setVisibleLogicalRange(lr);
        } catch {}
        chart.timeScale().subscribeVisibleLogicalRangeChange?.((r: any) => syncTo(r, subChart));
        subChart.timeScale().subscribeVisibleLogicalRangeChange?.((r: any) => syncTo(r, chart));
        // Fallback for older versions
        chart.timeScale().subscribeVisibleTimeRangeChange?.((r: any) => !('from' in (r||{})) ? null : subChart.timeScale().setVisibleRange(r));
        subChart.timeScale().subscribeVisibleTimeRangeChange?.((r: any) => !('from' in (r||{})) ? null : chart.timeScale().setVisibleRange(r));
      } catch (e) { console.warn('Failed to sync time scales', e); }

      // Add EMA20 if enabled
      if (showEMA20) {
        const ema20Values = calculateEMA(data, 20);
        const ema20Series = chart.addLineSeries({
          color: isDark ? '#60a5fa' : '#2196F3',
          lineWidth: 2,
          title: 'EMA 20',
        });
        
        const ema20Data = data.map((bar, index) => ({
          time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
          value: ema20Values[index] || bar.close,
        })).filter(point => point.value !== undefined);
        
        ema20Series.setData(ema20Data);
      }

      // Add EMA200 if enabled
      if (showEMA200) {
        const ema200Values = calculateEMA(data, 200);
        const ema200Series = chart.addLineSeries({
          color: isDark ? '#fbbf24' : '#FF9800',
          lineWidth: 2,
          title: 'EMA 200',
        });
        
        const ema200Data = data.map((bar, index) => ({
          time: Math.floor(bar.date.getTime() / 1000) as UTCTimestamp,
          value: ema200Values[index] || bar.close,
        })).filter(point => point.value !== undefined);
        
        ema200Series.setData(ema200Data);
      }

      // Собираем маркеры: сделки и сплиты
      const allMarkers: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp'|'arrowDown'|'circle'; text: string } > = [];
      if (trades.length > 0) {
        allMarkers.push(
          ...trades.flatMap(trade => [
            {
              time: Math.floor(trade.entryDate.getTime() / 1000) as UTCTimestamp,
              position: 'belowBar' as const,
              color: '#10B981',
              shape: 'arrowUp' as const,
              text: '',
            },
            {
              time: Math.floor(trade.exitDate.getTime() / 1000) as UTCTimestamp,
              position: 'aboveBar' as const,
              color: '#EF4444',
              shape: 'arrowDown' as const,
              text: '',
            },
          ])
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

      // Crosshair sync between panes for the same time
      chart.subscribeCrosshairMove((param: { time?: unknown; seriesPrices?: Map<any, any>; seriesData?: Map<any, any> }) => {
        if (!param || !param.time || !param.seriesPrices) {
          tooltipEl.style.display = 'none';
          try {
            const tgt: any = (ibsSeries || volumeSeries);
            tgt?.clearCrosshairPosition?.();
          } catch {}
          return;
        }
        const price = param.seriesPrices.get(candlestickSeries);
        if (!price) {
          tooltipEl.style.display = 'none';
          try { (ibsSeries as any)?.clearCrosshairPosition?.(); (volumeSeries as any)?.clearCrosshairPosition?.(); } catch {}
          return;
        }
        const bar = param?.seriesData?.get?.(candlestickSeries);
        const o = bar?.open, h = bar?.high, l = bar?.low, c = bar?.close;
        const vol = volumeSeries ? (param.seriesData?.get?.(volumeSeries))?.value : undefined;
        const ibsVal = ibsSeries ? (param.seriesData?.get?.(ibsSeries))?.value : undefined;
        const pct = o ? (((c - o) / o) * 100) : 0;
        const ibsStr = (typeof ibsVal === 'number') ? ` · IBS ${(ibsVal * 100).toFixed(0)}%` : '';
        tooltipEl.innerHTML = `O ${o?.toFixed?.(2) ?? '-'} H ${h?.toFixed?.(2) ?? '-'} L ${l?.toFixed?.(2) ?? '-'} C ${c?.toFixed?.(2) ?? '-'} · ${pct ? pct.toFixed(2) + '%' : ''}${ibsStr}${vol ? ' · Vol ' + vol.toLocaleString() : ''}`;
        tooltipEl.style.display = 'block';

        // Mirror crosshair to sub chart using series API (best-effort across versions)
        try {
          const t = param.time as UTCTimestamp;
          if (ibsSeries && typeof (ibsSeries as any).setCrosshairPosition === 'function') {
            (ibsSeries as any).setCrosshairPosition(ibsVal ?? 0.5, t);
          } else if (volumeSeries && typeof (volumeSeries as any).setCrosshairPosition === 'function') {
            (volumeSeries as any).setCrosshairPosition(vol ?? 0, t);
          }
        } catch {}
      });

      // Also reflect crosshair from sub-pane to main chart
      subChart.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time) {
          try { (candlestickSeries as any)?.clearCrosshairPosition?.(); } catch {}
          return;
        }
        try {
          const t = param.time as UTCTimestamp;
          const close = (param.seriesData?.get?.(candlestickSeries))?.close ?? 0;
          if (typeof (candlestickSeries as any).setCrosshairPosition === 'function') {
            (candlestickSeries as any).setCrosshairPosition(close, t);
          }
        } catch {}
      });

      // Handle resize
      const handleResize = () => {
        if (!chartContainerRef.current) return;
        const w = chartContainerRef.current.clientWidth;
        const total = chartContainerRef.current.clientHeight || 600;
        const mainH2 = Math.max(200, Math.round(total * 0.80));
        const subH2 = Math.max(80, total - mainH2);
        chart.applyOptions({ width: w, height: mainH2 });
        subChart.applyOptions({ width: w, height: subH2 });
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
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
  }, [data, trades, showEMA20, showEMA200, showIBS, showVolume, isDark]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No data available for chart
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      {/* EMA Controls */}
      <div className="flex gap-2 mb-4 flex-wrap">
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
      <div ref={chartContainerRef} className="w-full h-[calc(100%-2rem)] flex flex-col">
        <div ref={mainPaneRef} className="flex-1" />
        <div ref={subPaneRef} className="h-[20%]" />
      </div>
    </div>
  );
}