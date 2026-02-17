import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Settings2 } from 'lucide-react';
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

interface HeroLineChartProps {
  data: OHLCData[];
  trades?: Trade[];
  currentPrice?: number | null;
  onOpenProChart?: () => void;
  isTrading?: boolean;
  isStale?: boolean;
  isUpdating?: boolean;
}

export function HeroLineChart({
  data,
  trades = [],
  currentPrice = null,
  onOpenProChart,
  isTrading = false,
  isStale = false,
  isUpdating = false,
}: HeroLineChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineMarkersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const candleMarkersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const hasAppliedInitialRangeRef = useRef(false);
  const previousRangeRef = useRef<RangeKey>('3M');

  const [activeRange, setActiveRange] = useState<RangeKey>('3M');
  const [chartKind, setChartKind] = useState<ChartKind>('line');
  const [showTrades, setShowTrades] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  const candlesData = useMemo(() => {
    if (!data.length) return [] as Array<{ time: UTCTimestamp; open: number; high: number; low: number; close: number }>;

    const sorted = [...data].sort((a, b) => (toChartTimestamp(a.date) as number) - (toChartTimestamp(b.date) as number));
    const points = sorted.map((bar) => ({
      time: toChartTimestamp(bar.date),
      open: Number(bar.open),
      high: Number(bar.high),
      low: Number(bar.low),
      close: Number(bar.close),
    }));

    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && points.length > 0) {
      const last = points[points.length - 1];
      points[points.length - 1] = {
        ...last,
        close: currentPrice,
        high: Math.max(last.high, currentPrice),
        low: Math.min(last.low, currentPrice),
      };
    }

    return points;
  }, [data, currentPrice]);

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
      markers.push({
        time: toChartTimestamp(trade.entryDate),
        position: 'inBar',
        color: '#16a34a',
        shape: 'circle',
        text: '',
      });

      if (trade.exitReason !== 'end_of_data') {
        markers.push({
          time: toChartTimestamp(trade.exitDate),
          position: 'inBar',
          color: '#dc2626',
          shape: 'circle',
          text: '',
        });
      }
    });

    return markers;
  }, [showTrades, trades]);

  const candleTradeMarkers = useMemo(() => {
    if (!showTrades || !trades.length) return [] as SeriesMarker<Time>[];

    const markers: SeriesMarker<Time>[] = [];
    trades.forEach((trade) => {
      markers.push({
        time: toChartTimestamp(trade.entryDate),
        position: 'belowBar',
        color: '#16a34a',
        shape: 'arrowUp',
        text: '',
      });

      if (trade.exitReason !== 'end_of_data') {
        markers.push({
          time: toChartTimestamp(trade.exitDate),
          position: 'aboveBar',
          color: '#dc2626',
          shape: 'arrowDown',
          text: '',
        });
      }
    });

    return markers;
  }, [showTrades, trades]);

  useEffect(() => {
    const onTheme = (e: Event) => {
      const dark = !!((e as CustomEvent<{ effectiveDark?: boolean }>).detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!settingsRef.current) return;
      if (!settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isSettingsOpen]);

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
      color: lineColor,
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
    if (hasAppliedInitialRangeRef.current && !rangeChanged) {
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
    hasAppliedInitialRangeRef.current = true;
  }, [activeRange, candlesData.length]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 pl-0.5">
          <span
            className={`h-2 w-2 rounded-full ${statusDotClass} ${isUpdating ? 'animate-[pulse_2.4s_ease-in-out_infinite]' : ''}`}
            title={isStale && !isUpdating ? 'Нет актуального обновления' : (isUpdating ? 'Идёт обновление' : 'Данные актуальны')}
            aria-label={isStale && !isUpdating ? 'Нет актуального обновления' : (isUpdating ? 'Идёт обновление' : 'Данные актуальны')}
          />
          <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">Динамика цены</div>
          <div ref={settingsRef} className="relative">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="Настройки графика"
              aria-label="Настройки графика"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {isSettingsOpen && (
              <div className="absolute left-0 top-full z-20 mt-1.5 w-48 rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Настройки
                </div>
                <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-300">Тип графика</div>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setChartKind('line')}
                    className={`rounded px-2 py-1 text-[11px] ${chartKind === 'line'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                  >
                    Линия
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartKind('candles')}
                    className={`rounded px-2 py-1 text-[11px] ${chartKind === 'candles'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                  >
                    Свечи
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTrades((prev) => !prev)}
                  className="mt-2 flex w-full items-center justify-between rounded bg-gray-100 px-2 py-1.5 text-[11px] text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <span>Показывать сделки</span>
                  <span className={showTrades ? 'text-green-600 dark:text-green-300' : 'text-gray-500'}>
                    {showTrades ? 'Вкл' : 'Выкл'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenProChart}
          className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-2.5 py-1 text-[11px] text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          title="Открыть профессиональный график во вкладке Цена"
        >
          Проф. график
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

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
                  onClick={() => setActiveRange(range)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${activeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${isTrading
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-200'
            : 'bg-amber-100 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-200'
            }`}>
            {isTrading ? 'Рынок открыт' : 'Рынок закрыт'}
          </div>
        </div>
      </div>
    </div>
  );
}
