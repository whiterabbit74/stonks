import React, { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { OHLCData } from '../types';
import { logError } from '../lib/error-logger';

interface TickerData {
  ticker: string;
  data: OHLCData[];
  ibsValues: number[];
}

interface MultiTickerChartProps {
  tickersData: TickerData[];
  height?: number;
}

export function MultiTickerChart({ tickersData, height = 600 }: MultiTickerChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefsRef = useRef<Map<string, ISeriesApi<'Candlestick'>>>(new Map());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  // Cleanup function for chart resources
  const cleanupChart = () => {
    // Unsubscribe from events
    if (unsubscribeRef.current) {
      try {
        unsubscribeRef.current();
      } catch (error) {
        logError('chart', 'Failed to unsubscribe from events', {
          error: (error as Error).message
        }, 'MultiTickerChart.cleanup');
      }
      unsubscribeRef.current = null;
    }

    // Remove resize handler
    if (resizeHandlerRef.current) {
      window.removeEventListener('resize', resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }

    // Clear series references
    seriesRefsRef.current.clear();

    // Remove chart instance
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (error) {
        logError('chart', 'Failed to remove chart instance', {
          error: (error as Error).message
        }, 'MultiTickerChart.cleanup');
      }
      chartRef.current = null;
    }
  };

  useEffect(() => {
    const onTheme = (e: CustomEvent) => {
      const dark = !!((e.detail as { effectiveDark?: boolean })?.effectiveDark ??
        document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange' as keyof WindowEventMap, onTheme as EventListener);
    return () => {
      window.removeEventListener('themechange' as keyof WindowEventMap, onTheme as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !tickersData.length) return;

    try {
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#1f2937';
      const grid = isDark ? '#1f2937' : '#eef2ff';
      const border = isDark ? '#374151' : '#e5e7eb';

      // Create chart with multiple price scales for subplots
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: height,
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
          visible: true,
        },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Colors for different tickers
      const tickerColors = [
        { up: '#10B981', down: '#EF4444' }, // Green/Red
        { up: '#3B82F6', down: '#F59E0B' }, // Blue/Orange
        { up: '#8B5CF6', down: '#EF4444' }, // Purple/Red
        { up: '#06B6D4', down: '#F97316' }, // Cyan/Orange
        { up: '#84CC16', down: '#DC2626' }, // Lime/Red
      ];

      const numberOfTickers = tickersData.length;
      const heightPerTicker = 1 / numberOfTickers;

      // Create series for each ticker as a subplot
      tickersData.forEach((tickerData, index) => {
        const colors = tickerColors[index % tickerColors.length];

        // Calculate margins for this subplot
        const topMargin = index * heightPerTicker;
        const bottomMargin = 1 - ((index + 1) * heightPerTicker);

        // Create price scale for this ticker
        const priceScaleId = `ticker-${tickerData.ticker}`;

        const series = chart.addCandlestickSeries({
          upColor: colors.up,
          downColor: colors.down,
          borderUpColor: colors.up,
          borderDownColor: colors.down,
          wickUpColor: colors.up,
          wickDownColor: colors.down,
          priceScaleId: priceScaleId,
          title: tickerData.ticker,
        });

        // Configure margins for subplot
        series.priceScale().applyOptions({
          scaleMargins: {
            top: topMargin + 0.05, // Add 5% padding
            bottom: bottomMargin + 0.05,
          },
          borderVisible: true,
        });

        // Convert and set data
        const chartData = tickerData.data.map((bar, idx) => {
          try {
            const t = Math.floor(bar.date.getTime() / 1000) as UTCTimestamp;
            const open = Number(bar.open);
            const high = Number(bar.high);
            const low = Number(bar.low);
            const close = Number(bar.close);

            if (!Number.isFinite(open) || !Number.isFinite(high) ||
                !Number.isFinite(low) || !Number.isFinite(close)) {
              logError('chart', 'Invalid candle values', {
                ticker: tickerData.ticker, idx, bar
              }, 'MultiTickerChart.setData');
            }
            return { time: t, open, high, low, close };
          } catch (e) {
            logError('chart', 'Failed to map candle', {
              ticker: tickerData.ticker, idx, bar
            }, 'MultiTickerChart.setData', (e as any)?.stack);
            return { time: 0 as UTCTimestamp, open: 0, high: 0, low: 0, close: 0 };
          }
        });

        try {
          series.setData(chartData);
          seriesRefsRef.current.set(tickerData.ticker, series);
        } catch (e) {
          logError('chart', 'series.setData failed', {
            ticker: tickerData.ticker,
            length: chartData.length,
            sample: chartData.slice(0, 3)
          }, 'MultiTickerChart', (e as any)?.stack);
        }
      });

      // Add ticker labels on the left side
      const tickerLabels = document.createElement('div');
      tickerLabels.style.position = 'absolute';
      tickerLabels.style.left = '10px';
      tickerLabels.style.top = '10px';
      tickerLabels.style.zIndex = '10';
      tickerLabels.style.pointerEvents = 'none';

      tickersData.forEach((tickerData, index) => {
        const label = document.createElement('div');
        label.textContent = tickerData.ticker;
        label.style.position = 'absolute';
        label.style.top = `${(index * heightPerTicker * 100) + 5}%`;
        label.style.left = '0px';
        label.style.fontSize = '14px';
        label.style.fontWeight = 'bold';
        label.style.color = isDark ? '#e5e7eb' : '#1f2937';
        label.style.backgroundColor = isDark ? 'rgba(31,41,55,0.8)' : 'rgba(255,255,255,0.8)';
        label.style.padding = '4px 8px';
        label.style.borderRadius = '4px';
        label.style.backdropFilter = 'blur(4px)';
        tickerLabels.appendChild(label);
      });

      chartContainerRef.current.appendChild(tickerLabels);

      // Handle resize
      const handleResize = () => {
        if (!chartContainerRef.current || !chartRef.current) return;
        try {
          const newWidth = chartContainerRef.current.clientWidth;
          chartRef.current.applyOptions({
            width: newWidth,
            height: height,
          });
        } catch (error) {
          logError('chart', 'Failed to resize multi-ticker chart', {
            error: (error as Error).message
          }, 'MultiTickerChart.resize');
        }
      };

      resizeHandlerRef.current = handleResize;
      window.addEventListener('resize', handleResize);

      return cleanupChart;
    } catch (error) {
      logError('chart', 'Error creating multi-ticker chart', {
        tickersCount: tickersData.length
      }, 'MultiTickerChart', (error as any)?.stack);
      return;
    }
  }, [tickersData, height, isDark]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanupChart;
  }, []);

  if (!tickersData.length) {
    return (
      <div
        className="flex items-center justify-center text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 rounded"
        style={{ height }}
      >
        <div className="text-center">
          <div className="text-lg font-medium mb-2">📊 Multi-Ticker Chart</div>
          <p className="text-sm">Загрузите данные для отображения графиков</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={chartContainerRef}
        className="w-full overflow-hidden rounded border border-gray-200 dark:border-gray-700"
        style={{ height }}
      />

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-2">
        {tickersData.map((ticker, index) => {
          const colors = [
            { up: '#10B981', down: '#EF4444' },
            { up: '#3B82F6', down: '#F59E0B' },
            { up: '#8B5CF6', down: '#EF4444' },
            { up: '#06B6D4', down: '#F97316' },
            { up: '#84CC16', down: '#DC2626' },
          ];
          const color = colors[index % colors.length];

          return (
            <div key={ticker.ticker} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded border"
                style={{ backgroundColor: color.up, borderColor: color.down }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {ticker.ticker}
              </span>
              <span className="text-xs text-gray-500">
                ({ticker.data.length} bars)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}