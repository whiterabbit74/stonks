import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import type { EquityPoint } from '../types';

interface EquityChartProps {
  equity: EquityPoint[];
}

export function EquityChart({ equity }: EquityChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false);

  useEffect(() => {
    const onTheme = (e: any) => {
      const dark = !!(e?.detail?.effectiveDark ?? document.documentElement.classList.contains('dark'));
      setIsDark(dark);
    };
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !equity.length) return;

    try {
      const bg = isDark ? '#0b1220' : '#ffffff';
      const text = isDark ? '#e5e7eb' : '#1f2937';
      const grid = isDark ? '#1f2937' : '#eef2ff';
      const border = isDark ? '#374151' : '#e5e7eb';

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
        },
        timeScale: {
          borderColor: border,
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
        title: 'Стоимость портфеля',
      });

      // Серая линия all-time high (ATH)
      const athSeries: ISeriesApi<'Line'> = chart.addLineSeries({
        color: '#9CA3AF',
        lineWidth: 1,
        lineStyle: 2,
        title: 'Максимум за всё время',
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
      tooltipEl.style.background = isDark ? 'rgba(31,41,55,0.75)' : 'rgba(17,24,39,0.7)';
      tooltipEl.style.color = 'white';
      tooltipEl.style.padding = '6px 8px';
      tooltipEl.style.borderRadius = '6px';
      tooltipEl.style.fontSize = '12px';
      tooltipEl.style.backdropFilter = 'blur(4px)';
      tooltipEl.style.display = 'none';
      chartContainerRef.current.appendChild(tooltipEl);

      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) { tooltipEl.style.display = 'none'; return; }
        const v = (param.seriesData?.get?.(equitySeries) as { value?: number } | undefined)?.value;
        if (typeof v !== 'number') { tooltipEl.style.display = 'none'; return; }
        tooltipEl.innerHTML = `Капитал ${v.toFixed(2)}`;
        tooltipEl.style.display = 'block';
      });

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
        try {
          if (tooltipEl && tooltipEl.parentElement) tooltipEl.parentElement.removeChild(tooltipEl);
        } catch { /* ignore */ }
      };
    } catch (error) {
      console.error('Error creating equity chart:', error);
      return;
    }
  }, [equity, isDark]);

  if (!equity.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Нет данных по капиталу
      </div>
    );
  }

  return <div ref={chartContainerRef} className="w-full h-[360px] min-h-0 overflow-hidden" />;
}