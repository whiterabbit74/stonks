import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { EquityPoint } from '../types';

interface EquityChartProps {
  equity: EquityPoint[];
}

type CrosshairParam = { time?: UTCTimestamp | number | string; seriesPrices?: Map<unknown, unknown> } | undefined;

export function EquityChart({ equity }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !equity.length) return;

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
          textColor: '#1f2937',
        },
        grid: {
          vertLines: { color: '#eef2ff' },
          horzLines: { color: '#eef2ff' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#e5e7eb',
        },
        timeScale: {
          borderColor: '#e5e7eb',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      // Verify chart methods exist
      if (!chart || typeof chart.addLineSeries !== 'function') {
        console.error('Chart object is invalid or missing addLineSeries method');
        return;
      }

      // Area-серия с градиентом
      const equitySeries: ISeriesApi<'Area'> = chart.addAreaSeries({
        lineColor: '#6366F1',
        topColor: 'rgba(99, 102, 241, 0.25)',
        bottomColor: 'rgba(99, 102, 241, 0.03)',
        lineWidth: 2,
        title: 'Portfolio Value',
      });

      // Серая линия all-time high (ATH)
      const athSeries: ISeriesApi<'Line'> = chart.addLineSeries({
        color: '#9CA3AF',
        lineWidth: 1,
        lineStyle: 2,
        title: 'All-Time High',
      });

    // Convert equity data to chart format
    const equityData = equity.map(point => ({
      time: Math.floor(point.date.getTime() / 1000) as UTCTimestamp,
      value: point.value,
    }));

    equitySeries.setData(equityData);

    // Рассчитываем ATH во времени
    const athData: { time: UTCTimestamp; value: number }[] = [];
    let runningMax = -Infinity;
    for (const p of equity) {
      runningMax = Math.max(runningMax, p.value);
      athData.push({ time: Math.floor(p.date.getTime() / 1000) as UTCTimestamp, value: runningMax });
    }
    athSeries.setData(athData);

    // Убрали линию последнего значения по запросу

    // Простой тултип
    const tooltipEl = document.createElement('div');
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.left = '12px';
    tooltipEl.style.top = '8px';
    tooltipEl.style.zIndex = '10';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.background = 'rgba(17,24,39,0.7)';
    tooltipEl.style.color = 'white';
    tooltipEl.style.padding = '6px 8px';
    tooltipEl.style.borderRadius = '6px';
    tooltipEl.style.fontSize = '12px';
    tooltipEl.style.backdropFilter = 'blur(4px)';
    tooltipEl.style.display = 'none';
    chartContainerRef.current.appendChild(tooltipEl);

                   chart.subscribeCrosshairMove((param: CrosshairParam) => {
      if (!param || !param.time) { tooltipEl.style.display = 'none'; return; }
      const v = (param.seriesPrices?.get?.(equitySeries) as number) ?? undefined;
      if (v == null) { tooltipEl.style.display = 'none'; return; }
      tooltipEl.innerHTML = `Equity ${v.toFixed(2)}`;
      tooltipEl.style.display = 'block';
    });

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
        try {
          if (tooltipEl && tooltipEl.parentElement) tooltipEl.parentElement.removeChild(tooltipEl);
        } catch { /* ignore */ }
      };
    } catch (error) {
      console.error('Error creating equity chart:', error);
      return;
    }
  }, [equity]);

  if (!equity.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No equity data available
      </div>
    );
  }

  return <div ref={chartContainerRef} className="w-full h-full" />;
}