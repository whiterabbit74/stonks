import { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import type { Trade } from '../types';

interface TradeDrawdownChartProps {
  trades: Trade[];
  initialCapital: number;
}

export function TradeDrawdownChart({ trades, initialCapital }: TradeDrawdownChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !trades.length) return;

    // Clean up previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch (e) {
        console.warn('Error removing previous chart:', e);
      }
      chartRef.current = null;
    }

    try {
      // Create new chart
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: Math.max(chartContainerRef.current.clientHeight, 300),
        layout: {
          background: { color: '#ffffff' },
          textColor: '#333',
        },
        grid: {
          vertLines: { color: '#f0f0f0' },
          horzLines: { color: '#f0f0f0' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#cccccc',
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderColor: '#cccccc',
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
        topColor: 'rgba(244, 67, 54, 0.4)',
        bottomColor: 'rgba(244, 67, 54, 0.1)',
        lineColor: '#F44336',
        lineWidth: 2,
        title: 'Trade Drawdown %',
      });

      drawdownSeries.setData(tradeDrawdownData.map(d => ({
        time: d.time as unknown as UTCTimestamp,
        value: d.value
      })));

      // Add zero line for reference
      const zeroLineSeries = chart.addLineSeries({
        color: '#666666',
        lineWidth: 1,
        lineStyle: 2, // Dashed line
        title: 'Zero Line',
      });

      const zeroLineData = tradeDrawdownData.map(d => ({
        time: d.time as unknown as UTCTimestamp,
        value: 0,
      }));

      zeroLineSeries.setData(zeroLineData);

      // Убираем маркеры с надписями для чистого вида графика

      // Handle resize
      const handleResize = () => {
        if (chartContainerRef.current && chart) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: Math.max(chartContainerRef.current.clientHeight, 300),
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
  }, [trades, initialCapital]);

  if (!trades.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No trade data available for drawdown analysis
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
      <div className="flex gap-4 mb-4 text-sm">
        <div className="bg-red-50 px-3 py-2 rounded">
          <span className="text-red-600 font-medium">Max Trade DD: {maxDrawdown.toFixed(2)}%</span>
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded">
          <span className="text-gray-600">DD Trades: {drawdownTrades}/{trades.length}</span>
        </div>
        <div className="bg-gray-50 px-3 py-2 rounded">
          <span className="text-gray-600">DD Frequency: {drawdownFrequency.toFixed(1)}%</span>
        </div>
        <div className="bg-blue-50 px-3 py-2 rounded">
          <span className="text-blue-600">Final Capital: ${runningCapital.toFixed(2)}</span>
        </div>
      </div>
      
      {/* Chart Container */}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}