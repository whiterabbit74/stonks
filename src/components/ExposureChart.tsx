import { useEffect, useMemo, useRef } from 'react';
import {
  AreaSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { ExposurePoint } from '../types';
import { toChartTimestamp } from '../lib/date-utils';
import { useIsDark } from '../hooks/useIsDark';
import { getChartColors } from '../lib/chart-theme';
import { ChartLegend } from './ChartLegend';

interface ExposureChartProps {
  exposure: ExposurePoint[];
}

export function ExposureChart({ exposure }: ExposureChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const exposureSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const fullExposureSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const isDark = useIsDark();

  const seriesData = useMemo(() => exposure
    .map((point) => {
      try {
        return {
          time: toChartTimestamp(point.date),
          value: Number(point.exposurePct) || 0,
        };
      } catch {
        return null;
      }
    })
    .filter((point): point is { time: UTCTimestamp; value: number } => point !== null)
    .sort((a, b) => Number(a.time) - Number(b.time)), [exposure]);

  useEffect(() => {
    if (!containerRef.current) return;

    const { bg, text, grid, border } = getChartColors(isDark);
    const chart = createChart(containerRef.current, {
      autoSize: true,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 520,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      localization: {
        priceFormatter: (price: number) => `${price.toFixed(0)}%`,
      },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });

    chartRef.current = chart;
    exposureSeriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: '#0EA5E9',
      topColor: 'rgba(14, 165, 233, 0.28)',
      bottomColor: 'rgba(14, 165, 233, 0.04)',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    fullExposureSeriesRef.current = chart.addSeries(LineSeries, {
      color: '#9CA3AF',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });

    return () => {
      exposureSeriesRef.current = null;
      fullExposureSeriesRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [isDark]);

  useEffect(() => {
    if (!exposureSeriesRef.current || !fullExposureSeriesRef.current || !chartRef.current) return;
    exposureSeriesRef.current.setData(seriesData);
    fullExposureSeriesRef.current.setData(seriesData.map((point) => ({ time: point.time, value: 100 })));
    chartRef.current.timeScale().fitContent();
  }, [seriesData]);

  if (!seriesData.length) {
    return <div className="flex h-72 items-center justify-center text-gray-500">Нет данных по экспозиции</div>;
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col gap-3">
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden rounded border border-gray-200 dark:border-gray-700" />
      <ChartLegend
        items={[
          { label: 'Экспозиция стратегии', color: '#0EA5E9' },
          { label: '100% капитала', color: '#9CA3AF' },
        ]}
      />
    </div>
  );
}
