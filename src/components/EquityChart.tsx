import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EquityPoint } from '../types';
import { logError } from '../lib/error-logger';
import { toChartTimestamp } from '../lib/date-utils';

interface EquityChartProps {
  equity: EquityPoint[];
  hideHeader?: boolean;
  comparisonEquity?: EquityPoint[];
  comparisonLabel?: string;
  primaryLabel?: string;
}

type RangeKey = 'ALL' | 'YTD' | '5Y' | '3Y' | '1Y' | '6M' | '3M' | '1M';
const RANGE_OPTIONS: RangeKey[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'YTD', 'ALL'];

const MIN_CHART_HEIGHT = 520;

function prepareSeriesData(points: EquityPoint[], source: string): Array<{ time: UTCTimestamp; value: number }> {
  const mapped = points
    .map((point, idx) => {
      try {
        const t = toChartTimestamp(point?.date as string | Date);
        const v = Number(point?.value);

        if (!Number.isFinite(v)) {
          logError('chart', 'Invalid equity point value', { idx, point, source }, 'EquityChart.prepareSeriesData');
          return null;
        }

        return { time: t, value: v };
      } catch (e) {
        const stack = e instanceof Error ? e.stack : undefined;
        logError('chart', 'Failed to map equity point', { idx, point, source }, 'EquityChart.prepareSeriesData', stack);
        return null;
      }
    })
    .filter((p): p is { time: UTCTimestamp; value: number } => p !== null);

  const sorted = mapped.slice().sort((a, b) => (a.time as number) - (b.time as number));
  const deduped: Array<{ time: UTCTimestamp; value: number }> = [];
  let lastTime: number | null = null;

  for (const point of sorted) {
    const time = point.time as number;
    if (lastTime === time && deduped.length > 0) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
      lastTime = time;
    }
  }

  return deduped;
}

export function EquityChart({ equity, hideHeader, comparisonEquity, comparisonLabel, primaryLabel }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const comparisonSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const crosshairHandlerRef = useRef<((param: MouseEventParams<Time>) => void) | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const primaryLabelRef = useRef(primaryLabel);
  const comparisonLabelRef = useRef(comparisonLabel);

  const [activeRange, setActiveRange] = useState<RangeKey>('ALL');
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    primaryLabelRef.current = primaryLabel;
    comparisonLabelRef.current = comparisonLabel;
  }, [primaryLabel, comparisonLabel]);

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
    const text = darkNow ? '#e5e7eb' : '#1f2937';
    const grid = darkNow ? '#1f2937' : '#eef2ff';
    const border = darkNow ? '#374151' : '#e5e7eb';

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      width: chartContainerRef.current.clientWidth,
      height: Math.max(chartContainerRef.current.clientHeight || 0, MIN_CHART_HEIGHT),
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
    });

    chartRef.current = chart;

    const equitySeries = chart.addSeries(AreaSeries, {
      lineColor: '#6366F1',
      topColor: 'rgba(99, 102, 241, 0.25)',
      bottomColor: 'rgba(99, 102, 241, 0.03)',
      lineWidth: 2,
      title: primaryLabelRef.current || 'Стоимость портфеля',
    });
    equitySeriesRef.current = equitySeries;

    const comparisonSeries = chart.addSeries(LineSeries, {
      color: '#F97316',
      lineWidth: 2,
      title: comparisonLabelRef.current || 'Сравнительный режим',
      priceLineVisible: false,
      visible: false,
    });
    comparisonSeriesRef.current = comparisonSeries;

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
    chartContainerRef.current.appendChild(tooltipEl);
    tooltipRef.current = tooltipEl;

    const crosshairHandler = (param: MouseEventParams<Time>) => {
      if (!tooltipRef.current || !param.time || !param.seriesData) {
        if (tooltipRef.current) tooltipRef.current.style.display = 'none';
        return;
      }

      const mainValue = (param.seriesData.get(equitySeries) as { value?: number } | undefined)?.value;
      const cmpValue = comparisonSeriesRef.current
        ? (param.seriesData.get(comparisonSeriesRef.current) as { value?: number } | undefined)?.value
        : undefined;

      if (typeof mainValue !== 'number' && typeof cmpValue !== 'number') {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const epochSec = typeof param.time === 'number' ? param.time : undefined;
      const dateStr = epochSec ? new Date(epochSec * 1000).toLocaleDateString('ru-RU') : '';

      const lines: string[] = [];
      if (typeof mainValue === 'number') {
        lines.push(`${primaryLabelRef.current || 'Основной режим'}: ${mainValue.toFixed(2)}`);
      }
      if (typeof cmpValue === 'number' && comparisonSeriesRef.current) {
        lines.push(`${comparisonLabelRef.current || 'Сравнительный режим'}: ${cmpValue.toFixed(2)}`);
      }

      tooltipRef.current.innerHTML = `${dateStr ? `<div>${dateStr}</div>` : ''}${lines.map((line) => `<div>${line}</div>`).join('')}`;
      tooltipRef.current.style.display = 'block';
    };

    crosshairHandlerRef.current = crosshairHandler;
    chart.subscribeCrosshairMove(crosshairHandler);

    return () => {
      if (crosshairHandlerRef.current && chartRef.current) {
        try {
          chartRef.current.unsubscribeCrosshairMove(crosshairHandlerRef.current);
        } catch {
          // ignore
        }
      }
      crosshairHandlerRef.current = null;

      if (tooltipRef.current && tooltipRef.current.parentElement) {
        try {
          tooltipRef.current.parentElement.removeChild(tooltipRef.current);
        } catch {
          // ignore
        }
      }
      tooltipRef.current = null;

      equitySeriesRef.current = null;
      comparisonSeriesRef.current = null;

      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
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
  }, [isDark]);

  const primarySeriesData = useMemo(() => prepareSeriesData(equity, 'primary'), [equity]);
  const comparisonSeriesData = useMemo(
    () => (Array.isArray(comparisonEquity) && comparisonEquity.length > 0 ? prepareSeriesData(comparisonEquity, 'comparison') : []),
    [comparisonEquity]
  );

  useEffect(() => {
    if (!equitySeriesRef.current || !comparisonSeriesRef.current) return;

    equitySeriesRef.current.setData(primarySeriesData);
    equitySeriesRef.current.applyOptions({
      title: primaryLabel || 'Стоимость портфеля',
    });

    const hasComparison = comparisonSeriesData.length > 0;
    comparisonSeriesRef.current.applyOptions({
      visible: hasComparison,
      title: comparisonLabel || 'Сравнительный режим',
    });
    comparisonSeriesRef.current.setData(comparisonSeriesData);
  }, [primarySeriesData, comparisonSeriesData, comparisonLabel, primaryLabel]);

  useEffect(() => {
    if (!chartRef.current || !primarySeriesData.length) return;

    const rightEdge = primarySeriesData[primarySeriesData.length - 1].time as number;
    const leftEdge = primarySeriesData[0].time as number;

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
  }, [activeRange, primarySeriesData]);

  if (!equity.length) {
    return <div className="flex items-center justify-center h-full text-gray-500">Нет данных по капиталу</div>;
  }

  const finalValue = equity[equity.length - 1]?.value ?? 0;
  const startDate = equity[0]?.date ? new Date(equity[0].date).toLocaleDateString('ru-RU') : '';
  const endDate = equity[equity.length - 1]?.date ? new Date(equity[equity.length - 1].date).toLocaleDateString('ru-RU') : '';
  const hasComparisonLegend = Array.isArray(comparisonEquity) && comparisonEquity.length > 0;
  const primaryLegendLabel = primaryLabel || 'Основной режим';
  const comparisonLegendLabel = comparisonLabel || 'Сравнительный режим';

  const annualReturn = (() => {
    if (equity.length < 2) return 0;

    const initialValue = equity[0]?.value ?? 0;
    if (initialValue <= 0) return 0;

    const startDateObj = equity[0]?.date ? new Date(equity[0].date) : null;
    const endDateObj = equity[equity.length - 1]?.date ? new Date(equity[equity.length - 1].date) : null;

    if (!startDateObj || !endDateObj) return 0;

    const daysDiff = (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24);
    const years = Math.max(daysDiff / 365.25, 1 / 365.25);

    return (Math.pow(finalValue / initialValue, 1 / years) - 1) * 100;
  })();

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col">
      {!hideHeader && (
        <div className="flex flex-wrap gap-4 mb-4 text-sm shrink-0">
          <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
            <span className="text-gray-700 dark:text-gray-200">Итоговый портфель: {formatCurrency(finalValue)}</span>
          </div>
          {startDate && endDate && (
            <div className="bg-gray-50 px-3 py-2 rounded border dark:bg-gray-800 dark:border-gray-700">
              <span className="text-gray-700 dark:text-gray-200">Период: {startDate} — {endDate}</span>
            </div>
          )}
          <div className="bg-blue-50 px-3 py-2 rounded border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/40">
            <span className="text-blue-700 dark:text-blue-300">Годовые проценты: {annualReturn.toFixed(2)}%</span>
          </div>
        </div>
      )}

      <div className="mb-3 flex gap-2 flex-wrap shrink-0">
        {RANGE_OPTIONS.map((range) => (
          <button
            key={range}
            onClick={() => setActiveRange(range)}
            className={`px-3 py-1 text-sm rounded ${activeRange === range
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            {range}
          </button>
        ))}
      </div>

      <div className="w-full flex-1 min-h-0">
        <div ref={chartContainerRef} className="w-full h-full min-h-0 overflow-hidden" />
      </div>

      {hasComparisonLegend && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            <span>{primaryLegendLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span>{comparisonLegendLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
