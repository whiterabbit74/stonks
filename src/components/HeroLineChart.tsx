import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsDark } from '../hooks/useIsDark';
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
import { toChartTimestamp } from '../lib/date-utils';
import { LS } from '../constants';
import { aggregateOhlcToWeekly, mapDateToAggregatedBarTime, type CandleTimeframe } from '../lib/candles';
import { ChartLegend } from './ChartLegend';

type RangeKey = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'MAX';
type ChartKind = 'line' | 'candles';

const RANGE_OPTIONS: RangeKey[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'];
const RANGE_DAYS: Record<Exclude<RangeKey, 'MAX'>, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '3Y': 365 * 3,
  '5Y': 365 * 5,
};

function loadTimeframePreference(): CandleTimeframe {
  if (typeof window === 'undefined') return 'daily';
  try {
    const raw = window.localStorage.getItem(LS.CHART_PREFS);
    const parsed = raw ? JSON.parse(raw) as { timeframe?: CandleTimeframe } : null;
    return parsed?.timeframe === 'weekly' ? 'weekly' : 'daily';
  } catch {
    return 'daily';
  }
}

function saveTimeframePreference(timeframe: CandleTimeframe) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LS.CHART_PREFS);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    window.localStorage.setItem(LS.CHART_PREFS, JSON.stringify({ ...parsed, timeframe }));
  } catch {
    // ignore storage errors
  }
}

interface HeroLineChartProps {
  data: OHLCData[];
  trades?: Trade[];
  currentPrice?: number | null;
  todayQuote?: { open: number | null; high: number | null; low: number | null } | null;
  chartKind?: ChartKind;
  showTrades?: boolean;
  isTrading?: boolean;
  isStale?: boolean;
  isUpdating?: boolean;
  initialRange?: RangeKey;
  onRangeChange?: (range: RangeKey) => void;
}

export function HeroLineChart({
  data,
  trades = [],
  currentPrice = null,
  todayQuote = null,
  chartKind = 'line',
  showTrades = true,
  isTrading = false,
  isStale = false,
  isUpdating = false,
  initialRange,
  onRangeChange,
}: HeroLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineMarkersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candleMarkersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const hasAppliedInitialRangeRef = useRef(false);
  const previousRangeRef = useRef<RangeKey>('3M');
  const previousTimeframeRef = useRef<CandleTimeframe>('daily');

  const [activeRange, setActiveRange] = useState<RangeKey>(initialRange ?? '3M');
  const [activeTimeframe, setActiveTimeframe] = useState<CandleTimeframe>(loadTimeframePreference);

  const handleSetRange = (range: RangeKey) => {
    setActiveRange(range);
    onRangeChange?.(range);
  };
  const isDark = useIsDark();

  useEffect(() => {
    saveTimeframePreference(activeTimeframe);
  }, [activeTimeframe]);

  const timeframeData = useMemo(() => {
    if (!data.length) return [] as OHLCData[];

    const sorted = [...data].sort((a, b) => (toChartTimestamp(a.date) as number) - (toChartTimestamp(b.date) as number));
    const dailyData = sorted.map((bar) => ({
      date: bar.date,
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
      volume: Number(bar.volume ?? 0),
    }));

    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && dailyData.length > 0) {
      const nyseToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const last = dailyData[dailyData.length - 1];

      if (isTrading && (toChartTimestamp(last.date) as number) < (toChartTimestamp(nyseToday) as number)) {
        // Market is open and last bar is from a previous day — add today's bar
        const open = typeof todayQuote?.open === 'number' ? todayQuote.open : currentPrice;
        const high = typeof todayQuote?.high === 'number' ? Math.max(todayQuote.high, currentPrice) : currentPrice;
        const low = typeof todayQuote?.low === 'number' ? Math.min(todayQuote.low, currentPrice) : currentPrice;
        dailyData.push({ date: nyseToday, open, high, low, close: currentPrice, volume: 0 });
      } else {
        // Update close (and high/low) of the last existing bar
        dailyData[dailyData.length - 1] = {
          ...last,
          close: currentPrice,
          high: Math.max(last.high, currentPrice),
          low: Math.min(last.low, currentPrice),
        };
      }
    }

    return activeTimeframe === 'weekly' ? aggregateOhlcToWeekly(dailyData) : dailyData;
  }, [activeTimeframe, data, currentPrice, isTrading, todayQuote?.high, todayQuote?.low, todayQuote?.open]);

  const candlesData = useMemo(
    () => timeframeData.map((bar) => ({
      time: toChartTimestamp(bar.date),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    })),
    [timeframeData]
  );

  const lineData = useMemo(
    () => candlesData.map((candle) => ({ time: candle.time, value: candle.close })),
    [candlesData]
  );

  const trendPositive = useMemo(() => {
    if (lineData.length < 2) return true;
    return lineData[lineData.length - 1].value >= lineData[0].value;
  }, [lineData]);

  const lineColor = trendPositive ? '#16a34a' : '#ea580c';
  const statusDotClass = isStale && !isUpdating
    ? 'bg-red-500'
    : (trendPositive ? 'bg-green-500' : 'bg-orange-500');

  const lineTradeMarkers = useMemo(() => {
    if (!showTrades || !trades.length) return [] as SeriesMarker<Time>[];

    const markers: SeriesMarker<Time>[] = [];
    trades.forEach((trade) => {
      const entryTime = activeTimeframe === 'weekly'
        ? toChartTimestamp(mapDateToAggregatedBarTime(trade.entryDate, activeTimeframe, timeframeData))
        : toChartTimestamp(trade.entryDate);
      const exitTime = activeTimeframe === 'weekly'
        ? toChartTimestamp(mapDateToAggregatedBarTime(trade.exitDate, activeTimeframe, timeframeData))
        : toChartTimestamp(trade.exitDate);
      if (!entryTime) return;

      markers.push({
        time: entryTime,
        position: 'inBar',
        color: '#16a34a',
        shape: 'circle',
        text: '',
      });

      if (trade.exitReason !== 'end_of_data' && exitTime) {
        markers.push({
          time: exitTime,
          position: 'inBar',
          color: '#dc2626',
          shape: 'circle',
          text: '',
        });
      }
    });

    return markers;
  }, [activeTimeframe, showTrades, timeframeData, trades]);

  const candleTradeMarkers = useMemo(() => {
    if (!showTrades || !trades.length) return [] as SeriesMarker<Time>[];

    const markers: SeriesMarker<Time>[] = [];
    trades.forEach((trade) => {
      const entryTime = activeTimeframe === 'weekly'
        ? toChartTimestamp(mapDateToAggregatedBarTime(trade.entryDate, activeTimeframe, timeframeData))
        : toChartTimestamp(trade.entryDate);
      const exitTime = activeTimeframe === 'weekly'
        ? toChartTimestamp(mapDateToAggregatedBarTime(trade.exitDate, activeTimeframe, timeframeData))
        : toChartTimestamp(trade.exitDate);
      if (!entryTime) return;

      markers.push({
        time: entryTime,
        position: 'belowBar',
        color: '#16a34a',
        shape: 'arrowUp',
        text: '',
      });

      if (trade.exitReason !== 'end_of_data' && exitTime) {
        markers.push({
          time: exitTime,
          position: 'aboveBar',
          color: '#dc2626',
          shape: 'arrowDown',
          text: '',
        });
      }
    });

    return markers;
  }, [activeTimeframe, showTrades, timeframeData, trades]);

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
      height: chartContainerRef.current.clientHeight || 375,
      layout: { background: { color: bg }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 2 },
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, pinch: true, mouseWheel: false },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#16a34a',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      visible: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
      borderVisible: true,
      visible: false,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;
    candleSeriesRef.current = candleSeries;
    lineMarkersApiRef.current = createSeriesMarkers(lineSeries, []);
    candleMarkersApiRef.current = createSeriesMarkers(candleSeries, []);

    return () => {
      lineMarkersApiRef.current = null;
      candleMarkersApiRef.current = null;
      lineSeriesRef.current = null;
      candleSeriesRef.current = null;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !lineSeriesRef.current || !candleSeriesRef.current) return;

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

    lineSeriesRef.current.applyOptions({ color: lineColor });
  }, [isDark, lineColor]);

  useEffect(() => {
    if (!lineSeriesRef.current || !candleSeriesRef.current) return;
    lineSeriesRef.current.setData(lineData);
    candleSeriesRef.current.setData(candlesData);
  }, [lineData, candlesData]);

  useEffect(() => {
    if (!lineSeriesRef.current || !candleSeriesRef.current) return;
    lineSeriesRef.current.applyOptions({ visible: chartKind === 'line' });
    candleSeriesRef.current.applyOptions({ visible: chartKind === 'candles' });
  }, [chartKind]);

  useEffect(() => {
    lineMarkersApiRef.current?.setMarkers(lineTradeMarkers);
    candleMarkersApiRef.current?.setMarkers(candleTradeMarkers);
  }, [lineTradeMarkers, candleTradeMarkers]);

  useEffect(() => {
    if (!candlesData.length) {
      hasAppliedInitialRangeRef.current = false;
      return;
    }

    if (!chartRef.current) return;

    const rangeChanged = previousRangeRef.current !== activeRange;
    const timeframeChanged = previousTimeframeRef.current !== activeTimeframe;
    if (hasAppliedInitialRangeRef.current && !rangeChanged && !timeframeChanged) {
      return;
    }

    const rightEdge = candlesData[candlesData.length - 1].time as number;
    const leftEdge = candlesData[0].time as number;

    if (activeRange === 'MAX') {
      chartRef.current.timeScale().fitContent();
    } else {
      const days = RANGE_DAYS[activeRange];
      const from = Math.max(leftEdge, rightEdge - days * 24 * 60 * 60);
      chartRef.current.timeScale().setVisibleRange({
        from: from as UTCTimestamp,
        to: rightEdge as UTCTimestamp,
      });
    }

    previousRangeRef.current = activeRange;
    previousTimeframeRef.current = activeTimeframe;
    hasAppliedInitialRangeRef.current = true;
  }, [activeRange, activeTimeframe, candlesData]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900">
      <div className="relative h-[375px] w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <div ref={chartContainerRef} className="h-full w-full" />
        {!lineData.length && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/85 text-sm text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
            Нет данных для графика
          </div>
        )}
      </div>

      <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="min-w-0 overflow-x-auto">
            <div className="flex min-w-max items-center gap-1.5">
              {RANGE_OPTIONS.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => handleSetRange(range)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${activeRange === range
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
              {([
                { value: 'daily', label: 'День' },
                { value: 'weekly', label: 'Неделя' },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setActiveTimeframe(option.value)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                    activeTimeframe === option.value
                      ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-900 dark:text-indigo-300'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${isTrading
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-200'
              : 'bg-amber-100 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200'
              }`}>
              <span
                className={`h-2 w-2 rounded-full ${statusDotClass} ${isUpdating ? 'animate-[pulse_2.4s_ease-in-out_infinite]' : ''}`}
                title={isStale && !isUpdating ? 'Нет актуального обновления' : (isUpdating ? 'Идёт обновление' : 'Данные актуальны')}
                aria-label={isStale && !isUpdating ? 'Нет актуального обновления' : (isUpdating ? 'Идёт обновление' : 'Данные актуальны')}
              />
              {isTrading ? 'Рынок открыт' : 'Рынок закрыт'}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <ChartLegend
            items={[
              { label: chartKind === 'line' ? 'Цена закрытия' : 'Свечи', color: lineColor },
              ...(showTrades ? [
                { label: 'Покупка', color: '#16a34a' },
                { label: 'Продажа', color: '#dc2626' },
              ] : []),
            ]}
          />
        </div>
      </div>
    </div>
  );
}
