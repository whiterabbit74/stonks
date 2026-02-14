import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { OHLCData, Trade } from '../types';
import { logError } from '../lib/error-logger';
import { toChartTimestamp } from '../lib/date-utils';

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
}

interface MultiTickerChartProps {
  tickersData: TickerData[];
  trades?: Trade[];
  height?: number;
}

type ViewMode = 'candles' | 'normalized';

const PALETTE = [
  { up: '#10B981', down: '#EF4444', line: '#10B981' },
  { up: '#3B82F6', down: '#F59E0B', line: '#3B82F6' },
  { up: '#8B5CF6', down: '#EF4444', line: '#8B5CF6' },
  { up: '#06B6D4', down: '#F97316', line: '#06B6D4' },
  { up: '#84CC16', down: '#DC2626', line: '#84CC16' },
  { up: '#F97316', down: '#2563EB', line: '#F97316' },
  { up: '#14B8A6', down: '#BE185D', line: '#14B8A6' },
  { up: '#EAB308', down: '#7C3AED', line: '#EAB308' },
];

export function MultiTickerChart({ tickersData, trades = [], height = 600 }: MultiTickerChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRefsRef = useRef<Map<string, ISeriesApi<'Candlestick'>>>(new Map());
  const lineSeriesRefsRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const markersApiRefsRef = useRef<Map<string, ISeriesMarkersPluginApi<Time>>>(new Map());

  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );
  const [viewMode, setViewMode] = useState<ViewMode>('candles');
  const [maxVisibleTickers, setMaxVisibleTickers] = useState<number>(6);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);

  const preparedTickersData = useMemo(() => {
    return tickersData.map((tickerData) => {
      const chartData = tickerData.data
        .map((bar, idx) => {
          try {
            const t = toChartTimestamp(bar.date);
            const open = Number(bar.open);
            const high = Number(bar.high);
            const low = Number(bar.low);
            const close = Number(bar.close);

            if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
              logError('chart', 'Invalid candle values', { ticker: tickerData.ticker, idx, bar }, 'MultiTickerChart.prepare');
              return null;
            }

            return { time: t, open, high, low, close };
          } catch (e) {
            logError('chart', 'Failed to map candle', { ticker: tickerData.ticker, idx, bar }, 'MultiTickerChart.prepare', (e as Error)?.stack);
            return null;
          }
        })
        .filter((bar): bar is { time: UTCTimestamp; open: number; high: number; low: number; close: number } => bar !== null)
        .sort((a, b) => (a.time as number) - (b.time as number));

      const baseClose = chartData[0]?.close ?? 0;
      const normalizedData = baseClose > 0
        ? chartData.map((bar) => ({ time: bar.time, value: Number(((bar.close / baseClose) * 100).toFixed(4)) }))
        : [];

      return {
        ...tickerData,
        chartData,
        normalizedData,
      };
    });
  }, [tickersData]);

  useEffect(() => {
    const available = preparedTickersData.map((t) => t.ticker);
    if (!available.length) {
      setSelectedTickers([]);
      return;
    }

    setSelectedTickers((prev) => {
      const filtered = prev.filter((ticker) => available.includes(ticker));
      if (filtered.length > 0) return filtered;
      return available.slice(0, Math.min(available.length, maxVisibleTickers));
    });
  }, [preparedTickersData, maxVisibleTickers]);

  const selectedPreparedTickers = useMemo(() => {
    const active = preparedTickersData.filter((t) => selectedTickers.includes(t.ticker));
    const fallback = active.length ? active : preparedTickersData;
    return fallback.slice(0, maxVisibleTickers);
  }, [preparedTickersData, selectedTickers, maxVisibleTickers]);

  const hiddenSelectedCount = Math.max(
    0,
    preparedTickersData.filter((t) => selectedTickers.includes(t.ticker)).length - selectedPreparedTickers.length
  );

  const visibleTickerKey = useMemo(() => selectedPreparedTickers.map((t) => t.ticker).join('|'), [selectedPreparedTickers]);

  const markersByTicker = useMemo(() => {
    const map = new Map<string, SeriesMarker<Time>[]>();
    if (!trades.length) return map;

    const tradesByTicker = new Map<string, Trade[]>();
    trades.forEach((trade) => {
      const ticker = (trade.context?.ticker || '').toUpperCase();
      if (!ticker) return;
      if (!tradesByTicker.has(ticker)) tradesByTicker.set(ticker, []);
      tradesByTicker.get(ticker)?.push(trade);
    });

    tradesByTicker.forEach((tickerTrades, ticker) => {
      const markers = tickerTrades.flatMap((trade) => {
        const points: SeriesMarker<Time>[] = [];

        try {
          points.push({
            time: toChartTimestamp(trade.entryDate),
            position: 'belowBar',
            color: '#2196F3',
            shape: 'arrowUp',
            text: '',
          });
        } catch {
          // ignore invalid entry date
        }

        if (trade.exitReason !== 'end_of_data') {
          try {
            points.push({
              time: toChartTimestamp(trade.exitDate),
              position: 'aboveBar',
              color: '#2196F3',
              shape: 'arrowDown',
              text: '',
            });
          } catch {
            // ignore invalid exit date
          }
        }

        return points;
      });

      if (markers.length > 0) {
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        map.set(ticker, markers);
      }
    });

    return map;
  }, [trades]);

  useEffect(() => {
    const onTheme = (e: Event) => {
      const dark = !!((e as CustomEvent<{ effectiveDark?: boolean }>).detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };

    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    const containerEl = chartContainerRef.current;
    if (!containerEl) return;

    const cleanupChart = () => {
      markersApiRefsRef.current.clear();
      candleSeriesRefsRef.current.clear();
      lineSeriesRefsRef.current.clear();

      if (chartRef.current) {
        try {
          chartRef.current.remove();
        } catch {
          // ignore
        }
        chartRef.current = null;
      }
    };

    cleanupChart();

    if (!selectedPreparedTickers.length) return cleanupChart;

    const bg = isDark ? '#0b1220' : '#ffffff';
    const text = isDark ? '#e5e7eb' : '#1f2937';
    const grid = isDark ? '#1f2937' : '#eef2ff';
    const border = isDark ? '#374151' : '#e5e7eb';

    const chart = createChart(containerEl, {
      autoSize: true,
      width: containerEl.clientWidth,
      height,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: border, visible: true },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false },
    });

    chartRef.current = chart;

    if (viewMode === 'candles') {
      const count = selectedPreparedTickers.length;
      const heightPerTicker = 1 / count;

      selectedPreparedTickers.forEach((tickerData, index) => {
        const colors = PALETTE[index % PALETTE.length];
        const topMargin = index * heightPerTicker;
        const bottomMargin = 1 - (index + 1) * heightPerTicker;
        const padding = Math.min(0.04, heightPerTicker * 0.25);

        const series = chart.addSeries(CandlestickSeries, {
          upColor: colors.up,
          downColor: colors.down,
          borderUpColor: colors.up,
          borderDownColor: colors.down,
          wickUpColor: colors.up,
          wickDownColor: colors.down,
          priceScaleId: `ticker-${tickerData.ticker}`,
          title: tickerData.ticker,
        });

        series.priceScale().applyOptions({
          scaleMargins: {
            top: Math.min(0.95, topMargin + padding),
            bottom: Math.min(0.95, bottomMargin + padding),
          },
          borderVisible: true,
        });

        candleSeriesRefsRef.current.set(tickerData.ticker, series);
        markersApiRefsRef.current.set(tickerData.ticker, createSeriesMarkers(series, []));
      });
    } else {
      selectedPreparedTickers.forEach((tickerData, index) => {
        const color = PALETTE[index % PALETTE.length].line;
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          title: `${tickerData.ticker} (base 100)`,
        });
        lineSeriesRefsRef.current.set(tickerData.ticker, series);
      });
    }

    return cleanupChart;
  }, [viewMode, isDark, height, visibleTickerKey, selectedPreparedTickers]);

  useEffect(() => {
    if (!chartRef.current || !selectedPreparedTickers.length) return;

    if (viewMode === 'candles') {
      selectedPreparedTickers.forEach((tickerData) => {
        const series = candleSeriesRefsRef.current.get(tickerData.ticker);
        if (!series) return;

        try {
          series.setData(tickerData.chartData);
          const markersApi = markersApiRefsRef.current.get(tickerData.ticker);
          markersApi?.setMarkers(markersByTicker.get(tickerData.ticker.toUpperCase()) || []);
        } catch (e) {
          logError('chart', 'Failed to set multi-candle series', {
            ticker: tickerData.ticker,
            size: tickerData.chartData.length,
          }, 'MultiTickerChart.updateCandles', (e as Error)?.stack);
        }
      });
    } else {
      selectedPreparedTickers.forEach((tickerData) => {
        const series = lineSeriesRefsRef.current.get(tickerData.ticker);
        if (!series) return;

        try {
          series.setData(tickerData.normalizedData);
        } catch (e) {
          logError('chart', 'Failed to set normalized series', {
            ticker: tickerData.ticker,
            size: tickerData.normalizedData.length,
          }, 'MultiTickerChart.updateNormalized', (e as Error)?.stack);
        }
      });
    }

    chartRef.current.timeScale().fitContent();
  }, [selectedPreparedTickers, viewMode, markersByTicker]);

  const toggleTicker = (ticker: string) => {
    setSelectedTickers((prev) => {
      if (prev.includes(ticker)) {
        const next = prev.filter((t) => t !== ticker);
        return next.length > 0 ? next : prev;
      }
      return [...prev, ticker];
    });
  };

  if (!tickersData.length) {
    return (
      <div
        className="flex items-center justify-center text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded"
        style={{ height }}
      >
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Multi-Ticker Chart</div>
          <p className="text-sm">Загрузите данные для отображения графиков</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setViewMode('candles')}
          className={`px-3 py-1 text-sm rounded ${viewMode === 'candles'
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          Candles
        </button>
        <button
          onClick={() => setViewMode('normalized')}
          className={`px-3 py-1 text-sm rounded ${viewMode === 'normalized'
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          Normalized (Base 100)
        </button>
        <label className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 ml-2">
          Макс. тикеров:
          <select
            value={maxVisibleTickers}
            onChange={(e) => setMaxVisibleTickers(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:bg-gray-900 dark:border-gray-700"
          >
            {[2, 4, 6, 8, 10].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <div
        ref={chartContainerRef}
        className="w-full overflow-hidden rounded border border-gray-200 dark:border-gray-700"
        style={{ height }}
      />

      {hiddenSelectedCount > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-300">
          Отображаются первые {maxVisibleTickers} выбранных тикеров. Скрыто: {hiddenSelectedCount}.
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {preparedTickersData.map((ticker, index) => {
          const selected = selectedTickers.includes(ticker.ticker);
          const color = PALETTE[index % PALETTE.length];
          return (
            <button
              key={ticker.ticker}
              onClick={() => toggleTicker(ticker.ticker)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${selected
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-200'
                : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                }`}
              title={selected ? 'Убрать тикер с графика' : 'Добавить тикер на график'}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: viewMode === 'normalized' ? color.line : color.up }}
              />
              <span>{ticker.ticker}</span>
              <span className="text-xs opacity-70">({ticker.data.length})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
