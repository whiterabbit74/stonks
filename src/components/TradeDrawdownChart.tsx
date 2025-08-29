import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import type { UTCTimestamp } from 'lightweight-charts';
import type { Trade } from '../types';

interface TradeDrawdownChartProps {
  trades: Trade[];
  initialCapital: number;
}

export function TradeDrawdownChart({ trades, initialCapital }: TradeDrawdownChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  useEffect(() => {
    const onTheme = (e: CustomEvent<{ mode: string; effectiveDark: boolean }>) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !trades.length) return;

    try {
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#333';
      const grid = isDark ? '#1f2937' : '#f0f0f0';
      const border = isDark ? '#374151' : '#cccccc';

      // Create new chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: Math.max(chartContainerRef.current.clientHeight || 0, 360),
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
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Calculate running capital and drawdown for each trade
      let runningCapital = initialCapital;
      let peakCapital = initialCapital;
      const tradeDrawdownData: Array<{
        time: number;
        value: number;
        tradeIndex: number;
        pnl: number;
        drawdown: number;
      }> = [];

      trades.forEach((trade, index) => {
        // Update capital after trade
        runningCapital += trade.pnl;
        
        // Update peak
        if (runningCapital > peakCapital) {
          peakCapital = runningCapital;
        }
        
        // Calculate drawdown from peak
        const drawdown = peakCapital > 0 ? ((peakCapital - runningCapital) / peakCapital) * 100 : 0;
        
        tradeDrawdownData.push({
          time: Math.floor(trade.exitDate.getTime() / 1000),
          value: -drawdown, // Negative for visual representation
          tradeIndex: index + 1,
          pnl: trade.pnl,
          drawdown: drawdown
        });
      });

      // Add drawdown area series
      const drawdownSeries = chart.addAreaSeries({
        topColor: isDark ? 'rgba(248, 113, 113, 0.35)' : 'rgba(244, 67, 54, 0.4)',
        bottomColor: isDark ? 'rgba(248, 113, 113, 0.08)' : 'rgba(244, 67, 54, 0.1)',
        lineColor: isDark ? '#f87171' : '#F44336',
        lineWidth: 2,
        title: 'Просадка по сделкам, %',
      });

      drawdownSeries.setData(tradeDrawdownData.map(d => ({
        time: d.time as unknown as UTCTimestamp,
        value: d.value
      })));

      // Add zero line for reference
      const zeroLineSeries = chart.addLineSeries({
        color: isDark ? '#9ca3af' : '#666666',
        lineWidth: 1,
        lineStyle: 2, // Dashed line
        title: 'Нулевая линия',
      });

      const zeroLineData = tradeDrawdownData.map(d => ({
        time: d.time as unknown as UTCTimestamp,
        value: 0,
      }));

      zeroLineSeries.setData(zeroLineData);

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: Math.max(chartContainerRef.current.clientHeight || 0, 360),
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chart) {
          try {
            chart.remove();
          } catch (e) {
            console.warn('Error removing chart on cleanup:', e);
          }
        }
      };
    } catch (error) {
      console.error('Error creating trade drawdown chart:', error);
      return;
    }
  }, [trades, initialCapital, isDark]);

  if (!trades.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Нет данных по сделкам для анализа просадки
      </div>
    );
  }

  // Calculate trade-based drawdown statistics
  let runningCapital = initialCapital;
  let peakCapital = initialCapital;
  let maxDrawdown = 0;
  let drawdownTrades = 0;

  trades.forEach(trade => {
    runningCapital += trade.pnl;
    if (runningCapital > peakCapital) {
      peakCapital = runningCapital;
    }
    const drawdown = peakCapital > 0 ? ((peakCapital - runningCapital) / peakCapital) * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
    if (drawdown > 0) {
      drawdownTrades++;
    }
  });

  const drawdownFrequency = (drawdownTrades / trades.length) * 100;

  return (
    <div className="w-full h-full">
      {/* Trade Drawdown Statistics */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm">
        <div className="bg-red-50 px-3 py-2 rounded dark:bg-red-950/30 dark:text-red-300">
          <span className="text-red-600 font-medium dark:text-red-300">Макс. просадка по сделке: {maxDrawdown.toFixed(2)}%</span>
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded dark:bg-gray-800 dark:text-gray-200">
          <span className="text-gray-600 dark:text-gray-200">Сделок с просадкой: {drawdownTrades}/{trades.length}</span>
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded dark:bg-gray-800 dark:text-gray-200">
          <span className="text-gray-600 dark:text-gray-200">Частота просадок: {drawdownFrequency.toFixed(1)}%</span>
        </div>
      </div>
      
      {/* Chart Container */}
      <div ref={chartContainerRef} className="w-full h-[600px] min-h-0 overflow-hidden" />
    </div>
  );
}