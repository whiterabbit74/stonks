import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
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
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  useEffect(() => {
    const onTheme = (e: any) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const hasToday = !!(today && today.low != null && today.high != null && today.open != null && today.current != null);
    if (!history.length && !hasToday) return;

    // cleanup previous
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* ignore */ }
      chartRef.current = null;
    }

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
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      borderVisible: false,
    });
    // дать вертикальные отступы, чтобы свечи не прилипали к краям
    // Ещё уменьшаем отступы: свечи занимают ~70–80% высоты (в 2 раза меньше воздуха)
    try { chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } }); } catch { /* ignore */ }

    // Build last 8 candles: 7 последних из истории + сегодняшняя синтетическая (если есть)
    const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
    const historyCount = hasToday ? 7 : 8;
    const lastHistory = sorted.slice(-historyCount);
    const candles: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = lastHistory.map(b => ({
      time: Math.floor(b.date.getTime() / 1000) as UTCTimestamp,
      open: b.open, high: b.high, low: b.low, close: b.close,
    }));
    if (hasToday) {
      candles.push({
        time: Math.floor(Date.now() / 1000) as UTCTimestamp,
        open: today!.open as number,
        high: today!.high as number,
        low: today!.low as number,
        close: today!.current as number,
      });
    }

    if (candles.length) {
      series.setData(candles);
      // Хотим, чтобы свечи занимали ~70% ширины контейнера
      const width = containerRef.current!.clientWidth || 300;
      const targetRatio = 0.7;
      const spacing = Math.max(4, Math.min(24, Math.floor((width * targetRatio) / candles.length)));
      const rightOffset = Math.max(1, Math.round(candles.length * 0.05)); // немного воздуха справа (~5% от кол-ва баров)
      try { chart.timeScale().applyOptions({ rightOffset, barSpacing: spacing }); } catch { /* ignore */ }
    }

    // Mark entries and exits within visible window
    const minTime = candles.length ? (candles[0].time as number) : 0;
    const maxTime = candles.length ? (candles[candles.length - 1].time as number) : 0;
    const markers: Array<{ time: UTCTimestamp; position: 'belowBar' | 'aboveBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string }> = [];
    trades.forEach(t => {
      const entryTime = Math.floor(t.entryDate.getTime() / 1000) as UTCTimestamp;
      const exitTime = Math.floor(t.exitDate.getTime() / 1000) as UTCTimestamp;
      if ((entryTime as number) >= minTime && (entryTime as number) <= maxTime) {
        markers.push({ time: entryTime, position: 'belowBar', color: 'rgba(5,150,105,0.65)', shape: 'arrowUp', text: '' });
      }
      if (t.exitReason !== 'end_of_data' && (exitTime as number) >= minTime && (exitTime as number) <= maxTime) {
        markers.push({ time: exitTime, position: 'aboveBar', color: 'rgba(239,68,68,0.75)', shape: 'arrowDown', text: '' });
      }
    });
    // Do not add an explicit today marker circle per request
    if (markers.length) series.setMarkers(markers);

    // Add target close price line if position is open and we have today range
    if (isOpenPosition && hasToday && (today!.high as number) > (today!.low as number)) {
      const target = (today!.low as number) + highIBS * ((today!.high as number) - (today!.low as number));
      series.createPriceLine({ price: target, color: '#8B5CF6', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'Цель IBS' });
    }

    // Entry price reference line (subtle gray)
    if (isOpenPosition && typeof entryPrice === 'number') {
      series.createPriceLine({ price: entryPrice, color: '#9CA3AF', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Вход' });
    }

    // Не подгоняем контент под ширину — оставляем воздух справа

    const onResize = () => {
      if (!containerRef.current || !chart) return;
      const w = containerRef.current.clientWidth;
      chart.applyOptions({ width: w, height: containerRef.current.clientHeight || 140 });
      // Пересчитаем barSpacing для цели 70% ширины
      try {
        const points = candles.length || 1;
        const spacing = Math.max(4, Math.min(24, Math.floor((w * 0.7) / points)));
        chart.timeScale().applyOptions({ barSpacing: spacing });
      } catch { /* ignore */ }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      try { chart.remove(); } catch { /* ignore */ }
    };
  }, [history, today, trades, highIBS, isOpenPosition, entryPrice, isDark]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[120px] overflow-hidden" />
  );
}


