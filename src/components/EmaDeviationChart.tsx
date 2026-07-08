import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EmaDeviationPoint, EmaZone, Trade } from '../types';
import { toChartTimestamp } from '../lib/date-utils';
import { useIsDark } from '../hooks/useIsDark';
import { getChartColors } from '../lib/chart-theme';
import { ChartLegend } from './ChartLegend';

interface EmaDeviationChartProps {
  data: EmaDeviationPoint[];
  trades: Trade[];
  buyZones: EmaZone[];
  sellZones: EmaZone[];
  ticker?: string;
}

export function EmaDeviationChart({ data, trades, buyZones, sellZones, ticker }: EmaDeviationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [chartVersion, setChartVersion] = useState(0);
  const isDark = useIsDark();

  const filteredData = useMemo(() => {
    const selectedTicker = ticker?.toUpperCase();
    return data
      .filter((point) => !selectedTicker || point.ticker.toUpperCase() === selectedTicker)
      .map((point) => ({
        time: toChartTimestamp(point.date),
        value: point.deviationPct,
      }))
      .sort((a, b) => Number(a.time) - Number(b.time));
  }, [data, ticker]);

  useEffect(() => {
    if (!containerRef.current) return;

    const { bg, text, grid, border } = getChartColors(isDark);
    const chart = createChart(containerRef.current, {
      autoSize: true,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 560,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      localization: {
        priceFormatter: (price: number) => `${price.toFixed(1)}%`,
      },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });

    chartRef.current = chart;
    const series = chart.addSeries(LineSeries, {
      color: '#2563EB',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    // Signal that a fresh chart instance exists so the data/marker effects
    // re-run and repopulate it (e.g. after a dark-mode rebuild).
    setChartVersion((version) => version + 1);

    return () => {
      markersRef.current = null;
      priceLinesRef.current = [];
      seriesRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [isDark]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    for (const line of priceLinesRef.current) {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {
        // ignore stale price line
      }
    }
    priceLinesRef.current = [];
    seriesRef.current.setData(filteredData);
    priceLinesRef.current.push(seriesRef.current.createPriceLine({ price: 0, color: '#9CA3AF', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
    for (const zone of buyZones.filter((item) => item.enabled)) {
      priceLinesRef.current.push(seriesRef.current.createPriceLine({ price: zone.levelPct, color: '#10B981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
    }
    for (const zone of sellZones.filter((item) => item.enabled)) {
      priceLinesRef.current.push(seriesRef.current.createPriceLine({ price: zone.levelPct, color: '#EF4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true }));
    }
    chartRef.current.timeScale().fitContent();
  }, [filteredData, buyZones, sellZones, chartVersion]);

  useEffect(() => {
    if (!markersRef.current) return;
    const selectedTicker = ticker?.toUpperCase();
    const times = new Set(filteredData.map((point) => Number(point.time)));
    const markers: SeriesMarker<Time>[] = [];

    for (const trade of trades) {
      const tradeTicker = trade.context?.ticker?.toUpperCase();
      if (selectedTicker && tradeTicker && tradeTicker !== selectedTicker) continue;

      try {
        const time = toChartTimestamp(trade.entryDate);
        if (times.has(Number(time))) {
          markers.push({ time, position: 'belowBar', color: '#10B981', shape: 'arrowUp', text: '' });
        }
      } catch {
        // ignore invalid marker
      }

      if (trade.exitReason !== 'end_of_data') {
        try {
          const time = toChartTimestamp(trade.exitDate);
          if (times.has(Number(time))) {
            markers.push({ time, position: 'aboveBar', color: '#EF4444', shape: 'arrowDown', text: '' });
          }
        } catch {
          // ignore invalid marker
        }
      }
    }

    markers.sort((a, b) => Number(a.time as UTCTimestamp) - Number(b.time as UTCTimestamp));
    markersRef.current.setMarkers(markers);
  }, [filteredData, ticker, trades, chartVersion]);

  // The chart container stays mounted even when there is no data so the
  // creation effect always has a ref to attach to; the empty state is shown as
  // an overlay. This keeps chart creation working on an empty→non-empty transition.
  return (
    <div className="flex min-h-[560px] flex-col gap-3">
      <div className="relative min-h-[520px] flex-1">
        <div ref={containerRef} className="absolute inset-0 overflow-hidden rounded border border-gray-200 dark:border-gray-700" />
        {!filteredData.length && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">Недостаточно данных для EMA</div>
        )}
      </div>
      <ChartLegend
        items={[
          { label: 'Отклонение цены от EMA', color: '#2563EB' },
          { label: 'Зоны покупки', color: '#10B981' },
          { label: 'Зоны продажи', color: '#EF4444' },
          { label: 'Нулевая линия', color: '#9CA3AF' },
        ]}
      />
    </div>
  );
}
