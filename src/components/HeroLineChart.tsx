import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import {
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { OHLCData } from '../types';
import { toChartTimestamp } from '../lib/date-utils';

type RangeKey = '1M' | '3M' | '6M' | '1Y' | '3Y' | 'MAX';

const RANGE_OPTIONS: RangeKey[] = ['1M', '3M', '6M', '1Y', '3Y', 'MAX'];
const RANGE_DAYS: Record<Exclude<RangeKey, 'MAX'>, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 365 * 3,
};

interface HeroLineChartProps {
  data: OHLCData[];
  currentPrice?: number | null;
  onOpenProChart?: () => void;
}

export function HeroLineChart({ data, currentPrice = null, onOpenProChart }: HeroLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [activeRange, setActiveRange] = useState<RangeKey>('3M');
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  const lineData = useMemo(() => {
    if (!data.length) return [] as Array<{ time: UTCTimestamp; value: number }>;

    const points = [...data]
      .sort((a, b) => (toChartTimestamp(a.date) as number) - (toChartTimestamp(b.date) as number))
      .map((bar) => ({
        time: toChartTimestamp(bar.date),
        value: Number(bar.close),
      }));

    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && points.length > 0) {
      const last = points[points.length - 1];
      points[points.length - 1] = { ...last, value: currentPrice };
    }

    return points;
  }, [data, currentPrice]);

  const trendPositive = useMemo(() => {
    if (lineData.length < 2) return true;
    return lineData[lineData.length - 1].value >= lineData[0].value;
  }, [lineData]);

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

    const darkNow = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false;
    const bg = darkNow ? '#0b1220' : '#ffffff';
    const text = darkNow ? '#e5e7eb' : '#334155';
    const grid = darkNow ? '#1f2937' : '#e5e7eb';
    const border = darkNow ? '#334155' : '#d1d5db';

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 300,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 2 },
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, pinch: true, mouseWheel: false },
    });

    const series = chart.addSeries(LineSeries, {
      color: trendPositive ? '#16a34a' : '#ea580c',
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      seriesRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current) return;

    const bg = isDark ? '#0b1220' : '#ffffff';
    const text = isDark ? '#e5e7eb' : '#334155';
    const grid = isDark ? '#1f2937' : '#e5e7eb';
    const border = isDark ? '#334155' : '#d1d5db';

    chartRef.current.applyOptions({
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    });
  }, [isDark]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    seriesRef.current.applyOptions({
      color: trendPositive ? '#16a34a' : '#ea580c',
    });
    seriesRef.current.setData(lineData);

    if (!lineData.length) return;

    const rightEdge = lineData[lineData.length - 1].time as number;
    const leftEdge = lineData[0].time as number;

    if (activeRange === 'MAX') {
      chartRef.current.timeScale().fitContent();
      return;
    }

    const days = RANGE_DAYS[activeRange];
    const from = Math.max(leftEdge, rightEdge - days * 24 * 60 * 60);
    chartRef.current.timeScale().setVisibleRange({
      from: from as UTCTimestamp,
      to: rightEdge as UTCTimestamp,
    });
  }, [lineData, activeRange, trendPositive]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Динамика цены</div>
        <button
          type="button"
          onClick={onOpenProChart}
          className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          title="Открыть профессиональный график во вкладке Цена"
        >
          Проф. график
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative h-[300px] w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <div ref={chartContainerRef} className="h-full w-full" />
        {!lineData.length && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/85 text-sm text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
            Нет данных для графика
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
        {RANGE_OPTIONS.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => setActiveRange(range)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${activeRange === range
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}
